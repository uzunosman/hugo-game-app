// İşlenen taş animasyonu: taş, işleyen oyuncunun kartından (kendin için ıstakadan) çıkıp
// masadaki perdeki yerine kısa bir yayla iner. Herkesin ekranında, sunucunun işleme olayıyla oynar.

// Yolda olan taş id'leri: OpenSetsArea bunları iniş bitene kadar gizli çizer
export const incomingTiles = new Set();

const DURATION = 480;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const sourceRect = (playerId, myId) => {
    const el = playerId === myId
        ? document.querySelector('.tile-holder')
        : document.querySelector(`.player-panel[data-player-id="${playerId}"]`);
    return el?.getBoundingClientRect();
};

// Masaya yeni çizilen taşları (tileIds) işleyenin yerinden uçurur; render sonrasına ertelenir
export const flyTilesIn = (tileIds, playerId, myId) => {
    if (!tileIds.length) return;
    if (reducedMotion()) return;
    tileIds.forEach(id => incomingTiles.add(id));
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const from = sourceRect(playerId, myId);
        tileIds.forEach((id, i) => {
            const target = document.querySelector(`.open-set-tile[data-tile-id="${id}"]`);
            const land = () => { incomingTiles.delete(id); target?.classList.remove('incoming'); };
            if (!target || !from || !target.animate) return land();
            const to = target.getBoundingClientRect();
            const ghost = target.cloneNode(true);
            ghost.classList.remove('incoming');
            ghost.classList.add('flying-tile');
            Object.assign(ghost.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
            document.body.appendChild(ghost);
            // Kaynak: kartın/ıstakanın ortası (kendin için ıstakanın üst kenarı)
            const sx = from.left + from.width / 2 - (to.left + to.width / 2);
            const sy = (playerId === myId ? from.top : from.top + from.height / 2) - (to.top + to.height / 2);
            const lift = -Math.min(40, Math.hypot(sx, sy) * 0.15); // yolun ortasında hafif yükselir
            ghost.animate([
                { transform: `translate(${sx}px, ${sy}px) scale(1.25) rotate(-6deg)`, opacity: 0.85 },
                { transform: `translate(${sx * 0.45}px, ${sy * 0.45 + lift}px) scale(1.15) rotate(-2deg)`, opacity: 1, offset: 0.55 },
                { transform: 'translate(0, 0) scale(1) rotate(0)', opacity: 1 },
            ], { duration: DURATION, delay: i * 90, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'backwards' })
                .finished.catch(() => {}).finally(() => { land(); ghost.remove(); });
        });
    }));
};
