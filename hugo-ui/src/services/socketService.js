import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

class SocketService {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.activeRoomId = null;
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
        this.socket.emit('room:create', { name, playerId: this.playerId }, (response) => {
            if (response.success) {
                this.activeRoomId = response.room.id;
            }
            if (callback) callback(response);
        });
    }

    joinRoom(roomId, callback) {
        this.socket.emit('room:join', { roomId, playerId: this.playerId }, (response) => {
            if (response.success) {
                this.activeRoomId = roomId;
            }
            if (callback) callback(response);
        });
    }

    leaveRoom(roomId, callback) {
        this.socket.emit('room:leave', { roomId, playerId: this.playerId }, (response) => {
            if (response.success) {
                this.activeRoomId = null;
            }
            if (callback) callback(response);
        });
    }

    getRooms(callback) {
        this.socket.emit('rooms:list', {}, callback);
    }

    setReady(roomId, ready, callback) {
        if (!roomId) {
            roomId = this.activeRoomId;
            if (!roomId) {
                console.error('Aktif oda bulunamadı');
                if (callback) callback({ success: false, error: 'Aktif oda bulunamadı' });
                return;
            }
        }

        this.socket.emit('player:ready', { roomId, playerId: this.playerId, ready }, callback);
    }

    startGame(roomId, callback) {
        if (!roomId) {
            roomId = this.activeRoomId;
            if (!roomId) {
                console.error('Aktif oda bulunamadı');
                if (callback) callback({ success: false, error: 'Aktif oda bulunamadı' });
                return;
            }
        }

        this.socket.emit('game:start', { roomId, playerId: this.playerId }, callback);
    }

    drawTile(fromDiscard, callback) {
        const roomId = this.activeRoomId;
        if (!roomId) {
            console.error('Aktif oda bulunamadı');
            if (callback) callback({ success: false, error: 'Aktif oda bulunamadı' });
            return;
        }

        console.log('drawTile çağrılıyor:', {
            playerId: this.playerId,
            roomId,
            fromDiscard
        });

        this.socket.emit('game:drawTile', { playerId: this.playerId, roomId, fromDiscard }, (response) => {
            console.log('drawTile yanıtı:', response);
            if (callback) callback(response);
        });
    }

    discardTile(tileId, callback) {
        const roomId = this.activeRoomId;
        if (!roomId) {
            console.error('Aktif oda bulunamadı');
            if (callback) callback({ success: false, error: 'Aktif oda bulunamadı' });
            return;
        }

        this.socket.emit('game:discardTile', { playerId: this.playerId, roomId, tileId }, callback);
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

    offNextTurn() {
        this.socket.off('game:nextTurn');
    }

    onGameStateChange(callback) {
        this.socket.on('game:stateChange', callback);
    }

    offGameStateChange() {
        this.socket.off('game:stateChange');
    }

    offGameTiles() {
        this.socket.off('game:tiles');
    }

    offTileDraw() {
        this.socket.off('game:tileDraw');
    }

    offTileDiscard() {
        this.socket.off('game:tileDiscard');
    }
}

// Singleton örneği oluştur
const socketService = new SocketService();
export default socketService; 