import React, { useEffect, useRef, useState } from 'react';
import '../../assets/css/components/PenaltyLog.css';

const KEY = 'hugo.penaltyLogHidden';
const readHidden = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

// Masadaki herkesin gördüğü bu elin ceza kaydı: "[işlek] Ali kırmızı 7 +70". Her zaman sağ altta; gizlenip açılabilir.
// Önceki ellerin cezaları sağ üstteki tabelada, ele tıklanınca görünür.
const PenaltyLog = ({ entries }) => {
    const [hidden, setHidden] = useState(readHidden);
    const listRef = useRef(null);
    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [entries.length, hidden]);

    const toggle = () => setHidden(h => {
        try { localStorage.setItem(KEY, h ? '0' : '1'); } catch { /* yalnızca bu oturum */ }
        return !h;
    });

    return (
        <aside className={`penalty-log ${hidden ? 'is-hidden' : ''}`} aria-label="Ceza kaydı">
            <button type="button" className="pl-toggle" onClick={toggle} aria-expanded={!hidden}>
                Cezalar <span className="pl-count">{entries.length}</span>
                <span className="pl-chevron" aria-hidden="true">{hidden ? '▴' : '▾'}</span>
            </button>
            {!hidden && (
                <ul ref={listRef} aria-live="polite">
                    {entries.length === 0 && <li className="pl-empty">Bu elde henüz ceza yok</li>}
                    {entries.map(e => (
                        <li key={e.id} className={e.amount < 0 ? 'cancel' : undefined}>
                            <span className="pl-tag">[{e.tag}]</span> <b>{e.playerName}</b>
                            {e.tile ? ` ${e.tile}` : ''} <span className="pl-amount">{e.amount > 0 ? '+' : ''}{e.amount}</span>
                        </li>
                    ))}
                </ul>
            )}
        </aside>
    );
};

export default PenaltyLog;
