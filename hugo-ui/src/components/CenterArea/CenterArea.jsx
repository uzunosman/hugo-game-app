import React from 'react';
import CenterTile from '../CenterTile/CenterTile';
import '../../assets/css/components/CenterArea.css';

const CenterArea = ({ remainingTiles = [], openTile = null, onDrawTile, gameRound = 1, isHugoRound: serverHugo, canDrawTile = false }) => {
    const handleTileClick = () => {
        if (onDrawTile && canDrawTile) {
            onDrawTile();
        }
    };

    // Hugo eli kontrolü (1, 5, 9. eller — sunucudaki config.game.hugoRounds ile aynı)
    // Sunucunun kararı esas (sahte okey göstergesi de Hugo yapar); yoksa el numarasına bak
    const isHugoRound = serverHugo ?? [1, 5, 9].includes(gameRound);

    return (
        <div className="center-area">
            <div className="center-tiles">
                {/* Kapalı deste - Tıklanabilir; ıstakaya sürüklenebilir (useBoardDrag) (sadece kart, count badge değil) */}
                <div
                    className={`deck-tile-wrapper ${!canDrawTile ? 'disabled' : ''}`}
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
        </div>
    );
};

export default CenterArea; 