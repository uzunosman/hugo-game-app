// Istaka mantığı öz-testi: `npm test` ile çalışır (saf fonksiyonlar, tarayıcı gerekmez).
import assert from 'node:assert';
import { getConsecutiveGroups, arrangeTiles, calculateHandScore, validateSet, CELLS_PER_ROW } from './gameUtils.js';
import { insertShift } from './tileHandlers.js';

let n = 0;
const tile = (color, value, extra = {}) => ({ id: `t${n++}`, color, value, ...extra });
const row = (cells) => [...cells, ...Array(CELLS_PER_ROW * 2 - cells.length).fill(null)];

// Satır ayrımı: üst satırın son 2 taşı + alt satırın ilk taşı per sayılmaz
{
    const [a, b, c] = [tile('red', 5), tile('red', 6), tile('red', 7)];
    const pos = Array(30).fill(null);
    pos[13] = a.id; pos[14] = b.id; pos[15] = c.id;
    assert.deepStrictEqual(getConsecutiveGroups(pos, [a, b, c]), [], 'satır sınırı grup bölmeli');
}

// Kaydırma: sola taşımada yalnızca ilk boşluğa kadar itilir, sonraki dizi yerinde kalır
{
    // [A B C _ D E X]: X'i 0'a → A B C ilk boşluğa (3) itilir, D E yerinde kalır
    const p = row(['A', 'B', 'C', null, 'D', 'E', 'X']);
    const r = insertShift(p, 6, 0);
    assert.deepStrictEqual(r.slice(0, 7), ['X', 'A', 'B', 'C', 'D', 'E', null]);
    // [A B _ D E X]: X'i 0'a → A B ilk boşluğa itilir, D E yerinde kalır
    const q = insertShift(row(['A', 'B', null, 'D', 'E', 'X']), 5, 0);
    assert.deepStrictEqual(q.slice(0, 6), ['X', 'A', 'B', 'D', 'E', null]);
    // Sağa taşıma: [X _ A B] X'i 3'e → A B sola ilk boşluğa
    const s = insertShift(row(['X', null, 'A', 'B']), 0, 3);
    assert.deepStrictEqual(s.slice(0, 4), [null, 'A', 'B', 'X']);
    // Taş sayısı korunur
    assert.strictEqual(r.filter(Boolean).length, 6);
}

// Otomatik dizme (seri): per adayları yan yana ve boşlukla ayrık; el değeri hesaplanır
{
    const hand = [
        tile('red', 11), tile('blue', 9), tile('red', 13), tile('black', 9), tile('red', 12),
        tile('yellow', 9), tile('blue', 2), tile('purple', 'H', { isJoker: true }),
    ];
    const seri = arrangeTiles(hand, 'seri', null, true);
    assert.strictEqual(seri.filter(Boolean).length, hand.length, 'hiçbir taş kaybolmamalı');
    const groups = getConsecutiveGroups(seri, hand).map(g => g.map(t => `${t.color}${t.value}`));
    assert.ok(groups.some(g => g.join() === 'red11,red12,red13'), 'kırmızı 11-12-13 seri olmalı');

    // Seri diz kalan taşlardan aynı sayı perini de kurar: 11-12-13 + 9-9-9 = 63
    assert.strictEqual(calculateHandScore(seri, hand, null, null, true).setTotal, 63, 'seri + çift per birlikte 63 olmalı');

    const cift = arrangeTiles(hand, 'cift', null, true);
    const score = calculateHandScore(cift, hand, null, null, true);
    assert.ok(score.validSetCount >= 1, 'çift dizmede 9-9-9 per olmalı');
}

// 15 dağınık taş taşmadan iki satıra sığar
{
    const many = Array.from({ length: 15 }, (_, i) => tile(['red', 'blue', 'black', 'yellow'][i % 4], (i * 3) % 13 + 1));
    const pos = arrangeTiles(many, 'seri', null, false);
    assert.strictEqual(pos.length, 30);
    assert.strictEqual(new Set(pos.filter(Boolean)).size, 15);
}

// Normal elde sahte okey okeyin değeriyle oynanır; gerçek okey jokerdir (sunucu kuralıyla aynı)
{
    const opts = { okeyTile: { color: 'red', value: 6 }, isHugo: false };
    const joker = () => tile('purple', 'H', { isJoker: true });
    assert.strictEqual(validateSet([tile('red', 4), tile('red', 5), joker()], opts), 15, 'sahte okey = kırmızı 6');
    assert.strictEqual(validateSet([tile('blue', 3), tile('blue', 4), joker()], opts), 0, 'sahte okey mavi 5 olamaz');
    assert.strictEqual(validateSet([tile('blue', 3), tile('blue', 4), tile('red', 6)], opts), 12, 'gerçek okey mavi 5 yerine');
    // Hugo elinde joker gerçek okeydir
    assert.strictEqual(validateSet([tile('blue', 3), tile('blue', 4), joker()], { isHugo: true }), 12);
}

console.log('rack.selftest: satır ayrımı, kaydırma, otomatik dizme ve sahte okey ✓');
