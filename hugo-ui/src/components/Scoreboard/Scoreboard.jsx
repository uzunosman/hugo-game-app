import React, { useState } from 'react';
import '../../assets/css/components/Scoreboard.css';

const TOTAL_ROUNDS = 9;

const Scoreboard = ({ players, playerOpenStates }) => {
    const [isOpen, setIsOpen] = useState(false);

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
                <div className="scoreboard-overlay" onClick={() => setIsOpen(false)}>
                    <div className="scoreboard-modal scoreboard-kiraathane" onClick={(e) => e.stopPropagation()}>
                        <div className="scoreboard-paper">
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
                                    {Array.from({ length: TOTAL_ROUNDS }, (_, i) => i + 1).map((roundNum) => (
                                        <tr key={roundNum} className="round-row">
                                            <td className="round-num">{roundNum}</td>
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
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="total-row">
                                        <td className="total-label">Toplam</td>
                                        {players.map((p) => {
                                            const state = getPlayerState(p);
                                            const roundTotal = state.totalScore ?? 0;
                                            const penaltyTotal = state.penaltyScore ?? 0;
                                            return (
                                                <td key={p.id} className="total-cell">
                                                    <span className={roundTotal < 0 ? 'negative' : ''}>{roundTotal}</span>
                                                    {' '}
                                                    <span>{penaltyTotal}</span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <button className="scoreboard-close" onClick={() => setIsOpen(false)}>&times;</button>
                    </div>
                </div>
            )}
        </>
    );
};

export default Scoreboard;
