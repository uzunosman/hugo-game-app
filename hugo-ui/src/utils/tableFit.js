// Masadaki perlerin çakışmadan yerleşimi. Kutular { x0, x1, y0, y1 }: açılan perler kabına göre px, her per ayrı kutu.
// top / bottom: üst ve alt oyuncunun perleri (yerinde kalır; orta taşlar sığmazsa ya da köşelere değerse küçülür),
// center: deste + gösterge (ortada kalır, perlere değecekse arada kayar),
// sides: yan oyuncuların perleri (hepsi birlikte dikeyde kayar, hiçbir yere sığmazsa küçülür),
// fixed: yeri değişmeyen engeller (köşelere atılan taşların alanları).
const hitX = (a, b) => a.x0 < b.x1 && b.x0 < a.x1;
const hit = (a, b, g) => hitX(a, b) && a.y0 < b.y1 + g && b.y0 < a.y1 + g;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const SCALES = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
// Kutuyu (ox, oy) çevresinde s kadar küçült, dy kadar kaydır
const tf = (r, ox, oy, s, dy = 0) => ({ x0: ox + (r.x0 - ox) * s, x1: ox + (r.x1 - ox) * s, y0: oy + (r.y0 - oy) * s + dy, y1: oy + (r.y1 - oy) * s + dy });
const span = (rs) => rs.length && { x0: Math.min(...rs.map(r => r.x0)), x1: Math.max(...rs.map(r => r.x1)), y0: Math.min(...rs.map(r => r.y0)), y1: Math.max(...rs.map(r => r.y1)) };

// Yan perler hiçbir boyda sığmıyorsa üst ve alt perler de bir kademe daha küçülür
export function fitTable(opts) {
    let r;
    for (const cap of SCALES) {
        r = fitOnce(opts, cap);
        if (r.sides.every(x => x.fits)) break;
    }
    return r;
}

function fitOnce({ H, gap = 6, top = [], bottom = [], center, sides = [], fixed = [] }, cap) {
    const cH = center.y1 - center.y0;
    const tA = span(top), bA = span(bottom);

    // 1) Orta taşlar: üst ve alt perlerin arasına sığana kadar üst/alt perler küçülür
    let tbScale = 1, centerY = H / 2, T = top, B = bottom;
    for (const s of SCALES.filter(x => x <= cap)) {
        T = tA ? top.map(r => tf(r, (tA.x0 + tA.x1) / 2, tA.y0, s)) : [];
        B = bA ? bottom.map(r => tf(r, (bA.x0 + bA.x1) / 2, bA.y1, s)) : [];
        const lo = Math.max(cH / 2, ...T.filter(r => hitX(r, center)).map(r => r.y1 + gap + cH / 2));
        const hi = Math.min(H - cH / 2, ...B.filter(r => hitX(r, center)).map(r => r.y0 - gap - cH / 2));
        tbScale = s;
        centerY = lo > hi ? (lo + hi) / 2 : clamp(H / 2, lo, hi);
        if (lo <= hi && !T.some(a => B.some(b => hit(a, b, gap))) && ![...T, ...B].some(a => fixed.some(z => hit(a, z, 0)))) break;
    }
    const placed = [...fixed, ...T, ...B, { ...center, y0: centerY - cH / 2, y1: centerY + cH / 2 }];

    // 2) Yan perler: en az kayma ile hiçbir şeye değmeyen yer; yoksa küçült ve tekrar dene
    const sideFits = sides.map(({ rects, originX, originY }) => {
        const A = span(rects);
        if (!A) return { dy: 0, s: 1, fits: true };
        const oy = originY ?? (A.y0 + A.y1) / 2; // CSS'teki transform-origin ile aynı nokta
        let last = { dy: 0, s: SCALES[SCALES.length - 1], fits: false };
        for (const s of SCALES) {
            const R = rects.map(r => tf(r, originX, oy, s));
            const cands = [0];
            R.forEach(g => placed.forEach(o => { if (hitX(g, o)) cands.push(o.y1 + gap - g.y0, o.y0 - gap - g.y1); }));
            const S = span(R);
            const ok = cands.sort((a, b) => Math.abs(a) - Math.abs(b)).find(dy =>
                S.y0 + dy >= 0 && S.y1 + dy <= H && !R.some(g => placed.some(o => hit({ ...g, y0: g.y0 + dy, y1: g.y1 + dy }, o, gap - 0.5))));
            if (ok !== undefined) { last = { dy: ok, s, fits: true }; break; }
            last = { dy: clamp(0, -S.y0, H - S.y1), s, fits: false };
        }
        pushPlaced(placed, rects, originX, oy, last);
        return last;
    });

    return { topScale: tbScale, bottomScale: tbScale, centerY, sides: sideFits };
}

// Yerleşen yan perler sonraki yan için engel olur
function pushPlaced(placed, rects, originX, oy, { dy, s }) {
    rects.forEach(r => placed.push(tf(r, originX, oy, s, dy)));
}
