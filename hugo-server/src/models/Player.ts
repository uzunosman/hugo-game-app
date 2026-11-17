import { v4 as uuidv4 } from 'uuid';
import { Tile, TileStatus } from './Tile';

export class Player {
    id: string;
    name: string;
    socketId: string;
    tiles: Tile[];
    isReady: boolean;
    isTurn: boolean;
    roomId: string | null;
    isOpen: boolean;
    lastOpenedValue: number;
    openedTotal: number;
    penaltyScore: number;
    penaltyEntries: number[];
    roundScores: number[];
    per100PlusCount: number;
    openingScore: number;
    connected: boolean;
    openedWithPairs: boolean; // bu elde çiftle açtı (sonra da yalnızca çift indirir)
    openedAtTurn: number;     // ilk açtığı sıranın numarası (elden bitme kontrolü)
    isBot: boolean;           // yapay zekâ oyuncu: sunucuda oynar, soketi yoktur
    avatar: string;           // oyuncunun seçtiği avatar tohumu (boşsa kimlikten üretilir)
    authToken = '';           // gizli oturum anahtarı: yalnızca sahibine verilir, yeniden bağlanmada istenir (toJSON'a girmez)
    legacyAuth = false;       // anahtar eski istemciye verildi (saklayamamış olabilir): anahtarla bir kez dönene kadar anahtarsız da kabul

    constructor(name: string, socketId: string) {
        this.id = uuidv4();
        this.name = name;
        this.socketId = socketId;
        this.tiles = [];
        this.isReady = false;
        this.isTurn = false;
        this.roomId = null;
        this.isOpen = false;
        this.lastOpenedValue = 0;
        this.openedTotal = 0;
        this.penaltyScore = 0;
        this.penaltyEntries = [];
        this.roundScores = [];
        this.per100PlusCount = 0;
        this.openingScore = 0;
        this.connected = true;
        this.isBot = false;
        this.openedWithPairs = false;
        this.openedAtTurn = -1;
        this.avatar = '';
    }

    addTile(tile: Tile): void {
        tile.setStatus(TileStatus.IN_HAND);
        this.tiles.push(tile);
    }

    removeTile(tileId: string): Tile | undefined {
        const tileIndex = this.tiles.findIndex(tile => tile.id === tileId);
        return tileIndex !== -1 ? this.tiles.splice(tileIndex, 1)[0] : undefined;
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

    // El sonu puanı: toplam her zaman roundScores'tan hesaplanır
    addRoundScore(points: number, stars: number): void {
        this.roundScores.push(points);
        this.per100PlusCount += stars; // tabeladaki ★ sayısı: kazanılan toplam yıldız
    }

    addPenalty(points: number): void {
        this.penaltyScore += points;
        this.penaltyEntries.push(points);
    }

    // Geri alınan ceza: tutarı ve son eşleşen kaydı siler
    removePenalty(points: number): void {
        this.penaltyScore -= points;
        const i = this.penaltyEntries.lastIndexOf(points);
        if (i !== -1) this.penaltyEntries.splice(i, 1);
    }

    resetForNewRound(): void {
        this.tiles = [];
        this.isOpen = false;
        this.lastOpenedValue = 0;
        this.openedTotal = 0;
        this.penaltyScore = 0;
        this.openingScore = 0;
        this.penaltyEntries = [];
        this.isTurn = false;
        this.openedWithPairs = false;
        this.openedAtTurn = -1;
    }

    // Aynı masada yeni oyun: puan tabelası da sıfırlanır
    resetForNewGame(): void {
        this.resetForNewRound();
        this.roundScores = [];
        this.per100PlusCount = 0;
    }

    getTotalScore(): number {
        return this.roundScores.reduce((sum, s) => sum + s, 0);
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
            score: this.getTotalScore(),
            isReady: this.isReady,
            isTurn: this.isTurn,
            roomId: this.roomId,
            avatar: this.avatar || ''
        };
    }

    toPublicJSON(): Record<string, any> {
        return {
            id: this.id,
            name: this.name,
            tilesCount: this.tiles.length,
            score: this.getTotalScore(),
            penaltyScore: this.penaltyScore,
            penaltyEntries: this.penaltyEntries,
            isReady: this.isReady,
            isTurn: this.isTurn,
            isOpen: this.isOpen,
            lastOpenedValue: this.lastOpenedValue,
            openedTotal: this.openedTotal,
            roundScores: this.roundScores,
            totalScore: this.getTotalScore(),
            per100PlusCount: this.per100PlusCount,
            openingScore: this.openingScore,
            connected: this.connected,
            openedWithPairs: this.openedWithPairs,
            isBot: !!this.isBot,
            avatar: this.avatar || '',
        };
    }
} 