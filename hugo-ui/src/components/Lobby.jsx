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
        <div className="screen">
            <div className="panel">
                <div className="panel-head">
                    <div className="tile-dots" aria-hidden="true"><span /><span /><span /><span /></div>
                    <h1 className="panel-title">Lobi</h1>
                    <p className="panel-sub">Hoş geldin, {player.name}. Bir masaya katıl ya da yenisini aç.</p>
                </div>

                <form className="field" onSubmit={handleCreateRoom}>
                    <label className="section-label" htmlFor="roomName">Yeni masa</label>
                    <div className="form-row">
                        <input
                            type="text"
                            id="roomName"
                            value={newRoomName}
                            maxLength={30}
                            placeholder="Örn. Cuma akşamı"
                            onChange={(e) => setNewRoomName(e.target.value)}
                            disabled={loading}
                        />
                        <button className="btn btn-primary" type="submit" disabled={loading}>
                            {loading ? 'Açılıyor…' : 'Masa aç'}
                        </button>
                    </div>
                </form>

                {error && <p className="form-error" role="alert">{error}</p>}

                <div className="field">
                    <span className="section-label">Açık masalar</span>
                    {rooms.length === 0 ? (
                        <p className="empty-note">Henüz açık masa yok. İlk masayı sen aç.</p>
                    ) : (
                        <ul className="room-list">
                            {rooms.map((room) => (
                                <li className="room-item" key={room.id}>
                                    <span className="room-name">{room.name}</span>
                                    <span className="room-count">{room.players.length}/{room.maxPlayers}</span>
                                    {room.status === 'waiting' ? (
                                        <button
                                            className="btn btn-ghost"
                                            onClick={() => handleJoinRoom(room.id)}
                                            disabled={loading || room.players.length >= room.maxPlayers}
                                        >
                                            {room.players.length >= room.maxPlayers ? 'Dolu' : 'Otur'}
                                        </button>
                                    ) : (
                                        <span className="room-count">{room.status === 'finished' ? 'bitti' : 'oyunda'}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Lobby; 