// Oyun durumunu diske yazar ve sunucu açılışında geri yükler (sunucu yeniden başlasa da masalar sürer).
// shortcut: tek JSON dosyası, tek sunucu süreci için; birden fazla süreç ya da yoğun trafik olursa Redis/Postgres'e geçilmeli
import fs from 'fs';
import path from 'path';
import { GameManager } from './GameManager';
import { Player } from '../models/Player';
import { Room } from '../models/Room';
import { Game, TableSet } from '../models/Game';
import { Tile } from '../models/Tile';

const VERSION = 1;

export const stateFile = () =>
    process.env.STATE_FILE || path.join(__dirname, '..', '..', 'data', 'state.json');

type Plain = Record<string, any>;

// Oyuncular bir kez yazılır; oda ve oyun yalnızca oyuncu kimliklerini tutar
export const serialize = (gm: GameManager): string => JSON.stringify({
    version: VERSION,
    savedAt: new Date().toISOString(),
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

export const deserialize = (json: string): { players: Player[]; rooms: Room[] } => {
    const data = JSON.parse(json);
    if (data.version !== VERSION) throw new Error(`Bilinmeyen durum sürümü: ${data.version}`);

    const players: Player[] = data.players.map((o: Plain) =>
        Object.assign(Object.create(Player.prototype), o, { tiles: tiles(o.tiles), socketId: o.isBot ? o.socketId : '', connected: !!o.isBot })
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

    return { players, rooms };
};

export const loadState = (gm: GameManager): boolean => {
    const file = stateFile();
    if (!fs.existsSync(file)) return false;
    try {
        const { players, rooms } = deserialize(fs.readFileSync(file, 'utf8'));
        gm.restore(players, rooms);
        console.log(`Kayıtlı durum yüklendi: ${rooms.length} masa, ${players.length} oyuncu`);
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
};

// Yazma: önce geçici dosyaya, sonra yerine taşı (yarım dosya kalmaz)
export const saveState = (gm: GameManager): void => {
    const file = stateFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, serialize(gm));
    fs.renameSync(tmp, file);
};
