// Uçtan uca: admin oyuncuyu masadan kaldırır, masaya yapay zekâ ekler.
// Oyun sürerken: kaldırılan lobiye yeni kimlikle döner; koltuk boş bekler, yeni gelen oturup kaldığı yerden oynar,
// kimse oturmazsa yapay zekâ devralır. Oyun başlamadan: oyuncu çıkar, koltuk dolmazsa yapay zekâ eklenir.
import assert from 'assert';
import { spawn } from 'child_process';
import path from 'path';
import { io, Socket } from 'socket.io-client';

const PORT = 3090;
const URL = `http://localhost:${PORT}`;
const TOKEN = 'kick-e2e-token';
type Ack = Record<string, any>;
const emit = (s: Socket, ev: string, data: any = {}) => new Promise<Ack>(res => s.emit(ev, data, (r: Ack) => res(r ?? {})));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const connect = (adminToken?: string) => io(URL, { transports: ['websocket'], forceNew: true, reconnection: false, auth: adminToken ? { adminToken } : {} });

const startServer = () => new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
    const srv = spawn(process.execPath, ['-r', 'ts-node/register', 'src/index.ts'], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env, PORT: String(PORT), PERSIST: 'false', DATABASE_URL: '', ADMIN_TOKEN: TOKEN, TEST_MODE: 'false', AUTO_START_GAME: 'false',
            TURN_TIMEOUT_MS: '60000', BOT_THINK_MS: '5', BOT_STEP_MS: '0', DRAW_GAP_MS: '0', VACANT_SEAT_MS: '700',
        },
    });
    srv.stdout.on('data', d => { if (String(d).includes('Sunucu çalışıyor')) resolve(srv); });
    srv.on('exit', code => reject(new Error(`sunucu kapandı: ${code}`)));
});

(async () => {
    const srv = await startServer();
    const fail = setTimeout(() => { console.error('Zaman aşımı'); srv.kill(); process.exit(1); }, 30_000);
    try {
        const admin = connect(TOKEN);
        const tableOf = async (name: string) => (await emit(admin, 'admin:overview')).masalar.find((t: Ack) => t.ad === name);
        const reg = async (s: Socket, name: string) => (await emit(s, 'player:register', { name })).player.id as string;

        // Oyun sürerken
        const a = connect(), b = connect(), c = connect();
        const aId = await reg(a, 'Ayşe'), bId = await reg(b, 'Barış'), cId = await reg(c, 'Cem');
        const room = (await emit(a, 'room:create', { name: 'kaldir', playerId: aId })).room;
        await emit(b, 'room:join', { roomId: room.id, playerId: bId });
        for (let i = 0; i < 2; i++) await emit(a, 'room:addBot', { roomId: room.id, playerId: aId });
        await emit(a, 'player:ready', { roomId: room.id, playerId: aId, ready: true });
        await emit(b, 'player:ready', { roomId: room.id, playerId: bId, ready: true });
        assert.ok((await emit(a, 'game:start', { roomId: room.id, playerId: aId })).success, 'oyun başlamalı');
        const no = (await tableOf('kaldir')).no;

        // Admin masanın sohbetini görür ve Yönetici olarak yazar
        await emit(a, 'chat:send', { playerId: aId, text: 'merhaba' });
        const heard = new Promise<Ack>(res => a.on('chat:message', m => { if (m.admin) res(m); }));
        assert.ok((await emit(admin, 'admin:chatSend', { no, text: 'Hoş geldiniz' })).success);
        const m = await heard;
        assert.deepStrictEqual([m.name, m.text, m.admin], ['Yönetici', 'Hoş geldiniz', true], 'oyuncu yönetici mesajını alır');
        assert.deepStrictEqual((await emit(admin, 'admin:tableChat', { no })).messages.map((x: Ack) => x.text), ['merhaba', 'Hoş geldiniz']);
        assert.strictEqual((await emit(a, 'admin:chatSend', { no, text: 'sahte' })).success, false, 'oyuncu yönetici adına yazamaz');

        const kicked = new Promise<Ack>(res => b.once('room:kicked', res));
        assert.ok((await emit(admin, 'admin:kickPlayer', { no, playerId: bId })).success, 'oyuncu kaldırılır');
        const k = await kicked;
        assert.ok(k.player?.id && k.player.id !== bId && k.token, 'kaldırılan lobiye yeni kimlikle döner');
        assert.strictEqual((await emit(b, 'player:reconnect', { playerId: bId, token: 'x' })).success, false, 'eski koltuğa dönemez');
        let seat = (await tableOf('kaldir')).oyuncular.find((p: Ack) => p.id === bId);
        assert.strictEqual(seat.bos, true, 'koltuk boş bekler');
        assert.strictEqual((await emit(admin, 'admin:kickPlayer', { no, playerId: bId })).success, false, 'boş koltuk kaldırılamaz');

        // Yeni oyuncu boş koltuğa oturur: koltuğun kimliğini ve taşlarını alır
        const sat = await emit(c, 'room:join', { roomId: room.id, playerId: cId });
        assert.ok(sat.success && sat.player.id === bId && sat.token, `boş koltuğa oturulur: ${sat.error}`);
        assert.ok((await emit(c, 'game:requestTiles', { playerId: bId })).tiles.length >= 14, 'koltuğun taşları gelir');
        seat = (await tableOf('kaldir')).oyuncular.find((p: Ack) => p.id === bId);
        assert.deepStrictEqual([seat.ad, seat.bos, seat.bot], ['Cem', false, false]);

        // Tekrar kaldır, kimse oturmaz: yapay zekâ devralır
        await emit(admin, 'admin:kickPlayer', { no, playerId: bId });
        await sleep(1000);
        seat = (await tableOf('kaldir')).oyuncular.find((p: Ack) => p.id === bId);
        assert.deepStrictEqual([seat.bos, seat.bot], [false, true], 'süre dolunca yapay zekâ oturur');

        // Oyun başlamadan: kaldırılan çıkar, koltuk dolmazsa yapay zekâ eklenir; admin yapay zekâ ekler
        const d = connect(), e = connect();
        const dId = await reg(d, 'Deniz'), eId = await reg(e, 'Ece');
        const room2 = (await emit(d, 'room:create', { name: 'bekleyen', playerId: dId })).room;
        await emit(e, 'room:join', { roomId: room2.id, playerId: eId });
        const no2 = (await tableOf('bekleyen')).no;
        const kicked2 = new Promise<Ack>(res => e.once('room:kicked', res));
        await emit(admin, 'admin:kickPlayer', { no: no2, playerId: eId });
        await kicked2;
        assert.strictEqual((await tableOf('bekleyen')).oyuncular.length, 1, 'bekleyen masadan çıkar');
        await sleep(1000);
        let t2 = await tableOf('bekleyen');
        assert.deepStrictEqual(t2.oyuncular.map((p: Ack) => p.bot), [false, true], 'koltuk dolmadı: yapay zekâ eklendi');
        assert.ok((await emit(admin, 'admin:addBot', { no: no2 })).success);
        t2 = await tableOf('bekleyen');
        assert.strictEqual(t2.oyuncular.length, 3, 'admin yapay zekâ ekler');

        [admin, a, b, c, d, e].forEach(s => s.close());
        console.log('e2e-kick: admin sohbeti görür ve yazar; admin oyuncu kaldırır (oyunda koltuk bekler, yeni gelen oturur ya da yapay zekâ devralır; bekleyen masada yapay zekâ eklenir), admin yapay zekâ ekler ✓');
    } finally {
        clearTimeout(fail);
        srv.kill();
    }
})().catch(e => { console.error(e); process.exit(1); });
