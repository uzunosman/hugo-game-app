import React from 'react';

// Ceza kaydındaki taş etiketi ("kırmızı 5", "mavi 5 + mavi 5", "sahte okey") ıstakadaki gibi küçük taş olarak çizilir;
// taşsız cezalarda (geri alma, süre) kısa etiket yazılır. Stil: Scoreboard.css (.pen-tile)
const COLOR_OF = { 'kırmızı': 'red', 'mavi': 'blue', 'siyah': 'black', 'sarı': 'yellow' };

const PenaltyTiles = ({ label, tag }) => {
    if (!label) return <span className="pen-tag">{tag || 'ceza'}</span>;
    return label.split(' + ').map((part, i) => {
        const p = part.trim();
        const joker = p === 'sahte okey';
        const [name, value] = p.split(' ');
        return <span key={i} className={`pen-tile ${joker ? 'purple' : COLOR_OF[name] || ''}`} aria-label={p}>{joker ? '★' : value}</span>;
    });
};

export default PenaltyTiles;
