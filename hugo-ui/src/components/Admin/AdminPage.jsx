import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../../services/socketService';
import './Admin.css';

// Yönetim ekranı (hugola.io/yonetim): masaları canlı izler, masa kapatır, duyuru gönderir, günlük istatistiği gösterir.
// Veriler oyunun Socket.IO bağlantısından (admin:* istekleri) gelir; anahtar sunucudaki /var/lib/hugo/admin-token dosyasında.

const TOKEN_KEY = 'hugo.adminToken';
const store = {
    get: () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
    set: (v) => { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* özel pencere */ } },
};

const COLOR_TR = { red: 'kırmızı', blue: 'mavi', black: 'siyah', yellow: 'sarı' };
const TR_COLOR = Object.fromEntries(Object.entries(COLOR_TR).map(([k, v]) => [v, k]));
const STATUS_TR = { waiting: 'bekliyor', playing: 'oyunda', finished: 'bitti' };

const clock = (t) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const ago = (ms) => {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    return s < 60 ? `${s} sn önce` : s < 3600 ? `${Math.round(s / 60)} dk önce` : `${Math.round(s / 3600)} sa önce`;
};
const duration = (s) => (s < 3600 ? `${Math.round(s / 60)} dk` : s < 86400 ? `${Math.floor(s / 3600)} sa ${Math.round((s % 3600) / 60)} dk` : `${Math.floor(s / 86400)} gün ${Math.floor((s % 86400) / 3600)} sa`);

// "red 5" → küçük taş; sahte okey ayrı
const Chip = ({ label }) => {
    if (!label) return null;
    if (label === 'sahte okey') return <span className="ad-tile is-joker" title="sahte okey">★</span>;
    const [c, value] = label.split(' ');
    const color = TR_COLOR[c] || c; // ceza kaydında taş adı Türkçe ("kırmızı 7")
    return <span className={`ad-tile c-${color}`} title={`${COLOR_TR[color] || color} ${value}`}>{value}</span>;
};
const Chips = ({ list }) => <span className="ad-chips">{(list || []).map((l, i) => <Chip key={i} label={l} />)}</span>;
const setLabels = (sets) => (sets || []).map(st => (st.tiles || []).map(t => (t.isJoker ? 'sahte okey' : `${t.color} ${t.value}`)));

const ACTIONS = {
    'game:discardTile': 'attı', 'game:openHand': 'el açtı', 'game:addTileToSet': 'işledi', 'game:addPairToSet': 'çift işledi',
    'game:dropPer': 'per indirdi', 'game:undoTurn': 'geri aldı', 'game:returnTaken': 'kustu', 'game:leaveTable': 'masadan kalktı',
    'player:ready': 'hazır', 'game:start': 'oyunu başlattı', 'player:reconnect': 'yeniden bağlandı', 'room:join': 'masaya oturdu',
};

// Kayıt satırını okunur hâle getirir: { kim, ne, taslar, tur } ya da null (izlemede gösterilmeyen satır)
const describe = (e) => {
    if (e.ev === 'istek') {
        if (e.ok === false) return { kim: e.oyuncu, ne: `${ACTIONS[e.istek] || e.istek} reddedildi: ${e.hata}`, tur: 'hata', taslar: e.taslar };
        if (e.istek === 'game:drawTile') return { kim: e.oyuncu, ne: e.veri?.fromDiscard ? 'yerden aldı' : 'desteden çekti', taslar: [e.cekilen] };
        if (e.istek === 'chat:send') return { kim: e.oyuncu, ne: `“${e.veri?.text ?? ''}”`, tur: 'sohbet' };
        return null; // hamlenin kendisi masa olayında görünür
    }
    if (e.ev !== 'masa') return null;
    const v = e.veri || {};
    switch (e.olay) {
        case 'game:started': return { ne: 'Oyun başladı', tur: 'bolum', dagitim: e.dagitim };
        case 'game:roundStarted': return { ne: `${e.el}. el başladı`, tur: 'bolum', dagitim: e.dagitim };
        case 'game:roundEnded': return { ne: `${v.round}. el bitti${v.gameStatus === 'finished' ? ' · oyun bitti' : ''}`, tur: 'bolum', sonuc: v.players };
        case 'game:tileDiscard': return { kim: e.kim, ne: 'attı', taslar: [e.tas] };
        case 'game:tileDraw': return { kim: e.kim, ne: v.fromDiscard ? 'yerden aldı' : 'desteden çekti' };
        case 'game:handOpened': return { kim: e.kim, ne: `el açtı (${v.openedTotal ?? '-'})`, setler: setLabels(v.newSets) };
        case 'game:perDropped': return { kim: e.kim, ne: 'per indirdi', setler: setLabels(v.newSets) };
        case 'game:tileAddedToSet': return { kim: e.kim, ne: 'işledi', setler: setLabels(v.updatedSet ? [v.updatedSet] : []) };
        case 'game:tileReturned': return { kim: e.kim, ne: 'kustu', taslar: [e.tas] };
        case 'game:turnUndone': return { kim: e.kim, ne: 'sırasını geri aldı' };
        case 'game:penalty': return { kim: v.playerName, ne: `${v.amount > 0 ? '+' : ''}${v.amount} ceza · ${v.reason}`, tur: v.amount > 0 ? 'ceza' : '', taslar: v.tile ? [v.tile] : undefined };
        case 'player:connection': return { kim: e.kim, ne: v.connected ? 'bağlandı' : 'bağlantısı koptu', tur: v.connected ? '' : 'uyari' };
        case 'player:joined': return { ne: 'masaya oyuncu geldi' };
        case 'player:left': return { ne: 'masadan oyuncu ayrıldı' };
        case 'room:closed': return { ne: `Masa kapandı: ${v.reason}`, tur: 'bolum' };
        default: return null; // game:nextTurn, game:turnExtended, player:ready…
    }
};

function useAdminSocket(onAuthLost) {
    const ref = useRef(null);
    const [connected, setConnected] = useState(false);
    useEffect(() => {
        const s = io(SOCKET_URL);
        ref.current = s;
        s.on('connect', () => setConnected(true));
        s.on('disconnect', () => setConnected(false));
        return () => s.close();
    }, []);
    const call = useCallback((event, data = {}) => new Promise((resolve) => {
        const s = ref.current;
        if (!s?.connected) return resolve({ success: false, error: 'Sunucuya bağlı değil' });
        s.timeout(8000).emit(event, data, (err, res) => {
            const r = err ? { success: false, error: 'Sunucu cevap vermedi' } : res;
            if (r?.error === 'Yönetim anahtarı gerekli') onAuthLost?.();
            resolve(r);
        });
    }), [onAuthLost]);
    return { connected, call, socket: ref };
}

function Login({ onLogin, error, busy }) {
    const [token, setToken] = useState('');
    return (
        <main className="ad-login">
            <form onSubmit={(e) => { e.preventDefault(); onLogin(token.trim()); }}>
                <h1>Hugo yönetim</h1>
                <label htmlFor="ad-token">Yönetim anahtarı</label>
                <input id="ad-token" type="password" autoComplete="current-password" value={token} onChange={(e) => setToken(e.target.value)} autoFocus />
                {error && <p className="ad-error" role="alert">{error}</p>}
                <button type="submit" disabled={!token.trim() || busy}>{busy ? 'Giriliyor…' : 'Gir'}</button>
                <small>Anahtar sunucuda <code>/var/lib/hugo/admin-token</code> dosyasında.</small>
            </form>
        </main>
    );
}

// Masa kartı: dört koltuk masanın etrafında; sıradaki oyuncu ve bağlantısı kopan oyuncu işaretli
function TableCard({ t, selected, onSelect }) {
    const seats = [0, 1, 2, 3].map(i => t.oyuncular[i] || null);
    const pos = ['s', 'e', 'n', 'w']; // oturma sırası: güney, doğu, kuzey, batı (oyun sırası saat yönünün tersi)
    const humans = t.oyuncular.filter(p => !p.bot);
    const offline = humans.filter(p => !p.bagli).length;
    return (
        <button type="button" className={`ad-table ${selected ? 'is-selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
            <span className="ad-table-head">
                <span className="ad-table-no">#{t.no}</span>
                <span className="ad-table-name">{t.ad}</span>
            </span>
            <span className="ad-felt">
                <span className="ad-felt-center">
                    {t.el ? <><b>{t.el}. el</b>{t.hugo && <i>Hugo</i>}<small>deste {t.deste}</small></> : <b>{STATUS_TR[t.durum] || t.durum}</b>}
                </span>
                {seats.map((p, i) => (
                    <span key={i} className={`ad-seat ad-seat-${pos[i]} ${p && t.sira === p.ad ? 'is-turn' : ''} ${p && !p.bot && !p.bagli ? 'is-off' : ''} ${p?.bot ? 'is-bot' : ''}`}>
                        {p ? <><span className="ad-seat-name">{p.ad}</span><span className="ad-seat-score">{p.puan}</span></> : <span className="ad-seat-name">boş</span>}
                    </span>
                ))}
            </span>
            <span className="ad-table-foot">
                <span>{humans.length} insan · {4 - humans.length} yz</span>
                {offline > 0 && <span className="ad-warn">{offline} kopuk</span>}
                <span>{ago(t.sonHareket)}</span>
            </span>
        </button>
    );
}

function TableWatch({ table, call, onClosed }) {
    const [events, setEvents] = useState([]);
    const [confirm, setConfirm] = useState(false);
    const [msg, setMsg] = useState('');
    useEffect(() => {
        let alive = true;
        const load = async () => { const r = await call('admin:tableLog', { no: table.no }); if (alive && r?.success) setEvents(r.olaylar); };
        load();
        const id = setInterval(load, 3000);
        return () => { alive = false; clearInterval(id); };
    }, [table.no, call]);
    const rows = useMemo(() => events.map(e => ({ e, d: describe(e) })).filter(r => r.d), [events]);
    const close = async () => {
        const r = await call('admin:closeTable', { no: table.no });
        if (r?.success) onClosed(); else setMsg(r?.error || 'Kapatılamadı');
        setConfirm(false);
    };
    return (
        <section className="ad-watch" aria-label={`#${table.no} masasını izleme`}>
            <header>
                <div>
                    <h2>#{table.no} · {table.ad}</h2>
                    <p>{table.el ? `${table.el}. el${table.hugo ? ' (Hugo)' : ''} · sıra: ${table.sira || '-'}` : STATUS_TR[table.durum]}</p>
                </div>
                {confirm
                    ? <span className="ad-confirm">Masadakiler lobiye döner. <button type="button" className="ad-danger" onClick={close}>Evet, kapat</button><button type="button" onClick={() => setConfirm(false)}>Vazgeç</button></span>
                    : <button type="button" className="ad-danger-ghost" onClick={() => setConfirm(true)}>Masayı kapat</button>}
            </header>
            {msg && <p className="ad-error">{msg}</p>}
            <table className="ad-scores">
                <thead><tr><th>Oyuncu</th><th>Puan</th><th>Ceza</th><th>Taş</th><th>Durum</th></tr></thead>
                <tbody>
                    {table.oyuncular.map(p => (
                        <tr key={p.ad} className={table.sira === p.ad ? 'is-turn' : ''}>
                            <td>{p.ad}{p.bot && <span className="ad-tag">yz</span>}</td>
                            <td>{p.puan}</td><td>{p.ceza}</td><td>{p.tas}</td>
                            <td>{p.bot ? '-' : p.bagli ? <span className="ad-ok">bağlı</span> : <span className="ad-warn">kopuk</span>}{p.acik && <span className="ad-tag">açtı</span>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <h3>Akış <small>bugün · 3 sn'de bir yenilenir</small></h3>
            <ol className="ad-feed">
                {rows.length === 0 && <li className="ad-empty">Bu masa için bugün kayıt yok.</li>}
                {rows.map(({ e, d }, i) => (
                    <li key={i} className={d.tur ? `t-${d.tur}` : ''}>
                        <time>{clock(e.t)}</time>
                        <span className="ad-feed-text">
                            {d.kim && <b>{d.kim}</b>} {d.ne} {d.taslar && <Chips list={d.taslar} />}
                            {d.setler?.map((s, j) => <Chips key={j} list={s} />)}
                            {d.dagitim && (
                                <details>
                                    <summary>Dağıtım: gösterge <Chip label={d.dagitim.gosterge} /> okey <Chip label={d.dagitim.okey} /></summary>
                                    {Object.entries(d.dagitim.eller).map(([ad, el]) => <div key={ad} className="ad-hand"><b>{ad}</b> <Chips list={el} /></div>)}
                                </details>
                            )}
                            {d.sonuc && <span className="ad-result">{d.sonuc.map(p => `${p.name} ${p.score}`).join(' · ')}</span>}
                        </span>
                    </li>
                ))}
            </ol>
        </section>
    );
}

function Hourly({ data }) {
    const max = Math.max(1, ...data.map(([, n]) => n));
    const by = new Map(data);
    return (
        <div className="ad-hourly" role="img" aria-label={`Saatlik oynayan: ${data.map(([h, n]) => `${h}:00 ${n}`).join(', ') || 'yok'}`}>
            {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="ad-hour" title={`${String(h).padStart(2, '0')}:00 · ${by.get(h) || 0} oyuncu`}>
                    <span style={{ height: `${((by.get(h) || 0) / max) * 100}%` }} />
                    {h % 6 === 0 && <small>{String(h).padStart(2, '0')}</small>}
                </span>
            ))}
        </div>
    );
}

export default function AdminPage() {
    const [authed, setAuthed] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [busy, setBusy] = useState(false);
    const lost = useCallback(() => setAuthed(false), []);
    const { connected, call } = useAdminSocket(lost);
    const [overview, setOverview] = useState(null);
    const [day, setDay] = useState('');
    const [stats, setStats] = useState(null);
    const [problems, setProblems] = useState([]);
    const [selected, setSelected] = useState(null);
    const [announce, setAnnounce] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => { document.title = 'Hugo yönetim'; }, []);

    const login = useCallback(async (token) => {
        setBusy(true);
        const r = await call('admin:login', { token });
        setBusy(false);
        if (r?.success) { store.set(token); setAuthed(true); setLoginError(''); } else { store.set(''); setLoginError(r?.error || 'Girilemedi'); }
    }, [call]);

    // Kayıtlı anahtarla kendiliğinden gir (bağlantı her kurulduğunda: sunucu yeniden başlarsa oturum yenilenir)
    useEffect(() => {
        if (connected && store.get()) login(store.get());
        if (!connected) setAuthed(false);
    }, [connected, login]);

    useEffect(() => {
        if (!authed) return;
        let alive = true;
        const load = async () => {
            const [o, p] = await Promise.all([call('admin:overview'), call('admin:problems')]);
            if (!alive) return;
            if (o?.success) setOverview(o);
            if (p?.success) setProblems(p.olaylar);
        };
        load();
        const id = setInterval(load, 5000);
        return () => { alive = false; clearInterval(id); };
    }, [authed, call]);

    useEffect(() => {
        if (!authed) return;
        let alive = true;
        const load = async () => { const r = await call('admin:stats', { day }); if (alive && r?.success) setStats(r); };
        load();
        const id = setInterval(load, 15000);
        return () => { alive = false; clearInterval(id); };
    }, [authed, day, call]);

    const sendAnnounce = async (e) => {
        e.preventDefault();
        const r = await call('admin:announce', { text: announce });
        setNotice(r?.success ? 'Duyuru gönderildi' : r?.error || 'Gönderilemedi');
        if (r?.success) setAnnounce('');
        setTimeout(() => setNotice(''), 3000);
    };

    if (!authed) return <Login onLogin={login} error={connected ? loginError : 'Sunucuya bağlanılıyor…'} busy={busy || !connected} />;

    const tables = overview?.masalar || [];
    const table = tables.find(t => t.no === selected);
    const s = stats?.istatistik;
    const today = !day || day === stats?.gunler?.[0];
    const numbers = s ? [
        ['Açılış', s.baglanti, 'uygulamanın açıldığı bağlantı'],
        ['Giriş yapan', s.girisYapan, `${s.yeniKayit} yeni kayıt`],
        ['Oynayan', s.oynayan, 'masada hamle yapan'],
        ['Masa', s.acilanMasa, 'açılan'],
        ['Oyun', `${s.bitenOyun}/${s.baslayanOyun}`, 'biten / başlayan'],
        ['El', s.oynananEl, 'oynanan'],
        ['Reddedilen', s.reddedilen, 'istek'],
    ] : [];

    return (
        <div className="ad">
            <header className="ad-top">
                <h1>Hugo yönetim</h1>
                <div className="ad-server">
                    <span className={`ad-dot ${connected ? 'on' : ''}`} aria-hidden="true" />
                    {overview ? <>
                        <span><b>{overview.insanCevrimici}</b> oyuncu çevrimiçi</span>
                        <span><b>{tables.length}</b> açık masa</span>
                        <span>{overview.sunucu.baglanti} bağlantı</span>
                        <span>{overview.sunucu.bellekMb} MB</span>
                        <span>açık {duration(overview.sunucu.calisma)}</span>
                    </> : <span>yükleniyor…</span>}
                    <button type="button" className="ad-link" onClick={() => { store.set(''); setAuthed(false); }}>Çık</button>
                </div>
            </header>

            <section className="ad-section" aria-labelledby="ad-day">
                <div className="ad-section-head">
                    <h2 id="ad-day">{today ? 'Bugün' : stats?.gun}</h2>
                    <select value={day || stats?.gun || ''} onChange={(e) => setDay(e.target.value)} aria-label="Gün seç">
                        {(stats?.gunler?.length ? stats.gunler : [stats?.gun].filter(Boolean)).map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                </div>
                <div className="ad-numbers">
                    {numbers.map(([label, value, hint]) => (
                        <div key={label} className="ad-number"><b>{value}</b><span>{label}</span><small>{hint}</small></div>
                    ))}
                </div>
                {s && <><h3>Saatlik oynayan</h3><Hourly data={s.saatlik} /></>}
            </section>

            <section className="ad-section" aria-labelledby="ad-tables">
                <div className="ad-section-head"><h2 id="ad-tables">Masalar</h2><small>5 sn'de bir yenilenir · izlemek için masaya dokun</small></div>
                {tables.length === 0 ? <p className="ad-empty">Şu an açık masa yok.</p> : (
                    <div className="ad-tables">
                        {tables.map(t => <TableCard key={t.no} t={t} selected={t.no === selected} onSelect={() => setSelected(t.no === selected ? null : t.no)} />)}
                    </div>
                )}
                {table && <TableWatch key={table.no} table={table} call={call} onClosed={() => setSelected(null)} />}
                {selected && !table && <p className="ad-empty">#{selected} masası kapandı. Akışı kayıt dosyasında bulabilirsin.</p>}
            </section>

            <div className="ad-columns">
                <section className="ad-section" aria-labelledby="ad-players">
                    <div className="ad-section-head"><h2 id="ad-players">Oyuncular</h2><small>{today ? 'bugün' : stats?.gun}</small></div>
                    {!s?.oyuncular.length ? <p className="ad-empty">Henüz oynayan yok.</p> : (
                        <table className="ad-list">
                            <thead><tr><th>Ad</th><th>Hamle</th><th>Masa</th></tr></thead>
                            <tbody>{s.oyuncular.map(p => <tr key={p.ad}><td>{p.ad}</td><td>{p.hamle}</td><td>{p.masa}</td></tr>)}</tbody>
                        </table>
                    )}
                </section>
                <section className="ad-section" aria-labelledby="ad-problems">
                    <div className="ad-section-head"><h2 id="ad-problems">Sorunlar</h2><small>bugün · reddedilen istekler, hata ve donmalar</small></div>
                    {problems.length === 0 ? <p className="ad-empty">Sorun kaydı yok.</p> : (
                        <ol className="ad-feed">
                            {problems.map((e, i) => (
                                <li key={i} className={e.ev === 'istemci' ? 't-uyari' : 't-hata'}>
                                    <time>{clock(e.t)}</time>
                                    <span className="ad-feed-text">
                                        <b>{e.oyuncu || '?'}</b> {e.masa && <span className="ad-tag">#{e.masa}</span>}{' '}
                                        {e.ev === 'istemci' ? `${e.type}${e.ms ? ` ${e.ms} ms` : ''}${e.msg ? `: ${e.msg}` : ''}` : `${e.istek}: ${e.hata}`}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>
            </div>

            <section className="ad-section" aria-labelledby="ad-announce">
                <div className="ad-section-head"><h2 id="ad-announce">Duyuru</h2><small>açık olan herkesin ekranında birkaç saniye görünür</small></div>
                <form className="ad-announce" onSubmit={sendAnnounce}>
                    <input value={announce} maxLength={200} onChange={(e) => setAnnounce(e.target.value)} placeholder="Örn. Sunucu 2 dakika içinde güncellenecek" aria-label="Duyuru metni" />
                    <button type="submit" disabled={!announce.trim()}>Gönder</button>
                    {notice && <span role="status">{notice}</span>}
                </form>
            </section>
        </div>
    );
}
