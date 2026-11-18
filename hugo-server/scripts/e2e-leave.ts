// Uçtan uca: oyun sürerken masadan kalkma. Koltuk aynı kimlikle yapay zekâya geçer, oyun sürer,
// kalkan oyuncu yeni kimlikle lobiye döner; masada insan kalmayınca masa kapanır.
import assert from 'assert';
import { spawn } from 'child_process';
import path from 'path';
import { io, Socket } from 'socket.io-client';

const PORT = 3097;
type Ack = Record<string, any>;
const emit = (s: Socket, ev: string, data: any) => new Promise<Ack>(res => s.emit(ev, data, (r: Ack) => res(r ?? {})));
const waitFor = (s: Socket, ev: string, pred: (r: Ack) => boolean = () => true) =>
    new Promise<Ack>(res => { const h = (r: Ack) => { if (pred(r)) { s.off(ev, h); res(r); } }; s.on(ev, h); });

const startServer = () => new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
    const srv = spawn(process.execPath, ['-r', 'ts-node/register', 'src/index.ts'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PORT: String(PORT), TEST_MODE: 'false', AUTO_START_GAME: 'false', TURN_TIMEOUT_MS: '300', BOT_THINK_MS: '5', BOT_STEP_MS: '0', ROUND_BREAK_MS: '200', PERSIST: 'false', DRAW_GAP_MS: '200' }, // çekme-atma beklemesi kısaltılmış (yol test edilir)
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
        const aId = (await emit(a, 'player:register', { name: 'Ayşe' })).player.id;
        const bId = (await emit(b, 'player:register', { name: 'Barış' })).player.id;
        const room = (await emit(a, 'room:create', { name: 'kalk', playerId: aId })).room;
        assert.ok((await emit(b, 'room:join', { roomId: room.id, playerId: bId })).success);
        for (let i = 0; i < 2; i++) assert.ok((await emit(a, 'room:addBot', { roomId: room.id, playerId: aId })).success);
        await emit(a, 'player:ready', { roomId: room.id, playerId: aId, ready: true });
        await emit(b, 'player:ready', { roomId: room.id, playerId: bId, ready: true });

        // Oyun başlamadan masadan kalkılmaz (bekleme odasında normal "odadan ayrıl" kullanılır)
        assert.strictEqual((await emit(a, 'game:leaveTable', { roomId: room.id, playerId: aId })).success, false);
        assert.ok((await emit(a, 'game:start', { roomId: room.id, playerId: aId })).success);
        // Başkası adına kalkılamaz
        assert.strictEqual((await emit(b, 'game:leaveTable', { roomId: room.id, playerId: aId })).success, false, 'başkası adına kalkılamaz');

        const replaced = waitFor(b, 'player:joined', r => r.player?.id === aId);
        const left = await emit(a, 'game:leaveTable', { roomId: room.id, playerId: aId });
        assert.ok(left.success, 'masadan kalkılmalı');
        const newA = left.player.id;
        assert.notStrictEqual(newA, aId, 'lobiye yeni kimlikle döner');
        assert.strictEqual(left.player.name, 'Ayşe');
        assert.strictEqual(left.player.roomId, null);

        const r = await replaced;
        const seat = r.room.players.find((p: Ack) => p.id === aId);
        assert.ok(seat.isBot && /^Robo /.test(seat.name), 'koltuğa yapay zekâ geçer');
        assert.strictEqual(r.room.owner.id, bId, 'masa sahipliği kalan insana geçer');
        assert.strictEqual(r.room.status, 'playing');

        // Eski kimlikle artık hamle yapılamaz; kalkan oyuncu masanın olaylarını almaz, lobide yeni masa açabilir
        assert.strictEqual((await emit(a, 'game:drawTile', { playerId: aId, fromDiscard: false })).success, false);
        let aGotGameEvent = false;
        a.on('game:tileDraw', () => { aGotGameEvent = true; });
        // Oyun sürer: yapay zekâya geçen koltuk sırası gelince oynar
        await waitFor(b, 'game:tileDraw', d => d.playerId === aId);
        assert.ok(!aGotGameEvent, 'kalkan oyuncu masanın olaylarını almaz');
        const lobbyRoom = await emit(a, 'room:create', { name: 'yeni', playerId: newA });
        assert.ok(lobbyRoom.success, 'lobide yeni masa açılabilir');
        await emit(a, 'room:leave', { roomId: lobbyRoom.room.id, playerId: newA });

        // Son insan da kalkınca masa kapanır
        assert.ok((await emit(b, 'game:leaveTable', { roomId: room.id, playerId: bId })).success);
        assert.strictEqual((await emit(b, 'room:details', { roomId: room.id })).success, false, 'insansız masa kapanır');
        const list = await emit(b, 'rooms:list', {});
        assert.strictEqual(list.rooms.length, 0);
        console.log('e2e-leave: masadan kalkan koltuğa yapay zekâ geçiyor, oyun sürüyor, oyuncu lobiye dönüyor, insansız masa kapanıyor ✓');
        a.close(); b.close();
    } finally {
        clearTimeout(fail);
        srv.removeAllListeners('exit');
        srv.kill();
    }
})().catch(e => { console.error(e); process.exit(1); });
