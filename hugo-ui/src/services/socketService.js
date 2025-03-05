import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

class SocketService {
    constructor() {
        this.socket = null;
        this.playerId = null;
    }

    connect() {
        if (!this.socket) {
            this.socket = io(SOCKET_URL);
            console.log('Socket bağlantısı kuruldu');
        }
        return this.socket;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            console.log('Socket bağlantısı kesildi');
        }
    }

    registerPlayer(name, callback) {
        this.socket.emit('player:register', { name }, (response) => {
            if (response.success) {
                this.playerId = response.player.id;
            }
            callback(response);
        });
    }

    createRoom(name, callback) {
        this.socket.emit('room:create', { name, playerId: this.playerId }, callback);
    }

    joinRoom(roomId, callback) {
        this.socket.emit('room:join', { roomId, playerId: this.playerId }, callback);
    }

    leaveRoom(roomId, callback) {
        this.socket.emit('room:leave', { roomId, playerId: this.playerId }, callback);
    }

    getRooms(callback) {
        this.socket.emit('rooms:list', {}, callback);
    }

    setReady(roomId, ready, callback) {
        this.socket.emit('player:ready', { roomId, playerId: this.playerId, ready }, callback);
    }

    startGame(roomId, callback) {
        this.socket.emit('game:start', { roomId, playerId: this.playerId }, callback);
    }

    drawTile(fromDiscard, callback) {
        this.socket.emit('game:drawTile', { playerId: this.playerId, fromDiscard }, callback);
    }

    discardTile(tileId, callback) {
        this.socket.emit('game:discardTile', { playerId: this.playerId, tileId }, callback);
    }

    onPlayerJoined(callback) {
        this.socket.on('player:joined', callback);
    }

    onPlayerLeft(callback) {
        this.socket.on('player:left', callback);
    }

    onPlayerReady(callback) {
        this.socket.on('player:ready', callback);
    }

    onRoomsList(callback) {
        this.socket.on('rooms:list', callback);
    }

    onGameStarted(callback) {
        this.socket.on('game:started', callback);
    }

    onGameTiles(callback) {
        this.socket.on('game:tiles', callback);
    }

    onTileDraw(callback) {
        this.socket.on('game:tileDraw', callback);
    }

    onTileDiscard(callback) {
        this.socket.on('game:tileDiscard', callback);
    }

    onNextTurn(callback) {
        this.socket.on('game:nextTurn', callback);
    }
}

// Singleton örneği oluştur
const socketService = new SocketService();
export default socketService; 