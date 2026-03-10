"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Game = exports.TurnAction = exports.GameStatus = void 0;
const uuid_1 = require("uuid");
const Tile_1 = require("./Tile");
var GameStatus;
(function (GameStatus) {
    GameStatus["WAITING"] = "waiting";
    GameStatus["STARTED"] = "started";
    GameStatus["FINISHED"] = "finished";
})(GameStatus || (exports.GameStatus = GameStatus = {}));
var TurnAction;
(function (TurnAction) {
    TurnAction["DRAW"] = "draw";
    TurnAction["DISCARD"] = "discard";
})(TurnAction || (exports.TurnAction = TurnAction = {}));
class Game {
    constructor(players) {
        this.id = (0, uuid_1.v4)();
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
        this.createdAt = new Date();
        this.lastActionTime = new Date();
        // Oyunu başlat
        this.initializeGame();
    }
    initializeGame() {
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
    createTiles() {
        const colors = [Tile_1.TileColor.RED, Tile_1.TileColor.YELLOW, Tile_1.TileColor.BLUE, Tile_1.TileColor.BLACK];
        // Her renk için 1-13 arası taşları oluştur (her sayıdan 2 adet)
        colors.forEach(color => {
            for (let value = 1; value <= 13; value++) {
                // Her sayıdan 2 adet oluştur
                this.deck.push(new Tile_1.Tile(color, value));
                this.deck.push(new Tile_1.Tile(color, value));
            }
        });
        // 2 adet joker taşı ekle (mor renkte ve "H" değerinde)
        this.deck.push(new Tile_1.Tile(Tile_1.TileColor.PURPLE, 'H', true));
        this.deck.push(new Tile_1.Tile(Tile_1.TileColor.PURPLE, 'H', true));
    }
    shuffleDeck() {
        // Fisher-Yates algoritması ile taşları karıştır
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }
    determineIndicatorTile() {
        // Gösterge taşını belirle (son taşı al)
        if (this.deck.length > 0) {
            const indicatorTile = this.deck.pop();
            if (indicatorTile) {
                indicatorTile.setStatus(Tile_1.TileStatus.INDICATOR);
                indicatorTile.setVisible(true);
                this.indicatorTile = indicatorTile;
                // Hugo turu mu kontrol et (1., 5. ve 9. turlar)
                if (this.isHugoRound()) {
                    // Hugo turlarında joker taşları okey olur
                    this.okeyTile = null; // Jokerler zaten okey olduğu için null
                }
                else {
                    // Normal turlarda gösterge taşının bir üstü okey olur
                    this.determineOkeyTile();
                }
            }
        }
    }
    determineOkeyTile() {
        if (!this.indicatorTile || this.indicatorTile.isJoker)
            return;
        // Gösterge taşının bir üstü okey olur
        let okeyValue;
        // Eğer gösterge taşının değeri sayı ise
        if (typeof this.indicatorTile.value === 'number') {
            okeyValue = this.indicatorTile.value + 1;
            // Eğer gösterge 13 ise, okey 1 olur
            if (okeyValue > 13) {
                okeyValue = 1;
            }
            // Okey taşını bul (aynı renkte ve bir üst değerde)
            const okeyTile = this.deck.find(tile => tile.color === this.indicatorTile?.color && tile.value === okeyValue);
            if (okeyTile) {
                this.okeyTile = okeyTile;
            }
        }
    }
    dealTiles() {
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
    setFirstPlayer() {
        // İlk oyuncuyu belirle ve sırasını ayarla
        if (this.players.length > 0) {
            this.currentPlayerIndex = 0;
            this.players[this.currentPlayerIndex].setTurn(true);
        }
    }
    drawTile(playerId, fromDiscard = false) {
        // Oyuncunun sırası mı kontrol et
        const player = this.getPlayerById(playerId);
        if (!player || !this.isPlayerTurn(playerId) || this.turnAction !== TurnAction.DRAW) {
            return null;
        }
        // İlk oyuncunun ilk el kuralı: 15 taşı varken taş çekemez, direkt atar
        if (player.tiles.length === 15) {
            return null;
        }
        let drawnTile;
        if (fromDiscard && this.discardPile.length > 0) {
            // Atılan taşlardan çek
            drawnTile = this.discardPile.pop();
        }
        else {
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
    discardTile(playerId, tileId) {
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
            discardedTile.setStatus(Tile_1.TileStatus.DISCARDED);
            discardedTile.setVisible(true);
            this.discardPile.push(discardedTile);
            this.lastDiscardPlayerId = playerId;
            console.log(`[DEBUG] Taş atılan taşlar yığınına eklendi. Yeni yığın boyutu: ${this.discardPile.length}`);
            // Sırayı bir sonraki oyuncuya geçir
            this.nextTurn();
            console.log(`[DEBUG] Sıra bir sonraki oyuncuya geçti. Yeni oyuncu indeksi: ${this.currentPlayerIndex}`);
            this.lastActionTime = new Date();
            return discardedTile;
        }
        else {
            console.log(`[DEBUG] Taş oyuncudan çıkarılamadı. Taş ID: ${tileId}`);
        }
        return null;
    }
    nextTurn() {
        // Mevcut oyuncunun sırasını kapat
        this.players[this.currentPlayerIndex].setTurn(false);
        // Bir sonraki oyuncuya geç
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        // Yeni oyuncunun sırasını aç
        this.players[this.currentPlayerIndex].setTurn(true);
        // Tur aksiyonunu sıfırla
        this.turnAction = TurnAction.DRAW;
    }
    isPlayerTurn(playerId) {
        return this.players[this.currentPlayerIndex].id === playerId;
    }
    getPlayerById(playerId) {
        return this.players.find(player => player.id === playerId);
    }
    isHugoRound() {
        // 1., 5. ve 9. turlar Hugo turudur
        return [1, 5, 9].includes(this.round);
    }
    toJSON() {
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
    toPublicJSON() {
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
            isHugoRound: this.isHugoRound(),
            createdAt: this.createdAt
        };
    }
}
exports.Game = Game;
