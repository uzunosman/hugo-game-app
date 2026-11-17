// İlk geçiş: veritabanı boşsa dosyalardaki arşiv (archive.jsonl) ve oyun kaydı (events/*.jsonl) bir kez aktarılır.
// Oyun durumu (state.json) ayrıca aktarılmaz: loadState dosyadan yükler, ilk kayıtta veritabanına yazılır.
import fs from 'fs';
import path from 'path';
import { pool } from './db';
import { archiveFile, archiveParams, insertArchive } from '../utils/Persistence';
import { eventsDir } from '../utils/EventLog';

const lines = (file: string) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });

export const importFiles = async (): Promise<void> => {
    if (!pool) return;
    const empty = async (table: string) => !(await pool!.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount;

    if (fs.existsSync(archiveFile()) && await empty('archived_rooms')) {
        const entries = lines(archiveFile());
        for (const e of entries) await pool.query(insertArchive, archiveParams(e));
        console.log(`Arşiv veritabanına aktarıldı: ${entries.length} masa`);
    }

    if (fs.existsSync(eventsDir()) && await empty('events')) {
        let total = 0;
        for (const f of fs.readdirSync(eventsDir()).filter(f => f.endsWith('.jsonl')).sort()) {
            const rows = lines(path.join(eventsDir(), f)).map(({ t, ev, ...data }) =>
                ({ at: t, type: ev, table_no: typeof data.masa === 'number' ? data.masa : null, data }));
            for (let i = 0; i < rows.length; i += 2000) {
                await pool.query(`INSERT INTO events (at, type, table_no, data)
                    SELECT (x->>'at')::timestamptz, x->>'type', (x->>'table_no')::int, x->'data' FROM jsonb_array_elements($1::jsonb) x`,
                    [JSON.stringify(rows.slice(i, i + 2000))]);
            }
            total += rows.length;
        }
        console.log(`Oyun kaydı veritabanına aktarıldı: ${total} olay`);
    }
};
