import React, { useState, useCallback, useEffect } from 'react';
import PlayerPanel from '../PlayerPanel/PlayerPanel';
import GameBoard from '../GameBoard/GameBoard';
import Scoreboard from '../Scoreboard/Scoreboard';
import RoundSummary from '../RoundSummary/RoundSummary';
import useGameState from '../../hooks/useGameState';
import useGameSocket from '../../hooks/useGameSocket';
import { getOrderedPlayers, getPlayerPosition, getPlayerCorner, getCurrentPlayerIndex, calculateHandScore, getConsecutiveGroups, validateSet } from '../../utils/gameUtils';
import { handleDrawTile, handleDiscardTile, handleTileMove, handleDrawDiscardedTile } from '../../utils/tileHandlers';
import '../../assets/css/components/GameBoard.css';

/**
 * Ana Oyun bileşeni
 * @param {Object} props - Bileşen özellikleri
 * @param {Object} props.player - Oyuncu bilgisi
 * @param {Object} props.room - Oda bilgisi
 * @returns {JSX.Element} - Oyun bileşeni
 */
function Game({ player, room }) {
    // Oyun durumu ve taşlarla ilgili state'leri al
    const {
        tiles,
        setTiles,
        gameState,
        setGameState,
        error,
        setError,
        loading,
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
        setTableSets,
        playerOpenStates,
        roundEndResults,
        setRoundEndResults
    } = useGameState(player, room);

    // Socket işlevlerini al
    const socketService = useGameSocket(player, room, setError);

    // Sürüklenen taş bilgisi (işleme için activeTile hesaplamada kullanılır)
    const [draggingTile, setDraggingTile] = useState(null);

    // Okey taşlarına sağ tıkla - ters çevrilmiş görünsün
    const [flippedTileIds, setFlippedTileIds] = useState(() => new Set());

    useEffect(() => {
        setFlippedTileIds(new Set());
    }, [gameState.round]);

    // Oyuncuları sırala
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
            setError
        });
    };

    // Taş atma işleyicisi
    const onDiscardTile = (tileIndex) => {
        handleDiscardTile({
            tiles,
            tileIndex,
            gameState,
            playerId: player.id,
            socketService,
            setTiles,
            setGameState,
            setError,
            setLoading,
            setDiscardedTiles,
            getPlayerCorner: (index) => getPlayerCorner(index),
            currentPlayerIndex
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
    const handScore = calculateHandScore(tilePositions, tiles, gameState.indicatorTile, gameState.okeyTile, gameState.round);

    // El açma durumu
    const isFirstHandBlock = tiles.length === 15 && gameState.turnAction === 'draw';

    // Masadaki en yüksek açılış değeri (tüm oyuncuların max'ı)
    const maxOpenedValue = Object.values(playerOpenStates).reduce(
        (max, s) => (s.lastOpenedValue > max ? s.lastOpenedValue : max), 0
    );

    const canOpenHand = isMyTurn
        && (gameState.turnAction === 'discard' || isFirstHandBlock)
        && handScore.setTotal > 0
        && handScore.validSetCount > 0
        && (maxOpenedValue === 0
            ? handScore.setTotal >= 51
            : handScore.setTotal > maxOpenedValue);

    const myOpenState = playerOpenStates[player.id] || { isOpen: false, openedTotal: 0 };
    const openHandLabel = myOpenState.isOpen ? 'Taş Oyna' : 'El Aç';

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

        socketService.addTileToSet(tileId, targetSetId, position, (response) => {
            if (response.success) {
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

    // Per indirme: eli açık, sırası gelmiş, geçerli setler var
    const canDropPer = isMyTurn
        && (gameState.turnAction === 'discard' || isFirstHandBlock)
        && myOpenState.isOpen
        && handScore.validSetCount > 0;

    // Per indirme işleyicisi
    const onDropPer = () => {
        if (!canDropPer) return;

        const groups = getConsecutiveGroups(tilePositions, tiles);
        const opts = { okeyTile: gameState.okeyTile, round: gameState.round };
        const validSets = [];
        for (const group of groups) {
            const score = validateSet(group, opts);
            if (score > 0) {
                validSets.push(group.map(t => t.id));
            }
        }
        if (validSets.length === 0) return;

        const droppedTileIds = new Set(validSets.flat());

        socketService.dropPer(validSets, (response) => {
            if (response.success) {
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

    // El açma işleyicisi
    const onOpenHand = () => {
        if (!canOpenHand) return;

        // Geçerli setleri tespit et
        const groups = getConsecutiveGroups(tilePositions, tiles);
        const opts = { okeyTile: gameState.okeyTile, round: gameState.round };
        const validSets = [];
        for (const group of groups) {
            const score = validateSet(group, opts);
            if (score > 0) {
                validSets.push(group.map(t => t.id));
            }
        }

        if (validSets.length === 0) return;

        // Açılacak taş ID'lerini düz listeye çevir
        const openedTileIds = new Set(validSets.flat());

        socketService.openHand(validSets, (response) => {
            if (response.success) {
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
        });
    };

    return (
        <div className="game-container">
            {error && <div style={{ color: 'red', textAlign: 'center', padding: '10px', display: 'none' }}>{error}</div>}

            {/* Oyuncu Panelleri */}
            {players.map((p, index) => {
                const openState = playerOpenStates[p.id];
                return (
                    <PlayerPanel
                        key={index}
                        name={p.name}
                        score={0}
                        position={getPlayerPosition(index)}
                        isCurrentPlayer={p.id === gameState.currentPlayerId}
                        timeLeft={p.id === gameState.currentPlayerId ? timeLeft : null}
                        setScore={index === 0 ? handScore.setTotal : null}
                        isOpen={openState?.isOpen}
                        openedTotal={openState?.openedTotal}
                        penaltyScore={openState?.penaltyScore || 0}
                    />
                );
            })}

            {/* El Aç / Taş Oyna ve Per İndir Butonları */}
            {isMyTurn && (gameState.turnAction === 'discard' || isFirstHandBlock) && (
                <div className="action-buttons">
                    {!myOpenState.isOpen && (
                        <button
                            className={`open-hand-btn ${canOpenHand ? 'active' : 'disabled'}`}
                            onClick={onOpenHand}
                            disabled={!canOpenHand}
                        >
                            {openHandLabel}
                            {handScore.setTotal > 0 && (
                                <span className="open-hand-score">{handScore.setTotal}</span>
                            )}
                        </button>
                    )}
                    {myOpenState.isOpen && (
                        <>
                            <button
                                className={`open-hand-btn ${canOpenHand ? 'active' : 'disabled'}`}
                                onClick={onOpenHand}
                                disabled={!canOpenHand}
                            >
                                Taş Oyna
                                {handScore.setTotal > 0 && (
                                    <span className="open-hand-score">{handScore.setTotal}</span>
                                )}
                            </button>
                            <button
                                className={`open-hand-btn drop-per ${canDropPer ? 'active' : 'disabled'}`}
                                onClick={onDropPer}
                                disabled={!canDropPer}
                            >
                                Per İndir
                            </button>
                        </>
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
                currentPlayerIndex={currentPlayerIndex}
                lastDiscardCorner={lastDiscardCorner}
                deckCount={gameState.deckCount}
                indicatorTile={gameState.indicatorTile}
                okeyTile={gameState.okeyTile}
                gameRound={gameState.round}
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

            {/* Tabela */}
            <Scoreboard
                players={players}
                playerOpenStates={playerOpenStates}
            />

            {/* Tur Sonu Ekranı */}
            {roundEndResults && (
                <RoundSummary
                    roundData={roundEndResults}
                    isLastRound={roundEndResults.round >= 9}
                    onClose={() => setRoundEndResults(null)}
                />
            )}
        </div>
    );
}

export default Game; 