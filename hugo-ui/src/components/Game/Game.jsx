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
import { getOrderedPlayers, getPlayerPosition, getPlayerCorner, getCurrentPlayerIndex, calculateHandScore, calculatePairScore, canTakePairOkey, getConsecutiveGroups, validateSet, validatePair, arrangeTiles } from '../../utils/gameUtils';
import { handleDrawTile, handleTileMove, handleDrawDiscardedTile } from '../../utils/tileHandlers';
import { moveGroup } from '../../utils/rackDrag';
import { animateOwn, flyToCorner, PLACE_MS, rackTileEl, slideFrom, whenRendered } from '../../utils/flyTiles';
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
        setError,
        notices,
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
    // El sonu / oyun sonu ekranı son atılan taşın uçuşu bitince gelir
    const [summaryReady, setSummaryReady] = useState(false);
    useEffect(() => {
        setSummaryReady(false);
        if (!roundEndResults) return;
        const t = setTimeout(() => setSummaryReady(true), 900);
        return () => clearTimeout(t);
    }, [roundEndResults]);
    useEffect(() => {
        if (isGameOver && summaryReady) onGameFinished?.(roundEndResults);
    }, [isGameOver, summaryReady, roundEndResults, onGameFinished]);

    // Yandan alınan taş ve alındığı köşe: kullanılmadıkça o köşede "Kustu" görünür
    const [takenInfo, setTakenInfo] = useState(null);
    // Bu sırada masaya oynandı mı (el açma, per indirme, işleme): "Geri al" butonu için
    const [playedThisTurn, setPlayedThisTurn] = useState(false);
    useEffect(() => { setPlayedThisTurn(false); setTakenInfo(null); }, [gameState.currentPlayerId, gameState.round]);
    // Masaya ilk oynamadan önceki ıstaka dizilişi: geri alınca taşlar eski yerlerine döner
    const positionsBeforePlay = useRef(null);
    const rememberRack = () => { if (!playedThisTurn) positionsBeforePlay.current = tilePositions; };


    // Reddedilen hamle (işleme, atma, yere açma): GameBoard gizlediği taşı ıstakaya geri kaydırır
    const [rejectId, setRejectId] = useState(0);
    const reject = (msg) => { if (!msg) return; setError(msg); setRejectId(n => n + 1); }; // boş mesaj (uyarıyı temizleme) ret değildir

    // Sürüklenen taş bilgisi (işleme için activeTile hesaplamada kullanılır)
    const [draggingTile, setDraggingTile] = useState(null);

    // Okey taşlarına sağ tıkla - ters çevrilmiş görünsün

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
    // Istaka üstündeki süre çizgisi: sıranın başındaki süreye (uzatmalar dahil) oranla kalan süre
    const turnMax = useRef(60);
    useEffect(() => { turnMax.current = Math.max(60, timeLeft || 0); }, [gameState.currentPlayerId, gameState.round]); // eslint-disable-line react-hooks/exhaustive-deps
    if (timeLeft > turnMax.current) turnMax.current = timeLeft;
    const turnProgress = isMyTurn && typeof timeLeft === 'number' ? Math.max(0, Math.min(1, timeLeft / turnMax.current)) : null;
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
            targetIndex,
            // Tıklayarak çekilen taş desteden ıstakadaki yerine kayar (sürükleyerek çekilen zaten yerine bırakıldı)
            onDrawn: targetIndex == null && !fromDiscard ? (() => {
                const from = document.querySelector('.deck-tile-wrapper .center-tile')?.getBoundingClientRect();
                return (tile) => whenRendered(() => rackTileEl(tile.id), el => slideFrom(el, from, PLACE_MS));
            })() : undefined
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
            onTaken: setTakenInfo,
            // Tıklayarak alınan taş köşeden ıstakadaki yerine kayar (sürükleyerek alınan zaten yerine bırakıldı)
            onDrawn: targetIndex == null ? (() => {
                const from = document.querySelector(`.tile-drop-zone[data-corner="${corner}"] .discard-top .tile`)?.getBoundingClientRect();
                return (tile) => whenRendered(() => rackTileEl(tile.id), el => slideFrom(el, from, PLACE_MS));
            })() : undefined
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

    // fromRack: Kustu düğmesiyle kusulunca taş ıstakadan köşeye uçar (sürükleyerek kusulunca animasyon yok)
    const onKustu = (fromRack = true) => {
        const undoing = playedThisTurn;
        const taken = takenInfo;
        const from = fromRack && taken ? rackTileEl(taken.tileId)?.getBoundingClientRect() : null;
        if (from) flyToCorner(taken.corner, from, taken.tileId);
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

    // Açmadan bitme: atılacak taş dışında ıstakadaki bütün taşlar yan yana geçerli perler halindeyse perleri döner
    const closedFinishSets = (discardIdx) => {
        if (myOpenState.isOpen || tiles.length < 4) return undefined;
        const rest = tilePositions.map((id, i) => (i === discardIdx ? null : id));
        const opts = { okeyTile: gameState.okeyTile, isHugo: gameState.isHugoRound };
        const groups = getConsecutiveGroups(rest, tiles);
        const ok = groups.flat().length === tiles.length - 1 && groups.every(g => validateSet(g, opts) > 0);
        return ok ? groups.map(g => g.map(t => t.id)) : undefined;
    };

    // Taş taşıma işleyicisi
    const onTileMove = (sourceIndex, targetIndex) => {
        handleTileMove({
            finishSets: targetIndex === -1 ? closedFinishSets(sourceIndex) : undefined,
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
            setError: reject,
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
        setSelectedTile(null); // seçim eski hücrede kalmasın (bırakınca eski yerde vurgu belirmesin)
    }, [tilePositions, tiles, setSelectedTile]);

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
    const onAddTileToSet = (tileId, targetSetId, position, viaDrag = false) => {
        if (!myOpenState.isOpen || !isMyTurn) return;
        if (!viaDrag) animateOwn.add(tileId); // tıklayarak işleme: taş ıstakadaki yerinden pere uçar

        // Hedef çiftse elindeki eşiyle birlikte çift olarak işle; çiftte okey varsa ve taş okeyin eşiyse okey alınır
        const targetSet = tableSets.find(s => s.id === targetSetId);
        const tile = tiles.find(t => t.id === tileId);
        if (targetSet?.kind === 'cift' && !canTakePairOkey(targetSet, tile, gameState.okeyTile, gameState.isHugoRound)) {
            return reject('Çift işlemek için ıstakada yan yana duran çifti basılı tutup çiftlerin üstüne sürükle');
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
                animateOwn.delete(tileId);
                reject(response.error || 'İşleme yapılamadı');
            }
        });
    };

    // Istakadan basılı tutulup başkasının çiftlerine sürüklenen çift
    const onAddPairToSet = (ids, targetSetId) => {
        if (!isMyTurn) return;
        if (!myOpenState.isOpen) return reject('Çift işlemek için önce elini açmalısın');
        rememberRack();
        socketService.addPairToSet(ids, targetSetId, (response) => {
            if (!response.success) return reject(response.error || 'Çift işlenemedi');
            setPlayedThisTurn(true);
            setTiles(response.remainingTiles || []);
            setTilePositions(prev => prev.map(id => (ids.includes(id) ? null : id)));
            setSelectedTile(null);
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
                reject(response.error || 'Per indirilemedi');
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
            if (!response.success) return reject(response.error || 'Per yere açılamadı');
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
            if (!canAct) return reject('Şu an el açamazsın');
            const kind = isPairs ? 'cift' : 'seri';
            if (kind === 'seri' && validateSet(groupTiles, opts) <= 0) return reject('Bu per geçerli değil');
            return stageOpen(kind === 'cift' ? pairsOf(groupTiles) : [ids], kind);
        }
        if (!canDropPer) return reject('Şu an per indiremezsin');
        if (myOpenState.openedWithPairs) {
            if (!isPairs) return reject('Çiftle açtın: yalnızca çift indirebilirsin');
            return onDropPer(pairsOf(groupTiles));
        }
        if (validateSet(groupTiles, opts) <= 0) return reject('Bu per geçerli değil');
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

    // Aksiyon düğmelerindeki küçük taş yelpazesi (dizme düğmeleriyle aynı görünüm)
    const actionFan = (nums) => (
        <span className={`rt-fan rt-fan-${nums.length}`} aria-hidden="true">{nums.map((n, i) => <span key={i} className="rt-tile">{n}</span>)}</span>
    );

    return (
        <div className="game-container" onClick={onBlankClick}>
            {notices.length > 0 && (
                <div className="game-toasts" role="status">
                    {notices.map(n => <div key={n.id} className="game-toast">{n.msg}</div>)}
                </div>
            )}

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
                        canOpenWith={index === 0 && (() => {
                            const v = rackMode === 'cift' ? pairScore.pairTotal : handScore.setTotal;
                            return maxOpenedValue === 0 ? v >= 51 : v > maxOpenedValue; // açabilecek durumdaysa yeşil
                        })()}
                        isOpen={openState?.isOpen}
                        openedTotal={openState?.openedTotal}
                        penaltyScore={openState?.penaltyScore || 0}
                        connected={openState?.connected !== false}
                        bubble={chatBubbles[p.id]}
                    />
                );
            })}

            {/* Açmadan önce: Tümünü aç (per) ve Çift Aç; per masaya sürüklenerek tek tek de açılır. Açtıktan sonra: Perleri indir */}
            {/* Aksiyonlar: ıstakanın soluna yapışık, dizme bloğu gibi tek taş boyunda düğmeler (alt alta).
                Taş yelpazesi + işaret (↑ aç, ↓ indir, ↶ geri al), üstte küçük değer etiketi; açabilecek durumdaysa yeşil */}
            {canAct && (
                <div className="action-buttons">
                    {/* Açma düğmesi yalnızca elde per / çift varken ve dizme kipine göre tek: seri dizdeyse "Tümünü aç",
                        çift dizdeyse "Çift aç" */}
                    {!myOpenState.isOpen && (
                        <>
                            {rackMode !== 'cift' && handScore.validSetCount > 0 && <button
                                className={`open-hand-btn ${canOpenHand ? 'active' : 'disabled'} ${canOpenHand && openHandShort ? 'short' : ''}`}
                                onClick={() => onOpenHand('seri')}
                                disabled={!canOpenHand}
                                aria-label="Tümünü aç"
                                title={canOpenHand && openHandShort ? `Tümünü aç: değer yetersiz (${maxOpenedValue === 0 ? 'en az 51' : `${maxOpenedValue}'i geçmeli`})` : 'Tümünü aç'}
                            >
                                {actionFan([3, 4, 5])}<span className="at-label" aria-hidden="true">Aç</span>
                                {openTotal > 0 && <span className="open-hand-score">{openTotal}</span>}
                            </button>}
                            {rackMode === 'cift' && pairScore.pairCount > 0 && (
                                <button
                                    className={`open-hand-btn ${canOpenPairs ? 'active' : 'disabled'} ${canOpenPairs && openPairsShort ? 'short' : ''}`}
                                    onClick={() => onOpenHand('cift')}
                                    disabled={!canOpenPairs}
                                    aria-label="Çift aç"
                                    title={openPairsShort ? `Çift aç: değer yetersiz (${maxOpenedValue === 0 ? 'en az 51' : `${maxOpenedValue}'i geçmeli`})` : 'Çift aç'}
                                >
                                    {actionFan([5, 5])}<span className="at-label" aria-hidden="true">Aç</span>
                                    <span className="open-hand-score">{pairScore.pairTotal}</span>
                                </button>
                            )}
                        </>
                    )}
                    {playedThisTurn && (
                        <button
                            className="open-hand-btn undo-turn active"
                            onClick={onUndoTurn}
                            aria-label="Geri al"
                            title={`Geri al: bu sırada masaya oynadıkların ele döner, ${gameState.isHugoRound ? 200 : 100} ceza`}
                        >
                            <span className="at-undo" aria-hidden="true">↶</span><span className="at-label" aria-hidden="true">Geri al</span>
                            <span className="open-hand-score">+{gameState.isHugoRound ? 200 : 100}</span>
                        </button>
                    )}
                    {myOpenState.isOpen && canDropPer && (
                        <button
                            className={`open-hand-btn drop-per ${canDropPer ? 'active' : 'disabled'}`}
                            onClick={() => onDropPer()}
                            disabled={!canDropPer}
                            aria-label={myOpenState.openedWithPairs ? 'Çiftleri indir' : 'Perleri indir'}
                            title={myOpenState.openedWithPairs ? 'Çiftleri indir' : 'Perleri indir'}
                        >
                            {actionFan(myOpenState.openedWithPairs ? [5, 5] : [3, 4, 5])}<span className="at-label" aria-hidden="true">İndir</span>
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
                onPlayGroup={onPlayGroup}
                pendingSetIds={pendingOpen?.setIds}
                onGroupMove={(group, grabIdx, targetIdx) => {
                    // Sürükleme sırasında ıstaka değiştiyse (sunucu olayı) eski seçimle taşınmaz
                    setTilePositions(prev => (prev === tilePositions && moveGroup(prev, group, grabIdx, targetIdx)) || prev);
                    setSelectedTile(null);
                }}
                onArrange={(mode) => {
                    // Teşhis: iPhone ana ekran uygulamasında dizmeden sonra donma bildirildi (main.jsx sunucuya yazar)
                    window.__lastAction = `dizme:${mode}`;
                    window.__diagTouches = 5; // sonraki 5 dokunuş da günlüğe yazılır
                    const t0 = performance.now();
                    try {
                        const next = arrangeTiles(tiles, mode, gameState.okeyTile, gameState.isHugoRound);
                        setRackMode(mode);
                        setTilePositions(next);
                        setSelectedTile(null);
                        window.__hugoLog?.({ type: 'dizme', mode, ms: Math.round(performance.now() - t0), n: tiles.length, placed: next.filter(Boolean).length });
                    } catch (err) {
                        window.__hugoLog?.({ type: 'dizme-hata', mode, msg: err.message, stack: err.stack?.slice(0, 600) });
                    }
                }}
                kustuCorner={kustuCorner}
                onKustu={onKustu}
                onWarn={setError}
                canSeeDiscards={!!(myOpenState.isOpen && myOpenState.openedWithPairs)}
                canPlaySets={myOpenState.isOpen && isMyTurn}
                onTapDiscard={() => setSelectedTile(null)} // atma GameBoard'da (uçuş animasyonuyla)
                selectedTile={selectedTile}
                tableSets={tableSets}
                orderedPlayers={players}
                selectedTileId={selectedTileId}
                activeTile={activeTile}
                onAddTileToSet={onAddTileToSet}
                onAddPairToSet={onAddPairToSet}
                kustuTileId={kustuCorner ? takenInfo?.tileId : null}
                rejectId={rejectId}
                turnProgress={turnProgress}
                onTileDragStart={handleTileDragStart}
                onTileDragEnd={handleTileDragEnd}
                flippedTileIds={flippedTileIds}
                onOkeyFlip={handleOkeyFlip}
            />

            <RotateHint />
            <PenaltyLog entries={penaltyLog} round={gameState.round} />
            <Chat playerId={player.id} />

            {/* Sağ üst: el bilgisi ve tabela */}
            {room?.no ? <div className="table-no" aria-label={`Masa numarası ${room.no}`}>#{room.no}</div> : null}
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
            {roundEndResults && summaryReady && !isGameOver && (
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