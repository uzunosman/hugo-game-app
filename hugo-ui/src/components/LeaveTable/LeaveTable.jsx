import { useState } from 'react';
import './LeaveTable.css';

// Oyun sürerken masadan kalk: onayla, yerine yapay zekâ oynar, oyuncu lobiye döner
function LeaveTable({ onLeave }) {
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const leave = () => {
        setBusy(true);
        setError('');
        onLeave((err) => { setBusy(false); setError(err || ''); });
    };

    return (
        <div className="leave-table">
            <button className="scoreboard-toggle" onClick={() => setAsking(a => !a)} title="Masadan kalk"
                aria-label="Masadan kalk" aria-expanded={asking}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
            </button>
            {asking && (
                <div className="leave-table-pop" role="dialog" aria-label="Masadan kalk">
                    <p>Masadan kalkılsın mı? Yerine yapay zekâ oynar, sen lobiye dönersin.</p>
                    {error && <p className="leave-table-error">{error}</p>}
                    <div className="leave-table-actions">
                        <button className="leave-table-confirm" onClick={leave} disabled={busy} autoFocus>Masadan kalk</button>
                        <button onClick={() => setAsking(false)} disabled={busy}>Vazgeç</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default LeaveTable;
