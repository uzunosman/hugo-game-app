import { useEffect, useState } from 'react';
import { avatarFromSeed, rememberAvatars } from '../../utils/avatar';
import MiniTable from './MiniTable';

// Masaya çağrı geldi: üstte kart, masada kimler oturuyor, Otur / Sonra; süre dolunca kendiliğinden kapanır
export default function InviteCard({ invite, busy, onAccept, onDismiss }) {
    const [left, setLeft] = useState(invite.expiresIn || 20000);
    useEffect(() => {
        const end = Date.now() + (invite.expiresIn || 20000);
        const t = setInterval(() => {
            const ms = end - Date.now();
            setLeft(ms);
            if (ms <= 0) onDismiss();
        }, 250);
        return () => clearInterval(t);
    }, [invite, onDismiss]);
    const { room, from } = invite;
    rememberAvatars(room.players);
    const free = room.maxPlayers - room.players.length;
    return (
        <section className="invite-card" role="dialog" aria-label="Masa daveti" aria-live="polite">
            <div className="invite-head">
                <img src={avatarFromSeed(from.avatar || from.id)} alt="" />
                <div>
                    <strong>{from.name} seni masasına çağırıyor</strong>
                    <span>{room.name} masası · {free} boş koltuk{room.settings?.voice ? ' · sesli sohbet var' : ''}</span>
                </div>
            </div>
            <div className="invite-body">
                <MiniTable name={room.name} status={`${free} boş koltuk`} voice={!!room.settings?.voice} players={room.players} maxPlayers={room.maxPlayers} highlight small />
                <p><b>Senin yerin hazır</b><span>Otur'a dokununca sarı koltuğa oturursun.</span></p>
            </div>
            <div className="invite-actions">
                <button type="button" className="sbtn sbtn-go" onClick={onAccept} disabled={busy} autoFocus>Otur</button>
                <button type="button" className="sbtn sbtn-line-dark" onClick={onDismiss} disabled={busy}>Sonra</button>
            </div>
            <div className="invite-timer" aria-hidden="true"><span style={{ width: `${Math.max(0, left / (invite.expiresIn || 20000)) * 100}%` }} /></div>
        </section>
    );
}
