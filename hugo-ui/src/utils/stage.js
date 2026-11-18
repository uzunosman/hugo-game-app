// Sahne: oyun ekranı her cihazda aynı görünsün diye referans ölçüde (iPhone 14 ana ekran uygulaması yatay: 750×390 CSS px)
// çizilir ve görünen alana orantılı sığdırılır (html.stage, layout.css). Oyun ekranı açıkken etkin.
// Sahneye eklenen kopyalar (uçan taş, sürükleme, ceza patlaması) sahnenin içine konur: ekran koordinatı toStage ile çevrilir.
export const STAGE_W = 750;
export const STAGE_H = 390;

let scale = 1;
const html = () => document.documentElement;
// Ölçek pencere boyundan (visualViewport değil): klavye açılınca görünen alan küçülür, oyun küçülmesin (görev #17).
// Yazı alanı odaktayken (sohbet) ölçek hiç değişmez; klavye kapanınca yeniden hesaplanır.
const typing = () => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
const update = () => {
    if (typing()) return;
    scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    html().style.setProperty('--stage-s', String(scale));
};
const afterTyping = () => setTimeout(update, 350); // klavye kapanma animasyonu bitsin
// iOS ekran dönünce resize'ı yeni ölçüler hazır olmadan gönderebiliyor (dikey ölçüyle küçük kalıyordu): birkaç kez yeniden ölç
let settleTimers = [];
const settle = () => {
    update();
    settleTimers.forEach(clearTimeout);
    settleTimers = [100, 300, 700].map(ms => setTimeout(update, ms));
};

// Oyun ekranı açılınca çağrılır; dönen işlev sahneyi kapatır
export const enterStage = () => {
    html().classList.add('stage');
    update();
    window.addEventListener('resize', settle);
    window.addEventListener('orientationchange', settle);
    window.visualViewport?.addEventListener('resize', settle);
    document.addEventListener('focusout', afterTyping);
    return () => {
        html().classList.remove('stage');
        settleTimers.forEach(clearTimeout);
        window.removeEventListener('resize', settle);
        window.removeEventListener('orientationchange', settle);
        window.visualViewport?.removeEventListener('resize', settle);
        document.removeEventListener('focusout', afterTyping);
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
