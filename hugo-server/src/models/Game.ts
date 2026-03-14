import { v4 as uuidv4 } from 'uuid';
import { Player } from './Player';
import { Tile, TileColor, TileStatus } from './Tile';

export enum GameStatus {
    WAITING = 'waiting',
    STARTED = 'started',
    FINISHED = 'finished'
}

export enum TurnAction {
    DRAW = 'draw',
    DISCARD = 'discard'
}

export interface TableSet {
    id: string;
    playerId: string;
    tiles: Tile[];
    value: number;
}

export class Game {
    id: string;
    players: Player[];
    deck: Tile[];
    discardPile: Tile[];
    currentPlayerIndex: number;
    status: GameStatus;
    round: number;
    turnAction: TurnAction;
    indicatorTile: Tile | null;
    okeyTile: Tile | null;
    lastDiscardPlayerId: string | null;
    tableSets: TableSet[];
    okeyPlayedThisTurn: boolean;
    createdAt: Date;
    lastActionTime: Date;

    constructor(players: Player[]) {
        this.id = uuidv4();
        this.players = [...players];
        this.deck = [];
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.status = GameStatus.WAITING;
        this.round = 1;
        this.turnAction = TurnAction.DRAW;
        this.indicatorTile = null;
        this.okeyTile = null;
        this.lastDiscardPlayerId = null;
        this.okeyPlayedThisTurn = false;
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
        // İlk oyuncuya 15 taş, diğerlerine 14 taş dağıt
        this.players.forEach((player, index) => {
            const tileCount = index === 0 ? 15 : 14;

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
            this.turnAction = TurnAction.DISCARD;
            this.lastActionTime = new Date();
            return drawnTile;
        }

        return null;
    }

    discardTile(playerId: string, tileId: string): Tile | null {
        console.log(`[DEBUG] discardTile çağrıldı - playerId: ${playerId}, tileId: ${tileId}`);

        // Oyuncunun sırası mı kontrol et
        const player = this.getPlayerById(playerId);
        console.log(`[DEBUG] Oyuncu bulundu mu: ${!!player}`);

        if (!player) {
            console.log(`[DEBUG] Oyuncu bulunamadı: ${playerId}`);
            return null;
        }

        const isPlayerTurn = this.isPlayerTurn(playerId);
        console.log(`[DEBUG] Oyuncunun sırası mı: ${isPlayerTurn}`);

        console.log(`[DEBUG] Mevcut aksiyon: ${this.turnAction}`);

        // İlk tur kontrolü - oyuncunun 15 taşı varsa ve sırası geldiyse taş atabilir
        const isFirstTurn = player.tiles.length === 15 && this.turnAction === TurnAction.DRAW;
        console.log(`[DEBUG] İlk tur mu: ${isFirstTurn}, Taş sayısı: ${player.tiles.length}`);

        if (!isPlayerTurn || (this.turnAction !== TurnAction.DISCARD && !isFirstTurn)) {
            console.log(`[DEBUG] Oyuncunun sırası değil veya taş atma aksiyonu değil`);
            return null;
        }

        // Taşı oyuncudan çıkar
        const discardedTile = player.removeTile(tileId);
        console.log(`[DEBUG] Taş oyuncudan çıkarıldı mı: ${!!discardedTile}`);

        if (discardedTile) {
            // Taşı atılan taşlar yığınına ekle
            discardedTile.setStatus(TileStatus.DISCARDED);
            discardedTile.setVisible(true);
            this.discardPile.push(discardedTile);
            this.lastDiscardPlayerId = playerId;
            console.log(`[DEBUG] Taş atılan taşlar yığınına eklendi. Yeni yığın boyutu: ${this.discardPile.length}`);

            // Sırayı bir sonraki oyuncuya geçir
            this.nextTurn();
            console.log(`[DEBUG] Sıra bir sonraki oyuncuya geçti. Yeni oyuncu indeksi: ${this.currentPlayerIndex}`);

            this.lastActionTime = new Date();
            return discardedTile;
        } else {
            console.log(`[DEBUG] Taş oyuncudan çıkarılamadı. Taş ID: ${tileId}`);
        }

        return null;
    }

    nextTurn(): void {
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
        return this.players[this.currentPlayerIndex].id === playerId;
    }

    getPlayerById(playerId: string): Player | undefined {
        return this.players.find(player => player.id === playerId);
    }

    // ── El Açma / Taş Oynama ───────────────────────────────

    openHand(playerId: string, setTileIds: string[][]): {
        success: boolean;
        error?: string;
        newSets?: TableSet[];
        openedTotal?: number;
        remainingTiles?: Record<string, any>[];
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

        if (!setTileIds || setTileIds.length === 0) {
            return { success: false, error: 'En az bir set gerekli' };
        }

        // Her set'i doğrula
        let totalValue = 0;
        const validatedSets: { tiles: Tile[]; value: number }[] = [];

        for (const tileIds of setTileIds) {
            if (tileIds.length < 3) {
                return { success: false, error: 'Her sette en az 3 taş olmalı' };
            }

            const tiles: Tile[] = [];
            for (const id of tileIds) {
                const tile = player.tiles.find(t => t.id === id);
                if (!tile) {
                    return { success: false, error: 'Taş oyuncunun elinde bulunamadı' };
                }
                tiles.push(tile);
            }

            const setValue = this.validateSetTiles(tiles);
            if (setValue === 0) {
                return { success: false, error: 'Geçersiz set' };
            }

            validatedSets.push({ tiles, value: setValue });
            totalValue += setValue;
        }

        // Masadaki en yüksek açılış değerini bul (tüm oyuncular)
        const maxOpenedValue = this.players.reduce((max, p) =>
            p.lastOpenedValue > max ? p.lastOpenedValue : max, 0
        );

        // Minimum değer kontrolü
        if (maxOpenedValue === 0 && totalValue < 51) {
            return { success: false, error: 'İlk açılış için minimum 51 puan gerekli' };
        }
        if (maxOpenedValue > 0 && totalValue <= maxOpenedValue) {
            return { success: false, error: `Masadaki en yüksek değerden (${maxOpenedValue}) büyük olmalı` };
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
            const tableSet: TableSet = { id: setId, playerId, tiles, value };
            this.tableSets.push(tableSet);
            newSets.push(tableSet);
        }

        player.isOpen = true;
        player.lastOpenedValue = totalValue;
        player.openedTotal += totalValue;
        this.lastActionTime = new Date();

        return {
            success: true,
            newSets,
            openedTotal: player.openedTotal,
            remainingTiles: player.tiles.map(t => t.toJSON())
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

        const setOwner = this.getPlayerById(targetSet.playerId);

        // 1. Okey swap denemesi — sette joker varsa yerine gerçek taşı koy
        // Bu turda okey işlemiş oyuncu tekrar okey alamaz
        const okeyIndex = targetSet.tiles.findIndex(t => t.isJoker);
        if (okeyIndex !== -1 && !this.okeyPlayedThisTurn && !tile.isJoker) {
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

        // Okey (joker) işlendiyse bu turda geri alınamaz
        if (tile.isJoker) {
            this.okeyPlayedThisTurn = true;
        }

        // Ceza: sadece başka oyuncunun setine ekleme → taş değeri × 10
        // Joker için pozisyondaki etkin değeri hesapla
        let penalty: { targetPlayerId: string; amount: number } | undefined;
        if (setOwner && setOwner.id !== playerId) {
            let effectiveValue: number;
            if (tile.isJoker) {
                effectiveValue = this.calculateEffectiveValue(targetSet.tiles, tile, position);
            } else {
                effectiveValue = typeof tile.value === 'number' ? tile.value : 0;
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

    // Joker'in sete eklendiği pozisyondaki etkin değerini hesapla
    private calculateEffectiveValue(tilesAfterInsert: Tile[], jokerTile: Tile, position: 'start' | 'end'): number {
        // Sıralı set ise pozisyona göre değer çıkar
        const normalTiles = tilesAfterInsert.filter(t => !t.isJoker && typeof t.value === 'number');
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
            value: set.value
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

        const validatedSets: { tiles: Tile[]; value: number }[] = [];

        for (const tileIds of setTileIds) {
            if (tileIds.length < 3) {
                return { success: false, error: 'Her sette en az 3 taş olmalı' };
            }

            const tiles: Tile[] = [];
            for (const id of tileIds) {
                const tile = player.tiles.find(t => t.id === id);
                if (!tile) {
                    return { success: false, error: 'Taş oyuncunun elinde bulunamadı' };
                }
                tiles.push(tile);
            }

            const setValue = this.validateSetTiles(tiles);
            if (setValue === 0) {
                return { success: false, error: 'Geçersiz set' };
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
            const tableSet: TableSet = { id: setId, playerId, tiles, value };
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
        const normalTiles = tiles.filter(t => !t.isJoker);
        if (normalTiles.length === 0) return false;
        const value = normalTiles[0].value;
        return normalTiles.every(t => t.value === value);
    }

    private validateSetTiles(tiles: Tile[]): number {
        if (tiles.length < 3) return 0;

        const sameNumberScore = this.validateSameNumberSetTiles(tiles);
        if (sameNumberScore > 0) return sameNumberScore;

        const sequentialScore = this.validateSequentialSetTiles(tiles);
        if (sequentialScore > 0) return sequentialScore;

        return 0;
    }

    private validateSameNumberSetTiles(tiles: Tile[]): number {
        if (tiles.length < 3 || tiles.length > 4) return 0;

        const normalTiles = tiles.filter(t => !t.isJoker);
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

        const normalTiles = tiles.filter(t => !t.isJoker);
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
                if (!tiles[i].isJoker) {
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

                if (!tiles[i].isJoker) {
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

    isHugoRound(): boolean {
        // 1., 5. ve 9. turlar Hugo turudur
        return [1, 5, 9].includes(this.round);
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
            lastDiscardPlayerId: this.lastDiscardPlayerId,
            tableSets: this.tableSetsToJSON(),
            isHugoRound: this.isHugoRound(),
            createdAt: this.createdAt
        };
    }
} 