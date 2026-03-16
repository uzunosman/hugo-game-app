import React from 'react';
import '../../assets/css/components/RoundSummary.css';

const RoundSummary = ({ roundData, isLastRound, onClose }) => {
    if (!roundData) return null;

    const { results, round, isHugoRound } = roundData;
    if (!results || results.length === 0) return null;

    const sorted = [...results].sort((a, b) => a.totalScore - b.totalScore);

    return (
        <div className="round-summary-overlay">
            <div className="round-summary-modal">
                <div className="round-summary-header">
                    <span className="round-summary-title">
                        Tur {round} Sonu
                        {isHugoRound && <span className="hugo-tag">HUGO ×2</span>}
                    </span>
                    <button className="round-summary-close" onClick={onClose}>&times;</button>
                </div>

                <div className="round-summary-cards">
                    {sorted.map((r, idx) => (
                        <div key={r.playerId} className={`summary-card ${idx === 0 ? 'best' : ''}`}>
                            <div className="summary-rank">#{idx + 1}</div>
                            <div className="summary-name">{r.playerName}</div>

                            <div className="summary-breakdown">
                                {r.handScore > 0 && (
                                    <div className="breakdown-row">
                                        <span>Elde kalan</span>
                                        <span>+{r.handScore}</span>
                                    </div>
                                )}
                                {r.penaltyEntries && r.penaltyEntries.length > 0 && (
                                    r.penaltyEntries.map((entry, i) => (
                                        <div key={i} className="breakdown-row penalty">
                                            <span>Ceza</span>
                                            <span>+{entry}</span>
                                        </div>
                                    ))
                                )}
                                {r.openBonus !== 0 && (
                                    <div className="breakdown-row bonus">
                                        <span>Per 100+ ★</span>
                                        <span>{r.openBonus}</span>
                                    </div>
                                )}
                                {r.finishBonus !== 0 && (
                                    <div className="breakdown-row bonus">
                                        <span>Bitirme</span>
                                        <span>{r.finishBonus}</span>
                                    </div>
                                )}
                                {r.multiplier > 1 && (
                                    <div className="breakdown-row multiplier">
                                        <span>Hugo çarpanı</span>
                                        <span>×{r.multiplier}</span>
                                    </div>
                                )}
                            </div>

                            <div className="summary-scores">
                                <div className="round-score">
                                    <span className="label">Tur</span>
                                    <span className={`value ${r.roundTotal < 0 ? 'negative' : ''}`}>{r.roundTotal}</span>
                                </div>
                                <div className="total-score">
                                    <span className="label">Toplam</span>
                                    <span className={`value ${r.totalScore < 0 ? 'negative' : ''}`}>{r.totalScore}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="round-summary-footer">
                    {isLastRound ? (
                        <span className="game-over-text">Oyun Bitti!</span>
                    ) : (
                        <button className="round-summary-continue-btn" onClick={onClose}>Devam Et</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RoundSummary;
