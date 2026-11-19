import { avatarFromSeed } from '../../utils/avatar';

const WHERE = { lobby: 'lobide', table: 'masada', playing: 'oyunda' };
const whereText = (p) => (p.online ? (p.roomName ? `${p.roomName} · ${WHERE[p.where]}` : WHERE[p.where] || 'çevrimiçi') : 'çevrimdışı');

// Arkadaşlar ve çevrimiçi oyuncular. Lobide: arkadaş ekle / istekleri cevapla. Bekleme ekranında (onInvite): lobidekiler çağrılır.
export default function SocialPanel({ social, registered, onInvite, onWatch, invited = {}, compact = false }) {
    const st = social.state;
    if (!registered) {
        return (
            <aside className={`social ${compact ? 'is-compact' : ''}`} aria-label="Arkadaşlar">
                <h2>Arkadaşlar</h2>
                <p className="social-empty">Bir masaya oturunca arkadaş ekleyip çağırabilirsin.</p>
            </aside>
        );
    }
    if (!st) return <aside className="social" aria-label="Arkadaşlar"><h2>Arkadaşlar</h2><p className="social-empty">Yükleniyor…</p></aside>;
    const friendIds = new Set(st.friends.map(f => f.id));
    const others = st.online.filter(o => !friendIds.has(o.id));
    const row = (p, action) => (
        <li key={p.id} className="social-row">
            <span className="social-av">
                <img src={avatarFromSeed(p.avatar || p.id)} alt="" />
                <i className={p.online ? (p.where === 'lobby' ? 'is-free' : 'is-busy') : 'is-off'} aria-hidden="true" />
            </span>
            <span className="social-who"><b>{p.name}</b><small>{whereText(p)}</small></span>
            {action}
        </li>
    );
    const inviteBtn = (p) => (onInvite && p.online && p.where === 'lobby'
        ? <button type="button" className="sbtn sbtn-amber sbtn-sm" disabled={!!invited[p.id]} onClick={() => onInvite(p)}>{invited[p.id] ? 'Çağrıldı' : 'Çağır'}</button>
        : null);
    // Lobide: masadaki arkadaşın masasını izle
    const watchBtn = (p) => (onWatch && p.online && p.roomId
        ? <button type="button" className="sbtn sbtn-line sbtn-sm" onClick={() => onWatch(p)}>İzle</button>
        : null);
    return (
        <aside className={`social ${compact ? 'is-compact' : ''}`} aria-label="Arkadaşlar ve çevrimiçi oyuncular">
            {st.requests.length > 0 && (
                <section>
                    <h2>Arkadaşlık istekleri</h2>
                    <ul>{st.requests.map(p => row(p, (
                        <span className="social-two">
                            <button type="button" className="sbtn sbtn-go sbtn-sm" onClick={() => social.respond(p.id, true)}>Kabul</button>
                            <button type="button" className="sbtn sbtn-line sbtn-sm" onClick={() => social.respond(p.id, false)} aria-label={`${p.name} isteğini reddet`}>×</button>
                        </span>
                    )))}</ul>
                </section>
            )}
            <section>
                <h2>Arkadaşlar <small>{st.friends.filter(f => f.online).length} çevrimiçi</small></h2>
                {st.friends.length === 0
                    ? <p className="social-empty">Henüz arkadaşın yok. Aşağıdan ya da masada birlikte oynadığın birini ekle.</p>
                    : <ul>{[...st.friends].sort((a, b) => b.online - a.online).map(p => row(p, inviteBtn(p) || watchBtn(p)))}</ul>}
            </section>
            <section>
                <h2>Çevrimiçi <small>{st.onlineCount} kişi</small></h2>
                {others.length === 0
                    ? <p className="social-empty">Şu an başka çevrimiçi oyuncu yok.</p>
                    : <ul>{others.map(p => row(p, inviteBtn(p) || (
                        <button type="button" className="sbtn sbtn-line sbtn-sm" disabled={p.requested} onClick={() => social.request(p.id)}>
                            {p.requested ? 'İstek gitti' : 'Ekle'}
                        </button>
                    )))}</ul>}
            </section>
        </aside>
    );
}
