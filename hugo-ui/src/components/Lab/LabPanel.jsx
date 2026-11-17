import { useEffect, useState } from 'react';
import './Lab.css';
import socketService from '../../services/socketService';

// Lobi: test senaryoları (yalnızca staging / yerel ve admin anahtarıyla; sunucu reddederse hiç görünmez)
export default function LabPanel() {
    const [list, setList] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState('');
    useEffect(() => {
        socketService.labScenarios((r) => { if (r?.success) setList(r.scenarios); });
    }, []);
    if (!list) return null;
    const start = (id) => {
        setBusy(id);
        setError('');
        socketService.labStart(id, (r) => { setBusy(''); if (!r?.success) setError(r?.error || 'Senaryo başlatılamadı'); });
    };
    return (
        <section className="lab-panel" aria-labelledby="lab-title">
            <h2 id="lab-title">Test senaryoları</h2>
            {error && <p className="lobby-error" role="alert">{error}</p>}
            <ul>
                {list.map(s => (
                    <li key={s.id}>
                        <div>
                            <b>{s.title || s.id}</b>
                            {s.description && <p>{s.description}</p>}
                        </div>
                        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => start(s.id)}>
                            {busy === s.id ? 'Kuruluyor…' : 'Başlat'}
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
