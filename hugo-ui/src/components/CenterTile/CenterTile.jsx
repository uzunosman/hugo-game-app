import React from 'react';
import '../../assets/css/components/CenterTile.css';

const CenterTile = ({
    value,
    color,
    isClosed,
    remainingCount,
    isIndicator = false,
    isDisabled = false,
    draggable = false,
    onDragStart
}) => {
    const className = `center-tile ${color || ''} ${isClosed ? 'closed' : ''} ${isIndicator ? 'indicator' : ''} ${isDisabled ? 'disabled' : ''}`;

    return (
        <div className="tile-container">
            <div
                className={className}
                draggable={draggable}
                onDragStart={onDragStart}
            >
                {!isClosed && value}
            </div>
            {isClosed && remainingCount !== null && (
                <div className="remaining-count">{remainingCount}</div>
            )}
        </div>
    );
};

export default CenterTile; 