import { io } from 'socket.io-client';

// Sunucu adresi: geliştirmede sayfanın açıldığı makinenin 3001 portu (yerel ağda telefondan da çalışır);
// yayında sayfanın kendi adresi (Caddy /socket.io isteklerini Node'a iletir). VITE_SOCKET_URL ikisini de ezer.
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
    || (import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:3001` : window.location.origin);
// Oturum (oyuncu kimliği + gizli anahtar): sekmede ve yayında kalıcı olarak da saklanır. iPhone ana ekran uygulaması
// kapatılıp açılınca sessionStorage silinir; localStorage'dan aynı koltuğa dönülür. Geliştirmede yalnızca sekme başına
// (bir tarayıcıda birkaç sekmeyle dört oyuncu test edilebilsin).
const SESSION_KEY = 'hugo.session';
const stores = () => (import.meta.env.DEV ? [sessionStorage] : [sessionStorage, localStorage]);
const readSession = () => {
    try {
        for (const s of stores()) { const v = JSON.parse(s.getItem(SESSION_KEY)); if (v?.playerId && v?.token) return v; }
        // Geçiş: eski sürümün sekme oturumu (anahtarsız); sunucu bir kez kabul edip anahtar verir
        const old = sessionStorage.getItem('hugo.playerId');
        if (old) return { playerId: old };
    } catch { /* depolama kapalı ya da bozuk */ }
    return null;
};
const writeSession = (session) => {
    try { stores().forEach(s => (session ? s.setItem(SESSION_KEY, JSON.stringify(session)) : s.removeItem(SESSION_KEY))); } catch { /* depolama kapalı */ }
};

// Admin anahtarı (admin ekranıyla aynı): staging'e bağlanmak ve test senaryoları için bağlantıda gönderilir
export const ADMIN_TOKEN_KEY = 'hugo.adminToken';
const adminToken = () => { try { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { return ''; } };

class SocketService {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.token = null;
        this.activeRoomId = null;
    }

    connect() {
        if (!this.socket) {
            // auth işlev: her (yeniden) bağlanmada anahtar yeniden okunur
            this.socket = io(SOCKET_URL, { auth: (cb) => cb(adminToken() ? { adminToken: adminToken() } : {}) });
            // Staging: anahtarsız bağlantı reddedilir; App anahtar sorar (AdminGate)
            this.socket.on('connect_error', (err) => {
                if (err?.message === 'admin-required') window.dispatchEvent(new Event('hugo:adminRequired'));
            });
            // Test senaryosu sıfırlandı: ekran sunucudaki yeni durumla yeniden kurulur
            this.socket.on('lab:reset', () => {
                if (!this.playerId) return;
                this.socket.emit('player:reconnect', { playerId: this.playerId, token: this.token }, (r) => this.resyncHandler?.(r || { success: false }));
            });
            // Bağlantı kopup geri gelince (ağ kesintisi ya da sunucu yeniden başladı) sayfa yenilenmez:
            // aynı oyuncu olarak yeniden tanıtılır, ekran sunucudaki güncel durumla yeniden kurulur
            // (kopukken kaçan olaylar böyle telafi edilir); oyuncu sunucuda yoksa girişe dönülür
            let connectedBefore = false;
            // Yönetici duyurusu: ekranın üstünde birkaç saniye görünür (Announce)
            this.socket.on('server:announce', (d) => window.dispatchEvent(new CustomEvent('hugo:announce', { detail: d })));
            this.socket.on('connect', () => {
                // Yeniden bağlanma çoğunlukla sunucu güncellemesidir: yeni sürüm yayındaysa sayfa yenilenir (main.jsx)
                if (connectedBefore) window.dispatchEvent(new Event('hugo:reconnected'));
                if (connectedBefore && this.playerId) {
                    this.socket.emit('player:reconnect', { playerId: this.playerId, token: this.token }, (response) => {
                        if (response?.success) {
                            this.activeRoomId = response.room?.id || null;
                        } else {
                            writeSession(null);
                            this.playerId = null;
                            this.token = null;
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

    // Lab (test senaryoları): yalnızca staging / yerel ve admin anahtarıyla
    labScenarios(callback) {
        this.connect().emit('lab:scenarios', {}, callback); // alt bileşen App'in connect'inden önce çalışabilir
    }

    // Senaryo başlatma ve koltuk değiştirme: sunucu bu bağlantıyı o koltuğa bağlar, ekran o oyuncu olarak yeniden kurulur
    labSeat(event, data, callback) {
        this.socket.emit(event, data, (response) => {
            if (response?.success) {
                this.remember(response);
                this.activeRoomId = response.room?.id || null;
                this.resyncHandler?.(response);
            }
            callback?.(response);
        });
    }

    labStart(id, callback) { this.labSeat('lab:start', { id }, callback); }
    labTakeSeat(playerId, callback) { this.labSeat('lab:takeSeat', { playerId }, callback); }
    labReset(roomId, callback) { this.socket.emit('lab:reset', { roomId }, callback); }

    // Anahtar girildi: bağlantı yeniden denenir
    setAdminToken(token) {
        try { localStorage.setItem(ADMIN_TOKEN_KEY, token); } catch { /* özel pencere */ }
        this.socket?.connect();
    }

    savedSession() {
        return readSession();
    }

    // Kayıt / yeniden bağlanma cevabındaki kimlik ve anahtar saklanır
    remember(response) {
        this.playerId = response.player.id;
        this.token = response.token;
        writeSession({ playerId: this.playerId, token: this.token });
        try { sessionStorage.removeItem('hugo.playerId'); } catch { /* depolama kapalı */ }
    }

    reconnect(session, callback) {
        this.socket.emit('player:reconnect', session, (response) => {
            if (response.success) {
                this.remember(response);
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

    registerPlayer(name, avatar, callback) {
        this.socket.emit('player:register', { name, avatar }, (response) => {
            if (response.success) this.remember(response);
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
                // Oyun sürerken boşaltılmış koltuğa oturuldu: koltuğun kimliği ve anahtarı alınır
                if (response.player && response.token) this.remember(response);
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

    leaveTable(roomId, callback) {
        this.socket.emit('game:leaveTable', { roomId, playerId: this.playerId }, (response) => {
            if (response?.success) {
                this.remember(response);
                this.activeRoomId = null;
            }
            callback?.(response);
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

    discardTile(tileId, callback, finishSets) {
        const roomId = this.activeRoomId;
        if (!roomId) {
            console.error('Aktif oda bulunamadı');
            if (callback) callback({ success: false, error: 'Aktif oda bulunamadı' });
            return;
        }

        // Sürükleyip köşeye bırakılan işlek taş bilerek atılır (yardımlı masada engellenmez, ceza yazılır)
        const force = Date.now() - (this.forceDiscardAt || 0) < 1000; // yalnızca az önceki sürükleme için
        this.forceDiscardAt = 0;
        this.socket.emit('game:discardTile', { playerId: this.playerId, roomId, tileId, ...(finishSets ? { finishSets } : {}), ...(force ? { force: true } : {}) }, callback);
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

    // kind: 'seri' (per) ya da 'cift' (çiftle açma); stage: per tek başına yere iner, eşik dolana kadar bekler
    openHand(sets, callback, kind = 'seri', stage = false) {
        this.socket.emit('game:openHand', { playerId: this.playerId, sets, kind, stage }, (response) => {
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

    // Teşhis: hata / donma bilgisini sunucu günlüğüne gönderir (bağlı değilse atlanır)
    log(data) {
        try { this.socket?.emit('client:log', { playerId: this.playerId, ...data }); } catch { /* yok say */ }
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

    transferOwner(roomId, targetId, callback) {
        this.socket.emit('room:transferOwner', { roomId, playerId: this.playerId, targetId }, callback);
    }

    // Masa kapatıldı (arşivlendi): masadakiler lobiye döner
    onRoomClosed(callback) {
        this.socket.on('room:closed', (data) => {
            if (data?.roomId === this.activeRoomId) this.activeRoomId = null;
            callback(data);
        });
    }

    // Yönetici masadan çıkardı: oyundaysa sunucu yeni lobi kimliği verir (eski koltuğa dönülmez)
    onKicked(callback) {
        this.socket.on('room:kicked', (data) => {
            this.activeRoomId = null;
            if (data?.player && data?.token) this.remember(data);
            callback(data);
        });
    }

    offKicked() {
        this.socket.off('room:kicked');
    }

    offRoomClosed() {
        this.socket.off('room:closed');
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

    onTurnExtended(callback) {
        this.socket.on('game:turnExtended', callback);
    }

    offTurnExtended() {
        this.socket.off('game:turnExtended');
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