import { Server, Socket } from 'socket.io';
import { GameManager } from '../utils/GameManager';
import { config } from '../config/config';
import { Game, GameStatus, Penalty, SetKind, TurnAction } from '../models/Game';
import { Tile } from '../models/Tile';
import { Player } from '../models/Player';
import { RoomStatus } from '../models/Room';
import { appendArchive, saveState } from '../utils/Persistence';
import { planOpening, planSets } from '../ai/AiPlanner';

const BOT_NAMES = ['Robo Rıza', 'Robo Nur', 'Robo Can', 'Robo Ece'];
const CHAT_MAX_LEN = 200;
const CHAT_HISTORY = 50;
const CHAT_MIN_GAP_MS = 700; // soket başına mesaj aralığı: sel engeli

export const setupSocketHandlers = (io: Server) => {
    const gameManager = GameManager.getInstance();
    const turnTimers = new Map<string, NodeJS.Timeout>();
    const turnDeadlines = new Map<string, number>(); // oyuncu sırasının biteceği an (ms)

    // Durum değiştikçe diske yaz (300 ms içindeki değişiklikler tek kayıtta toplanır)
    let saveTimer: NodeJS.Timeout | null = null;
    const persist = () => {
        if (!config.persist || saveTimer) return;
        saveTimer = setTimeout(() => {
            saveTimer = null;
            try { saveState(gameManager); } catch (error) { console.error('Durum kaydedilemedi:', error); }
        }, 300);
    };

    // shortcut: sohbet geçmişi bellekte, sunucu yeniden başlayınca silinir; kalıcı olmalıysa Persistence'a eklenmeli
    const chatLogs = new Map<string, { id: string; playerId: string; name: string; text: string; ts: number }[]>();

    // Sıra süresi sunucuda tutulur: süre dolunca taş otomatik çekilip en küçük taş atılır
    const scheduleTurn = (roomId: string, game: Game, overrideMs?: number) => {
        persist();
        clearTimeout(turnTimers.get(roomId));
        turnTimers.delete(roomId);
        if (game.status !== GameStatus.STARTED) return;
        const current = game.players[game.currentPlayerIndex];
        if (current.isBot) {
            // Yapay zekâ kısa bir düşünme payıyla sunucuda oynar
            const think = config.game.botThinkMs + Math.floor(Math.random() * config.game.botThinkMs);
            turnTimers.set(roomId, setTimeout(() => botTurn(roomId, game, current.id), think));
            return;
        }
        const ms = overrideMs ?? (current.connected ? config.game.turnTimeout : config.game.disconnectedTurnTimeout);
        turnDeadlines.set(roomId, Date.now() + ms);
        turnTimers.set(roomId, setTimeout(() => autoPlay(roomId, game, current.id), ms));
    };

    // İşleme / per açma: sıradaki oyuncunun süresine 10 sn eklenir (herkesin halkası da uzar)
    const EXTEND_MS = 10_000;
    const extendTurn = (roomId: string, game: Game, playerId: string) => {
        const deadline = turnDeadlines.get(roomId);
        if (!deadline || !turnTimers.has(roomId) || !game.isPlayerTurn(playerId)) return;
        scheduleTurn(roomId, game, Math.max(0, deadline - Date.now()) + EXTEND_MS);
        io.to(roomId).emit('game:turnExtended', { playerId, seconds: EXTEND_MS / 1000 });
    };

    // Açılış değeri (aynı sırada indirilen / kendi perine işlenen taşlarla artar): istemcideki rozet güncellenir
    const openStateOf = (p?: Player) => p && { openedTotal: p.openedTotal, lastOpenedValue: p.lastOpenedValue };

    // Taş atma + tur sonu / sıra geçişi (oyuncu hamlesi ve otomatik hamle aynı yolu kullanır)
    const discardAndAdvance = (roomId: string, game: Game, playerId: string, tileId: string, finishSets?: string[][]) => {
        const { tile, penalties, error } = game.discardTile(playerId, tileId, finishSets);
        if (!tile) return { success: false, error: error || 'Taş atılamadı' };

        io.to(roomId).emit('game:tileDiscard', { success: true, playerId, deckCount: game.deck.length, tile: { ...tile.toJSON(), playerId, locked: game.lockedDiscardTileId === tile.id } });
        penalties.forEach(p => emitPenalty(roomId, game, p));

        const atan = game.getPlayerById(playerId);
        if (atan && atan.tiles.length === 0 && game.checkRoundEnd(playerId)) {
            finishRound(roomId, game, playerId);
            return { success: true, roundEnded: true };
        }
        // Deste bitti: son taşı çekip atan oyuncuyla el biter (atılan taş artık alınamaz)
        if (game.deck.length === 0 && game.checkRoundEnd()) {
            finishRound(roomId, game);
            return { success: true, roundEnded: true };
        }

        const nextPlayerId = game.players.find(p => p.isTurn)?.id || null;
        io.to(roomId).emit('game:nextTurn', { currentPlayerId: nextPlayerId, turnAction: 'draw' });
        scheduleTurn(roomId, game);
        return { success: true, nextPlayerId };
    };

    // Anlık ceza: masadaki herkesin ceza rozetini güncellemesi için
    const emitPenalty = (roomId: string, game: Game, p: Penalty) => {
        const playerName = game.getPlayerById(p.playerId)?.name ?? '';
        (game.roundPenalties ||= []).push({ ...p, playerName });
        io.to(roomId).emit('game:penalty', {
            ...p,
            playerName,
            penaltyScore: game.getPlayerById(p.playerId)?.penaltyScore ?? 0
        });
    };

    // El açma / bekleyen açılış: masadaki herkese (pendingSetIds: eşiği henüz dolmamış perler)
    const emitHandOpened = (roomId: string, game: Game, player: Player, result: ReturnType<Game['openHand']>) => {
        io.to(roomId).emit('game:handOpened', {
            success: true,
            playerId: player.id,
            newSets: result.newSets?.map(setJSON),
            openedTotal: result.openedTotal,
            isOpen: player.isOpen,
            openedWithPairs: player.openedWithPairs,
            lastOpenedValue: player.lastOpenedValue,
            turnAction: result.turnAction || game.turnAction,
            pendingSetIds: game.pendingOpen?.playerId === player.id ? game.pendingOpen?.setIds ?? [] : [],
            pendingTotal: result.pendingTotal || 0,
            needed: result.needed,
        });
    };

    // Geri alma (oyuncu Geri al dedi ya da süre doldu): masa ve el sıranın başına döner, ceza yazılır
    const emitUndo = (roomId: string, game: Game, player: Player, r: ReturnType<Game['undoTurnPlays']>) => {
        io.to(roomId).emit('game:turnUndone', {
            playerId: player.id,
            tableSets: r.tableSets,
            turnAction: game.turnAction,
            openState: {
                isOpen: player.isOpen, openedWithPairs: player.openedWithPairs,
                openedTotal: player.openedTotal, lastOpenedValue: player.lastOpenedValue
            }
        });
        r.reverts?.forEach(p => emitPenalty(roomId, game, p));
        if (r.penalty) emitPenalty(roomId, game, r.penalty);
    };

    const autoPlay = (roomId: string, game: Game, playerId: string) => {
        turnTimers.delete(roomId);
        const player = game.getPlayerById(playerId);
        if (!player || !game.isPlayerTurn(playerId)) return;

        // Süre doldu, açılış eşiği dolmadı: eldeki perlerle (okey dahil) tamamlanırsa açılır;
        // tamamlanamazsa yere inen perler ele döner, geri alma cezası yazılır (Hugo elinde 200), sonra taş atılır
        if (game.pendingOpen?.playerId === playerId) {
            const done = game.completePendingOpen(playerId);
            if (done.success) {
                emitHandOpened(roomId, game, player, done);
            } else {
                const r = game.undoTurnPlays(playerId) /* anlık cezalar Hugo elinde de 100 yazılır; Hugo × 2 el sonunda */;
                if (r.success) emitUndo(roomId, game, player, r);
            }
            io.to(player.socketId).emit('game:tiles', { success: true, tiles: player.tiles.map(t => t.toJSON()) });
        }

        // Yandan alınıp kullanılmamış taş önce kusulur (cezasız), sonra desteden çekilir
        // (masaya oynadıysa kusulmaz: hamleler kalır, taş 100 cezayla atılır)
        if (game.takenDiscardTileId && !game.playedToTableThisTurn && player.tiles.some(t => t.id === game.takenDiscardTileId)) {
            returnTaken(roomId, game, playerId);
        }

        let drawn: Tile | null = null;
        if (game.turnAction === TurnAction.DRAW && player.tiles.length !== 15) {
            drawn = game.drawTile(playerId, false);
            if (!drawn) {
                if (game.deck.length === 0 && game.checkRoundEnd()) finishRound(roomId, game);
                return;
            }
            io.to(roomId).except(player.socketId).emit('game:tileDraw', {
                success: true, deckCount: game.deck.length, playerId, fromDiscard: false, fromDiscardOfPlayerId: null
            });
        }

        const tile = game.pickAutoDiscard(playerId);
        if (!tile) return;
        // Oyuncunun kendi ekranı: çekilen taşı ekle, atılan taşı çıkar
        io.to(player.socketId).emit('game:autoPlayed', { deckCount: game.deck.length, drawnTile: drawn?.toJSON() ?? null, discardedTile: tile.toJSON() });
        discardAndAdvance(roomId, game, playerId, tile.id);
    };

    // Kustu: taş atanın köşesine döner, atanın cezası silinir
    const returnTaken = (roomId: string, game: Game, playerId: string) => {
        // Bu sırada masaya oynadıysa önce geri alınır (geri alma cezasıyla), sonra taş kusulur
        if (game.playedToTableThisTurn && game.takenDiscardTileId) {
            const player = game.getPlayerById(playerId);
            const r = game.undoTurnPlays(playerId) /* anlık cezalar Hugo elinde de 100 yazılır; Hugo × 2 el sonunda */;
            if (!r.success || !player) return { success: false, error: r.error };
            emitUndo(roomId, game, player, r);
        }
        const { tile, toPlayerId, revert, error } = game.returnTakenTile(playerId);
        if (!tile) return { success: false, error };
        io.to(roomId).emit('game:tileReturned', { playerId, toPlayerId, tile: tile.toJSON() });
        if (revert) emitPenalty(roomId, game, revert);
        persist();
        return { success: true, tile: tile.toJSON(), remainingTiles: game.getPlayerById(playerId)?.tiles.map(t => t.toJSON()) };
    };

    const setJSON = (st: { id: string; playerId: string; tiles: Tile[]; value: number; kind?: SetKind }) =>
        ({ id: st.id, playerId: st.playerId, tiles: st.tiles.map(t => t.toJSON()), value: st.value, kind: st.kind });

    // Yapay zekâ hamlesi: desteden çek → açabiliyorsa aç / per indir → masaya işle → per adayı olmayan en küçük taşı at.
    // Tümü sunucuda; istemcilere yalnızca herkesin göreceği masa olayları gider.
    const botTurn = (roomId: string, game: Game, botId: string) => {
        turnTimers.delete(roomId);
        const bot = game.getPlayerById(botId);
        if (!bot || !game.isPlayerTurn(botId)) return;
        try {
            if (game.turnAction === TurnAction.DRAW && bot.tiles.length !== 15) {
                const drawn = game.drawTile(botId, false);
                if (!drawn) {
                    if (game.deck.length === 0 && game.checkRoundEnd()) finishRound(roomId, game);
                    return;
                }
                io.to(roomId).emit('game:tileDraw', { success: true, deckCount: game.deck.length, playerId: botId, fromDiscard: false, fromDiscardOfPlayerId: null });
            }

            if (!bot.isOpen) {
                const plan = planOpening(game, bot.tiles);
                const r = plan ? game.openHand(botId, plan, 'seri') : null;
                if (r?.success) {
                    io.to(roomId).emit('game:handOpened', {
                        success: true, playerId: botId, newSets: r.newSets?.map(setJSON), openedTotal: r.openedTotal,
                        isOpen: bot.isOpen, openedWithPairs: bot.openedWithPairs, lastOpenedValue: bot.lastOpenedValue,
                        turnAction: game.turnAction
                    });
                }
            } else if (!bot.openedWithPairs) {
                const extra = planSets(game, bot.tiles).filter(st => st.length >= 3);
                while (extra.length && extra.flat().length >= bot.tiles.length) extra.pop();
                const r = extra.length ? game.dropPer(botId, extra.map(st => st.map(t => t.id))) : null;
                if (r?.success) io.to(roomId).emit('game:perDropped', { success: true, playerId: botId, openState: openStateOf(bot), newSets: r.newSets?.map(setJSON) });
            }

            // Masadaki perlere işle (okeyi işlemez; Game elde en az bir taş bırakır)
            if (bot.isOpen) {
                let moved = true;
                while (moved && bot.tiles.length > 1) {
                    moved = false;
                    for (const tile of [...bot.tiles]) {
                        if (game.isOkeyTile(tile)) continue;
                        for (const set of game.tableSets.filter(st => st.kind !== 'cift')) {
                            for (const pos of ['end', 'start'] as const) {
                                const r = game.addTileToSet(botId, tile.id, set.id, pos);
                                if (!r.success) continue;
                                io.to(roomId).emit('game:tileAddedToSet', { success: true, playerId: botId, updatedSet: r.updatedSet, swappedOkey: !!r.swappedOkeyTile });
                                if (r.penalty) {
                                    const { targetPlayerId, amount, tag, tile: label } = r.penalty;
                                    emitPenalty(roomId, game, { playerId: targetPlayerId, amount, tag, tile: label, reason: 'Perine taş işlendi' });
                                }
                                moved = true;
                                break;
                            }
                            if (moved) break;
                        }
                        if (moved) break;
                    }
                }
            }

            const tile = game.pickAutoDiscard(botId);
            if (tile) discardAndAdvance(roomId, game, botId, tile.id);
        } catch (error) {
            console.error('Yapay zekâ hamlesi hatası:', error);
            autoPlay(roomId, game, botId); // güvenli yol: çek ve en küçük taşı at
        }
    };

    // Tek tur sonu yolu: puanla, bildir, 4 sn sonra yeni eli başlat (son elde başlatma)
    const finishRound = (roomId: string, game: Game, finisherPlayerId?: string) => {
        clearTimeout(turnTimers.get(roomId));
        turnTimers.delete(roomId);
        const results = game.endRound(finisherPlayerId);
        const history = game.recordRoundHistory(results);
        io.to(roomId).emit('game:roundEnded', {
            results,
            history,
            round: game.round,
            isHugoRound: game.isHugoRound(),
            finisherPlayerId: finisherPlayerId ?? null,
            finishedWithJoker: results[0]?.finishedWithJoker ?? false,
            gameStatus: game.status,
            // Tabela için güncel toplamlar (son elden sonra roundStarted gelmez)
            players: game.players.map(p => p.toPublicJSON())
        });

        persist();
        if (game.status === GameStatus.ROUND_ENDED) startNextRoundLater(roomId, game);
        if (game.status === GameStatus.FINISHED) resetRoomLater(roomId, game);
    };

    // Oyun sonu: tabela 5 sn görünür, sonra masa oda ekranına döner; puanlar sıfırlanır.
    // Yeni oyun için insan oyuncular yeniden hazır olur (yapay zekâ hazırdır), masa sahibi başlatır.
    const resetRoomLater = (roomId: string, game: Game) => {
        setTimeout(() => {
            const room = gameManager.getRoomById(roomId);
            if (!room || room.game !== game) return;
            room.players.forEach(p => p.resetForNewGame());
            room.resetGame();
            room.players.forEach(p => p.setReady(!!p.isBot));
            room.finishedAt = Date.now();
            io.to(roomId).emit('room:reset', { success: true, room: room.toJSON() });
            io.emit('rooms:list', { success: true, rooms: gameManager.getAllRooms().map(r => r.toJSON()) });
            persist();
        }, config.game.roundBreakMs);
    };

    // El sonu tabelası 5 sn görünür, sonra yeni el başlar
    const startNextRoundLater = (roomId: string, game: Game) => {
        setTimeout(() => {
            if (game.status !== GameStatus.ROUND_ENDED) return;
            game.startNextRound();
            io.to(roomId).emit('game:roundStarted', { game: game.toPublicJSON() });
            scheduleTurn(roomId, game);
        }, config.game.roundBreakMs);
    };

    const broadcastRooms = () => io.emit('rooms:list', { success: true, rooms: gameManager.getAllRooms().map(r => r.toJSON()) });

    // Masayı kapat (arşivle): ana ekrandan kalkar, masadakiler lobiye döner
    const closeRoom = (roomId: string, reason: string) => {
        clearTimeout(turnTimers.get(roomId));
        turnTimers.delete(roomId);
        chatLogs.delete(roomId);
        const entry = gameManager.archiveRoom(roomId, reason);
        if (!entry) return;
        try { if (config.persist) appendArchive(entry); } catch (error) { console.error('Arşiv yazılamadı:', error); }
        io.to(roomId).emit('room:closed', { roomId, reason });
        io.in(roomId).socketsLeave(roomId);
        console.log(`Masa arşivlendi: ${entry.name} (${reason})`);
    };

    // Masa temizliği: insansız, uzun süre boşta ya da bitip yeniden başlamayan masalar kapanır
    const sweepRooms = () => {
        const now = Date.now();
        let closed = false;
        gameManager.getAllRooms().forEach(room => {
            const reason = !room.firstHuman() ? 'Masada yalnızca yapay zekâ kaldı'
                : now - room.lastActivityAt > config.game.idleRoomMs ? 'Masa uzun süre oynanmadı'
                : room.finishedAt && room.status === RoomStatus.WAITING && now - room.finishedAt > config.game.finishedRoomMs ? 'Oyun bitti, yeniden başlamadı'
                : null;
            if (reason) { closeRoom(room.id, reason); closed = true; }
        });
        if (closed) { broadcastRooms(); persist(); }
    };
    setInterval(sweepRooms, config.game.roomSweepMs).unref();

    // Diskten geri yüklenen oyunlar kaldığı yerden sürer; oyuncular dönebilsin diye ilk sırada tam süre
    gameManager.getAllRooms().forEach(room => {
        if (room.game?.status === GameStatus.STARTED) scheduleTurn(room.id, room.game, config.game.turnTimeout);
        if (room.game?.status === GameStatus.ROUND_ENDED) startNextRoundLater(room.id, room.game);
        if (room.game?.status === GameStatus.FINISHED && room.status === RoomStatus.PLAYING) resetRoomLater(room.id, room.game);
    });

    io.on('connection', (socket: Socket) => {
        console.log(`Yeni bağlantı: ${socket.id}`);
        socket.onAny(() => {
            // İnsan oyuncunun her olayı masasını canlı tutar; ardından kaydet
            const me = gameManager.getPlayerBySocketId(socket.id);
            const myRoom = me?.roomId ? gameManager.getRoomById(me.roomId) : undefined;
            if (myRoom) myRoom.lastActivityAt = Date.now();
            persist();
        });

        // İstemci yalnızca kendi oyuncusu adına iş yapabilir (yapay zekâ oyuncuların soketi yoktur, kimse onları yönetemez)
        const owns = (playerId: string | undefined) => {
            const p = playerId ? gameManager.getPlayerById(playerId) : undefined;
            return !!p && !p.isBot && p.socketId === socket.id;
        };
        const notYours = { success: false, error: 'Bu oyuncu adına işlem yapamazsın' };

        // Masa sohbeti: yalnızca o masadaki oyuncular yazar ve okur; son 50 mesaj bellekte tutulur
        let lastChatAt = 0;
        socket.on('chat:send', (data: { playerId: string; text: string }, callback) => {
            try {
                if (!owns(data?.playerId)) return callback?.(notYours);
                const player = gameManager.getPlayerById(data.playerId)!;
                const room = player.roomId ? gameManager.getRoomById(player.roomId) : undefined;
                if (!room) return callback?.({ success: false, error: 'Bir masada değilsin' });
                const text = String(data.text ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
                if (!text) return callback?.({ success: false, error: 'Boş mesaj gönderilemez' });
                const now = Date.now();
                if (now - lastChatAt < CHAT_MIN_GAP_MS) return callback?.({ success: false, error: 'Biraz yavaş: mesajlar arasında kısa bir ara olmalı' });
                lastChatAt = now;
                const message = { id: `${now}-${Math.random().toString(36).slice(2, 7)}`, playerId: player.id, name: player.name, text, ts: now };
                const list = chatLogs.get(room.id) || [];
                list.push(message);
                chatLogs.set(room.id, list.slice(-CHAT_HISTORY));
                io.to(room.id).emit('chat:message', message);
                callback?.({ success: true });
            } catch (error) {
                console.error('Sohbet hatası:', error);
                callback?.({ success: false, error: 'Mesaj gönderilemedi' });
            }
        });

        socket.on('chat:history', (data: { playerId: string }, callback) => {
            if (!owns(data?.playerId)) return callback?.(notYours);
            const roomId = gameManager.getPlayerById(data.playerId)?.roomId;
            callback?.({ success: true, messages: roomId ? chatLogs.get(roomId) || [] : [] });
        });

        // Yapay zekâ oyuncu ekle / çıkar: yalnızca oda sahibi, oyun başlamadan
        socket.on('room:addBot', (data: { roomId: string; playerId: string }, callback) => {
            try {
                const room = gameManager.getRoomById(data?.roomId);
                if (!room || !owns(data?.playerId) || !gameManager.isRoomOwner(data.playerId, room.id)) return callback({ success: false, error: 'Yalnızca masa sahibi yapay zekâ ekleyebilir' });
                if (room.game && room.game.status !== GameStatus.FINISHED) return callback({ success: false, error: 'Oyun sürerken eklenemez' });
                if (room.players.length >= room.maxPlayers) return callback({ success: false, error: 'Masa dolu' });
                const used = new Set(room.players.map(p => p.name));
                const name = BOT_NAMES.find(n => !used.has(n)) || `Yapay zekâ ${room.players.length}`;
                const bot = gameManager.createPlayer(name, `bot:${Math.random().toString(36).slice(2)}`);
                bot.isBot = true;
                bot.setReady(true);
                gameManager.addPlayerToRoom(bot.id, room.id);
                io.to(room.id).emit('player:joined', { success: true, player: bot.toPublicJSON(), room: room.toJSON() });
                io.emit('rooms:list', { success: true, rooms: gameManager.getAllRooms().map(r => r.toJSON()) });
                callback({ success: true, room: room.toJSON() });
            } catch (error) {
                console.error('Yapay zekâ ekleme hatası:', error);
                callback({ success: false, error: 'Yapay zekâ eklenemedi' });
            }
        });

        socket.on('room:removeBot', (data: { roomId: string; playerId: string; botId: string }, callback) => {
            try {
                const room = gameManager.getRoomById(data?.roomId);
                const bot = data?.botId ? gameManager.getPlayerById(data.botId) : undefined;
                if (!room || !owns(data?.playerId) || !gameManager.isRoomOwner(data.playerId, room.id) || !bot?.isBot) return callback({ success: false, error: 'Yalnızca masa sahibi yapay zekâyı çıkarabilir' });
                if (room.game && room.game.status !== GameStatus.FINISHED) return callback({ success: false, error: 'Oyun sürerken çıkarılamaz' });
                gameManager.removePlayerFromRoom(bot.id, room.id);
                gameManager.removePlayer(bot.id);
                io.to(room.id).emit('player:left', { success: true, playerId: bot.id, room: room.toJSON() });
                io.emit('rooms:list', { success: true, rooms: gameManager.getAllRooms().map(r => r.toJSON()) });
                callback({ success: true, room: room.toJSON() });
            } catch (error) {
                console.error('Yapay zekâ çıkarma hatası:', error);
                callback({ success: false, error: 'Yapay zekâ çıkarılamadı' });
            }
        });

        // Oyuncu Olayları
        socket.on('player:register', (data: { name: string; avatar?: string }, callback) => {
            try {
                const name = typeof data?.name === 'string' ? data.name.trim().slice(0, 20) : '';

                if (!name || name.trim() === '') {
                    return callback({
                        success: false,
                        error: 'Geçerli bir oyuncu adı gerekli'
                    });
                }

                const player = gameManager.createPlayer(name, socket.id);
                if (typeof data.avatar === 'string') player.avatar = data.avatar.slice(0, 40);

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

        // Oyun sürerken masadan kalk: koltuk (eli, puanı, sırası) aynı kimlikle yapay zekâya geçer,
        // oyuncu lobiye yeni bir kimlikle döner. Masada insan kalmazsa masa kapanır.
        socket.on('game:leaveTable', (data: { roomId: string; playerId: string }, callback) => {
            try {
                const room = gameManager.getRoomById(data?.roomId);
                const seat = data?.playerId ? gameManager.getPlayerById(data.playerId) : undefined;
                if (!room || !seat || !owns(seat.id) || seat.roomId !== room.id) return callback?.(notYours);
                if (room.status !== RoomStatus.PLAYING || !room.game) return callback?.({ success: false, error: 'Oyun sürmüyor' });

                const used = new Set(room.players.map(p => p.name));
                const humanName = seat.name;
                gameManager.updatePlayerSocket(seat.id, `bot:${Math.random().toString(36).slice(2)}`);
                seat.isBot = true;
                seat.connected = true;
                seat.name = BOT_NAMES.find(n => !used.has(n)) || `Yapay zekâ ${room.players.indexOf(seat) + 1}`;
                seat.setReady(true);
                socket.leave(room.id);
                const human = gameManager.createPlayer(humanName, socket.id);

                if (!room.firstHuman()) {
                    closeRoom(room.id, 'Masada yalnızca yapay zekâ kaldı');
                } else {
                    if (room.owner.id === seat.id) room.owner = room.players.find(p => !p.isBot)!;
                    io.to(room.id).emit('player:joined', { success: true, player: seat.toPublicJSON(), room: room.toJSON() });
                    if (room.game.isPlayerTurn(seat.id)) scheduleTurn(room.id, room.game);
                }
                persist();
                io.emit('rooms:list', { success: true, rooms: gameManager.getAllRooms().map(r => r.toJSON()) });
                callback?.({ success: true, player: human.toJSON() });
            } catch (error) {
                console.error('Masadan kalkma hatası:', error);
                callback?.({ success: false, error: 'Masadan kalkılamadı' });
            }
        });

        // Masa sahipliğini devret: yalnızca sahip, yalnızca masadaki bir insana
        socket.on('room:transferOwner', (data: { roomId: string; playerId: string; targetId: string }, callback) => {
            try {
                const room = gameManager.getRoomById(data?.roomId);
                if (!room || !owns(data?.playerId) || room.owner.id !== data.playerId) return callback?.({ success: false, error: 'Yalnızca masa sahibi devredebilir' });
                const target = room.players.find(p => p.id === data.targetId);
                if (!target || target.isBot || target.id === room.owner.id) return callback?.({ success: false, error: 'Sahiplik yalnızca masadaki başka bir oyuncuya verilebilir' });
                room.owner = target;
                io.to(room.id).emit('player:joined', { success: true, player: target.toPublicJSON(), room: room.toJSON() });
                broadcastRooms();
                persist();
                callback?.({ success: true, room: room.toJSON() });
            } catch (error) {
                console.error('Sahiplik devri hatası:', error);
                callback?.({ success: false, error: 'Sahiplik devredilemedi' });
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
                sweepRooms(); // yalnızca yapay zekâ kaldıysa masa kapanır

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
                if (!owns(data?.playerId)) return callback(notYours);
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

                if (!room.areAllPlayersReady()) {
                    return callback({ success: false, error: 'Herkes hazır olmadan oyun başlamaz' });
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
                if (!owns(data?.playerId)) return callback(notYours);
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
                if (!owns(data?.playerId)) return callback(notYours);
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
                        error: fromDiscard ? 'Bu taş yerden alınamaz' : 'Taş çekilemedi'
                    });
                }

                // Diğer oyunculara taş çekildiğini bildir (taşın detayları olmadan)
                socket.to(player.roomId).emit('game:tileDraw', {
                    success: true, deckCount: room.game.deck.length,
                    playerId,
                    fromDiscard,
                    fromDiscardOfPlayerId
                });

                if (fromDiscard && room.game.takenPenalty) emitPenalty(player.roomId, room.game, room.game.takenPenalty);

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

        socket.on('game:discardTile', (data: { playerId: string, tileId: string, finishSets?: string[][] }, callback) => {
            try {
                if (!owns(data?.playerId)) return callback(notYours);
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

                // Açmadan bitme perleri: yalnızca dizi-dizisi string kabul edilir (doğrulama Game'de)
                const finishSets = Array.isArray(data.finishSets) && data.finishSets.every(st => Array.isArray(st) && st.every(id => typeof id === 'string'))
                    ? data.finishSets : undefined;
                callback(discardAndAdvance(player.roomId, room.game, playerId, tileId, finishSets));
            } catch (error) {
                console.error('Taş atma hatası:', error);
                callback({
                    success: false,
                    error: 'Taş atılırken bir hata oluştu'
                });
            }
        });

        // Kustu: yandan alınan taşı geri koy
        socket.on('game:returnTaken', (data: { playerId: string }, callback) => {
            try {
                const player = gameManager.getPlayerById(data?.playerId);
                const room = player?.roomId ? gameManager.getRoomById(player.roomId) : undefined;
                if (!player || player.socketId !== socket.id || !room?.game) return callback({ success: false, error: 'Oyun bulunamadı' });
                callback(returnTaken(room.id, room.game, player.id));
            } catch (error) {
                console.error('Kusma hatası:', error);
                callback({ success: false, error: 'Taş geri konamadı' });
            }
        });

        // Geri al: bu sırada masaya oynananlar 100 cezayla ele döner
        socket.on('game:undoTurn', (data: { playerId: string }, callback) => {
            try {
                const player = gameManager.getPlayerById(data?.playerId);
                const room = player?.roomId ? gameManager.getRoomById(player.roomId) : undefined;
                if (!player || player.socketId !== socket.id || !room?.game) return callback({ success: false, error: 'Oyun bulunamadı' });
                const game = room.game;
                const r = game.undoTurnPlays(player.id);
                if (!r.success) return callback({ success: false, error: r.error });
                emitUndo(room.id, game, player, r);
                persist();
                callback({ success: true, remainingTiles: player.tiles.map(t => t.toJSON()) });
            } catch (error) {
                console.error('Geri alma hatası:', error);
                callback({ success: false, error: 'Geri alınamadı' });
            }
        });

        // El Açma / Taş Oynama
        socket.on('game:openHand', (data: { playerId: string, sets: string[][], kind?: SetKind, stage?: boolean }, callback) => {
            try {
                if (!owns(data?.playerId)) return callback(notYours);
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

                const result = gameManager.openHand(playerId, sets, kind, !!data.stage);

                if (!result.success) {
                    return callback({
                        success: false,
                        error: result.error
                    });
                }

                // Tüm oyunculara bildirimi gönder (bekleyen açılış da herkese görünür)
                emitHandOpened(player.roomId, room.game, player, result);
                extendTurn(player.roomId, room.game, player.id);

                // İsteği yapan oyuncuya kalan taşlarını bildir
                callback({
                    success: true,
                    remainingTiles: result.remainingTiles,
                    openedTotal: result.openedTotal,
                    turnAction: result.turnAction || room.game.turnAction,
                    pendingTotal: result.pendingTotal,
                    needed: result.needed
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
                if (!owns(data?.playerId)) return callback(notYours);
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
                    openState: openStateOf(room.game.getPlayerById(playerId)),
                    updatedSet: result.updatedSet,
                    swappedOkey: !!result.swappedOkeyTile
                });
                extendTurn(player.roomId, room.game, playerId);
                if (result.penalty) {
                    const { targetPlayerId, amount, tag, tile } = result.penalty;
                    emitPenalty(player.roomId, room.game, { playerId: targetPlayerId, amount, tag, tile, reason: tag === 'okey' ? 'Perindeki okey alındı' : 'Perine taş işlendi' });
                }

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
                if (!owns(data?.playerId)) return callback(notYours);
                const player = gameManager.getPlayerById(data?.playerId);
                const room = player?.roomId ? gameManager.getRoomById(player.roomId) : undefined;
                if (!player || !room?.game) return callback({ success: false, error: 'Oyun bulunamadı' });

                const result = room.game.addPairToSet(player.id, data.tileIds || [], data.targetSetId);
                if (!result.success || !result.newSet) return callback({ success: false, error: result.error });

                io.to(room.id).emit('game:perDropped', {
                    success: true,
                    playerId: player.id,
                    openState: openStateOf(room.game.getPlayerById(player.id)),
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
                        tag: result.penalty.tag,
                        tile: result.penalty.tile,
                        reason: 'Çiftine işlendi'
                    });
                }
                extendTurn(room.id, room.game, player.id);
                callback({ success: true, remainingTiles: result.remainingTiles });
            } catch (error) {
                console.error('Çift işleme hatası:', error);
                callback({ success: false, error: 'Çift işlenirken bir hata oluştu' });
            }
        });

        socket.on('game:dropPer', (data: { playerId: string, sets: string[][] }, callback) => {
            try {
                if (!owns(data?.playerId)) return callback(notYours);
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
                    openState: openStateOf(room.game.getPlayerById(playerId)),
                    newSets: result.newSets?.map(s => ({
                        id: s.id,
                        playerId: s.playerId,
                        tiles: s.tiles.map(t => t.toJSON()),
                        value: s.value,
                        kind: s.kind
                    }))
                });
                extendTurn(player.roomId, room.game, playerId);

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
            sweepRooms();
        });
    });
}; 