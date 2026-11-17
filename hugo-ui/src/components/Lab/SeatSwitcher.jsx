import { useEffect, useState } from 'react';
import './Lab.css';
import socketService from '../../services/socketService';

// Test senaryosu masası: admin koltuklar arasında geçer (o oyuncu olarak oynar, sohbete yazar), senaryoyu baştan kurar
export default function SeatSwitcher({ room, player }) {
    const [open, setOpen] = useState(false);
    const [info, setInfo] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {
        socketService.labScenarios((r) => { if (r?.success) setInfo(r.scenarios.find(s => s.id === room.lab) || null); });
    }, [room.lab]);
    const done = (r) => { if (!r?.success) setError(r?.error || 'Olmadı'); };
    return (
        <div className={`lab-bar ${open ? 'is-open' : ''}`} role="region" aria-label="Test senaryosu">
            <div className="lab-bar-row">
                <span className="lab-bar-tag">Test</span>
                {room.players.map(p => (
                    <button key={p.id} type="button" className={`lab-seat ${p.id === player.id ? 'is-me' : ''}`}
                        aria-pressed={p.id === player.id} disabled={p.id === player.id || p.isBot}
                        title={p.isBot ? 'Yapay zekâ' : `${p.name} koltuğuna geç`}
                        onClick={() => { setError(''); socketService.labTakeSeat(p.id, done); }}>
                        {p.name}
                    </button>
                ))}
                <button type="button" className="lab-seat" onClick={() => { setError(''); socketService.labReset(room.id, done); }}>Sıfırla</button>
                {info?.description && (
                    <button type="button" className="lab-seat" aria-expanded={open} aria-label="Test adımları" title="Test adımları" onClick={() => setOpen(o => !o)}>?</button>
                )}
            </div>
            {error && <p className="lab-bar-error" role="alert">{error}</p>}
            {open && info?.description && <p className="lab-bar-steps">{info.description}</p>}
        </div>
    );
}
