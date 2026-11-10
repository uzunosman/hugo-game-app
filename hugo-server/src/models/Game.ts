import { v4 as uuidv4 } from 'uuid';
import { Player } from './Player';
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
    unusedOkeyPenalty: number;  // elde kalan her okey için 100
    finishedWithPairs: boolean; // bitiren çiftle açmıştı (özel durum ×2)
    finishedElden: boolean;     // bitiren aynı sırada açıp bitirdi (özel durum ×2)
    penaltyEntries: number[];   // o elde yazılan cezalar (UI dökümü için)
    totalScore: number;         // bu el dahil toplam puan
}

// Sahte okeyin oynandığı hâli (doğrulamada kullanılan geçici kopya)
type SahteTile = Tile & { sahte?: boolean };

export interface Penalty {
    playerId: string;
    amount: number;
    reason: string;
}

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
    turnCounter: number;               // eldeki sıra sayacı (elden bitme için)
    finishedElden: boolean;            // son taşı atan, aynı sırada açmıştı
    createdAt: Date;
    lastActionTime: Date;

    constructor(players: Player[]) {
        this.id = uuidv4();
        this.players = [...players];
        this.deck = [];
        this.discardPile = [];
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
                ? [[TileColor.RED, 13], [TileColor.RED, 13], [TileColor.BLUE, 12], [TileColor.BLUE, 12], [TileColor.BLACK, 1], [TileColor.BLACK, 1]]
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

        if (fromDiscard && this.discardPile.length > 0) {
            // Atılan taşlardan çek
            drawnTile = this.discardPile.pop();
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

    discardTile(playerId: string, tileId: string): DiscardResult {
        const player = this.getPlayerById(playerId);
        if (!player) return { tile: null, penalties: [], error: 'Oyuncu bulunamadı' };

        // İlk el: 15 taşı olan oyuncu çekmeden atar
        const isFirstTurn = player.tiles.length === 15 && this.turnAction === TurnAction.DRAW;
        if (!this.isPlayerTurn(playerId) || (this.turnAction !== TurnAction.DISCARD && !isFirstTurn)) {
            return { tile: null, penalties: [], error: 'Şu an taş atamazsın' };
        }

        const tile = player.tiles.find(t => t.id === tileId);
        if (!tile) return { tile: null, penalties: [], error: 'Taş elinde değil' };

        const penalties: Penalty[] = [];
        // Yandan alınan taş kullanılmalı; kullanılmadıysa yalnızca o taş 100 cezayla geri atılabilir
        const pendingTaken = this.pendingTakenTileId(player);
        if (pendingTaken && pendingTaken !== tileId) {
            return { tile: null, penalties: [], error: 'Yandan aldığın taşı kullanmalısın (ya da 100 ceza ile geri at)' };
        }
        if (pendingTaken) {
            penalties.push({ playerId, amount: 100, reason: 'Yandan alınan taş kullanılmadı' });
        } else if (player.tiles.length > 1) {
            // Eli bitiren son taş hariç: masadaki bir pere eklenebilecek taşı atmak taş × 10 ceza
            const islek = this.islekPenalty(tile);
            if (islek > 0) penalties.push({ playerId, amount: islek, reason: 'İşlenebilir taş atıldı' });
        }
        penalties.forEach(p => player.addPenalty(p.amount));

        player.removeTile(tileId);
        // Son taş: bitiren bu sırada açtıysa "elden bitme"
        if (player.tiles.length === 0) this.finishedElden = player.openedAtTurn === this.turnCounter;
        tile.setStatus(TileStatus.DISCARDED);
        tile.setVisible(true);
        this.discardPile.push(tile);
        this.lastDiscardPlayerId = playerId;
        this.takenDiscardTileId = null;

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

    // Taş masadaki bir perin başına ya da sonuna eklenebiliyorsa ceza = değer × 10
    islekPenalty(tile: Tile): number {
        const played = this.asPlayed(tile); // sahte okey, okeyin değeriyle işlenebilir
        if (this.isOkeyTile(played) || typeof played.value !== 'number') return 0;
        const fits = this.tableSets.some(set => set.kind !== 'cift' &&
            (this.validateSetTiles([tile, ...set.tiles]) > 0 || this.validateSetTiles([...set.tiles, tile]) > 0)
        );
        return fits ? played.value * 10 : 0;
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
    }

    isPlayerTurn(playerId: string): boolean {
        // Tur arası (ROUND_ENDED) ve oyun sonunda kimse hamle yapamaz
        return this.status === GameStatus.STARTED && this.players[this.currentPlayerIndex].id === playerId;
    }

    // Süre dolunca atılacak taş: okey/joker olmayan en küçük sayılı taş
    pickAutoDiscard(playerId: string): Tile | null {
        const player = this.getPlayerById(playerId);
        if (!player || player.tiles.length === 0) return null;
        const pendingTaken = this.pendingTakenTileId(player);
        if (pendingTaken) return player.tiles.find(t => t.id === pendingTaken) || null;
        const plain = player.tiles.filter(t => !t.isJoker && !this.isOkeyTile(t) && typeof t.value === 'number');
        if (plain.length === 0) return player.tiles[0];
        return plain.reduce((min, t) => (t.value as number) < (min.value as number) ? t : min);
    }

    getPlayerById(playerId: string): Player | undefined {
        return this.players.find(player => player.id === playerId);
    }

    // ── El Açma / Taş Oynama ───────────────────────────────

    openHand(playerId: string, setTileIds: string[][], kind: SetKind = 'seri'): {
        success: boolean;
        error?: string;
        newSets?: TableSet[];
        openedTotal?: number;
        remainingTiles?: Record<string, any>[];
        turnAction?: TurnAction;
        penalty?: number;
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

        // Masadaki en yüksek açılış değerini bul (tüm oyuncular)
        const maxOpenedValue = this.players.reduce((max, p) =>
            p.lastOpenedValue > max ? p.lastOpenedValue : max, 0
        );

        // Minimum değer kontrolü
        // Yetersiz değerle açma denemesi: 100 ceza, geri alma yok
        if (kind === 'cift' && totalValue < 51) {
            player.addPenalty(100);
            return { success: false, error: `Çift açmak için çiftlerin toplamı en az 51 olmalı (${totalValue}): 100 ceza`, penalty: 100 };
        }
        if (kind === 'seri' && maxOpenedValue === 0 && totalValue < 51) {
            player.addPenalty(100);
            return { success: false, error: `İlk açılış için en az 51 gerekli (${totalValue}): 100 ceza`, penalty: 100 };
        }
        if (kind === 'seri' && maxOpenedValue > 0 && totalValue <= maxOpenedValue) {
            player.addPenalty(100);
            return { success: false, error: `Masadaki en yüksek açılışı (${maxOpenedValue}) geçmeli: 100 ceza`, penalty: 100 };
        }

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

        player.isOpen = true;
        player.openedWithPairs = kind === 'cift';
        player.openedAtTurn = this.turnCounter;
        // Çift açılışı seri açılış eşiğini (katlama) yükseltmez
        if (kind === 'seri') player.lastOpenedValue = totalValue;
        player.openedTotal += totalValue;
        // openingScore sadece ilk açılışta set edilir (player.openingScore === 0 kontrolü)
        if (player.openingScore === 0) {
            player.openingScore = totalValue;
        }
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
            turnAction: this.turnAction
        };
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
        penalty?: { targetPlayerId: string; amount: number };
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
            return { success: false, error: 'Çiftlere taş işlenemez' };
        }

        const setOwner = this.getPlayerById(targetSet.playerId);

        // 1. Okey swap denemesi — sette joker/okey varsa yerine gerçek taşı koy
        // Bu turda okey işlemiş oyuncu tekrar okey alamaz
        const okeyIndex = targetSet.tiles.findIndex(t => this.isOkeyTile(t));
        if (okeyIndex !== -1 && !this.okeyPlayedThisTurn && !this.isOkeyTile(tile)) {
            // Erkek per (aynı sayı seti): okey swap ancak set 4 taşla doluyken
            // Sıralı per: tek taş ile swap mümkün
            const isSameNumber = this.isSameNumberSet(targetSet.tiles);
            const canSwapOkey = !isSameNumber || targetSet.tiles.length === 4;

            if (canSwapOkey) {
                const testTiles = [...targetSet.tiles];
                testTiles[okeyIndex] = tile;

                const newValue = this.validateSetTiles(testTiles);
                if (newValue > 0) {
                    const okeyTile = targetSet.tiles[okeyIndex];

                    player.removeTile(tileId);
                    tile.setStatus(TileStatus.ON_TABLE);
                    tile.setVisible(true);

                    targetSet.tiles[okeyIndex] = tile;
                    targetSet.value = newValue;

                    okeyTile.setStatus(TileStatus.IN_HAND);
                    player.addTile(okeyTile);

                    // Set sahibine 100 puan ceza
                    let penalty: { targetPlayerId: string; amount: number } | undefined;
                    if (setOwner) {
                        setOwner.addPenalty(100);
                        penalty = { targetPlayerId: setOwner.id, amount: 100 };
                    }

                    this.lastActionTime = new Date();

                    return {
                        success: true,
                        updatedSet: this.tableSetToJSON(targetSet),
                        swappedOkeyTile: okeyTile.toJSON(),
                        penalty,
                        remainingTiles: player.tiles.map(t => t.toJSON())
                    };
                }
            }
        }

        // 2. Normal ekleme — client'ın belirttiği pozisyona ekle
        const testTiles = position === 'start'
            ? [tile, ...targetSet.tiles]
            : [...targetSet.tiles, tile];

        const newValue = this.validateSetTiles(testTiles);
        if (newValue <= 0) {
            return { success: false, error: 'Bu taş bu pozisyona eklenemez' };
        }

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
        let penalty: { targetPlayerId: string; amount: number } | undefined;
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
            penalty = { targetPlayerId: setOwner.id, amount: penaltyAmount };
        }

        this.lastActionTime = new Date();

        return {
            success: true,
            updatedSet: this.tableSetToJSON(targetSet),
            penalty,
            remainingTiles: player.tiles.map(t => t.toJSON())
        };
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

    private isOkeyTile(tile: Tile): boolean {
        if (this.isHugoRound()) return tile.isJoker;
        // Normal elde joker sahte okeydir: okeyin değerini taşır ama joker gibi davranmaz
        if (tile.isJoker || (tile as SahteTile).sahte || !this.okeyTile) return false;
        return tile.color === this.okeyTile.color && tile.value === this.okeyTile.value;
    }

    // Normal elde sahte okey (joker), okey taşının rengi ve sayısıyla sıradan taş gibi oynanır
    private asPlayed(tile: Tile): Tile {
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

    private validateSetTiles(rawTiles: Tile[]): number {
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
     *   elde kalan     = açmışsa taş değerleri toplamı × 20 (sahte okey okeyin değeriyle; okey 0)
     *                    açmamışsa 400 (kimse açmadıysa 800)
     *   özel durumlar  = Hugo, okeyle bitme, çiftten bitme, elden bitme — her biri ×2
     *                    (örn. tek özel durum: taş × 40, Hugo + okeyle bitme: taş × 80)
     *   Hugo dışındaki özel durumlar yalnızca elde kalana; Hugo ×2 cezalar dahil her şeye uygulanır
     *   kullanılmayan okey = elde kalan her okey için +100 ceza
     *   roundTotal     = max(0, (elde kalan × özel + cezalar + okey cezası) × Hugo − yıldız × 100)
     */
    endRound(finisherPlayerId?: string): RoundResult[] {
        // Resolve finisher: prefer explicit argument, fall back to game state
        const resolvedFinisherId = finisherPlayerId ?? this.finisherPlayerId ?? '';
        const finisher = this.getPlayerById(resolvedFinisherId);
        const hugoMult = this.isHugoRound() ? 2 : 1;
        const jokerMult = this.finishedWithJoker ? 2 : 1;
        const finishedWithPairs = !!finisher?.openedWithPairs;
        const finishedElden = !!finisher && this.finishedElden;
        const handMult = jokerMult * (finishedWithPairs ? 2 : 1) * (finishedElden ? 2 : 1);

        // Determine if no other player (excluding finisher) has opened their hand
        const nonFinishers = this.players.filter(p => p.id !== resolvedFinisherId);
        const noOtherPlayersOpened = nonFinishers.every(p => !p.isOpen);
        const closedHandPenalty = noOtherPlayersOpened ? 800 : 400;

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
                        return sum + played.value * 20;
                    }, 0);
                }
                effectiveHandScore = handScore * handMult;
                unusedOkeyPenalty = player.tiles.filter(t => this.isOkeyTile(t)).length * 100;
            }

            const openBonus = 0;   // reserved for future use
            const finishBonus = 0; // reserved for future use

            const rawTotal = effectiveHandScore + player.penaltyScore + unusedOkeyPenalty + openBonus + finishBonus;
            const preMult = rawTotal * hugoMult;
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
                stars = 1 * jokerStarMult * hugoStarMult * closedStarMult;
            } else {
                // Diğer oyuncular: 100+ puanla el açtılarsa 1 yıldız
                stars = player.openingScore >= 100 ? 1 : 0;
            }

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

        // Tur numarası burada artmaz; yeni eli yalnızca startNextRound() başlatır
        this.status = this.round >= 9 ? GameStatus.FINISHED : GameStatus.ROUND_ENDED;

        return results;
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
        this.tableSets = [];
        this.okeyPlayedThisTurn = false;
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
            tableSets: this.tableSetsToJSON(),
            isHugoRound: this.isHugoRound(),
            roundEndResults: this.roundEndResults,
            createdAt: this.createdAt
        };
    }
} 