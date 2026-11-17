// Uçtan uca test: sunucuyu ayrı portta başlatır, 4 bot bağlanıp 9 eli desteden çek-at ile oynar.
// Senaryolar: hiç oynamayan bot (süre aşımı), kopup dönen bot, el ortasında sunucunun yeniden başlaması.
// Çalıştırma: npm run test:e2e
import assert from 'assert';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { io, Socket } from 'socket.io-client';

const PORT = 3099;
const STATE_FILE = path.join(os.tmpdir(), `hugo-e2e-${process.pid}.json`);
const URL = `http://localhost:${PORT}`;
type Ack = Record<string, any>;

const emit = (s: Socket, ev: string, data: any) =>
    new Promise<Ack>(res => s.emit(ev, data, (r: Ack) => res(r ?? {})));

const startServer = () => new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
    // npx yerine doğrudan node: kill asıl sunucu sürecini durdurur, port boşalır
    const srv = spawn(process.execPath, ['-r', 'ts-node/register', 'src/index.ts'], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env, PORT: String(PORT), TEST_MODE: 'false', AUTO_START_GAME: 'false',
            TURN_TIMEOUT_MS: '300', ROUND_BREAK_MS: '300', DISCONNECTED_TURN_MS: '100', STATE_FILE, PERSIST: 'true', DRAW_GAP_MS: '0', // çekme-atma beklemesi: e2e-ai ve e2e-leave'de varsayılanla
        },
    });
    srv.stdout.on('data', d => { if (String(d).includes('Sunucu çalışıyor')) resolve(srv); });
    srv.on('exit', code => reject(new Error(`sunucu kapandı: ${code}`)));
});

class Bot {
    socket!: Socket;
    id = '';
    token = '';
    hand: string[] = [];
    busy = false;
    afk = false; // true: hiç hamle yapmaz, sunucu süre dolunca onun yerine oynar
    onRoundEnded?: (r: Ack) => void;
    constructor(public name: string, public roomId = '') { this.connect(); }
    connect() {
        this.socket = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
        this.socket.on('game:roundEnded', r => this.onRoundEnded?.(r));
        this.socket.on('game:tiles', r => { this.hand = r.tiles.map((x: Ack) => x.id); if (this.hand.length === 15) this.act(); });
        this.socket.on('game:nextTurn', r => { if (r.currentPlayerId === this.id) this.act(); });
        this.socket.on('game:roundStarted', async r => {
            await this.syncHand();
            if (r.game.currentPlayerId === this.id) this.act();
        });
        this.socket.on('game:autoPlayed', r => {
            this.hand = this.hand.filter(id => id !== r.discardedTile.id);
            if (r.drawnTile) this.hand.push(r.drawnTile.id);
            this.hand = this.hand.filter(id => id !== r.discardedTile.id);
        });
    }
    async syncHand() {
        const t = await emit(this.socket, 'game:requestTiles', { playerId: this.id });
        this.hand = (t.tiles || []).map((x: Ack) => x.id);
    }
    async reconnect() {
        this.socket.close();
        this.connect();
        // Kimlik herkese açık: anahtarsız ya da yanlış anahtarla koltuğa dönülemez
        assert.strictEqual((await emit(this.socket, 'player:reconnect', { playerId: this.id })).success, false, 'anahtarsız yeniden bağlanma reddedilmeli');
        assert.strictEqual((await emit(this.socket, 'player:reconnect', { playerId: this.id, token: 'x'.repeat(32) })).success, false, 'yanlış anahtar reddedilmeli');
        const r = await emit(this.socket, 'player:reconnect', { playerId: this.id, token: this.token });
        assert.ok(r.success && r.room?.id === this.roomId, 'yeniden bağlanınca aynı odaya dönmeli');
        await this.syncHand();
        if (r.room.game.currentPlayerId === this.id) this.act();
    }
    async act() {
        if (this.busy || this.afk || !this.socket.connected) return;
        this.busy = true;
        try {
            if (this.hand.length < 15) {
                const d = await emit(this.socket, 'game:drawTile', { playerId: this.id, fromDiscard: false });
                if (!d.success) return; // deste bitti → tur sonu ya da sıra otomatik oynandı
                this.hand.push(d.tile.id);
            }
            const tileId = this.hand[0];
            const r = await emit(this.socket, 'game:discardTile', { playerId: this.id, roomId: this.roomId, tileId });
            if (r.success) this.hand.shift();
            else await this.syncHand(); // sunucu bu sırada otomatik oynamış olabilir
        } finally {
            this.busy = false;
        }
    }
}

const stopServer = (srv: ReturnType<typeof spawn>) => new Promise<void>(res => {
    srv.removeAllListeners('exit');
    srv.once('exit', () => res());
    srv.kill();
});

(async () => {
    let srv = await startServer();
    const fail = setTimeout(() => { console.error('Zaman aşımı'); srv.kill(); process.exit(1); }, 180_000);
    try {
        const bots = [0, 1, 2, 3].map(i => new Bot(`Bot${i}`));
        bots[3].afk = true;
        for (const b of bots) {
            const reg = await emit(b.socket, 'player:register', { name: b.name });
            b.id = reg.player.id;
            b.token = reg.token;
            assert.ok(typeof reg.token === 'string' && reg.token.length >= 32, 'kayıt oturum anahtarı vermeli');
            assert.ok(!JSON.stringify(reg.player).includes(reg.token), 'anahtar oyuncu bilgisinde yayınlanmamalı');
        }

        const room = (await emit(bots[0].socket, 'room:create', { name: 'e2e', playerId: bots[0].id })).room;
        bots.forEach(b => (b.roomId = room.id));
        for (const b of bots.slice(1)) assert.ok((await emit(b.socket, 'room:join', { roomId: room.id, playerId: b.id })).success);
        for (const b of bots) await emit(b.socket, 'player:ready', { roomId: room.id, playerId: b.id, ready: true });

        const ends: Ack[] = [];
        const crash = (e: unknown) => { console.error(e); process.exit(1); };
        const done = new Promise<void>(res => (bots[0].onRoundEnded = r => {
            ends.push(r);
            console.log(`  ${r.round}. el bitti${r.isHugoRound ? ' (Hugo)' : ''} → toplamlar ${r.results.map((x: Ack) => x.totalScore).join(' / ')}`);
            // 2. el sonunda Bot2 kopar, 4. el sonunda aynı kimlikle geri döner
            if (r.round === 2) bots[2].socket.disconnect();
            if (r.round === 4) bots[2].reconnect().catch(crash);
            // 6. el sonunda sunucu öldürülüp yeniden başlatılır; herkes kayıtlı durumla koltuğuna döner
            if (r.round === 6) (async () => {
                await new Promise(w => setTimeout(w, 800)); // kayıt (300 ms) diske düşsün
                await stopServer(srv);
                console.log('  sunucu yeniden başlatılıyor…');
                srv = await startServer();
                for (const b of bots) await b.reconnect();
            })().catch(crash);
            if (r.gameStatus === 'finished') res();
        }));
        assert.ok((await emit(bots[0].socket, 'game:start', { roomId: room.id, playerId: bots[0].id })).success, 'oyun başlamadı');
        await done;

        assert.deepStrictEqual(ends.map(e => e.round), [1, 2, 3, 4, 5, 6, 7, 8, 9], 'eller sırayla 1→9 olmalı');
        assert.deepStrictEqual(ends.map(e => e.isHugoRound), ends.map(e => [1, 5, 9].includes(e.round) || e.isHugoRound));
        const last = ends[8];
        for (const r of last.results) {
            const sum = ends.reduce((s, e) => s + e.results.find((x: Ack) => x.playerId === r.playerId).roundTotal, 0);
            assert.strictEqual(r.totalScore, sum, `${r.playerName} toplamı el puanlarının toplamı olmalı`);
        }
        assert.ok(last.players.every((p: Ack) => p.roundScores.length === 9), 'tabelada 9 el olmalı');
        console.log('e2e-bots: 9 el tamamlandı; süre aşımı, kopma, yeniden bağlanma ve sunucu yeniden başlatma dahil puanlar tutarlı ✓');
        bots.forEach(b => b.socket.close());
    } finally {
        clearTimeout(fail);
        await stopServer(srv);
        fs.rmSync(STATE_FILE, { force: true });
    }
})().catch(e => { console.error(e); process.exit(1); });
