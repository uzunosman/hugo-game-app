// Uçtan uca test: sunucuyu ayrı portta başlatır, 4 bot bağlanıp 9 eli desteden çek-at ile oynar.
// Çalıştırma: npm run test:e2e
import assert from 'assert';
import { spawn } from 'child_process';
import path from 'path';
import { io, Socket } from 'socket.io-client';

const PORT = 3099;
const URL = `http://localhost:${PORT}`;
type Ack = Record<string, any>;

const emit = (s: Socket, ev: string, data: any) =>
    new Promise<Ack>(res => s.emit(ev, data, (r: Ack) => res(r ?? {})));

const startServer = () => new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
    const srv = spawn('npx', ['ts-node', 'src/index.ts'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PORT: String(PORT), TEST_MODE: 'false', AUTO_START_GAME: 'false' },
    });
    srv.stdout.on('data', d => { if (String(d).includes('Sunucu çalışıyor')) resolve(srv); });
    srv.on('exit', code => reject(new Error(`sunucu kapandı: ${code}`)));
});

class Bot {
    socket: Socket;
    id = '';
    hand: string[] = [];
    busy = false;
    constructor(public name: string, public roomId = '') {
        this.socket = io(URL, { transports: ['websocket'] });
        this.socket.on('game:tiles', r => { this.hand = r.tiles.map((x: Ack) => x.id); if (this.hand.length === 15) this.act(); });
        this.socket.on('game:nextTurn', r => { if (r.currentPlayerId === this.id) this.act(); });
        this.socket.on('game:roundStarted', async r => {
            const t = await emit(this.socket, 'game:requestTiles', { playerId: this.id });
            this.hand = t.tiles.map((x: Ack) => x.id);
            if (r.game.currentPlayerId === this.id) this.act();
        });
    }
    async act() {
        if (this.busy) return;
        this.busy = true;
        try {
            if (this.hand.length < 15) {
                const d = await emit(this.socket, 'game:drawTile', { playerId: this.id, fromDiscard: false });
                if (!d.success) return; // deste bitti → tur sonu
                this.hand.push(d.tile.id);
            }
            const tileId = this.hand[0];
            const r = await emit(this.socket, 'game:discardTile', { playerId: this.id, roomId: this.roomId, tileId });
            assert.ok(r.success, `${this.name} taş atamadı: ${r.error}`);
            this.hand.shift();
        } finally {
            this.busy = false;
        }
    }
}

(async () => {
    const srv = await startServer();
    const fail = setTimeout(() => { console.error('Zaman aşımı'); srv.kill(); process.exit(1); }, 150_000);
    try {
        const bots = [0, 1, 2, 3].map(i => new Bot(`Bot${i}`));
        for (const b of bots) b.id = (await emit(b.socket, 'player:register', { name: b.name })).player.id;

        const room = (await emit(bots[0].socket, 'room:create', { name: 'e2e', playerId: bots[0].id })).room;
        bots.forEach(b => (b.roomId = room.id));
        for (const b of bots.slice(1)) assert.ok((await emit(b.socket, 'room:join', { roomId: room.id, playerId: b.id })).success);
        for (const b of bots) await emit(b.socket, 'player:ready', { roomId: room.id, playerId: b.id, ready: true });

        const ends: Ack[] = [];
        const done = new Promise<void>(res => bots[0].socket.on('game:roundEnded', r => {
            ends.push(r);
            console.log(`  ${r.round}. el bitti${r.isHugoRound ? ' (Hugo)' : ''} → toplamlar ${r.results.map((x: Ack) => x.totalScore).join(' / ')}`);
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
        console.log('e2e-bots: 4 bot 9 eli tamamladı, puanlar tutarlı ✓');
        bots.forEach(b => b.socket.close());
    } finally {
        clearTimeout(fail);
        srv.kill();
    }
})().catch(e => { console.error(e); process.exit(1); });
