import { useState, useEffect } from 'react';
import socketService from '../services/socketService';
import Game from './Game';

function Room({ player, room, onLeaveRoom }) {
    const [currentRoom, setCurrentRoom] = useState(room);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [isReady, setIsReady] = useState(false);

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

            if (response.success) {
                setIsReady(!isReady);
            } else {
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
    const allPlayersReady = currentRoom.players.length === currentRoom.maxPlayers &&
        currentRoom.players.every(p => p.isReady);

    // Eğer oyun başladıysa, Game bileşenini göster
    if (currentRoom.status === 'playing' && currentRoom.game) {
        return <Game player={player} room={currentRoom} />;
    }

    return (
        <div>
            <h2>Oda: {currentRoom.name}</h2>
            {error && <p style={{ color: 'red' }}>{error}</p>}

            <div>
                <h3>Oyuncular</h3>
                <ul>
                    {currentRoom.players.map((p) => (
                        <li key={p.id}>
                            {p.name} {p.id === player.id ? '(Sen)' : ''}
                            {p.id === currentRoom.owner.id ? ' (Oda Sahibi)' : ''}
                            {p.isReady ? ' ✓' : ''}
                        </li>
                    ))}
                </ul>
            </div>

            <div>
                <button onClick={handleToggleReady} disabled={loading}>
                    {isReady ? 'Hazır Değil' : 'Hazır'}
                </button>

                {isOwner && (
                    <button
                        onClick={handleStartGame}
                        disabled={loading || !allPlayersReady || currentRoom.players.length !== currentRoom.maxPlayers}
                    >
                        Oyunu Başlat
                    </button>
                )}

                <button onClick={handleLeaveRoom} disabled={loading}>
                    Odadan Ayrıl
                </button>
            </div>
        </div>
    );
}

export default Room; 