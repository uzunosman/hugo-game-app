import { useState } from 'react';
import './Lab.css';
import socketService from '../../services/socketService';

// Staging (test.hugola.io): sunucu admin anahtarı olmayan bağlantıyı reddeder; anahtar bir kez girilir, tarayıcıda saklanır
export default function AdminGate({ retry }) {
    const [token, setToken] = useState('');
    const submit = (e) => {
        e.preventDefault();
        if (token.trim()) socketService.setAdminToken(token.trim());
    };
    return (
        <div className="screen">
            <form className="lab-gate" onSubmit={submit}>
                <h1>Test ortamı</h1>
                <p>Bu ortama yalnızca yöneticiler girebilir. Admin anahtarını gir.</p>
                {retry > 1 && <p className="lab-gate-error" role="alert">Anahtar kabul edilmedi.</p>}
                <label className="visually-hidden" htmlFor="labToken">Admin anahtarı</label>
                <input id="labToken" type="password" autoComplete="current-password" value={token} onChange={(e) => setToken(e.target.value)} autoFocus />
                <button className="btn btn-primary" type="submit">Gir</button>
            </form>
        </div>
    );
}
