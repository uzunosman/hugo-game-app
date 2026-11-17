// Oyun kaydı: girişler, istekler ve masadaki her olay günlük dosyalara satır satır (JSON) yazılır:
// <durum dosyasının klasörü>/events/YYYY-MM-DD.jsonl (Türkiye saatine göre gün). Günlük istatistik: src/tools/stats.ts
// shortcut: eski dosyalar silinmez / sıkıştırılmaz (günde ~50 MB'tan az); disk dolmaya başlarsa logrotate ya da gzip eklenmeli
import fs from 'fs';
import path from 'path';
import { config } from '../config/config';
import { stateFile } from './Persistence';
import { pool } from '../db/db';
import type { Game } from '../models/Game';
import type { Tile } from '../models/Tile';

export const eventsDir = () => process.env.EVENTS_DIR || path.join(path.dirname(stateFile()), 'events');
export const dayOf = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

// Masaların son olayları bellekte de tutulur: yönetim ekranındaki canlı izleme dosyayı okumadan anında görür
const RECENT_PER_TABLE = 400;
const recent = new Map<number, Record<string, unknown>[]>();
export const recentTableEvents = (no: number) => recent.get(no);

// Veritabanına satır satır değil, 1 saniyelik toplu INSERT ile yazılır
let queue: { at: string; type: string; table_no: number | null; data: Record<string, unknown> }[] = [];
let flushTimer: NodeJS.Timeout | null = null;
export const flushEvents = async (): Promise<void> => {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!pool || !queue.length) return;
    const batch = queue; queue = [];
    try {
        await pool.query(`INSERT INTO events (at, type, table_no, data)
            SELECT (x->>'at')::timestamptz, x->>'type', (x->>'table_no')::int, x->'data' FROM jsonb_array_elements($1::jsonb) x`, [JSON.stringify(batch)]);
    } catch (error) {
        console.error(`Olay kaydı veritabanına yazılamadı (${batch.length} satır):`, (error as Error).message);
    }
};

let dirReady = false;
export const logEvent = (ev: string, data: Record<string, unknown>): void => {
    if (!config.persist) return;
    try {
        const now = new Date();
        const entry = { t: now.toISOString(), ev, ...data };
        if (typeof data.masa === 'number') {
            const list = recent.get(data.masa) || [];
            list.push(entry);
            if (list.length > RECENT_PER_TABLE) list.shift();
            recent.delete(data.masa); recent.set(data.masa, list); // en son oynanan masa sona
            if (recent.size > 300) recent.delete(recent.keys().next().value!);
        }
        if (pool) {
            queue.push({ at: entry.t, type: ev, table_no: typeof data.masa === 'number' ? data.masa : null, data });
            if (!flushTimer) flushTimer = setTimeout(flushEvents, 1000);
        }
        // shortcut: geçiş haftası boyunca dosyaya da yazılır (geri dönüş yolu); Postgres oturunca bu satırlar kalkmalı
        if (!dirReady) { fs.mkdirSync(eventsDir(), { recursive: true }); dirReady = true; }
        fs.appendFileSync(path.join(eventsDir(), `${dayOf(now)}.jsonl`), JSON.stringify(entry) + '\n');
    } catch (error) {
        console.error('Olay kaydı yazılamadı:', error);
    }
};

// Taşın okunur adı: "kırmızı 5", "sahte okey"
export const tileLabel = (t?: Pick<Tile, 'color' | 'value' | 'isJoker'> | null) =>
    !t ? null : t.isJoker ? 'sahte okey' : `${t.color} ${t.value}`;

// Oyundaki taşı kimliğinden bulur (eller, deste, yer, masadaki perler)
export const findTile = (game: Game | null | undefined, id: string) => {
    if (!game || !id) return undefined;
    for (const p of game.players) { const t = p.tiles.find(x => x.id === id); if (t) return t; }
    return game.deck.find(x => x.id === id) || game.discardPile.find(x => x.id === id)
        || game.tableSets.flatMap(s => s.tiles).find(x => x.id === id);
};

// El başı: eller, gösterge, okey ve deste sırası (desteden çekilen taşlar buradan izlenebilir)
export const dealSnapshot = (game: Game) => ({
    gosterge: tileLabel(game.indicatorTile),
    okey: tileLabel(game.okeyTile) ?? 'sahte okey', // Hugo elinde okey yok: sahte okeyler okey yerine geçer
    eller: Object.fromEntries(game.players.map(p => [p.name, p.tiles.map(tileLabel)])),
    deste: game.deck.map(tileLabel),
});
