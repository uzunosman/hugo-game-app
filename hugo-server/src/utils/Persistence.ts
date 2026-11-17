// Oyun durumunu diske yazar ve sunucu açılışında geri yükler (sunucu yeniden başlasa da masalar sürer).
// DATABASE_URL varsa asıl kayıt Postgres'te (app_state); dosya geçiş haftası boyunca yedek olarak yazılmaya devam eder.
import fs from 'fs';
import path from 'path';
import { GameManager } from './GameManager';
import { Player } from '../models/Player';
import { Room } from '../models/Room';
import { Game, TableSet } from '../models/Game';
import { Tile } from '../models/Tile';
import { pool } from '../db/db';

const VERSION = 1;

export const stateFile = () =>
    process.env.STATE_FILE || path.join(__dirname, '..', '..', 'data', 'state.json');

type Plain = Record<string, any>;

// Oyuncular bir kez yazılır; oda ve oyun yalnızca oyuncu kimliklerini tutar
export const serialize = (gm: GameManager): string => JSON.stringify({
    version: VERSION,
    savedAt: new Date().toISOString(),
    nextTableNo: gm.nextTableNo,
    players: gm.getAllPlayers().map(p => ({ ...p })),
    rooms: gm.getAllRooms().map(r => ({
        ...r,
        owner: undefined,
        ownerId: r.owner.id,
        players: undefined,
        playerIds: r.players.map(p => p.id),
        game: r.game ? { ...r.game, players: undefined, playerIds: r.game.players.map(p => p.id) } : null,
    })),
});

const tile = (o: Plain | null): Tile | null => (o ? Object.assign(Object.create(Tile.prototype), o) : null);
const tiles = (list: Plain[] = []): Tile[] => list.map(o => tile(o) as Tile);

export const deserialize = (json: string): { players: Player[]; rooms: Room[]; nextTableNo: number } => {
    const data = JSON.parse(json);
    if (data.version !== VERSION) throw new Error(`Bilinmeyen durum sürümü: ${data.version}`);

    const players: Player[] = data.players.map((o: Plain) =>
        Object.assign(Object.create(Player.prototype), o, {
            tiles: tiles(o.tiles), socketId: o.isBot ? o.socketId : '', connected: !!o.isBot,
            // legacyAuth alanı olmadan kaydedilmiş anahtar, geçiş sürümünde eski istemciye verilmiş olabilir
            legacyAuth: o.legacyAuth ?? !!o.authToken,
        })
    );
    const byId = new Map(players.map(p => [p.id, p]));
    const pick = (id: string) => {
        const p = byId.get(id);
        if (!p) throw new Error(`Durum dosyasında oyuncu eksik: ${id}`);
        return p;
    };

    const rooms: Room[] = data.rooms.map((r: Plain) => {
        const { ownerId, playerIds, game: g, ...rest } = r;
        const game: Game | null = g ? Object.assign(Object.create(Game.prototype), g, {
            players: g.playerIds.map(pick),
            deck: tiles(g.deck),
            discardPile: tiles(g.discardPile),
            indicatorTile: tile(g.indicatorTile),
            okeyTile: tile(g.okeyTile),
            tableSets: (g.tableSets || []).map((s: TableSet) => ({ ...s, tiles: tiles(s.tiles) })),
        }) : null;
        if (game) delete (game as Plain).playerIds;
        return Object.assign(Object.create(Room.prototype), { lastActivityAt: Date.now(), finishedAt: null }, rest, {
            owner: pick(ownerId),
            players: playerIds.map(pick),
            game,
        });
    });

    return { players, rooms, nextTableNo: data.nextTableNo || 0 };
};

const restore = (gm: GameManager, json: string, from: string) => {
    const { players, rooms, nextTableNo } = deserialize(json);
    gm.restore(players, rooms, nextTableNo);
    console.log(`Kayıtlı durum yüklendi (${from}): ${rooms.length} masa, ${players.length} oyuncu`);
};

// Veritabanı varsa oradan; veritabanı boşsa (ilk geçiş) ya da yoksa dosyadan
export const loadState = async (gm: GameManager): Promise<boolean> => {
    if (pool) {
        const row = (await pool.query('SELECT data FROM app_state WHERE id = 1')).rows[0];
        if (row) {
            restore(gm, JSON.stringify(row.data), 'veritabanı');
            return true;
        }
    }
    return loadStateFile(gm);
};

const loadStateFile = (gm: GameManager): boolean => {
    const file = stateFile();
    if (!fs.existsSync(file)) return false;
    try {
        restore(gm, fs.readFileSync(file, 'utf8'), 'dosya');
        return true;
    } catch (error) {
        // Bozuk dosya sunucuyu düşürmesin; incelemek için kenara alınır
        const broken = `${file}.bozuk-${Date.now()}`;
        fs.renameSync(file, broken);
        console.error(`Kayıtlı durum okunamadı, ${broken} olarak ayrıldı:`, error);
        return false;
    }
};

// Kapatılan masalar ana ekrandan kalkar, özetleri durum dosyasının yanındaki archive.jsonl'a satır satır eklenir
export const archiveFile = () => path.join(path.dirname(stateFile()), 'archive.jsonl');
export const appendArchive = (entry: Plain): void => {
    fs.mkdirSync(path.dirname(archiveFile()), { recursive: true });
    fs.appendFileSync(archiveFile(), JSON.stringify(entry) + '\n');
    pool?.query(insertArchive, archiveParams(entry)).catch(error => console.error('Arşiv veritabanına yazılamadı:', error.message));
};
export const insertArchive = `INSERT INTO archived_rooms (id, table_no, name, reason, archived_at, data)
    VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`;
export const archiveParams = (e: Plain) => [e.id, e.no || null, e.name, e.reason, e.archivedAt, e];

// Yazma: önce geçici dosyaya, sonra yerine taşı (yarım dosya kalmaz)
// Veritabanı yazımları sıraya girer: yavaş bir yazım yenisini ezmez, en son durum en son yazılır
let dbWrite: Promise<void> = Promise.resolve();
export const saveState = (gm: GameManager): Promise<void> => {
    const json = serialize(gm);
    const file = stateFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, file);
    if (!pool) return Promise.resolve();
    const humans = gm.getAllPlayers().filter(p => !p.isBot && p.connected).map(p => ({ id: p.id, name: p.name }));
    dbWrite = dbWrite.then(async () => {
        try {
            await pool!.query(`INSERT INTO app_state (id, data, saved_at) VALUES (1, $1, now())
                ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, saved_at = now()`, [json]);
            // Bağlı gerçek oyuncular: last_seen_at güncellenir. shortcut: her kayıtta hepsi upsert edilir; yüzlerce eşzamanlı oyuncuda yalnızca değişenler yazılmalı
            await pool!.query(`INSERT INTO players (id, name) SELECT x->>'id', x->>'name' FROM jsonb_array_elements($1::jsonb) x
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, last_seen_at = now()`, [JSON.stringify(humans)]);
        } catch (error) {
            console.error('Durum veritabanına yazılamadı:', (error as Error).message);
        }
    });
    return dbWrite;
};
