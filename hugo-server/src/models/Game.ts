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
    }

    isPlayerTurn(playerId: string): boolean {
        return this.players[this.currentPlayerIndex].id === playerId;
    }

    getPlayerById(playerId: string): Player | undefined {
        return this.players.find(player => player.id === playerId);
    }

    isHugoRound(): boolean {
        // 1., 5. ve 9. turlar Hugo turudur
        return [1, 5, 9].includes(this.round);
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
            isHugoRound: this.isHugoRound(),
            createdAt: this.createdAt
        };
    }
} 