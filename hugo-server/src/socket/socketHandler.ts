import { Server, Socket } from 'socket.io';
import { GameManager } from '../utils/GameManager';
import { config } from '../config/config';
import { RoundResult } from '../models/Game';

export const setupSocketHandlers = (io: Server) => {
    const gameManager = GameManager.getInstance();

    io.on('connection', (socket: Socket) => {
        console.log(`Yeni bağlantı: ${socket.id}`);

        // Oyuncu Olayları
        socket.on('player:register', (data: { name: string }, callback) => {
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
            } catch (error) {
                console.error('Oyuncu kaydı hatası:', error);
                callback({
                    success: false,
                    error: 'Oyuncu kaydı sırasında bir hata oluştu'
                });
            }
        });

        // Oda Olayları
        socket.on('room:create', (data: { name: string, playerId: string }, callback) => {
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
            } catch (error) {
                console.error('Oda oluşturma hatası:', error);
                callback({
                    success: false,
                    error: 'Oda oluşturulurken bir hata oluştu'
                });
            }
        });

        socket.on('room:join', (data: { roomId: string, playerId: string }, callback) => {
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
            } catch (error) {
                console.error('Odaya katılma hatası:', error);
                callback({
                    success: false,
                    error: 'Odaya katılırken bir hata oluştu'
                });
            }
        });

        socket.on('room:leave', (data: { roomId: string, playerId: string }, callback) => {
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
            } catch (error) {
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
            } catch (error) {
                console.error('Oda listesi hatası:', error);
                callback({
                    success: false,
                    error: 'Oda listesi alınırken bir hata oluştu'
                });
            }
        });

        socket.on('room:details', (data: { roomId: string }, callback) => {
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
            } catch (error) {
                console.error('Oda detayları hatası:', error);
                callback({
                    success: false,
                    error: 'Oda detayları alınırken bir hata oluştu'
                });
            }
        });

        // Oyun Olayları
        socket.on('player:ready', (data: { roomId: string, playerId: string, ready: boolean }, callback) => {
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
                if (config.autoStartGame && room.areAllPlayersReady()) {
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
            } catch (error) {
                console.error('Oyuncu hazır durumu hatası:', error);
                callback({
                    success: false,
                    error: 'Oyuncu hazır durumu güncellenirken bir hata oluştu'
                });
            }
        });

        socket.on('game:start', (data: { roomId: string, playerId: string }, callback) => {
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
            } catch (error) {
                console.error('Oyun başlatma hatası:', error);
                callback({
                    success: false,
                    error: 'Oyun başlatılırken bir hata oluştu'
                });
            }
        });

        // Oyuncu taşlarını talep eder (game:tiles event'ini kaçıran istemciler için)
        socket.on('game:requestTiles', (data: { playerId: string }, callback) => {
            try {
                const { playerId } = data;

                const player = gameManager.getPlayerById(playerId);
                if (!player || !player.roomId) {
                    return callback({ success: false, error: 'Oyuncu bulunamadı' });
                }

                const room = gameManager.getRoomById(player.roomId);
                if (!room || !room.game) {
                    return callback({ success: false, error: 'Aktif oyun bulunamadı' });
                }

                callback({
                    success: true,
                    tiles: player.tiles.map((tile: any) => tile.toJSON())
                });
            } catch (error) {
                console.error('game:requestTiles hatası:', error);
                callback({ success: false, error: 'Taşlar alınırken bir hata oluştu' });
            }
        });

        socket.on('game:drawTile', (data: { playerId: string, fromDiscard: boolean }, callback) => {
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

                // fromDiscard ise kimin taşını çektiğini kaydet
                const fromDiscardOfPlayerId = fromDiscard ? room.game.lastDiscardPlayerId : null;

                // Taş çek
                const drawnTile = gameManager.drawTile(playerId, fromDiscard);

                if (!drawnTile) {
                    // Deste bitti mi kontrol et
                    if (room.game.deck.length === 0 && !fromDiscard && room.game.checkRoundEnd()) {
                        const results = room.game.endRound();
                        io.to(player.roomId).emit('game:roundEnded', {
                            results,
                            round: room.game.round,
                            isHugoRound: room.game.isHugoRound()
                        });

                        if (room.game.round < 9) {
                            setTimeout(() => {
                                if (!room.game) return;
                                room.game.startNextRound();
                                io.to(player.roomId!).emit('game:roundStarted', {
                                    game: room.game.toPublicJSON()
                                });
                            }, 4000);
                        }

                        return callback({ success: false, error: 'Deste bitti', roundEnded: true });
                    }

                    return callback({
                        success: false,
                        error: 'Taş çekilemedi'
                    });
                }

                // Diğer oyunculara taş çekildiğini bildir (taşın detayları olmadan)
                socket.to(player.roomId).emit('game:tileDraw', {
                    success: true,
                    playerId,
                    fromDiscard,
                    fromDiscardOfPlayerId
                });

                callback({
                    success: true,
                    tile: drawnTile.toJSON(),
                    fromDiscardOfPlayerId
                });
            } catch (error) {
                console.error('Taş çekme hatası:', error);
                callback({
                    success: false,
                    error: 'Taş çekilirken bir hata oluştu'
                });
            }
        });

        socket.on('game:discardTile', (data: { playerId: string, tileId: string }, callback) => {
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
                    tile: {
                        ...discardedTile.toJSON(),
                        playerId
                    }
                });

                // Tur sonu kontrolü: oyuncunun eli bitti mi?
                const atan = gameManager.getPlayerById(playerId);
                if (atan && atan.tiles.length === 0 && room.game.checkRoundEnd(playerId)) {
                    const results = room.game.endRound();
                    io.to(player.roomId).emit('game:roundEnded', {
                        results,
                        round: room.game.round,
                        isHugoRound: room.game.isHugoRound()
                    });

                    // 4 saniye sonra yeni tur başlat
                    if (room.game.round < 9) {
                        setTimeout(() => {
                            if (!room.game) return;
                            room.game.startNextRound();
                            io.to(player.roomId!).emit('game:roundStarted', {
                                game: room.game.toPublicJSON()
                            });
                        }, 4000);
                    }

                    callback({ success: true, roundEnded: true });
                    return;
                }

                // Normal akış: sıra değişimi
                const nextPlayer = room.players.find(p => p.isTurn);
                io.to(player.roomId).emit('game:nextTurn', {
                    currentPlayerId: nextPlayer?.id || null,
                    turnAction: 'draw'
                });

                callback({
                    success: true,
                    nextPlayerId: nextPlayer?.id || null
                });
            } catch (error) {
                console.error('Taş atma hatası:', error);
                callback({
                    success: false,
                    error: 'Taş atılırken bir hata oluştu'
                });
            }
        });

        // El Açma / Taş Oynama
        socket.on('game:openHand', (data: { playerId: string, sets: string[][] }, callback) => {
            try {
                const { playerId, sets } = data;

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

                const result = gameManager.openHand(playerId, sets);

                if (!result.success) {
                    return callback({
                        success: false,
                        error: result.error
                    });
                }

                // Tüm oyunculara bildirimi gönder
                io.to(player.roomId).emit('game:handOpened', {
                    success: true,
                    playerId,
                    newSets: result.newSets?.map(s => ({
                        id: s.id,
                        playerId: s.playerId,
                        tiles: s.tiles.map(t => t.toJSON()),
                        value: s.value
                    })),
                    openedTotal: result.openedTotal,
                    isOpen: player.isOpen,
                    lastOpenedValue: player.lastOpenedValue,
                    turnAction: result.turnAction || room.game.turnAction
                });

                // İsteği yapan oyuncuya kalan taşlarını bildir
                callback({
                    success: true,
                    remainingTiles: result.remainingTiles,
                    openedTotal: result.openedTotal,
                    turnAction: result.turnAction || room.game.turnAction
                });
            } catch (error) {
                console.error('El açma hatası:', error);
                callback({
                    success: false,
                    error: 'El açılırken bir hata oluştu'
                });
            }
        });

        // İşleme (Taş Ekleme)
        socket.on('game:addTileToSet', (data: { playerId: string, tileId: string, targetSetId: string, position: 'start' | 'end' }, callback) => {
            try {
                const { playerId, tileId, targetSetId, position } = data;

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

                const result = gameManager.addTileToSet(playerId, tileId, targetSetId, position);

                if (!result.success) {
                    return callback({
                        success: false,
                        error: result.error
                    });
                }

                // Tüm oyunculara güncellenen seti ve ceza bilgisini bildir
                io.to(player.roomId).emit('game:tileAddedToSet', {
                    success: true,
                    playerId,
                    updatedSet: result.updatedSet,
                    penalty: result.penalty,
                    swappedOkey: !!result.swappedOkeyTile
                });

                // İsteği yapan oyuncuya kalan taşlarını ve swap edilen okey'i bildir
                callback({
                    success: true,
                    remainingTiles: result.remainingTiles,
                    swappedOkeyTile: result.swappedOkeyTile,
                    updatedSet: result.updatedSet,
                    penalty: result.penalty
                });
            } catch (error) {
                console.error('İşleme hatası:', error);
                callback({
                    success: false,
                    error: 'İşleme yapılırken bir hata oluştu'
                });
            }
        });

        // Per İndirme
        socket.on('game:dropPer', (data: { playerId: string, sets: string[][] }, callback) => {
            try {
                const { playerId, sets } = data;

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

                const result = gameManager.dropPer(playerId, sets);

                if (!result.success) {
                    return callback({
                        success: false,
                        error: result.error
                    });
                }

                // Tüm oyunculara masaya eklenen setleri bildir
                io.to(player.roomId).emit('game:perDropped', {
                    success: true,
                    playerId,
                    newSets: result.newSets?.map(s => ({
                        id: s.id,
                        playerId: s.playerId,
                        tiles: s.tiles.map(t => t.toJSON()),
                        value: s.value
                    }))
                });

                callback({
                    success: true,
                    remainingTiles: result.remainingTiles
                });
            } catch (error) {
                console.error('Per indirme hatası:', error);
                callback({
                    success: false,
                    error: 'Per indirilirken bir hata oluştu'
                });
            }
        });

        // Tur Bitirme — Oyuncu son taşını atarak turu bitirir
        socket.on('game:finishRound', (data: { playerId: string; tileId: string }, callback) => {
            try {
                const { playerId, tileId } = data;

                const player = gameManager.getPlayerById(playerId);
                if (!player || !player.roomId) {
                    return callback({ success: false, error: 'Oyuncu bulunamadı veya bir odada değil' });
                }

                const room = gameManager.getRoomById(player.roomId);
                if (!room || !room.game) {
                    return callback({ success: false, error: 'Oda veya oyun bulunamadı' });
                }

                const game = room.game;

                // Verify it is this player's turn and they can discard
                if (!game.isPlayerTurn(playerId)) {
                    return callback({ success: false, error: 'Sıra bu oyuncuda değil' });
                }

                // Find the tile in player's hand to check isJoker before discarding
                const finishTile = player.tiles.find(t => t.id === tileId);
                if (!finishTile) {
                    return callback({ success: false, error: 'Taş oyuncunun elinde bulunamadı' });
                }

                // Set joker finish flag BEFORE calling endRound
                game.finishedWithJoker = finishTile.isJoker === true;

                // Calculate round results
                const results: RoundResult[] = game.endRound(playerId);

                // Completed round number: endRound() increments round when advancing to next
                const completedRound = game.status === 'finished' ? game.round : game.round - 1;

                // Broadcast round end to all players in the room
                io.to(player.roomId).emit('game:roundEnd', {
                    success: true,
                    round: completedRound,
                    finisherPlayerId: playerId,
                    finishedWithJoker: results[0]?.finishedWithJoker ?? false,
                    results: results.map((r: RoundResult) => ({
                        playerId: r.playerId,
                        playerName: r.playerName,
                        isFinisher: r.isFinisher,
                        handScore: r.handScore,
                        effectiveHandScore: r.effectiveHandScore,
                        penaltyScore: r.penaltyScore,
                        rawTotal: r.rawTotal,
                        roundTotal: r.roundTotal,
                        multiplier: r.multiplier,
                        isHugoRound: r.isHugoRound,
                        finishedWithJoker: r.finishedWithJoker,
                    })),
                    gameStatus: game.status,
                });

                // Notify all players of the new game state (new round tiles)
                if (game.status !== 'finished') {
                    room.players.forEach(p => {
                        io.to(p.socketId).emit('game:tiles', {
                            success: true,
                            tiles: p.tiles.map(tile => tile.toJSON()),
                            round: game.round,
                            isHugoRound: game.isHugoRound(),
                        });
                    });

                    // Broadcast new game state to room
                    io.to(player.roomId).emit('game:newRound', {
                        success: true,
                        round: game.round,
                        isHugoRound: game.isHugoRound(),
                        currentPlayerId: room.players.find(p => p.isTurn)?.id || null,
                    });
                }

                callback({ success: true, results });
            } catch (error) {
                console.error('Tur bitirme hatası:', error);
                callback({ success: false, error: 'Tur bitirilirken bir hata oluştu' });
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