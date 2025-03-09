import React from 'react';
import Tile from '../Tile/Tile';

/**
 * Köşelerdeki atma alanları bileşeni
 * @param {Object} props - Bileşen özellikleri
 * @param {Object} props.discardedTiles - Atılan taşlar
 * @param {Function} props.handleTileMove - Taş taşıma işleyicisi
 * @param {Function} props.handleDrawDiscardedTile - Atılan taşı çekme işleyicisi
 * @param {Boolean} props.isMyTurn - Oyuncunun sırası mı
 * @param {String} props.turnAction - Mevcut aksiyon (draw/discard)
 * @param {String} props.playerCorner - Oyuncunun köşesi
 * @param {Number} props.tilesLength - Oyuncunun taş sayısı
 * @param {Number} props.currentPlayerIndex - Mevcut oyuncunun indeksi
 * @returns {JSX.Element} - Köşe atma alanları bileşeni
 */
const DiscardAreas = ({
    discardedTiles,
    handleTileMove,
    handleDrawDiscardedTile,
    isMyTurn,
    turnAction,
    playerCorner,
    tilesLength,
    currentPlayerIndex
}) => {
    console.log("DiscardAreas render:", {
        isMyTurn,
        turnAction,
        playerCorner,
        tilesLength,
        currentPlayerIndex,
        discardedTiles
    });

    // Köşe bırakma alanı için drag-drop işleyicileri
    const handleDragOver = (e, corner) => {
        const isFirstTurn = tilesLength === 15 && turnAction === 'draw';
        if (playerCorner === corner && isMyTurn && (turnAction === 'discard' || isFirstTurn)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            e.currentTarget.classList.add('drag-over');
        }
    };

    const handleDragLeave = (e) => {
        e.currentTarget.classList.remove('drag-over');
    };

    const handleDrop = (e, corner) => {
        const isFirstTurn = tilesLength === 15 && turnAction === 'draw';
        if (playerCorner === corner && isMyTurn && (turnAction === 'discard' || isFirstTurn)) {
            e.preventDefault();
            e.currentTarget.classList.remove('drag-over');
            try {
                const tileData = JSON.parse(e.dataTransfer.getData('tile'));
                handleTileMove(tileData.sourceIndex, -1);
            } catch (error) {
                console.error('Taş bırakma sırasında hata:', error);
            }
        }
    };

    // Atılan taşı sürükleyebilme koşulu
    const canDragDiscardedTile = (corner) => {
        // Sadece sıradaki oyuncu ve çekme aşamasında atılan taşlar sürüklenebilir
        console.log("canDragDiscardedTile check:", {
            isMyTurn,
            turnAction,
            corner
        });

        // Şimdilik her zaman true döndürelim (test için)
        return true;
    };

    // Atılan taşa tıklama işleyicisi
    const handleDiscardedTileClick = (corner, tileIndex) => {
        if (canDragDiscardedTile(corner)) {
            // Atılan taşı çek
            handleDrawDiscardedTile(corner, tileIndex);
        }
    };

    return (
        <>
            {/* Üst Sol Köşe */}
            <div
                className={`tile-drop-zone top-left ${playerCorner === 'topLeft' && isMyTurn && (turnAction === 'discard' || tilesLength === 15) ? 'active' : ''}`}
                onDragOver={(e) => handleDragOver(e, 'topLeft')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'topLeft')}
            >
                {discardedTiles.topLeft && discardedTiles.topLeft.length > 0 && (
                    <div className="discarded-tiles">
                        {discardedTiles.topLeft.map((tile, index) => {
                            const canDrag = canDragDiscardedTile('topLeft');
                            return (
                                <div key={index} className="discarded-tile-wrapper">
                                    <Tile
                                        tile={tile}
                                        onClick={() => handleDiscardedTileClick('topLeft', index)}
                                        isDiscarded={true}
                                        canDrag={canDrag}
                                        discardedFrom="topLeft"
                                        index={index}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Üst Sağ Köşe */}
            <div
                className={`tile-drop-zone top-right ${playerCorner === 'topRight' && isMyTurn && (turnAction === 'discard' || tilesLength === 15) ? 'active' : ''}`}
                onDragOver={(e) => handleDragOver(e, 'topRight')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'topRight')}
            >
                {discardedTiles.topRight && discardedTiles.topRight.length > 0 && (
                    <div className="discarded-tiles">
                        {discardedTiles.topRight.map((tile, index) => {
                            const canDrag = canDragDiscardedTile('topRight');
                            return (
                                <div key={index} className="discarded-tile-wrapper">
                                    <Tile
                                        tile={tile}
                                        onClick={() => handleDiscardedTileClick('topRight', index)}
                                        isDiscarded={true}
                                        canDrag={canDrag}
                                        discardedFrom="topRight"
                                        index={index}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Alt Sağ Köşe */}
            <div
                className={`tile-drop-zone bottom-right ${playerCorner === 'bottomRight' && isMyTurn && (turnAction === 'discard' || tilesLength === 15) ? 'active' : ''}`}
                onDragOver={(e) => handleDragOver(e, 'bottomRight')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'bottomRight')}
            >
                {discardedTiles.bottomRight && discardedTiles.bottomRight.length > 0 && (
                    <div className="discarded-tiles">
                        {discardedTiles.bottomRight.map((tile, index) => {
                            const canDrag = canDragDiscardedTile('bottomRight');
                            return (
                                <div key={index} className="discarded-tile-wrapper">
                                    <Tile
                                        tile={tile}
                                        onClick={() => handleDiscardedTileClick('bottomRight', index)}
                                        isDiscarded={true}
                                        canDrag={canDrag}
                                        discardedFrom="bottomRight"
                                        index={index}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Alt Sol Köşe */}
            <div
                className={`tile-drop-zone bottom-left ${playerCorner === 'bottomLeft' && isMyTurn && (turnAction === 'discard' || tilesLength === 15) ? 'active' : ''}`}
                onDragOver={(e) => handleDragOver(e, 'bottomLeft')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'bottomLeft')}
            >
                {discardedTiles.bottomLeft && discardedTiles.bottomLeft.length > 0 && (
                    <div className="discarded-tiles">
                        {discardedTiles.bottomLeft.map((tile, index) => {
                            const canDrag = canDragDiscardedTile('bottomLeft');
                            console.log("Rendering discarded tile:", {
                                tile,
                                corner: 'bottomLeft',
                                canDrag,
                                isMyTurn,
                                turnAction
                            });
                            return (
                                <div key={index} className="discarded-tile-wrapper">
                                    <Tile
                                        tile={tile}
                                        onClick={() => handleDiscardedTileClick('bottomLeft', index)}
                                        isDiscarded={true}
                                        canDrag={canDrag}
                                        discardedFrom="bottomLeft"
                                        index={index}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
};

export default DiscardAreas; 