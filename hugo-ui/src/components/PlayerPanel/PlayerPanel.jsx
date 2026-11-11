import React from 'react';
import { avatarFor } from '../../utils/avatar';
import '../../assets/css/components/PlayerPanel.css';

const TURN_SECONDS = 60;

const PlayerPanel = ({ playerId, name, isBot = false, position, isCurrentPlayer, timeLeft, setScore, isOpen, openedTotal, penaltyScore, connected = true, turnHint = null }) => {
    const seconds = isCurrentPlayer && typeof timeLeft === 'number' ? timeLeft : null;
    const progress = seconds === null ? 0 : Math.max(0, Math.min(1, seconds / TURN_SECONDS));
    const isWarning = seconds !== null && seconds <= 10;
    const showSetScore = setScore !== null && setScore !== undefined && !isOpen;

    return (
        <div
            className={`player-panel ${position} ${isCurrentPlayer ? 'is-turn' : ''} ${isWarning ? 'is-warning' : ''} ${connected ? '' : 'offline'}`}
            style={{ '--ring': progress }}
            aria-label={`${name}${isBot ? ', yapay zekâ' : ''}${isCurrentPlayer ? ', sırada' : ''}${connected ? '' : ', bağlantı koptu'}`}
        >
            {/* Sıradaysa avatarın çevresindeki halka kalan süreyi gösterir */}
            <div className="pp-avatar" aria-hidden="true">
                <img src={avatarFor(playerId || name, isBot)} alt="" draggable="false" />
            </div>
            <div className="pp-body">
                <div className="pp-name" title={name}>{name}{isBot && <span className="pp-bot" title="Yapay zekâ">YZ</span>}</div>
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
        </div>
    );
};

export default PlayerPanel;
