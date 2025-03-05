"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSocketHandlers = void 0;
const GameManager_1 = require("../utils/GameManager");
const config_1 = require("../config/config");
const setupSocketHandlers = (io) => {
    const gameManager = GameManager_1.GameManager.getInstance();
    io.on('connection', (socket) => {
        console.log(`Yeni bağlantı: ${socket.id}`);
        // Oyuncu Olayları
        socket.on('player:register', (data, callback) => {
            try {
                const { name } = data;
                if (!name || name.trim() === '') {
                    return callback({
                        success: false,
                        error: 'Geçerli bir oyuncu adı gerekli'
                    });
                }
                const player = gameManager.createPlayer(name, socket.id);
                callback({
                    success: true,
                    player: player.toJSON()
                });
            }
            catch (error) {
                console.error('Oyuncu kaydı hatası:', error);
                callback({
                    success: false,
                    error: 'Oyuncu kaydı sırasında bir hata oluştu'
                });
            }
        });
        // Oda Olayları
        socket.on('room:create', (data, callback) => {
            try {
                const { name, playerId } = data;
                if (!name || name.trim() === '') {
                    return callback({
                        success: false,
                        error: 'Geçerli bir oda adı gerekli'
                    });
                }
                const player = gameManager.getPlayerById(playerId);
                if (!player) {
                    return callback({
                        success: false,
                        error: 'Oyuncu bulunamadı'
                    });
                }
                const room = gameManager.createRoom(name, playerId);
                if (!room) {
                    return callback({
                        success: false,
                        error: 'Oda oluşturulamadı'
                    });
                }
                // Odaya katıl
                socket.join(room.id);
                // Tüm istemcilere oda listesini güncelle
                io.emit('rooms:list', {
                    success: true,
                    rooms: gameManager.getAllRooms().map(r => r.toJSON())
                });
                callback({
                    success: true,
                    room: room.toJSON()
                });
            }
            catch (error) {
                console.error('Oda oluşturma hatası:', error);
                callback({
                    success: false,
                    error: 'Oda oluşturulurken bir hata oluştu'
                });
            }
        });
        socket.on('room:join', (data, callback) => {
            try {
                const { roomId, playerId } = data;
                const player = gameManager.getPlayerById(playerId);
                if (!player) {
                    return callback({
                        success: false,
                        error: 'Oyuncu bulunamadı'
                    });
                }
                const room = gameManager.getRoomById(roomId);
                if (!room) {
                    return callback({
                        success: false,
                        error: 'Oda bulunamadı'
                    });
                }
                const success = gameManager.addPlayerToRoom(playerId, roomId);
                if (!success) {
                    return callback({
                        success: false,
                        error: 'Odaya katılınamadı'
                    });
                }
                // Odaya katıl
                socket.join(roomId);
                // Odadaki diğer oyunculara bildir
                socket.to(roomId).emit('player:joined', {
                    success: true,
                    player: player.toPublicJSON(),
                    room: room.toJSON()
                });
                // Tüm istemcilere oda listesini güncelle
                io.emit('rooms:list', {
                    success: true,
                    rooms: gameManager.getAllRooms().map(r => r.toJSON())
                });
                callback({
                    success: true,
                    room: room.toJSON()
                });
            }
            catch (error) {
                console.error('Odaya katılma hatası:', error);
                callback({
                    success: false,
                    error: 'Odaya katılırken bir hata oluştu'
                });
            }
        });
        socket.on('room:leave', (data, callback) => {
            try {
                const { roomId, playerId } = data;
                const player = gameManager.getPlayerById(playerId);
                if (!player) {
                    return callback({
                        success: false,
                        error: 'Oyuncu bulunamadı'
                    });
                }
                const room = gameManager.getRoomById(roomId);
                if (!room) {
                    return callback({
                        success: true, // Oda zaten yok, başarılı sayılabilir
                        message: 'Oda bulunamadı'
                    });
                }
                const success = gameManager.removePlayerFromRoom(playerId, roomId);
                // Odadan ayrıl
                socket.leave(roomId);
                // Eğer oda hala varsa, odadaki diğer oyunculara bildir
                const updatedRoom = gameManager.getRoomById(roomId);
                if (updatedRoom) {
                    socket.to(roomId).emit('player:left', {
                        success: true,
                        playerId,
                        room: updatedRoom.toJSON()
                    });
                }
                // Tüm istemcilere oda listesini güncelle
                io.emit('rooms:list', {
                    success: true,
                    rooms: gameManager.getAllRooms().map(r => r.toJSON())
                });
                callback({
                    success: true
                });
            }
            catch (error) {
                console.error('Odadan ayrılma hatası:', error);
                callback({
                    success: false,
                    error: 'Odadan ayrılırken bir hata oluştu'
                });
            }
        });
        socket.on('rooms:list', (_, callback) => {
            try {
                const rooms = gameManager.getAllRooms();
                callback({
                    success: true,
                    rooms: rooms.map(room => room.toJSON())
                });
            }
            catch (error) {
                console.error('Oda listesi hatası:', error);
                callback({
                    success: false,
                    error: 'Oda listesi alınırken bir hata oluştu'
                });
            }
        });
        socket.on('room:details', (data, callback) => {
            try {
                const { roomId } = data;
                const room = gameManager.getRoomById(roomId);
                if (!room) {
                    return callback({
                        success: false,
                        error: 'Oda bulunamadı'
                    });
                }
                callback({
                    success: true,
                    room: room.toJSON()
                });
            }
            catch (error) {
                console.error('Oda detayları hatası:', error);
                callback({
                    success: false,
                    error: 'Oda detayları alınırken bir hata oluştu'
                });
            }
        });
        // Oyun Olayları
        socket.on('player:ready', (data, callback) => {
            try {
                const { roomId, playerId, ready } = data;
                const player = gameManager.getPlayerById(playerId);
                if (!player) {
                    return callback({
                        success: false,
                        error: 'Oyuncu bulunamadı'
                    });
                }
                const room = gameManager.getRoomById(roomId);
                if (!room) {
                    return callback({
                        success: false,
                        error: 'Oda bulunamadı'
                    });
                }
                if (!gameManager.isPlayerInRoom(playerId, roomId)) {
                    return callback({
                        success: false,
                        error: 'Oyuncu bu odada değil'
                    });
                }
                // Oyuncunun hazır durumunu güncelle
                player.setReady(ready);
                // Odadaki diğer oyunculara bildir
                io.to(roomId).emit('player:ready', {
                    success: true,
                    playerId,
                    ready,
                    room: room.toJSON()
                });
                // Tüm oyuncular hazırsa ve otomatik başlatma etkinse oyunu başlat
                if (config_1.config.autoStartGame && room.areAllPlayersReady()) {
                    const gameStarted = gameManager.startGame(roomId);
                    if (gameStarted) {
                        // Oyun başladı, tüm oyunculara bildir
                        io.to(roomId).emit('game:started', {
                            success: true,
                            room: room.toJSON()
                        });
                        // Her oyuncuya kendi taşlarını gönder
                        room.players.forEach(player => {
                            io.to(player.socketId).emit('game:tiles', {
                                success: true,
                                tiles: player.tiles.map(tile => tile.toJSON())
                            });
                        });
                    }
                }
                callback({
                    success: true
                });
            }
            catch (error) {
                console.error('Oyuncu hazır durumu hatası:', error);
                callback({
                    success: false,
                    error: 'Oyuncu hazır durumu güncellenirken bir hata oluştu'
                });
            }
        });
        socket.on('game:start', (data, callback) => {
            try {
                const { roomId, playerId } = data;
                // Oyuncunun oda sahibi olup olmadığını kontrol et
                if (!gameManager.isRoomOwner(playerId, roomId)) {
                    return callback({
                        success: false,
                        error: 'Sadece oda sahibi oyunu başlatabilir'
                    });
                }
                const room = gameManager.getRoomById(roomId);
                if (!room) {
                    return callback({
                        success: false,
                        error: 'Oda bulunamadı'
                    });
                }
                // Oyunu başlat
                const gameStarted = gameManager.startGame(roomId);
                if (!gameStarted) {
                    return callback({
                        success: false,
                        error: 'Oyun başlatılamadı'
                    });
                }
                // Oyun başladı, tüm oyunculara bildir
                io.to(roomId).emit('game:started', {
                    success: true,
                    room: room.toJSON()
                });
                // Her oyuncuya kendi taşlarını gönder
                room.players.forEach(player => {
                    io.to(player.socketId).emit('game:tiles', {
                        success: true,
                        tiles: player.tiles.map(tile => tile.toJSON())
                    });
                });
                callback({
                    success: true
                });
            }
            catch (error) {
                console.error('Oyun başlatma hatası:', error);
                callback({
                    success: false,
                    error: 'Oyun başlatılırken bir hata oluştu'
                });
            }
        });
        socket.on('game:drawTile', (data, callback) => {
            try {
                const { playerId, fromDiscard } = data;
                const player = gameManager.getPlayerById(playerId);
                if (!player || !player.roomId) {
                    return callback({
                        success: false,
                        error: 'Oyuncu bulunamadı veya bir odada değil'
                    });
                }
                const room = gameManager.getRoomById(player.roomId);
                if (!room || !room.game) {
                    return callback({
                        success: false,
                        error: 'Oda veya oyun bulunamadı'
                    });
                }
                // Taş çek
                const drawnTile = gameManager.drawTile(playerId, fromDiscard);
                if (!drawnTile) {
                    return callback({
                        success: false,
                        error: 'Taş çekilemedi'
                    });
                }
                // Diğer oyunculara taş çekildiğini bildir (taşın detayları olmadan)
                socket.to(player.roomId).emit('game:tileDraw', {
                    success: true,
                    playerId,
                    fromDiscard
                });
                callback({
                    success: true,
                    tile: drawnTile.toJSON()
                });
            }
            catch (error) {
                console.error('Taş çekme hatası:', error);
                callback({
                    success: false,
                    error: 'Taş çekilirken bir hata oluştu'
                });
            }
        });
        socket.on('game:discardTile', (data, callback) => {
            try {
                const { playerId, tileId } = data;
                const player = gameManager.getPlayerById(playerId);
                if (!player || !player.roomId) {
                    return callback({
                        success: false,
                        error: 'Oyuncu bulunamadı veya bir odada değil'
                    });
                }
                const room = gameManager.getRoomById(player.roomId);
                if (!room || !room.game) {
                    return callback({
                        success: false,
                        error: 'Oda veya oyun bulunamadı'
                    });
                }
                // Taş at
                const discardedTile = gameManager.discardTile(playerId, tileId);
                if (!discardedTile) {
                    return callback({
                        success: false,
                        error: 'Taş atılamadı'
                    });
                }
                // Tüm oyunculara atılan taşı bildir
                io.to(player.roomId).emit('game:tileDiscard', {
                    success: true,
                    playerId,
                    tile: discardedTile.toJSON()
                });
                // Sıradaki oyuncuya bildir
                const nextPlayer = room.players.find(p => p.isTurn);
                if (nextPlayer) {
                    io.to(player.roomId).emit('game:nextTurn', {
                        success: true,
                        playerId: nextPlayer.id
                    });
                }
                callback({
                    success: true
                });
            }
            catch (error) {
                console.error('Taş atma hatası:', error);
                callback({
                    success: false,
                    error: 'Taş atılırken bir hata oluştu'
                });
            }
        });
        // Bağlantı Kesme
        socket.on('disconnect', () => {
            console.log(`Bağlantı kesildi: ${socket.id}`);
            const player = gameManager.getPlayerBySocketId(socket.id);
            if (player && player.roomId) {
                const room = gameManager.getRoomById(player.roomId);
                if (room) {
                    // Oyuncuyu odadan çıkar
                    gameManager.removePlayerFromRoom(player.id, player.roomId);
                    // Odadaki diğer oyunculara bildir
                    socket.to(player.roomId).emit('player:left', {
                        success: true,
                        playerId: player.id,
                        room: room.toJSON()
                    });
                    // Tüm istemcilere oda listesini güncelle
                    io.emit('rooms:list', {
                        success: true,
                        rooms: gameManager.getAllRooms().map(r => r.toJSON())
                    });
                }
            }
            // Oyuncuyu kaldır
            gameManager.removePlayerBySocketId(socket.id);
        });
    });
};
exports.setupSocketHandlers = setupSocketHandlers;
