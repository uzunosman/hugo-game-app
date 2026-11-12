import { io } from 'socket.io-client';

// Sunucu adresi: VITE_SOCKET_URL verilmezse sayfanın açıldığı makinenin 3001 portu (yerel ağda telefondan da çalışır)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `${window.location.protocol}//${window.location.hostname}:3001`;
const SESSION_KEY = 'hugo.playerId'; // sekme başına oturum: yenilemede aynı koltuğa dönülür

const readSession = () => { try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; } };
const writeSession = (id) => { try { id ? sessionStorage.setItem(SESSION_KEY, id) : sessionStorage.removeItem(SESSION_KEY); } catch { /* depolama kapalı */ } };

class SocketService {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.activeRoomId = null;
    }

    connect() {
        if (!this.socket) {
            this.socket = io(SOCKET_URL);
            // Bağlantı kopup geri gelince (ağ kesintisi ya da sunucu yeniden başladı) sayfa yenilenmez:
            // aynı oyuncu olarak yeniden tanıtılır, ekran sunucudaki güncel durumla yeniden kurulur
            // (kopukken kaçan olaylar böyle telafi edilir); oyuncu sunucuda yoksa girişe dönülür
            let connectedBefore = false;
            this.socket.on('connect', () => {
                if (connectedBefore && this.playerId) {
                    this.socket.emit('player:reconnect', { playerId: this.playerId }, (response) => {
                        if (response?.success) {
                            this.activeRoomId = response.room?.id || null;
                        } else {
                            writeSession(null);
                            this.playerId = null;
                            this.activeRoomId = null;
                        }
                        this.resyncHandler?.(response || { success: false });
                    });
                }
                connectedBefore = true;
            });
        }
        return this.socket;
    }

    // Yeniden bağlanınca App ekranı tazeler
    onResync(callback) {
        this.resyncHandler = callback;
    }

    savedPlayerId() {
        return readSession();
    }

    reconnect(playerId, callback) {
        this.socket.emit('player:reconnect', { playerId }, (response) => {
            if (response.success) {
                this.playerId = response.player.id;
                this.activeRoomId = response.room?.id || null;
            } else {
                writeSession(null);
            }
            callback(response);
        });
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
                writeSession(this.playerId);
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

    requestTiles(playerId, callback) {
        this.socket.emit('game:requestTiles', { playerId }, callback);
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

    // kind: 'seri' (per) ya da 'cift' (çiftle açma)
    openHand(sets, callback, kind = 'seri') {
        this.socket.emit('game:openHand', { playerId: this.playerId, sets, kind }, (response) => {
            if (callback) callback(response);
        });
    }

    onHandOpened(callback) {
        this.socket.on('game:handOpened', callback);
    }

    offHandOpened() {
        this.socket.off('game:handOpened');
    }

    addTileToSet(tileId, targetSetId, position, callback) {
        this.socket.emit('game:addTileToSet', { playerId: this.playerId, tileId, targetSetId, position }, (response) => {
            if (callback) callback(response);
        });
    }

    // Çiftlere çift işleme: iki taş birlikte hedef çiftin sahibine işlenir
    addPairToSet(tileIds, targetSetId, callback) {
        this.socket.emit('game:addPairToSet', { playerId: this.playerId, tileIds, targetSetId }, (response) => {
            if (callback) callback(response);
        });
    }

    onTileAddedToSet(callback) {
        this.socket.on('game:tileAddedToSet', callback);
    }

    offTileAddedToSet() {
        this.socket.off('game:tileAddedToSet');
    }

    dropPer(sets, callback) {
        this.socket.emit('game:dropPer', { playerId: this.playerId, sets }, (response) => {
            if (callback) callback(response);
        });
    }

    onPerDropped(callback) {
        this.socket.on('game:perDropped', callback);
    }

    offPerDropped() {
        this.socket.off('game:perDropped');
    }

    onRoundEnded(callback) {
        this.socket.on('game:roundEnded', callback);
    }

    offRoundEnded() {
        this.socket.off('game:roundEnded');
    }

    onPenalty(callback) {
        this.socket.on('game:penalty', callback);
    }

    offPenalty() {
        this.socket.off('game:penalty');
    }

    onPlayerConnection(callback) {
        this.socket.on('player:connection', callback);
    }

    offPlayerConnection() {
        this.socket.off('player:connection');
    }

    sendChat(text, callback) {
        this.socket.emit('chat:send', { playerId: this.playerId, text }, callback);
    }

    chatHistory(callback) {
        this.socket.emit('chat:history', { playerId: this.playerId }, callback);
    }

    onChatMessage(callback) {
        this.socket.on('chat:message', callback);
    }

    offChatMessage(callback) {
        this.socket.off('chat:message', callback);
    }

    addBot(roomId, callback) {
        this.socket.emit('room:addBot', { roomId, playerId: this.playerId }, callback);
    }

    removeBot(roomId, botId, callback) {
        this.socket.emit('room:removeBot', { roomId, playerId: this.playerId, botId }, callback);
    }

    undoTurn(callback) {
        this.socket.emit('game:undoTurn', { playerId: this.playerId }, callback);
    }

    onTurnUndone(callback) {
        this.socket.on('game:turnUndone', callback);
    }

    offTurnUndone() {
        this.socket.off('game:turnUndone');
    }

    returnTaken(callback) {
        this.socket.emit('game:returnTaken', { playerId: this.playerId }, callback);
    }

    onTileReturned(callback) {
        this.socket.on('game:tileReturned', callback);
    }

    offTileReturned() {
        this.socket.off('game:tileReturned');
    }

    onAutoPlayed(callback) {
        this.socket.on('game:autoPlayed', callback);
    }

    offAutoPlayed() {
        this.socket.off('game:autoPlayed');
    }

    onRoundStarted(callback) {
        this.socket.on('game:roundStarted', callback);
    }

    offRoundStarted() {
        this.socket.off('game:roundStarted');
    }
}

// Singleton örneği oluştur
const socketService = new SocketService();
export default socketService; 