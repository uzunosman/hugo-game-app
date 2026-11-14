import React, { useState, useCallback, useEffect, useRef } from 'react';
import PlayerPanel from '../PlayerPanel/PlayerPanel';
import GameBoard from '../GameBoard/GameBoard';
import Scoreboard from '../Scoreboard/Scoreboard';
import LeaveTable from '../LeaveTable/LeaveTable';
import RoundSummary from '../RoundSummary/RoundSummary';
import PenaltyLog from '../PenaltyLog/PenaltyLog';
import Chat from '../Chat/Chat';
import useGameState from '../../hooks/useGameState';
import socketService from '../../services/socketService';
import { getOrderedPlayers, getPlayerPosition, getPlayerCorner, getCurrentPlayerIndex, calculateHandScore, calculatePairScore, findPairPartner, canTakePairOkey, getConsecutiveGroups, validateSet, validatePair, arrangeTiles } from '../../utils/gameUtils';
import { handleDrawTile, handleTileMove, handleDrawDiscardedTile } from '../../utils/tileHandlers';
import { moveGroup } from '../../utils/rackDrag';
import '../../assets/css/components/GameBoard.css';
import '../../assets/css/layout.css';
import '../../assets/css/mobile.css';
import RotateHint from '../RotateHint/RotateHint';

/**
 * Ana Oyun bileşeni
 * @param {Object} props - Bileşen özellikleri
 * @param {Object} props.player - Oyuncu bilgisi
 * @param {Object} props.room - Oda bilgisi
 * @returns {JSX.Element} - Oyun bileşeni
 */
function Game({ player, room, onGameFinished, onLeaveTable }) {
    // Oyun durumu ve taşlarla ilgili state'leri al
    const {
        tiles,
        setTiles,
        gameState,
        setGameState,
        error,
        setError,
        setLoading,
        selectedTile,
        setSelectedTile,
        timeLeft,
        tilePositions,
        setTilePositions,
        discardedTiles,
        setDiscardedTiles,
        lastDiscardPlayerId,
        tableSets,
        pendingOpen,
        playerOpenStates,
        roundEndResults,
        setRoundEndResults,
        penaltyLog,
        roundHistory
    } = useGameState(player, room);

    // Oyun sonu tabelası masa (Room) düzeyinde gösterilir: aynı masada yeni oyun başlasa da açık kalır
    const isGameOver = roundEndResults?.gameStatus === 'finished';
    useEffect(() => {
        if (isGameOver) onGameFinished?.(roundEndResults);
    }, [isGameOver, roundEndResults, onGameFinished]);

    // Yandan alınan taş ve alındığı köşe: kullanılmadıkça o köşede "Kustu" görünür
    const [takenInfo, setTakenInfo] = useState(null);
    // Bu sırada masaya oynandı mı (el açma, per indirme, işleme): "Geri al" butonu için
    const [playedThisTurn, setPlayedThisTurn] = useState(false);
    useEffect(() => { setPlayedThisTurn(false); setTakenInfo(null); }, [gameState.currentPlayerId, gameState.round]);
    // Masaya ilk oynamadan önceki ıstaka dizilişi: geri alınca taşlar eski yerlerine döner
    const positionsBeforePlay = useRef(null);
    const rememberRack = () => { if (!playedThisTurn) positionsBeforePlay.current = tilePositions; };


    // Sürüklenen taş bilgisi (işleme için activeTile hesaplamada kullanılır)
    const [draggingTile, setDraggingTile] = useState(null);

    // Okey taşlarına sağ tıkla - ters çevrilmiş görünsün
    // Bildirim 3 sn sonra kendiliğinden kaybolur
    useEffect(() => {
        if (!error) return;
        const t = setTimeout(() => setError(''), 3000);
        return () => clearTimeout(t);
    }, [error, setError]);

    const [flippedTileIds, setFlippedTileIds] = useState(() => new Set());
    // Son dizme kipi: Çift diz'e basıldıysa kartta per yerine çift değeri gösterilir (Seri diz'e kadar)
    const [rackMode, setRackMode] = useState('seri');

    useEffect(() => {
        setFlippedTileIds(new Set());
    }, [gameState.round]);

    // Oyuncuları sırala
    // Sohbet balonları: { playerId: { id, text } }, her mesaj 3,5 sn görünür
    const [chatBubbles, setChatBubbles] = useState({});
    useEffect(() => {
        const timers = new Map();
        const onMessage = (m) => {
            setChatBubbles(prev => ({ ...prev, [m.playerId]: { id: m.id, text: m.text } }));
            clearTimeout(timers.get(m.playerId));
            timers.set(m.playerId, setTimeout(() => {
                setChatBubbles(prev => (prev[m.playerId]?.id === m.id ? { ...prev, [m.playerId]: null } : prev));
            }, 3500));
        };
        socketService.onChatMessage(onMessage);
        return () => { socketService.offChatMessage(onMessage); timers.forEach(clearTimeout); };
    }, []);

    const players = getOrderedPlayers(room.players, player.id);
    const currentPlayerIndex = getCurrentPlayerIndex(players, gameState.currentPlayerId);
    const isMyTurn = gameState.currentPlayerId === player.id;
    const myCorner = getPlayerCorner(0); // Kendimiz her zaman 0. indeksteyiz

    // En son taş atan oyuncunun köşesini hesapla (sıradaki oyuncunun çekebileceği köşe)
    const lastDiscardCorner = (() => {
        if (!lastDiscardPlayerId) return null;
        const idx = players.findIndex(p => p.id === lastDiscardPlayerId);
        if (idx === -1) return null;
        return getPlayerCorner(idx);
    })();

    // Debug için log
    console.log('Game render:', {
        player,
        gameState,
        isMyTurn,
        currentPlayerIndex,
        players
    });

    // Taş tıklama işleyicisi — mobil tap-to-select-then-move desteği
    const handleTileClick = (tileIndex) => {
        if (selectedTile !== null && selectedTile !== tileIndex) {
            // Seçili taşı bu konuma taşı
            onTileMove(selectedTile, tileIndex);
            setSelectedTile(null);
        } else if (selectedTile === tileIndex) {
            // Aynı taşa tekrar tıklanınca seçimi kaldır
            setSelectedTile(null);
        } else if (tilePositions[tileIndex]) {
            // Taş olan hücreye tıklanınca seç
            setSelectedTile(tileIndex);
        }
        // Seçim yokken boş hücreye tıklanırsa hiçbir şey yapma
    };

    // Taş çekme işleyicisi (tıklama veya sürükle-bırak)
    const onDrawTile = (fromDiscard, targetIndex) => {
        handleDrawTile({
            gameState,
            playerId: player.id,
            socketService,
            setTiles,
            setGameState,
            setError,
            fromDiscard,
            setTilePositions,
            targetIndex
        });
    };

    // Desteden sürükle-bırak ile taş çekme
    const onDrawFromDeck = (targetIndex) => {
        onDrawTile(false, targetIndex);
    };

    // Atılan taşı çekme işleyicisi
    const onDrawDiscardedTile = (corner, tileIndex, targetIndex) => {
        console.log("onDrawDiscardedTile called:", {
            corner,
            tileIndex,
            targetIndex,
            isMyTurn,
            turnAction: gameState.turnAction,
            currentPlayerId: gameState.currentPlayerId,
            playerId: player.id
        });

        // Doğrudan handleDrawDiscardedTile fonksiyonunu çağır
        handleDrawDiscardedTile({
            corner,
            tileIndex,
            targetIndex,
            gameState,
            playerId: player.id,
            discardedTiles,
            socketService,
            setTiles,
            setTilePositions,
            setDiscardedTiles,
            setGameState,
            setError,
            onTaken: setTakenInfo
        });
    };

    // Kustu taş atılana kadar görünür; masaya oynadıysa basınca önce geri alınır (geri alma cezası)
    const kustuCorner = takenInfo && isMyTurn && gameState.turnAction === 'discard' ? takenInfo.corner : null;

    // Geri alınan el: taşlar masaya oynamadan önceki yerlerine döner
    const restoreRack = (remaining) => {
        setTiles(remaining);
        const saved = positionsBeforePlay.current; // updater sonra çalışır: ref sıfırlanmadan al
        setTilePositions(prev => {
            const ids = new Set(remaining.map(t => t.id));
            const base = saved || prev;
            const next = base.map(id => (id && ids.has(id) ? id : null));
            remaining.forEach(t => {
                if (next.includes(t.id)) return;
                const empty = next.indexOf(null);
                if (empty !== -1) next[empty] = t.id;
            });
            return next;
        });
        positionsBeforePlay.current = null;
        setPlayedThisTurn(false);
        setSelectedTile(null);
    };

    // Geri al: bu sırada masaya oynanan taşlar 100 cezayla ele döner (taş atılınca geri alınamaz)
    const onUndoTurn = () => {
        socketService.undoTurn((response) => {
            if (!response?.success) return setError(response?.error || 'Geri alınamadı');
            restoreRack(response.remainingTiles || []);
        });
    };

    const onKustu = () => {
        const undoing = playedThisTurn;
        socketService.returnTaken((response) => {
            if (!response?.success) return setError(response?.error || 'Taş geri konamadı');
            setTakenInfo(null);
            if (undoing) restoreRack(response.remainingTiles || []);
        });
    };


    // Taşa çift tıklandığında köşeye at (targetIndex = -1 → sürükle-bırak köşe atma ile aynı mantık)
    const onTileDoubleClick = (positionIndex) => {
        onTileMove(positionIndex, -1);
    };

    // Taş taşıma işleyicisi
    const onTileMove = (sourceIndex, targetIndex) => {
        handleTileMove({
            sourceIndex,
            targetIndex,
            tilePositions,
            tiles,
            gameState,
            playerId: player.id,
            socketService,
            setTiles,
            setTilePositions,
            setDiscardedTiles,
            setLoading,
            setError,
            setGameState,
            getPlayerCorner: (index) => getPlayerCorner(index),
            currentPlayerIndex
        });
    };

    // Oyuncuların sıra durumlarını belirle
    const hasDrawnTile = {};
    players.forEach((p, index) => {
        hasDrawnTile[index] = p.id === gameState.currentPlayerId && gameState.turnAction === 'discard';
    });

    // Mevcut oyuncunun set ve per hesabını yap
    const handScore = calculateHandScore(tilePositions, tiles, gameState.indicatorTile, gameState.okeyTile, gameState.isHugoRound);

    // Istakada yan yana duran çiftler (çiftle açma / çift indirme)
    const pairScore = calculatePairScore(tilePositions, tiles, gameState.okeyTile, gameState.isHugoRound);

    // El açma durumu
    const isFirstHandBlock = tiles.length === 15 && gameState.turnAction === 'draw';

    // Masadaki en yüksek açılış değeri (tüm oyuncuların max'ı)
    const maxOpenedValue = Object.values(playerOpenStates).reduce(
        (max, s) => (s.lastOpenedValue > max ? s.lastOpenedValue : max), 0
    );

    // Yetersiz değerle açma denemesi ceza yazmaz; eşiği geçip geçmediği rozette görünür
    const canOpenHand = isMyTurn
        && (gameState.turnAction === 'discard' || isFirstHandBlock)
        && handScore.validSetCount > 0;
    const myPending = pendingOpen?.playerId === player.id ? pendingOpen : null;
    const openTotal = handScore.setTotal + (myPending?.total || 0); // yerde bekleyen perler + ıstakadakiler
    const openHandShort = maxOpenedValue === 0 ? openTotal < 51 : openTotal <= maxOpenedValue;

    const myOpenState = playerOpenStates[player.id] || { isOpen: false, openedTotal: 0 };
    const canAct = isMyTurn && (gameState.turnAction === 'discard' || isFirstHandBlock);

    // Çiftle açma: seriyle aynı eşik (ilk açılış 51, sonra masadaki en yüksek açılışı geçmeli)
    const canOpenPairs = canAct && !myOpenState.isOpen && pairScore.pairCount > 0;
    const openPairsShort = maxOpenedValue === 0 ? pairScore.pairTotal < 51 : pairScore.pairTotal <= maxOpenedValue;

    // İşleme: seçili taşın gerçek ID'si (OpenSetsArea'ya iletilir)
    const selectedTileId = (selectedTile !== null && tilePositions[selectedTile] && myOpenState.isOpen && isMyTurn
        && (gameState.turnAction === 'discard' || isFirstHandBlock))
        ? tilePositions[selectedTile]
        : null;

    // activeTile: seçili veya sürüklenen taşın tam bilgisi (OpenSetsArea'da slot hesabı için)
    const activeTile = (() => {
        const id = draggingTile?.id || selectedTileId;
        if (!id) return null;
        if (draggingTile) return draggingTile;
        const t = tiles.find(t => t.id === id);
        return t || null;
    })();

    // Sürükleme başlangıç/bitiş callback'leri (TileHolder'a iletilir)
    const handleTileDragStart = useCallback((tileIndex) => {
        const tid = tilePositions[tileIndex];
        if (!tid) return;
        const t = tiles.find(t => t.id === tid);
        if (t) setDraggingTile(t);
    }, [tilePositions, tiles]);

    const handleTileDragEnd = useCallback(() => {
        setDraggingTile(null);
    }, []);

    const handleOkeyFlip = useCallback((tileId) => {
        setFlippedTileIds(prev => {
            const next = new Set(prev);
            if (next.has(tileId)) next.delete(tileId);
            else next.add(tileId);
            return next;
        });
    }, []);

    // İşleme handler'ı — seç & tıkla veya sürükle & bırak (pozisyon dahil)
    const onAddTileToSet = (tileId, targetSetId, position) => {
        if (!myOpenState.isOpen || !isMyTurn) return;

        // Hedef çiftse elindeki eşiyle birlikte çift olarak işle; çiftte okey varsa ve taş okeyin eşiyse okey alınır
        const targetSet = tableSets.find(s => s.id === targetSetId);
        const tile = tiles.find(t => t.id === tileId);
        if (targetSet?.kind === 'cift' && !canTakePairOkey(targetSet, tile, gameState.okeyTile, gameState.isHugoRound)) {
            const partnerId = findPairPartner(tile, tiles, gameState.okeyTile, gameState.isHugoRound);
            if (!partnerId) return setError('Bu taşın elinde eşi yok: çiftlere çift işlenir');
            rememberRack();
            socketService.addPairToSet([tileId, partnerId], targetSetId, (response) => {
                if (response.success) {
                    setPlayedThisTurn(true);
                    setTiles(response.remainingTiles || []);
                    setTilePositions(prev => prev.map(id => (id === tileId || id === partnerId ? null : id)));
                    setSelectedTile(null);
                    setDraggingTile(null);
                } else {
                    setError(response.error || 'Çift işlenemedi');
                }
            });
            return;
        }

        rememberRack();
        socketService.addTileToSet(tileId, targetSetId, position, (response) => {
            if (response.success) {
                setPlayedThisTurn(true);
                const remaining = response.remainingTiles || [];
                setTiles(remaining);
                setTilePositions(prev => prev.map(id => id === tileId ? null : id));

                // Okey swap: yeni gelen okey'i ilk boş slota yerleştir
                if (response.swappedOkeyTile) {
                    const okeyTile = response.swappedOkeyTile;
                    setTilePositions(prev => {
                        const next = [...prev];
                        const emptyIdx = next.findIndex(id => id === null);
                        if (emptyIdx !== -1) {
                            next[emptyIdx] = okeyTile.id;
                        }
                        return next;
                    });
                }

                setSelectedTile(null);
                setDraggingTile(null);
            } else {
                setError(response.error || 'İşleme yapılamadı');
            }
        });
    };

    // Perleri indir (açtıktan sonra tek buton): çiftle açan çiftleri, seriyle açan perleri indirir
    const dropCount = myOpenState.openedWithPairs ? pairScore.pairCount : handScore.validSetCount;
    const canDropPer = canAct && myOpenState.isOpen && dropCount > 0;

    // only: yalnızca bu taşlar (masaya sürüklenen per); yoksa ıstakadaki tüm geçerli perler
    const onDropPer = (only) => {
        if (!canDropPer) return;

        const opts = { okeyTile: gameState.okeyTile, isHugo: gameState.isHugoRound };
        // Parantez şart: "only || a ? b : c" sürüklenen per yerine çiftleri gönderiyordu
        const validSets = only || (myOpenState.openedWithPairs
            ? pairScore.pairs.map(g => g.map(t => t.id))
            : getConsecutiveGroups(tilePositions, tiles)
                .filter(group => validateSet(group, opts) > 0)
                .map(group => group.map(t => t.id)));
        if (validSets.length === 0) return;

        const droppedTileIds = new Set(validSets.flat());

        rememberRack();
        socketService.dropPer(validSets, (response) => {
            if (response.success) {
                setPlayedThisTurn(true);
                const remaining = response.remainingTiles || [];
                setTiles(remaining);
                setTilePositions(prev => prev.map(id =>
                    id && droppedTileIds.has(id) ? null : id
                ));
            } else {
                setError(response.error || 'Per indirilemedi');
            }
        });
    };

    // El açma işleyicisi: kind 'seri' perlerle, 'cift' çiftlerle açar
    const pairsOf = (list) => list.filter((_, i) => i % 2 === 0).map((t, i) => [t.id, list[i * 2 + 1].id]);

    // Yalnızca verilen perler yere iner; eşik dolunca el açılır, dolmadıysa açılış bekler (taş atılamaz)
    const stageOpen = (sets, kind) => {
        const ids = new Set(sets.flat());
        rememberRack();
        socketService.openHand(sets, (response) => {
            if (!response.success) return setError(response.error || 'Per yere açılamadı');
            setPlayedThisTurn(true);
            setTiles(response.remainingTiles || []);
            setTilePositions(prev => prev.map(id => (id && ids.has(id) ? null : id)));
            if (response.pendingTotal) setError(`Açılış ${response.pendingTotal} / ${response.needed}: per eklemeye devam et`);
        }, kind, true);
    };

    // Istakadan masaya sürüklenen per: açmadıysa yalnızca o per yere açılır (eşik dolana kadar bekler),
    // açtıysa yalnızca o per indirilir
    const onPlayGroup = (ids) => {
        const groupTiles = ids.map(id => tiles.find(t => t.id === id)).filter(Boolean);
        const opts = { okeyTile: gameState.okeyTile, isHugo: gameState.isHugoRound };
        const isPairs = groupTiles.length % 2 === 0 &&
            groupTiles.every((t, i) => i % 2 === 1 || validatePair([t, groupTiles[i + 1]], opts) > 0);
        if (!myOpenState.isOpen) {
            if (!canAct) return setError('Şu an el açamazsın');
            const kind = isPairs ? 'cift' : 'seri';
            if (kind === 'seri' && validateSet(groupTiles, opts) <= 0) return setError('Bu per geçerli değil');
            return stageOpen(kind === 'cift' ? pairsOf(groupTiles) : [ids], kind);
        }
        if (!canDropPer) return setError('Şu an per indiremezsin');
        if (myOpenState.openedWithPairs) {
            if (!isPairs) return setError('Çiftle açtın: yalnızca çift indirebilirsin');
            return onDropPer(pairsOf(groupTiles));
        }
        if (validateSet(groupTiles, opts) <= 0) return setError('Bu per geçerli değil');
        onDropPer([ids]);
    };

    const onOpenHand = (kind = 'seri') => {
        if (kind === 'seri' ? !canOpenHand : !canOpenPairs) return;

        const opts = { okeyTile: gameState.okeyTile, isHugo: gameState.isHugoRound };
        const validSets = kind === 'cift'
            ? pairScore.pairs.map(g => g.map(t => t.id))
            : getConsecutiveGroups(tilePositions, tiles)
                .filter(group => validateSet(group, opts) > 0)
                .map(group => group.map(t => t.id));

        if (validSets.length === 0) return;

        // Açılacak taş ID'lerini düz listeye çevir
        const openedTileIds = new Set(validSets.flat());

        rememberRack();
        socketService.openHand(validSets, (response) => {
            if (response.success) {
                setPlayedThisTurn(true);
                // Kalan taşları güncelle
                const remaining = response.remainingTiles || [];
                setTiles(remaining);

                // Mevcut pozisyonları koru, sadece açılan taşları kaldır
                setTilePositions(prev => prev.map(id =>
                    id && openedTileIds.has(id) ? null : id
                ));
            } else {
                setError(response.error || 'El açılamadı');
            }
        }, kind);
    };

    // Boş bir yere tıklanınca ıstakadaki seçim (ve büyüyen per) kalkar
    const KEEPS_SELECTION = '.tile, .tile-cell, .open-set-group, .pair-slot, .tile-drop-zone, .deck-tile-wrapper, button, input, textarea, a, [role="dialog"]';
    const onBlankClick = (e) => {
        if (selectedTile !== null && !e.target.closest(KEEPS_SELECTION)) setSelectedTile(null);
    };

    return (
        <div className="game-container" onClick={onBlankClick}>
            {error && <div className="game-toast" role="status">{error}</div>}

            {/* Oyuncu Panelleri */}
            {players.map((p, index) => {
                const openState = playerOpenStates[p.id];
                return (
                    <PlayerPanel
                        key={index}
                        playerId={p.id}
                        name={p.name}
                        isBot={!!p.isBot}
                        position={getPlayerPosition(index)}
                        isCurrentPlayer={p.id === gameState.currentPlayerId}
                        timeLeft={p.id === gameState.currentPlayerId ? timeLeft : null}
                        setScore={index === 0 ? (rackMode === 'cift' ? pairScore.pairTotal : handScore.setTotal) : null}
                        setLabel={rackMode === 'cift' ? 'Çift' : 'Per'}
                        isOpen={openState?.isOpen}
                        openedTotal={openState?.openedTotal}
                        penaltyScore={openState?.penaltyScore || 0}
                        connected={openState?.connected !== false}
                        bubble={chatBubbles[p.id]}
                    />
                );
            })}

            {/* Açmadan önce: Tümünü aç (per) ve Çift Aç; per masaya sürüklenerek tek tek de açılır. Açtıktan sonra: Perleri indir */}
            {canAct && (
                <div className="action-buttons">
                    {!myOpenState.isOpen && (
                        <>
                            <button
                                className={`open-hand-btn ${canOpenHand ? 'active' : 'disabled'} ${canOpenHand && openHandShort ? 'short' : ''}`}
                                onClick={() => onOpenHand('seri')}
                                disabled={!canOpenHand}
                                title={canOpenHand && openHandShort ? `Değer yetersiz: ${maxOpenedValue === 0 ? 'en az 51' : `${maxOpenedValue}'i geçmeli`}` : undefined}
                            >
                                Tümünü aç
                                {openTotal > 0 && (
                                    <span className="open-hand-score">{openTotal}</span>
                                )}
                            </button>
                            {pairScore.pairCount > 0 && (
                                <button
                                    className={`open-hand-btn ${canOpenPairs ? 'active' : 'disabled'} ${canOpenPairs && openPairsShort ? 'short' : ''}`}
                                    onClick={() => onOpenHand('cift')}
                                    disabled={!canOpenPairs}
                                    title={openPairsShort ? `Değer yetersiz: ${maxOpenedValue === 0 ? 'en az 51' : `${maxOpenedValue}'i geçmeli`}` : undefined}
                                >
                                    Çift Aç
                                    <span className="open-hand-score">{pairScore.pairTotal}</span>
                                </button>
                            )}
                        </>
                    )}
                    {playedThisTurn && (
                        <button
                            className="open-hand-btn undo-turn active"
                            onClick={onUndoTurn}
                            title="Bu sırada masaya oynadıklarını ele geri al: 100 ceza"
                        >
                            Geri al <span className="open-hand-score">+100</span>
                        </button>
                    )}
                    {myOpenState.isOpen && (
                        <button
                            className={`open-hand-btn drop-per ${canDropPer ? 'active' : 'disabled'}`}
                            onClick={() => onDropPer()}
                            disabled={!canDropPer}
                        >
                            {myOpenState.openedWithPairs ? 'Çiftleri indir' : 'Perleri indir'}
                        </button>
                    )}
                </div>
            )}

            {/* Oyun Tahtası */}
            <GameBoard
                tiles={tiles}
                tilePositions={tilePositions}
                discardedTiles={discardedTiles}
                handleTileClick={handleTileClick}
                handleTileMove={onTileMove}
                handleTileDoubleClick={onTileDoubleClick}
                handleDrawTile={onDrawTile}
                handleDrawDiscardedTile={onDrawDiscardedTile}
                handleDrawFromDeck={onDrawFromDeck}
                isMyTurn={isMyTurn}
                turnAction={gameState.turnAction}
                playerCorner={myCorner}
                lastDiscardCorner={lastDiscardCorner}
                deckCount={gameState.deckCount}
                indicatorTile={gameState.indicatorTile}
                okeyTile={gameState.okeyTile}
                gameRound={gameState.round}
                isHugoRound={gameState.isHugoRound}
                pairPartnerId={myOpenState.isOpen && activeTile
                    ? findPairPartner(activeTile, tiles, gameState.okeyTile, gameState.isHugoRound)
                    : null}
                onPlayGroup={onPlayGroup}
                pendingSetIds={pendingOpen?.setIds}
                onGroupMove={(group, grabIdx, targetIdx) => {
                    // Sürükleme sırasında ıstaka değiştiyse (sunucu olayı) eski seçimle taşınmaz
                    setTilePositions(prev => (prev === tilePositions && moveGroup(prev, group, grabIdx, targetIdx)) || prev);
                    setSelectedTile(null);
                }}
                onArrange={(mode) => {
                    setRackMode(mode);
                    setTilePositions(arrangeTiles(tiles, mode, gameState.okeyTile, gameState.isHugoRound));
                    setSelectedTile(null);
                }}
                kustuCorner={kustuCorner}
                onKustu={onKustu}
                onWarn={setError}
                canSeeDiscards={!!(myOpenState.isOpen && myOpenState.openedWithPairs)}
                canPlaySets={myOpenState.isOpen && isMyTurn}
                onTapDiscard={() => {
                    onTileMove(selectedTile, -1);
                    setSelectedTile(null);
                }}
                selectedTile={selectedTile}
                tableSets={tableSets}
                orderedPlayers={players}
                selectedTileId={selectedTileId}
                activeTile={activeTile}
                onAddTileToSet={onAddTileToSet}
                onTileDragStart={handleTileDragStart}
                onTileDragEnd={handleTileDragEnd}
                flippedTileIds={flippedTileIds}
                onOkeyFlip={handleOkeyFlip}
            />

            <RotateHint />
            <PenaltyLog entries={penaltyLog} />
            <Chat playerId={player.id} />

            {/* Sağ üst: el bilgisi ve tabela */}
            <div className="top-right-tools">
                <div className="round-chip" aria-label={`${gameState.round}. el${gameState.isHugoRound ? ', Hugo eli' : ''}`}>
                    El {gameState.round}/9
                    {gameState.isHugoRound && <span className="hugo-tag">Hugo</span>}
                </div>
                <Scoreboard
                    players={players}
                    playerOpenStates={playerOpenStates}
                    roundHistory={roundHistory}
                />
                {!isGameOver && <LeaveTable onLeave={onLeaveTable} />}
            </div>

            {/* Tur Sonu Ekranı */}
            {roundEndResults && !isGameOver && (
                <RoundSummary
                    roundData={roundEndResults}
                    isLastRound={false}
                    onClose={() => setRoundEndResults(null)}
                />
            )}
        </div>
    );
}

export default Game; 