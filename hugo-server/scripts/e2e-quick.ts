// Uçtan uca: hızlı oyna (3 yapay zekâyla oyun hemen başlar), ad sorulmadan şehir adlı masa (tekrar etmez), sahip adı
// değiştirir, masa sahibi kendiliğinden hazır (Hazırım'a basmadan başlatır).
import assert from 'assert';
import { spawn } from 'child_process';
import path from 'path';
import { io, Socket } from 'socket.io-client';
import { CITY_NAMES } from '../src/utils/cityNames';

const PORT = 3088;
type Ack = Record<string, any>;
const emit = (s: Socket, ev: string, data: any = {}) => new Promise<Ack>(res => s.emit(ev, data, (r: Ack) => res(r ?? {})));
const connect = () => io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true, reconnection: false });

const startServer = () => new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
    const srv = spawn(process.execPath, ['-r', 'ts-node/register', 'src/index.ts'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PORT: String(PORT), PERSIST: 'false', DATABASE_URL: '', TEST_MODE: 'false', AUTO_START_GAME: 'false', BOT_STEP_MS: '0', DRAW_GAP_MS: '0' },
    });
    srv.stdout.on('data', d => { if (String(d).includes('Sunucu çalışıyor')) resolve(srv); });
    srv.on('exit', code => reject(new Error(`sunucu kapandı: ${code}`)));
});

(async () => {
    const srv = await startServer();
    const fail = setTimeout(() => { console.error('Zaman aşımı'); srv.kill(); process.exit(1); }, 30_000);
    try {
        // Hızlı oyna
        const q = connect();
        const qId = (await emit(q, 'player:register', { name: 'Hızlı' })).player.id;
        const tiles = new Promise<Ack>(res => q.once('game:tiles', res));
        const quick = await emit(q, 'room:quickPlay', { playerId: qId });
        assert.ok(quick.success, quick.error);
        assert.strictEqual(quick.room.status, 'playing', 'oyun hemen başlar');
        assert.strictEqual(quick.room.players.filter((p: Ack) => p.isBot).length, 3, '3 yapay zekâ');
        assert.ok(CITY_NAMES.includes(quick.room.name), 'şehir adı');
        const t = (await tiles).tiles.length; assert.ok(t >= 14, `taşlar gelir: ${t}`);
        assert.strictEqual((await emit(q, 'room:quickPlay', { playerId: qId })).success, false, 'masadayken yeni hızlı oyun açılmaz');
        assert.strictEqual((await emit(q, 'room:quickPlay', { playerId: 'baskasi' })).success, false, 'başkası adına açılmaz');

        // Ad sorulmadan masa: şehir adları tekrar etmez
        const names = new Set<string>([quick.room.name]);
        const owners: { s: Socket; id: string; room: Ack }[] = [];
        for (let i = 0; i < 5; i++) {
            const s = connect();
            const id = (await emit(s, 'player:register', { name: `S${i}` })).player.id;
            const room = (await emit(s, 'room:create', { playerId: id })).room;
            assert.ok(room && !names.has(room.name), `tekrar etmeyen şehir: ${room?.name}`);
            names.add(room.name);
            owners.push({ s, id, room });
        }

        // Sahip adı değiştirir, başkası değiştiremez
        const [o, guest] = owners;
        const g = connect();
        const gId = (await emit(g, 'player:register', { name: 'Misafir' })).player.id;
        await emit(g, 'room:join', { roomId: o.room.id, playerId: gId });
        assert.strictEqual((await emit(g, 'room:rename', { roomId: o.room.id, playerId: gId, name: 'X' })).success, false, 'sahip olmayan değiştiremez');
        assert.strictEqual((await emit(o.s, 'room:rename', { roomId: o.room.id, playerId: o.id, name: '  ' })).success, false, 'boş ad olmaz');
        const renamed = await emit(o.s, 'room:rename', { roomId: o.room.id, playerId: o.id, name: 'Cuma akşamı' });
        assert.strictEqual(renamed.room.name, 'Cuma akşamı');

        // Sahip hazır olmadan başlatır (diğerleri hazır olunca)
        await emit(o.s, 'room:addBot', { roomId: o.room.id, playerId: o.id });
        await emit(o.s, 'room:addBot', { roomId: o.room.id, playerId: o.id });
        assert.strictEqual((await emit(o.s, 'game:start', { roomId: o.room.id, playerId: o.id })).success, false, 'misafir hazır değilken başlamaz');
        await emit(g, 'player:ready', { roomId: o.room.id, playerId: gId, ready: true });
        assert.strictEqual((await emit(g, 'game:start', { roomId: o.room.id, playerId: o.id })).success, false, 'başkası sahip adına başlatamaz');
        const started = await emit(o.s, 'game:start', { roomId: o.room.id, playerId: o.id });
        assert.ok(started.success, `sahip Hazırım'a basmadan başlatır: ${started.error}`);

        [q, g, ...owners.map(x => x.s)].forEach(s => s.close());
        void guest;
        console.log('e2e-quick: hızlı oyna, şehir adlı masa (tekrarsız), sahip adı değiştirir, sahip kendiliğinden hazır ✓');
    } finally {
        clearTimeout(fail);
        srv.kill();
    }
})().catch(e => { console.error(e); process.exit(1); });
