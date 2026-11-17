import React, { useEffect, useRef, useState } from 'react';
import PenaltyTiles from '../PenaltyTiles/PenaltyTiles';
import '../../assets/css/components/Scoreboard.css';
import '../../assets/css/components/PenaltyLog.css';

// Masadaki herkesin gördüğü bu elin ceza kaydı. Sağ alt köşede yalnızca simge; dokununca ıstakanın sağındaki boşlukta
// (masanın altında) açılır. Her elin başında kapanır. Önceki ellerin cezaları tabelada, ele tıklanınca görünür.
const PenaltyLog = ({ entries, round, myId }) => {
    const [open, setOpen] = useState(false);
    const listRef = useRef(null);
    useEffect(() => { setOpen(false); }, [round]);
    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [entries.length, open]);

    return (
        <aside className={`penalty-log ${open ? 'is-open' : ''}`} aria-label="Ceza kaydı">
            {open && (
                <ul ref={listRef} className="pl-list" aria-live="polite">
                    {entries.length === 0 && <li className="pl-empty">Bu elde henüz ceza yok</li>}
                    {entries.map(e => (
                        <li key={e.id} className={`${e.amount < 0 ? 'cancel' : ''} ${e.playerId === myId ? 'mine' : ''}`}>
                            <b className="pl-name">{e.playerName}</b>
                            <span className="pl-tiles"><PenaltyTiles label={e.tile} tag={e.tag} /></span>
                            {/* Kusulan taşın ceza iadesi tutar yerine "Kustu" yazar */}
                            {e.tag === 'kustu'
                                ? <span className="pl-kustu">Kustu</span>
                                : <span className="pl-amount">{e.amount}</span>}
                        </li>
                    ))}
                </ul>
            )}
            <button type="button" className="pl-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={`Cezalar (${entries.length})`} title="Cezalar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H9" /><path d="M4 7h11M4 12h11M4 17h11" />
                </svg>
                {entries.length > 0 && <span className="pl-count">{entries.length}</span>}
            </button>
        </aside>
    );
};

export default PenaltyLog;
