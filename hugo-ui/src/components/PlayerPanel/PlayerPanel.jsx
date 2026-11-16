import React from 'react';
import { avatarFor } from '../../utils/avatar';
import '../../assets/css/components/PlayerPanel.css';

const TURN_SECONDS = 60;

// canOpenWith: ıstakadaki per / çift değeri açmaya yetiyor mu (masada açan yoksa 51, varsa en yüksek açılışı geçmeli)
const PlayerPanel = ({ playerId, name, isBot = false, position, isCurrentPlayer, timeLeft, setScore, setLabel = 'Per', canOpenWith = false, isOpen, openedTotal, penaltyScore, connected = true, bubble = null }) => {
    const seconds = isCurrentPlayer && typeof timeLeft === 'number' ? timeLeft : null;
    const progress = seconds === null ? 0 : Math.max(0, Math.min(1, seconds / TURN_SECONDS));
    const isWarning = seconds !== null && seconds <= 10;
    const showSetScore = setScore !== null && setScore !== undefined && !isOpen;

    return (
        <div
            className={`player-panel ${position} ${isCurrentPlayer ? 'is-turn' : ''} ${isWarning ? 'is-warning' : ''} ${connected ? '' : 'offline'} ${bubble ? 'has-bubble' : ''}`}
            data-player-id={playerId}
            style={{ '--ring': progress }}
            aria-label={`${name}${isBot ? ', yapay zekâ' : ''}${isCurrentPlayer ? ', sırada' : ''}${connected ? '' : ', bağlantı koptu'}`}
        >
            {/* Sıradaysa avatarın çevresindeki halka kalan süreyi gösterir */}
            <div className="pp-avatar" aria-hidden="true">
                <img src={avatarFor(playerId || name, isBot)} alt="" draggable="false" />
                {isBot && <span className="pp-bot">YZ</span>}
            </div>
            <div className="pp-body">
                <div className="pp-name" title={name}>{name}</div>
                <div className="pp-meta">
                    {!connected && <span className="pp-chip pp-offline">Koptu</span>}
                    {isOpen && openedTotal > 0 && <span className="pp-chip pp-open" title="Açılış değeri">Açık {openedTotal}</span>}
                    {penaltyScore > 0 && <span className="pp-chip pp-penalty" title="Bu eldeki ceza">Ceza {penaltyScore}</span>}
                    {showSetScore && (
                        <span className={`pp-chip pp-set ${canOpenWith ? 'valid' : ''}`} title={setLabel === 'Çift' ? 'Istakadaki çiftlerin değeri' : 'Istakadaki perlerin değeri'}>{setLabel} {setScore}</span>
                    )}
                </div>
            </div>
            {/* Sohbet balonu: yazanın kartının yanında birkaç saniye görünür (Game yönetir) */}
            {bubble && <div key={bubble.id} className="pp-bubble" role="status">{bubble.text}</div>}
        </div>
    );
};

export default PlayerPanel;
