import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import PenaltyTiles from '../PenaltyTiles/PenaltyTiles';
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

            {/* body'ye çizilir: üst araç çubuğunun katmanında kalıp masadaki / uçan taşların altında kalmasın */}
            {isOpen && createPortal(
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
                </div>,
                document.body
            )}
        </>
    );
};

// Bir elin dökümü: oyuncu başına elde kalan, açmama, oyun içi cezalar, okey, çarpan, yıldız ve el puanı
const RoundDetail = ({ entry, players, onBack }) => {
    const byId = Object.fromEntries(entry.results.map(r => [r.playerId, r]));
    // Oyun içi cezalar her oyuncunun kendi kolonunda: cezaya yol açan taş ve tutar ({ amount, tile, tag }).
    // İptal edilen cezalar (Kustu / geri alma iadesi: eksi kayıt) gösterilmez; iptal ettiği ceza da listeden düşer
    const penaltiesOf = (id) => {
        const list = entry.penalties
            ? entry.penalties.filter(p => p.playerId === id)
            : (byId[id]?.penaltyEntries || []).map(amount => ({ amount }));
        const out = list.filter(p => p.amount > 0);
        list.filter(p => p.amount < 0).forEach(p => { const i = out.map(x => x.amount).lastIndexOf(-p.amount); if (i !== -1) out.splice(i, 1); });
        return out;
    };
    // Çarpan gösterilmez: değerler çarpılmış hâliyle yazılır (Hugo × 2 dahil; cezalar zaten çarpanla yazıldı)
    const hugo = entry.isHugoRound ? 2 : 1;
    const hand = (r) => (r.effectiveHandScore ?? r.handScore) * hugo;
    const rows = [
        // Elde kalan taş cezası yalnızca yere açana; açmayanın sabit cezası ayrı satırda
        ['Elde kalan', r => (r.isOpen === false || r.isFinisher ? '' : hand(r))],
        ['Açmadı', r => (r.isOpen === false && !r.isFinisher ? hand(r) : '')],
        ['Cezalar', (r, list) => (list.length ? (
            <span className="penalty-cell">
                {list.map((p, i) => (
                    <span key={i} className="penalty-item">
                        <PenaltyTiles label={p.tile} tag={p.tag} />
                        <span className="penalty-amount">{p.amount}</span>
                    </span>
                ))}
            </span>
        ) : '')],
        ['Kullanılmayan okey', r => (r.unusedOkeyPenalty ? r.unusedOkeyPenalty * hugo : '')],
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
                            {players.map(p => <td key={p.id}>{byId[p.id] ? (fn(byId[p.id], penaltiesOf(p.id)) || '') : ''}</td>)}
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
        </div>
    );
};

export default Scoreboard;
