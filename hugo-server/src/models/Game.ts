import { v4 as uuidv4 } from 'uuid';
import { Player } from './Player';
import { planSets } from '../ai/AiPlanner';
import { Tile, TileColor, TileStatus } from './Tile';
import { config } from '../config/config';

export enum GameStatus {
    WAITING = 'waiting',
    STARTED = 'started',
    ROUND_ENDED = 'round_ended',
    FINISHED = 'finished'
}

export interface RoundResult {
    playerId: string;
    playerName: string;
    isFinisher: boolean;
    handScore: number;           // raw hand tile sum (before joker mult)
    effectiveHandScore: number;  // handScore * jokerMult
    penaltyScore: number;        // accumulated penalty (not affected by jokerMult)
    openBonus: number;           // 0 for now, reserved
    finishBonus: number;         // 0 for now, reserved
    rawTotal: number;            // effectiveHandScore + penaltyScore + openBonus + finishBonus
    roundTotal: number;          // rawTotal * hugoMult
    multiplier: number;          // hugoMult * jokerMult (1, 2 or 4)
    isHugoRound: boolean;
    finishedWithJoker: boolean;
    stars: number;              // yıldız sayısı (her biri roundTotal'den 100 düşer)
    unusedOkeyPenalty: number;  // eli açmış oyuncunun elinde kalan her okey için 100
    finishedWithPairs: boolean; // bitiren çiftle açmıştı (özel durum ×2)
    finishedElden: boolean;     // bitiren aynı sırada açıp bitirdi (özel durum ×2)
    penaltyEntries: number[];   // o elde yazılan cezalar (UI dökümü için)
    isOpen: boolean;            // el sonunda yere açmış mıydı (açmadıysa elde kalan yerine sabit ceza)
    totalScore: number;         // bu el dahil toplam puan
}

// Sahte okeyin oynandığı hâli (doğrulamada kullanılan geçici kopya)
type SahteTile = Tile & { sahte?: boolean };

export interface Penalty {
    playerId: string;
    amount: number;   // iptalde negatif
    reason: string;
    tag: string;      // log etiketi: işlek, yerden, işleme, çift işleme, okey, iptal
    tile?: string;    // kısa taş bilgisi, örn. "kırmızı 7"
}

export interface RoundHistoryEntry {
    round: number;
    isHugoRound: boolean;
    results: RoundResult[];
    penalties: (Penalty & { playerName: string })[];
}

// Sıra içi geri alma: masaya ilk oynamadan önceki durum (yalnızca id'ler, kalıcılığa uygun)
export interface TurnSnapshot {
    playerId: string;
    hand: string[];
    sets: { id: string; playerId: string; kind?: SetKind; value: number; tileIds: string[] }[];
    open: { isOpen: boolean; openedWithPairs: boolean; openedAtTurn: number; lastOpenedValue: number; openedTotal: number; openingScore: number };
    turnAction: TurnAction;
    okeyPlayedThisTurn: boolean;
    penalties: Penalty[]; // bu sırada başkalarına yazılan işleme cezaları
}

const COLOR_TR: Record<string, string> = { red: 'kırmızı', blue: 'mavi', black: 'siyah', yellow: 'sarı', purple: 'sahte okey' };
export const tileLabel = (t: Tile): string => t.isJoker ? 'sahte okey' : `${COLOR_TR[t.color] ?? t.color} ${t.value}`;

export interface DiscardResult {
    tile: Tile | null;
    penalties: Penalty[];
    error?: string;
}

export enum TurnAction {
    DRAW = 'draw',
    DISCARD = 'discard'
}

export type SetKind = 'seri' | 'cift';

export interface TableSet {
    id: string;
    playerId: string;
    tiles: Tile[];
    value: number;
    kind?: SetKind; // 'cift': iki aynı taş; yoksa seri/aynı sayı peri
}

export class Game {
    id: string;
    players: Player[];
    deck: Tile[];
    discardPile: Tile[];
    discardOwners: (string | null)[]; // discardPile ile aynı sırada: taşı atan oyuncu (köşe geçmişi için)
    currentPlayerIndex: number;
    firstPlayerIndex: number;
    status: GameStatus;
    round: number;
    turnAction: TurnAction;
    indicatorTile: Tile | null;
    okeyTile: Tile | null;
    lastDiscardPlayerId: string | null;
    tableSets: TableSet[];
    okeyPlayedThisTurn: boolean;
    roundEndResults: RoundResult[] | null;
    finisherPlayerId: string | null;
    finishedWithJoker: boolean;
    takenDiscardTileId: string | null; // yandan alınan, bu turda kullanılması gereken taş
    takenPenalty: Penalty | null;      // yandan alınınca atana yazılan ceza (kusulursa geri alınır)
    roundPenalties: (Penalty & { playerName: string })[]; // bu elde yazılan cezalar (tabela geçmişi için)
    roundHistory: RoundHistoryEntry[]; // biten ellerin sonuçları ve cezaları
    returnedTileId: string | null;     // bu sırada kusulan taş: aynı sırada tekrar alınamaz
    lockedDiscardTileId: string | null; // işlek atılan taş: sıradaki oyuncu alamaz
    playedToTableThisTurn: boolean;    // bu sırada el açıldı / per indirildi / işlendi: kusmak yasak
    turnSnapshot: TurnSnapshot | null; // bu sıradaki ilk masaya oynamadan önceki durum (geri alma için)
    // Tek tek yere indirilen, henüz açılış eşiğine ulaşmamış perler (yalnızca sırası gelen oyuncu)
    pendingOpen: { playerId: string; kind: SetKind; total: number; setIds: string[] } | null;
    turnCounter: number;               // eldeki sıra sayacı (elden bitme için)
    finishedElden: boolean;            // son taşı atan, aynı sırada açmıştı
    createdAt: Date;
    lastActionTime: Date;

    constructor(players: Player[]) {
        this.id = uuidv4();
        this.players = [...players];
        this.deck = [];
        this.discardPile = [];
        this.discardOwners = [];
        this.currentPlayerIndex = 0;
        this.firstPlayerIndex = 0;
        this.status = GameStatus.WAITING;
        this.round = 1;
        this.turnAction = TurnAction.DRAW;
        this.indicatorTile = null;
        this.okeyTile = null;
        this.lastDiscardPlayerId = null;
        this.okeyPlayedThisTurn = false;
        this.roundEndResults = null;
        this.finisherPlayerId = null;
        this.finishedWithJoker = false;
        this.takenDiscardTileId = null;
        this.takenPenalty = null;
        this.roundPenalties = [];
        this.roundHistory = [];
        this.returnedTileId = null;
        this.lockedDiscardTileId = null;
        this.playedToTableThisTurn = false;
        this.turnSnapshot = null;
        this.pendingOpen = null;
        this.turnCounter = 0;
        this.finishedElden = false;
        this.tableSets = [];
        this.createdAt = new Date();
        this.lastActionTime = new Date();

        // Oyunu başlat
        this.initializeGame();
    }

    private initializeGame(): void {
        // Taşları oluştur
        this.createTiles();

        // Taşları karıştır
        this.shuffleDeck();

        // Gösterge taşını belirle
        this.determineIndicatorTile();

        // Taşları dağıt
        this.dealTiles();

        // İlk oyuncuyu belirle
        this.setFirstPlayer();

        // Oyunu başlat
        this.status = GameStatus.STARTED;
    }

    private createTiles(): void {
        const colors = [TileColor.RED, TileColor.YELLOW, TileColor.BLUE, TileColor.BLACK];

        // Her renk için 1-13 arası taşları oluştur (her sayıdan 2 adet)
        colors.forEach(color => {
            for (let value = 1; value <= 13; value++) {
                // Her sayıdan 2 adet oluştur
                this.deck.push(new Tile(color, value));
                this.deck.push(new Tile(color, value));
            }
        });

        // 2 adet joker taşı ekle (mor renkte ve "H" değerinde)
        this.deck.push(new Tile(TileColor.PURPLE, 'H', true));
        this.deck.push(new Tile(TileColor.PURPLE, 'H', true));
    }

    private shuffleDeck(): void {
        // Fisher-Yates algoritması ile taşları karıştır
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    private determineIndicatorTile(): void {
        // Gösterge taşını belirle (son taşı al)
        if (this.deck.length > 0) {
            const indicatorTile = this.deck.pop();
            if (indicatorTile) {
                indicatorTile.setStatus(TileStatus.INDICATOR);
                indicatorTile.setVisible(true);
                this.indicatorTile = indicatorTile;

                // Hugo turu mu kontrol et (1., 5. ve 9. turlar)
                if (this.isHugoRound()) {
                    // Hugo turlarında joker taşları okey olur
                    this.okeyTile = null; // Jokerler zaten okey olduğu için null
                } else {
                    // Normal turlarda gösterge taşının bir üstü okey olur
                    this.determineOkeyTile();
                }
            }
        }
    }

    private determineOkeyTile(): void {
        if (!this.indicatorTile || this.indicatorTile.isJoker) return;

        // Gösterge taşının bir üstü okey olur
        let okeyValue: number;

        // Eğer gösterge taşının değeri sayı ise
        if (typeof this.indicatorTile.value === 'number') {
            okeyValue = this.indicatorTile.value + 1;

            // Eğer gösterge 13 ise, okey 1 olur
            if (okeyValue > 13) {
                okeyValue = 1;
            }

            // Okey taşını bul (aynı renkte ve bir üst değerde)
            const okeyTile = this.deck.find(
                tile => tile.color === this.indicatorTile?.color && tile.value === okeyValue
            );

            if (okeyTile) {
                this.okeyTile = okeyTile;
            }
        }
    }

    private dealTiles(): void {
        // TEST_MODE: eli başlatana hazır açılış eli verilir (TEST_HAND ile seri ya da çift)
        if (config.testMode) {
            const starter = this.players[this.currentPlayerIndex];
            const wanted: [TileColor, number][] = config.testHand === 'cift'
                ? [[TileColor.RED, 13], [TileColor.RED, 13], [TileColor.BLUE, 12], [TileColor.BLUE, 12], [TileColor.BLACK, 1], [TileColor.BLACK, 1], [TileColor.YELLOW, 7], [TileColor.YELLOW, 7]]
                : [[TileColor.RED, 11], [TileColor.RED, 12], [TileColor.RED, 13], [TileColor.BLACK, 9], [TileColor.YELLOW, 9], [TileColor.BLUE, 9]];
            for (const [color, value] of wanted) {
                const i = this.deck.findIndex(t => t.color === color && t.value === value);
                if (i !== -1 && starter) starter.addTile(this.deck.splice(i, 1)[0]);
            }
        }

        // Eli başlatan oyuncuya 15 taş, diğerlerine 14 taş dağıt
        this.players.forEach((player, index) => {
            const tileCount = (index === this.currentPlayerIndex ? 15 : 14) - player.tiles.length;

            for (let i = 0; i < tileCount; i++) {
                if (this.deck.length > 0) {
                    const tile = this.deck.pop();
                    if (tile) {
                        player.addTile(tile);
                    }
                }
            }
        });
    }

    private setFirstPlayer(): void {
        // İlk oyuncuyu belirle ve sırasını ayarla
        if (this.players.length > 0) {
            this.currentPlayerIndex = 0;
            this.players[this.currentPlayerIndex].setTurn(true);
        }
    }

    drawTile(playerId: string, fromDiscard: boolean = false): Tile | null {
        // Oyuncunun sırası mı kontrol et
        const player = this.getPlayerById(playerId);
        if (!player || !this.isPlayerTurn(playerId) || this.turnAction !== TurnAction.DRAW) {
            return null;
        }

        // İlk oyuncunun ilk el kuralı: 15 taşı varken taş çekemez, direkt atar
        if (player.tiles.length === 15) {
            return null;
        }

        let drawnTile: Tile | undefined;
        this.takenPenalty = null;

        if (fromDiscard) {
            const top = this.discardPile[this.discardPile.length - 1];
            // İşlek atılan ya da bu sırada kusulan taş yerden alınamaz
            if (!top || top.id === this.lockedDiscardTileId || top.id === this.returnedTileId) return null;
            drawnTile = this.discardPile.pop();
            this.owners().pop();
            const discarder = this.lastDiscardPlayerId ? this.getPlayerById(this.lastDiscardPlayerId) : undefined;
            const value = drawnTile ? this.asPlayed(drawnTile).value : 0;
            const amount = (typeof value === 'number' ? value : 0) * 10; // Hugo elinde de × 10 yazılır, el sonunda Hugo × 2
            if (drawnTile && discarder && discarder.id !== playerId && amount > 0) {
                discarder.addPenalty(amount);
                this.takenPenalty = { playerId: discarder.id, amount, reason: 'Attığı taş yerden alındı', tag: 'yerden', tile: tileLabel(drawnTile) };
            }
        } else {
            // Desteden çek
            drawnTile = this.deck.pop();
        }

        if (drawnTile) {
            player.addTile(drawnTile);
            this.takenDiscardTileId = fromDiscard ? drawnTile.id : null;
            this.turnAction = TurnAction.DISCARD;
            this.lastActionTime = new Date();
            return drawnTile;
        }

        return null;
    }

    // Açmadan bitme: atılan taş dışında eldeki bütün taşlar verilen geçerli perlere tam bölünüyor mu
    private isClosedFinish(player: Player, tileId: string, sets: string[][]): boolean {
        const rest = player.tiles.filter(t => t.id !== tileId);
        const ids = sets.flat();
        if (ids.length !== rest.length || new Set(ids).size !== ids.length) return false;
        const byId = new Map(rest.map(t => [t.id, t]));
        return sets.every(set => set.every(id => byId.has(id)) && this.validateSetTiles(set.map(id => byId.get(id)!)) > 0);
    }

    discardTile(playerId: string, tileId: string, finishSets?: string[][]): DiscardResult {
        const player = this.getPlayerById(playerId);
        if (!player) return { tile: null, penalties: [], error: 'Oyuncu bulunamadı' };

        // İlk el: 15 taşı olan oyuncu çekmeden atar
        const isFirstTurn = player.tiles.length === 15 && this.turnAction === TurnAction.DRAW;
        if (!this.isPlayerTurn(playerId) || (this.turnAction !== TurnAction.DISCARD && !isFirstTurn)) {
            return { tile: null, penalties: [], error: 'Şu an taş atamazsın' };
        }

        const tile = player.tiles.find(t => t.id === tileId);
        if (!tile) return { tile: null, penalties: [], error: 'Taş elinde değil' };
        if (this.pendingOpen?.playerId === playerId) {
            const need = this.openingNeeded();
            return { tile: null, penalties: [], error: `Açılış yetersiz: yerde ${this.pendingOpen.total}, en az ${need} gerekli. Per ekle ya da geri al` };
        }

        // Eli açmamış oyuncu: kalan bütün taşlar per ise son taşı atıp yere açmadan biter (perler masaya inmez, işlenemez)
        const closedFinish = !!finishSets?.length && !player.isOpen;
        if (closedFinish && !this.isClosedFinish(player, tileId, finishSets!)) {
            return { tile: null, penalties: [], error: 'Kalan taşların hepsi geçerli per değil: açmadan bitemezsin' };
        }

        const penalties: Penalty[] = [];
        // Yandan alınan taş kullanılmalı; kullanılmadıysa yalnızca o taş 100 cezayla geri atılabilir
        const pendingTaken = this.pendingTakenTileId(player);
        if (pendingTaken && pendingTaken !== tileId && !closedFinish) {
            return { tile: null, penalties: [], error: 'Yandan aldığın taşı kullanmalısın (ya da 100 ceza ile geri at)' };
        }
        if (pendingTaken) {
            penalties.push({ playerId, amount: 100, reason: 'Yandan alınan taş kullanılmadı', tag: 'kullanılmadı', tile: tileLabel(tile) });
        } else if (player.tiles.length > 1 && !closedFinish) {
            // Eli bitiren son taş hariç: masadaki bir pere eklenebilecek taşı atmak 100 ceza (Hugo elinde 200)
            const islek = this.islekPenalty(tile);
            if (islek > 0) penalties.push({ playerId, amount: islek, reason: 'İşlenebilir taş atıldı', tag: 'işlek', tile: tileLabel(tile) });
        }
        penalties.forEach(p => player.addPenalty(p.amount));

        player.removeTile(tileId);
        if (closedFinish) [...player.tiles].forEach(t => player.removeTile(t.id));
        // Son taş: bitiren bu sırada açtıysa ya da hiç açmadan bitirdiyse "elden bitme"
        if (player.tiles.length === 0) {
            this.finishedElden = closedFinish || player.openedAtTurn === this.turnCounter;
            // Okeyle bitme: son taş bu elin okeyi (Hugo elinde sahte okey, normal elde göstergenin bir üstü)
            this.finishedWithJoker = this.isOkeyTile(tile);
        }
        tile.setStatus(TileStatus.DISCARDED);
        tile.setVisible(true);
        this.discardPile.push(tile);
        this.owners().push(playerId);
        this.lastDiscardPlayerId = playerId;
        this.takenDiscardTileId = null;
        this.takenPenalty = null;
        // İşlek taş için zaten ceza yazıldı: sıradaki oyuncu bu taşı alıp atana ikinci ceza yazdıramaz
        this.lockedDiscardTileId = penalties.some(p => p.tag === 'işlek') ? tile.id : null;

        // Sırayı bir sonraki oyuncuya geçir
        this.nextTurn();
        this.lastActionTime = new Date();
        return { tile, penalties };
    }

    // Yandan alınıp henüz kullanılmamış (hâlâ elde olan) taşın id'si
    private pendingTakenTileId(player: Player): string | null {
        const id = this.takenDiscardTileId;
        return id && player.tiles.some(t => t.id === id) ? id : null;
    }

    // Kustu: yandan alınıp kullanılmayan taş cezasız geri konur, atanın cezası silinir; oyuncu desteden çeker
    returnTakenTile(playerId: string): { tile: Tile | null; toPlayerId: string | null; revert: Penalty | null; error?: string } {
        const player = this.getPlayerById(playerId);
        if (!player || !this.isPlayerTurn(playerId) || this.turnAction !== TurnAction.DISCARD) {
            return { tile: null, toPlayerId: null, revert: null, error: 'Şu an taş geri konamaz' };
        }
        const id = this.pendingTakenTileId(player);
        const tile = id ? player.tiles.find(t => t.id === id) : undefined;
        if (!tile) return { tile: null, toPlayerId: null, revert: null, error: 'Geri konacak yandan alınmış taş yok' };
        // Başka taşlarla masaya oynadıktan sonra alınan taş geri konamaz
        if (this.playedToTableThisTurn) return { tile: null, toPlayerId: null, revert: null, error: 'Bu sırada masaya oynadın: yandan aldığın taş geri konamaz' };

        player.removeTile(tile.id);
        tile.setStatus(TileStatus.DISCARDED);
        this.discardPile.push(tile);
        this.owners().push(this.lastDiscardPlayerId);
        let revert: Penalty | null = null;
        if (this.takenPenalty) {
            this.getPlayerById(this.takenPenalty.playerId)?.removePenalty(this.takenPenalty.amount);
            revert = { ...this.takenPenalty, amount: -this.takenPenalty.amount, reason: 'Taş kusuldu, ceza iptal', tag: 'iptal' };
        }
        this.takenPenalty = null;
        this.takenDiscardTileId = null;
        this.returnedTileId = tile.id;
        this.turnAction = TurnAction.DRAW;
        this.lastActionTime = new Date();
        return { tile, toPlayerId: this.lastDiscardPlayerId, revert };
    }

    // Masaya oynayınca elde en az bir taş kalmalı: el, son taş atılarak biter
    private leavesTile(player: Player, sets: { tiles: Tile[] }[]): boolean {
        const used = new Set(sets.flatMap(st => st.tiles.map(t => t.id)));
        return player.tiles.length - used.size >= 1;
    }

    // Bu sıradaki ilk masaya oynamadan önce durumu sakla
    // Açtığı sırada (taş atmadan) indirdiği perler ve kendi perine işlediği taşlar açılış değerine eklenir (örn. 65 + 10 = 75)
    private addToOpening(player: Player, amount: number): void {
        if (amount <= 0 || !player.isOpen || player.openedAtTurn !== this.turnCounter) return;
        player.lastOpenedValue += amount;
        player.openedTotal += amount;
        player.openingScore += amount;
    }

    private beginTablePlay(player: Player): void {
        if (this.turnSnapshot) return;
        this.turnSnapshot = {
            playerId: player.id,
            hand: player.tiles.map(t => t.id),
            sets: this.tableSets.map(st => ({ id: st.id, playerId: st.playerId, kind: st.kind, value: st.value, tileIds: st.tiles.map(t => t.id) })),
            open: {
                isOpen: player.isOpen, openedWithPairs: player.openedWithPairs, openedAtTurn: player.openedAtTurn,
                lastOpenedValue: player.lastOpenedValue, openedTotal: player.openedTotal, openingScore: player.openingScore,
            },
            turnAction: this.turnAction,
            okeyPlayedThisTurn: this.okeyPlayedThisTurn,
            penalties: [],
        };
    }

    // Geri al: bu sırada masaya oynananlar ele döner, başkalarına yazılan işleme cezaları silinir, oyuncuya 100 ceza.
    // Yalnızca taş atılmadan önce (sıra geçince anlık görüntü silinir).
    undoTurnPlays(playerId: string, penaltyAmount = 100): { success: boolean; error?: string; penalty?: Penalty; reverts?: Penalty[]; tableSets?: Record<string, any>[] } {
        const player = this.getPlayerById(playerId);
        const snap = this.turnSnapshot;
        if (!player || !this.isPlayerTurn(playerId) || !snap || snap.playerId !== playerId) {
            return { success: false, error: 'Bu sırada geri alınacak hamle yok' };
        }
        const reg = new Map<string, Tile>();
        [...player.tiles, ...this.tableSets.flatMap(st => st.tiles)].forEach(t => reg.set(t.id, t));

        this.tableSets = snap.sets.map(st => ({ id: st.id, playerId: st.playerId, kind: st.kind, value: st.value, tiles: st.tileIds.map(id => reg.get(id)!) }));
        this.tableSets.forEach(st => st.tiles.forEach(t => t.setStatus(TileStatus.ON_TABLE)));
        player.tiles = snap.hand.map(id => reg.get(id)!);
        player.tiles.forEach(t => t.setStatus(TileStatus.IN_HAND));
        Object.assign(player, snap.open);
        this.turnAction = snap.turnAction;
        this.okeyPlayedThisTurn = snap.okeyPlayedThisTurn;

        const reverts = snap.penalties.map(p => {
            this.getPlayerById(p.playerId)?.removePenalty(p.amount);
            return { ...p, amount: -p.amount, reason: 'Hamle geri alındı, ceza iptal', tag: 'iptal' };
        });
        player.addPenalty(penaltyAmount);
        const penalty: Penalty = { playerId, amount: penaltyAmount, reason: 'Masaya oynananlar geri alındı', tag: 'geri alma' };
        if (this.pendingOpen?.playerId === playerId) this.pendingOpen = null;

        this.turnSnapshot = null;
        this.playedToTableThisTurn = false;
        this.lastActionTime = new Date();
        return { success: true, penalty, reverts, tableSets: this.tableSets.map(st => this.tableSetToJSON(st)) };
    }

    // Taş masadaki bir perin başına ya da sonuna eklenebiliyorsa sabit ceza: 100, Hugo elinde 200
    islekPenalty(tile: Tile): number {
        const played = this.asPlayed(tile); // sahte okey, okeyin değeriyle işlenebilir
        if (this.isOkeyTile(played) || typeof played.value !== 'number') return 0;
        const fits = this.tableSets.some(set => set.kind !== 'cift' &&
            (this.validateSetTiles([tile, ...set.tiles]) > 0 || this.validateSetTiles([...set.tiles, tile]) > 0 ||
                this.replacesOkey(set, tile))
        );
        return fits ? 100 : 0; // Hugo elinde de 100 yazılır, el sonunda Hugo × 2
    }

    // Taş perdeki bir okeyin yerini tutuyor mu (okey alma kuralıyla aynı: aynı sayı perinde yalnızca 4 taşken)
    private replacesOkey(set: TableSet, tile: Tile): boolean {
        if (this.isSameNumberSet(set.tiles) && set.tiles.length !== 4) return false;
        return set.tiles.some((x, i) => this.isOkeyTile(x) &&
            this.validateSetTiles(set.tiles.map((y, j) => (j === i ? tile : y))) > 0);
    }

    nextTurn(): void {
        this.turnCounter++;
        // Mevcut oyuncunun sırasını kapat
        this.players[this.currentPlayerIndex].setTurn(false);

        // Bir sonraki oyuncuya geç
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;

        // Yeni oyuncunun sırasını aç
        this.players[this.currentPlayerIndex].setTurn(true);

        // Tur aksiyonunu sıfırla
        this.turnAction = TurnAction.DRAW;
        this.okeyPlayedThisTurn = false;
        this.returnedTileId = null;
        this.playedToTableThisTurn = false;
        this.turnSnapshot = null;
        this.pendingOpen = null;
    }

    isPlayerTurn(playerId: string): boolean {
        // Tur arası (ROUND_ENDED) ve oyun sonunda kimse hamle yapamaz
        return this.status === GameStatus.STARTED && this.players[this.currentPlayerIndex].id === playerId;
    }

    // Süre dolunca atılacak taş: eldeki perlere girmeyen en küçük taş. Okey (Hugo elinde joker) asla atılmaz.
    // Sıra: per dışı ve per adayı olmayan → per dışı → (hepsi perdeyse) okey olmayan en küçük taş; işlek taşlar en sona
    pickAutoDiscard(playerId: string): Tile | null {
        const player = this.getPlayerById(playerId);
        if (!player || player.tiles.length === 0) return null;
        const pendingTaken = this.pendingTakenTileId(player);
        if (pendingTaken) return player.tiles.find(t => t.id === pendingTaken) || null;
        const plain = player.tiles.filter(t => !this.isOkeyTile(t) && typeof this.asPlayed(t).value === 'number');
        if (plain.length === 0) return player.tiles.find(t => !this.isOkeyTile(t)) || player.tiles[0]; // elde yalnızca okey varsa
        const inSets = new Set(planSets(this, player.tiles).flat().map(t => t.id));
        const outside = plain.filter(t => !inSets.has(t.id));
        const loose = outside.filter(t => !this.inPotentialPer(t, outside.concat(player.tiles.filter(x => this.isOkeyTile(x)))));
        // İşlek (masadaki bir pere eklenebilen) taş atılmaz; hepsi işlekse yine en uygunu
        const safe = (arr: Tile[]) => arr.filter(t => this.islekPenalty(t) === 0);
        const pool = [safe(loose), safe(outside), safe(plain), loose, outside, plain].find(a => a.length) as Tile[];
        const val = (t: Tile) => this.asPlayed(t).value as number;
        return pool.reduce((min, t) => val(t) < val(min) ? t : min);
    }

    // Taş, eldeki iki taşla (okey dahil) geçerli bir 3'lü per (seri ya da aynı sayı) kurabiliyor mu
    private inPotentialPer(tile: Tile, hand: Tile[]): boolean {
        const others = hand.filter(t => t.id !== tile.id);
        for (let i = 0; i < others.length; i++) {
            for (let j = i + 1; j < others.length; j++) {
                const [a, b] = [others[i], others[j]];
                // Okey her konumda olabilir: üç taşın tüm dizilişleri denenir
                const orders = [[tile, a, b], [tile, b, a], [a, tile, b], [b, tile, a], [a, b, tile], [b, a, tile]];
                if (orders.some(o => this.validateSetTiles(o) > 0)) return true;
            }
        }
        return false;
    }

    getPlayerById(playerId: string): Player | undefined {
        return this.players.find(player => player.id === playerId);
    }

    // ── El Açma / Taş Oynama ───────────────────────────────

    // Açılış eşiği: ilk açılış en az 51; sonrakiler (seri ya da çift) masadaki en yüksek açılışı geçmeli
    openingNeeded(): number {
        const max = this.players.reduce((m, p) => Math.max(m, p.lastOpenedValue), 0);
        return max === 0 ? 51 : max + 1;
    }

    /**
     * El açma. stage=false (Tümünü aç): verilen perler (varsa bekleyenlerle) eşiği geçmeli, geçmezse hiçbir şey olmaz.
     * stage=true (per masaya sürüklendi): per eşik dolmasa da yere iner ve "bekleyen açılış" olur; eşik
     * dolunca el açılır. Bekleyen açılış varken taş atılamaz; süre dolunca completePendingOpen / geri alma.
     */
    openHand(playerId: string, setTileIds: string[][], kind: SetKind = 'seri', stage = false): {
        success: boolean;
        error?: string;
        newSets?: TableSet[];
        openedTotal?: number;
        remainingTiles?: Record<string, any>[];
        turnAction?: TurnAction;
        pendingTotal?: number;
        needed?: number;
    } {
        const player = this.getPlayerById(playerId);
        if (!player || !this.isPlayerTurn(playerId)) {
            return { success: false, error: 'Sıra bu oyuncuda değil' };
        }

        // Taş çektikten sonra veya ilk el (15 taş) ise açılabilir
        const isFirstTurn = player.tiles.length === 15 && this.turnAction === TurnAction.DRAW;
        if (this.turnAction !== TurnAction.DISCARD && !isFirstTurn) {
            return { success: false, error: 'Önce taş çekilmeli' };
        }

        if (player.isOpen) {
            return { success: false, error: 'El zaten açık: perleri indir' };
        }

        // İlk turda direkt açan oyuncu tekrar taş çekemesin, sadece atabilsin
        const wasFirstTurnOpen = isFirstTurn;
        const pending = this.pendingOpen?.playerId === playerId ? this.pendingOpen : null;
        if (pending && pending.kind !== kind) {
            return { success: false, error: pending.kind === 'cift' ? 'Çiftle açmaya başladın: çift indir' : 'Seriyle açmaya başladın: per indir' };
        }

        if (!setTileIds || setTileIds.length === 0) {
            return { success: false, error: 'En az bir set gerekli' };
        }

        // Her set'i doğrula
        let totalValue = 0;
        const validatedSets: { tiles: Tile[]; value: number }[] = [];

        for (const tileIds of setTileIds) {
            const tiles: Tile[] = [];
            for (const id of tileIds) {
                const tile = player.tiles.find(t => t.id === id);
                if (!tile) {
                    return { success: false, error: 'Taş oyuncunun elinde bulunamadı' };
                }
                tiles.push(tile);
            }

            const setValue = this.validateGroup(tiles, kind);
            if (setValue === 0) {
                return { success: false, error: kind === 'cift' ? 'Geçersiz çift' : 'Geçersiz set (en az 3 taş)' };
            }

            validatedSets.push({ tiles, value: setValue });
            totalValue += setValue;
        }

        // Bekleyen perlerle birlikte toplam. Yetersizse (Tümünü aç) açılmaz, ceza yazılmaz.
        const needed = this.openingNeeded();
        const combined = (pending?.total || 0) + totalValue;
        const reaches = combined >= needed;
        if (!reaches && !stage) {
            return { success: false, error: needed === 51 ? `İlk açılış için en az 51 gerekli (${combined})` : `Masadaki en yüksek açılışı (${needed - 1}) geçmeli (${combined})` };
        }

        if (!this.leavesTile(player, validatedSets)) {
            return { success: false, error: 'Elde en az bir taş kalmalı: son taşı atarak bitirirsin' };
        }

        this.beginTablePlay(player);
        // Taşları elden masaya taşı
        const newSets: TableSet[] = [];
        for (const { tiles, value } of validatedSets) {
            const setId = uuidv4();
            for (const tile of tiles) {
                player.removeTile(tile.id);
                tile.setStatus(TileStatus.ON_TABLE);
                tile.setVisible(true);
            }
            const tableSet: TableSet = { id: setId, playerId, tiles, value, kind };
            this.tableSets.push(tableSet);
            newSets.push(tableSet);
        }

        if (reaches) {
            this.pendingOpen = null;
            player.isOpen = true;
            player.openedWithPairs = kind === 'cift';
            player.openedAtTurn = this.turnCounter;
            // Seri ve çift ortak eşik: sonraki açılış bu değeri geçmeli
            player.lastOpenedValue = combined;
            player.openedTotal += combined;
            // openingScore sadece ilk açılışta set edilir (player.openingScore === 0 kontrolü)
            if (player.openingScore === 0) {
                player.openingScore = combined;
            }
        } else {
            this.pendingOpen = { playerId, kind, total: combined, setIds: [...(pending?.setIds || []), ...newSets.map(st => st.id)] };
        }
        this.playedToTableThisTurn = true;
        this.lastActionTime = new Date();

        // İlk turda direkt açan oyuncu tekrar taş çekemesin
        if (wasFirstTurnOpen) {
            this.turnAction = TurnAction.DISCARD;
        }

        return {
            success: true,
            newSets,
            openedTotal: player.openedTotal,
            remainingTiles: player.tiles.map(t => t.toJSON()),
            turnAction: this.turnAction,
            pendingTotal: reaches ? 0 : combined,
            needed,
        };
    }

    // Süre doldu, açılış bekliyor: eldeki perlerle (okey dahil) eşik tamamlanabiliyorsa onlar da açılır
    completePendingOpen(playerId: string): ReturnType<Game['openHand']> {
        const pending = this.pendingOpen;
        const player = this.getPlayerById(playerId);
        if (!pending || pending.playerId !== playerId || !player) return { success: false, error: 'Bekleyen açılış yok' };
        const sets = pending.kind === 'cift' ? this.planPairs(player.tiles) : planSets(this, player.tiles);
        while (sets.length && sets.flat().length >= player.tiles.length) sets.pop(); // elde bir taş kalmalı
        const sum = sets.reduce((acc, st) => acc + this.validateGroup(st, pending.kind), 0);
        if (!sets.length || pending.total + sum < this.openingNeeded()) return { success: false, error: 'Açılış tamamlanamadı' };
        return this.openHand(playerId, sets.map(st => st.map(t => t.id)), pending.kind, false);
    }

    // Eldeki çiftler (aynı taş; tek kalan en değerli taş okeyle eşleşir), değeri büyükten küçüğe
    private planPairs(hand: Tile[]): Tile[][] {
        const okeys = hand.filter(t => this.isOkeyTile(t));
        const byKey = new Map<string, Tile[]>();
        hand.filter(t => !this.isOkeyTile(t)).forEach(t => {
            const p = this.asPlayed(t); const k = `${p.color}-${p.value}`;
            byKey.set(k, [...(byKey.get(k) || []), t]);
        });
        const pairs: Tile[][] = [];
        const singles: Tile[] = [];
        byKey.forEach(list => { for (let i = 0; i + 1 < list.length; i += 2) pairs.push([list[i], list[i + 1]]); if (list.length % 2) singles.push(list[list.length - 1]); });
        const val = (t: Tile) => (typeof this.asPlayed(t).value === 'number' ? this.asPlayed(t).value as number : 0);
        singles.sort((a, b) => val(b) - val(a)).slice(0, okeys.length).forEach((t, i) => pairs.push([t, okeys[i]]));
        return pairs.filter(pr => this.validateGroup(pr, 'cift') > 0).sort((a, b) => this.validateGroup(b, 'cift') - this.validateGroup(a, 'cift'));
    }

    // ── İşleme (Taş Ekleme) ─────────────────────────────────
    // Eli açık oyuncu, masadaki mevcut bir sete taş ekleyebilir.
    // Normal ekleme: set sahibine taş değeri × 10 ceza (farklı oyuncu ise)
    // Okey swap: set sahibine 100 ceza
    // Erkek per: okey almak için tüm eksik renkler önce tamamlanmalı (set 4 taşlı olmalı)
    // Sıralı per: tek taş ile okey swap yapılabilir
    // position: client taşın bırakıldığı yeri belirtir ('start' | 'end')

    addTileToSet(playerId: string, tileId: string, targetSetId: string, position: 'start' | 'end'): {
        success: boolean;
        error?: string;
        updatedSet?: Record<string, any>;
        swappedOkeyTile?: Record<string, any>;
        penalty?: { targetPlayerId: string; amount: number; tag: string; tile: string };
        remainingTiles?: Record<string, any>[];
    } {
        const player = this.getPlayerById(playerId);
        if (!player || !this.isPlayerTurn(playerId)) {
            return { success: false, error: 'Sıra bu oyuncuda değil' };
        }

        if (!player.isOpen) {
            return { success: false, error: 'Önce el açılmalı' };
        }

        const isFirstTurn = player.tiles.length === 15 && this.turnAction === TurnAction.DRAW;
        if (this.turnAction !== TurnAction.DISCARD && !isFirstTurn) {
            return { success: false, error: 'Önce taş çekilmeli' };
        }

        const tile = player.tiles.find(t => t.id === tileId);
        if (!tile) {
            return { success: false, error: 'Taş oyuncunun elinde bulunamadı' };
        }

        const targetSet = this.tableSets.find(s => s.id === targetSetId);
        if (!targetSet) {
            return { success: false, error: 'Hedef set bulunamadı' };
        }

        if (targetSet.kind === 'cift') {
            // Çiftte okey varsa okeyin eşi olan taşla okey alınır; yoksa çiftlere tek taş işlenmez
            const oi = targetSet.tiles.findIndex(t => this.isOkeyTile(t));
            const mate = oi === -1 ? undefined : targetSet.tiles[1 - oi];
            const same = (a: Tile, b: Tile) => { const x = this.asPlayed(a), y = this.asPlayed(b); return x.color === y.color && x.value === y.value; };
            if (mate && !this.isOkeyTile(mate) && !this.isOkeyTile(tile) && !this.okeyPlayedThisTurn && same(tile, mate)) {
                const testTiles = [...targetSet.tiles]; testTiles[oi] = tile;
                const newValue = this.validatePairTiles(testTiles);
                if (newValue > 0) return this.swapOkey(player, targetSet, oi, tile, newValue);
            }
            return { success: false, error: 'Çiftlere tek taş işlenmez: elindeki çifti işle' };
        }

        const setOwner = this.getPlayerById(targetSet.playerId);

        // 1. Okey swap denemesi — sette joker/okey varsa yerine gerçek taşı koy
        // Bu turda okey işlemiş oyuncu tekrar okey alamaz
        // Perde birden çok okey olabilir (Hugo eli): taşın yerini tuttuğu okey hangisiyse o alınır
        const okeyIndexes = targetSet.tiles.map((t, i) => (this.isOkeyTile(t) ? i : -1)).filter(i => i !== -1);
        if (okeyIndexes.length && !this.okeyPlayedThisTurn && !this.isOkeyTile(tile)) {
            // Erkek per (aynı sayı seti): okey swap ancak set 4 taşla doluyken
            // Sıralı per: tek taş ile swap mümkün
            const isSameNumber = this.isSameNumberSet(targetSet.tiles);
            const canSwapOkey = !isSameNumber || targetSet.tiles.length === 4;

            for (const okeyIndex of canSwapOkey ? okeyIndexes : []) {
                const testTiles = [...targetSet.tiles];
                testTiles[okeyIndex] = tile;

                const newValue = this.validateSetTiles(testTiles);
                if (newValue > 0) return this.swapOkey(player, targetSet, okeyIndex, tile, newValue);
            }
        }

        // 2. Normal ekleme — istenen uca; uymazsa perin öbür ucuna (taş pere bırakıldıysa hangi uca
        //    bırakıldığı önemli değil, telefonda parmak tam uca denk gelmeyebilir)
        const valueAt = (pos: 'start' | 'end') =>
            this.validateSetTiles(pos === 'start' ? [tile, ...targetSet.tiles] : [...targetSet.tiles, tile]);
        let newValue = valueAt(position);
        if (newValue <= 0) {
            const other = position === 'start' ? 'end' : 'start';
            newValue = valueAt(other);
            if (newValue <= 0) return { success: false, error: 'Bu taş bu pere işlenemez' };
            position = other;
        }

        if (player.tiles.length <= 1) {
            return { success: false, error: 'Elde en az bir taş kalmalı: son taşı atarak bitirirsin' };
        }

        this.beginTablePlay(player);
        if (targetSet.playerId === playerId) this.addToOpening(player, newValue - targetSet.value);
        player.removeTile(tileId);
        tile.setStatus(TileStatus.ON_TABLE);
        tile.setVisible(true);

        if (position === 'start') {
            targetSet.tiles.unshift(tile);
        } else {
            targetSet.tiles.push(tile);
        }
        targetSet.value = newValue;

        // Okey (joker veya okey taşı) işlendiyse bu turda geri alınamaz
        if (this.isOkeyTile(tile)) {
            this.okeyPlayedThisTurn = true;
        }

        // Ceza: sadece başka oyuncunun setine ekleme → taş değeri × 10
        // Joker/okey için pozisyondaki etkin değeri hesapla
        let penalty: { targetPlayerId: string; amount: number; tag: string; tile: string } | undefined;
        if (setOwner && setOwner.id !== playerId) {
            let effectiveValue: number;
            if (this.isOkeyTile(tile)) {
                effectiveValue = this.calculateEffectiveValue(targetSet.tiles, tile, position);
            } else {
                const played = this.asPlayed(tile); // sahte okey, okeyin değeri kadar ceza yazar
                effectiveValue = typeof played.value === 'number' ? played.value : 0;
            }
            const penaltyAmount = effectiveValue * 10;
            setOwner.addPenalty(penaltyAmount);
            penalty = { targetPlayerId: setOwner.id, amount: penaltyAmount, tag: 'işleme', tile: tileLabel(tile) };
            this.turnSnapshot?.penalties.push({ playerId: penalty.targetPlayerId, amount: penalty.amount, reason: '', tag: penalty.tag, tile: penalty.tile });
        }

        this.playedToTableThisTurn = true;
        this.lastActionTime = new Date();

        return {
            success: true,
            updatedSet: this.tableSetToJSON(targetSet),
            penalty,
            remainingTiles: player.tiles.map(t => t.toJSON())
        };
    }

    // Perdeki okeyin yerine elden gerçek taş konur, okey ele geçer; set sahibine 100 ceza
    private swapOkey(player: Player, targetSet: TableSet, okeyIndex: number, tile: Tile, newValue: number) {
        const tileId = tile.id;
        const setOwner = this.getPlayerById(targetSet.playerId);
        const okeyTile = targetSet.tiles[okeyIndex];

        this.beginTablePlay(player);
        player.removeTile(tileId);
        tile.setStatus(TileStatus.ON_TABLE);
        tile.setVisible(true);

        targetSet.tiles[okeyIndex] = tile;
        targetSet.value = newValue;

        okeyTile.setStatus(TileStatus.IN_HAND);
        player.addTile(okeyTile);

        // Set sahibine 100 puan ceza (kendi perinden / çiftinden okey alan ceza yemez)
        let penalty: { targetPlayerId: string; amount: number; tag: string; tile: string } | undefined;
        if (setOwner && setOwner.id !== player.id) {
            setOwner.addPenalty(100);
            penalty = { targetPlayerId: setOwner.id, amount: 100, tag: 'okey', tile: tileLabel(tile) };
            this.turnSnapshot?.penalties.push({ playerId: penalty.targetPlayerId, amount: penalty.amount, reason: '', tag: penalty.tag, tile: penalty.tile });
        }

        this.playedToTableThisTurn = true;
        this.lastActionTime = new Date();

        return {
            success: true,
            updatedSet: this.tableSetToJSON(targetSet),
            swappedOkeyTile: okeyTile.toJSON(),
            penalty,
            remainingTiles: player.tiles.map(t => t.toJSON())
        };
    }

    // Çiftlere işleme: eli açık oyuncu, elindeki bir çifti başka bir oyuncunun çiftlerine işler.
    // Çift, sahibinin alanına yeni çift olarak konur; sahibine (taşların toplamı × 10) × 2 ceza yazılır.
    addPairToSet(playerId: string, tileIds: string[], targetSetId: string): {
        success: boolean;
        error?: string;
        newSet?: TableSet;
        penalty?: { targetPlayerId: string; amount: number; tag: string; tile: string };
        remainingTiles?: Record<string, any>[];
    } {
        const player = this.getPlayerById(playerId);
        if (!player || !this.isPlayerTurn(playerId)) return { success: false, error: 'Sıra bu oyuncuda değil' };
        if (!player.isOpen) return { success: false, error: 'Önce el açılmalı' };

        const isFirstTurn = player.tiles.length === 15 && this.turnAction === TurnAction.DRAW;
        if (this.turnAction !== TurnAction.DISCARD && !isFirstTurn) return { success: false, error: 'Önce taş çekilmeli' };

        const target = this.tableSets.find(s => s.id === targetSetId);
        if (!target || target.kind !== 'cift') return { success: false, error: 'Hedef çift bulunamadı' };

        if (tileIds.length !== 2 || tileIds[0] === tileIds[1]) return { success: false, error: 'Çift için iki taş gerekli' };
        const tiles = tileIds.map(id => player.tiles.find(t => t.id === id));
        if (tiles.some(t => !t)) return { success: false, error: 'Taş oyuncunun elinde bulunamadı' };

        const value = this.validatePairTiles(tiles as Tile[]); // taşların toplamı (okey eşinin değerini alır)
        if (value === 0) return { success: false, error: 'Geçersiz çift' };

        if (player.tiles.length <= 2) {
            return { success: false, error: 'Elde en az bir taş kalmalı: son taşı atarak bitirirsin' };
        }

        this.beginTablePlay(player);
        for (const tile of tiles as Tile[]) {
            player.removeTile(tile.id);
            tile.setStatus(TileStatus.ON_TABLE);
            tile.setVisible(true);
            if (this.isOkeyTile(tile)) this.okeyPlayedThisTurn = true;
        }
        const newSet: TableSet = { id: uuidv4(), playerId: target.playerId, tiles: tiles as Tile[], value, kind: 'cift' };
        this.tableSets.push(newSet);
        if (target.playerId === playerId) this.addToOpening(player, value);

        let penalty: { targetPlayerId: string; amount: number; tag: string; tile: string } | undefined;
        const owner = this.getPlayerById(target.playerId);
        if (owner && owner.id !== playerId) {
            const amount = value * 10; // normal işleme gibi: taşların toplamı × 10 (Hugo çarpanı el sonunda)
            owner.addPenalty(amount);
            penalty = { targetPlayerId: owner.id, amount, tag: 'çift işleme', tile: (tiles as Tile[]).map(tileLabel).join(' + ') };
            this.turnSnapshot?.penalties.push({ playerId: penalty.targetPlayerId, amount: penalty.amount, reason: '', tag: penalty.tag, tile: penalty.tile });
        }

        this.playedToTableThisTurn = true;
        this.lastActionTime = new Date();
        return { success: true, newSet, penalty, remainingTiles: player.tiles.map(t => t.toJSON()) };
    }

    // Joker/okey'in sete eklendiği pozisyondaki etkin değerini hesapla
    private calculateEffectiveValue(tilesAfterInsert: Tile[], addedTile: Tile, position: 'start' | 'end'): number {
        // Eklenen taş ve diğer wildcard'ları hariç tut
        const normalTiles = tilesAfterInsert.filter(t => t !== addedTile && !this.isOkeyTile(t) && typeof t.value === 'number');
        if (normalTiles.length === 0) return 0;

        // Aynı sayı seti ise tüm taşlar aynı değerde
        if (this.isSameNumberSet(tilesAfterInsert)) {
            return normalTiles[0].value as number;
        }

        // Sıralı set: joker başa eklendiyse ilk normal taştan -1, sona eklendiyse son normal taştan +1
        if (position === 'start') {
            const firstNormal = normalTiles.reduce((min, t) =>
                (t.value as number) < (min.value as number) ? t : min, normalTiles[0]);
            return (firstNormal.value as number) - 1;
        } else {
            const lastNormal = normalTiles.reduce((max, t) =>
                (t.value as number) > (max.value as number) ? t : max, normalTiles[0]);
            return (lastNormal.value as number) + 1;
        }
    }

    private tableSetToJSON(set: TableSet): Record<string, any> {
        return {
            id: set.id,
            playerId: set.playerId,
            tiles: set.tiles.map(t => t.toJSON()),
            value: set.value,
            kind: set.kind
        };
    }

    // ── Per İndirme ────────────────────────────────────────
    // Eli açık oyuncu, sırası geldiğinde geçerli setlerini
    // skor etkisi olmadan masaya indirebilir.

    dropPer(playerId: string, setTileIds: string[][]): {
        success: boolean;
        error?: string;
        newSets?: TableSet[];
        remainingTiles?: Record<string, any>[];
    } {
        const player = this.getPlayerById(playerId);
        if (!player || !this.isPlayerTurn(playerId)) {
            return { success: false, error: 'Sıra bu oyuncuda değil' };
        }

        if (!player.isOpen) {
            return { success: false, error: 'Önce el açılmalı' };
        }

        const isFirstTurn = player.tiles.length === 15 && this.turnAction === TurnAction.DRAW;
        if (this.turnAction !== TurnAction.DISCARD && !isFirstTurn) {
            return { success: false, error: 'Önce taş çekilmeli' };
        }

        if (!setTileIds || setTileIds.length === 0) {
            return { success: false, error: 'En az bir set gerekli' };
        }

        // Çiftle açan yalnızca çift, seriyle açan yalnızca per indirir
        const kind: SetKind = player.openedWithPairs ? 'cift' : 'seri';
        const validatedSets: { tiles: Tile[]; value: number }[] = [];

        for (const tileIds of setTileIds) {
            const tiles: Tile[] = [];
            for (const id of tileIds) {
                const tile = player.tiles.find(t => t.id === id);
                if (!tile) {
                    return { success: false, error: 'Taş oyuncunun elinde bulunamadı' };
                }
                tiles.push(tile);
            }

            const setValue = this.validateGroup(tiles, kind);
            if (setValue === 0) {
                return { success: false, error: kind === 'cift' ? 'Geçersiz çift' : 'Geçersiz set (en az 3 taş)' };
            }

            validatedSets.push({ tiles, value: setValue });
        }

        if (!this.leavesTile(player, validatedSets)) {
            return { success: false, error: 'Elde en az bir taş kalmalı: son taşı atarak bitirirsin' };
        }

        this.beginTablePlay(player);
        // Taşları elden masaya taşı — skor güncellenmez
        const newSets: TableSet[] = [];
        for (const { tiles, value } of validatedSets) {
            const setId = uuidv4();
            for (const tile of tiles) {
                player.removeTile(tile.id);
                tile.setStatus(TileStatus.ON_TABLE);
                tile.setVisible(true);
            }
            const tableSet: TableSet = { id: setId, playerId, tiles, value, kind };
            this.tableSets.push(tableSet);
            newSets.push(tableSet);
        }
        this.addToOpening(player, validatedSets.reduce((sum, st) => sum + st.value, 0));

        this.playedToTableThisTurn = true;
        this.lastActionTime = new Date();

        return {
            success: true,
            newSets,
            remainingTiles: player.tiles.map(t => t.toJSON())
        };
    }

    // ── Server-side Set Doğrulama ────────────────────────

    private isSameNumberSet(tiles: Tile[]): boolean {
        const normalTiles = tiles.map(t => this.asPlayed(t)).filter(t => !this.isOkeyTile(t));
        if (normalTiles.length === 0) return false;
        const value = normalTiles[0].value;
        return normalTiles.every(t => t.value === value);
    }

    isOkeyTile(tile: Tile): boolean {
        if (this.isHugoRound()) return tile.isJoker;
        // Normal elde joker sahte okeydir: okeyin değerini taşır ama joker gibi davranmaz
        if (tile.isJoker || (tile as SahteTile).sahte || !this.okeyTile) return false;
        return tile.color === this.okeyTile.color && tile.value === this.okeyTile.value;
    }

    // Normal elde sahte okey (joker), okey taşının rengi ve sayısıyla sıradan taş gibi oynanır
    asPlayed(tile: Tile): Tile {
        if (this.isHugoRound() || !tile.isJoker || !this.okeyTile) return tile;
        return { ...tile, color: this.okeyTile.color, value: this.okeyTile.value, isJoker: false, sahte: true } as SahteTile;
    }

    // Açılış/indirme grubunu türüne göre doğrula; 0 = geçersiz
    private validateGroup(tiles: Tile[], kind: SetKind): number {
        return kind === 'cift' ? this.validatePairTiles(tiles) : this.validateSetTiles(tiles);
    }

    // Çift: aynı renk ve sayıdan iki taş ya da okey + bir taş; değer = sayı × 2
    private validatePairTiles(rawTiles: Tile[]): number {
        if (rawTiles.length !== 2) return 0;
        const [a, b] = rawTiles.map(t => this.asPlayed(t));
        const wildA = this.isOkeyTile(a);
        const wildB = this.isOkeyTile(b);
        if (wildA && wildB) return 0; // iki okey çift sayılmaz
        const base = wildA ? b : a;
        const other = wildA ? a : b;
        if (typeof base.value !== 'number') return 0;
        if (!this.isOkeyTile(other) && (other.color !== base.color || other.value !== base.value)) return 0;
        return base.value * 2;
    }

    validateSetTiles(rawTiles: Tile[]): number {
        if (rawTiles.length < 3) return 0;
        const tiles = rawTiles.map(t => this.asPlayed(t));

        const sameNumberScore = this.validateSameNumberSetTiles(tiles);
        if (sameNumberScore > 0) return sameNumberScore;

        const sequentialScore = this.validateSequentialSetTiles(tiles);
        if (sequentialScore > 0) return sequentialScore;

        return 0;
    }

    private validateSameNumberSetTiles(tiles: Tile[]): number {
        if (tiles.length < 3 || tiles.length > 4) return 0;

        const normalTiles = tiles.filter(t => !this.isOkeyTile(t));
        if (normalTiles.length === 0) return 0;

        const value = normalTiles[0].value;
        if (typeof value !== 'number') return 0;

        const colors = new Set<string>();
        for (const tile of normalTiles) {
            if (tile.value !== value) return 0;
            if (colors.has(tile.color)) return 0;
            colors.add(tile.color);
        }

        return (value as number) * tiles.length;
    }

    private validateSequentialSetTiles(tiles: Tile[]): number {
        if (tiles.length < 3) return 0;

        const normalTiles = tiles.filter(t => !this.isOkeyTile(t));
        if (normalTiles.length === 0) return 0;

        const color = normalTiles[0].color;
        for (const tile of normalTiles) {
            if (tile.color !== color) return 0;
            if (typeof tile.value !== 'number') return 0;
        }

        // Artan (+1) ve azalan (-1) dene
        for (const direction of [1, -1]) {
            let anchorIdx = -1;
            let anchorVal = 0;

            for (let i = 0; i < tiles.length; i++) {
                if (!this.isOkeyTile(tiles[i])) {
                    anchorIdx = i;
                    anchorVal = tiles[i].value as number;
                    break;
                }
            }

            let sum = 0;
            let valid = true;

            for (let i = 0; i < tiles.length; i++) {
                const expectedVal = anchorVal + (i - anchorIdx) * direction;
                if (expectedVal < 1 || expectedVal > 13) { valid = false; break; }

                if (!this.isOkeyTile(tiles[i])) {
                    if (tiles[i].value !== expectedVal || tiles[i].color !== color) {
                        valid = false; break;
                    }
                }
                sum += expectedVal;
            }

            if (valid) return sum;
        }

        return 0;
    }

    getTableSetsByPlayer(playerId: string): TableSet[] {
        return this.tableSets.filter(s => s.playerId === playerId);
    }

    // ── Tur Sonu ───────────────────────────────────────────

    // Tur sonu tetikleyicisi: oyuncunun eli bitti veya deste bitti
    checkRoundEnd(finisherPlayerId?: string): boolean {
        if (finisherPlayerId) {
            const player = this.getPlayerById(finisherPlayerId);
            if (player && player.tiles.length === 0) {
                this.finisherPlayerId = finisherPlayerId;
                return true;
            }
        }
        if (this.deck.length === 0) {
            this.finisherPlayerId = null;
            return true;
        }
        return false;
    }

    /**
     * El sonu puanı (kural: kullanıcı kararı 2026-11-11):
     *   elde kalan     = açmışsa taş değerleri toplamı × 2 (2026-11-15; sahte okey okeyin değeriyle; okey 0)
     *                    açmamışsa 400 (kimse açmadıysa 800)
     *   özel durumlar  = Hugo, okeyle bitme, çiftten bitme, elden bitme — her biri ×2
     *                    elden bitme yalnızca bitirenden başka açan yoksa sayılır
     *                    (örn. tek özel durum: toplam × 2, Hugo + okeyle bitme: toplam × 4)
     *   Hugo dışındaki özel durumlar yalnızca elde kalana; Hugo ×2 cezalar dahil her şeye uygulanır
     *   kullanılmayan okey = elde kalan her okey için +100 ceza (okeyle / çiftten / elden bitme çarpanıyla katlanır)
     *   roundTotal     = max(0, (elde kalan × özel + cezalar + okey cezası) × Hugo − yıldız × 100)
     */
    endRound(finisherPlayerId?: string): RoundResult[] {
        // Resolve finisher: prefer explicit argument, fall back to game state
        const resolvedFinisherId = finisherPlayerId ?? this.finisherPlayerId ?? '';
        const finisher = this.getPlayerById(resolvedFinisherId);
        const hugoMult = this.isHugoRound() ? 2 : 1;
        const jokerMult = this.finishedWithJoker ? 2 : 1;
        const finishedWithPairs = !!finisher?.openedWithPairs;
        // Determine if no other player (excluding finisher) has opened their hand
        const nonFinishers = this.players.filter(p => p.id !== resolvedFinisherId);
        const noOtherPlayersOpened = nonFinishers.every(p => !p.isOpen);
        // Elden bitme yalnızca masada başka açan yoksa çarpan ekler
        const finishedElden = !!finisher && this.finishedElden && noOtherPlayersOpened;
        const handMult = jokerMult * (finishedWithPairs ? 2 : 1) * (finishedElden ? 2 : 1);
        // Açmamış oyuncu 400 (kimse açmadan elden bitişte elden çarpanıyla 800 olur); deste bitip kimse açmadıysa herkes 800
        const closedHandPenalty = !finisher && noOtherPlayersOpened ? 800 : 400;

        const results: RoundResult[] = this.players.map(player => {
            const isFinisher = player.id === resolvedFinisherId;

            let handScore = 0;
            let effectiveHandScore = 0;
            let unusedOkeyPenalty = 0;

            if (!isFinisher) {
                if (!player.isOpen) {
                    handScore = closedHandPenalty;
                } else {
                    handScore = player.tiles.reduce((sum, tile) => {
                        const played = this.asPlayed(tile);
                        if (this.isOkeyTile(played) || typeof played.value !== 'number') return sum;
                        return sum + played.value * 2; // taş değerleri toplamı × 2, bitme çarpanlarıyla katlanır
                    }, 0);
                }
                effectiveHandScore = handScore * handMult;
                // Kullanılmayan okey cezası yalnızca eli açmış oyuncuya yazılır
                // Elde kalan okey: her biri 100, özel durumlarda (okeyle / çiftten / elden bitme) çarpanla katlanır
                if (player.isOpen) unusedOkeyPenalty = player.tiles.filter(t => this.isOkeyTile(t)).length * 100 * handMult;
            }

            const openBonus = 0;   // reserved for future use
            const finishBonus = 0; // reserved for future use

            const rawTotal = effectiveHandScore + player.penaltyScore + unusedOkeyPenalty + openBonus + finishBonus;
            // Bütün çarpanlardan sonra, yıldızlardan önce en yakın 10'a (5 yukarı) yuvarlanır: 86 → 90, 172 → 170
            const preMult = Math.floor((rawTotal * hugoMult + 5) / 10) * 10;
            const multiplier = hugoMult * handMult;

            // Yıldız hesabı — finisher ve diğer oyuncular için ayrı kural
            // Not: isFinisher ve noOtherPlayersOpened bu scope'ta zaten tanımlı (yukarıda)
            // Not: this.finishedWithJoker RoundResult oluşturulduktan SONRA false'a sıfırlanır (satır ~859)
            //      Bu nedenle burada okunan değer o turun gerçek joker bitiş durumunu yansıtır
            let stars = 0;
            if (isFinisher) {
                // Finisher yıldızı: temel 1 (çiftten bitiren de 1 alır), her bonus koşul ×2 yapar
                // finishStars = 1 × (finishedWithJoker?2:1) × (isHugoRound?2:1) × (noOtherPlayersOpened?2:1)
                const jokerStarMult = this.finishedWithJoker ? 2 : 1;
                const hugoStarMult = this.isHugoRound() ? 2 : 1;
                const closedStarMult = noOtherPlayersOpened ? 2 : 1;
                const pairStarMult = finishedWithPairs ? 2 : 1; // çiftle bitirme yıldızı ikiye katlar
                stars = 1 * jokerStarMult * hugoStarMult * closedStarMult * pairStarMult;
            }
            // Yere açılan taşların değeri 100 ve üzeriyse (bitiren dahil) 1 yıldız
            if (player.openingScore >= 100) stars += 1;

            // roundTotal: hugoMult uygulandıktan sonra yıldız düşümü yapılır, minimum 0
            const roundTotal = Math.max(0, preMult - (stars * 100));

            player.addRoundScore(roundTotal, stars);

            return {
                playerId: player.id,
                playerName: player.name,
                isFinisher,
                handScore,
                effectiveHandScore,
                penaltyScore: player.penaltyScore,
                openBonus,
                finishBonus,
                rawTotal,
                roundTotal,
                multiplier,
                isHugoRound: this.isHugoRound(),
                finishedWithJoker: this.finishedWithJoker,
                stars,
                unusedOkeyPenalty,
                finishedWithPairs,
                finishedElden,
                penaltyEntries: [...player.penaltyEntries],
                isOpen: player.isOpen,
                totalScore: player.getTotalScore(),
            };
        });

        // Reset per-round player state
        this.players.forEach(player => {
            player.penaltyScore = 0;
            player.isOpen = false;
            player.lastOpenedValue = 0;
            player.openedTotal = 0;
            player.clearTiles();
        });

        // Reset game round state
        this.finishedWithJoker = false;
        this.finishedElden = false;
        this.tableSets = [];
        this.discardPile = [];
        this.discardOwners = [];

        // Tur numarası burada artmaz; yeni eli yalnızca startNextRound() başlatır
        this.status = this.round >= 9 ? GameStatus.FINISHED : GameStatus.ROUND_ENDED;

        return results;
    }

    // El sonu kaydı: sonuçlar ve o elde yazılan cezalar tabela geçmişine eklenir
    recordRoundHistory(results: RoundResult[]): RoundHistoryEntry {
        const entry = { round: this.round, isHugoRound: this.isHugoRound(), results, penalties: [...(this.roundPenalties || [])] };
        this.roundHistory = [...(this.roundHistory || []), entry];
        this.roundPenalties = [];
        return entry;
    }

    startNextRound(): void {
        if (this.round >= 9) {
            this.status = GameStatus.FINISHED;
            return;
        }

        // Oyuncuları sıfırla
        for (const player of this.players) {
            player.resetForNewRound();
        }

        this.round++;
        this.deck = [];
        this.discardPile = [];
        this.discardOwners = [];
        this.tableSets = [];
        this.okeyPlayedThisTurn = false;
        this.playedToTableThisTurn = false;
        this.turnSnapshot = null;
        this.pendingOpen = null;
        this.roundEndResults = null;
        this.finisherPlayerId = null;
        this.lastDiscardPlayerId = null;
        this.takenDiscardTileId = null;
        this.turnCounter = 0;
        this.finishedElden = false;

        // Eli başlatan, bir önceki eli başlatanın bir sonrakidir.
        // dealTiles() 15 taşı currentPlayerIndex'e verdiği için dağıtımdan önce belirlenir.
        this.firstPlayerIndex = (this.firstPlayerIndex + 1) % this.players.length;
        this.currentPlayerIndex = this.firstPlayerIndex;

        // Yeni tur için oyunu yeniden başlat
        this.okeyTile = null;
        this.createTiles();
        this.shuffleDeck();
        this.determineIndicatorTile();
        this.dealTiles();
        this.players[this.currentPlayerIndex].setTurn(true);
        this.turnAction = TurnAction.DRAW;
        this.status = GameStatus.STARTED;
        this.lastActionTime = new Date();
    }

    isHugoRound(): boolean {
        // 1., 5. ve 9. eller Hugo elidir; gösterge sahte okey (joker) çıkarsa o el de Hugo sayılır
        return [1, 5, 9].includes(this.round) || this.indicatorTile?.isJoker === true;
    }

    private tableSetsToJSON(): Record<string, any>[] {
        return this.tableSets.map(set => this.tableSetToJSON(set));
    }

    // Eski kayıtlarda liste yok: o taşların atanı bilinmez (null)
    private owners(): (string | null)[] {
        return (this.discardOwners ||= []);
    }

    toJSON(): Record<string, any> {
        return {
            id: this.id,
            players: this.players.map(player => player.toJSON()),
            deckCount: this.deck.length,
            discardPile: this.discardPile.map(tile => tile.toJSON()),
            currentPlayerIndex: this.currentPlayerIndex,
            status: this.status,
            round: this.round,
            turnAction: this.turnAction,
            indicatorTile: this.indicatorTile?.toJSON() || null,
            okeyTile: this.okeyTile?.toJSON() || null,
            tableSets: this.tableSetsToJSON(),
            isHugoRound: this.isHugoRound(),
            createdAt: this.createdAt,
            lastActionTime: this.lastActionTime
        };
    }

    toPublicJSON(): Record<string, any> {
        return {
            id: this.id,
            players: this.players.map(player => player.toPublicJSON()),
            roundHistory: this.roundHistory || [],
            deckCount: this.deck.length,
            discardPile: this.discardPile.map(tile => tile.toJSON()),
            currentPlayerIndex: this.currentPlayerIndex,
            currentPlayerId: this.players[this.currentPlayerIndex]?.id || null,
            status: this.status,
            round: this.round,
            turnAction: this.turnAction,
            indicatorTile: this.indicatorTile?.toJSON() || null,
            okeyTile: this.okeyTile?.toJSON() || null, // gösterge +1; herkesin bildiği bilgi
            lastDiscardPlayerId: this.lastDiscardPlayerId,
            // Sondan hizalı: eski kayıttan kalan, atanı bilinmeyen taşlar null
            discardOwners: this.discardPile.map((_, i) => this.owners()[i - (this.discardPile.length - this.owners().length)] ?? null),
            tableSets: this.tableSetsToJSON(),
            isHugoRound: this.isHugoRound(),
            roundEndResults: this.roundEndResults,
            createdAt: this.createdAt
        };
    }
} 