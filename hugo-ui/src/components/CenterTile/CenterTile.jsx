import React from 'react';
import '../../assets/css/components/CenterTile.css';

const CenterTile = ({
    value,
    color,
    isClosed,
    remainingCount,
    isIndicator = false,
    isDisabled = false,
    drawHint = false // sırası gelmiş, henüz taş çekmemiş oyuncuya desteden "Taş çek"
}) => {
    const className = `center-tile ${color || ''} ${isClosed ? 'closed' : ''} ${isIndicator ? 'indicator' : ''} ${isDisabled ? 'disabled' : ''}`;

    return (
        <div className="tile-container">
            <div
                className={className}
                draggable="false"
            >
                {!isClosed && value}
                {isClosed && remainingCount !== null && (
                    <span className="remaining-count" aria-label={`Destede ${remainingCount} taş`}>{remainingCount}</span>
                )}
                {isClosed && drawHint && <span className="draw-hint">Taş çek</span>}
            </div>
        </div>
    );
};

export default CenterTile; 