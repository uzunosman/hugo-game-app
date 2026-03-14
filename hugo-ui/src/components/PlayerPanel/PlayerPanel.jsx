import React from 'react';
import '../../assets/css/components/PlayerPanel.css';

const PlayerPanel = ({ name, score, position, isCurrentPlayer, timeLeft, setScore, isOpen, openedTotal, penaltyScore }) => {
    const getTimerProgress = () => {
        if (!isCurrentPlayer || !timeLeft) return 0;
        return (timeLeft / 60) * 100;
    };

    const isWarning = timeLeft <= 20;
    const progress = getTimerProgress();
    const hasValidOpening = setScore >= 51;

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
            {isOpen && openedTotal > 0 && (
                <div className="opened-badge">{openedTotal}</div>
            )}
            {penaltyScore > 0 && (
                <div className="penalty-badge">{penaltyScore}</div>
            )}
            {setScore !== null && setScore !== undefined && (
                <div className={`set-score ${hasValidOpening ? 'valid' : ''}`}>
                    {setScore}
                </div>
            )}
        </div>
    );
};

export default PlayerPanel; 