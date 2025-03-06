import React, { useState, useEffect } from 'react';
import PlayerPanel from '../PlayerPanel/PlayerPanel';
import TileHolder from '../TileHolder/TileHolder';
import CenterArea from '../CenterArea/CenterArea';
import Tile from '../Tile/Tile';
import '../../assets/css/components/GameBoard.css';

const GameBoard = ({
    players,
    currentPlayer,
    playerTiles,
    onTileClick,
    onTileMove,
    remainingTiles,
    onDrawTile,
    openTile,
    gameRound,
    hasDrawnTile,
    discardedTiles
}) => {
    const [timeLeft, setTimeLeft] = useState(60);

    useEffect(() => {
        // Oyuncu değiştiğinde süreyi sıfırla
        setTimeLeft(60);

        // Süre sayacı
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 0) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [currentPlayer]);

    // Oyuncunun köşesini belirle
    const getPlayerCorner = (playerIndex) => {
        const cornerMap = {
            0: 'topLeft',     // 3. oyuncu
            1: 'topRight',    // 2. oyuncu
            2: 'bottomRight', // 1. oyuncu
            3: 'bottomLeft'   // 4. oyuncu
        };
        return cornerMap[playerIndex];
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over');
    };

    const handleDragLeave = (e) => {
        e.currentTarget.classList.remove('drag-over');
    };

    const handleDrop = (e, corner) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');

        // Oyuncunun kendi köşesi değilse, taş bırakılamaz
        const playerCorner = getPlayerCorner(currentPlayer);
        if (corner !== playerCorner) {
            console.log('Bu köşeye taş bırakamazsınız!');
            return;
        }

        try {
            const tileData = JSON.parse(e.dataTransfer.getData('tile'));
            onTileMove(tileData.sourceIndex, -1);
        } catch (error) {
            console.error('Taş bırakma sırasında hata:', error);
        }
    };

    // Atılan taşları render et
    const renderDiscardedTiles = (corner) => {
        const tiles = discardedTiles[corner];
        if (tiles.length === 0) return null;

        // Sadece son atılan taşı göster
        const lastTile = tiles[tiles.length - 1];
        return (
            <div
                key={`${corner}-last`}
                className={`discarded-tile ${corner}`}
            >
                <Tile
                    value={lastTile.value}
                    color={lastTile.color}
                    isDiscarded={true}
                />
            </div>
        );
    };

    return (
        <>
            {/* Player Panels */}
            {players.map((player, index) => (
                <PlayerPanel
                    key={index}
                    name={player.name}
                    score={player.score}
                    position={index === 2 ? 'current-player' : ['top', 'right', 'left'][index === 3 ? 2 : index]}
                    isCurrentPlayer={index === currentPlayer}
                    timeLeft={index === currentPlayer ? timeLeft : null}
                />
            ))}

            <div className="game-board">
                <div className="board-content">
                    {/* Köşe Bırakma Alanları */}
                    <div
                        className={`tile-drop-zone top-left ${getPlayerCorner(currentPlayer) === 'topLeft' ? 'active' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, 'topLeft')}
                    />
                    <div
                        className={`tile-drop-zone top-right ${getPlayerCorner(currentPlayer) === 'topRight' ? 'active' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, 'topRight')}
                    />
                    <div
                        className={`tile-drop-zone bottom-left ${getPlayerCorner(currentPlayer) === 'bottomLeft' ? 'active' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, 'bottomLeft')}
                    />
                    <div
                        className={`tile-drop-zone bottom-right ${getPlayerCorner(currentPlayer) === 'bottomRight' ? 'active' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, 'bottomRight')}
                    />

                    {/* Atılan taşlar */}
                    <div className="discarded-tiles-container">
                        <div className="discarded-tiles top-left">
                            {renderDiscardedTiles('topLeft')}
                        </div>
                        <div className="discarded-tiles top-right">
                            {renderDiscardedTiles('topRight')}
                        </div>
                        <div className="discarded-tiles bottom-left">
                            {renderDiscardedTiles('bottomLeft')}
                        </div>
                        <div className="discarded-tiles bottom-right">
                            {renderDiscardedTiles('bottomRight')}
                        </div>
                    </div>

                    {/* Center Area */}
                    <CenterArea
                        remainingTiles={remainingTiles}
                        onDrawTile={onDrawTile}
                        openTile={openTile}
                        gameRound={gameRound}
                        canDrawTile={!hasDrawnTile[currentPlayer]}
                    />
                </div>
            </div>

            {/* Current Player's Tiles */}
            <TileHolder
                tiles={playerTiles[currentPlayer]}
                onTileClick={(tileIndex) => onTileClick(currentPlayer, tileIndex)}
                onTileMove={onTileMove}
            />
        </>
    );
};

export default GameBoard; 