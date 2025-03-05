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

        // Socket bağlantısını kur
        const socket = socketService.connect();

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
        <div>
            <h2>Hugo Oyunu - Giriş</h2>
            {error && <p style={{ color: 'red' }}>{error}</p>}

            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="name">İsminiz:</label>
                    <input
                        type="text"
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={loading}
                    />
                </div>

                <button type="submit" disabled={loading}>
                    {loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
                </button>
            </form>
        </div>
    );
}

export default Login; 