import { v4 as uuidv4 } from 'uuid';
import { Tile, TileStatus } from './Tile';

export class Player {
    id: string;
    name: string;
    socketId: string;
    tiles: Tile[];
    score: number;
    isReady: boolean;
    isTurn: boolean;
    roomId: string | null;
    isOpen: boolean;
    lastOpenedValue: number;
    openedTotal: number;
    penaltyScore: number;

    constructor(name: string, socketId: string) {
        this.id = uuidv4();
        this.name = name;
        this.socketId = socketId;
        this.tiles = [];
        this.score = 0;
        this.isReady = false;
        this.isTurn = false;
        this.roomId = null;
        this.isOpen = false;
        this.lastOpenedValue = 0;
        this.openedTotal = 0;
        this.penaltyScore = 0;
    }

    addTile(tile: Tile): void {
        tile.setStatus(TileStatus.IN_HAND);
        this.tiles.push(tile);
    }

    removeTile(tileId: string): Tile | undefined {
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

    setReady(ready: boolean): void {
        this.isReady = ready;
    }

    setTurn(turn: boolean): void {
        this.isTurn = turn;
    }

    setRoomId(roomId: string | null): void {
        this.roomId = roomId;
    }

    addScore(points: number): void {
        this.score += points;
    }

    addPenalty(points: number): void {
        this.penaltyScore += points;
    }

    resetScore(): void {
        this.score = 0;
        this.penaltyScore = 0;
    }

    clearTiles(): void {
        this.tiles = [];
    }

    toJSON(): Record<string, any> {
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

    toPublicJSON(): Record<string, any> {
        return {
            id: this.id,
            name: this.name,
            tilesCount: this.tiles.length,
            score: this.score,
            penaltyScore: this.penaltyScore,
            isReady: this.isReady,
            isTurn: this.isTurn,
            isOpen: this.isOpen,
            lastOpenedValue: this.lastOpenedValue,
            openedTotal: this.openedTotal
        };
    }
} 