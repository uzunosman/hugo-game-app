import React from 'react';
import '../../assets/css/components/PlayerPanel.css';

const PlayerPanel = ({ name, score, position, isCurrentPlayer, timeLeft }) => {
    const getTimerProgress = () => {
        if (!isCurrentPlayer || !timeLeft) return 0;
        return (timeLeft / 60) * 100;
    };

    const isWarning = timeLeft <= 20;
    const progress = getTimerProgress();

    return (
        <div className={`player-panel ${position}`} style={{ '--timer-progress': `${progress}%` }}>
            {isCurrentPlayer && (
                <div
                    className={`timer-bar ${isWarning ? 'warning' : ''}`}
                />
            )}
            <div className="player-avatar" />
            <div className="player-info">
                <div className="player-name">{name}</div>
            </div>
        </div>
    );
};

export default PlayerPanel; 