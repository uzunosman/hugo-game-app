// Masaya gelen taş animasyonu (işleme, el açma, per indirme): taş, oynayan oyuncunun kartından (kendin için ıstakadan) çıkıp
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
        const stagger = Math.min(90, 700 / tileIds.length); // çok taşlı açılış da 1 saniyeyi geçmesin
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
            ], { duration: DURATION, delay: i * stagger, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'backwards' })
                .finished.catch(() => {}).finally(() => { land(); ghost.remove(); });
        });
    }));
};

// Atılan taş: kaynaktan (ıstakadaki taş / bırakıldığı yer / atan oyuncunun kartı) köşeye uçar.
// Köşedeki yeni taş render sonrası bulunur, uçuş bitene kadar gizli kalır.
export const flyToCorner = (corner, from) => {
    if (!corner || !from || reducedMotion()) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const target = document.querySelector(`.tile-drop-zone[data-corner="${corner}"] .tile`);
        if (!target?.animate) return;
        const to = target.getBoundingClientRect();
        const ghost = target.cloneNode(true);
        ghost.classList.add('flying-discard');
        Object.assign(ghost.style, { position: 'fixed', left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, margin: '0', zIndex: 500, pointerEvents: 'none' });
        document.body.appendChild(ghost);
        target.style.visibility = 'hidden';
        const sx = from.left + from.width / 2 - (to.left + to.width / 2);
        const sy = from.top + from.height / 2 - (to.top + to.height / 2);
        const sc = from.width && to.width ? from.width / to.width : 1;
        const done = () => { target.style.visibility = ''; ghost.remove(); };
        ghost.animate([
            { transform: `translate(${sx}px, ${sy}px) scale(${sc})` },
            { transform: 'translate(0, 0) scale(1)' },
        ], { duration: 320, easing: 'cubic-bezier(.3,.8,.35,1)' }).finished.catch(() => {}).finally(done);
        setTimeout(done, 1000); // sekme arka plandaysa animasyon ilerlemez: köşedeki taş gizli kalmasın
    }));
};

// Başka oyuncunun kartının yeri (atılan taş oradan çıkar)
export const playerPanelRect = (playerId) => document.querySelector(`.player-panel[data-player-id="${playerId}"]`)?.getBoundingClientRect();
