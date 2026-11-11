import React, { useEffect, useState } from 'react';
import { avatarFor } from '../../utils/avatar';
import '../../assets/css/components/RoundSummary.css';

const BREAK_SECONDS = 5; // sunucudaki el / oyun arası (ROUND_BREAK_MS) ile aynı

// Kıraathane tabelası: kâğıda kalemle yazılmış gibi. 5 sn sonra yeni el başlar (oyun sonunda masa
// oda ekranına döner); tabela oyuncu kapatana kadar açık kalır.
const RoundSummary = ({ roundData, isLastRound, onLeave, onClose }) => {
    const [left, setLeft] = useState(BREAK_SECONDS);
    useEffect(() => {
        const t = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000);
        return () => clearInterval(t);
    }, []);

    const results = roundData?.results || [];
    if (!results.length) return null;

    const low = Math.min(...results.map(r => r.totalScore));
    const botIds = new Set((roundData.players || []).filter(p => p.isBot).map(p => p.id));
    const winners = results.filter(r => r.totalScore === low);

    const note = (r) => {
        const parts = [];
        if (r.isFinisher) parts.push('bitirdi');
        if (r.isFinisher && r.finishedWithJoker) parts.push('okeyle');
        if (r.isFinisher && r.finishedWithPairs) parts.push('çiftten');
        if (r.isFinisher && r.finishedElden) parts.push('elden');
        return parts.join(', ');
    };

    return (
        <div className="tabela-overlay" role="dialog" aria-modal="true" aria-label={isLastRound ? 'Oyun sonu tabelası' : `${roundData.round}. el tabelası`}>
            <div className="tabela">
                {onClose && (
                    <button type="button" className="tabela-close" onClick={onClose} aria-label="Tabelayı kapat">×</button>
                )}
                <h2 className="tabela-title">
                    {isLastRound ? 'Oyun bitti' : `${roundData.round}. el`}
                    {roundData.isHugoRound && <span className="tabela-hugo">Hugo</span>}
                </h2>

                <table className="tabela-table">
                    <thead>
                        <tr><th scope="col">Oyuncu</th><th scope="col">Bu el</th><th scope="col">Toplam</th></tr>
                    </thead>
                    <tbody>
                        {results.map(r => (
                            <tr key={r.playerId} className={r.isFinisher ? 'is-finisher' : undefined}>
                                <th scope="row">
                                    <img src={avatarFor(r.playerId, botIds.has(r.playerId))} alt="" />
                                    <span className="tabela-name">
                                        {r.playerName}
                                        {r.stars > 0 && <span className="tabela-stars" aria-label={`${r.stars} yıldız`}>{'★'.repeat(r.stars)}</span>}
                                        {note(r) && <small>{note(r)}</small>}
                                    </span>
                                </th>
                                <td className="tabela-round">{r.roundTotal}</td>
                                <td className={`tabela-total ${isLastRound && r.totalScore === low ? 'is-winner' : ''}`}>{r.totalScore}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {isLastRound && (
                    <p className="tabela-winner">
                        {winners.length > 1 ? 'Kazananlar' : 'Kazanan'}: {winners.map(w => w.playerName).join(' ve ')}
                    </p>
                )}

                <p className="tabela-foot">
                    <span>
                        {isLastRound
                            ? (left > 0 ? `${left} sn sonra masaya dönülüyor` : 'Yeni oyun için herkes hazır olmalı')
                            : (left > 0 ? `Sıradaki el ${left} sn sonra başlıyor` : 'Yeni el başladı')}
                    </span>
                    <span className="tabela-actions">
                        {isLastRound && onLeave && (
                            <button type="button" className="tabela-leave" onClick={onLeave}>Masadan kalk</button>
                        )}
                        {onClose && <button type="button" className="tabela-leave" onClick={onClose}>Kapat</button>}
                    </span>
                </p>
            </div>
        </div>
    );
};

export default RoundSummary;
