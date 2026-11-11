import React, { useState } from 'react';
import '../../assets/css/components/Scoreboard.css';

const TOTAL_ROUNDS = 9;

const Scoreboard = ({ players, playerOpenStates, roundHistory = [] }) => {
    const [isOpen, setIsOpen] = useState(false);
    // Tıklanan elin dökümü (null = tabela görünümü)
    const [detailRound, setDetailRound] = useState(null);
    const historyOf = (n) => roundHistory.find(h => h.round === n);
    const close = () => { setIsOpen(false); setDetailRound(null); };

    if (!players || players.length === 0) return null;

    const getPlayerState = (p) => playerOpenStates?.[p.id] || {};

    return (
        <>
            <button className="scoreboard-toggle" onClick={() => setIsOpen(!isOpen)} title="Tabela">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="3" y1="15" x2="21" y2="15" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                </svg>
            </button>

            {isOpen && (
                <div className="scoreboard-overlay" onClick={close}>
                    <div className="scoreboard-modal scoreboard-kiraathane" onClick={(e) => e.stopPropagation()}>
                        <div className="scoreboard-paper">
                            {detailRound !== null && historyOf(detailRound) ? (
                                <RoundDetail entry={historyOf(detailRound)} players={players} onBack={() => setDetailRound(null)} />
                            ) : (
                            <table className="scoreboard-table">
                                <thead>
                                    <tr className="star-row">
                                        <th></th>
                                        {players.map((p) => {
                                            const state = getPlayerState(p);
                                            const count = state.per100PlusCount || 0;
                                            return (
                                                <th key={p.id}>{count > 0 ? '★'.repeat(count) : ''}</th>
                                            );
                                        })}
                                    </tr>
                                    <tr className="name-row">
                                        <th></th>
                                        {players.map((p) => (
                                            <th key={p.id}>{p.name}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Array.from({ length: TOTAL_ROUNDS }, (_, i) => i + 1).map((roundNum) => {
                                        const played = !!historyOf(roundNum);
                                        return (
                                        <tr
                                            key={roundNum}
                                            className={`round-row ${played ? 'is-played' : ''}`}
                                            onClick={played ? () => setDetailRound(roundNum) : undefined}
                                        >
                                            <td className="round-num">
                                                {played
                                                    ? <button type="button" className="round-link" onClick={(e) => { e.stopPropagation(); setDetailRound(roundNum); }} aria-label={`${roundNum}. elin dökümü`}>{roundNum}</button>
                                                    : roundNum}
                                            </td>
                                            {players.map((p) => {
                                                const state = getPlayerState(p);
                                                const s = (state.roundScores || [])[roundNum - 1];
                                                return (
                                                    <td key={p.id} className={s !== undefined && s < 0 ? 'negative' : ''}>
                                                        {s !== undefined ? s : ''}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="total-row">
                                        <td className="total-label">Toplam</td>
                                        {players.map((p) => {
                                            const state = getPlayerState(p);
                                            const total = state.totalScore ?? 0;
                                            return (
                                                <td key={p.id} className="total-cell">
                                                    <span className={total < 0 ? 'negative' : ''}>{total}</span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                </tfoot>
                            </table>
                            )}
                        </div>
                        <button className="scoreboard-close" onClick={close} aria-label="Tabelayı kapat">&times;</button>
                    </div>
                </div>
            )}
        </>
    );
};

// Bir elin dökümü: oyuncu başına elde kalan, cezalar, okey, çarpan, yıldız ve el puanı; altında o elin ceza kaydı
const RoundDetail = ({ entry, players, onBack }) => {
    const byId = Object.fromEntries(entry.results.map(r => [r.playerId, r]));
    const rows = [
        ['Elde kalan', r => r.effectiveHandScore ?? r.handScore],
        ['Cezalar', r => r.penaltyScore],
        ['Kullanılmayan okey', r => r.unusedOkeyPenalty],
        ['Çarpan', r => (r.multiplier > 1 ? `×${r.multiplier}` : '')],
        ['Yıldız', r => (r.stars > 0 ? '★'.repeat(r.stars) : '')],
    ];
    return (
        <div className="round-detail">
            <div className="round-detail-head">
                <button type="button" className="round-back" onClick={onBack}>‹ Tabela</button>
                <span className="round-detail-title">{entry.round}. el{entry.isHugoRound ? ' (Hugo)' : ''}</span>
            </div>
            <table className="scoreboard-table">
                <thead>
                    <tr className="name-row"><th></th>{players.map(p => <th key={p.id}>{p.name}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.map(([label, fn]) => (
                        <tr key={label}>
                            <td className="total-label">{label}</td>
                            {players.map(p => <td key={p.id}>{byId[p.id] ? (fn(byId[p.id]) || '') : ''}</td>)}
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="total-row">
                        <td className="total-label">El puanı</td>
                        {players.map(p => (
                            <td key={p.id} className="total-cell">
                                {byId[p.id]?.roundTotal ?? ''}{byId[p.id]?.isFinisher && <small className="finisher-mark"> bitirdi</small>}
                            </td>
                        ))}
                    </tr>
                </tfoot>
            </table>
            <div className="round-penalties">
                <div className="round-penalties-title">Bu elin cezaları</div>
                {entry.penalties?.length ? (
                    <ul>
                        {entry.penalties.map((p, i) => (
                            <li key={i} className={p.amount < 0 ? 'cancel' : undefined}>
                                [{p.tag}] {p.playerName}{p.tile ? ` ${p.tile}` : ''} <b>{p.amount > 0 ? '+' : ''}{p.amount}</b>
                            </li>
                        ))}
                    </ul>
                ) : <p className="round-penalties-empty">Bu elde ceza yazılmadı.</p>}
            </div>
        </div>
    );
};

export default Scoreboard;
