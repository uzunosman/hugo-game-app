// Uçtan uca: profil (kalıcı kimlik, başka cihaza taşıma), arkadaşlık (istek / onay / çıkarma), çevrimiçi liste, masaya çağırma.
import assert from 'assert';
import { spawn } from 'child_process';
import path from 'path';
import { io, Socket } from 'socket.io-client';

const PORT = 3087;
type Ack = Record<string, any>;
const emit = (s: Socket, ev: string, data: any = {}) => new Promise<Ack>(res => s.emit(ev, data, (r: Ack) => res(r ?? {})));
const once = (s: Socket, ev: string) => new Promise<Ack>(res => s.once(ev, res));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const connect = () => io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true, reconnection: false });

const startServer = () => new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
    const srv = spawn(process.execPath, ['-r', 'ts-node/register', 'src/index.ts'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PORT: String(PORT), PERSIST: 'false', DATABASE_URL: '', TEST_MODE: 'false', AUTO_START_GAME: 'false' },
    });
    srv.stdout.on('data', d => { if (String(d).includes('Sunucu çalışıyor')) resolve(srv); });
    srv.on('exit', code => reject(new Error(`sunucu kapandı: ${code}`)));
});

(async () => {
    const srv = await startServer();
    const fail = setTimeout(() => { console.error('Zaman aşımı'); srv.kill(); process.exit(1); }, 30_000);
    try {
        const a = connect(), b = connect();
        const ra = await emit(a, 'player:register', { name: 'Ayşe' });
        const rb = await emit(b, 'player:register', { name: 'Barış' });
        assert.ok(ra.profile?.id && ra.profile?.key, 'yeni oyuncuya profil ve anahtar');
        const aId = ra.player.id, bId = rb.player.id, pa = ra.profile.id, pb = rb.profile.id;

        // Başka cihaz: aynı profille kayıt → aynı profil; yanlış anahtar → yeni profil
        const c = connect();
        const rc = await emit(c, 'player:register', { name: 'Ayşe tablet', profile: ra.profile });
        assert.strictEqual(rc.profile.id, pa, 'taşınan profil');
        assert.strictEqual(rc.profile.key, undefined, 'anahtar yeniden gönderilmez');
        const rx = await emit(connect(), 'player:register', { name: 'Sahte', profile: { id: pa, key: 'yanlis' } });
        assert.notStrictEqual(rx.profile.id, pa, 'yanlış anahtarla profil alınamaz');
        assert.strictEqual((await emit(c, 'profile:link', { playerId: rc.player.id, profile: { id: pb, key: 'x' } })).success, false);

        // Ad değiştir: profil adı da değişir; başkası değiştiremez
        assert.strictEqual((await emit(b, 'player:rename', { playerId: aId, name: 'X' })).success, false);
        assert.strictEqual((await emit(a, 'player:rename', { playerId: aId, name: 'Ayşe Nur' })).player.name, 'Ayşe Nur');

        // Çevrimiçi liste
        const st = await emit(a, 'social:state', { playerId: aId });
        assert.ok(st.online.some((o: Ack) => o.id === pb && o.where === 'lobby'), 'Barış çevrimiçi, lobide');
        assert.ok(!st.online.some((o: Ack) => o.id === pa), 'kendisi listede yok');
        assert.strictEqual((await emit(b, 'social:state', { playerId: aId })).success, false, 'başkasının listesi okunamaz');

        // Arkadaşlık: istek → karşıya bildirim → onay
        const changed = once(b, 'friends:changed');
        assert.strictEqual((await emit(a, 'friends:request', { playerId: aId, to: pb })).status, 'sent');
        await changed;
        const sb = await emit(b, 'social:state', { playerId: bId });
        assert.ok(sb.requests.length === 1 && sb.requests[0].id === pa, 'istek görünür');
        assert.ok((await emit(b, 'friends:respond', { playerId: bId, from: pa, accept: true })).success);
        const fa = await emit(a, 'social:state', { playerId: aId });
        assert.ok(fa.friends.some((f: Ack) => f.id === pb && f.online), 'arkadaş ve çevrimiçi');

        // Çağır: masada boş koltuk varken lobideki arkadaşa davet kartı gider
        assert.strictEqual((await emit(a, 'invite:send', { playerId: aId, to: pb })).success, false, 'masada değilken çağrılmaz');
        const room = (await emit(a, 'room:create', { playerId: aId })).room;
        const inv = once(b, 'invite:received');
        assert.ok((await emit(a, 'invite:send', { playerId: aId, to: pb })).success);
        const got = await inv;
        assert.strictEqual(got.room.id, room.id);
        assert.strictEqual(got.from.name, 'Ayşe Nur');
        assert.strictEqual((await emit(a, 'invite:send', { playerId: aId, to: pb })).success, false, 'aynı kişi 20 sn içinde tekrar çağrılmaz');
        assert.ok((await emit(b, 'room:join', { roomId: room.id, playerId: bId })).success, 'davetle oturur');

        // Masadan çıkarma
        assert.ok((await emit(b, 'friends:remove', { playerId: bId, other: pa })).success);
        assert.strictEqual((await emit(a, 'social:state', { playerId: aId })).friends.length, 0);

        // Bağlantı kopup oyuncu silinse de profil kalır: aynı anahtarla dönen aynı profile, arkadaşlıklarıyla bağlanır
        await emit(a, 'friends:request', { playerId: aId, to: pb });
        b.close();
        await sleep(100);
        const b2 = connect();
        const back = await emit(b2, 'player:register', { name: 'Barış', profile: rb.profile });
        assert.strictEqual(back.profile.id, pb, 'aynı profil');
        assert.strictEqual((await emit(b2, 'social:state', { playerId: back.player.id })).requests.length, 1, 'bekleyen istek duruyor');

        [a, c, b2].forEach(s => s.close());
        console.log('e2e-social: profil (taşıma, yanlış anahtar), çevrimiçi liste, arkadaşlık isteği / onay / çıkarma, masaya çağırma ✓');
    } finally {
        clearTimeout(fail);
        srv.kill();
    }
})().catch(e => { console.error(e); process.exit(1); });
