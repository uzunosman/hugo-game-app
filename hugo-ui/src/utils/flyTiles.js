// Masaya gelen taş animasyonu (işleme, el açma, per indirme): taş, oynayan oyuncunun kartından (kendin için ıstakadan) çıkıp
// masadaki perdeki yerine kısa bir yayla iner. Herkesin ekranında, sunucunun işleme olayıyla oynar.

// Yolda olan taş id'leri: OpenSetsArea bunları iniş bitene kadar gizli çizer
export const incomingTiles = new Set();
// Kendi taşlarımızın çıkış yeri (sürükleyip bırakılan yer): yere açılışta iniş oradan başlar
export const tileOrigins = new Map();

const DURATION = 480;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const sourceRect = (playerId, myId) => {
    const el = playerId === myId
        ? document.querySelector('.tile-holder')
        : document.querySelector(`.player-panel[data-player-id="${playerId}"]`);
    return el?.getBoundingClientRect();
};

// Masaya yeni çizilen taşları (tileIds) işleyenin yerinden uçurur; render sonrasına ertelenir
// own: kendi hamlemiz de uçsun mu (yere per açma / indirme: evet; işleme: hayır, yalnızca diğer oyuncular görür)
export const flyTilesIn = (tileIds, playerId, myId, own = false) => {
    if (!tileIds.length) return;
    const mine = playerId === myId;
    if (reducedMotion() || (mine && !own)) { tileIds.forEach(id => tileOrigins.delete(id)); return; }
    tileIds.forEach(id => incomingTiles.add(id));
    // Kendi taşı: bırakıldığı yer ya da ıstakadaki yeri (henüz ıstakadan kalkmadıysa) şimdi alınır
    const origins = mine ? Object.fromEntries(tileIds.map(id => [id, tileOrigins.get(id) || rackTileEl(id)?.getBoundingClientRect()])) : {};
    tileIds.forEach(id => tileOrigins.delete(id));
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const from = sourceRect(playerId, myId);
        const stagger = Math.min(90, 700 / tileIds.length); // çok taşlı açılış da 1 saniyeyi geçmesin
        tileIds.forEach((id, i) => {
            const target = document.querySelector(`.open-set-tile[data-tile-id="${id}"]`);
            const land = () => { incomingTiles.delete(id); target?.classList.remove('incoming'); };
            if (!target || !target.animate) return land();
            const to = target.getBoundingClientRect();
            if (origins[id]) { // kendi taşı: bıraktığın yerden masadaki yerine süzülür
                target.style.visibility = 'hidden';
                return flyClone(target, origins[id], to, PLACE_MS, () => { target.style.visibility = ''; land(); });
            }
            if (!from) return land();
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
export const flyToCorner = (corner, from, tileId) => {
    if (!corner || !from || reducedMotion()) return;
    whenRendered(() => document.querySelector(`.tile-drop-zone[data-corner="${corner}"] .tile[data-tile-id="${tileId}"]`), (target) => {
        if (!target?.animate) return;
        const to = target.getBoundingClientRect();
        const ghost = target.cloneNode(true);
        ghost.classList.add('flying-discard');
        Object.assign(ghost.style, { position: 'fixed', left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, margin: '0', zIndex: 500, pointerEvents: 'none' });
        document.body.appendChild(ghost);
        target.style.visibility = 'hidden';
        const zone = target.closest('.tile-drop-zone');
        if (zone) zone.dataset.flight = '1'; // uçarken alttaki eski taş görünür
        const sx = from.left + from.width / 2 - (to.left + to.width / 2);
        const sy = from.top + from.height / 2 - (to.top + to.height / 2);
        const sc = from.width && to.width ? from.width / to.width : 1;
        const done = () => { target.style.visibility = ''; ghost.remove(); if (zone) delete zone.dataset.flight; };
        ghost.animate([
            { transform: `translate(${sx}px, ${sy}px) scale(${sc})` },
            { transform: 'translate(0, 0) scale(1)' },
        ], { duration: PLACE_MS, easing: EASE }).finished.catch(() => {}).finally(done);
        setTimeout(done, 1000); // sekme arka plandaysa animasyon ilerlemez: köşedeki taş gizli kalmasın
    });
};

// Başka oyuncunun kartının yeri (atılan taş oradan çıkar)
export const playerPanelRect = (playerId) => document.querySelector(`.player-panel[data-player-id="${playerId}"]`)?.getBoundingClientRect();

// Taşın yerine yerleşmesi: gerçek taş gibi yavaşlayarak oturur (mıknatıs gibi çekilmez); hız tek yerden ayarlanır
const EASE = 'cubic-bezier(.22,.61,.36,1)';
export const PLACE_MS = 420;

// landed(): varış yerindeki gerçek öğe hazır mı; değilse kopya varış yerinde bekler (en çok 1,5 sn), boşluk ya da sıçrama olmaz
export const flyClone = (srcEl, fromRect, toRect, duration = PLACE_MS, onDone, landed) => {
    if (!srcEl || !fromRect || !toRect || reducedMotion()) return onDone?.();
    const ghost = srcEl.cloneNode(true);
    ghost.classList.remove('selected');
    ghost.classList.add('flying-discard');
    ghost.querySelectorAll('.draw-hint, .remaining-count').forEach(n => n.remove());
    Object.assign(ghost.style, {
        position: 'fixed', left: `${toRect.left}px`, top: `${toRect.top}px`, width: `${toRect.width}px`, height: `${toRect.height}px`,
        margin: '0', zIndex: 500, pointerEvents: 'none', visibility: 'visible', opacity: '1', transformOrigin: '0 0',
    });
    document.body.appendChild(ghost);
    const sc = toRect.width ? fromRect.width / toRect.width : 1;
    let gone = false;
    const done = () => { if (!gone) { gone = true; ghost.remove(); onDone?.(); } };
    const finish = () => {
        if (!landed || landed()) return done();
        const t0 = Date.now();
        const wait = () => (landed() || Date.now() - t0 > 1500 ? done() : requestAnimationFrame(wait));
        requestAnimationFrame(wait);
    };
    ghost.animate([
        { transform: `translate(${fromRect.left - toRect.left}px, ${fromRect.top - toRect.top}px) scale(${sc})` },
        { transform: 'none' },
    ], { duration, easing: EASE, fill: 'forwards' }).finished.catch(() => {}).finally(finish);
    setTimeout(done, duration + 2000); // arka plan sekmesinde animasyon ilerlemez
};

// Sürüklenip ıstakaya bırakılan taş bıraktığın yerden yerine yavaşça oturur
export const settleFrom = (el, fromRect) => slideFrom(el, fromRect, PLACE_MS);


// Öğenin kopyası fromRect'ten toRect'e uçar, sonra silinir (ıstakadan köşeye atılan taş: sunucu cevabını beklemeden)
// Yerine yeni çizilmiş öğe fromRect'ten kendi yerine kayar (desteden çekilen taş, reddedilip ıstakaya dönen taş)
export const slideFrom = (el, fromRect, duration = 240) => {
    if (!el?.animate || !fromRect || reducedMotion()) return;
    const r = el.getBoundingClientRect();
    // Kayarken tıklanamaz: desteye çift tıklayınca ikinci tık, desteden kayan taşa gidip onu atmasın
    el.style.pointerEvents = 'none';
    el.animate([
        { transform: `translate(${fromRect.left - r.left}px, ${fromRect.top - r.top}px)` },
        { transform: 'none' },
    ], { duration, easing: EASE }).finished.catch(() => {}).finally(() => { el.style.pointerEvents = ''; });
};

// Öğe DOM'a yazıldığı anda (boyamadan önce, MutationObserver) çalıştırır: yerinde bir kare görünüp sonra sıçramasın (titreme)
export const whenRendered = (find, fn, timeout = 2000) => {
    const now = find();
    if (now) return fn(now);
    const obs = new MutationObserver(() => {
        const el = find();
        if (el) { obs.disconnect(); clearTimeout(t); fn(el); }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tile-id'] });
    const t = setTimeout(() => obs.disconnect(), timeout);
};

export const rackTileEl = (tileId) => document.querySelector(`.tile-holder .tile[data-tile-id="${tileId}"]`);
