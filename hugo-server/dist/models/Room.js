"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Room = exports.RoomStatus = void 0;
const uuid_1 = require("uuid");
const Game_1 = require("./Game");
var RoomStatus;
(function (RoomStatus) {
    RoomStatus["WAITING"] = "waiting";
    RoomStatus["PLAYING"] = "playing";
    RoomStatus["FINISHED"] = "finished";
})(RoomStatus || (exports.RoomStatus = RoomStatus = {}));
class Room {
    constructor(name, owner, maxPlayers = 4) {
        this.id = (0, uuid_1.v4)();
        this.name = name;
        this.owner = owner;
        this.players = [owner];
        this.status = RoomStatus.WAITING;
        this.game = null;
        this.maxPlayers = maxPlayers;
        this.createdAt = new Date();
        // Oda sahibini odaya ekle
        owner.setRoomId(this.id);
    }
    addPlayer(player) {
        if (this.players.length >= this.maxPlayers) {
            return false;
        }
        if (this.status !== RoomStatus.WAITING) {
            return false;
        }
        this.players.push(player);
        player.setRoomId(this.id);
        return true;
    }
    removePlayer(playerId) {
        const playerIndex = this.players.findIndex(player => player.id === playerId);
        if (playerIndex !== -1) {
            const [removedPlayer] = this.players.splice(playerIndex, 1);
            removedPlayer.setRoomId(null);
            // Eğer oda sahibi ayrıldıysa, yeni oda sahibi belirle
            if (this.owner.id === playerId && this.players.length > 0) {
                this.owner = this.players[0];
            }
            return removedPlayer;
        }
        return undefined;
    }
    startGame() {
        if (this.players.length !== this.maxPlayers) {
            return false;
        }
        if (this.status !== RoomStatus.WAITING) {
            return false;
        }
        this.game = new Game_1.Game(this.players);
        this.status = RoomStatus.PLAYING;
        return true;
    }
    endGame() {
        if (this.status === RoomStatus.PLAYING) {
            this.status = RoomStatus.FINISHED;
            // Oyuncuların taşlarını temizle
            this.players.forEach(player => {
                player.clearTiles();
            });
        }
    }
    resetGame() {
        this.status = RoomStatus.WAITING;
        this.game = null;
        // Oyuncuların hazır durumunu sıfırla
        this.players.forEach(player => {
            player.setReady(false);
            player.setTurn(false);
        });
    }
    isPlayerInRoom(playerId) {
        return this.players.some(player => player.id === playerId);
    }
    getPlayerById(playerId) {
        return this.players.find(player => player.id === playerId);
    }
    getPlayerBySocketId(socketId) {
        return this.players.find(player => player.socketId === socketId);
    }
    areAllPlayersReady() {
        return this.players.length === this.maxPlayers &&
            this.players.every(player => player.isReady);
    }
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            owner: this.owner.toPublicJSON(),
            players: this.players.map(player => player.toPublicJSON()),
            status: this.status,
            maxPlayers: this.maxPlayers,
            createdAt: this.createdAt,
            game: this.game ? this.game.toPublicJSON() : null
        };
    }
}
exports.Room = Room;
