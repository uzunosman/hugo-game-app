import React from 'react';
import CenterTile from '../CenterTile/CenterTile';
import '../../assets/css/components/CenterArea.css';

const CenterArea = ({ remainingTiles = [], openTile = null, onDrawTile, gameRound = 1, isHugoRound: serverHugo, canDrawTile = false }) => {
    const handleTileClick = () => {
        onDrawTile?.(); // çekemiyorsa uyarıyı çeken taraf gösterir (sıra / aşama)
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
                        // Hugo eli: gösterge yerine yatay HUGO taşı, her harfin altında bir renk noktası
                        <div className="center-tile indicator hugo-indicator" role="img" aria-label="Hugo eli">
                            {['H', 'U', 'G', 'O'].map((ch, i) => (
                                <span key={ch} className={`hugo-letter hugo-c${i}`}>{ch}<i aria-hidden="true" /></span>
                            ))}
                        </div>
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