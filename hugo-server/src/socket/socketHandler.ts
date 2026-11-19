import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Server, Socket } from 'socket.io';
import { GameManager } from '../utils/GameManager';
import { config } from '../config/config';
import { Game, GameStatus, Penalty, SetKind, TurnAction } from '../models/Game';
import { Tile } from '../models/Tile';
import { Player } from '../models/Player';
import { Room, RoomStatus } from '../models/Room';
import { settingsOf } from '../models/GameSettings';
import { pickCity } from '../utils/cityNames';
import { appendArchive, saveState } from '../utils/Persistence';
import { planOpening, planSets } from '../ai/AiPlanner';
import { dayOf, dealSnapshot, findTile, logEvent, tileLabel } from '../utils/EventLog';
import { checkToken, days, problems, statsOf, tableEvents } from '../utils/Admin';
import { applyScenario, findScenario, listScenarios } from '../lab/scenario';
import { createTask, getAttachment, getTask, listTasks, updateTask, userAction } from '../tasks/tasks';
import { gameRounds, playerGames, roundEvents, searchPlayers } from '../utils/History';

const BOT_NAMES = ['Robo Rıza', 'Robo Nur', 'Robo Can', 'Robo Ece'];
const CHAT_MAX_LEN = 200;
const CHAT_HISTORY = 50;
const CHAT_MIN_GAP_MS = 700;
// Oyun kaydına yazılmayan sık / yalnızca okuma istekleri
const QUIET_EVENTS = new Set(['rooms:list', 'room:details', 'chat:history', 'game:requestTiles', 'client:log', 'voice:signal']); // soket başına mesaj aralığı: sel engeli

// Oyuncu kimliği herkese yayınlanır; koltuğa geri dönmek için ayrıca yalnızca sahibinde olan anahtar gerekir
const issueToken = (p: Player) => (p.authToken = crypto.randomBytes(24).toString('base64url'));
const tokenMatches = (p: Player, given: unknown) => {
    const a = Buffer.from(String(given ?? '')), b = Buffer.from(p.authToken);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const setupSocketHandlers = (io: Server) => {
    const gameManager = GameManager.getInstance();
    const turnTimers = new Map<string, NodeJS.Timeout>();
    const turnDeadlines = new Map<string, number>(); // oyuncu sırasının biteceği an (ms)

    // Masaya giden her olay (yapay zekâ ve otomatik hamleler dahil) oyun kaydına yazılır; el başında eller ve deste sırası da
    const rawTo = io.to.bind(io);
    io.to = ((target: string) => {
        const op = rawTo(target);
        const room = gameManager.getRoomById(String(target));
        if (!room) return op;
        const emit = op.emit.bind(op);
        op.emit = ((ev: string, payload?: any) => {
            const game = room.game;
            logEvent('masa', {
                masa: room.no, oyun: game?.id ?? null, el: game?.round ?? null, olay: ev,
                ...(payload?.playerId && { kim: room.getPlayerById(payload.playerId)?.name ?? null }),
                // Atılan taşın tüm alanları yerine adı ve kimliği yazılır (kayıt küçük kalsın)
                // (cezadaki tile zaten kısa ad: "kırmızı 7", olduğu gibi kalır)
                ...(typeof payload?.tile === 'object' && payload.tile
                    ? { veri: { ...payload, tile: { id: payload.tile.id, playerId: payload.tile.playerId } }, tas: tileLabel(payload.tile) }
                    : { veri: payload }),
                ...((ev === 'game:started' || ev === 'game:roundStarted') && game && { dagitim: dealSnapshot(game) }),
            });
            return emit(ev, payload);
        }) as typeof op.emit;
        return op;
    }) as typeof io.to;

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
    const chatLogs = new Map<string, { id: string; playerId: string; name: string; text: string; ts: number; admin?: boolean }[]>();

    // Sıra süresi sunucuda tutulur: süre dolunca taş otomatik çekilip en küçük taş atılır
    const scheduleTurn = (roomId: string, game: Game, overrideMs?: number) => {
        persist();
        clearTimeout(turnTimers.get(roomId));
        turnTimers.delete(roomId);
        if (game.status !== GameStatus.STARTED) return;
        const current = game.players[game.currentPlayerIndex];
        // Boşaltılan koltuk (admin kaldırdı): yeni oyuncu ya da yapay zekâ oturana kadar sıra bekler
        if (current.vacantUntil) {
            turnTimers.set(roomId, setTimeout(() => fillVacant(roomId, current.id), Math.max(0, current.vacantUntil - Date.now())));
            return;
        }
        if (current.isBot) {
            // Yapay zekâ kısa bir düşünme payıyla sunucuda oynar
            const think = config.game.botThinkMs + Math.floor(Math.random() * config.game.botThinkMs);
            turnTimers.set(roomId, setTimeout(() => botTurn(roomId, game, current.id), think));
            return;
        }
        // Test senaryosu masası: süre kapalıysa kimse otomatik oynamaz (koltuklar seat switcher ile oynanır)
        const room = gameManager.getRoomById(roomId);
        if (room?.labScenario && !room.labTimer) { turnDeadlines.delete(roomId); return; }
        // Tek gerçek oyuncu koptuysa sırası 2 saat bekler (dönerse oynar, dönmezse otomatik oynanır, oyun sürer)
        const ms = !current.connected && room?.soloAwayHuman() === current ? config.game.soloAwayTurnMs
            : overrideMs ?? (current.connected ? config.game.turnTimeout : config.game.disconnectedTurnTimeout);
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

        // Yandan alınıp kullanılmamış taş atılamaz: önce kusulur (masaya oynadıysa oynananlar geri alma cezasıyla ele döner),
        // sonra desteden çekilir
        if (game.takenDiscardTileId && player.tiles.some(t => t.id === game.takenDiscardTileId)) {
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
            // Çekilen taş görünsün: atma biraz sonra (bu arada sıra başka yoldan ilerlerse atılmaz)
            if (config.game.drawGapMs > 0) {
                turnTimers.set(roomId, setTimeout(() => {
                    turnTimers.delete(roomId);
                    if (game.isPlayerTurn(playerId) && game.turnAction === TurnAction.DISCARD) autoDiscard(roomId, game, playerId, drawn);
                }, config.game.drawGapMs));
                return;
            }
        }
        autoDiscard(roomId, game, playerId, drawn);
    };

    const autoDiscard = (roomId: string, game: Game, playerId: string, drawn: Tile | null) => {
        const player = game.getPlayerById(playerId);
        if (!player) return;
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
    const botBusy = new Set<string>(); // adımlar arası beklerken aynı masada ikinci bir yapay zekâ hamlesi başlamasın
    const botTurn = async (roomId: string, game: Game, botId: string) => {
        turnTimers.delete(roomId);
        const bot = game.getPlayerById(botId);
        if (!bot || !game.isPlayerTurn(botId) || botBusy.has(roomId)) return;
        botBusy.add(roomId);
        // Adımlar arası bekleme: açılış / işleme uçuşu bitmeden sıradaki hamle gelmesin. Beklerken masa kapandıysa ya da sıra
        // değiştiyse (oyuncu ayrıldı, el bitti) hamle bırakılır
        const step = config.game.botStepMs;
        const pause = async (ms: number) => {
            if (step > 0) await new Promise(r => setTimeout(r, ms));
            return gameManager.getRoomById(roomId)?.game === game && game.isPlayerTurn(botId);
        };
        try {
            if (game.turnAction === TurnAction.DRAW && bot.tiles.length !== 15) {
                const drawn = game.drawTile(botId, false);
                if (!drawn) {
                    if (game.deck.length === 0 && game.checkRoundEnd()) finishRound(roomId, game);
                    return;
                }
                io.to(roomId).emit('game:tileDraw', { success: true, deckCount: game.deck.length, playerId: botId, fromDiscard: false, fromDiscardOfPlayerId: null });
                // Çekilen taşın uçuşu görünsün, hemen atılmasın
                if (step > 0 && !await pause(config.game.drawGapMs)) return;
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
                    if (!await pause(Math.min(1400, step + (r.newSets?.flatMap(st => st.tiles).length || 0) * 60))) return;
                }
            } else if (!bot.openedWithPairs) {
                const extra = planSets(game, bot.tiles).filter(st => st.length >= 3);
                while (extra.length && extra.flat().length >= bot.tiles.length) extra.pop();
                const r = extra.length ? game.dropPer(botId, extra.map(st => st.map(t => t.id))) : null;
                if (r?.success) {
                    io.to(roomId).emit('game:perDropped', { success: true, playerId: botId, openState: openStateOf(bot), newSets: r.newSets?.map(setJSON) });
                    if (!await pause(Math.min(1400, step + (r.newSets?.flatMap(st => st.tiles).length || 0) * 60))) return;
                }
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
                                if (!await pause(step)) return; // bir işleme bitmeden diğeri gelmez
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
        } finally {
            botBusy.delete(roomId);
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

    // Profil: kayıtta verilen (başka cihazdan taşınmış olabilir) anahtar doğruysa ona bağlanır, yoksa yeni profil açılır.
    // Yeni profilin anahtarı yalnızca bu cevapta döner (istemci saklar).
    const attachProfile = (player: Player, given?: { id?: string; key?: string }) => {
        let profile = gameManager.profiles.verify(given?.id, given?.key);
        let key: string | undefined;
        if (!profile) ({ profile, key } = gameManager.profiles.create(player.name, player.avatar || ''));
        player.profileId = profile.id;
        Object.assign(profile, { name: player.name, avatar: player.avatar || profile.avatar, lastSeenAt: Date.now() });
        return key ? { id: profile.id, key } : { id: profile.id };
    };
    // Çevrimiçi profiller (bağlı gerçek oyuncular); masadaysa masası
    const onlineProfiles = () => {
        const out = new Map<string, { name: string; avatar: string; where: 'lobby' | 'table' | 'playing'; roomName: string | null; roomId: string | null }>();
        gameManager.getAllPlayers().forEach(p => {
            if (p.isBot || !p.profileId || !io.sockets.sockets.has(p.socketId)) return;
            const room = p.roomId ? gameManager.getRoomById(p.roomId) : undefined;
            if (out.get(p.profileId)?.roomId) return;
            out.set(p.profileId, {
                name: p.name, avatar: p.avatar || '', roomName: room?.name || null, roomId: room?.id || null,
                where: !room ? 'lobby' : room.status === RoomStatus.PLAYING ? 'playing' : 'table',
            });
        });
        return out;
    };
    const profileSockets = (profileId: string) => gameManager.getAllPlayers()
        .filter(p => !p.isBot && p.profileId === profileId && io.sockets.sockets.has(p.socketId)).map(p => p.socketId);
    const notifyProfiles = (ids: (string | undefined)[]) =>
        ids.forEach(id => id && profileSockets(id).forEach(s => io.to(s).emit('friends:changed')));
    const INVITE_MS = 20_000;
    // İzleyenler: masa → (soket → ad); masadakiler adlarını görür
    const watchers = new Map<string, Map<string, string>>();
    const watcherNames = (roomId: string) => [...(watchers.get(roomId)?.values() || [])];
    const inviteSentAt = new Map<string, number>();

    // ── Sesli sohbet (WebRTC; sunucu yalnızca bağlantı kurma mesajlarını aktarır, ses oyuncular arasında doğrudan gider) ──
    // voiceMembers: masada sese katılmış (mikrofonu ya da hoparlörü açık) oyuncular. Masanın sesli sohbeti kapanınca dağılır.
    const voiceMembers = new Map<string, Set<string>>();
    const voiceState = new Map<string, boolean>();
    const syncVoice = (room: Room) => {
        const on = room.voiceActive();
        if (voiceState.get(room.id) === on) return;
        voiceState.set(room.id, on);
        if (!on) voiceMembers.delete(room.id);
        io.to(room.id).emit('room:voice', { roomId: room.id, voice: on });
    };
    const leaveVoice = (roomId: string, playerId: string) => {
        const set = voiceMembers.get(roomId);
        if (!set?.delete(playerId)) return;
        io.to(roomId).emit('voice:peer-left', { playerId });
    };
    // Oda listesi her değiştiğinde (oturma, kalkma, kaldırma, yapay zekâ…) sesli sohbet durumu yeniden hesaplanır
    const rawEmit = io.emit.bind(io);
    io.emit = ((ev: string, ...args: unknown[]) => {
        const r = rawEmit(ev, ...args);
        if (ev === 'rooms:list') gameManager.getAllRooms().forEach(syncVoice);
        return r;
    }) as typeof io.emit;

    // Masayı kapat (arşivle): ana ekrandan kalkar, masadakiler lobiye döner
    // Masaya yapay zekâ ekle (oyun başlamadan, boş koltuğa)
    const addBotTo = (room: Room) => {
        const used = new Set(room.players.map(p => p.name));
        const name = BOT_NAMES.find(n => !used.has(n)) || `Yapay zekâ ${room.players.length}`;
        const bot = gameManager.createPlayer(name, `bot:${Math.random().toString(36).slice(2)}`);
        bot.isBot = true;
        bot.setReady(true);
        gameManager.addPlayerToRoom(bot.id, room.id);
        io.to(room.id).emit('player:joined', { success: true, player: bot.toPublicJSON(), room: room.toJSON() });
        return bot;
    };

    // Oyunu başlatır: masadakilere bildirilir, herkese kendi taşları gider, ilk sıranın süresi başlar
    const beginGame = (room: Room) => {
        if (!gameManager.startGame(room.id)) return false;
        io.to(room.id).emit('game:started', { success: true, room: room.toJSON() });
        room.players.forEach(p => io.to(p.socketId).emit('game:tiles', { success: true, tiles: p.tiles.map(t => t.toJSON()) }));
        if (room.game) scheduleTurn(room.id, room.game);
        return true;
    };

    // Boşaltılan koltuğa yapay zekâ oturur (süre doldu ya da admin ekledi); masada gerçek oyuncu kalmadıysa masa kapanır
    const fillVacant = (roomId: string, seatId: string) => {
        const room = gameManager.getRoomById(roomId);
        const seat = room?.players.find(p => p.id === seatId);
        if (!room || !seat?.vacantUntil) return false;
        const used = new Set(room.players.map(p => p.name));
        seat.vacantUntil = null;
        seat.isBot = true;
        seat.connected = true;
        seat.name = BOT_NAMES.find(n => !used.has(n)) || `Yapay zekâ ${room.players.indexOf(seat) + 1}`;
        seat.setReady(true);
        gameManager.updatePlayerSocket(seat.id, `bot:${Math.random().toString(36).slice(2)}`);
        if (!room.firstHuman()) {
            closeRoom(room.id, 'Masada yalnızca yapay zekâ kaldı');
        } else {
            io.to(room.id).emit('player:joined', { success: true, player: seat.toPublicJSON(), room: room.toJSON() });
            if (room.game?.isPlayerTurn(seat.id)) scheduleTurn(room.id, room.game);
        }
        broadcastRooms();
        persist();
        return true;
    };

    // Admin oyuncuyu masadan kaldırır. Oyun sürüyorsa koltuk (taşları, puanı) vacantSeatMs boyunca yeni oyuncu bekler,
    // sonra yapay zekâ oturur; oyun başlamadıysa oyuncu çıkar, koltuk o süre içinde dolmazsa yapay zekâ eklenir.
    // Kaldırılan gerçek oyuncu lobiye döner (oyundaysa yeni kimlikle: eski koltuğa geri bağlanamaz).
    const kickPlayer = (room: Room, seat: Player, reason: string) => {
        const sock = seat.isBot ? undefined : io.sockets.sockets.get(seat.socketId);
        const wait = config.game.vacantSeatMs;
        if (room.status === RoomStatus.PLAYING && room.game) {
            const humanName = seat.name;
            gameManager.updatePlayerSocket(seat.id, `vacant:${uuidv4()}`);
            Object.assign(seat, { isBot: false, connected: false, authToken: '', legacyAuth: false, disconnectedAt: null, name: 'Boş koltuk', vacantUntil: Date.now() + wait });
            if (room.owner.id === seat.id) room.owner = room.players.find(p => !p.isBot && !p.vacantUntil) || room.owner;
            if (sock) {
                sock.leave(room.id);
                const human = gameManager.createPlayer(humanName, sock.id);
                human.profileId = seat.profileId;
                seat.profileId = '';
                sock.emit('room:kicked', { roomId: room.id, reason, player: human.toJSON(), token: issueToken(human) });
            }
            setTimeout(() => fillVacant(room.id, seat.id), wait);
            io.to(room.id).emit('player:joined', { success: true, player: seat.toPublicJSON(), room: room.toJSON() });
            if (room.game.isPlayerTurn(seat.id)) scheduleTurn(room.id, room.game);
        } else {
            gameManager.removePlayerFromRoom(seat.id, room.id);
            if (seat.isBot) gameManager.removePlayer(seat.id);
            if (sock) { sock.leave(room.id); sock.emit('room:kicked', { roomId: room.id, reason }); }
            io.to(room.id).emit('player:left', { success: true, playerId: seat.id, room: room.toJSON() });
            setTimeout(() => {
                const r = gameManager.getRoomById(room.id);
                if (r && r.status === RoomStatus.WAITING && r.players.length < r.maxPlayers && r.firstHuman()) { addBotTo(r); broadcastRooms(); persist(); }
            }, wait);
        }
        broadcastRooms();
        persist();
    };

    const closeRoom = (roomId: string, reason: string) => {
        clearTimeout(turnTimers.get(roomId));
        turnTimers.delete(roomId);
        chatLogs.delete(roomId);
        voiceMembers.delete(roomId);
        voiceState.delete(roomId);
        watchers.delete(roomId);
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
            // Süresi geçmiş boş koltuk (yeniden başlatmada zamanlayıcı kaybolur): yapay zekâ oturur
            room.players.filter(p => p.vacantUntil && p.vacantUntil < now).forEach(p => fillVacant(room.id, p.id));
            // Tek gerçek oyuncu koptu, oyun sürüyor: masa boşta sayılmaz; kopmasından 6 saat sonra hâlâ yoksa kapanır
            const away = room.status === RoomStatus.PLAYING ? room.soloAwayHuman() : null;
            if (away) away.disconnectedAt ??= now; // yeniden başlatmada geri yüklenen oyuncu: süre şimdiden sayılır
            const reason = !room.firstHuman() ? 'Masada yalnızca yapay zekâ kaldı'
                : away ? (now - away.disconnectedAt! > config.game.soloAwayMaxMs ? 'Oyuncu uzun süre dönmedi' : null)
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

    // Admin anahtarı bağlantıda da verilebilir (handshake auth). Staging'e yalnızca admin bağlanır (parola korumasının ikinci katı)
    io.use((socket, next) => {
        const given = socket.handshake.auth?.adminToken;
        if (given && checkToken(given)) socket.data.admin = true;
        if (config.appEnv === 'staging' && !socket.data.admin) {
            // Teşhis: staging'e giremeyen cihaz (anahtar yok / yanlış) günlükte görünsün; anahtarın kendisi yazılmaz
            console.warn(`Staging bağlantısı reddedildi: anahtar ${given ? 'yanlış' : 'yok'} · ${String(socket.handshake.headers['user-agent'] || '').slice(0, 120)}`);
            return next(new Error('admin-required'));
        }
        next();
    });

    io.on('connection', (socket: Socket) => {
        console.log(`Yeni bağlantı: ${socket.id}`);
        logEvent('baglanti', { soket: socket.id, ua: String(socket.handshake.headers['user-agent'] || '').slice(0, 160) });
        // Her istek oyun kaydına yazılır (sonucu ve taşların adlarıyla); reddedilen istek ayrıca sunucu günlüğüne
        socket.use((packet, next) => {
            const event = String(packet[0]);
            if (QUIET_EVENTS.has(event) || event.startsWith('admin:')) return next();
            const me = gameManager.getPlayerBySocketId(socket.id);
            const room = me?.roomId ? gameManager.getRoomById(me.roomId) : undefined;
            const args = packet.length > 1 && typeof packet[1] === 'object' && packet[1] ? { ...packet[1] } : {};
            if (typeof args.avatar === 'string' && args.avatar.length > 80) args.avatar = '(uzun)';
            if (args.token) args.token = '(gizli)'; // oturum anahtarı kayda girmez
            const ids: string[] = [args.tileId, ...(args.tileIds || []), ...(args.sets || []).flat(), ...(args.finishSets || []).flat()].filter(Boolean);
            const base = {
                oyuncu: me?.name ?? args.name ?? null, oyuncuId: me?.id ?? args.playerId ?? null, soket: socket.id,
                masa: room?.no ?? null, oyun: room?.game?.id ?? null, el: room?.game?.round ?? null, istek: event, veri: args,
                ...(ids.length && { taslar: ids.map(id => tileLabel(findTile(room?.game, id))) }),
            };
            const last = packet.length - 1;
            const ack = packet[last];
            if (last > 0 && typeof ack === 'function') {
                // Paket yerinde değişir: olay işleyicisi kaydı tutan ack'i alır
                packet[last] = (res: any) => {
                    const ok = !(res && res.success === false);
                    logEvent('istek', { ...base, ok, ...(!ok && { hata: res?.error }), ...(res?.tile && { cekilen: tileLabel(res.tile) }) });
                    if (!ok) {
                        const owner = args.playerId && args.playerId !== me?.id ? ` (bu soket ${args.playerId} oyuncusuna bağlı değil)` : '';
                        console.warn(`Reddedildi [${me?.name || '?'}] ${event}: ${res.error}${owner}`);
                    }
                    ack(res);
                };
            } else {
                logEvent('istek', base);
            }
            next();
        });
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
        // İstemci teşhis kaydı (hata / donma): yalnızca sunucu günlüğüne yazılır, soket başına en çok 30
        let clientLogs = 0;
        socket.on('client:log', (data: unknown) => {
            if (++clientLogs > 30) return;
            const who = gameManager.getPlayerById(String((data as any)?.playerId || ''))?.name || '?';
            console.warn(`İstemci [${who}]:`, JSON.stringify(data).slice(0, 1500));
            const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
            if (d.type !== 'dokunma' && d.type !== 'dizme') logEvent('istemci', { oyuncu: who, ...d });
        });

        // Yönetim ekranı (/admin): anahtarla girilir; masaları izler, kapatır, herkese duyuru gönderir
        let adminFails = 0;
        const admin = (event: string, fn: (data: any) => unknown) => socket.on(event, (data: any, callback?: (r: unknown) => void) => {
            if (typeof callback !== 'function') return;
            if (!socket.data.admin) return callback({ success: false, error: 'Yönetim anahtarı gerekli' });
            Promise.resolve().then(() => fn(data))
                .then(r => callback({ success: true, ...(r as object) }))
                .catch(error => callback({ success: false, error: (error as Error).message || 'Sunucu hatası' }));
        });
        socket.on('admin:login', (data: { token?: string }, callback?: (r: unknown) => void) => {
            if (typeof callback !== 'function') return;
            if (adminFails >= 5) return callback({ success: false, error: 'Çok fazla hatalı deneme' });
            if (!checkToken(data?.token)) { adminFails++; logEvent('yonetim', { islem: 'hatali-giris', soket: socket.id }); return callback({ success: false, error: 'Anahtar yanlış' }); }
            socket.data.admin = true;
            logEvent('yonetim', { islem: 'giris', soket: socket.id });
            callback({ success: true });
        });
        // Yönetim ekranındaki tarayıcı hatası (giriş öncesi de): sunucu günlüğüne ve oyun kaydına
        let adminErrors = 0;
        socket.on('admin:clientError', (data: unknown) => {
            if (++adminErrors > 20) return;
            console.warn('Yönetim ekranı hatası:', JSON.stringify(data).slice(0, 1500));
            const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
            // 'acildi' teşhis bilgisidir (sorun listesine düşmez); diğerleri ekran hatası
            if (d.type === 'acildi') logEvent('yonetim', { islem: 'acildi', ...d });
            else logEvent('istemci', { oyuncu: 'yönetim', type: 'yonetim-hata', ...d });
        });
        admin('admin:overview', async () => ({
            sunucu: { calisma: Math.round(process.uptime()), bellekMb: Math.round(process.memoryUsage().rss / 1048576), baglanti: io.engine.clientsCount },
            insanCevrimici: gameManager.getAllPlayers().filter(p => !p.isBot && p.connected).length,
            masalar: gameManager.getAllRooms().map(r => ({
                no: r.no, ad: r.name, durum: r.status, ses: r.voiceActive(), sesAyar: !!r.settings?.voice, sesAdmin: r.voiceOverride, olusturma: r.createdAt, sonHareket: r.lastActivityAt,
                el: r.game?.round ?? null, hugo: r.game ? r.game.isHugoRound() : false, deste: r.game?.deck.length ?? null,
                sira: r.game?.status === GameStatus.STARTED ? r.game.players[r.game.currentPlayerIndex]?.name ?? null : null,
                oyuncular: r.players.map(p => ({ id: p.id, bos: !!p.vacantUntil, ad: p.name, bot: !!p.isBot, bagli: !!p.connected, puan: p.getTotalScore(), ceza: p.penaltyScore, tas: p.tiles.length, acik: !!p.isOpen })),
            })),
            bugun: await statsOf(),
        }));
        admin('admin:stats', async (d) => ({ gun: d?.day || dayOf(), gunler: await days(), istatistik: await statsOf(d?.day || dayOf()) }));
        admin('admin:tableLog', async (d) => ({ olaylar: await tableEvents(Number(d?.no), d?.day || dayOf()) }));
        admin('admin:problems', async (d) => ({ olaylar: await problems(d?.day || dayOf()) }));
        // Gizli izleme: admin bağlantısı masanın yayın kanalına sessizce girer (oyuncu listesinde yok, kimseye bildirim gitmez);
        // masadaki her olayda ekran tam durumu (bütün eller dahil) yeniden ister
        const roomByNo = (no: unknown) => gameManager.getAllRooms().find(r => r.no === Number(no));
        const spectate = (no: unknown) => {
            const room = roomByNo(no);
            if (!room) throw new Error('Masa yok');
            const g = room.game;
            const deadline = turnDeadlines.get(room.id);
            return {
                masa: {
                    no: room.no, ad: room.name, durum: room.status,
                    oyun: g ? g.toPublicJSON() : null,
                    eller: Object.fromEntries(room.players.map(p => [p.id, p.tiles.map(t => t.toJSON())])),
                    baglanti: Object.fromEntries(room.players.map(p => [p.id, { bot: !!p.isBot, bagli: !!p.connected }])),
                    cezalar: g?.roundPenalties ?? [],
                    kalanSn: deadline && g?.status === GameStatus.STARTED ? Math.max(0, Math.round((deadline - Date.now()) / 1000)) : null,
                },
            };
        };
        admin('admin:watch', (d) => {
            const room = roomByNo(d?.no);
            if (!room) throw new Error('Masa yok');
            if (socket.data.watching && socket.data.watching !== room.id) socket.leave(socket.data.watching);
            socket.join(room.id);
            socket.data.watching = room.id;
            logEvent('yonetim', { islem: 'izle', masa: room.no });
            return spectate(d?.no);
        });
        admin('admin:unwatch', () => {
            if (socket.data.watching) socket.leave(socket.data.watching);
            socket.data.watching = null;
            return {};
        });
        admin('admin:tableState', (d) => spectate(d?.no));
        admin('admin:closeTable', (d) => {
            const room = gameManager.getAllRooms().find(r => r.no === Number(d?.no));
            if (!room) throw new Error('Masa yok');
            logEvent('yonetim', { islem: 'masa-kapat', masa: room.no });
            closeRoom(room.id, 'Yönetici masayı kapattı');
            broadcastRooms();
            persist();
            return {};
        });
        // Masanın sohbeti (canlı izleme) ve yönetici olarak sohbete yazma: oyuncular "Yönetici" etiketiyle görür
        // Oyun geçmişi: oyuncu ara → oyunları → elleri → bir elin dağıtımı ve hamleleri
        admin('admin:historyPlayers', async (d) => ({ players: await searchPlayers(d?.q) }));
        admin('admin:historyGames', async (d) => ({ games: await playerGames(d?.name) }));
        admin('admin:historyGame', async (d) => ({ rounds: await gameRounds(d?.game) }));
        admin('admin:historyRound', async (d) => ({ events: await roundEvents(d?.game, d?.round) }));
        admin('admin:tableChat', (d) => {
            const room = roomByNo(d?.no);
            if (!room) throw new Error('Masa yok');
            return { messages: chatLogs.get(room.id) || [] };
        });
        admin('admin:chatSend', (d) => {
            const room = roomByNo(d?.no);
            if (!room) throw new Error('Masa yok');
            const text = String(d?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
            if (!text) throw new Error('Boş mesaj gönderilemez');
            const now = Date.now();
            const message = { id: `${now}-${Math.random().toString(36).slice(2, 7)}`, playerId: 'admin', name: 'Yönetici', text, ts: now, admin: true };
            const list = chatLogs.get(room.id) || [];
            list.push(message);
            chatLogs.set(room.id, list.slice(-CHAT_HISTORY));
            io.to(room.id).emit('chat:message', message);
            logEvent('yonetim', { islem: 'sohbet', masa: room.no, text });
            return { message };
        });
        // Sesli sohbet: aç (kişi kuralı aranmaz) / kapat / otomatik (masa ayarı + en az 2 gerçek oyuncu)
        admin('admin:voice', (d) => {
            const room = roomByNo(d?.no);
            if (!room) throw new Error('Masa yok');
            const mode = String(d?.mode);
            if (!['on', 'off', 'auto'].includes(mode)) throw new Error('Geçersiz seçim');
            room.voiceOverride = mode === 'auto' ? null : mode as 'on' | 'off';
            logEvent('yonetim', { islem: 'sesli-sohbet', masa: room.no, mode });
            broadcastRooms(); // durum yeniden hesaplanır, masaya bildirilir
            persist();
            return { voice: room.voiceActive() };
        });
        admin('admin:kickPlayer', (d) => {
            const room = roomByNo(d?.no);
            const seat = room?.players.find(p => p.id === String(d?.playerId));
            if (!room || !seat) throw new Error('Oyuncu masada değil');
            if (seat.vacantUntil) throw new Error('Koltuk zaten boş');
            logEvent('yonetim', { islem: 'oyuncu-kaldir', masa: room.no, oyuncu: seat.name });
            kickPlayer(room, seat, 'Yönetici seni masadan çıkardı');
            return {};
        });
        admin('admin:addBot', (d) => {
            const room = roomByNo(d?.no);
            if (!room) throw new Error('Masa yok');
            const vacant = room.players.find(p => p.vacantUntil);
            if (vacant) fillVacant(room.id, vacant.id);
            else if (room.status === RoomStatus.PLAYING) throw new Error('Oyun sürüyor: boş koltuk yok');
            else if (room.players.length >= room.maxPlayers) throw new Error('Masa dolu');
            else { addBotTo(room); broadcastRooms(); persist(); }
            logEvent('yonetim', { islem: 'yz-ekle', masa: room.no });
            return {};
        });
        admin('admin:announce', (d) => {
            const text = String(d?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
            if (!text) throw new Error('Boş duyuru');
            logEvent('yonetim', { islem: 'duyuru', text });
            io.emit('server:announce', { text });
            return {};
        });

        // Görevler (Faz 4): istek listesi, test sonucu (onay / revize / iptal), ekran görüntüleri. Veriler prod veritabanında.
        admin('admin:tasks', async (d) => ({ tasks: await listTasks(!!d?.all), stagingUrl: config.stagingUrl, scenarios: listScenarios().map(({ id, title }) => ({ id, title })) }));
        admin('admin:task', async (d) => getTask(Number(d?.id)));
        admin('admin:taskCreate', async (d) => {
            const task = await createTask(d?.title, d?.body);
            logEvent('yonetim', { islem: 'gorev', gorev: task.id });
            return { task };
        });
        admin('admin:taskUpdate', async (d) => ({ task: await updateTask(Number(d?.id), { title: d?.title, body: d?.body }) }));
        admin('admin:taskAction', async (d) => {
            const images = Array.isArray(d?.images) ? d.images : [];
            const noteId = await userAction(Number(d?.id), String(d?.action), d?.body, images);
            logEvent('yonetim', { islem: 'gorev-' + String(d?.action), gorev: Number(d?.id) });
            return { noteId, ...(await getTask(Number(d?.id))) };
        });
        admin('admin:taskAttachment', async (d) => {
            const a = await getAttachment(Number(d?.id));
            return { dataUrl: `data:${a.mime};base64,${a.data.toString('base64')}` };
        });

        // Lab (test senaryoları): yalnızca staging / yerel ortamda ve admin için. Seat switcher ile admin masadaki
        // herhangi bir koltuğa geçip o oyuncu yerine oynar, sohbete yazar.
        const lab = (event: string, fn: (data: any) => unknown) => admin(event, (d) => {
            if (!config.lab) throw new Error('Yalnızca test ortamında');
            return fn(d);
        });
        const labRoom = (roomId: unknown) => {
            const room = gameManager.getRoomById(String(roomId));
            if (!room?.labScenario) throw new Error('Test masası değil');
            return room;
        };
        const takeSeat = (room: Room, target: Player) => {
            if (target.isBot) throw new Error('Yapay zekâ koltuğuna geçilemez');
            const prev = gameManager.getPlayerBySocketId(socket.id);
            if (prev && prev.id !== target.id) { gameManager.updatePlayerSocket(prev.id, `lab:${uuidv4()}`); }
            gameManager.updatePlayerSocket(target.id, socket.id);
            target.connected = true;
            socket.join(room.id);
            return { player: target.toJSON(), token: issueToken(target), room: room.toJSON() };
        };
        const labChat = (room: Room, chat: { seat: number; text: string }[] = []) => chatLogs.set(room.id, chat.map((c, i) => {
            const p = room.players[c.seat] || room.players[0];
            return { id: `lab-${i}`, playerId: p.id, name: p.name, text: String(c.text).slice(0, CHAT_MAX_LEN), ts: Date.now() - (chat.length - i) * 1000 };
        }));
        lab('lab:scenarios', () => ({ scenarios: listScenarios().map(({ id, title, description }) => ({ id, title, description })) }));
        lab('lab:start', (d) => {
            const s = findScenario(String(d?.id));
            if (!s) throw new Error('Senaryo yok');
            const seats = s.seats.map(seat => {
                const p = gameManager.createPlayer(String(seat.name).slice(0, 20), `lab:${uuidv4()}`);
                p.isBot = !!seat.bot;
                p.connected = true;
                p.setReady(true);
                return p;
            });
            const room = gameManager.createRoom(`Test: ${s.title || s.id}`, seats[0].id)!;
            seats.slice(1).forEach(p => gameManager.addPlayerToRoom(p.id, room.id));
            room.labScenario = s.id!;
            room.labTimer = !!s.timer;
            try { applyScenario(room, s); } catch (error) { closeRoom(room.id, 'Senaryo yüklenemedi'); throw error; }
            room.status = RoomStatus.PLAYING;
            labChat(room, s.chat);
            logEvent('yonetim', { islem: 'senaryo', senaryo: s.id, masa: room.no });
            const seat = takeSeat(room, room.players.find(p => !p.isBot) || room.players[0]);
            broadcastRooms();
            scheduleTurn(room.id, room.game!);
            return seat;
        });
        lab('lab:takeSeat', (d) => {
            const target = gameManager.getPlayerById(String(d?.playerId));
            if (!target?.roomId) throw new Error('Oyuncu yok');
            return takeSeat(labRoom(target.roomId), target);
        });
        // Sıfırla: aynı senaryo aynı masada baştan kurulur; masadakiler ekranı yeniden alır
        lab('lab:reset', (d) => {
            const room = labRoom(d?.roomId);
            const s = findScenario(room.labScenario!);
            if (!s) throw new Error('Senaryo yok');
            clearTimeout(turnTimers.get(room.id));
            applyScenario(room, s);
            room.status = RoomStatus.PLAYING;
            labChat(room, s.chat);
            io.to(room.id).emit('lab:reset', { roomId: room.id });
            scheduleTurn(room.id, room.game!);
            return {};
        });

        // Sesli sohbete katıl: masadaki diğer katılanlar listesi ve bağlantı sunucuları döner; katılan diğerlerine bildirilir
        socket.on('voice:join', (data: { playerId: string }, callback) => {
            if (!owns(data?.playerId)) return callback?.(notYours);
            const player = gameManager.getPlayerById(data.playerId)!;
            const room = player.roomId ? gameManager.getRoomById(player.roomId) : undefined;
            if (!room?.voiceActive()) return callback?.({ success: false, error: 'Bu masada sesli sohbet kapalı' });
            const set = voiceMembers.get(room.id) || new Set<string>();
            const peers = [...set].filter(id => id !== player.id);
            set.add(player.id);
            voiceMembers.set(room.id, set);
            socket.to(room.id).emit('voice:peer-joined', { playerId: player.id });
            callback?.({ success: true, peers, iceServers: config.iceServers });
        });
        socket.on('voice:leave', (data: { playerId: string }) => {
            if (!owns(data?.playerId)) return;
            const roomId = gameManager.getPlayerById(data.playerId)?.roomId;
            if (roomId) leaveVoice(roomId, data.playerId);
        });
        // Bağlantı kurma mesajı (teklif / cevap / aday) yalnızca aynı masada sese katılmış iki oyuncu arasında aktarılır
        socket.on('voice:signal', (data: { playerId: string; to: string; data: unknown }) => {
            if (!owns(data?.playerId)) return;
            const me = gameManager.getPlayerById(data.playerId)!;
            const to = gameManager.getPlayerById(String(data?.to));
            const set = me.roomId ? voiceMembers.get(me.roomId) : undefined;
            if (!to || to.roomId !== me.roomId || !set?.has(me.id) || !set.has(to.id)) return;
            io.sockets.sockets.get(to.socketId)?.emit('voice:signal', { from: me.id, data: data.data });
        });

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
                addBotTo(room);
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
        socket.on('player:register', (data: { name: string; avatar?: string; profile?: { id?: string; key?: string } }, callback) => {
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
                    player: player.toJSON(),
                    token: issueToken(player),
                    profile: attachProfile(player, data?.profile),
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
        socket.on('room:create', (data: { name: string, playerId: string, voice?: boolean }, callback) => {
            try {
                stopWatching(); // izlerken masaya oturan izlemeyi bırakır
                const { playerId } = data;
                // Ad sorulmaz: açık masalarda olmayan bir şehir adı (sahip bekleme ekranında değiştirebilir)
                const name = (typeof data?.name === 'string' && data.name.trim().slice(0, 30)) || pickCity(gameManager.getAllRooms().map(r => r.name));

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

        // ── Profil, arkadaşlar, davet ──
        // Profil isteyen işlemler: oyuncu bu bağlantının ve profili olmalı
        const meOf = (playerId: string | undefined) => {
            if (!owns(playerId)) return null;
            const player = gameManager.getPlayerById(playerId!);
            const profile = gameManager.profiles.get(player?.profileId);
            return player && profile ? { player, profile } : null;
        };
        const noProfile = { success: false, error: 'Profil bulunamadı' };

        // Ad değiştir (lobide, hesabım penceresi): oyuncu ve profil
        socket.on('player:rename', (data: { playerId: string; name: string }, callback) => {
            if (!owns(data?.playerId)) return callback?.(notYours);
            const player = gameManager.getPlayerById(data.playerId);
            const name = typeof data?.name === 'string' ? data.name.trim().slice(0, 20) : '';
            if (!player || !name) return callback?.({ success: false, error: 'Geçerli bir ad yaz' });
            if (player.roomId) return callback?.({ success: false, error: 'Adını masadan kalkınca değiştirebilirsin' });
            player.name = name;
            const profile = gameManager.profiles.get(player.profileId);
            if (profile) profile.name = name;
            persist();
            callback?.({ success: true, player: player.toJSON() });
        });

        // Başka cihazdan taşınan profil: anahtar doğruysa bu oyuncu o profile geçer
        socket.on('profile:link', (data: { playerId: string; profile: { id?: string; key?: string } }, callback) => {
            if (!owns(data?.playerId)) return callback?.(notYours);
            const player = gameManager.getPlayerById(data.playerId);
            const profile = gameManager.profiles.verify(data?.profile?.id, data?.profile?.key);
            if (!player || !profile) return callback?.({ success: false, error: 'Bağlantı geçersiz ya da süresi dolmuş' });
            player.profileId = profile.id;
            profile.lastSeenAt = Date.now();
            persist();
            callback?.({ success: true, profile: { id: profile.id } });
        });

        // Lobi / bekleme ekranı: arkadaşlar, istekler, çevrimiçi oyuncular
        socket.on('social:state', (data: { playerId: string }, callback) => {
            const me = meOf(data?.playerId);
            if (!me) return callback?.(noProfile);
            const online = onlineProfiles();
            const card = (id: string) => {
                const p = gameManager.profiles.get(id);
                const o = online.get(id);
                return p ? { id, name: o?.name || p.name, avatar: o?.avatar || p.avatar, online: !!o, where: o?.where || null, roomName: o?.roomName || null, roomId: o?.roomId || null } : null;
            };
            const friends = me.profile.friends.map(card).filter(Boolean);
            const requests = me.profile.requests.map(card).filter(Boolean);
            const others = [...online.keys()].filter(id => id !== me.profile.id).slice(0, 40)
                .map(id => ({ ...card(id)!, friend: me.profile.friends.includes(id), requested: gameManager.profiles.get(id)!.requests.includes(me.profile.id) }));
            callback?.({ success: true, me: { id: me.profile.id }, friends, requests, online: others, onlineCount: online.size });
        });

        socket.on('friends:request', (data: { playerId: string; to: string }, callback) => {
            const me = meOf(data?.playerId);
            if (!me) return callback?.(noProfile);
            const r = gameManager.profiles.request(me.profile.id, data?.to);
            if (r === 'error') return callback?.({ success: false, error: 'Arkadaşlık isteği gönderilemedi' });
            notifyProfiles([data.to, me.profile.id]);
            persist();
            callback?.({ success: true, status: r });
        });

        socket.on('friends:respond', (data: { playerId: string; from: string; accept: boolean }, callback) => {
            const me = meOf(data?.playerId);
            if (!me) return callback?.(noProfile);
            if (!gameManager.profiles.respond(me.profile.id, data?.from, !!data?.accept)) return callback?.({ success: false, error: 'İstek bulunamadı' });
            notifyProfiles([data.from, me.profile.id]);
            persist();
            callback?.({ success: true });
        });

        socket.on('friends:remove', (data: { playerId: string; other: string }, callback) => {
            const me = meOf(data?.playerId);
            if (!me) return callback?.(noProfile);
            gameManager.profiles.remove(me.profile.id, data?.other);
            notifyProfiles([data?.other, me.profile.id]);
            persist();
            callback?.({ success: true });
        });

        // Çağır: masadaki oyuncu, lobideki (çevrimiçi) birini boş koltuğa davet eder; karşıda davet kartı açılır
        socket.on('invite:send', (data: { playerId: string; to: string }, callback) => {
            const me = meOf(data?.playerId);
            if (!me) return callback?.(noProfile);
            const room = me.player.roomId ? gameManager.getRoomById(me.player.roomId) : undefined;
            const hasSeat = room && (room.status === RoomStatus.WAITING ? room.players.length < room.maxPlayers : room.players.some(p => p.vacantUntil));
            if (!room || !hasSeat) return callback?.({ success: false, error: 'Davet için masada boş koltuk olmalı' });
            const target = onlineProfiles().get(data?.to);
            if (!target || data.to === me.profile.id) return callback?.({ success: false, error: 'Oyuncu şu an çevrimiçi değil' });
            if (target.roomId) return callback?.({ success: false, error: `${target.name} şu an başka bir masada` });
            const key = `${me.profile.id}>${data.to}`;
            if ((inviteSentAt.get(key) || 0) > Date.now() - INVITE_MS) return callback?.({ success: false, error: 'Bu oyuncuyu az önce çağırdın' });
            inviteSentAt.set(key, Date.now());
            profileSockets(data.to).forEach(id => io.to(id).emit('invite:received', {
                from: { id: me.profile.id, name: me.player.name, avatar: me.player.avatar || '' },
                room: room.toJSON(),
                expiresIn: INVITE_MS,
            }));
            logEvent('davet', { masa: room.no, kimden: me.player.name, kime: target.name });
            callback?.({ success: true });
        });

        // Oyun sürerken masa sahibi yapay zekâyı masadan çıkarır: koltuk süre boyunca (vacantSeatMs) boş kalır; davet edilen
        // ya da lobiden gelen oturabilir, sahip hemen yapay zekâ koyabilir; kimse oturmazsa yapay zekâ geri gelir
        socket.on('room:kickBot', (data: { roomId: string; playerId: string; botId: string }, callback) => {
            const room = gameManager.getRoomById(data?.roomId);
            const bot = room?.players.find(p => p.id === data?.botId);
            if (!room || !owns(data?.playerId) || room.owner.id !== data.playerId) return callback?.({ success: false, error: 'Yalnızca masa sahibi çıkarabilir' });
            if (room.status !== RoomStatus.PLAYING || !room.game) return callback?.({ success: false, error: 'Oyun sürmüyor' });
            if (!bot?.isBot) return callback?.({ success: false, error: 'Yalnızca yapay zekâ çıkarılabilir' });
            if (room.players.some(p => p.vacantUntil)) return callback?.({ success: false, error: 'Masada zaten boş koltuk var' });
            logEvent('masa', { masa: room.no, islem: 'yz-cikar', oyuncu: bot.name });
            kickPlayer(room, bot, '');
            broadcastRooms();
            persist();
            callback?.({ success: true });
        });
        // Boş koltuğa hemen yapay zekâ (masa sahibi)
        socket.on('room:fillSeat', (data: { roomId: string; playerId: string }, callback) => {
            const room = gameManager.getRoomById(data?.roomId);
            if (!room || !owns(data?.playerId) || room.owner.id !== data.playerId) return callback?.({ success: false, error: 'Yalnızca masa sahibi ekleyebilir' });
            const vacant = room.players.find(p => p.vacantUntil);
            if (!vacant) return callback?.({ success: false, error: 'Boş koltuk yok' });
            fillVacant(room.id, vacant.id);
            callback?.({ success: true });
        });

        // Ziyarete açık (masa sahibi): herkes izleyebilir, bütün eller görünür
        socket.on('room:setSpectators', (data: { roomId: string; playerId: string; value: boolean }, callback) => {
            const room = gameManager.getRoomById(data?.roomId);
            if (!room || !owns(data?.playerId) || room.owner.id !== data.playerId) return callback?.({ success: false, error: 'Yalnızca masa sahibi değiştirebilir' });
            room.settings.spectators = !!data.value;
            io.to(room.id).emit('player:joined', { success: true, room: room.toJSON() });
            broadcastRooms();
            persist();
            callback?.({ success: true, room: room.toJSON() });
        });

        // İzleme: lobideki oyuncu, ziyarete açık masayı ya da arkadaşının masasını izler (oyuna karışamaz).
        // Görebileceği eller her istekte yeniden hesaplanır (arkadaşlık bitince el gizlenir).
        const watchView = (room: Room, viewer: { profile: { id: string; friends: string[] } }) => {
            const open = !!room.settings?.spectators;
            const friendSeats = room.players.filter(p => !p.isBot && p.profileId && viewer.profile.friends.includes(p.profileId)).map(p => p.id);
            if (!open && !friendSeats.length) return null;
            const visible = open ? room.players.map(p => p.id) : friendSeats;
            const g = room.game;
            const deadline = turnDeadlines.get(room.id);
            return {
                no: room.no, ad: room.name, durum: room.status, acik: open,
                oyun: g ? g.toPublicJSON() : null,
                eller: Object.fromEntries(room.players.filter(p => visible.includes(p.id)).map(p => [p.id, p.tiles.map(t => t.toJSON())])),
                elSayisi: Object.fromEntries(room.players.map(p => [p.id, p.tiles.length])),
                baglanti: Object.fromEntries(room.players.map(p => [p.id, { bot: !!p.isBot, bagli: !!p.connected }])),
                cezalar: g?.roundPenalties ?? [],
                kalanSn: deadline && g?.status === GameStatus.STARTED ? Math.max(0, Math.round((deadline - Date.now()) / 1000)) : null,
                izleyenler: watcherNames(room.id),
                gorunur: visible,
            };
        };
        const stopWatching = () => {
            const roomId = socket.data.watchRoom as string | undefined;
            if (!roomId) return;
            socket.leave(roomId);
            socket.data.watchRoom = null;
            watchers.get(roomId)?.delete(socket.id);
            io.to(roomId).emit('room:watchers', { roomId, names: watcherNames(roomId) });
        };
        socket.on('room:watch', (data: { playerId: string; roomId: string }, callback) => {
            const me = meOf(data?.playerId);
            if (!me) return callback?.(noProfile);
            if (me.player.roomId) return callback?.({ success: false, error: 'Masadayken başka masa izlenemez' });
            const room = gameManager.getRoomById(data?.roomId);
            const view = room && watchView(room, me);
            if (!room || !view) return callback?.({ success: false, error: 'Bu masa izlemeye açık değil' });
            if (socket.data.watchRoom !== room.id) {
                stopWatching();
                socket.join(room.id);
                socket.data.watchRoom = room.id;
                if (!watchers.has(room.id)) watchers.set(room.id, new Map());
                watchers.get(room.id)!.set(socket.id, me.player.name);
                io.to(room.id).emit('room:watchers', { roomId: room.id, names: watcherNames(room.id) });
            }
            callback?.({ success: true, masa: watchView(room, me), room: room.toJSON() });
        });
        // İzlenen koltuğun eli ve ıstaka dizilişi (izleyen o oyuncunun gözünden görür); izin her istekte denetlenir
        socket.on('room:watchTiles', (data: { playerId: string; seatId: string }, callback) => {
            const me = meOf(data?.playerId);
            const room = socket.data.watchRoom ? gameManager.getRoomById(socket.data.watchRoom) : undefined;
            const view = me && room && watchView(room, me);
            const seat = room?.players.find(p => p.id === data?.seatId);
            if (!view || !seat || !view.gorunur.includes(seat.id)) return callback?.({ success: false, error: 'Bu el izlenemiyor' });
            callback?.({ success: true, tiles: seat.tiles.map(t => t.toJSON()), layout: seat.rackLayout || null });
        });
        socket.on('room:watchState', (data: { playerId: string }, callback) => {
            const me = meOf(data?.playerId);
            const room = socket.data.watchRoom ? gameManager.getRoomById(socket.data.watchRoom) : undefined;
            const view = me && room && watchView(room, me);
            if (!view) { stopWatching(); return callback?.({ success: false, error: 'Masa artık izlenemiyor' }); }
            callback?.({ success: true, masa: view });
        });
        socket.on('room:unwatch', (_d: unknown, callback) => { stopWatching(); callback?.({ success: true }); });
        socket.on('disconnect', stopWatching);

        // Istaka dizilişi: oyuncu dizdikçe gönderir, o koltuğu görebilen izleyenlere iletilir
        socket.on('rack:layout', (data: { playerId: string; layout: (string | null)[] }) => {
            if (!owns(data?.playerId) || !Array.isArray(data.layout) || data.layout.length > 40) return;
            const player = gameManager.getPlayerById(data.playerId);
            const room = player?.roomId ? gameManager.getRoomById(player.roomId) : undefined;
            if (!player || !room) return;
            player.rackLayout = data.layout.map(x => (typeof x === 'string' ? x.slice(0, 64) : null));
            for (const sid of watchers.get(room.id)?.keys() || []) {
                const ws = io.sockets.sockets.get(sid);
                const viewer = ws && gameManager.getPlayerBySocketId(sid);
                const profile = gameManager.profiles.get(viewer?.profileId);
                const view = profile && watchView(room, { profile });
                if (view?.gorunur.includes(player.id)) ws!.emit('watch:rack', { seatId: player.id, layout: player.rackLayout });
            }
        });

        // Hızlı oyna: şehir adlı masa açılır, 3 yapay zekâ oturur, oyun hemen başlar
        socket.on('room:quickPlay', (data: { playerId: string }, callback) => {
            try {
                stopWatching(); // izlerken masaya oturan izlemeyi bırakır
                if (!owns(data?.playerId)) return callback?.(notYours);
                const player = gameManager.getPlayerById(data.playerId);
                if (!player) return callback?.({ success: false, error: 'Oyuncu bulunamadı' });
                if (player.roomId) return callback?.({ success: false, error: 'Önce bulunduğun masadan kalk' });
                const room = gameManager.createRoom(pickCity(gameManager.getAllRooms().map(r => r.name)), player.id);
                if (!room) return callback?.({ success: false, error: 'Masa açılamadı' });
                socket.join(room.id);
                while (room.players.length < room.maxPlayers) addBotTo(room);
                if (!beginGame(room)) return callback?.({ success: false, error: 'Oyun başlatılamadı' });
                broadcastRooms();
                persist();
                callback?.({ success: true, room: room.toJSON() });
            } catch (error) {
                console.error('Hızlı oyna hatası:', error);
                callback?.({ success: false, error: 'Oyun başlatılamadı' });
            }
        });

        // Masa adı: sahip bekleme ekranında değiştirir
        socket.on('room:rename', (data: { roomId: string; playerId: string; name: string }, callback) => {
            const room = gameManager.getRoomById(data?.roomId);
            if (!room || !owns(data?.playerId) || room.owner.id !== data.playerId) return callback?.({ success: false, error: 'Yalnızca masa sahibi değiştirebilir' });
            const name = typeof data.name === 'string' ? data.name.trim().slice(0, 30) : '';
            if (!name) return callback?.({ success: false, error: 'Masaya bir ad ver' });
            room.name = name;
            io.to(room.id).emit('player:joined', { success: true, room: room.toJSON() });
            broadcastRooms();
            persist();
            callback?.({ success: true, room: room.toJSON() });
        });

        socket.on('room:join', (data: { roomId: string, playerId: string }, callback) => {
            try {
                stopWatching(); // izlerken masaya oturan izlemeyi bırakır
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

                // Oyun sürerken boşaltılmış koltuk: yeni oyuncu o koltuğa (taşlar, puan) oturur, kaldığı yerden oynar
                const vacant = room.status === RoomStatus.PLAYING ? room.players.find(p => p.vacantUntil) : undefined;
                if (vacant) {
                    if (!owns(playerId)) return callback(notYours);
                    if (player.roomId) return callback({ success: false, error: 'Önce bulunduğun masadan kalk' });
                    Object.assign(vacant, { name: player.name, avatar: player.avatar, profileId: player.profileId, vacantUntil: null, isBot: false, connected: true });
                    gameManager.removePlayer(player.id); // lobideki kimlik koltuğun kimliğine geçer
                    gameManager.updatePlayerSocket(vacant.id, socket.id);
                    socket.join(room.id);
                    room.lastActivityAt = Date.now();
                    io.to(room.id).emit('player:joined', { success: true, player: vacant.toPublicJSON(), room: room.toJSON() });
                    if (room.game?.isPlayerTurn(vacant.id)) scheduleTurn(room.id, room.game);
                    broadcastRooms();
                    persist();
                    return callback({ success: true, room: room.toJSON(), player: vacant.toJSON(), token: issueToken(vacant) });
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
                seat.authToken = ''; // kalkan oyuncu yapay zekâya geçen koltuğa geri bağlanamaz
                seat.connected = true;
                seat.name = BOT_NAMES.find(n => !used.has(n)) || `Yapay zekâ ${room.players.indexOf(seat) + 1}`;
                seat.setReady(true);
                socket.leave(room.id);
                const human = gameManager.createPlayer(humanName, socket.id);
                human.profileId = seat.profileId; // profil (arkadaşlar) lobideki yeni kimliğe geçer
                seat.profileId = '';

                if (!room.firstHuman()) {
                    closeRoom(room.id, 'Masada yalnızca yapay zekâ kaldı');
                } else {
                    if (room.owner.id === seat.id) room.owner = room.players.find(p => !p.isBot)!;
                    io.to(room.id).emit('player:joined', { success: true, player: seat.toPublicJSON(), room: room.toJSON() });
                    if (room.game.isPlayerTurn(seat.id)) scheduleTurn(room.id, room.game);
                }
                persist();
                io.emit('rooms:list', { success: true, rooms: gameManager.getAllRooms().map(r => r.toJSON()) });
                callback?.({ success: true, player: human.toJSON(), token: issueToken(human) });
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

        // Sesli sohbet ayarı: masa sahibi bekleme ekranında açar / kapatır (oyun sırasında da)
        socket.on('room:setVoice', (data: { roomId: string; playerId: string; voice: boolean }, callback) => {
            const room = gameManager.getRoomById(data?.roomId);
            if (!room || !owns(data?.playerId) || room.owner.id !== data.playerId) return callback?.({ success: false, error: 'Yalnızca masa sahibi değiştirebilir' });
            room.settings.voice = !!data.voice;
            io.to(room.id).emit('player:joined', { success: true, room: room.toJSON() });
            broadcastRooms();
            persist();
            callback?.({ success: true, room: room.toJSON() });
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
                if (!owns(playerId) || !gameManager.isRoomOwner(playerId, roomId)) {
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

                if (!beginGame(room)) {
                    return callback({
                        success: false,
                        error: 'Oyun başlatılamadı'
                    });
                }

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

        socket.on('game:discardTile', (data: { playerId: string, tileId: string, finishSets?: string[][]; force?: boolean }, callback) => {
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
                // Yardımlı masa: işlenebilir taş atılmaz (yapay zekâ ve süre dolunca otomatik atma bu yoldan geçmez)
                // force: oyuncu sürükleyip köşeye bıraktı (bilerek atıyor): atılır, işlek cezası yazılır
                if (settingsOf(room.settings).assisted && !data.force && room.game.islekBlocked(playerId, tileId, !!finishSets)) {
                    return callback({ success: false, error: 'Bu taş işlek: yine de atmak istersen sürükleyip köşeye bırak (işlek cezası yazılır)' });
                }
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
        socket.on('player:reconnect', (data: { playerId: string; token?: string }, callback) => {
            const player = data?.playerId ? gameManager.getPlayerById(data.playerId) : undefined;
            if (!player || player.isBot || player.vacantUntil) return callback?.({ success: false, error: 'Oyuncu bulunamadı' }); // boşaltılan koltuğa geri bağlanılmaz
            // Geçiş: anahtar çıkmadan önce kaydolan oyuncu kimlikle kabul edilir; anahtarı eski istemci saklayamamış olabileceğinden
            // anahtarla bir kez dönene kadar (legacyAuth) anahtarsız istek de kabul edilir
            const legacy = !player.authToken || (player.legacyAuth && !data?.token);
            if (!legacy && !tokenMatches(player, data?.token)) return callback?.({ success: false, error: 'Oturum geçersiz' });
            if (!player.authToken) { issueToken(player); player.legacyAuth = true; }
            else if (!legacy) player.legacyAuth = false;

            gameManager.updatePlayerSocket(player.id, socket.id);
            player.connected = true;
            player.disconnectedAt = null;

            const room = player.roomId ? gameManager.getRoomById(player.roomId) : undefined;
            if (room) {
                room.lastActivityAt = Date.now(); // saatler sonra dönen oyuncunun masası "uzun süre oynanmadı" diye kapanmasın
                socket.join(room.id);
                io.to(room.id).emit('player:connection', { playerId: player.id, connected: true });
                // Sırası kısa kopukluk süresiyle bekliyorsa tam süreyi geri ver
                if (room.game?.isPlayerTurn(player.id)) scheduleTurn(room.id, room.game);
            }

            // Profilden önce kaydolan oyuncuya profil açılır (anahtarı bu cevapla bir kez gider)
            const profile = gameManager.profiles.get(player.profileId) ? { id: player.profileId } : attachProfile(player);
            callback?.({ success: true, player: player.toJSON(), token: player.authToken, room: room ? room.toJSON() : null, profile });
        });

        // Bağlantı Kesme
        socket.on('disconnect', () => {
            console.log(`Bağlantı kesildi: ${socket.id}`);
            persist();

            const player = gameManager.getPlayerBySocketId(socket.id);
            if (player?.roomId) leaveVoice(player.roomId, player.id);
            logEvent('baglanti-kesildi', { soket: socket.id, oyuncu: player?.name ?? null, oyuncuId: player?.id ?? null });

            // Oyun sürerken oyuncu silinmez: koltuk tutulur, sırası gelince otomatik oynanır
            const playingRoom = player?.roomId ? gameManager.getRoomById(player.roomId) : undefined;
            if (player && playingRoom?.game && playingRoom.status === RoomStatus.PLAYING) {
                player.connected = false;
                player.disconnectedAt = Date.now();
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