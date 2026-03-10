import React from 'react';
import PlayerPanel from '../PlayerPanel/PlayerPanel';
import GameBoard from '../GameBoard/GameBoard';
import useGameState from '../../hooks/useGameState';
import useGameSocket from '../../hooks/useGameSocket';
import { getOrderedPlayers, getPlayerPosition, getPlayerCorner, getCurrentPlayerIndex } from '../../utils/gameUtils';
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
        lastDiscardPlayerId
    } = useGameState(player, room);

    // Socket işlevlerini al
    const socketService = useGameSocket(player, room, setError);

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

    // Taş tıklama işleyicisi
    const handleTileClick = (tileIndex) => {
        // Taş seçme/bırakma işlemi
        if (selectedTile === tileIndex) {
            setSelectedTile(null);
        } else {
            setSelectedTile(tileIndex);
        }
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

    return (
        <div className="game-container">
            {error && <div style={{ color: 'red', textAlign: 'center', padding: '10px', display: 'none' }}>{error}</div>}

            {/* Oyuncu Panelleri */}
            {players.map((p, index) => (
                <PlayerPanel
                    key={index}
                    name={p.name}
                    score={0}
                    position={getPlayerPosition(index)}
                    isCurrentPlayer={p.id === gameState.currentPlayerId}
                    timeLeft={p.id === gameState.currentPlayerId ? timeLeft : null}
                />
            ))}

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
                gameRound={gameState.round}
            />
        </div>
    );
}

export default Game; 