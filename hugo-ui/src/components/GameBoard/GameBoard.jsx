import React from 'react';
import TileHolder from '../TileHolder/TileHolder';
import CenterArea from '../CenterArea/CenterArea';
import DiscardAreas from '../DiscardAreas/DiscardAreas';
import '../../assets/css/components/GameBoard.css';

/**
 * Oyun tahtası bileşeni
 * @param {Object} props - Bileşen özellikleri
 * @param {Array} props.tiles - Oyuncunun taşları
 * @param {Array} props.tilePositions - Taş pozisyonları
 * @param {Object} props.discardedTiles - Atılan taşlar
 * @param {Function} props.handleTileClick - Taş tıklama işleyicisi
 * @param {Function} props.handleTileMove - Taş taşıma işleyicisi
 * @param {Function} props.handleDrawTile - Taş çekme işleyicisi
 * @param {Function} props.handleDrawDiscardedTile - Atılan taşı çekme işleyicisi
 * @param {Boolean} props.isMyTurn - Oyuncunun sırası mı
 * @param {String} props.turnAction - Mevcut aksiyon (draw/discard)
 * @param {String} props.playerCorner - Oyuncunun köşesi
 * @param {Number} props.currentPlayerIndex - Mevcut oyuncunun indeksi
 * @returns {JSX.Element} - Oyun tahtası bileşeni
 */
const GameBoard = ({
    tiles,
    tilePositions,
    discardedTiles,
    handleTileClick,
    handleTileMove,
    handleDrawTile,
    handleDrawDiscardedTile,
    isMyTurn,
    turnAction,
    playerCorner,
    currentPlayerIndex
}) => {
    return (
        <div className="game-board">
            <div className="board-content">
                {/* Köşe Bırakma Alanları */}
                <DiscardAreas
                    discardedTiles={discardedTiles}
                    handleTileMove={handleTileMove}
                    handleDrawDiscardedTile={handleDrawDiscardedTile}
                    isMyTurn={isMyTurn}
                    turnAction={turnAction}
                    playerCorner={playerCorner}
                    tilesLength={tiles.length}
                    currentPlayerIndex={currentPlayerIndex}
                />

                {/* Merkez Alan */}
                <CenterArea
                    onDrawTile={() => handleDrawTile(false)}
                    canDraw={isMyTurn && turnAction === 'draw'}
                />

                {/* Oyuncunun Taşları */}
                <TileHolder
                    tiles={tiles}
                    tilePositions={tilePositions}
                    onTileClick={handleTileClick}
                    onTileMove={handleTileMove}
                    onDrawDiscardedTile={handleDrawDiscardedTile}
                />
            </div>
        </div>
    );
};

export default GameBoard; 