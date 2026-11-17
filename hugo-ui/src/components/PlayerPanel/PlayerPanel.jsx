import React from 'react';
import { avatarFor } from '../../utils/avatar';
import '../../assets/css/components/PlayerPanel.css';

const TURN_SECONDS = 60;

// Açan oyuncunun açılış değeri: dizme düğmesine benzer küçük taş rozeti (pp-opened): üstte seri / çift yelpazesi, altında sayı.
// Kuzey ve güneyde avatarın solunda, doğu ve batıda avatarın üstünde
const PlayerPanel = ({ playerId, name, isBot = false, position, isCurrentPlayer, timeLeft, isOpen, openedTotal, openedWithPairs = false, isTopOpener = false, penaltyScore, connected = true, bubble = null }) => {
    const seconds = isCurrentPlayer && typeof timeLeft === 'number' ? timeLeft : null;
    const progress = seconds === null ? 0 : Math.max(0, Math.min(1, seconds / TURN_SECONDS));
    const isWarning = seconds !== null && seconds <= 10;

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
                    {penaltyScore > 0 && <span className="pp-chip pp-penalty" title="Bu eldeki ceza">Ceza {penaltyScore}</span>}
                </div>
            </div>
            {isOpen && openedTotal > 0 && (
                <div className={`pp-opened ${isTopOpener ? 'is-top' : ''}`} title={openedWithPairs ? 'Çiftle açtı' : 'Seriyle açtı'} aria-label={`${openedWithPairs ? 'Çiftle' : 'Seriyle'} açtı: ${openedTotal}`}>
                    {openedWithPairs
                        ? <span className="rt-fan rt-fan-2" aria-hidden="true"><span className="rt-tile">5</span><span className="rt-tile">5</span></span>
                        : <span className="rt-fan rt-fan-3" aria-hidden="true"><span className="rt-tile">3</span><span className="rt-tile">4</span><span className="rt-tile">5</span></span>}
                    <b>{openedTotal}</b>
                </div>
            )}
            {/* Sohbet balonu: yazanın kartının yanında birkaç saniye görünür (Game yönetir) */}
            {bubble && <div key={bubble.id} className="pp-bubble" role="status">{bubble.text}</div>}
        </div>
    );
};

export default PlayerPanel;
