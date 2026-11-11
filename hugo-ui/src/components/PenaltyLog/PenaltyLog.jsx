import React, { useEffect, useRef } from 'react';
import '../../assets/css/components/PenaltyLog.css';

// Masadaki herkesin gördüğü ceza kaydı: "[işlek] Ali kırmızı 7 +70"
const PenaltyLog = ({ entries }) => {
    const listRef = useRef(null);
    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [entries.length]);

    if (!entries.length) return null;
    return (
        <aside className="penalty-log" aria-label="Ceza kaydı">
            <ul ref={listRef} aria-live="polite">
                {entries.map(e => (
                    <li key={e.id} className={e.amount < 0 ? 'cancel' : undefined}>
                        <span className="pl-tag">[{e.tag}]</span> <b>{e.playerName}</b>
                        {e.tile ? ` ${e.tile}` : ''} <span className="pl-amount">{e.amount > 0 ? '+' : ''}{e.amount}</span>
                    </li>
                ))}
            </ul>
        </aside>
    );
};

export default PenaltyLog;
