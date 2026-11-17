// İşleme cezası: işlenen taş yerine oturunca taşın üst kenarından kırmızı kıvılcımlar ve ceza değeri yukarı doğru büyüyerek
// çıkar, sonra söner. Üstten gelen bildirimin yerine geçer (masadaki herkes görür). Boyut taştan küçük, süre kısa.
import { incomingTiles } from './flyTiles';
import { stageRoot, toStage } from './stage';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const SPARKS = 16;

const tileEl = (id) => document.querySelector(`.open-set-tile[data-tile-id="${id}"]`);

// Taş uçarak geliyorsa iniş bitince patlar (en çok 1,5 sn beklenir)
export const penaltyBurst = (tileIds, amount) => {
    if (!(amount > 0) || !tileIds?.length) return;
    const t0 = Date.now();
    const wait = () => {
        const id = tileIds.find(tileEl);
        const el = id && tileEl(id);
        // Peri büyükse (sürükleyerek işlendi, küçülmeyi bekliyor) ya da küçülüyorsa: taşın son yerinde patlar
        if (el && !incomingTiles.has(id) && !el.closest('.open-set-group.expanded, .open-set-group.collapsing')) {
            return burst(el.getBoundingClientRect(), amount);
        }
        if (Date.now() - t0 < 2500) requestAnimationFrame(wait);
    };
    requestAnimationFrame(wait);
};

const burst = (rV, amount) => {
    const r = toStage(rV);
    const root = document.createElement('div');
    root.className = 'penalty-burst';
    root.setAttribute('aria-hidden', 'true');
    // Taşın üst kenarının ortası; ölçüler taş genişliğine göre
    Object.assign(root.style, { left: `${r.left + r.width / 2}px`, top: `${r.top}px` });
    root.style.setProperty('--w', `${r.width}px`);
    const label = document.createElement('span');
    label.className = 'pb-value';
    label.textContent = `+${amount}`;
    root.appendChild(label);
    if (!reducedMotion()) {
        for (let i = 0; i < SPARKS; i++) {
            const s = document.createElement('span');
            s.className = 'pb-spark';
            // Yukarı açılan yelpaze (-160°…-20°), uzunluk ve boy rastgele: düzenli değil, kıvılcım gibi
            const a = (-160 + (140 * (i + Math.random() * 0.8)) / SPARKS) * (Math.PI / 180);
            const d = 0.55 + Math.random() * 0.6;
            s.style.setProperty('--dx', (Math.cos(a) * d).toFixed(3));
            s.style.setProperty('--dy', (Math.sin(a) * d).toFixed(3));
            s.style.setProperty('--s', (0.6 + Math.random() * 0.7).toFixed(2));
            s.style.animationDelay = `${Math.round(Math.random() * 80)}ms`;
            root.appendChild(s);
        }
    }
    stageRoot().appendChild(root);
    setTimeout(() => root.remove(), 1650);
};
