import { useState, useEffect } from 'react';
import socketService from '../services/socketService';

function Lobby({ player, onJoinRoom }) {
    const [rooms, setRooms] = useState([]);
    const [newRoomName, setNewRoomName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Oda listesini al
        socketService.getRooms((response) => {
            if (response.success) {
                setRooms(response.rooms);
            }
        });

        // Oda listesi güncellemelerini dinle
        socketService.onRoomsList((response) => {
            if (response.success) {
                setRooms(response.rooms);
            }
        });

        return () => {
            // Component unmount olduğunda event listener'ları temizle
            socketService.socket.off('rooms:list');
        };
    }, []);

    const handleCreateRoom = (e) => {
        e.preventDefault();

        if (!newRoomName.trim()) {
            setError('Lütfen bir oda adı girin');
            return;
        }

        setLoading(true);
        setError('');

        socketService.createRoom(newRoomName, (response) => {
            setLoading(false);

            if (response.success) {
                onJoinRoom(response.room);
            } else {
                setError(response.error || 'Oda oluşturulurken bir hata oluştu');
            }
        });
    };

    const handleJoinRoom = (roomId) => {
        setLoading(true);
        setError('');

        socketService.joinRoom(roomId, (response) => {
            setLoading(false);

            if (response.success) {
                onJoinRoom(response.room);
            } else {
                setError(response.error || 'Odaya katılırken bir hata oluştu');
            }
        });
    };

    return (
        <div>
            <h2>Hugo Oyunu - Lobi</h2>
            <p>Hoş geldin, {player.name}!</p>

            {error && <p style={{ color: 'red' }}>{error}</p>}

            <div>
                <h3>Yeni Oda Oluştur</h3>
                <form onSubmit={handleCreateRoom}>
                    <div>
                        <label htmlFor="roomName">Oda Adı:</label>
                        <input
                            type="text"
                            id="roomName"
                            value={newRoomName}
                            onChange={(e) => setNewRoomName(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    <button type="submit" disabled={loading}>
                        {loading ? 'Oluşturuluyor...' : 'Oda Oluştur'}
                    </button>
                </form>
            </div>

            <div>
                <h3>Mevcut Odalar</h3>
                {rooms.length === 0 ? (
                    <p>Henüz oda bulunmuyor.</p>
                ) : (
                    <ul>
                        {rooms.map((room) => (
                            <li key={room.id}>
                                {room.name} ({room.players.length}/{room.maxPlayers})
                                {room.status === 'waiting' && (
                                    <button
                                        onClick={() => handleJoinRoom(room.id)}
                                        disabled={loading || room.players.length >= room.maxPlayers}
                                    >
                                        Katıl
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default Lobby; 