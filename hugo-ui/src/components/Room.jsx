import { useState, useEffect } from 'react';
import socketService from '../services/socketService';
import Game from '../components/Game/Game';
import { avatarFor, rememberAvatars } from '../utils/avatar';
import RoundSummary from './RoundSummary/RoundSummary';
import useVoice from '../hooks/useVoice';
import './Voice/Voice.css';
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
    const allPlayersReady = currentRoom.players.length === currentRoom.maxPlayers &&
        currentRoom.players.every(p => p.isReady);

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

    const seats = Array.from({ length: currentRoom.maxPlayers }, (_, i) => currentRoom.players[i] || null);
    const waitingFor = currentRoom.maxPlayers - currentRoom.players.length;

    return (
        <div className="screen">
            {finalSummary}
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
                        <div key={p.id} className={`seat ${p.id === player.id ? 'me' : ''} ${voice.on && voice.isSpeaking(p.id) ? 'is-speaking' : ''}`}>
                            <img className="seat-avatar" src={avatarFor(p.id, p.isBot)} alt="" />
                            <span className="seat-text">
                                <span className="seat-name">{p.name}{p.id === player.id ? ' (sen)' : ''}</span>
                                <span className="seat-meta">
                                    {p.isBot && <span>yapay zekâ</span>}
                                    {p.id === currentRoom.owner.id && <span>masa sahibi</span>}
                                    {p.isReady ? <span className="seat-ready">hazır</span> : <span>bekliyor</span>}
                                </span>
                            </span>
                            {isOwner && !p.isBot && p.id !== player.id && (
                                <button type="button" className="seat-add seat-owner" onClick={() => handleTransferOwner(p.id)}>Sahipliği ver</button>
                            )}
                            {voice.on && !p.isBot && p.id !== player.id && (
                                <button type="button" className={`seat-mute ${voice.isMuted(p.id) ? 'is-muted' : ''}`} aria-pressed={voice.isMuted(p.id)}
                                    onClick={() => voice.mute(p.id, !voice.isMuted(p.id))}>{voice.isMuted(p.id) ? 'Sesini aç' : 'Sessize al'}</button>
                            )}
                            {p.isBot && isOwner && (
                                <button type="button" className="seat-remove" onClick={() => handleRemoveBot(p.id)} aria-label={`${p.name} masadan çıkar`}>×</button>
                            )}
                        </div>
                    ) : (
                        <div key={`empty-${i}`} className="seat empty">
                            <span className="seat-name">Boş koltuk</span>
                            {isOwner && (
                                <button type="button" className="seat-add" onClick={handleAddBot}>Yapay zekâ ekle</button>
                            )}
                        </div>
                    ))}
                </div>

                {voice.on && (
                    <div className="room-voice" role="group" aria-label="Sesli sohbet">
                        <span>Sesli sohbet</span>
                        <button type="button" className={`btn ${voice.mic ? 'btn-ready' : 'btn-ghost'}`} aria-pressed={voice.mic} disabled={voice.busy} onClick={voice.toggleMic}>
                            {voice.mic ? 'Mikrofon açık' : 'Mikrofonu aç'}
                        </button>
                        <button type="button" className={`btn ${voice.speaker ? 'btn-ready' : 'btn-ghost'}`} aria-pressed={voice.speaker} disabled={voice.busy} onClick={voice.toggleSpeaker}>
                            {voice.speaker ? 'Hoparlör açık' : 'Hoparlörü aç'}
                        </button>
                        {(voice.mic || voice.speaker) && <small>{voice.connected} oyuncuya bağlı</small>}
                    </div>
                )}
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