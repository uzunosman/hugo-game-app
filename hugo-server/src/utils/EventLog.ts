// Oyun kaydı: girişler, istekler ve masadaki her olay günlük dosyalara satır satır (JSON) yazılır:
// <durum dosyasının klasörü>/events/YYYY-MM-DD.jsonl (Türkiye saatine göre gün). Günlük istatistik: src/tools/stats.ts
// shortcut: eski dosyalar silinmez / sıkıştırılmaz (günde ~50 MB'tan az); disk dolmaya başlarsa logrotate ya da gzip eklenmeli
import fs from 'fs';
import path from 'path';
import { config } from '../config/config';
import { stateFile } from './Persistence';
import type { Game } from '../models/Game';
import type { Tile } from '../models/Tile';

export const eventsDir = () => process.env.EVENTS_DIR || path.join(path.dirname(stateFile()), 'events');
export const dayOf = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

let dirReady = false;
export const logEvent = (ev: string, data: Record<string, unknown>): void => {
    if (!config.persist) return;
    try {
        if (!dirReady) { fs.mkdirSync(eventsDir(), { recursive: true }); dirReady = true; }
        const now = new Date();
        fs.appendFileSync(path.join(eventsDir(), `${dayOf(now)}.jsonl`), JSON.stringify({ t: now.toISOString(), ev, ...data }) + '\n');
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
    okey: tileLabel(game.okeyTile),
    eller: Object.fromEntries(game.players.map(p => [p.name, p.tiles.map(tileLabel)])),
    deste: game.deck.map(tileLabel),
});
