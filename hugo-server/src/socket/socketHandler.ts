import { Server, Socket } from 'socket.io';
import { GameManager } from '../utils/GameManager';
import { config } from '../config/config';
import { Game, GameStatus, Penalty, SetKind, TurnAction } from '../models/Game';
import { Tile } from '../models/Tile';
import { RoomStatus } from '../models/Room';
import { saveState } from '../utils/Persistence';

export const setupSocketHandlers = (io: Server) => {
    const gameManager = GameManager.getInstance();
    const turnTimers = new Map<string, NodeJS.Timeout>();

    // Durum değiştikçe diske yaz (300 ms içindeki değişiklikler tek kayıtta toplanır)
    let saveTimer: NodeJS.Timeout | null = null;
    const persist = () => {
        if (!config.persist || saveTimer) return;
        saveTimer = setTimeout(() => {
            saveTimer = null;
            try { saveState(gameManager); } catch (error) { console.error('Durum kaydedilemedi:', error); }
        }, 300);
    };

    // Sıra süresi sunucuda tutulur: süre dolunca taş otomatik çekilip en küçük taş atılır
    const scheduleTurn = (roomId: string, game: Game, overrideMs?: number) => {
        persist();
        clearTimeout(turnTimers.get(roomId));
        turnTimers.delete(roomId);
        if (game.status !== GameStatus.STARTED) return;
        const current = game.players[game.currentPlayerIndex];
        const ms = overrideMs ?? (current.connected ? config.game.turnTimeout : config.game.disconnectedTurnTimeout);
        turnTimers.set(roomId, setTimeout(() => autoPlay(roomId, game, current.id), ms));
    };

    // Taş atma + tur sonu / sıra geçişi (oyuncu hamlesi ve otomatik hamle aynı yolu kullanır)
    const discardAndAdvance = (roomId: string, game: Game, playerId: string, tileId: string) => {
        const { tile, penalties, error } = game.discardTile(playerId, tileId);
        if (!tile) return { success: false, error: error || 'Taş atılamadı' };

        io.to(roomId).emit('game:tileDiscard', { success: true, playerId, tile: { ...tile.toJSON(), playerId } });
        penalties.forEach(p => emitPenalty(roomId, game, p));

        const atan = game.getPlayerById(playerId);
        if (atan && atan.tiles.length === 0 && game.checkRoundEnd(playerId)) {
            // Son atılan taş jokerse joker ×2 çarpanı uygulanır
            game.finishedWithJoker = tile.isJoker === true;
            finishRound(roomId, game, playerId);
            return { success: true, roundEnded: true };
        }

        const nextPlayerId = game.players.find(p => p.isTurn)?.id || null;
        io.to(roomId).emit('game:nextTurn', { currentPlayerId: nextPlayerId, turnAction: 'draw' });
        scheduleTurn(roomId, game);
        return { success: true, nextPlayerId };
    };

    // Anlık ceza: masadaki herkesin ceza rozetini güncellemesi için
    const emitPenalty = (roomId: string, game: Game, p: Penalty) => {
        io.to(roomId).emit('game:penalty', {
            ...p,
            penaltyScore: game.getPlayerById(p.playerId)?.penaltyScore ?? 0
        });
    };

    const autoPlay = (roomId: string, game: Game, playerId: string) => {
        turnTimers.delete(roomId);
        const player = game.getPlayerById(playerId);
        if (!player || !game.isPlayerTurn(playerId)) return;

        let drawn: Tile | null = null;
        if (game.turnAction === TurnAction.DRAW && player.tiles.length !== 15) {
            drawn = game.drawTile(playerId, false);
            if (!drawn) {
                if (game.deck.length === 0 && game.checkRoundEnd()) finishRound(roomId, game);
                return;
            }
            io.to(roomId).except(player.socketId).emit('game:tileDraw', {
                success: true, playerId, fromDiscard: false, fromDiscardOfPlayerId: null
            });
        }

        const tile = game.pickAutoDiscard(playerId);
        if (!tile) return;
        // Oyuncunun kendi ekranı: çekilen taşı ekle, atılan taşı çıkar
        io.to(player.socketId).emit('game:autoPlayed', { drawnTile: drawn?.toJSON() ?? null, discardedTile: tile.toJSON() });
        discardAndAdvance(roomId, game, playerId, tile.id);
    };

    // Tek tur sonu yolu: puanla, bildir, 4 sn sonra yeni eli başlat (son elde başlatma)
    const finishRound = (roomId: string, game: Game, finisherPlayerId?: string) => {
        clearTimeout(turnTimers.get(roomId));
        turnTimers.delete(roomId);
        const results = game.endRound(finisherPlayerId);
        io.to(roomId).emit('game:roundEnded', {
            results,
            round: game.round,
            isHugoRound: game.isHugoRound(),
            finisherPlayerId: finisherPlayerId ?? null,
            finishedWithJoker: results[0]?.finishedWithJoker ?? false,
            gameStatus: game.status,
            // Tabela için güncel toplamlar (son elden sonra roundStarted gelmez)
            players: game.players.map(p => p.toPublicJSON())
        });

        if (game.status === GameStatus.FINISHED) {
            // Oyun bitti: masa lobide 'bitti' görünür, oyuncular lobiye dönebilir
            gameManager.endGame(roomId);
            io.emit('rooms:list', { success: true, rooms: gameManager.getAllRooms().map(r => r.toJSON()) });
        }

        persist();
        if (game.status === GameStatus.ROUND_ENDED) startNextRoundLater(roomId, game);
    };

    // Tur sonu ekranı için 4 sn bekleyip yeni eli başlat
    const startNextRoundLater = (roomId: string, game: Game) => {
        setTimeout(() => {
            if (game.status !== GameStatus.ROUND_ENDED) return;
            game.startNextRound();
            io.to(roomId).emit('game:roundStarted', { game: game.toPublicJSON() });
            scheduleTurn(roomId, game);
        }, 4000);
    };

    // Diskten geri yüklenen oyunlar kaldığı yerden sürer; oyuncular dönebilsin diye ilk sırada tam süre
    gameManager.getAllRooms().forEach(room => {
        if (room.game?.status === GameStatus.STARTED) scheduleTurn(room.id, room.game, config.game.turnTimeout);
        if (room.game?.status === GameStatus.ROUND_ENDED) startNextRoundLater(room.id, room.game);
    });

    io.on('connection', (socket: Socket) => {
        console.log(`Yeni bağlantı: ${socket.id}`);
        socket.onAny(() => persist()); // her istemci olayından sonra kaydet

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
                        if (room.game) scheduleTurn(roomId, room.game);
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
                if (room.game) scheduleTurn(roomId, room.game);

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
                    if (room.game.deck.length === 0 && !fromDiscard && room.game.isPlayerTurn(playerId) && room.game.checkRoundEnd()) {
                        finishRound(player.roomId, room.game);
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

                callback(discardAndAdvance(player.roomId, room.game, playerId, tileId));
            } catch (error) {
                console.error('Taş atma hatası:', error);
                callback({
                    success: false,
                    error: 'Taş atılırken bir hata oluştu'
                });
            }
        });

        // El Açma / Taş Oynama
        socket.on('game:openHand', (data: { playerId: string, sets: string[][], kind?: SetKind }, callback) => {
            try {
                const { playerId, sets } = data;
                const kind: SetKind = data.kind === 'cift' ? 'cift' : 'seri';

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

                const result = gameManager.openHand(playerId, sets, kind);

                if (!result.success) {
                    if (result.penalty) {
                        emitPenalty(player.roomId, room.game, { playerId, amount: result.penalty, reason: 'Yetersiz değerle açma' });
                    }
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
                        value: s.value,
                        kind: s.kind
                    })),
                    openedTotal: result.openedTotal,
                    isOpen: player.isOpen,
                    openedWithPairs: player.openedWithPairs,
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
        // Çiftlere çift işleme: yeni çift sahibinin alanına konur, sahibine ceza yazılır
        socket.on('game:addPairToSet', (data: { playerId: string, tileIds: string[], targetSetId: string }, callback) => {
            try {
                const player = gameManager.getPlayerById(data?.playerId);
                const room = player?.roomId ? gameManager.getRoomById(player.roomId) : undefined;
                if (!player || !room?.game) return callback({ success: false, error: 'Oyun bulunamadı' });

                const result = room.game.addPairToSet(player.id, data.tileIds || [], data.targetSetId);
                if (!result.success || !result.newSet) return callback({ success: false, error: result.error });

                io.to(room.id).emit('game:perDropped', {
                    success: true,
                    playerId: player.id,
                    newSets: [{
                        id: result.newSet.id,
                        playerId: result.newSet.playerId,
                        tiles: result.newSet.tiles.map(t => t.toJSON()),
                        value: result.newSet.value,
                        kind: result.newSet.kind
                    }]
                });
                if (result.penalty) {
                    emitPenalty(room.id, room.game, {
                        playerId: result.penalty.targetPlayerId,
                        amount: result.penalty.amount,
                        reason: 'Çiftine işlendi'
                    });
                }
                callback({ success: true, remainingTiles: result.remainingTiles });
            } catch (error) {
                console.error('Çift işleme hatası:', error);
                callback({ success: false, error: 'Çift işlenirken bir hata oluştu' });
            }
        });

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
                        value: s.value,
                        kind: s.kind
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

        // Yeniden bağlanma: sayfa yenilenince / ağ kopunca aynı oyuncu kimliğiyle koltuğa dön
        socket.on('player:reconnect', (data: { playerId: string }, callback) => {
            const player = data?.playerId ? gameManager.getPlayerById(data.playerId) : undefined;
            if (!player) return callback?.({ success: false, error: 'Oyuncu bulunamadı' });

            gameManager.updatePlayerSocket(player.id, socket.id);
            player.connected = true;

            const room = player.roomId ? gameManager.getRoomById(player.roomId) : undefined;
            if (room) {
                socket.join(room.id);
                io.to(room.id).emit('player:connection', { playerId: player.id, connected: true });
                // Sırası kısa kopukluk süresiyle bekliyorsa tam süreyi geri ver
                if (room.game?.isPlayerTurn(player.id)) scheduleTurn(room.id, room.game);
            }

            callback?.({ success: true, player: player.toJSON(), room: room ? room.toJSON() : null });
        });

        // Bağlantı Kesme
        socket.on('disconnect', () => {
            console.log(`Bağlantı kesildi: ${socket.id}`);
            persist();

            const player = gameManager.getPlayerBySocketId(socket.id);

            // Oyun sürerken oyuncu silinmez: koltuk tutulur, sırası gelince otomatik oynanır
            const playingRoom = player?.roomId ? gameManager.getRoomById(player.roomId) : undefined;
            if (player && playingRoom?.game && playingRoom.status === RoomStatus.PLAYING) {
                player.connected = false;
                io.to(playingRoom.id).emit('player:connection', { playerId: player.id, connected: false });
                if (playingRoom.game.isPlayerTurn(player.id)) scheduleTurn(playingRoom.id, playingRoom.game);
                return;
            }

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