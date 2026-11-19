// Uçtan uca: oyun sürerken masa sahibi yapay zekâyı çıkarır (koltuk süre boyunca boş, geri sayım), boş koltuğa çağırır /
// hemen yapay zekâ koyar, kimse gelmezse yapay zekâ döner. İzleme: ziyarete açık masada herkes bütün elleri görür; kapalı
// masada yalnızca arkadaş, yalnızca arkadaşının elini görür. Masadakiler izleyenleri görür.
import assert from 'assert';
import { spawn } from 'child_process';
import path from 'path';
import { io, Socket } from 'socket.io-client';

const PORT = 3086;
type Ack = Record<string, any>;
const emit = (s: Socket, ev: string, data: any = {}) => new Promise<Ack>(res => s.emit(ev, data, (r: Ack) => res(r ?? {})));
const once = (s: Socket, ev: string) => new Promise<Ack>(res => s.once(ev, res));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const connect = () => io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true, reconnection: false });

const startServer = () => new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
    const srv = spawn(process.execPath, ['-r', 'ts-node/register', 'src/index.ts'], {
        cwd: path.join(__dirname, '..'),
        // Yapay zekâ yavaş oynasın (test sırasında oyun bitmesin), boş koltuk 1,5 sn beklesin
        env: { ...process.env, PORT: String(PORT), PERSIST: 'false', DATABASE_URL: '', TEST_MODE: 'false', AUTO_START_GAME: 'false', VACANT_SEAT_MS: '1500', BOT_STEP_MS: '2000' },
    });
    srv.stdout.on('data', d => { if (String(d).includes('Sunucu çalışıyor')) resolve(srv); });
    srv.on('exit', code => reject(new Error(`sunucu kapandı: ${code}`)));
});

(async () => {
    const srv = await startServer();
    const fail = setTimeout(() => { console.error('Zaman aşımı'); srv.kill(); process.exit(1); }, 40_000);
    try {
        const a = connect(), b = connect(), c = connect();
        const ra = await emit(a, 'player:register', { name: 'Ayşe' });
        const rb = await emit(b, 'player:register', { name: 'Barış' });
        const rc = await emit(c, 'player:register', { name: 'Cem' });
        const aId = ra.player.id, bId = rb.player.id, cId = rc.player.id;
        const room = (await emit(a, 'room:quickPlay', { playerId: aId })).room;
        const bot = room.players.find((p: Ack) => p.isBot);

        // Yapay zekâyı çıkar: yalnızca sahip, koltuk boş kalır ve geri sayım gider
        assert.strictEqual((await emit(b, 'room:kickBot', { roomId: room.id, playerId: bId, botId: bot.id })).success, false, 'sahip olmayan çıkaramaz');
        const left = once(a, 'player:joined');
        assert.ok((await emit(a, 'room:kickBot', { roomId: room.id, playerId: aId, botId: bot.id })).success);
        const seat = (await left).room.players.find((p: Ack) => p.id === bot.id);
        assert.ok(seat.vacant && seat.vacantLeftMs > 1000 && seat.vacantLeftMs <= 1500, `koltuk boş, geri sayım: ${seat.vacantLeftMs}`);
        assert.strictEqual((await emit(a, 'room:kickBot', { roomId: room.id, playerId: aId, botId: room.players.filter((p: Ack) => p.isBot)[1].id })).success, false, 'aynı anda tek boş koltuk');

        // Boş koltuğa lobiden çağır, sonra sahip hemen yapay zekâ koyar
        const inv = once(b, 'invite:received');
        assert.ok((await emit(a, 'invite:send', { playerId: aId, to: rb.profile.id })).success, 'oyun sürerken boş koltuğa çağrılır');
        assert.strictEqual((await inv).room.id, room.id);
        assert.ok((await emit(a, 'room:fillSeat', { roomId: room.id, playerId: aId })).success);
        // Kimse gelmezse süre dolunca yapay zekâ döner
        await emit(a, 'room:kickBot', { roomId: room.id, playerId: aId, botId: bot.id });
        await sleep(1900);
        const st = (await emit(a, 'room:details', { roomId: room.id })).room;
        assert.ok(st.players.find((p: Ack) => p.id === bot.id)?.isBot, 'süre dolunca yapay zekâ geri gelir');

        // İzleme: kapalı masa, arkadaş değil → izlenemez
        assert.strictEqual((await emit(b, 'room:watch', { playerId: bId, roomId: room.id })).success, false, 'kapalı masa izlenemez');
        // Ziyarete açık → herkes, bütün eller; masadakiler izleyeni görür
        assert.strictEqual((await emit(b, 'room:setSpectators', { roomId: room.id, playerId: bId, value: true })).success, false);
        await emit(a, 'room:setSpectators', { roomId: room.id, playerId: aId, value: true });
        const seen = once(a, 'room:watchers');
        const w = await emit(b, 'room:watch', { playerId: bId, roomId: room.id });
        assert.ok(w.success, w.error);
        assert.strictEqual(Object.keys(w.masa.eller).length, 4, 'ziyarete açık: bütün eller');
        assert.deepStrictEqual((await seen).names, ['Barış'], 'masadakiler izleyeni görür');
        assert.strictEqual((await emit(b, 'game:drawTile', { playerId: aId, roomId: room.id, fromDiscard: false })).success, false, 'izleyen oynayamaz');
        // Kapatılınca arkadaş olmayan izleyemez
        await emit(a, 'room:setSpectators', { roomId: room.id, playerId: aId, value: false });
        assert.strictEqual((await emit(b, 'room:watchState', { playerId: bId })).success, false, 'kapanınca izleme biter');
        // Arkadaş: yalnızca arkadaşının eli
        await emit(c, 'friends:request', { playerId: cId, to: ra.profile.id });
        await emit(a, 'friends:respond', { playerId: aId, from: rc.profile.id, accept: true });
        const fw = await emit(c, 'room:watch', { playerId: cId, roomId: room.id });
        assert.ok(fw.success, fw.error);
        assert.deepStrictEqual(Object.keys(fw.masa.eller), [aId], 'arkadaş yalnızca arkadaşının elini görür');
        assert.strictEqual(fw.masa.elSayisi[bot.id] > 0, true, 'diğerlerinin yalnızca taş sayısı');
        // Arkadaşın gözünden: eli ve ıstaka dizilişi; dizilişi değişince izleyene gider
        const wt = await emit(c, 'room:watchTiles', { playerId: cId, seatId: aId });
        assert.ok(wt.success && wt.tiles.length >= 14, 'arkadaşının eli');
        assert.strictEqual((await emit(c, 'room:watchTiles', { playerId: cId, seatId: bot.id })).success, false, 'başkasının eli verilmez');
        const rack = once(c, 'watch:rack');
        const layout = [...wt.tiles.map((t: Ack) => t.id).reverse(), null];
        a.emit('rack:layout', { playerId: aId, layout });
        assert.deepStrictEqual((await rack).layout, layout, 'ıstaka dizilişi izleyene gider');
        assert.deepStrictEqual((await emit(c, 'room:watchTiles', { playerId: cId, seatId: aId })).layout, layout);
        // İzleyen masaya oturamaz (oyun sürüyor) ama izlemeyi bırakır
        assert.ok((await emit(c, 'room:unwatch')).success);

        [a, b, c].forEach(s => s.close());
        console.log('e2e-watch: sahip yapay zekâyı çıkarır (geri sayım, çağır, hemen yapay zekâ, süre dolunca döner); ziyarete açık masa herkese bütün elleri, kapalı masa arkadaşa yalnızca arkadaşının elini gösterir; izleyenler görünür ✓');
    } finally {
        clearTimeout(fail);
        srv.kill();
    }
})().catch(e => { console.error(e); process.exit(1); });
