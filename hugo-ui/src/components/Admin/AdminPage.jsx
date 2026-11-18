import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../../services/socketService';
import Spectator from './Spectator';
import Tasks from './Tasks';
import './Admin.css';

// Yönetim ekranı (hugola.io/admin): masaları canlı izler, masa kapatır, duyuru gönderir, günlük istatistiği gösterir.
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
    if (typeof label !== 'string' || !label) return null; // eski kayıtlarda bozuk taş adı olabilir: çizilmez
    if (label === 'sahte okey') return <span className="yp-tile is-joker" title="sahte okey">★</span>;
    const [c, value] = label.split(' ');
    const color = TR_COLOR[c] || c; // ceza kaydında taş adı Türkçe ("kırmızı 7")
    return <span className={`yp-tile c-${color}`} title={`${COLOR_TR[color] || color} ${value}`}>{value}</span>;
};
const Chips = ({ list }) => <span className="yp-chips">{(list || []).map((l, i) => <Chip key={i} label={l} />)}</span>;
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
    const [rejected, setRejected] = useState(false); // staging: sunucu anahtarsız bağlantıyı reddetti
    useEffect(() => {
        const s = io(SOCKET_URL, { auth: (cb) => cb(store.get() ? { adminToken: store.get() } : {}) });
        ref.current = s;
        s.on('connect', () => { setConnected(true); setRejected(false); });
        s.on('connect_error', (e) => { if (e?.message === 'admin-required') setRejected(true); });
        s.on('disconnect', () => setConnected(false));
        // Tarayıcı hataları sunucu günlüğüne gider (boş ekranın sebebi oradan okunur)
        const report = (data) => s.emit('admin:clientError', { ...data, ua: navigator.userAgent.slice(0, 160), vp: `${innerWidth}x${innerHeight}` });
        const onError = (e) => report({ msg: e.message, at: `${e.filename}:${e.lineno}:${e.colno}`, stack: e.error?.stack?.slice(0, 600) });
        const onRejection = (e) => report({ msg: String(e.reason?.message || e.reason), stack: e.reason?.stack?.slice(0, 600) });
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        window.__adminReport = report;
        return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); s.close(); };
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
    return { connected, rejected, call, socket: ref };
}

function Login({ onLogin, error, busy }) {
    const [token, setToken] = useState('');
    return (
        <main className="yp-login">
            <form onSubmit={(e) => { e.preventDefault(); onLogin(token.trim()); }}>
                <h1>Hugo admin</h1>
                <label htmlFor="yp-token">Yönetim anahtarı</label>
                <input id="yp-token" type="password" autoComplete="current-password" value={token} onChange={(e) => setToken(e.target.value)} autoFocus />
                {error && <p className="yp-error" role="alert">{error}</p>}
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
        <button type="button" className={`yp-table ${selected ? 'is-selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
            <span className="yp-table-head">
                <span className="yp-table-no">#{t.no}</span>
                <span className="yp-table-name">{t.ad}</span>
            </span>
            <span className="yp-felt">
                <span className="yp-felt-center">
                    {t.el ? <><b>{t.el}. el</b>{t.hugo && <i>Hugo</i>}<small>deste {t.deste}</small></> : <b>{STATUS_TR[t.durum] || t.durum}</b>}
                </span>
                {seats.map((p, i) => (
                    <span key={i} className={`yp-seat yp-seat-${pos[i]} ${p && t.sira === p.yp ? 'is-turn' : ''} ${p && !p.bot && !p.bagli ? 'is-off' : ''} ${p?.bot ? 'is-bot' : ''}`}>
                        {p ? <><span className="yp-seat-name">{p.ad}</span><span className="yp-seat-score">{p.puan}</span></> : <span className="yp-seat-name">boş</span>}
                    </span>
                ))}
            </span>
            <span className="yp-table-foot">
                <span>{humans.length} insan · {4 - humans.length} yz</span>
                {offline > 0 && <span className="yp-warn">{offline} kopuk</span>}
                <span>{ago(t.sonHareket)}</span>
            </span>
        </button>
    );
}

function TableWatch({ table, call, socket, onClosed }) {
    const [events, setEvents] = useState([]);
    const [spy, setSpy] = useState(false);
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
        <section className="yp-watch" aria-label={`#${table.no} masasını izleme`}>
            <header>
                <div>
                    <h2>#{table.no} · {table.ad}</h2>
                    <p>{table.el ? `${table.el}. el${table.hugo ? ' (Hugo)' : ''} · sıra: ${table.sira || '-'}` : STATUS_TR[table.durum]}</p>
                </div>
                <button type="button" className="yp-spy-btn" onClick={() => setSpy(true)}>Gizli izle</button>
                {spy && <Spectator no={table.no} call={call} socket={socket} onClose={() => setSpy(false)} />}
                {confirm
                    ? <span className="yp-confirm">Masadakiler lobiye döner. <button type="button" className="yp-danger" onClick={close}>Evet, kapat</button><button type="button" onClick={() => setConfirm(false)}>Vazgeç</button></span>
                    : <button type="button" className="yp-danger-ghost" onClick={() => setConfirm(true)}>Masayı kapat</button>}
            </header>
            {msg && <p className="yp-error">{msg}</p>}
            <table className="yp-scores">
                <thead><tr><th>Oyuncu</th><th>Puan</th><th>Ceza</th><th>Taş</th><th>Durum</th></tr></thead>
                <tbody>
                    {table.oyuncular.map(p => (
                        <tr key={p.ad} className={table.sira === p.ad ? 'is-turn' : ''}>
                            <td>{p.ad}{p.bot && <span className="yp-tag">yz</span>}</td>
                            <td>{p.puan}</td><td>{p.ceza}</td><td>{p.tas}</td>
                            <td>{p.bot ? '-' : p.bagli ? <span className="yp-ok">bağlı</span> : <span className="yp-warn">kopuk</span>}{p.acik && <span className="yp-tag">açtı</span>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <h3>Akış <small>bugün · 3 sn'de bir yenilenir</small></h3>
            <ol className="yp-feed">
                {rows.length === 0 && <li className="yp-empty">Bu masa için bugün kayıt yok.</li>}
                {rows.map(({ e, d }, i) => (
                    <li key={i} className={d.tur ? `t-${d.tur}` : ''}>
                        <time>{clock(e.t)}</time>
                        <span className="yp-feed-text">
                            {d.kim && <b>{d.kim}</b>} {d.ne} {d.taslar && <Chips list={d.taslar} />}
                            {d.setler?.map((s, j) => <Chips key={j} list={s} />)}
                            {d.dagitim && (
                                <details>
                                    <summary>Dağıtım: gösterge <Chip label={d.dagitim.gosterge} /> okey <Chip label={d.dagitim.okey} /></summary>
                                    {Object.entries(d.dagitim.eller).map(([ad, el]) => <div key={ad} className="yp-hand"><b>{ad}</b> <Chips list={el} /></div>)}
                                </details>
                            )}
                            {d.sonuc && <span className="yp-result">{d.sonuc.map(p => `${p.name} ${p.score}`).join(' · ')}</span>}
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
        <div className="yp-hourly" role="img" aria-label={`Saatlik oynayan: ${data.map(([h, n]) => `${h}:00 ${n}`).join(', ') || 'yok'}`}>
            {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="yp-hour" title={`${String(h).padStart(2, '0')}:00 · ${by.get(h) || 0} oyuncu`}>
                    <span style={{ height: `${((by.get(h) || 0) / max) * 100}%` }} />
                    {h % 6 === 0 && <small>{String(h).padStart(2, '0')}</small>}
                </span>
            ))}
        </div>
    );
}

// Ekran çizilirken hata olursa boş sayfa yerine hata yazılır ve sunucuya bildirilir
class AdminErrorBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) { return { error }; }
    componentDidCatch(error, info) { window.__adminReport?.({ msg: error.message, stack: error.stack?.slice(0, 600), component: info.componentStack?.slice(0, 600) }); }
    render() {
        if (!this.state.error) return this.props.children;
        return (
            <main className="yp-login">
                <div className="yp-crash" role="alert">
                    <h1>Yönetim ekranı açılamadı</h1>
                    <p>Hata sunucu günlüğüne yazıldı. Sayfayı yenileyip tekrar dene.</p>
                    <pre>{String(this.state.error.message || this.state.error)}</pre>
                    <button type="button" onClick={() => location.reload()}>Yenile</button>
                </div>
            </main>
        );
    }
}

export default function AdminPage() {
    return <AdminErrorBoundary><AdminScreen /></AdminErrorBoundary>;
}

function AdminScreen() {
    const [authed, setAuthed] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [busy, setBusy] = useState(false);
    const lost = useCallback(() => setAuthed(false), []);
    const { connected, rejected, call, socket } = useAdminSocket(lost);
    const [overview, setOverview] = useState(null);
    const [day, setDay] = useState('');
    const [stats, setStats] = useState(null);
    const [problems, setProblems] = useState([]);
    const [selected, setSelected] = useState(null);
    const [announce, setAnnounce] = useState('');
    const [notice, setNotice] = useState('');

    // Sayfalar (menü): /admin panel, /admin/tasks görevler; geri / ileri tuşları da çalışır
    const pageOf = () => (location.pathname.replace(/\/+$/, '') === '/admin/tasks' ? 'tasks' : 'panel');
    const [page, setPage] = useState(pageOf);
    useEffect(() => {
        const onPop = () => setPage(pageOf());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);
    const go = (e, to) => {
        e.preventDefault();
        if (to === page) return;
        history.pushState(null, '', to === 'tasks' ? '/admin/tasks' : '/admin');
        setPage(to);
        scrollTo(0, 0);
    };
    useEffect(() => { document.title = page === 'tasks' ? 'Görevler · Hugo admin' : 'Hugo admin'; }, [page]);

    // Teşhis: giriş sonrası ilk veri gelince sayfanın gerçekten çizilip çizilmediği sunucuya yazılır (koyu ekran sorunu)
    const reported = useRef(false);
    useEffect(() => {
        if (!overview || reported.current) return;
        reported.current = true;
        requestAnimationFrame(() => {
            const ad = document.querySelector('.yp');
            const r = ad?.getBoundingClientRect();
            window.__adminReport?.({
                type: 'acildi', hasDestek: CSS.supports?.('selector(:has(a))') ?? null,
                ad: r ? `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}` : null,
                sayfa: `${document.documentElement.scrollWidth}x${document.documentElement.scrollHeight}`, kaydirma: scrollY,
                renk: ad ? getComputedStyle(ad).color : null, gorunurluk: ad ? getComputedStyle(ad).visibility + '/' + getComputedStyle(ad).opacity : null,
            });
        });
    }, [overview]);

    const login = useCallback(async (token) => {
        // Staging: bağlantı anahtarla kurulur (sonra kayıtlı anahtarla kendiliğinden girilir)
        if (!socket.current?.connected) { store.set(token); socket.current?.connect(); return; }
        setBusy(true);
        const r = await call('admin:login', { token });
        setBusy(false);
        if (r?.success) { store.set(token); setAuthed(true); setLoginError(''); } else { store.set(''); setLoginError(r?.error || 'Girilemedi'); }
    }, [call, socket]);

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

    if (!authed) return <Login onLogin={login} error={rejected ? (store.get() ? 'Anahtar kabul edilmedi' : '') : connected ? loginError : 'Sunucuya bağlanılıyor…'} busy={busy || (!connected && !rejected)} />;

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
        <div className={`yp ${page === 'tasks' ? 'is-wide' : ''}`}>
            <header className="yp-top">
                <h1>Hugo admin</h1>
                <nav className="yp-nav" aria-label="Admin menüsü">
                    <a href="/admin" aria-current={page === 'panel' ? 'page' : undefined} onClick={(e) => go(e, 'panel')}>Panel</a>
                    <a href="/admin/tasks" aria-current={page === 'tasks' ? 'page' : undefined} onClick={(e) => go(e, 'tasks')}>Görevler</a>
                </nav>
                <div className="yp-server">
                    <span className={`yp-dot ${connected ? 'on' : ''}`} aria-hidden="true" />
                    {overview ? <>
                        <span><b>{overview.insanCevrimici}</b> oyuncu çevrimiçi</span>
                        <span><b>{tables.length}</b> açık masa</span>
                        <span>{overview.sunucu.baglanti} bağlantı</span>
                        <span>{overview.sunucu.bellekMb} MB</span>
                        <span>açık {duration(overview.sunucu.calisma)}</span>
                    </> : <span>yükleniyor…</span>}
                    <button type="button" className="yp-link" onClick={() => { store.set(''); setAuthed(false); }}>Çık</button>
                </div>
            </header>

            {page === 'tasks' ? <Tasks call={call} /> : (<>

            <section className="yp-section" aria-labelledby="yp-day">
                <div className="yp-section-head">
                    <h2 id="yp-day">{today ? 'Bugün' : stats?.gun}</h2>
                    <select value={day || stats?.gun || ''} onChange={(e) => setDay(e.target.value)} aria-label="Gün seç">
                        {(stats?.gunler?.length ? stats.gunler : [stats?.gun].filter(Boolean)).map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                </div>
                <div className="yp-numbers">
                    {numbers.map(([label, value, hint]) => (
                        <div key={label} className="yp-number"><b>{value}</b><span>{label}</span><small>{hint}</small></div>
                    ))}
                </div>
                {s && <><h3>Saatlik oynayan</h3><Hourly data={s.saatlik} /></>}
            </section>

            <section className="yp-section" aria-labelledby="yp-tables">
                <div className="yp-section-head"><h2 id="yp-tables">Masalar</h2><small>5 sn'de bir yenilenir · izlemek için masaya dokun</small></div>
                {tables.length === 0 ? <p className="yp-empty">Şu an açık masa yok.</p> : (
                    <div className="yp-tables">
                        {tables.map(t => <TableCard key={t.no} t={t} selected={t.no === selected} onSelect={() => setSelected(t.no === selected ? null : t.no)} />)}
                    </div>
                )}
                {table && <TableWatch key={table.no} table={table} call={call} socket={socket} onClosed={() => setSelected(null)} />}
                {selected && !table && <p className="yp-empty">#{selected} masası kapandı. Akışı kayıt dosyasında bulabilirsin.</p>}
            </section>

            <div className="yp-columns">
                <section className="yp-section" aria-labelledby="yp-players">
                    <div className="yp-section-head"><h2 id="yp-players">Oyuncular</h2><small>{today ? 'bugün' : stats?.gun}</small></div>
                    {!s?.oyuncular.length ? <p className="yp-empty">Henüz oynayan yok.</p> : (
                        <table className="yp-list">
                            <thead><tr><th>Ad</th><th>Hamle</th><th>Masa</th></tr></thead>
                            <tbody>{s.oyuncular.map(p => <tr key={p.ad}><td>{p.ad}</td><td>{p.hamle}</td><td>{p.masa}</td></tr>)}</tbody>
                        </table>
                    )}
                </section>
                <section className="yp-section" aria-labelledby="yp-problems">
                    <div className="yp-section-head"><h2 id="yp-problems">Sorunlar</h2><small>bugün · reddedilen istekler, hata ve donmalar</small></div>
                    {problems.length === 0 ? <p className="yp-empty">Sorun kaydı yok.</p> : (
                        <ol className="yp-feed">
                            {problems.map((e, i) => (
                                <li key={i} className={e.ev === 'istemci' ? 't-uyari' : 't-hata'}>
                                    <time>{clock(e.t)}</time>
                                    <span className="yp-feed-text">
                                        <b>{e.oyuncu || '?'}</b> {e.masa && <span className="yp-tag">#{e.masa}</span>}{' '}
                                        {e.ev === 'istemci' ? `${e.type}${e.ms ? ` ${e.ms} ms` : ''}${e.msg ? `: ${e.msg}` : ''}` : `${e.istek}: ${e.hata}`}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>
            </div>

            <section className="yp-section" aria-labelledby="yp-announce">
                <div className="yp-section-head"><h2 id="yp-announce">Duyuru</h2><small>açık olan herkesin ekranında birkaç saniye görünür</small></div>
                <form className="yp-announce" onSubmit={sendAnnounce}>
                    <input value={announce} maxLength={200} onChange={(e) => setAnnounce(e.target.value)} placeholder="Örn. Sunucu 2 dakika içinde güncellenecek" aria-label="Duyuru metni" />
                    <button type="submit" disabled={!announce.trim()}>Gönder</button>
                    {notice && <span role="status">{notice}</span>}
                </form>
            </section>
            </>)}
        </div>
    );
}
