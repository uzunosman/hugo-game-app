import { useState, useEffect } from 'react';
import socketService from '../../services/socketService';
import { avatarFor, rememberAvatars } from '../../utils/avatar';
import ProfileDialog from './ProfileDialog';
import './Lobby.css';

const SIDES = ['bottom', 'right', 'top', 'left']; // koltuk sırası = oyun sırası, masanın etrafında

const statusText = (room) => {
    if (room.status === 'playing' && room.game) {
        return `${room.game.round}. el${room.game.isHugoRound ? ', Hugo eli' : ''}`;
    }
    const free = room.maxPlayers - room.players.length;
    return free > 0 ? `${free} boş koltuk` : 'Masa dolu, başlaması bekleniyor';
};

// İlk ekran: masalar ve oturanlar herkese görünür; boş koltuğa tıklayan ad ve avatar seçip oturur
function Lobby({ player, onRegister, onJoinRoom, notice }) {
    const [rooms, setRooms] = useState([]);
    const [newRoomName, setNewRoomName] = useState('');
    const [error, setError] = useState(notice || '');
    const [loading, setLoading] = useState(false);
    const [pending, setPending] = useState(null); // ad/avatar bekleyen işlem: { kind: 'join', room } | { kind: 'create', name }

    useEffect(() => {
        const apply = (response) => { if (response?.success) setRooms(response.rooms); };
        socketService.connect(); // lobi ilk ekran: alt bileşen efekti App'inkinden önce çalışır
        socketService.getRooms(apply);
        socketService.onRoomsList(apply);
        return () => socketService.socket.off('rooms:list');
    }, []);

    rememberAvatars([...rooms.flatMap(r => r.players), player]);

    const run = (action) => {
        setLoading(true);
        setError('');
        const done = (response) => {
            setLoading(false);
            if (response.success) {
                setPending(null);
                onJoinRoom(response.room);
            } else {
                setError(response.error || 'İşlem yapılamadı');
                setPending(null);
            }
        };
        if (action.kind === 'join') socketService.joinRoom(action.room.id, done);
        else socketService.createRoom(action.name, done);
    };

    // Kayıtlı değilse önce ad ve avatar sorulur, sonra işlem yapılır
    const request = (action) => (player ? run(action) : setPending(action));

    const handleProfile = (name, avatar) => {
        setLoading(true);
        setError('');
        socketService.registerPlayer(name, avatar, (response) => {
            if (!response.success) {
                setLoading(false);
                setError(response.error || 'Oturulamadı');
                return;
            }
            onRegister(response.player);
            run(pending);
        });
    };

    const handleCreateRoom = (e) => {
        e.preventDefault();
        const name = newRoomName.trim();
        if (!name) { setError('Masaya bir ad ver'); return; }
        request({ kind: 'create', name });
    };

    return (
        <div className="lobby">
            <header className="lobby-head">
                <div className="lobby-brand">
                    <div className="tile-dots" aria-hidden="true"><span /><span /><span /><span /></div>
                    <h1 className="lobby-title">Hugo</h1>
                    <p className="lobby-sub">4 kişilik masa, 9 el. En az puanla bitiren kazanır.</p>
                </div>
                {player && (
                    <div className="lobby-me">
                        <img src={avatarFor(player.id)} alt="" />
                        <span>{player.name}</span>
                    </div>
                )}
            </header>

            <form className="lobby-create" onSubmit={handleCreateRoom}>
                <label className="visually-hidden" htmlFor="roomName">Yeni masanın adı</label>
                <input
                    type="text"
                    id="roomName"
                    value={newRoomName}
                    maxLength={30}
                    placeholder="Yeni masanın adı, örn. Cuma akşamı"
                    onChange={(e) => setNewRoomName(e.target.value)}
                    disabled={loading}
                />
                <button className="btn btn-primary" type="submit" disabled={loading}>Masa aç</button>
            </form>

            {error && !pending && <p className="lobby-error" role="alert">{error}</p>}

            {rooms.length === 0 ? (
                <p className="lobby-empty">Şu an açık masa yok. Bir ad yazıp ilk masayı sen aç.</p>
            ) : (
                <ul className="table-grid">
                    {rooms.map(room => {
                        const canSit = room.status === 'waiting' && room.players.length < room.maxPlayers;
                        const playing = room.status === 'playing';
                        return (
                            <li key={room.id} className={`lobby-table ${playing ? 'is-playing' : ''}`}>
                                <div className="felt">
                                    <div className="felt-info">
                                        <span className="felt-name">{room.name}</span>
                                        <span className="felt-status">{statusText(room)}</span>
                                    </div>
                                </div>
                                {SIDES.map((side, i) => {
                                    const p = room.players[i];
                                    if (p) {
                                        return (
                                            <div key={side} className={`chair chair-${side} ${p.connected === false ? 'is-away' : ''}`}>
                                                <img src={avatarFor(p.id, p.isBot)} alt="" />
                                                <span className="chair-name">
                                                    {p.name}
                                                    {p.id === room.owner?.id && <span className="chair-owner" title="Masa sahibi" aria-label="masa sahibi"> ★</span>}
                                                </span>
                                            </div>
                                        );
                                    }
                                    // Boş koltuk: sıradaki boş yere oturulur (oyun sırası koltuk sırasıdır)
                                    return (
                                        <div key={side} className={`chair chair-${side} is-empty`}>
                                            <button
                                                type="button"
                                                className="chair-sit"
                                                disabled={!canSit || loading}
                                                onClick={() => request({ kind: 'join', room })}
                                                aria-label={`${room.name} masasına otur`}
                                            >
                                                +
                                            </button>
                                            <span className="chair-name">{canSit ? 'Otur' : 'Boş'}</span>
                                        </div>
                                    );
                                })}
                            </li>
                        );
                    })}
                </ul>
            )}

            {pending && (
                <ProfileDialog
                    title={pending.kind === 'join' ? `${pending.room.name} masasına otur` : `${pending.name} masasını aç`}
                    busy={loading}
                    error={error}
                    onSubmit={handleProfile}
                    onCancel={() => { setPending(null); setError(''); }}
                />
            )}
        </div>
    );
}

export default Lobby;
