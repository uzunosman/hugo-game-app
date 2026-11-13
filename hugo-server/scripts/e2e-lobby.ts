// Uçtan uca: lobi kuralları. Kayıtsız istemci masaları görür; avatar seçilir; yapay zekâ masa sahibi olmaz;
// sahiplik yalnızca insana devredilir; insansız, boşta kalan ve bitip yeniden başlamayan masalar arşivlenir.
import assert from 'assert';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { io, Socket } from 'socket.io-client';

const PORT = 3096;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-lobby-'));
type Ack = Record<string, any>;
const emit = (s: Socket, ev: string, data: any) => new Promise<Ack>(res => s.emit(ev, data, (r: Ack) => res(r ?? {})));
const waitFor = (s: Socket, ev: string, pred: (r: Ack) => boolean = () => true) =>
    new Promise<Ack>(res => { const h = (r: Ack) => { if (pred(r)) { s.off(ev, h); res(r); } }; s.on(ev, h); });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const startServer = () => new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
    const srv = spawn(process.execPath, ['-r', 'ts-node/register', 'src/index.ts'], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env, PORT: String(PORT), TEST_MODE: 'false', AUTO_START_GAME: 'false', PERSIST: 'true',
            STATE_FILE: path.join(dir, 'state.json'), IDLE_ROOM_MS: '1500', ROOM_SWEEP_MS: '200',
        },
    });
    srv.stdout.on('data', d => { if (String(d).includes('Sunucu çalışıyor')) resolve(srv); });
    srv.on('exit', code => reject(new Error(`sunucu kapandı: ${code}`)));
});

(async () => {
    const srv = await startServer();
    const fail = setTimeout(() => { console.error('Zaman aşımı'); srv.kill(); process.exit(1); }, 60_000);
    try {
        const url = `http://localhost:${PORT}`;
        const a = io(url, { transports: ['websocket'], forceNew: true });
        const b = io(url, { transports: ['websocket'], forceNew: true });
        const guest = io(url, { transports: ['websocket'], forceNew: true });

        const regA = await emit(a, 'player:register', { name: 'Ayşe', avatar: 'kedi-7' });
        assert.strictEqual(regA.player.avatar, 'kedi-7', 'seçilen avatar saklanır');
        const aId = regA.player.id;
        const bId = (await emit(b, 'player:register', { name: 'Barış' })).player.id;
        const room = (await emit(a, 'room:create', { name: 'lobi', playerId: aId })).room;
        assert.ok((await emit(b, 'room:join', { roomId: room.id, playerId: bId })).success);
        const botId = (await emit(a, 'room:addBot', { roomId: room.id, playerId: aId })).room.players.find((p: Ack) => p.isBot).id;

        // Kayıtsız istemci masaları ve oturanları görür
        const seen = (await emit(guest, 'rooms:list', {})).rooms.find((r: Ack) => r.id === room.id);
        assert.deepStrictEqual(seen.players.map((p: Ack) => p.name), ['Ayşe', 'Barış', 'Robo Rıza']);
        assert.strictEqual(seen.players[0].avatar, 'kedi-7');

        // Sahiplik: yapay zekâya ve başkası adına verilemez, insana verilir
        assert.strictEqual((await emit(a, 'room:transferOwner', { roomId: room.id, playerId: aId, targetId: botId })).success, false, 'yapay zekâya devredilmez');
        assert.strictEqual((await emit(b, 'room:transferOwner', { roomId: room.id, playerId: aId, targetId: bId })).success, false, 'başkası adına devredilmez');
        const t = await emit(a, 'room:transferOwner', { roomId: room.id, playerId: aId, targetId: bId });
        assert.ok(t.success && t.room.owner.id === bId, 'insana devredilir');

        // Sahip ayrılınca sahiplik yapay zekâya değil kalan insana geçer
        assert.ok((await emit(b, 'room:leave', { roomId: room.id, playerId: bId })).success);
        assert.strictEqual((await emit(a, 'room:details', { roomId: room.id })).room.owner.id, aId, 'sahiplik insana geçer');

        // Son insan ayrılınca yalnızca yapay zekâ kalan masa arşivlenir
        await emit(a, 'room:leave', { roomId: room.id, playerId: aId });
        assert.strictEqual((await emit(guest, 'room:details', { roomId: room.id })).success, false, 'insansız masa kapanır');

        // Boşta kalan masa arşivlenir, masadaki oyuncu lobiye döner (kimliği korunur)
        const idle = (await emit(a, 'room:create', { name: 'boşta', playerId: aId })).room;
        const closed = await waitFor(a, 'room:closed', r => r.roomId === idle.id);
        assert.strictEqual(closed.reason, 'Masa uzun süre oynanmadı');
        assert.strictEqual((await emit(guest, 'rooms:list', {})).rooms.length, 0, 'arşivlenen masa listede görünmez');
        assert.ok((await emit(a, 'room:create', { name: 'yeni', playerId: aId })).success, 'oyuncu yeni masa açabilir');

        await sleep(100);
        const archived = fs.readFileSync(path.join(dir, 'archive.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
        assert.deepStrictEqual(archived.map(e => e.name), ['lobi', 'boşta'], 'arşiv kaydı yazılır');
        console.log('e2e-lobby: misafir masaları görüyor, avatar, sahiplik yalnızca insana, insansız ve boşta masalar arşivleniyor ✓');
        a.close(); b.close(); guest.close();
    } finally {
        clearTimeout(fail);
        srv.removeAllListeners('exit');
        srv.kill();
        fs.rmSync(dir, { recursive: true, force: true });
    }
})().catch(e => { console.error(e); process.exit(1); });
