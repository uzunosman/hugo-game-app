import { useEffect, useRef, useState } from 'react';

// Gizli izleme: admin bağlantısı masanın yayın kanalına sessizce girer; masada her olay olunca tam durum
// (bütün eller dahil) yeniden alınır. Oyuncular izleyiciyi görmez.

const COLOR_ORDER = { red: 0, yellow: 1, blue: 2, black: 3 };
const sortHand = (tiles) => [...tiles].sort((a, b) =>
    (a.isJoker - b.isJoker) || ((COLOR_ORDER[a.color] ?? 9) - (COLOR_ORDER[b.color] ?? 9)) || (Number(a.value) - Number(b.value)));

function T({ t, okey, size = '', dim }) {
    if (!t) return null;
    const isOkey = okey && !t.isJoker && t.color === okey.color && t.value === okey.value;
    return (
        <span className={`yp-tile ${size} ${t.isJoker ? 'is-joker' : `c-${t.color}`} ${isOkey ? 'is-okey' : ''} ${dim ? 'is-dim' : ''}`}
            title={t.isJoker ? 'sahte okey' : `${t.color} ${t.value}${isOkey ? ' (okey)' : ''}`}>
            {t.isJoker ? '★' : t.value}
        </span>
    );
}

export default function Spectator({ no, call, socket, onClose }) {
    const [m, setM] = useState(null);
    const [error, setError] = useState('');
    const [focus, setFocus] = useState(null);
    const [left, setLeft] = useState(null);
    const pending = useRef(null);

    useEffect(() => {
        let alive = true;
        const apply = (r) => {
            if (!alive) return;
            if (r?.success) { setM(r.masa); setLeft(r.masa.kalanSn); setError(''); } else setError(r?.error || 'Masa okunamadı');
        };
        call('admin:watch', { no }).then(apply);
        // Masadaki her olayda (çekme, atma, açma, işleme, ceza, el sonu…) durum kısa gecikmeyle yeniden alınır
        const refresh = () => {
            if (pending.current) return;
            pending.current = setTimeout(() => { pending.current = null; call('admin:tableState', { no }).then(apply); }, 250);
        };
        const s = socket.current;
        const onAny = (event) => { if (/^(game|player|room):/.test(event)) refresh(); };
        s?.onAny(onAny);
        const poll = setInterval(refresh, 4000); // olay kaçarsa
        return () => {
            alive = false;
            s?.offAny(onAny);
            clearInterval(poll);
            clearTimeout(pending.current);
            call('admin:unwatch');
        };
    }, [no, call, socket]);

    // Sıra süresi saniye saniye geri sayar (sunucu her olayda düzeltir)
    useEffect(() => {
        const id = setInterval(() => setLeft(v => (v > 0 ? v - 1 : v)), 1000);
        return () => clearInterval(id);
    }, []);

    const g = m?.oyun;
    const players = g?.players || [];
    const nameOf = Object.fromEntries(players.map(p => [p.id, p.name]));
    const sel = focus || players.find(p => !m?.baglanti[p.id]?.bot)?.id || players[0]?.id;
    const okey = g?.okeyTile;
    const discardsBy = Object.fromEntries(players.map(p => [p.id, []]));
    (g?.discardPile || []).forEach((t, i) => { const o = g.discardOwners?.[i]; if (o && discardsBy[o]) discardsBy[o].push(t); });
    const lastDiscardId = g?.discardPile?.[g.discardPile.length - 1]?.id;

    return (
        <div className="yp-spec" role="dialog" aria-modal="true" aria-label={`#${no} masasını gizli izleme`}>
            <header className="yp-spec-top">
                <div className="yp-spec-title">
                    <h2>#{no} · {m?.ad ?? '…'}</h2>
                    <span className="yp-spec-badge">gizli izleme · oyuncular görmez</span>
                </div>
                {g && (
                    <div className="yp-spec-info">
                        <span><b>{g.round}. el</b>{g.isHugoRound && <i className="yp-hugo">Hugo</i>}</span>
                        <span>gösterge <T t={g.indicatorTile} /></span>
                        <span>okey {okey ? <T t={okey} /> : <T t={{ isJoker: true }} />}</span>
                        <span>deste <b>{g.deckCount}</b></span>
                        <span>sıra <b>{nameOf[g.currentPlayerId] || '-'}</b>{left != null && <> · <b className={left <= 10 ? 'yp-warn' : ''}>{left} sn</b></>} · {g.turnAction === 'draw' && (m.eller[g.currentPlayerId]?.length ?? 0) < 15 ? 'çekecek' : 'atacak'}</span>
                    </div>
                )}
                <button type="button" className="yp-spec-close" onClick={onClose}>Kapat</button>
            </header>
            {error && <p className="yp-error">{error}</p>}
            {!g ? <p className="yp-empty">{m ? 'Bu masada oyun başlamadı.' : 'Yükleniyor…'}</p> : (
                <div className="yp-spec-body">
                    <nav className="yp-spec-players" aria-label="Oyuncu seç">
                        {players.map(p => {
                            const c = m.baglanti[p.id] || {};
                            return (
                                <button key={p.id} type="button" aria-pressed={sel === p.id}
                                    className={`yp-spec-player ${sel === p.id ? 'is-sel' : ''} ${g.currentPlayerId === p.id ? 'is-turn' : ''}`}
                                    onClick={() => setFocus(p.id)}>
                                    <b>{p.name}</b>
                                    <span>{p.totalScore} puan · {p.penaltyScore} ceza · {m.eller[p.id]?.length ?? 0} taş</span>
                                    <span>{c.bot ? 'yapay zekâ' : c.bagli ? <span className="yp-ok">bağlı</span> : <span className="yp-warn">kopuk</span>}{p.isOpen && ` · açtı (${p.openedTotal})`}</span>
                                </button>
                            );
                        })}
                    </nav>

                    <section className="yp-spec-hand" aria-label={`${nameOf[sel]} eli`}>
                        <h3>{nameOf[sel]} · eli <small>{m.eller[sel]?.length ?? 0} taş · renge göre sıralı</small></h3>
                        <div className="yp-spec-tiles">{sortHand(m.eller[sel] || []).map(t => <T key={t.id} t={t} okey={okey} size="lg" />)}</div>
                    </section>

                    <div className="yp-spec-grid">
                        <section aria-label="Masadaki perler">
                            <h3>Yere açılan perler</h3>
                            {players.map(p => {
                                const sets = (g.tableSets || []).filter(st => st.playerId === p.id);
                                if (!sets.length) return null;
                                return (
                                    <div key={p.id} className={`yp-spec-owner ${sel === p.id ? 'is-sel' : ''}`}>
                                        <span className="yp-spec-owner-name">{p.name}</span>
                                        <div className="yp-spec-sets">
                                            {sets.map(st => <span key={st.id} className="yp-spec-set">{st.tiles.map(t => <T key={t.id} t={t} okey={okey} />)}</span>)}
                                        </div>
                                    </div>
                                );
                            })}
                            {!(g.tableSets || []).length && <p className="yp-empty">Henüz açılan yok.</p>}
                        </section>

                        <section aria-label="Atılan taşlar">
                            <h3>Atılan taşlar <small>eskiden yeniye</small></h3>
                            {players.map(p => (
                                <div key={p.id} className={`yp-spec-owner ${sel === p.id ? 'is-sel' : ''}`}>
                                    <span className="yp-spec-owner-name">{p.name}</span>
                                    <div className="yp-spec-sets">{discardsBy[p.id]?.length
                                        ? discardsBy[p.id].map(t => <T key={t.id} t={t} okey={okey} dim={t.id !== lastDiscardId} />)
                                        : <span className="yp-empty">-</span>}</div>
                                </div>
                            ))}
                        </section>
                    </div>

                    <div className="yp-spec-grid">
                        <section aria-label="Bu eldeki cezalar">
                            <h3>Bu eldeki cezalar</h3>
                            {!m.cezalar.length ? <p className="yp-empty">Ceza yok.</p> : (
                                <ol className="yp-feed">
                                    {[...m.cezalar].reverse().map((c, i) => (
                                        <li key={i} className={c.playerId === sel ? 't-ceza' : ''}>
                                            <span className="yp-feed-text"><b>{c.playerName}</b> {c.amount > 0 ? '+' : ''}{c.amount} · {c.reason}{c.tile ? ` · ${c.tile}` : ''}</span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </section>

                        <section aria-label="Tabela">
                            <h3>Tabela</h3>
                            <table className="yp-scores">
                                <thead><tr><th>El</th>{players.map(p => <th key={p.id} className={sel === p.id ? 'is-sel' : ''}>{p.name}</th>)}</tr></thead>
                                <tbody>
                                    {(g.roundHistory || []).map(h => (
                                        <tr key={h.round}>
                                            <td>{h.round}{h.isHugoRound ? ' H' : ''}</td>
                                            {players.map(p => <td key={p.id} className={sel === p.id ? 'is-sel' : ''}>{h.results.find(r => r.playerId === p.id)?.roundTotal ?? '-'}</td>)}
                                        </tr>
                                    ))}
                                    <tr className="yp-total"><td>Toplam</td>{players.map(p => <td key={p.id} className={sel === p.id ? 'is-sel' : ''}>{p.totalScore}</td>)}</tr>
                                </tbody>
                            </table>
                        </section>
                    </div>

                    <section aria-label="Diğer eller">
                        <h3>Bütün eller</h3>
                        {players.filter(p => p.id !== sel).map(p => (
                            <div key={p.id} className="yp-spec-owner">
                                <button type="button" className="yp-link yp-spec-owner-name" onClick={() => setFocus(p.id)}>{p.name}</button>
                                <div className="yp-spec-sets">{sortHand(m.eller[p.id] || []).map(t => <T key={t.id} t={t} okey={okey} />)}</div>
                            </div>
                        ))}
                    </section>
                </div>
            )}
        </div>
    );
}
