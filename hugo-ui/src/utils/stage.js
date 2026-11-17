// Sahne: oyun ekranı her cihazda aynı görünsün diye referans ölçüde (iPhone 14 ana ekran uygulaması yatay: 750×390 CSS px)
// çizilir ve görünen alana orantılı sığdırılır (html.stage, layout.css). Oyun ekranı açıkken etkin.
// Sahneye eklenen kopyalar (uçan taş, sürükleme, ceza patlaması) sahnenin içine konur: ekran koordinatı toStage ile çevrilir.
export const STAGE_W = 750;
export const STAGE_H = 390;

let scale = 1;
const html = () => document.documentElement;
const update = () => {
    const vv = window.visualViewport;
    const w = vv?.width || window.innerWidth;
    const h = vv?.height || window.innerHeight;
    scale = Math.min(w / STAGE_W, h / STAGE_H);
    html().style.setProperty('--stage-s', String(scale));
};

// Oyun ekranı açılınca çağrılır; dönen işlev sahneyi kapatır
export const enterStage = () => {
    html().classList.add('stage');
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
        html().classList.remove('stage');
        window.removeEventListener('resize', update);
        window.visualViewport?.removeEventListener('resize', update);
    };
};

export const stageScale = () => (html().classList.contains('stage') ? scale : 1);
export const stageRoot = () => document.querySelector('html.stage .game-container') || document.body;

// Ekran dikdörtgeni → sahne içi koordinat (sahne yoksa olduğu gibi)
export const toStage = (r) => {
    if (!r) return r;
    const root = stageRoot();
    if (root === document.body) return r;
    const b = root.getBoundingClientRect();
    const k = stageScale();
    const left = (r.left - b.left) / k, top = (r.top - b.top) / k, width = r.width / k, height = r.height / k;
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
};
// Ekran noktası → sahne içi nokta
export const pointToStage = (x, y) => {
    const r = toStage({ left: x, top: y, width: 0, height: 0 });
    return [r.left, r.top];
};
