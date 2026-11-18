import { useSyncExternalStore } from 'react';
import { stageRoot, stageScale, toStage } from './stage';

// Masaya gelen taş animasyonu (işleme, el açma, per indirme): taş, oynayan oyuncunun kartından (kendin için ıstakadan) çıkıp
// masadaki perdeki yerine kısa bir yayla iner. Herkesin ekranında, sunucunun işleme olayıyla oynar.

// Yolda olan taş id'leri: OpenSetsArea bunları iniş bitene kadar gizli çizer
export const incomingTiles = new Set();
// Kendi taşlarımızın çıkış yeri (sürükleyip bırakılan yer): yere açılışta iniş oradan başlar
export const tileOrigins = new Map();
// Tıklayarak (seçip yuvaya dokunarak) işlenen kendi taşlarımız: işleme animasyonu bize de gösterilir
export const animateOwn = new Set();

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
    if (tileIds.some(id => animateOwn.has(id))) own = true;
    tileIds.forEach(id => animateOwn.delete(id));
    if (reducedMotion() || (mine && !own)) { tileIds.forEach(id => tileOrigins.delete(id)); return; }
    tileIds.forEach(id => incomingTiles.add(id));
    // Kendi taşı: bırakıldığı yer ya da ıstakadaki yeri (henüz ıstakadan kalkmadıysa) şimdi alınır
    const origins = mine ? Object.fromEntries(tileIds.map(id => [id, tileOrigins.get(id) || rackTileEl(id)?.getBoundingClientRect()])) : {};
    tileIds.forEach(id => tileOrigins.delete(id));
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const from = toStage(sourceRect(playerId, myId));
        const stagger = Math.min(90, 700 / tileIds.length); // çok taşlı açılış da 1 saniyeyi geçmesin
        tileIds.forEach((id, i) => {
            const target = document.querySelector(`.open-set-tile[data-tile-id="${id}"]`);
            const land = () => { incomingTiles.delete(id); target?.classList.remove('incoming'); };
            if (!target || !target.animate) return land();
            const toV = target.getBoundingClientRect();
            const to = toStage(toV);
            if (origins[id]) { // kendi taşı: bıraktığın yerden masadaki yerine süzülür; büyümüş per sonra taşla birlikte küçülür
                target.style.visibility = 'hidden';
                const look = tileLooks.get(id);
                tileLooks.delete(id);
                return morphFly(look, target, origins[id], toV, () => { target.style.visibility = ''; land(); releaseSet(); });
            }
            if (!from) return land();
            const ghost = target.cloneNode(true);
            ghost.classList.remove('incoming');
            ghost.classList.add('flying-tile');
            Object.assign(ghost.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
            stageRoot().appendChild(ghost);
            // Kaynak: kartın/ıstakanın ortası (kendin için ıstakanın üst kenarı)
            const sx = from.left + from.width / 2 - (to.left + to.width / 2);
            const sy = (playerId === myId ? from.top : from.top + from.height / 2) - (to.top + to.height / 2);
            const lift = -Math.min(40, Math.hypot(sx, sy) * 0.15); // yolun ortasında hafif yükselir
            ghost.animate([
                // Kartın üstünde görünmez başlar, yolda belirir: taşlar kartta üst üste binip beyaz öbek oluşturmaz
                { transform: `translate(${sx}px, ${sy}px) scale(0.9) rotate(-6deg)`, opacity: 0 },
                { transform: `translate(${sx * 0.45}px, ${sy * 0.45 + lift}px) scale(1.05) rotate(-2deg)`, opacity: 1, offset: 0.4 },
                { transform: 'translate(0, 0) scale(1) rotate(0)', opacity: 1 },
            ], { duration: DURATION, delay: i * stagger, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'backwards' })
                .finished.catch(() => {}).finally(() => { land(); ghost.remove(); });
        });
    }));
};

// Atılan taş: kaynaktan (ıstakadaki taş / bırakıldığı yer / atan oyuncunun kartı) köşeye uçar.
// Köşedeki yeni taş render sonrası bulunur, uçuş bitene kadar gizli kalır.
export const flyToCorner = (corner, fromV, tileId) => {
    if (!corner || !fromV || reducedMotion()) return;
    const from = toStage(fromV);
    whenRendered(() => document.querySelector(`.tile-drop-zone[data-corner="${corner}"] .tile[data-tile-id="${tileId}"]`), (target) => {
        if (!target?.animate) return;
        const to = toStage(target.getBoundingClientRect());
        const ghost = target.cloneNode(true);
        ghost.classList.add('flying-discard');
        Object.assign(ghost.style, { position: 'fixed', left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, margin: '0', zIndex: 500, pointerEvents: 'none' });
        stageRoot().appendChild(ghost);
        target.style.visibility = 'hidden';
        const zone = target.closest('.tile-drop-zone');
        if (zone) zone.dataset.flight = '1'; // uçarken alttaki eski taş görünür
        const sx = from.left + from.width / 2 - (to.left + to.width / 2);
        const sy = from.top + from.height / 2 - (to.top + to.height / 2);
        // Oyuncu kartından çıkan taş kartın boyunda değil, taş boyunda (biraz küçük) başlar
        const sc = from.width && to.width ? Math.min(1, from.width / to.width) : 1;
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
export const flyClone = (srcEl, fromV, toV, duration = PLACE_MS, onDone, landed) => {
    if (!srcEl || !fromV || !toV || reducedMotion()) return onDone?.();
    const fromRect = toStage(fromV), toRect = toStage(toV);
    const ghost = srcEl.cloneNode(true);
    ghost.classList.remove('selected');
    ghost.classList.add('flying-discard');
    ghost.querySelectorAll('.draw-hint, .remaining-count').forEach(n => n.remove());
    Object.assign(ghost.style, {
        position: 'fixed', left: `${toRect.left}px`, top: `${toRect.top}px`, width: `${toRect.width}px`, height: `${toRect.height}px`,
        margin: '0', zIndex: 500, pointerEvents: 'none', visibility: 'visible', opacity: '1', transformOrigin: '0 0',
    });
    stageRoot().appendChild(ghost);
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
    const k = stageScale(); // sahne ölçekliyse ekran farkı sahne birimine çevrilir
    // Kayarken tıklanamaz: desteye çift tıklayınca ikinci tık, desteden kayan taşa gidip onu atmasın
    el.style.pointerEvents = 'none';
    el.animate([
        { transform: `translate(${(fromRect.left - r.left) / k}px, ${(fromRect.top - r.top) / k}px)` },
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

// Başka oyuncu taş çekti: taş desteden (kapalı) ya da yerden (açık) o oyuncunun kartına doğru küçülerek uçar ve kartta söner
export const flyToPlayer = (srcEl, playerId) => {
    const to = toStage(playerPanelRect(playerId));
    if (!srcEl || !to || reducedMotion()) return;
    const from = toStage(srcEl.getBoundingClientRect());
    if (!from.width) return;
    const ghost = srcEl.cloneNode(true);
    ghost.classList.remove('selected', 'disabled', 'can-drag');
    ghost.classList.add('flying-discard');
    ghost.querySelectorAll('.draw-hint, .remaining-count').forEach(n => n.remove());
    Object.assign(ghost.style, {
        position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
        margin: '0', zIndex: 500, pointerEvents: 'none', opacity: '1', filter: 'none',
    });
    stageRoot().appendChild(ghost);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const lift = -Math.min(30, Math.hypot(dx, dy) * 0.12); // yolun ortasında hafif yükselir
    ghost.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.55 + lift}px) scale(0.85)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.5)`, opacity: 0 },
    ], { duration: PLACE_MS + 120, easing: EASE }).finished.catch(() => {}).finally(() => ghost.remove());
    setTimeout(() => ghost.remove(), PLACE_MS + 1500); // arka plan sekmesi
};

// ── Sürükleyerek işleme ──
// Bırakılan taşın ıstakadaki görünümü (GameBoard alır): yerine süzülürken masa taşı görünümüne yumuşakça döner
export const tileLooks = new Map(); // id → { el, w, h }
export const SETTLE_MS = 520;
export const COLLAPSE_MS = 320; // OpenSetsArea.css: per küçülme geçişi

// İki kopya aynı yoldan gider (ıstaka taşı → masa taşı): biri sönerken öbürü belirir; ölçek her ikisinde de sürekli
// olduğundan yazı boyu sıçramaz. Varışta masa taşı kopyası gerçek taşla birebir aynı boyda (büyümüş perin içinde).
const morphFly = (look, target, fromV, toV, done) => {
    if (reducedMotion() || !target.animate) return done();
    const from = toStage(fromV), to = toStage(toV);
    const make = (el, w, h) => {
        const g = el.cloneNode(true);
        g.classList.remove('selected', 'dragging', 'incoming');
        g.classList.add('flying-discard');
        g.querySelectorAll('.draw-hint, .remaining-count').forEach(n => n.remove());
        Object.assign(g.style, {
            position: 'fixed', left: `${to.left}px`, top: `${to.top}px`, width: `${w}px`, height: `${h}px`, margin: '0',
            zIndex: 500, pointerEvents: 'none', visibility: 'visible', opacity: '1', transformOrigin: '0 0', transition: 'none',
        });
        stageRoot().appendChild(g);
        return g;
    };
    const path = (w, h) => [
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / w}, ${from.height / h})` },
        { transform: `translate(0, 0) scale(${to.width / w}, ${to.height / h})` },
    ];
    const opts = { duration: SETTLE_MS, easing: EASE, fill: 'forwards' };
    const tw = target.offsetWidth || to.width, th = target.offsetHeight || to.height;
    const end = make(target, tw, th);
    let finished = false;
    const finish = () => { if (finished) return; finished = true; done(); end.remove(); };
    end.animate(path(tw, th), opts);
    if (look?.el) {
        const start = make(look.el, look.w, look.h);
        start.animate(path(look.w, look.h), opts);
        start.animate([{ opacity: 1 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], opts).finished.catch(() => {}).finally(() => start.remove());
        end.animate([{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], opts).finished.catch(() => {}).finally(finish);
    } else {
        end.getAnimations()[0]?.finished.catch(() => {}).finally(finish);
    }
    setTimeout(finish, SETTLE_MS + 1500); // arka plan sekmesi
};

// Bırakınca per büyük ve yuvalarıyla kalır (OpenSetsArea); taş oturunca küçülür ve yuvalar daralarak kaybolur.
// İşleme reddedilirse ya da taş gelmezse kısa süre sonra kendiliğinden kapanır.
let held = null; // { setId, tileId, start, end, phase: 'hold' | 'collapse' }
const holdSubs = new Set();
const setHeld = (v) => { held = v; holdSubs.forEach(f => f()); };
let holdTimer;
export const holdSet = (setId, tileId) => {
    const group = document.querySelector(`.open-set-group[data-set-id="${setId}"]`);
    if (!group || reducedMotion()) return;
    const slot = (side) => !!group.querySelector(`.insertion-slot[data-position="${side}"]`);
    setHeld({ setId, tileId, start: slot('start'), end: slot('end'), phase: 'hold' });
    clearTimeout(holdTimer);
    holdTimer = setTimeout(releaseSet, 2500);
};
export const releaseSet = () => {
    if (held?.phase !== 'hold') return;
    clearTimeout(holdTimer);
    setHeld({ ...held, phase: 'collapse' });
    holdTimer = setTimeout(() => setHeld(null), COLLAPSE_MS + 40);
};
const subscribeHeld = (cb) => { holdSubs.add(cb); return () => holdSubs.delete(cb); };
export const useHeldSet = () => useSyncExternalStore(subscribeHeld, () => held);
