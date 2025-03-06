import React from 'react';
import CenterTile from '../CenterTile/CenterTile';
import '../../assets/css/components/CenterArea.css';

const CenterArea = ({ remainingTiles = [], openTile = null, onDrawTile, gameRound = 1, canDrawTile = true }) => {
    const handleTileClick = () => {
        if (remainingTiles.length > 0 && onDrawTile && canDrawTile) {
            onDrawTile();
        }
    };

    // Hugo eli kontrolü (1, 4, 9. eller)
    const isHugoRound = [1, 4, 9].includes(gameRound);

    return (
        <div className="center-area">
            <div className="center-tiles">
                {/* Kapalı deste - Sürüklenebilir */}
                <div
                    className={`draggable-tile ${!canDrawTile ? 'disabled' : ''}`}
                    draggable={canDrawTile}
                    onClick={handleTileClick}
                >
                    <CenterTile
                        isClosed={true}
                        remainingCount={remainingTiles.length > 0 ? remainingTiles.length : null}
                        isDisabled={!canDrawTile}
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