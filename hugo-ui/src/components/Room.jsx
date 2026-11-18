import { useState, useEffect } from 'react';
import socketService from '../services/socketService';
import Game from '../components/Game/Game';
import { avatarFor, rememberAvatars } from '../utils/avatar';
import RoundSummary from './RoundSummary/RoundSummary';
import useVoice from '../hooks/useVoice';
import './Voice/Voice.css';
import useSocial from '../hooks/useSocial';
import SocialPanel from './Social/SocialPanel';
import { shareLink } from '../utils/share';
import './Social/Social.css';
import './Waiting.css';
// Dokunmatik telefonda oyun yatay oynanır: Hazırım / Oyunu başlat dokunuşu tam ekran + yatay kilidi de ister
import { enterLandscape, isTouchPhone } from '../utils/orientation';

function Room({ player, room, onLeaveRoom }) {
    const [currentRoom, setCurrentRoom] = useState(room);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    // Son oyunun tabelası: yeni oyun başlasa da oyuncu kapatana kadar açık kalır
    const [finalResults, setFinalResults] = useState(null);
    // Sesli sohbet: bekleme ekranında başlar, oyunda kesilmeden sürer
    const voice = useVoice(currentRoom, player.id, setError);
    const social = useSocial(player.id);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [invited, setInvited] = useState({}); // çağrılan profiller (düğme "Çağrıldı" olur)
    const [renaming, setRenaming] = useState(null); // masa adı düzenleniyor: yazılan ad
    const [note, setNote] = useState('');

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

        // Oyun bitti: masa oda ekranına döner, yeni oyun için herkes yeniden hazır olur
        socketService.socket.on('room:reset', (response) => {
            if (response?.success) setCurrentRoom(response.room);
        });

        // Oyun başlama olayını dinle
        socketService.onGameStarted((response) => {
            if (response.success) {
                setCurrentRoom(response.room);
            }
        });

        // Masa kapatıldı (arşivlendi): lobiye dön, nedenini göster
        socketService.onRoomClosed((data) => onLeaveRoom(null, `“${room.name}” masası kapatıldı: ${data?.reason || ''}`.trim()));
        // Yönetici masadan çıkardı: lobiye dön (oyundaysa yeni kimlikle)
        socketService.onKicked((data) => onLeaveRoom(data?.player || null, `“${room.name}” masasından çıkarıldın${data?.reason ? `: ${data.reason}` : ''}`));

        return () => {
            // Component unmount olduğunda event listener'ları temizle
            socketService.offRoomClosed();
            socketService.offKicked();
            socketService.socket.off('player:joined');
            socketService.socket.off('player:left');
            socketService.socket.off('player:ready');
            socketService.socket.off('game:started');
            socketService.socket.off('room:reset');
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

    // Oyun sürerken masadan kalk: koltuğa yapay zekâ geçer, oyuncu yeni kimlikle lobiye döner
    const handleLeaveTable = (done) => {
        socketService.leaveTable(currentRoom.id, (response) => {
            if (response?.success) onLeaveRoom(response.player);
            else done(response?.error || 'Masadan kalkılamadı');
        });
    };

    const handleToggleReady = () => {
        if (!isReady && isTouchPhone()) enterLandscape();
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
        if (isTouchPhone()) enterLandscape();
        setLoading(true);
        setError('');

        socketService.startGame(currentRoom.id, (response) => {
            setLoading(false);

            if (!response.success) {
                setError(response.error || 'Oyun başlatılırken bir hata oluştu');
            }
        });
    };

    // Yapay zekâ ekle / çıkar: yalnızca masa sahibi; sunucu odayı player:joined / left ile günceller
    const handleAddBot = () => {
        setError('');
        socketService.addBot(currentRoom.id, (response) => {
            if (response?.success) setCurrentRoom(response.room);
            else setError(response?.error || 'Yapay zekâ eklenemedi');
        });
    };
    // Masa sahipliğini masadaki başka bir oyuncuya ver (yapay zekâya verilemez)
    const handleTransferOwner = (targetId) => {
        setError('');
        socketService.transferOwner(currentRoom.id, targetId, (response) => {
            if (response?.success) setCurrentRoom(response.room);
            else setError(response?.error || 'Sahiplik devredilemedi');
        });
    };
    const handleRemoveBot = (botId) => {
        setError('');
        socketService.removeBot(currentRoom.id, botId, (response) => {
            if (response?.success) setCurrentRoom(response.room);
            else setError(response?.error || 'Yapay zekâ çıkarılamadı');
        });
    };

    rememberAvatars(currentRoom.players);
    const isOwner = currentRoom.owner.id === player.id;
    const isReady = !!currentRoom.players.find(p => p.id === player.id)?.isReady;
    // Masa sahibi kendiliğinden hazır
    const allPlayersReady = currentRoom.players.length === currentRoom.maxPlayers &&
        currentRoom.players.every(p => p.isReady || p.id === currentRoom.owner.id);

    // Oyun sonu tabelası: oda ekranına dönülse de oyuncu kapatana kadar açık kalır
    const finalSummary = finalResults && (
        <RoundSummary
            roundData={finalResults}
            isLastRound={true}
            onClose={() => setFinalResults(null)}
            onLeave={handleLeaveRoom}
        />
    );

    // Eğer oyun başladıysa, Game bileşenini göster
    if (currentRoom.status === 'playing' && currentRoom.game) {
        // Aynı masada yeni oyun başlayınca (oyun id'si değişir) oyun ekranı baştan kurulur
        return (
            <>
                <Game key={currentRoom.game.id} player={player} room={currentRoom} onGameFinished={setFinalResults} onLeaveTable={handleLeaveTable} voice={voice} />
                {finalSummary}
            </>
        );
    }

    const tableLink = `${location.origin}/?masa=${currentRoom.no}`;
    const shareTable = async () => {
        const r = await shareLink({ title: `Hugo · ${currentRoom.name}`, text: `${currentRoom.name} masasına gel, bir el atalım`, url: tableLink });
        setNote(r === 'copied' ? 'Masa bağlantısı kopyalandı, arkadaşına gönder' : r === 'failed' ? tableLink : '');
    };
    const saveName = () => {
        const name = (renaming || '').trim();
        if (!name || name === currentRoom.name) { setRenaming(null); return; }
        socketService.renameRoom(currentRoom.id, name, (r) => {
            if (r?.success) { setCurrentRoom(r.room); setRenaming(null); } else setError(r?.error || 'Ad değiştirilemedi');
        });
    };
    const inviteProfile = (p) => socketService.invite(p.id, (r) => {
        if (r?.success) { setInvited(m => ({ ...m, [p.id]: true })); setNote(`${p.name} çağrıldı`); }
        else setError(r?.error || 'Çağrılamadı');
    });

    // Koltuklar masanın etrafında: ben altta, sonra oyun sırasıyla sağ, üst, sol
    const myIndex = Math.max(0, currentRoom.players.findIndex(p => p.id === player.id));
    const SIDES = ['bottom', 'right', 'top', 'left'];
    const seats = SIDES.map((side, k) => ({ side, p: currentRoom.players[(myIndex + k) % currentRoom.maxPlayers] || null }));
    const friendIds = new Set(social.state?.friends.map(f => f.id) || []);
    const requestedIds = new Set(social.state?.online.filter(o => o.requested).map(o => o.id) || []);
    const myProfile = social.state?.me?.id;
    const waitingFor = currentRoom.maxPlayers - currentRoom.players.length;

    return (
        <div className="wait">
            {finalSummary}
            <header className="wait-head">
                <button type="button" className="wait-icon" onClick={handleLeaveRoom} disabled={loading} aria-label="Masadan kalk, lobiye dön">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                {renaming !== null ? (
                    <form className="wait-rename" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
                        <label className="visually-hidden" htmlFor="tableName">Masanın adı</label>
                        <input id="tableName" value={renaming} maxLength={30} autoFocus onChange={(e) => setRenaming(e.target.value)} onBlur={saveName} />
                    </form>
                ) : (
                    <h1>{currentRoom.name}</h1>
                )}
                {isOwner && renaming === null && (
                    <button type="button" className="wait-icon is-quiet" onClick={() => setRenaming(currentRoom.name)} aria-label="Masanın adını değiştir">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>
                    </button>
                )}
                <span className="wait-sub">#{currentRoom.no} · {waitingFor > 0 ? `${waitingFor} oyuncu daha bekleniyor` : allPlayersReady ? 'herkes hazır' : 'herkesin hazır olması bekleniyor'}</span>
                <span className="lob-grow" />
                <button type="button" className="sbtn sbtn-line wait-share" onClick={shareTable}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
                    <span>Bağlantıyı paylaş</span>
                </button>
            </header>

            <div className="wait-body">
                <section className="wait-felt" aria-label="Masa">
                    <div className="wait-center" aria-hidden="true">
                        <span className="wait-tiles"><i>H</i><i>U</i><i>G</i><i>O</i></span>
                        <small>9 el{currentRoom.settings?.assisted ? ' · yardımlı' : ''}</small>
                    </div>
                    {seats.map(({ side, p }) => (
                        <div key={side} className={`wait-seat wait-${side}`}>
                            {p ? (
                                <>
                                    <span className={`wait-av ${voice.on && voice.isSpeaking(p.id) ? 'is-speaking' : ''}`}>
                                        <img src={avatarFor(p.id, p.isBot)} alt="" />
                                        {voice.on && voice.isMuted(p.id) && <i className="wait-muted" aria-hidden="true">✕</i>}
                                    </span>
                                    <span className="wait-name">
                                        {p.name}{p.id === player.id ? ' (sen)' : ''}{p.id === currentRoom.owner.id ? ' ★' : ''}
                                        <small className={p.isReady || p.id === currentRoom.owner.id ? 'is-ready' : ''}>
                                            {p.isBot ? 'yapay zekâ' : p.isReady || p.id === currentRoom.owner.id ? 'hazır' : 'bekliyor'}
                                        </small>
                                    </span>
                                    <span className="wait-seat-actions">
                                        {voice.on && !p.isBot && p.id !== player.id && (
                                            <button type="button" className="sbtn sbtn-quiet sbtn-sm" aria-pressed={voice.isMuted(p.id)} onClick={() => voice.mute(p.id, !voice.isMuted(p.id))}>
                                                {voice.isMuted(p.id) ? 'Sesini aç' : 'Sessize al'}
                                            </button>
                                        )}
                                        {!p.isBot && p.profileId && myProfile && p.profileId !== myProfile && !friendIds.has(p.profileId) && (
                                            <button type="button" className="sbtn sbtn-quiet sbtn-sm" disabled={requestedIds.has(p.profileId)} onClick={() => social.request(p.profileId)}>
                                                {requestedIds.has(p.profileId) ? 'İstek gitti' : 'Arkadaş ekle'}
                                            </button>
                                        )}
                                        {isOwner && !p.isBot && p.id !== player.id && (
                                            <button type="button" className="sbtn sbtn-quiet sbtn-sm" onClick={() => handleTransferOwner(p.id)}>Sahipliği ver</button>
                                        )}
                                        {isOwner && p.isBot && (
                                            <button type="button" className="sbtn sbtn-quiet sbtn-sm" onClick={() => handleRemoveBot(p.id)} aria-label={`${p.name} masadan çıkar`}>Çıkar</button>
                                        )}
                                    </span>
                                </>
                            ) : (
                                <span className="wait-empty">
                                    <button type="button" className="wait-invite" onClick={() => setInviteOpen(true)}>+ Davet et</button>
                                    {isOwner && <button type="button" className="sbtn sbtn-quiet sbtn-sm" onClick={handleAddBot}>Yapay zekâ</button>}
                                </span>
                            )}
                        </div>
                    ))}
                </section>

                <aside className="wait-side">
                    {currentRoom.settings?.voice && (
                        <section className="wait-box" aria-label="Sesli sohbet">
                            <div className="wait-box-head">
                                <h2>Sesli sohbet</h2>
                                {voice.on && (voice.mic || voice.speaker) && <small className="is-on">{voice.connected} kişiye bağlı</small>}
                            </div>
                            {voice.on ? (
                                <div className="wait-voice">
                                    <button type="button" className={`sbtn ${voice.mic ? 'sbtn-amber' : 'sbtn-quiet'}`} aria-pressed={voice.mic} disabled={voice.busy} onClick={voice.toggleMic}>
                                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />{!voice.mic && <path d="M4 4l16 16" />}</svg>
                                        {voice.mic ? 'Açık' : 'Kapalı'}
                                    </button>
                                    <button type="button" className={`sbtn ${voice.speaker ? 'sbtn-amber' : 'sbtn-quiet'}`} aria-pressed={voice.speaker} disabled={voice.busy} onClick={voice.toggleSpeaker}>
                                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" />{voice.speaker ? <path d="M16.5 8.5a5 5 0 0 1 0 7" /> : <path d="M17 9l4 6M21 9l-4 6" />}</svg>
                                        {voice.speaker ? 'Açık' : 'Kapalı'}
                                    </button>
                                    <small className="wait-voice-labels"><span>mikrofon</span><span>hoparlör</span></small>
                                </div>
                            ) : <p>En az 2 gerçek oyuncu oturunca açılır.</p>}
                        </section>
                    )}
                    <section className="wait-box">
                        <label className="wait-opt">
                            <input type="checkbox" checked={!!currentRoom.settings?.voice} disabled={!isOwner}
                                onChange={(e) => socketService.setVoice(currentRoom.id, e.target.checked, (r) => {
                                    if (r?.success) setCurrentRoom(r.room); else setError(r?.error || 'Sesli sohbet ayarlanamadı');
                                })} />
                            Sesli sohbet
                        </label>
                        {!isOwner && <p>Ayarları masa sahibi değiştirir.</p>}
                    </section>

                    {error && <p className="wait-error" role="alert">{error}</p>}
                    {note && <p className="wait-note" role="status">{note}</p>}
                    <span className="lob-grow" />
                    {isOwner ? (
                        <>
                            {!allPlayersReady && <small className="wait-hint">{waitingFor > 0 ? 'Boş koltuklara davet et ya da yapay zekâ ekle.' : 'Diğerleri hazır olunca başlatabilirsin.'}</small>}
                            <button className="sbtn sbtn-go wait-main" onClick={handleStartGame} disabled={loading || !allPlayersReady}>Oyunu başlat</button>
                        </>
                    ) : (
                        <button className={`sbtn wait-main ${isReady ? 'sbtn-quiet' : 'sbtn-go'}`} onClick={handleToggleReady} disabled={loading}>
                            {isReady ? 'Hazır değilim' : 'Hazırım'}
                        </button>
                    )}
                </aside>
            </div>

            {inviteOpen && (
                <div className="sdialog-back" onClick={() => setInviteOpen(false)}>
                    <section className="wait-invite-sheet" role="dialog" aria-modal="true" aria-label="Masaya davet et" onClick={(e) => e.stopPropagation()}>
                        <div className="wait-box-head">
                            <h2>Masaya davet et</h2>
                            <button type="button" className="wait-icon is-quiet" onClick={() => setInviteOpen(false)} aria-label="Kapat">×</button>
                        </div>
                        <button type="button" className="sbtn sbtn-amber" onClick={shareTable}>Bağlantıyı paylaş (WhatsApp vb.)</button>
                        {note && <p className="wait-note" role="status">{note}</p>}
                        <SocialPanel social={social} registered onInvite={inviteProfile} invited={invited} compact />
                    </section>
                </div>
            )}
        </div>
    );
}

export default Room;
