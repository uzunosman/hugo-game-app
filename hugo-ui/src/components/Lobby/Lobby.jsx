import { useState, useEffect, useCallback } from 'react';
import socketService from '../../services/socketService';
import { avatarFor, rememberAvatars } from '../../utils/avatar';
import ProfileDialog from './ProfileDialog';
import LabPanel from '../Lab/LabPanel';
import MiniTable from '../Social/MiniTable';
import SocialPanel from '../Social/SocialPanel';
import InviteCard from '../Social/InviteCard';
import AccountDialog from '../Social/AccountDialog';
import useSocial from '../../hooks/useSocial';
import { shareLink } from '../../utils/share';
import './Lobby.css';
import './Lobby2.css';

// iPhone / iPad Safari sayfaya tam ekran izni vermez; ana ekrana eklenen uygulama çubuksuz açılır
const IOS_TIP_KEY = 'hugo.iosTipHidden';
const showIosTip = () => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone || window.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches;
    try { return ios && !standalone && !localStorage.getItem(IOS_TIP_KEY); } catch { return ios && !standalone; }
};

const statusText = (room) => {
    if (room.status === 'playing' && room.game) {
        if (room.players.some(p => p.vacant)) return 'boş koltuk var';
        return `oynanıyor · ${room.game.round}. el`;
    }
    const free = room.maxPlayers - room.players.length;
    return free > 0 ? `${free} boş koltuk` : 'başlaması bekleniyor';
};
const canSit = (room) => (room.status === 'waiting' && room.players.length < room.maxPlayers)
    || (room.status === 'playing' && room.players.some(p => p.vacant));

// İlk ekran: hızlı oyna, masa aç, açık masalar (boş koltuğa dokunan oturur), arkadaşlar ve çevrimiçi oyuncular.
// Yatay ekranda üç sütun, dikey telefonda alt alta (Lobby2.css).
function Lobby({ player, onRegister, onJoinRoom, notice, joinTableNo, onJoinTableHandled }) {
    const [rooms, setRooms] = useState([]);
    const [error, setError] = useState(notice || '');
    const [loading, setLoading] = useState(false);
    const [pending, setPending] = useState(null); // ad/avatar bekleyen işlem: { kind: 'join', room } | { kind: 'create' } | { kind: 'quick' }
    const [iosTip, setIosTip] = useState(showIosTip);
    const [invite, setInvite] = useState(null);
    const [account, setAccount] = useState(false);
    const [shared, setShared] = useState('');
    const hideIosTip = () => { setIosTip(false); try { localStorage.setItem(IOS_TIP_KEY, '1'); } catch { /* depolama kapalı */ } };
    const social = useSocial(player?.id);
    useEffect(() => { if (notice) setError(notice); }, [notice]);

    useEffect(() => {
        const apply = (response) => { if (response?.success) setRooms(response.rooms); };
        const s = socketService.connect(); // lobi ilk ekran: alt bileşen efekti App'inkinden önce çalışır
        socketService.getRooms(apply);
        socketService.onRoomsList(apply);
        const onInvite = (d) => setInvite(d);
        s.on('invite:received', onInvite);
        return () => { s.off('rooms:list'); s.off('invite:received', onInvite); };
    }, []);

    rememberAvatars([...rooms.flatMap(r => r.players), player].filter(Boolean));

    const run = (action) => {
        setLoading(true);
        setError('');
        const done = (response) => {
            setLoading(false);
            setPending(null);
            if (response?.success) onJoinRoom(response.room, response.player);
            else setError(response?.error || 'İşlem yapılamadı');
        };
        if (action.kind === 'join') socketService.joinRoom(action.room.id, done);
        else if (action.kind === 'quick') socketService.quickPlay(done);
        else socketService.createRoom('', done);
    };

    // Kayıtlı değilse önce ad ve avatar sorulur, sonra işlem yapılır
    const request = useCallback((action) => (player ? run(action) : setPending(action)), [player]); // eslint-disable-line react-hooks/exhaustive-deps

    // Davet bağlantısıyla gelindi (?masa=101742): masa listesi gelince o masaya oturulur
    useEffect(() => {
        if (!joinTableNo || !rooms.length) return;
        const room = rooms.find(r => String(r.no) === String(joinTableNo));
        onJoinTableHandled?.();
        if (room && canSit(room)) request({ kind: 'join', room });
        else setError(room ? `${room.name} masasında boş koltuk kalmadı` : 'Davet edildiğin masa artık açık değil');
    }, [joinTableNo, rooms, request, onJoinTableHandled]);

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

    const acceptInvite = () => {
        const room = rooms.find(r => r.id === invite.room.id) || invite.room;
        setInvite(null);
        if (canSit(room)) request({ kind: 'join', room });
        else setError(`${room.name} masasında boş koltuk kalmadı`);
    };
    const dismissInvite = useCallback(() => setInvite(null), []);

    const callFriend = async () => {
        const r = await shareLink({ title: 'Hugo', text: "Hugo'da bir el atalım mı?", url: location.origin });
        setShared(r === 'copied' ? 'Bağlantı kopyalandı, arkadaşına gönder' : '');
    };

    const onlineCount = social.state?.onlineCount;

    return (
        <div className="lob">
            <header className="lob-head">
                <div className="lob-brand">
                    <span className="lob-dots" aria-hidden="true"><i /><i /><i /><i /></span>
                    <h1>Hugo</h1>
                </div>
                {onlineCount > 0 && <span className="lob-online"><i aria-hidden="true" />{onlineCount} kişi çevrimiçi</span>}
                <span className="lob-grow" />
                {player && (
                    <button type="button" className="lob-me" onClick={() => setAccount(true)} aria-label={`Hesabım: ${player.name}`}>
                        <img src={avatarFor(player.id)} alt="" />
                        <span>{player.name}</span>
                    </button>
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

            {error && !pending && <p className="lobby-error" role="alert">{error}</p>}
            <div className="lob-grid">
                <section className="lob-play" aria-label="Oyna">
                    <button type="button" className="lob-quick" onClick={() => request({ kind: 'quick' })} disabled={loading}>
                        <span className="lob-quick-num" aria-hidden="true">13</span>
                        <span className="lob-quick-dot" aria-hidden="true" />
                        <strong>Hızlı oyna</strong>
                        <span>3 yapay zekâyla hemen başla</span>
                    </button>
                    <div className="lob-play-row">
                        <button type="button" className="sbtn sbtn-amber" onClick={() => request({ kind: 'create' })} disabled={loading}>Masa aç</button>
                        <button type="button" className="sbtn sbtn-line" onClick={callFriend}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
                            Arkadaşını çağır
                        </button>
                    </div>
                    {shared && <p className="lob-note" role="status">{shared}</p>}
                </section>

                <section className="lob-tables" aria-labelledby="lob-tables-title">
                    <div className="lob-section-head">
                        <h2 id="lob-tables-title">Açık masalar</h2>
                        {rooms.length > 0 && <span>boş koltuğa dokun, otur</span>}
                    </div>
                    {rooms.length === 0 ? (
                        <p className="lob-empty">Şu an açık masa yok. Hızlı oyna ya da ilk masayı sen aç.</p>
                    ) : (
                        <ul className="lob-table-grid">
                            {rooms.map(room => (
                                <li key={room.id}>
                                    <MiniTable
                                        name={room.name}
                                        status={statusText(room)}
                                        voice={!!room.settings?.voice}
                                        playing={room.status === 'playing'}
                                        players={room.players}
                                        maxPlayers={room.maxPlayers}
                                        onSit={canSit(room) && !loading ? () => request({ kind: 'join', room }) : undefined}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <SocialPanel social={social} registered={!!player} />
            </div>

            <LabPanel />

            {pending && (
                <ProfileDialog
                    title={pending.kind === 'join' ? `${pending.room.name} masasına otur` : pending.kind === 'quick' ? 'Hızlı oyna' : 'Masa aç'}
                    busy={loading}
                    error={error}
                    onSubmit={handleProfile}
                    onCancel={() => { setPending(null); setError(''); }}
                />
            )}
            {invite && <InviteCard invite={invite} busy={loading} onAccept={acceptInvite} onDismiss={dismissInvite} />}
            {account && player && <AccountDialog player={player} onClose={() => setAccount(false)} />}
        </div>
    );
}

export default Lobby;
