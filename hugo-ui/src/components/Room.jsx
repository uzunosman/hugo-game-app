import { useState, useEffect } from 'react';
import socketService from '../services/socketService';
import Game from '../components/Game/Game';

function Room({ player, room, onLeaveRoom }) {
    const [currentRoom, setCurrentRoom] = useState(room);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Oyuncu katılma olayını dinle
        socketService.onPlayerJoined((response) => {
            if (response.success) {
                setCurrentRoom(response.room);
            }
        });

        // Oyuncu ayrılma olayını dinle
        socketService.onPlayerLeft((response) => {
            if (response.success) {
                setCurrentRoom(response.room);
            }
        });

        // Oyuncu hazır olma olayını dinle
        socketService.onPlayerReady((response) => {
            if (response.success) {
                setCurrentRoom(response.room);
            }
        });

        // Oyun başlama olayını dinle
        socketService.onGameStarted((response) => {
            if (response.success) {
                setCurrentRoom(response.room);
            }
        });

        return () => {
            // Component unmount olduğunda event listener'ları temizle
            socketService.socket.off('player:joined');
            socketService.socket.off('player:left');
            socketService.socket.off('player:ready');
            socketService.socket.off('game:started');
        };
    }, []);

    const handleLeaveRoom = () => {
        setLoading(true);
        setError('');

        socketService.leaveRoom(currentRoom.id, (response) => {
            setLoading(false);

            if (response.success) {
                onLeaveRoom();
            } else {
                setError(response.error || 'Odadan ayrılırken bir hata oluştu');
            }
        });
    };

    const handleToggleReady = () => {
        setLoading(true);
        setError('');

        socketService.setReady(currentRoom.id, !isReady, (response) => {
            setLoading(false);

            if (!response.success) {
                setError(response.error || 'Hazır durumu değiştirilirken bir hata oluştu');
            }
        });
    };

    const handleStartGame = () => {
        setLoading(true);
        setError('');

        socketService.startGame(currentRoom.id, (response) => {
            setLoading(false);

            if (!response.success) {
                setError(response.error || 'Oyun başlatılırken bir hata oluştu');
            }
        });
    };

    const isOwner = currentRoom.owner.id === player.id;
    const isReady = !!currentRoom.players.find(p => p.id === player.id)?.isReady;
    const allPlayersReady = currentRoom.players.length === currentRoom.maxPlayers &&
        currentRoom.players.every(p => p.isReady);

    // Eğer oyun başladıysa, Game bileşenini göster
    if (currentRoom.status === 'playing' && currentRoom.game) {
        return <Game player={player} room={currentRoom} onLeaveRoom={handleLeaveRoom} />;
    }

    const seats = Array.from({ length: currentRoom.maxPlayers }, (_, i) => currentRoom.players[i] || null);
    const waitingFor = currentRoom.maxPlayers - currentRoom.players.length;

    return (
        <div className="screen">
            <div className="panel">
                <div className="panel-head">
                    <div className="tile-dots" aria-hidden="true"><span /><span /><span /><span /></div>
                    <h1 className="panel-title">{currentRoom.name}</h1>
                    <p className="panel-sub">
                        {waitingFor > 0
                            ? `${waitingFor} oyuncu daha bekleniyor.`
                            : allPlayersReady ? 'Herkes hazır.' : 'Masa dolu, herkesin hazır olması bekleniyor.'}
                    </p>
                </div>

                <div className="seat-grid">
                    {seats.map((p, i) => p ? (
                        <div key={p.id} className={`seat ${p.id === player.id ? 'me' : ''}`}>
                            <span className="seat-name">{p.name}{p.id === player.id ? ' (sen)' : ''}</span>
                            <span className="seat-meta">
                                {p.id === currentRoom.owner.id && <span>masa sahibi</span>}
                                {p.isReady ? <span className="seat-ready">hazır</span> : <span>bekliyor</span>}
                            </span>
                        </div>
                    ) : (
                        <div key={`empty-${i}`} className="seat empty">
                            <span className="seat-name">Boş koltuk</span>
                        </div>
                    ))}
                </div>

                {error && <p className="form-error" role="alert">{error}</p>}

                <div className="panel-actions">
                    <button className={`btn ${isReady ? 'btn-ghost' : 'btn-ready'}`} onClick={handleToggleReady} disabled={loading}>
                        {isReady ? 'Hazır değilim' : 'Hazırım'}
                    </button>
                    {isOwner && (
                        <button
                            className="btn btn-primary"
                            onClick={handleStartGame}
                            disabled={loading || !allPlayersReady}
                        >
                            Oyunu başlat
                        </button>
                    )}
                    <button className="btn btn-ghost" onClick={handleLeaveRoom} disabled={loading}>
                        Masadan kalk
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Room; 