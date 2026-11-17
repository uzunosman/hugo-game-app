// Uçtan uca: lab (test senaryoları) ve staging kapısı. Staging'e admin anahtarı olmadan bağlanılamaz; admin senaryoyu başlatır,
// koltuk değiştirip başka oyuncu adına sohbete yazar ve oynar, süre kapalıyken kimse otomatik oynamaz, sıfırla baştan kurar.
// Prod'da lab hiç çalışmaz.
import assert from 'assert';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { io, Socket } from 'socket.io-client';

const TOKEN = 'lab-e2e-token';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-lab-'));
type Ack = Record<string, any>;
const emit = (s: Socket, ev: string, data: any = {}) => new Promise<Ack>(res => s.emit(ev, data, (r: Ack) => res(r ?? {})));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const startServer = (port: number, appEnv: string) => new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
    const srv = spawn(process.execPath, ['-r', 'ts-node/register', 'src/index.ts'], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env, PORT: String(port), APP_ENV: appEnv, ADMIN_TOKEN: TOKEN, PERSIST: 'false', DATABASE_URL: '',
            TURN_TIMEOUT_MS: '300', DISCONNECTED_TURN_MS: '100', BOT_STEP_MS: '0',
            STATE_FILE: path.join(dir, `${appEnv}.json`),
        },
    });
    srv.stdout.on('data', d => { if (String(d).includes('Sunucu çalışıyor')) resolve(srv); });
    srv.on('exit', code => reject(new Error(`sunucu kapandı: ${code}`)));
});
const connect = (port: number, adminToken?: string) =>
    io(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true, reconnection: false, auth: adminToken ? { adminToken } : {} });

(async () => {
    const staging = await startServer(3094, 'staging');
    const prod = await startServer(3093, 'production');
    const fail = setTimeout(() => { console.error('Zaman aşımı'); staging.kill(); prod.kill(); process.exit(1); }, 60_000);
    try {
        // Staging kapısı: anahtarsız ve yanlış anahtarlı bağlantı reddedilir
        for (const t of [undefined, 'yanlis']) {
            const err = await new Promise<Error>(res => connect(3094, t).on('connect_error', res));
            assert.strictEqual(err.message, 'admin-required', 'staging admin olmayanı reddetmeli');
        }

        const admin = connect(3094, TOKEN);
        const list = await emit(admin, 'lab:scenarios');
        assert.ok(list.success && list.scenarios.some((s: Ack) => s.id === 'pair-process-test'), 'senaryolar listelenir');

        const start = await emit(admin, 'lab:start', { id: 'pair-process-test' });
        assert.ok(start.success, `senaryo başlamalı: ${start.error}`);
        assert.strictEqual(start.player.name, 'Sen');
        assert.strictEqual(start.room.lab, 'pair-process-test');
        assert.ok(start.token, 'koltuk için oturum anahtarı');
        const roomId = start.room.id;
        const sen = start.player.id;
        const ayse = start.room.players[1].id;

        const hand = await emit(admin, 'game:requestTiles', { playerId: sen });
        assert.strictEqual(hand.tiles.length, 14);

        // Süre kapalı: sıra beklerken otomatik oynanmaz
        await sleep(800);
        const again = await emit(admin, 'game:requestTiles', { playerId: sen });
        assert.strictEqual(again.tiles.length, 14, 'lab masasında süre dolunca otomatik oynanmamalı');

        const drawn = await emit(admin, 'game:drawTile', { playerId: sen, roomId, fromDiscard: false });
        assert.ok(drawn.success, `taş çekilir: ${drawn.error}`);

        // Koltuk değiştir: Ayşe adına sohbete yazılır; Sen adına artık işlem yapılamaz
        const seat = await emit(admin, 'lab:takeSeat', { playerId: ayse });
        assert.ok(seat.success && seat.player.name === 'Ayşe', `Ayşe koltuğuna geçilir: ${seat.error}`);
        assert.ok((await emit(admin, 'chat:send', { playerId: ayse, text: 'Ayşe yazdı' })).success);
        const chat = await emit(admin, 'chat:history', { playerId: ayse });
        assert.strictEqual(chat.messages.at(-1).name, 'Ayşe');
        assert.strictEqual((await emit(admin, 'chat:send', { playerId: sen, text: 'x' })).success, false, 'bırakılan koltuk adına yazılamaz');

        // Sıfırla: masa baştan kurulur, masadakiler haber alır
        const resetSeen = new Promise(res => admin.once('lab:reset', res));
        assert.ok((await emit(admin, 'lab:reset', { roomId })).success);
        await resetSeen;
        await emit(admin, 'lab:takeSeat', { playerId: sen });
        assert.strictEqual((await emit(admin, 'game:requestTiles', { playerId: sen })).tiles.length, 14, 'sıfırlanınca el baştan');

        // Prod: lab kapalı (admin olsa bile)
        const prodAdmin = connect(3093, TOKEN);
        const p = await emit(prodAdmin, 'lab:scenarios');
        assert.strictEqual(p.success, false, "prod'da lab çalışmamalı");
        // Prod'a admin olmayan da bağlanabilir (kapı yalnızca staging'de)
        await new Promise<void>((res, rej) => { const s = connect(3093); s.on('connect', () => { s.close(); res(); }); s.on('connect_error', rej); });

        admin.close(); prodAdmin.close();
        console.log("e2e-lab: staging kapısı, senaryo başlatma, koltuk değiştirme, süresiz bekleme, sıfırlama; prod'da lab kapalı ✓");
    } finally {
        clearTimeout(fail);
        staging.kill(); prod.kill();
        fs.rmSync(dir, { recursive: true, force: true });
    }
})().catch(e => { console.error(e); process.exit(1); });
