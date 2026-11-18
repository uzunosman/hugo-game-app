// Uçtan uca: sesli sohbet. Masa açılırken seçilir; en az 2 gerçek oyuncu varken açılır (yapay zekâ sayılmaz); admin açarsa
// kişi kuralı aranmaz, kapatırsa kapanır. Bağlantı kurma mesajı yalnızca masada sese katılmış oyuncular arasında aktarılır.
import assert from 'assert';
import { spawn } from 'child_process';
import path from 'path';
import { io, Socket } from 'socket.io-client';

const PORT = 3089;
const URL = `http://localhost:${PORT}`;
const TOKEN = 'voice-e2e-token';
type Ack = Record<string, any>;
const emit = (s: Socket, ev: string, data: any = {}) => new Promise<Ack>(res => s.emit(ev, data, (r: Ack) => res(r ?? {})));
const once = (s: Socket, ev: string) => new Promise<Ack>(res => s.once(ev, res));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const connect = (adminToken?: string) => io(URL, { transports: ['websocket'], forceNew: true, reconnection: false, auth: adminToken ? { adminToken } : {} });

const startServer = () => new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
    const srv = spawn(process.execPath, ['-r', 'ts-node/register', 'src/index.ts'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PORT: String(PORT), PERSIST: 'false', DATABASE_URL: '', ADMIN_TOKEN: TOKEN, TEST_MODE: 'false', AUTO_START_GAME: 'false' },
    });
    srv.stdout.on('data', d => { if (String(d).includes('Sunucu çalışıyor')) resolve(srv); });
    srv.on('exit', code => reject(new Error(`sunucu kapandı: ${code}`)));
});

(async () => {
    const srv = await startServer();
    const fail = setTimeout(() => { console.error('Zaman aşımı'); srv.kill(); process.exit(1); }, 30_000);
    try {
        const admin = connect(TOKEN);
        const a = connect(), b = connect();
        const aId = (await emit(a, 'player:register', { name: 'Ayşe' })).player.id;
        const bId = (await emit(b, 'player:register', { name: 'Barış' })).player.id;

        // Sesli sohbetli masa: tek gerçek oyuncu + yapay zekâ → kapalı
        const room = (await emit(a, 'room:create', { name: 'sesli', playerId: aId })).room;
        await emit(a, 'room:setVoice', { roomId: room.id, playerId: aId, voice: true }); // bekleme ekranında sahip açar
        await emit(a, 'room:addBot', { roomId: room.id, playerId: aId });
        assert.strictEqual(room.voice, false, 'tek oyuncuyla sesli sohbet kapalı');
        assert.strictEqual((await emit(a, 'voice:join', { playerId: aId })).success, false, 'kapalıyken sese katılınamaz');

        // İkinci gerçek oyuncu oturur → açılır, masadakilere bildirilir
        const opened = once(a, 'room:voice');
        await emit(b, 'room:join', { roomId: room.id, playerId: bId });
        assert.strictEqual((await opened).voice, true, '2 gerçek oyuncuyla açılır');

        // Sese katılma ve bağlantı mesajı aktarımı
        const ja = await emit(a, 'voice:join', { playerId: aId });
        assert.ok(ja.success && ja.peers.length === 0 && ja.iceServers.length >= 1);
        const joined = once(a, 'voice:peer-joined');
        const jb = await emit(b, 'voice:join', { playerId: bId });
        assert.deepStrictEqual(jb.peers, [aId], 'katılan, öncekileri görür');
        assert.strictEqual((await joined).playerId, bId, 'öncekiler katılanı duyar');
        const sig = once(a, 'voice:signal');
        b.emit('voice:signal', { playerId: bId, to: aId, data: { sdp: { type: 'offer', sdp: 'x' } } });
        assert.deepStrictEqual(await sig, { from: bId, data: { sdp: { type: 'offer', sdp: 'x' } } }, 'mesaj aktarılır');
        // Başkası adına mesaj gönderilemez
        let leaked = false;
        b.once('voice:signal', () => { leaked = true; });
        a.emit('voice:signal', { playerId: bId, to: bId, data: {} });
        await sleep(200);
        assert.strictEqual(leaked, false, 'başkası adına mesaj aktarılmaz');

        // Admin kapatır → kapanır; admin açar → tek oyuncuda bile açılır
        const no = (await emit(admin, 'admin:overview')).masalar.find((t: Ack) => t.ad === 'sesli').no;
        const closed = once(a, 'room:voice');
        assert.ok((await emit(admin, 'admin:voice', { no, mode: 'off' })).success);
        assert.strictEqual((await closed).voice, false, 'admin kapatır');
        const c = connect();
        const cId = (await emit(c, 'player:register', { name: 'Cem' })).player.id;
        const solo = (await emit(c, 'room:create', { name: 'tekli', playerId: cId })).room;
        assert.strictEqual(solo.voice, false, 'sesli sohbet seçilmeden açılan masa');
        const no2 = (await emit(admin, 'admin:overview')).masalar.find((t: Ack) => t.ad === 'tekli').no;
        const forced = once(c, 'room:voice');
        await emit(admin, 'admin:voice', { no: no2, mode: 'on' });
        assert.strictEqual((await forced).voice, true, 'admin açarsa kişi kuralı aranmaz');
        assert.ok((await emit(c, 'voice:join', { playerId: cId })).success);

        // Bekleme ekranında masa sahibi ayarı açar / kapatır; başkası değiştiremez
        assert.strictEqual((await emit(b, 'room:setVoice', { roomId: room.id, playerId: bId, voice: false })).success, false, 'sahip olmayan değiştiremez');
        const set = await emit(c, 'room:setVoice', { roomId: solo.id, playerId: cId, voice: true });
        assert.ok(set.success && set.room.settings.voice === true, 'masa sahibi açar');

        [admin, a, b, c].forEach(s => s.close());
        console.log('e2e-voice: sesli sohbet masa ayarı + en az 2 gerçek oyuncu, admin aç / kapat, sese katılma, mesaj aktarımı (yalnızca sesteki oyuncular) ✓');
    } finally {
        clearTimeout(fail);
        srv.kill();
    }
})().catch(e => { console.error(e); process.exit(1); });
