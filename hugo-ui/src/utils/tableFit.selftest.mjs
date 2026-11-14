// node src/utils/tableFit.selftest.mjs
import assert from 'node:assert';
import { fitTable } from './tableFit.js';

const box = (x0, x1, y0, y1) => ({ x0, x1, y0, y1 });
const center = box(450, 550, 175, 225); // 400 yüksek masanın ortasında, 50 yüksek
const hits = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const moved = (r, { dy, s }, ox, oy) => box(ox + (r.x0 - ox) * s, ox + (r.x1 - ox) * s, oy + (r.y0 - oy) * s + dy, oy + (r.y1 - oy) * s + dy);

// Boş masa: orta taşlar ortada, yan perler yerinde
let r = fitTable({ H: 400, center, sides: [{ rects: [box(50, 300, 150, 250)], originX: 50 }] });
assert.strictEqual(r.centerY, 200); assert.deepStrictEqual(r.sides[0], { dy: 0, s: 1, fits: true });

// Üst per ortaya uzanırsa orta taşlar aşağı kayar; alt per yoksa gereğinden fazla kaymaz
r = fitTable({ H: 400, center, top: [box(300, 700, 12, 190)] });
assert.strictEqual(r.centerY, 190 + 6 + 25);

// Orta taşların üstünde olmayan üst per orta taşları kaydırmaz
r = fitTable({ H: 400, center, top: [box(300, 420, 12, 190)] });
assert.strictEqual(r.centerY, 200);

// Yan per üst perin altına iner, çakışmaz, küçülmez
const top = [box(250, 750, 12, 130)], side = [box(50, 400, 100, 140), box(50, 200, 150, 300)];
r = fitTable({ H: 400, center, top, sides: [{ rects: side, originX: 50 }] });
assert.strictEqual(r.sides[0].s, 1);
side.forEach(g => assert.ok(!hits(moved(g, r.sides[0], 50, 200), top[0]), 'yan per üst perlere binmemeli'));

// Hiçbir şey sığmıyorsa üst/alt küçülür, orta taşlara değmez
r = fitTable({ H: 200, center: box(450, 550, 75, 125), top: [box(300, 700, 10, 110)], bottom: [box(300, 700, 90, 190)] });
assert.ok(r.topScale < 1);
assert.ok(10 + 100 * r.topScale + 6 <= r.centerY - 25 + 1e-9 && r.centerY + 25 + 6 <= 190 - 100 * r.bottomScale + 1e-9);

// Üst perler köşe alanına uzanırsa küçülür
r = fitTable({ H: 400, center, top: [box(40, 960, 12, 60)], fixed: [box(0, 60, 0, 80)] });
assert.ok(r.topScale < 1 && 500 - 460 * r.topScale >= 60, 'üst per köşeye değmemeli');

console.log('tableFit.selftest: orta taşlar, yan perler ve küçültme çakışmasız ✓');
