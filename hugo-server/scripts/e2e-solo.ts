// Uçtan uca: tek gerçek oyuncu 3 yapay zekâya karşı oynarken koptu. Masa boşta sayılıp kapanmaz; sırası gelince
// SOLO_AWAY_TURN_MS beklenir, dönmezse otomatik oynanır ve oyun sürer. Dönerse sayaç sıfırlanır; kopmasından
// SOLO_AWAY_MAX_MS sonra hâlâ yoksa masa kapanır. (Gerçekte 2 saat / 6 saat; testte kısaltılmış.)
import assert from 'assert';
import { spawn } from 'child_process';
import path from 'path';
import { io, Socket } from 'socket.io-client';

const PORT = 3092;
const URL = `http://localhost:${PORT}`;
type Ack = Record<string, any>;
const emit = (s: Socket, ev: string, data: any = {}) => new Promise<Ack>(res => s.emit(ev, data, (r: Ack) => res(r ?? {})));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const connect = () => io(URL, { transports: ['websocket'], forceNew: true, reconnection: false });

const startServer = () => new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
    const srv = spawn(process.execPath, ['-r', 'ts-node/register', 'src/index.ts'], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env, PORT: String(PORT), PERSIST: 'false', DATABASE_URL: '', TEST_MODE: 'false', AUTO_START_GAME: 'false',
            TURN_TIMEOUT_MS: '60000', DISCONNECTED_TURN_MS: '100', BOT_THINK_MS: '5', BOT_STEP_MS: '0', DRAW_GAP_MS: '0',
            IDLE_ROOM_MS: '300', ROOM_SWEEP_MS: '100', SOLO_AWAY_TURN_MS: '600', SOLO_AWAY_MAX_MS: '2000',
        },
    });
    srv.stdout.on('data', d => { if (String(d).includes('Sunucu çalışıyor')) resolve(srv); });
    srv.on('exit', code => reject(new Error(`sunucu kapandı: ${code}`)));
});

(async () => {
    const srv = await startServer();
    const fail = setTimeout(() => { console.error('Zaman aşımı'); srv.kill(); process.exit(1); }, 30_000);
    try {
        let me = connect();
        const reg = await emit(me, 'player:register', { name: 'Tek' });
        const myId = reg.player.id;
        const room = (await emit(me, 'room:create', { name: 'solo', playerId: myId })).room;
        for (let i = 0; i < 3; i++) await emit(me, 'room:addBot', { roomId: room.id, playerId: myId });
        await emit(me, 'player:ready', { roomId: room.id, playerId: myId, ready: true });
        assert.ok((await emit(me, 'game:start', { roomId: room.id, playerId: myId })).success, 'oyun başlamalı');

        const watcher = connect();
        const table = async () => ((await emit(watcher, 'rooms:list')).rooms as Ack[]).find(r => r.id === room.id);
        const mine = (r?: Ack) => r!.game.players.find((p: Ack) => p.id === myId);
        assert.strictEqual(mine(await table()).tilesCount, 15, 'ilk sıra bende (15 taş)');

        // Koptu: boşta süresi (0,3 sn) geçse de masa kapanmaz, sıram bekler
        me.close();
        await sleep(450);
        let t = await table();
        assert.ok(t, 'tek oyuncu koptu diye masa kapanmamalı');
        assert.strictEqual(t!.game.currentPlayerId, myId, 'sıram beklemeli (henüz otomatik oynanmadı)');
        // Bekleme bitti: sıram otomatik oynandı, oyun sürdü (yapay zekâlar oynadı, sıra yine bende bekliyor)
        await sleep(800);
        t = await table();
        assert.ok(t, 'masa açık kalmalı');
        assert.ok(mine(t!).tilesCount !== 15 || t!.game.deckCount < 48, 'sıram otomatik oynanmalı, oyun sürmeli');

        // Döndü: sayaç sıfırlanır; tekrar kopunca 2 sn dolmadan masa kapanmaz, dolunca kapanır
        await sleep(600); // ilk kopmadan bu yana ~1,85 sn
        me = connect();
        const back = await emit(me, 'player:reconnect', { playerId: myId, token: reg.token });
        assert.ok(back.success && back.room?.id === room.id, 'dönünce aynı masaya oturmalı');
        await sleep(250); // ilk kopmadan bu yana 2 sn geçti: dönmeseydi kapanırdı (boşta sınırı 0,3 sn'nin altında)
        assert.ok(await table(), 'dönen oyuncunun masası kapanmamalı');
        me.close();
        await sleep(1200);
        assert.ok(await table(), 'yeniden kopma: süre sıfırdan sayılır');
        await sleep(1200);
        assert.strictEqual(await table(), undefined, 'uzun süre dönmeyen oyuncunun masası kapanmalı');

        watcher.close();
        console.log('e2e-solo: tek oyuncu koptuğunda masa bekler, sırası bekleyip otomatik oynanır, dönünce sürer, uzun süre dönmezse kapanır ✓');
    } finally {
        clearTimeout(fail);
        srv.kill();
    }
})().catch(e => { console.error(e); process.exit(1); });
