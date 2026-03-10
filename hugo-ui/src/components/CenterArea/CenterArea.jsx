import React from 'react';
import CenterTile from '../CenterTile/CenterTile';
import '../../assets/css/components/CenterArea.css';

const CenterArea = ({ remainingTiles = [], openTile = null, onDrawTile, gameRound = 1, canDrawTile = false }) => {
    const handleTileClick = () => {
        if (onDrawTile && canDrawTile) {
            onDrawTile();
        }
    };

    const handleDragStart = (e) => {
        if (!canDrawTile) {
            e.preventDefault();
            return;
        }
        const data = JSON.stringify({ isFromDeck: true });
        e.dataTransfer.setData('tile', data);
        e.dataTransfer.setData('text/plain', data);
        e.dataTransfer.effectAllowed = 'move';

        // TileHolder taşlarıyla aynı boyutta (40x60) custom drag görüntüsü oluştur
        const ghost = document.createElement('div');
        ghost.style.cssText = `
            width: 40px;
            height: 60px;
            background: var(--tile-bg, #fff);
            border-radius: 2px;
            border: 1px solid rgba(0,0,0,0.15);
            box-shadow: 0 2px 6px rgba(0,0,0,0.25);
            position: fixed;
            top: -200px;
            left: -200px;
            pointer-events: none;
        `;
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 20, 30);
        setTimeout(() => document.body.removeChild(ghost), 0);
    };

    // Hugo eli kontrolü (1, 4, 9. eller)
    const isHugoRound = [1, 4, 9].includes(gameRound);

    return (
        <div className="center-area">
            <div className="center-tiles">
                {/* Kapalı deste - Tıklanabilir ve sürüklenebilir (sadece kart, count badge değil) */}
                <div
                    className={`deck-tile-wrapper ${!canDrawTile ? 'disabled' : ''}`}
                    onClick={handleTileClick}
                >
                    <CenterTile
                        isClosed={true}
                        remainingCount={remainingTiles.length > 0 ? remainingTiles.length : null}
                        isDisabled={!canDrawTile}
                        draggable={canDrawTile}
                        onDragStart={handleDragStart}
                    />
                </div>

                {/* Gösterge taşı - Sürüklenemez ve tıklanamaz */}
                <div className="indicator-tile">
                    {isHugoRound ? (
                        <CenterTile
                            value="J"
                            color="green"
                            isClosed={false}
                            isIndicator={true}
                        />
                    ) : (
                        openTile && (
                            <CenterTile
                                value={openTile.value}
                                color={openTile.color}
                                isClosed={false}
                                isIndicator={true}
                            />
                        )
                    )}
                </div>
            </div>

            {/* El numarası göstergesi */}
            <div className="round-indicator">
                {gameRound}. El {isHugoRound && '(Hugo)'}
            </div>
        </div>
    );
};

export default CenterArea; 