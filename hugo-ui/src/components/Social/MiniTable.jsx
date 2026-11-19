import { avatarFor } from '../../utils/avatar';
import './Social.css';

// Küçük masa: ortada çuha (ad, durum), dört koltuk etrafında oyun sırasıyla (alt, sağ, üst, sol).
// Boş koltuk "+": onSit verilmişse dokunan oturur. highlight: davet kartında oturulacak koltuk.
const SIDES = ['bottom', 'right', 'top', 'left'];

export default function MiniTable({ name, status, voice, open, playing, players, maxPlayers = 4, onSit, onWatch, highlight = false, small = false }) {
    const firstEmpty = players.findIndex(p => !p || p.vacant);
    const seats = Array.from({ length: maxPlayers }, (_, i) => players[i] || null);
    const emptyAt = firstEmpty === -1 ? seats.findIndex(p => !p) : firstEmpty;
    return (
        <div className={`mtable ${playing ? 'is-playing' : ''} ${small ? 'is-small' : ''}`}>
            <div className="mtable-felt">
                <span className="mtable-name">{name}</span>
                <span className="mtable-status">
                    {voice && (
                        <svg viewBox="0 0 24 24" aria-label="sesli sohbet var" role="img"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></svg>
                    )}
                    {open && (
                        <svg viewBox="0 0 24 24" aria-label="ziyarete açık" role="img"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                    {status}
                </span>
            </div>
            {onWatch && (
                <button type="button" className="mtable-watch" onClick={onWatch} aria-label={`${name} masasını izle`}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                    İzle
                </button>
            )}
            {seats.map((p, i) => {
                const side = SIDES[i];
                if (p && !p.vacant) {
                    return (
                        <span key={side} className={`mtable-who mtable-${side}`}>
                            <img className={`mtable-seat ${p.connected === false ? 'is-away' : ''}`} src={avatarFor(p.id, p.isBot)} alt="" />
                            <span className="mtable-pname">{p.name}</span>
                        </span>
                    );
                }
                if (highlight && i === emptyAt) {
                    return <span key={side} className={`mtable-seat mtable-${side} is-mine`} aria-label="senin koltuğun" />;
                }
                return onSit ? (
                    <button key={side} type="button" className={`mtable-seat mtable-${side} is-empty`} onClick={onSit} aria-label={`${name} masasında boş koltuğa otur`}>+</button>
                ) : <span key={side} className={`mtable-seat mtable-${side} is-empty`} aria-hidden="true" />;
            })}
        </div>
    );
}
