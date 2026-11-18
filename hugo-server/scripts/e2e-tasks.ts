// Uçtan uca: görevler (Faz 4). Veritabanı gerekir (TEST_DATABASE_URL, boş bir test veritabanı); yoksa atlanır.
// Admin görev açar → Claude aracı "geliştiriliyor" / "teste hazır" yazar → admin revize ister (ekran görüntüsüyle) → onaylar.
// Admin olmayan görevleri göremez; resim dışı ek reddedilir.
import assert from 'assert';
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { io, Socket } from 'socket.io-client';

const DB = process.env.TEST_DATABASE_URL;
if (!DB) { console.log('e2e-tasks: TEST_DATABASE_URL yok, atlandı'); process.exit(0); }

const PORT = 3091;
const TOKEN = 'tasks-e2e-token';
type Ack = Record<string, any>;
const emit = (s: Socket, ev: string, data: any = {}) => new Promise<Ack>(res => s.emit(ev, data, (r: Ack) => res(r ?? {})));
const root = path.join(__dirname, '..');
const env = { ...process.env, DATABASE_URL: DB, ADMIN_TOKEN: TOKEN, PORT: String(PORT), APP_ENV: 'development', STATE_FILE: path.join(os.tmpdir(), `hugo-tasks-${process.pid}.json`) };
const tasksCli = (...args: string[]) => execFileSync(process.execPath, ['-r', 'ts-node/register', 'src/tools/tasks.ts', ...args], { cwd: root, env, encoding: 'utf8' });

const startServer = () => new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
    const srv = spawn(process.execPath, ['-r', 'ts-node/register', 'src/index.ts'], { cwd: root, env });
    srv.stdout.on('data', d => { if (String(d).includes('Sunucu çalışıyor')) resolve(srv); });
    srv.stderr.on('data', d => process.stderr.write(d));
    srv.on('exit', code => reject(new Error(`sunucu kapandı: ${code}`)));
});

// 1×1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

(async () => {
    const srv = await startServer();
    const fail = setTimeout(() => { console.error('Zaman aşımı'); srv.kill(); process.exit(1); }, 60_000);
    try {
        const guest = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
        assert.strictEqual((await emit(guest, 'admin:tasks')).success, false, 'admin olmayan görevleri göremez');

        const admin = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true, auth: { adminToken: TOKEN } });
        const created = await emit(admin, 'admin:taskCreate', { title: 'Sohbet kutusu küçülsün', body: '- yazı boyu 11px\n- kutu sağ altta' });
        assert.ok(created.success, `görev açılmalı: ${created.error}`);
        const id = created.task.id;
        assert.strictEqual(created.task.status, 'new');
        assert.strictEqual((await emit(admin, 'admin:taskCreate', { title: '  ' })).success, false, 'başlıksız görev açılmaz');
        assert.strictEqual((await emit(admin, 'admin:taskAction', { id, action: 'approve' })).success, false, 'teste hazır olmayan görev onaylanmaz');

        // Claude aracı
        assert.match(tasksCli('list'), new RegExp(`#${id} .*Yeni.*Sohbet kutusu`), 'araç açık görevi listeler');
        tasksCli('start', String(id), 'başladım');
        tasksCli('ready', String(id), '--scenario', 'chat-test', '--branch', 'task/1-chat', 'staging\'de dene');

        let r = await emit(admin, 'admin:task', { id });
        assert.strictEqual(r.task.status, 'ready');
        assert.deepStrictEqual(r.task.scenario_ids, ['chat-test']);
        assert.strictEqual(r.task.branch, 'task/1-chat');
        assert.strictEqual(r.notes.length, 2, 'durum notları');

        // Kullanıcı: revize (ekran görüntüsüyle), resim dışı ek reddedilir, boş revize reddedilir
        assert.strictEqual((await emit(admin, 'admin:taskAction', { id, action: 'revise', body: '' })).success, false, 'boş revize olmaz');
        assert.strictEqual((await emit(admin, 'admin:taskAction', { id, action: 'revise', body: 'x', images: [{ name: 'a', dataUrl: 'data:text/html;base64,PGI+' }] })).success, false, 'resim dışı ek reddedilir');
        r = await emit(admin, 'admin:taskAction', { id, action: 'revise', body: 'yazı hâlâ büyük', images: [{ name: 'ekran.png', dataUrl: PNG }] });
        assert.ok(r.success, r.error);
        assert.strictEqual(r.task.status, 'revision');
        assert.strictEqual(r.attachments.length, 1);
        const att = await emit(admin, 'admin:taskAttachment', { id: r.attachments[0].id });
        assert.strictEqual(att.dataUrl, PNG, 'ek aynen geri gelir');

        // Araç revizeyi ve eki görür, eki dosyaya yazar
        const shown = tasksCli('show', String(id));
        assert.match(shown, /REVİZE\] yazı hâlâ büyük/);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-att-'));
        const files = tasksCli('attachments', String(id), dir).trim().split('\n');
        assert.strictEqual(fs.readFileSync(files[0]).length, Buffer.from(PNG.split(',')[1], 'base64').length);

        // Revizeden sonra Claude yeniden teste hazırlar → onay → araç "canlıda" yazar → açık listede görünmez
        tasksCli('ready', String(id), 'düzelttim');
        r = await emit(admin, 'admin:taskAction', { id, action: 'approve', body: 'tamam' });
        assert.strictEqual(r.task.status, 'approved');
        tasksCli('done', String(id), 'v1.200');
        assert.ok(!tasksCli('list').includes(`#${id} `), 'canlıya çıkan görev açık listede yok');
        assert.ok(tasksCli('list', '--all').includes(`#${id} `));

        guest.close(); admin.close();
        console.log('e2e-tasks: görev açma, araçla geliştiriliyor / teste hazır, revize (ekran görüntüsü), onay, canlıda; admin kapısı ✓');
    } finally {
        clearTimeout(fail);
        srv.kill();
    }
})().catch(e => { console.error(e); process.exit(1); });
