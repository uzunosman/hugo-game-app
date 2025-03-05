"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameManager = void 0;
const Player_1 = require("../models/Player");
const Room_1 = require("../models/Room");
class GameManager {
    constructor() {
        this.rooms = new Map();
        this.players = new Map();
        this.socketToPlayer = new Map();
    }
    static getInstance() {
        if (!GameManager.instance) {
            GameManager.instance = new GameManager();
        }
        return GameManager.instance;
    }
    // Oyuncu Yönetimi
    createPlayer(name, socketId) {
        const player = new Player_1.Player(name, socketId);
        this.players.set(player.id, player);
        this.socketToPlayer.set(socketId, player.id);
        return player;
    }
    getPlayerById(playerId) {
        return this.players.get(playerId);
    }
    getPlayerBySocketId(socketId) {
        const playerId = this.socketToPlayer.get(socketId);
        if (playerId) {
            return this.players.get(playerId);
        }
        return undefined;
    }
    updatePlayerSocket(playerId, socketId) {
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
    removePlayer(playerId) {
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
    removePlayerBySocketId(socketId) {
        const playerId = this.socketToPlayer.get(socketId);
        if (playerId) {
            return this.removePlayer(playerId);
        }
        return false;
    }
    // Oda Yönetimi
    createRoom(name, ownerId) {
        const owner = this.players.get(ownerId);
        if (!owner) {
            return null;
        }
        const room = new Room_1.Room(name, owner);
        this.rooms.set(room.id, room);
        return room;
    }
    getRoomById(roomId) {
        return this.rooms.get(roomId);
    }
    getAllRooms() {
        return Array.from(this.rooms.values());
    }
    addPlayerToRoom(playerId, roomId) {
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
    removePlayerFromRoom(playerId, roomId) {
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
    startGame(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }
        return room.startGame();
    }
    endGame(roomId) {
        const room = this.rooms.get(roomId);
        if (!room || room.status !== Room_1.RoomStatus.PLAYING) {
            return false;
        }
        room.endGame();
        return true;
    }
    resetGame(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }
        room.resetGame();
        return true;
    }
    // Oyun İşlemleri
    drawTile(playerId, fromDiscard = false) {
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
    discardTile(playerId, tileId) {
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
    // Yardımcı Metodlar
    getPlayerRoom(playerId) {
        const player = this.players.get(playerId);
        if (player && player.roomId) {
            return this.rooms.get(player.roomId);
        }
        return undefined;
    }
    isPlayerInRoom(playerId, roomId) {
        const room = this.rooms.get(roomId);
        return !!room && room.isPlayerInRoom(playerId);
    }
    isRoomOwner(playerId, roomId) {
        const room = this.rooms.get(roomId);
        return !!room && room.owner.id === playerId;
    }
    getRoomPlayers(roomId) {
        const room = this.rooms.get(roomId);
        return room ? room.players : [];
    }
    getPlayerCount() {
        return this.players.size;
    }
    getRoomCount() {
        return this.rooms.size;
    }
}
exports.GameManager = GameManager;
