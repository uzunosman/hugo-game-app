import React from 'react';
import { avatarFor } from '../../utils/avatar';
import '../../assets/css/components/PlayerPanel.css';

const TURN_SECONDS = 60;

// Açan oyuncunun açılış değeri: dizme düğmesine benzer küçük taş rozeti (pp-opened): üstte seri / çift yelpazesi, altında sayı.
// Kuzey ve güneyde avatarın solunda, doğu ve batıda avatarın üstünde
const PlayerPanel = ({ playerId, name, isBot = false, position, isCurrentPlayer, timeLeft, isOpen, openedTotal, openedWithPairs = false, isTopOpener = false, penaltyScore, connected = true, bubble = null, onClick, menu = null, muted = false, speaking = false, vacantLeft = null }) => {
    const seconds = isCurrentPlayer && typeof timeLeft === 'number' ? timeLeft : null;
    const progress = seconds === null ? 0 : Math.max(0, Math.min(1, seconds / TURN_SECONDS));
    const isWarning = seconds !== null && seconds <= 10;

    return (
        <div
            className={`player-panel ${position} ${vacantLeft !== null ? 'is-vacant' : ''} ${speaking ? 'is-speaking' : ''} ${isCurrentPlayer ? 'is-turn' : ''} ${isWarning ? 'is-warning' : ''} ${connected ? '' : 'offline'} ${bubble ? 'has-bubble' : ''}`}
            data-player-id={playerId}
            style={{ '--ring': progress }}
            aria-label={`${name}${isBot ? ', yapay zekâ' : ''}${isCurrentPlayer ? ', sırada' : ''}${connected ? '' : ', bağlantı koptu'}${muted ? ', sessizde' : ''}`}
            // Sesli sohbette diğer oyuncunun kartına dokununca susturma penceresi açılır (Game)
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}
            aria-haspopup={onClick ? 'menu' : undefined}
            aria-expanded={onClick ? !!menu : undefined}
        >
            {/* Sıradaysa avatarın çevresindeki halka kalan süreyi gösterir */}
            <div className="pp-avatar" aria-hidden="true">
                <img src={avatarFor(playerId || name, isBot)} alt="" draggable="false" />
                {isBot && <span className="pp-bot">YZ</span>}
                {muted && <span className="pp-muted" aria-hidden="true">✕</span>}
            </div>
            <div className="pp-body">
                <div className="pp-name" title={name}>{name}</div>
                <div className="pp-meta">
                    {vacantLeft !== null && <span className="pp-chip pp-vacant" aria-label={`yapay zekâ ${vacantLeft} saniye sonra geri gelir`}>YZ {vacantLeft} sn</span>}
                    {!connected && vacantLeft === null && <span className="pp-chip pp-offline">Koptu</span>}
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
            {menu}
            {/* Sohbet balonu: yazanın kartının yanında birkaç saniye görünür (Game yönetir) */}
            {bubble && <div key={bubble.id} className="pp-bubble" role="status">{bubble.text}</div>}
        </div>
    );
};

export default PlayerPanel;
