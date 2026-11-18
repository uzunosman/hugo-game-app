// Uçtan uca: 1 insan (soket) + 3 yapay zekâ, 9 el. Yapay zekânın eli gizli ve başkası adına hamle yapılamaz.
// Çalıştırma: npm run test:e2e
import assert from 'assert';
import { spawn } from 'child_process';
import path from 'path';
import { io, Socket } from 'socket.io-client';

const PORT = 3098;
type Ack = Record<string, any>;
const emit = (s: Socket, ev: string, data: any) => new Promise<Ack>(res => s.emit(ev, data, (r: Ack) => res(r ?? {})));

const startServer = () => new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
    const srv = spawn(process.execPath, ['-r', 'ts-node/register', 'src/index.ts'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PORT: String(PORT), TEST_MODE: 'false', AUTO_START_GAME: 'false', TURN_TIMEOUT_MS: '200', BOT_THINK_MS: '5', BOT_STEP_MS: '0', ROUND_BREAK_MS: '200', PERSIST: 'false', DRAW_GAP_MS: '0' },
    });
    srv.stdout.on('data', d => { if (String(d).includes('Sunucu çalışıyor')) resolve(srv); });
    srv.on('exit', code => reject(new Error(`sunucu kapandı: ${code}`)));
});

(async () => {
    const srv = await startServer();
    const fail = setTimeout(() => { console.error('Zaman aşımı'); srv.kill(); process.exit(1); }, 120_000);
    try {
        const me = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
        const myId = (await emit(me, 'player:register', { name: 'İnsan' })).player.id;
        const room = (await emit(me, 'room:create', { name: 'ai', playerId: myId })).room;
        for (let i = 0; i < 3; i++) assert.ok((await emit(me, 'room:addBot', { roomId: room.id, playerId: myId })).success, 'yapay zekâ eklenmeli');
        assert.strictEqual((await emit(me, 'room:addBot', { roomId: room.id, playerId: myId })).success, false, 'masa dolu');
        await emit(me, 'player:ready', { roomId: room.id, playerId: myId, ready: true });

        const details = await emit(me, 'room:details', { roomId: room.id });
        const botIds: string[] = (details.room || details).players.filter((p: Ack) => p.isBot).map((p: Ack) => p.id);
        assert.strictEqual(botIds.length, 3);

        let botOpened = 0;
        me.on('game:handOpened', r => { if (botIds.includes(r.playerId)) botOpened++; });
        const ends: Ack[] = [];
        const done = new Promise<void>(res => me.on('game:roundEnded', r => {
            ends.push(r);
            console.log(`  ${r.round}. el bitti → toplamlar ${r.results.map((x: Ack) => x.totalScore).join(' / ')}`);
            if (r.gameStatus === 'finished') res();
        }));
        assert.ok((await emit(me, 'game:start', { roomId: room.id, playerId: myId })).success, 'oyun başlamadı');

        // Gizlilik ve kontrol: başkası (yapay zekâ) adına el görülemez, hamle yapılamaz
        const peek = await emit(me, 'game:requestTiles', { playerId: botIds[0] });
        assert.strictEqual(peek.success, false, 'yapay zekânın eli istemciye verilmez');
        assert.ok(!peek.tiles);
        assert.strictEqual((await emit(me, 'game:drawTile', { playerId: botIds[0], fromDiscard: false })).success, false, 'yapay zekâ adına taş çekilemez');
        assert.strictEqual((await emit(me, 'game:discardTile', { playerId: botIds[0], tileId: 'x' })).success, false);

        // Sohbet: masadaki herkese gider, uzun mesaj kırpılır, başkası adına yazılamaz
        const got = new Promise<Ack>(res => me.once('chat:message', res));
        assert.ok((await emit(me, 'chat:send', { playerId: myId, text: '  merhaba   masa ' })).success);
        const msg = await got;
        assert.strictEqual(msg.text, 'merhaba masa');
        assert.strictEqual(msg.name, 'İnsan');
        assert.strictEqual((await emit(me, 'chat:send', { playerId: botIds[0], text: 'sahte' })).success, false, 'başkası adına yazılamaz');
        assert.strictEqual((await emit(me, 'chat:history', { playerId: myId })).messages.length, 1);

        // İnsan oyuncu hamle yapmaz: sunucu süre dolunca onun yerine oynar
        await done;
        assert.deepStrictEqual(ends.map(e => e.round), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
        assert.ok(ends.every(e => e.history?.round === e.round && e.history.results.length === 4 && Array.isArray(e.history.penalties)), 'her el geçmişe yazılır');
        assert.ok(botOpened > 0, 'yapay zekâ en az bir elde açmalı');
        // Oyun sonu tabelasından sonra masa oda ekranına döner: puanlar sıfır, insanlar yeniden hazır olur
        const reset = await new Promise<Ack>(res => me.once('room:reset', res));
        assert.strictEqual(reset.room.status, 'waiting');
        assert.ok(reset.room.players.every((p: Ack) => p.totalScore === 0 && p.roundScores.length === 0), 'yeni oyunda puanlar sıfır');
        assert.ok(reset.room.players.every((p: Ack) => p.isReady === !!p.isBot), 'yalnızca yapay zekâ hazır');
        // Masa sahibi kendiliğinden hazır: masada başka insan yoksa yeni oyunu hemen başlatır
        assert.ok((await emit(me, 'game:start', { roomId: room.id, playerId: myId })).success, 'sahip yeni oyunu başlatır');
        console.log(`e2e-ai: 9 el yapay zekâyla tamamlandı (${botOpened} açılış); el gizli, başkası adına hamle yapılamıyor, sohbet çalışıyor, oyun sonunda masa beklemeye dönüyor, sahip yeniden başlatıyor ✓`);
        me.close();
    } finally {
        clearTimeout(fail);
        srv.removeAllListeners('exit');
        srv.kill();
    }
})().catch(e => { console.error(e); process.exit(1); });
