import { useState, useEffect } from 'react';
import socketService from '../../services/socketService';
import { avatarFor, rememberAvatars } from '../../utils/avatar';
import ProfileDialog from './ProfileDialog';
import LabPanel from '../Lab/LabPanel';
import './Lobby.css';

// iPhone / iPad Safari sayfaya tam ekran izni vermez; ana ekrana eklenen uygulama çubuksuz açılır
const IOS_TIP_KEY = 'hugo.iosTipHidden';
const showIosTip = () => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone || window.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches;
    try { return ios && !standalone && !localStorage.getItem(IOS_TIP_KEY); } catch { return ios && !standalone; }
};

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
    const [pending, setPending] = useState(null);
    const [iosTip, setIosTip] = useState(showIosTip);
    const hideIosTip = () => { setIosTip(false); try { localStorage.setItem(IOS_TIP_KEY, '1'); } catch { /* depolama kapalı */ } }; // ad/avatar bekleyen işlem: { kind: 'join', room } | { kind: 'create', name }

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
                onJoinRoom(response.room, response.player);
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

            {iosTip && (
                <aside className="lobby-tip" aria-label="Tam ekran ipucu">
                    {/* Safari'nin Paylaş simgesi: kutudan çıkan ok */}
                    <svg className="lobby-tip-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
                        <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" />
                    </svg>
                    <div className="lobby-tip-text">
                        <strong>Tam ekran oyna</strong>
                        <span>Safari'de <b>Paylaş</b> düğmesine, sonra <b>Ana Ekrana Ekle</b>'ye dokun. Hugo'yu ana ekrandan açınca adres çubuğu ve sekmeler görünmez.</span>
                    </div>
                    <button type="button" className="lobby-tip-close" onClick={hideIosTip} aria-label="İpucunu kapat">×</button>
                </aside>
            )}

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

            <LabPanel />

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
                                    // Oyun sürerken boşaltılmış koltuk (yönetici kaldırdı): kısa süre yeni oyuncu bekler
                                    if (p?.vacant) {
                                        return (
                                            <div key={side} className={`chair chair-${side} is-empty`}>
                                                <button type="button" className="chair-sit" disabled={loading}
                                                    onClick={() => request({ kind: 'join', room })} aria-label={`${room.name} masasındaki boş koltuğa otur`}>+</button>
                                                <span className="chair-name">Otur</span>
                                            </div>
                                        );
                                    }
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
