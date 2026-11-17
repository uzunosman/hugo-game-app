// Test scenario: hazır bir masa durumu (eller, gösterge, yerdeki perler, atılan taşlar, sıra, sohbet) tanımdan kurulur.
// Yalnızca lab ortamında (staging / yerel) ve admin için. Tanımlar: hugo-server/scenarios/*.json
//
// Taş kodu: renk harfi + sayı → r=kırmızı, y=sarı, b=mavi, k=siyah; "j" = sahte okey. Örn. "r5", "k13", "j".
// Her taştan en fazla 2, sahte okeyden 2 adet. Tanımda geçmeyen taşlar karıştırılıp desteye konur.
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Game, GameStatus, SetKind, TableSet, TurnAction } from '../models/Game';
import { Room } from '../models/Room';
import { Tile, TileColor, TileStatus } from '../models/Tile';

export interface ScenarioSeat {
    name: string;
    bot?: boolean;      // true: yapay zekâ oynar; yoksa koltuk boş bekler (admin seat switcher ile geçer)
    hand?: string[];    // verilmezse rastgele 14 taş (sıradaki koltuk 'discard' ile başlıyorsa 15)
}
export interface Scenario {
    id?: string;
    title?: string;
    description?: string;    // test adımları: kullanıcıya gösterilir
    round?: number;          // el numarası (1, 5, 9 Hugo eli)
    indicator: string;       // gösterge
    seats: ScenarioSeat[];   // tam 4 koltuk; sıra = masadaki oturma sırası
    turn?: number;           // sıradaki koltuk (0-3)
    action?: 'draw' | 'discard';
    tableSets?: { owner: number; kind?: SetKind; tiles: string[] }[];
    discards?: { owner: number; tile: string }[]; // eskiden yeniye; sonuncusu yerden alınabilir
    deckTop?: string[];      // desteden ilk çekilecek taşlar (ilk eleman ilk çekilir)
    chat?: { seat: number; text: string }[];
    timer?: boolean;         // true: sıra süresi işler (varsayılan: kapalı, kimse otomatik oynamaz)
}

const COLORS: Record<string, TileColor> = { r: TileColor.RED, y: TileColor.YELLOW, b: TileColor.BLUE, k: TileColor.BLACK };

export const scenariosDir = () => path.join(__dirname, '..', '..', 'scenarios');

export const listScenarios = (): Scenario[] =>
    fs.readdirSync(scenariosDir()).filter(f => f.endsWith('.json')).sort().map(f => ({
        id: f.replace(/\.json$/, ''),
        ...(JSON.parse(fs.readFileSync(path.join(scenariosDir(), f), 'utf8')) as Scenario),
    }));

export const findScenario = (id: string): Scenario | undefined => listScenarios().find(s => s.id === id);

// Bütün taşlardan (106) tanımdaki taşları birer birer çeker; aynı taş üçüncü kez istenirse hata
class TilePool {
    constructor(public tiles: Tile[]) {}
    take(code: string): Tile {
        const c = String(code).trim().toLowerCase();
        const joker = c === 'j';
        const color = COLORS[c[0]];
        const value = Number(c.slice(1));
        if (!joker && (!color || !Number.isInteger(value) || value < 1 || value > 13)) throw new Error(`Geçersiz taş kodu: "${code}"`);
        const i = this.tiles.findIndex(t => (joker ? t.isJoker : !t.isJoker && t.color === color && t.value === value));
        if (i === -1) throw new Error(`"${code}" taşından ikiden fazla kullanılmış`);
        return this.tiles.splice(i, 1)[0];
    }
}

// Odadaki oyunu tanıma göre yeniden kurar (yükleme ve "sıfırla" aynı yoldan)
export const applyScenario = (room: Room, s: Scenario): Game => {
    if (!Array.isArray(s.seats) || s.seats.length !== 4) throw new Error('Senaryoda tam 4 koltuk olmalı');
    if (room.players.length !== 4) throw new Error('Masada 4 oyuncu olmalı');

    room.players.forEach(p => p.resetForNewGame());
    const game = new Game(room.players); // rastgele dağıtır; aşağıda bütün taşlar toplanıp tanıma göre yeniden dağıtılır
    const all = [...game.deck, ...room.players.flatMap(p => p.tiles), ...(game.indicatorTile ? [game.indicatorTile] : [])];
    room.players.forEach(p => p.clearTiles());
    const pool = new TilePool([...all]);
    all.forEach(t => { t.setStatus(TileStatus.IN_DECK); t.setVisible(false); });

    game.round = s.round ?? 2;
    game.indicatorTile = pool.take(s.indicator);
    game.indicatorTile.setStatus(TileStatus.INDICATOR);
    game.indicatorTile.setVisible(true);

    s.seats.forEach((seat, i) => {
        const p = room.players[i];
        p.name = String(seat.name || p.name).slice(0, 20);
        (seat.hand || []).forEach(code => p.addTile(pool.take(code)));
    });

    game.tableSets = (s.tableSets || []).map(set => {
        const owner = room.players[set.owner];
        if (!owner) throw new Error(`Per sahibi koltuk yok: ${set.owner}`);
        const tiles = set.tiles.map(code => pool.take(code));
        tiles.forEach(t => { t.setStatus(TileStatus.IN_SET); t.setVisible(true); });
        const ts: TableSet = { id: uuidv4(), playerId: owner.id, tiles, value: 0, ...(set.kind === 'cift' && { kind: 'cift' as SetKind }) };
        return ts;
    });

    game.discardPile = [];
    game.discardOwners = [];
    (s.discards || []).forEach(d => {
        const t = pool.take(d.tile);
        t.setStatus(TileStatus.DISCARDED);
        t.setVisible(true);
        game.discardPile.push(t);
        game.discardOwners.push(room.players[d.owner]?.id ?? null);
    });
    game.lastDiscardPlayerId = game.discardOwners[game.discardOwners.length - 1] ?? null;

    // Okey: Hugo elinde yok (sahte okeyler okey yerine geçer); diğer ellerde göstergenin bir üstü
    const ind = game.indicatorTile;
    const okeyValue = typeof ind.value === 'number' ? (ind.value % 13) + 1 : 0;
    game.okeyTile = game.isHugoRound() ? null
        : all.find(t => !t.isJoker && t.color === ind.color && t.value === okeyValue) ?? null;

    // Per değerleri okey belli olduktan sonra hesaplanır; açmış oyuncular buna göre işaretlenir
    game.tableSets.forEach(set => {
        set.value = game.validateGroup(set.tiles, set.kind || 'seri');
        if (!set.value) throw new Error(`Geçersiz per: ${set.tiles.map(t => (t.isJoker ? 'j' : `${t.color} ${t.value}`)).join(', ')}`);
    });
    room.players.forEach(p => {
        const own = game.tableSets.filter(set => set.playerId === p.id);
        if (!own.length) return;
        const total = own.reduce((sum, set) => sum + set.value, 0);
        p.isOpen = true;
        p.openedWithPairs = own.every(set => set.kind === 'cift');
        p.openedAtTurn = -1; // elden bitme sayılmaz
        p.lastOpenedValue = total;
        p.openedTotal = total;
        p.openingScore = total;
    });

    // Deste: önce rastgele, istenen taşlar en üste (pop ile çekilir: dizinin sonu ilk çekilir)
    const turn = s.turn ?? 0;
    const top = (s.deckTop || []).map(code => pool.take(code));
    const rest = pool.tiles;
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    s.seats.forEach((seat, i) => {
        if (seat.hand) return;
        const n = 14 + (i === turn && s.action === 'discard' ? 1 : 0);
        rest.splice(0, n).forEach(t => room.players[i].addTile(t));
    });
    game.deck = [...rest, ...top.reverse()];

    game.currentPlayerIndex = turn;
    game.firstPlayerIndex = turn;
    room.players.forEach((p, i) => p.setTurn(i === turn));
    game.turnAction = s.action === 'discard' ? TurnAction.DISCARD : TurnAction.DRAW;
    game.status = GameStatus.STARTED;
    game.roundPenalties = [];
    game.roundHistory = [];
    room.game = game;
    return game;
};
