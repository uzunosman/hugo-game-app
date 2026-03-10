"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Player = void 0;
const uuid_1 = require("uuid");
const Tile_1 = require("./Tile");
class Player {
    constructor(name, socketId) {
        this.id = (0, uuid_1.v4)();
        this.name = name;
        this.socketId = socketId;
        this.tiles = [];
        this.score = 0;
        this.isReady = false;
        this.isTurn = false;
        this.roomId = null;
    }
    addTile(tile) {
        tile.setStatus(Tile_1.TileStatus.IN_HAND);
        this.tiles.push(tile);
    }
    removeTile(tileId) {
        console.log(`[DEBUG] removeTile çağrıldı - tileId: ${tileId}`);
        console.log(`[DEBUG] Mevcut taşlar: ${this.tiles.map(t => t.id).join(', ')}`);
        const tileIndex = this.tiles.findIndex(tile => tile.id === tileId);
        console.log(`[DEBUG] Taş indeksi: ${tileIndex}`);
        if (tileIndex !== -1) {
            const [removedTile] = this.tiles.splice(tileIndex, 1);
            console.log(`[DEBUG] Taş çıkarıldı: ${removedTile.id}`);
            console.log(`[DEBUG] Kalan taşlar: ${this.tiles.map(t => t.id).join(', ')}`);
            return removedTile;
        }
        console.log(`[DEBUG] Taş bulunamadı: ${tileId}`);
        return undefined;
    }
    setReady(ready) {
        this.isReady = ready;
    }
    setTurn(turn) {
        this.isTurn = turn;
    }
    setRoomId(roomId) {
        this.roomId = roomId;
    }
    addScore(points) {
        this.score += points;
    }
    resetScore() {
        this.score = 0;
    }
    clearTiles() {
        this.tiles = [];
    }
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            socketId: this.socketId,
            tiles: this.tiles.map(tile => tile.toJSON()),
            score: this.score,
            isReady: this.isReady,
            isTurn: this.isTurn,
            roomId: this.roomId
        };
    }
    toPublicJSON() {
        return {
            id: this.id,
            name: this.name,
            tilesCount: this.tiles.length,
            score: this.score,
            isReady: this.isReady,
            isTurn: this.isTurn
        };
    }
}
exports.Player = Player;
