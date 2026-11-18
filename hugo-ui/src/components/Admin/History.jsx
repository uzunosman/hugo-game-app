import { useEffect, useState } from 'react';
import { Chip, Chips, clock, describe } from './format';

// Oyun geçmişi (/admin/history): oyuncu ara → oyunları → bir oyunun elleri (puan tablosu) → bir elin el başı dağıtımı ve
// sıra sıra bütün hamleleri. Kaynak oyun kaydı; oyuncular ada göre bulunur.

const day = (t) => new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function RoundView({ call, game, round }) {
    const [events, setEvents] = useState(null);
    useEffect(() => {
        setEvents(null);
        call('admin:historyRound', { game: game.game, round }).then(r => setEvents(r?.success ? r.events : []));
    }, [call, game.game, round]);
    if (!events) return <p className="yp-empty">Yükleniyor…</p>;
    const deal = events.find(e => e.dagitim)?.dagitim;
    const rows = events.map(e => ({ e, d: describe(e) })).filter(r => r.d && !r.d.dagitim);
    return (
        <div className="yp-hist-round">
            {deal ? (
                <div className="yp-hist-deal">
                    <h3>El başı <small>gösterge <Chip label={deal.gosterge} /> okey <Chip label={deal.okey} /></small></h3>
                    {Object.entries(deal.eller).map(([name, hand]) => (
                        <div key={name} className="yp-hand"><b>{name}</b> <Chips list={hand} /></div>
                    ))}
                </div>
            ) : <p className="yp-empty">Bu elin dağıtım kaydı yok.</p>}
            <h3>Hamleler <small>{rows.length} satır, olduğu sırayla</small></h3>
            <ol className="yp-feed">
                {rows.length === 0 && <li className="yp-empty">Bu elde kayıt yok.</li>}
                {rows.map(({ e, d }, i) => (
                    <li key={i} className={d.tur ? `t-${d.tur}` : ''}>
                        <time>{clock(e.t)}</time>
                        <span className="yp-feed-text">
                            {d.kim && <b>{d.kim}</b>} {d.ne} {d.taslar && <Chips list={d.taslar} />}
                            {d.setler?.map((s, j) => <Chips key={j} list={s} />)}
                            {d.sonuc && <span className="yp-result">{d.sonuc.map(p => `${p.name} ${p.score}`).join(' · ')}</span>}
                        </span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function GameView({ call, game, name }) {
    const [rounds, setRounds] = useState(null);
    const [round, setRound] = useState(null);
    useEffect(() => {
        setRounds(null); setRound(null);
        call('admin:historyGame', { game: game.game }).then(r => setRounds(r?.success ? r.rounds : []));
    }, [call, game.game]);
    const all = Array.from({ length: Math.max(game.rounds || 0, rounds?.length || 0) }, (_, i) => i + 1);
    return (
        <section className="yp-hist-game" aria-label="Oyun ayrıntısı">
            <h3>#{game.tableNo} · {day(game.started)} <small>{game.players.join(', ')}</small></h3>
            <table className="yp-scores">
                <thead><tr><th>El</th>{game.players.map(p => <th key={p} className={p === name ? 'is-sel' : ''}>{p}</th>)}<th /></tr></thead>
                <tbody>
                    {all.map(n => {
                        const r = rounds?.find(x => x.round === n);
                        return (
                            <tr key={n} className={round === n ? 'is-turn' : ''}>
                                <td>{n}{r?.hugo ? ' H' : ''}</td>
                                {game.players.map(p => {
                                    const x = r?.results.find(y => y.name === p);
                                    return <td key={p} className={p === name ? 'is-sel' : ''}>{x ? `${x.roundTotal}${x.finisher ? ' ✓' : ''}` : '-'}</td>;
                                })}
                                <td><button type="button" className="yp-link" onClick={() => setRound(n)}>{round === n ? 'açık' : 'göster'}</button></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {round && <RoundView call={call} game={game} round={round} />}
        </section>
    );
}

export default function History({ call }) {
    const [q, setQ] = useState('');
    const [players, setPlayers] = useState([]);
    const [name, setName] = useState(null);
    const [games, setGames] = useState(null);
    const [game, setGame] = useState(null);
    const [error, setError] = useState('');

    // Yazdıkça ara (son oynayanlar önce); boşken son oynayanlar
    useEffect(() => {
        const t = setTimeout(() => call('admin:historyPlayers', { q }).then(r => {
            if (!r?.success) return setError(r?.error || 'Aranamadı');
            setError('');
            setPlayers(r.players);
        }), 250);
        return () => clearTimeout(t);
    }, [call, q]);
    useEffect(() => {
        if (!name) return;
        setGames(null); setGame(null);
        call('admin:historyGames', { name }).then(r => setGames(r?.success ? r.games : []));
    }, [call, name]);

    return (
        <section className="yp-section" aria-labelledby="yp-history">
            <div className="yp-section-head"><h2 id="yp-history">Geçmiş</h2><small>oyuncu ara → oyun → el: dağıtım ve bütün hamleler</small></div>
            {error && <p className="yp-error" role="alert">{error}</p>}
            <div className="yp-hist">
                <div className="yp-hist-players">
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Oyuncu adı" aria-label="Oyuncu ara" />
                    <ul>
                        {players.map(p => (
                            <li key={p.name}>
                                <button type="button" className={`yp-card ${name === p.name ? 'is-sel' : ''}`} aria-pressed={name === p.name} onClick={() => setName(p.name)}>
                                    <span className="yp-task-title">{p.name}</span>
                                    <small className="yp-card-meta">{p.games} oyun · son {day(p.last)}</small>
                                </button>
                            </li>
                        ))}
                        {!players.length && !error && <li className="yp-empty">Oyuncu bulunamadı.</li>}
                    </ul>
                </div>
                <div className="yp-hist-main">
                    {!name && <p className="yp-empty">Soldan bir oyuncu seç.</p>}
                    {name && !games && <p className="yp-empty">Yükleniyor…</p>}
                    {games && !games.length && <p className="yp-empty">{name} için oyun kaydı yok.</p>}
                    {games?.length > 0 && (
                        <ul className="yp-hist-games">
                            {games.map(g => {
                                const winner = g.finished && g.scores.length ? [...g.scores].sort((a, b) => a.total - b.total)[0].name : null;
                                return (
                                    <li key={g.game}>
                                        <button type="button" className={`yp-card ${game?.game === g.game ? 'is-sel' : ''}`} aria-pressed={game?.game === g.game} onClick={() => setGame(g)}>
                                            <span className="yp-task-title">#{g.tableNo} · {day(g.started)}</span>
                                            <span className="yp-card-meta">
                                                <small>{g.finished ? `bitti · kazanan ${winner}` : `${g.rounds}. ele kadar`} · {g.players.filter(p => p !== name).join(', ')}</small>
                                            </span>
                                            {g.scores.length > 0 && <small className="yp-card-meta">{g.scores.map(s => `${s.name} ${s.total}`).join(' · ')}</small>}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {game && <GameView call={call} game={game} name={name} />}
                </div>
            </div>
        </section>
    );
}
