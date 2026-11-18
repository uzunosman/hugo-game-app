import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../../services/socketService';
import Spectator from './Spectator';
import Tasks from './Tasks';
import History from './History';
import { Chip, Chips, STATUS_TR, ago, clock, describe, duration } from './format';
import './Admin.css';

// Yönetim ekranı (hugola.io/admin): masaları canlı izler, masa kapatır, duyuru gönderir, günlük istatistiği gösterir.
// Veriler oyunun Socket.IO bağlantısından (admin:* istekleri) gelir; anahtar sunucudaki /var/lib/hugo/admin-token dosyasında.

const TOKEN_KEY = 'hugo.adminToken';
const store = {
    get: () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
    set: (v) => { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* özel pencere */ } },
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
    const [chat, setChat] = useState([]);
    const [say, setSay] = useState('');
    useEffect(() => {
        let alive = true;
        const load = async () => {
            const [r, c] = await Promise.all([call('admin:tableLog', { no: table.no }), call('admin:tableChat', { no: table.no })]);
            if (!alive) return;
            if (r?.success) setEvents(r.olaylar);
            if (c?.success) setChat(c.messages);
        };
        load();
        const id = setInterval(load, 3000);
        return () => { alive = false; clearInterval(id); };
    }, [table.no, call]);
    const rows = useMemo(() => events.map(e => ({ e, d: describe(e) })).filter(r => r.d), [events]);
    const [kick, setKick] = useState(null); // onay bekleyen oyuncu id
    const run = async (event, data) => {
        const r = await call(event, { no: table.no, ...data });
        setMsg(r?.success ? '' : r?.error || 'Olmadı');
        setKick(null);
    };
    const free = table.oyuncular.length < 4 || table.oyuncular.some(p => p.bos);
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
                <thead><tr><th>Oyuncu</th><th>Puan</th><th>Ceza</th><th>Taş</th><th>Durum</th><th><span className="visually-hidden">İşlem</span></th></tr></thead>
                <tbody>
                    {table.oyuncular.map(p => (
                        <tr key={p.id || p.ad} className={table.sira === p.ad ? 'is-turn' : ''}>
                            <td>{p.ad}{p.bot && <span className="yp-tag">yz</span>}</td>
                            <td>{p.puan}</td><td>{p.ceza}</td><td>{p.tas}</td>
                            <td>{p.bos ? <span className="yp-warn">boş koltuk</span> : p.bot ? '-' : p.bagli ? <span className="yp-ok">bağlı</span> : <span className="yp-warn">kopuk</span>}{p.acik && <span className="yp-tag">açtı</span>}</td>
                            <td>{!p.bos && (kick === p.id
                                ? <span className="yp-confirm"><button type="button" className="yp-danger" onClick={() => run('admin:kickPlayer', { playerId: p.id })}>Evet, kaldır</button><button type="button" onClick={() => setKick(null)}>Vazgeç</button></span>
                                : <button type="button" className="yp-danger-ghost" onClick={() => setKick(p.id)}>Kaldır</button>)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="yp-seat-help">
                <span>Sesli sohbet: <b className={table.ses ? 'yp-ok' : ''}>{table.ses ? 'açık' : 'kapalı'}</b></span>
                {[['on', 'Aç'], ['off', 'Kapat'], ['auto', 'Otomatik']].map(([mode, label]) => (
                    <button key={mode} type="button" className={`yp-btn is-quiet ${(table.sesAdmin || 'auto') === mode ? 'is-sel' : ''}`}
                        aria-pressed={(table.sesAdmin || 'auto') === mode} onClick={() => run('admin:voice', { mode })}>{label}</button>
                ))}
                <small>Aç: kişi sayısına bakılmaz. Otomatik: masa {table.sesAyar ? 'sesli sohbetle açıldı' : 'sesli sohbetsiz açıldı'}; en az 2 gerçek oyuncu gerekir.</small>
            </p>
            {free && <p className="yp-seat-help"><button type="button" className="yp-btn is-quiet" onClick={() => run('admin:addBot', {})}>Yapay zekâ ekle</button>
                <small>boş koltuğa oturur. Kaldırılan oyuncunun koltuğu 15 sn yeni oyuncu bekler, kimse oturmazsa yapay zekâ geçer.</small></p>}
            <h3>Sohbet <small>masadakilerin gördüğü sohbet · yazdığın "Yönetici" olarak görünür</small></h3>
            <ol className="yp-feed yp-chat">
                {chat.length === 0 && <li className="yp-empty">Henüz mesaj yok.</li>}
                {chat.map(m => (
                    <li key={m.id} className={m.admin ? 't-yonetici' : ''}>
                        <time>{clock(m.ts)}</time>
                        <span className="yp-feed-text"><b>{m.name}</b> {m.text}</span>
                    </li>
                ))}
            </ol>
            <form className="yp-announce" onSubmit={async (e) => {
                e.preventDefault();
                const r = await call('admin:chatSend', { no: table.no, text: say });
                if (r?.success) { setSay(''); setChat(prev => [...prev, r.message]); setMsg(''); } else setMsg(r?.error || 'Gönderilemedi');
            }}>
                <input value={say} maxLength={200} onChange={(e) => setSay(e.target.value)} placeholder="Masaya yaz (Yönetici olarak)" aria-label="Masa sohbetine yaz" />
                <button type="submit" disabled={!say.trim()}>Gönder</button>
            </form>
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

// Sayfalar (menü): /admin panel, /admin/tasks görevler, /admin/history geçmiş; geri / ileri tuşları da çalışır
const PATHS = { panel: '/admin', tasks: '/admin/tasks', history: '/admin/history' };
const pageOf = () => Object.keys(PATHS).find(k => PATHS[k] === location.pathname.replace(/\/+$/, '')) || 'panel';

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

    const [page, setPage] = useState(pageOf);
    useEffect(() => {
        const onPop = () => setPage(pageOf());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);
    const go = (e, to) => {
        e.preventDefault();
        if (to === page) return;
        history.pushState(null, '', PATHS[to]);
        setPage(to);
        scrollTo(0, 0);
    };
    useEffect(() => { document.title = `${{ tasks: 'Görevler · ', history: 'Geçmiş · ' }[page] || ''}Hugo admin`; }, [page]);

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
                    <a href="/admin/history" aria-current={page === 'history' ? 'page' : undefined} onClick={(e) => go(e, 'history')}>Geçmiş</a>
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

            {page === 'tasks' ? <Tasks call={call} /> : page === 'history' ? <History call={call} /> : (<>

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
