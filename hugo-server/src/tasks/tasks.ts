// Görevler (Faz 4): admin ekranı (kullanıcı) ve tasks aracı (Claude, scripts: src/tools/tasks.ts) aynı fonksiyonları kullanır.
// Veriler prod veritabanında (hugo_prod); veritabanı yoksa (yerel / test) görevler kapalıdır.
import { pool } from '../db/db';

export const TASK_STATUSES = ['new', 'in_progress', 'ready', 'revision', 'approved', 'done', 'cancelled'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
export type Author = 'user' | 'claude';

// Kullanıcı eylemleri ve vardıkları durum (not durum değiştirmez)
const USER_ACTIONS: Record<string, { kind: string; status?: TaskStatus }> = {
    note: { kind: 'note' },
    revise: { kind: 'revision', status: 'revision' },
    approve: { kind: 'approval', status: 'approved' },
    cancel: { kind: 'cancel', status: 'cancelled' },
    reopen: { kind: 'status', status: 'new' },
};

const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 1_500_000;

const db = () => {
    if (!pool) throw new Error('Görevler için veritabanı gerekli');
    return pool;
};
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export const listTasks = async (includeClosed = false) => (await db().query(
    `SELECT t.id, t.title, t.status, t.branch, t.scenario_ids, t.created_at, t.updated_at,
            (SELECT count(*)::int FROM task_notes n WHERE n.task_id = t.id) AS notes
     FROM tasks t ${includeClosed ? '' : "WHERE t.status NOT IN ('done', 'cancelled')"}
     ORDER BY CASE t.status WHEN 'ready' THEN 0 WHEN 'revision' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'new' THEN 3 WHEN 'approved' THEN 4 ELSE 5 END, t.updated_at DESC
     LIMIT 200`)).rows;

export const getTask = async (id: number) => {
    const task = (await db().query('SELECT * FROM tasks WHERE id = $1', [id])).rows[0];
    if (!task) throw new Error('Görev yok');
    const notes = (await db().query('SELECT id, author, kind, body, created_at FROM task_notes WHERE task_id = $1 ORDER BY id', [id])).rows;
    const attachments = (await db().query('SELECT id, note_id, name, mime, octet_length(data) AS size, created_at FROM task_attachments WHERE task_id = $1 ORDER BY id', [id])).rows;
    return { task, notes, attachments };
};

export const createTask = async (title: unknown, body: unknown) => {
    const t = text(title, 200);
    if (!t) throw new Error('Başlık gerekli');
    return (await db().query('INSERT INTO tasks (title, body) VALUES ($1, $2) RETURNING *', [t, text(body, 20_000)])).rows[0];
};

export const updateTask = async (id: number, fields: { title?: unknown; body?: unknown }) => {
    const t = fields.title !== undefined ? text(fields.title, 200) : undefined;
    if (t === '') throw new Error('Başlık boş olamaz');
    const r = await db().query(`UPDATE tasks SET title = COALESCE($2, title), body = COALESCE($3, body), updated_at = now() WHERE id = $1 RETURNING *`,
        [id, t ?? null, fields.body !== undefined ? text(fields.body, 20_000) : null]);
    if (!r.rowCount) throw new Error('Görev yok');
    return r.rows[0];
};

// Ekran görüntüsü: "data:image/png;base64,..." (yalnızca resim, boyut sınırlı)
const parseImage = (dataUrl: unknown) => {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
    if (!m) throw new Error('Yalnızca PNG, JPEG ya da WebP resim eklenebilir');
    const data = Buffer.from(m[2], 'base64');
    if (data.length > MAX_ATTACHMENT_BYTES) throw new Error('Resim çok büyük (en çok 1,5 MB)');
    return { mime: m[1], data };
};

// Not ekle (kullanıcı eylemi ya da Claude notu); durum değişirse görev güncellenir. Tek transaction.
export const addNote = async (id: number, author: Author, kind: string, body: unknown, status?: TaskStatus,
    images: { name?: unknown; dataUrl: unknown }[] = [], extra: { branch?: string; scenarioIds?: string[] } = {}) => {
    if (images.length > MAX_ATTACHMENTS) throw new Error(`En çok ${MAX_ATTACHMENTS} resim eklenebilir`);
    const parsed = images.map(im => ({ name: text(im.name, 120), ...parseImage(im.dataUrl) }));
    const client = await db().connect();
    try {
        await client.query('BEGIN');
        const exists = await client.query('SELECT 1 FROM tasks WHERE id = $1 FOR UPDATE', [id]);
        if (!exists.rowCount) throw new Error('Görev yok');
        const note = (await client.query('INSERT INTO task_notes (task_id, author, kind, body) VALUES ($1, $2, $3, $4) RETURNING id',
            [id, author, kind, text(body, 20_000)])).rows[0];
        for (const im of parsed) {
            await client.query('INSERT INTO task_attachments (task_id, note_id, name, mime, data) VALUES ($1, $2, $3, $4, $5)', [id, note.id, im.name, im.mime, im.data]);
        }
        await client.query(`UPDATE tasks SET status = COALESCE($2, status), branch = COALESCE($3, branch),
            scenario_ids = COALESCE($4, scenario_ids), updated_at = now() WHERE id = $1`,
            [id, status ?? null, extra.branch ?? null, extra.scenarioIds ?? null]);
        await client.query('COMMIT');
        return note.id as number;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const userAction = async (id: number, action: string, body: unknown, images?: { name?: unknown; dataUrl: unknown }[]) => {
    const a = USER_ACTIONS[action];
    if (!a) throw new Error('Bilinmeyen işlem');
    if (action === 'revise' && !text(body, 20_000) && !images?.length) throw new Error('Revize için ne değişmeli, yaz');
    // Onay ve revize yalnızca test edilebilir (Teste hazır) görevde: yanlışlıkla onaylanmasın
    if (action === 'approve' || action === 'revise') {
        const row = (await db().query('SELECT status FROM tasks WHERE id = $1', [id])).rows[0];
        if (!row) throw new Error('Görev yok');
        if (row.status !== 'ready') throw new Error('Yalnızca "Teste hazır" görev onaylanır ya da revizeye gönderilir');
    }
    return addNote(id, 'user', a.kind, body, a.status, images || []);
};

export const getAttachment = async (id: number) => {
    const row = (await db().query('SELECT mime, data FROM task_attachments WHERE id = $1', [id])).rows[0];
    if (!row) throw new Error('Ek yok');
    return { mime: row.mime as string, data: row.data as Buffer };
};
