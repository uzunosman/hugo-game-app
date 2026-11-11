import React from 'react';
import '../../assets/css/components/PlayerPanel.css';

const TURN_SECONDS = 60;

// Ada göre sabit avatar rengi: aynı oyuncu her ekranda aynı renkte görünür
const AVATAR_HUES = [4, 28, 145, 190, 215, 262, 318, 48];
const hueOf = (name = '') => AVATAR_HUES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_HUES.length];
const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toLocaleUpperCase('tr-TR') || '?';

const PlayerPanel = ({ name, position, isCurrentPlayer, timeLeft, setScore, isOpen, openedTotal, penaltyScore, connected = true, turnHint = null }) => {
    const seconds = isCurrentPlayer && typeof timeLeft === 'number' ? timeLeft : null;
    const progress = seconds === null ? 0 : Math.max(0, Math.min(1, seconds / TURN_SECONDS));
    const isWarning = seconds !== null && seconds <= 10;
    const showSetScore = setScore !== null && setScore !== undefined && !isOpen;

    return (
        <div
            className={`player-panel ${position} ${isCurrentPlayer ? 'is-turn' : ''} ${isWarning ? 'is-warning' : ''} ${connected ? '' : 'offline'}`}
            style={{ '--ring': progress, '--avatar-hue': hueOf(name) }}
            aria-label={`${name}${isCurrentPlayer ? ', sırada' : ''}${connected ? '' : ', bağlantı koptu'}`}
        >
            <div className="pp-avatar" aria-hidden="true">
                <span className="pp-initials">{initials(name)}</span>
            </div>
            <div className="pp-body">
                <div className="pp-name" title={name}>{name}</div>
                <div className="pp-meta">
                    {turnHint && <span className="pp-chip pp-hint">{turnHint}</span>}
                    {!connected && <span className="pp-chip pp-offline">Koptu</span>}
                    {isOpen && openedTotal > 0 && <span className="pp-chip pp-open" title="Açılış değeri">Açık {openedTotal}</span>}
                    {penaltyScore > 0 && <span className="pp-chip pp-penalty" title="Bu eldeki ceza">Ceza {penaltyScore}</span>}
                    {showSetScore && (
                        <span className={`pp-chip pp-set ${setScore >= 51 ? 'valid' : ''}`} title="Istakadaki perlerin değeri">Per {setScore}</span>
                    )}
                </div>
            </div>
            {seconds !== null && <div className="pp-timer" aria-live="off">{seconds}</div>}
        </div>
    );
};

export default PlayerPanel;
