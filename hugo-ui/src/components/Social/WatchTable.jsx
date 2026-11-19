import { useCallback, useEffect, useRef, useState } from 'react';
import socketService from '../../services/socketService';
import Game from '../Game/Game';
import { rememberAvatars } from '../../utils/avatar';

// Masayı izle (lobiden): oyun ekranının kendisi, izlenen oyuncunun gözünden (eli, ıstaka dizilişi). Hiçbir şey dokunulmaz;
// çıkış ve tabela çalışır. Kapalı masada arkadaşın koltuğu, ziyarete açık masada ilk gerçek oyuncu. İzin bitince ya da masa
// kapanınca lobiye dönülür.
export default function WatchTable({ room: initial, onClose }) {
    const [room, setRoom] = useState(null);
    const [seatId, setSeatId] = useState(null);
    const closed = useRef(false);
    const close = useCallback((msg) => { if (closed.current) return; closed.current = true; onClose(msg || ''); }, [onClose]);
    const roomId = initial.id;

    useEffect(() => {
        const s = socketService.socket;
        s.emit('room:watch', { playerId: socketService.playerId, roomId }, (r) => {
            if (!r?.success) return close(r?.error || 'Masa izlenemiyor');
            const visible = r.masa.gorunur || [];
            const human = r.room.players.find(p => visible.includes(p.id) && !p.isBot);
            const seat = (human || r.room.players.find(p => visible.includes(p.id)))?.id;
            socketService.watching = { roomId, seatId: seat };
            setSeatId(seat);
            setRoom(r.room);
        });
        const update = (d) => { if (d?.room?.id === roomId) setRoom(d.room); };
        const events = ['player:joined', 'player:left', 'player:ready', 'game:started', 'room:reset'];
        events.forEach(e => s.on(e, update));
        const onClosed = (d) => { if (d?.roomId === roomId) close(`${initial.name} masası kapandı`); };
        s.on('room:closed', onClosed);
        // İzin sürüyor mu (arkadaşlık bitti / ziyarete kapandı)
        const check = setInterval(() => s.emit('room:watchState', { playerId: socketService.playerId }, (r) => {
            if (!r?.success) close(r?.error || 'Masa artık izlenemiyor');
        }), 15000);
        return () => {
            events.forEach(e => s.off(e, update));
            s.off('room:closed', onClosed);
            clearInterval(check);
            socketService.watching = null;
            s.emit('room:unwatch', {});
        };
    }, [roomId, initial.name, close]);

    if (!room || !seatId) return <div className="screen"><p className="screen-note">Masa açılıyor…</p></div>;
    rememberAvatars(room.players);
    const seat = room.players.find(p => p.id === seatId);
    if (room.status !== 'playing' || !room.game || !seat) {
        return (
            <div className="screen">
                <div className="sdialog">
                    <h2 style={{ margin: 0 }}>{room.name}</h2>
                    <p>Bu masada oyun henüz başlamadı. Başlayınca burada {seat?.name || 'oyuncunun'} gözünden izlersin.</p>
                    <button type="button" className="sbtn sbtn-line-dark" onClick={() => close('')}>Lobiye dön</button>
                </div>
            </div>
        );
    }
    return <Game key={room.game.id} player={seat} room={room} spectator onExit={() => close('')} onGameFinished={() => {}} onLeaveTable={() => {}} />;
}
