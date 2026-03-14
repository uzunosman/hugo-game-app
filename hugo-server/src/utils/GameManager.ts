import { Player } from '../models/Player';
import { Room, RoomStatus } from '../models/Room';
import { Game, GameStatus } from '../models/Game';
import { Tile } from '../models/Tile';

export class GameManager {
    private static instance: GameManager;
    private rooms: Map<string, Room>;
    private players: Map<string, Player>;
    private socketToPlayer: Map<string, string>;

    private constructor() {
        this.rooms = new Map<string, Room>();
        this.players = new Map<string, Player>();
        this.socketToPlayer = new Map<string, string>();
    }

    public static getInstance(): GameManager {
        if (!GameManager.instance) {
            GameManager.instance = new GameManager();
        }
        return GameManager.instance;
    }

    // Oyuncu Yönetimi
    public createPlayer(name: string, socketId: string): Player {
        const player = new Player(name, socketId);
        this.players.set(player.id, player);
        this.socketToPlayer.set(socketId, player.id);
        return player;
    }

    public getPlayerById(playerId: string): Player | undefined {
        return this.players.get(playerId);
    }

    public getPlayerBySocketId(socketId: string): Player | undefined {
        const playerId = this.socketToPlayer.get(socketId);
        if (playerId) {
            return this.players.get(playerId);
        }
        return undefined;
    }

    public updatePlayerSocket(playerId: string, socketId: string): boolean {
        const player = this.players.get(playerId);
        if (player) {
            // Eski socket-player eşleşmesini kaldır
            this.socketToPlayer.delete(player.socketId);

            // Yeni socket-player eşleşmesini ekle
            player.socketId = socketId;
            this.socketToPlayer.set(socketId, playerId);
            return true;
        }
        return false;
    }

    public removePlayer(playerId: string): boolean {
        const player = this.players.get(playerId);
        if (player) {
            // Oyuncuyu odadan çıkar
            if (player.roomId) {
                this.removePlayerFromRoom(player.id, player.roomId);
            }

            // Socket-player eşleşmesini kaldır
            this.socketToPlayer.delete(player.socketId);

            // Oyuncuyu kaldır
            this.players.delete(playerId);
            return true;
        }
        return false;
    }

    public removePlayerBySocketId(socketId: string): boolean {
        const playerId = this.socketToPlayer.get(socketId);
        if (playerId) {
            return this.removePlayer(playerId);
        }
        return false;
    }

    // Oda Yönetimi
    public createRoom(name: string, ownerId: string): Room | null {
        const owner = this.players.get(ownerId);
        if (!owner) {
            return null;
        }

        const room = new Room(name, owner);
        this.rooms.set(room.id, room);
        return room;
    }

    public getRoomById(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }

    public getAllRooms(): Room[] {
        return Array.from(this.rooms.values());
    }

    public addPlayerToRoom(playerId: string, roomId: string): boolean {
        const player = this.players.get(playerId);
        const room = this.rooms.get(roomId);

        if (!player || !room) {
            return false;
        }

        // Oyuncu zaten bir odada mı kontrol et
        if (player.roomId) {
            // Aynı odadaysa işlem yapma
            if (player.roomId === roomId) {
                return true;
            }

            // Farklı odadaysa önce o odadan çıkar
            this.removePlayerFromRoom(playerId, player.roomId);
        }

        // Oyuncuyu odaya ekle
        return room.addPlayer(player);
    }

    public removePlayerFromRoom(playerId: string, roomId: string): boolean {
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }

        const removedPlayer = room.removePlayer(playerId);
        if (removedPlayer) {
            // Eğer oda boşsa, odayı kaldır
            if (room.players.length === 0) {
                this.rooms.delete(roomId);
            }
            return true;
        }

        return false;
    }

    public startGame(roomId: string): boolean {
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }

        return room.startGame();
    }

    public endGame(roomId: string): boolean {
        const room = this.rooms.get(roomId);
        if (!room || room.status !== RoomStatus.PLAYING) {
            return false;
        }

        room.endGame();
        return true;
    }

    public resetGame(roomId: string): boolean {
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }

        room.resetGame();
        return true;
    }

    // Oyun İşlemleri
    public drawTile(playerId: string, fromDiscard: boolean = false): Tile | null {
        const player = this.players.get(playerId);
        if (!player || !player.roomId) {
            return null;
        }

        const room = this.rooms.get(player.roomId);
        if (!room || !room.game) {
            return null;
        }

        return room.game.drawTile(playerId, fromDiscard);
    }

    public discardTile(playerId: string, tileId: string): Tile | null {
        const player = this.players.get(playerId);
        if (!player || !player.roomId) {
            return null;
        }

        const room = this.rooms.get(player.roomId);
        if (!room || !room.game) {
            return null;
        }

        return room.game.discardTile(playerId, tileId);
    }

    public openHand(playerId: string, setTileIds: string[][]) {
        const player = this.players.get(playerId);
        if (!player || !player.roomId) {
            return { success: false, error: 'Oyuncu bulunamadı' };
        }

        const room = this.rooms.get(player.roomId);
        if (!room || !room.game) {
            return { success: false, error: 'Aktif oyun bulunamadı' };
        }

        return room.game.openHand(playerId, setTileIds);
    }

    public addTileToSet(playerId: string, tileId: string, targetSetId: string, position: 'start' | 'end') {
        const player = this.players.get(playerId);
        if (!player || !player.roomId) {
            return { success: false, error: 'Oyuncu bulunamadı' };
        }

        const room = this.rooms.get(player.roomId);
        if (!room || !room.game) {
            return { success: false, error: 'Aktif oyun bulunamadı' };
        }

        return room.game.addTileToSet(playerId, tileId, targetSetId, position);
    }

    public dropPer(playerId: string, setTileIds: string[][]) {
        const player = this.players.get(playerId);
        if (!player || !player.roomId) {
            return { success: false, error: 'Oyuncu bulunamadı' };
        }

        const room = this.rooms.get(player.roomId);
        if (!room || !room.game) {
            return { success: false, error: 'Aktif oyun bulunamadı' };
        }

        return room.game.dropPer(playerId, setTileIds);
    }

    // Yardımcı Metodlar
    public getPlayerRoom(playerId: string): Room | undefined {
        const player = this.players.get(playerId);
        if (player && player.roomId) {
            return this.rooms.get(player.roomId);
        }
        return undefined;
    }

    public isPlayerInRoom(playerId: string, roomId: string): boolean {
        const room = this.rooms.get(roomId);
        return !!room && room.isPlayerInRoom(playerId);
    }

    public isRoomOwner(playerId: string, roomId: string): boolean {
        const room = this.rooms.get(roomId);
        return !!room && room.owner.id === playerId;
    }

    public getRoomPlayers(roomId: string): Player[] {
        const room = this.rooms.get(roomId);
        return room ? room.players : [];
    }

    public getPlayerCount(): number {
        return this.players.size;
    }

    public getRoomCount(): number {
        return this.rooms.size;
    }
} 