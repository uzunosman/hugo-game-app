import { useState } from 'react';
import socketService from '../services/socketService';

function Login({ onLogin }) {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!name.trim()) {
            setError('Lütfen bir isim girin');
            return;
        }

        setLoading(true);
        setError('');

        socketService.connect();

        // Oyuncu kaydı yap
        socketService.registerPlayer(name, (response) => {
            setLoading(false);

            if (response.success) {
                onLogin(response.player);
            } else {
                setError(response.error || 'Giriş yapılırken bir hata oluştu');
            }
        });
    };

    return (
        <div className="screen">
            <div className="panel">
                <div className="panel-head">
                    <div className="tile-dots" aria-hidden="true"><span /><span /><span /><span /></div>
                    <h1 className="panel-title">Hugo</h1>
                    <p className="panel-sub">4 kişilik masa, 9 el. En az puanla bitiren kazanır.</p>
                </div>

                <form className="field" onSubmit={handleSubmit}>
                    <label className="section-label" htmlFor="name">Masadaki adın</label>
                    <div className="form-row">
                        <input
                            type="text"
                            id="name"
                            value={name}
                            maxLength={20}
                            autoFocus
                            autoComplete="nickname"
                            onChange={(e) => setName(e.target.value)}
                            disabled={loading}
                        />
                        <button className="btn btn-primary" type="submit" disabled={loading}>
                            {loading ? 'Giriliyor…' : 'Masaya otur'}
                        </button>
                    </div>
                    {error && <p className="form-error" role="alert">{error}</p>}
                </form>
            </div>
        </div>
    );
}

export default Login; 