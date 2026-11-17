// Istaka mantığı öz-testi: `npm test` ile çalışır (saf fonksiyonlar, tarayıcı gerekmez).
import assert from 'node:assert';
import { isIslekTile, getConsecutiveGroups, arrangeTiles, calculateHandScore, calculatePairScore, findPairPartner, validatePair, validateSet, CELLS_PER_ROW } from './gameUtils.js';
import { insertShift, rackGroupAt, reconcilePositions, drawSlot } from './tileHandlers.js';
import { moveGroup, rackPreview, perGroupAt } from './rackDrag.js';

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
    assert.ok(groups.some(g => g.join() === 'purpleH,red11,red12,red13'), 'okey (10) + kırmızı 11-12-13 seri olmalı');

    // Seri diz en yüksek toplamı kurar, okey dahil: okey 10 olur → 10-11-12-13 (46) + 9-9-9 (27) = 73
    assert.strictEqual(calculateHandScore(seri, hand, null, null, true).setTotal, 73, 'okeyle birlikte en yüksek toplam 73 olmalı');

    // Çift diz: aynı taşlar yan yana; Hugo elinde joker okeydir ve en değerli tek taşla eşleşir
    const pairHand = [
        tile('red', 13), tile('blue', 2), tile('red', 13), tile('black', 7), tile('black', 7),
        tile('yellow', 11), tile('purple', 'H', { isJoker: true }), tile('blue', 5),
    ];
    const cift = arrangeTiles(pairHand, 'cift', null, true);
    assert.strictEqual(cift.filter(Boolean).length, pairHand.length, 'hiçbir taş kaybolmamalı');
    const ps = calculatePairScore(cift, pairHand, null, true);
    assert.strictEqual(ps.pairCount, 3, 'kırmızı 13, siyah 7 ve sarı 11 + joker');
    assert.strictEqual(ps.pairTotal, 26 + 14 + 22);
    // Her çift aynı renk ve sayıdan (okeyli çift hariç)
    for (const g of ps.pairs) {
        const [a, b] = g;
        if (!a.isJoker && !b.isJoker) assert.ok(a.color === b.color && a.value === b.value, `çift aynı taş olmalı: ${a.color}${a.value}-${b.color}${b.value}`);
    }

    // Aynı sayı ama farklı renk çift sayılmaz: çift dizmede yan yana gelmez
    const mixed = [tile('red', 8), tile('blue', 8), tile('red', 8), tile('black', 3)];
    const mixedPs = calculatePairScore(arrangeTiles(mixed, 'cift', null, false), mixed, null, false);
    assert.strictEqual(mixedPs.pairCount, 1, 'yalnızca kırmızı 8 çifti');
    assert.ok(mixedPs.pairs[0].every(t => t.color === 'red' && t.value === 8));
}

// Çift doğrulama (sunucu kuralıyla aynı)
{
    const opts = { okeyTile: { color: 'red', value: 6 }, isHugo: false };
    assert.strictEqual(validatePair([tile('blue', 9), tile('blue', 9)], opts), 18);
    assert.strictEqual(validatePair([tile('blue', 9), tile('black', 9)], opts), 0, 'farklı renk çift değil');
    assert.strictEqual(validatePair([tile('blue', 9), tile('red', 6)], opts), 18, 'gerçek okey çifti tamamlar');
    assert.strictEqual(validatePair([tile('red', 6), tile('purple', 'H', { isJoker: true })], opts), 12, 'okey + sahte okey: sahte okey kırmızı 6 olur, okey onu tamamlar');
}

// Çiftlere işleme için eş: önce aynı taş, yoksa okey
{
    const okey = { color: 'red', value: 6 };
    const [b5, b5b, r6, k9] = [tile('blue', 5), tile('blue', 5), tile('red', 6), tile('black', 9)];
    assert.strictEqual(findPairPartner(b5, [b5, r6, b5b, k9], okey, false), b5b.id, 'aynı taş okeye tercih edilir');
    assert.strictEqual(findPairPartner(k9, [b5, r6, k9], okey, false), r6.id, 'eş yoksa okey');
    assert.strictEqual(findPairPartner(k9, [b5, k9], okey, false), null);
}

// Açgözlü dizme yetmez: kırmızı 1-2-3-4 + sarı 4 + mavi 4 → kırmızı 1-2-3 (6) ve 4-4-4 (12) = 18 (1-4 serisi yalnızca 10)
{
    const hand = [tile('red', 1), tile('red', 2), tile('red', 3), tile('red', 4), tile('yellow', 4), tile('blue', 4), tile('black', 9)];
    const pos = arrangeTiles(hand, 'seri', null, false);
    assert.strictEqual(calculateHandScore(pos, hand, null, null, false).setTotal, 18, 'en yüksek per toplamı 18 olmalı');
    // Normal elde gerçek okey (gösterge+1) boşluğu doldurur: kırmızı 11-_-13 + okey = 36
    const ok = { color: 'black', value: 5 };
    const hand2 = [tile('red', 11), tile('red', 13), tile('black', 5), tile('blue', 2)];
    const pos2 = arrangeTiles(hand2, 'seri', ok, false);
    assert.strictEqual(calculateHandScore(pos2, hand2, null, ok, false).setTotal, 36, 'okey 12 yerine geçmeli');
}

// İşlek taş (sunucu kuralıyla aynı): seri / aynı sayı perinin ucuna uyan, okeyin yerini tutan; çiftlere uyan işlek değil
{
    const sets = [
        { id: 's', kind: 'seri', tiles: [tile('red', 5), tile('red', 6), tile('red', 7)] },
        { id: 'c', kind: 'cift', tiles: [tile('blue', 9), tile('blue', 9)] },
        { id: 'n', tiles: [tile('black', 11), tile('yellow', 11), tile('blue', 11)] },
    ];
    assert.strictEqual(isIslekTile(tile('red', 8), sets, null, false), true, 'kırmızı 8 seriye uyar');
    assert.strictEqual(isIslekTile(tile('red', 4), sets, null, false), true, 'kırmızı 4 serinin başına uyar');
    assert.strictEqual(isIslekTile(tile('red', 11), sets, null, false), true, 'kırmızı 11 aynı sayı perine uyar');
    assert.strictEqual(isIslekTile(tile('blue', 9), sets, null, false), false, 'çiftlere uyan taş işlek değil');
    assert.strictEqual(isIslekTile(tile('yellow', 3), sets, null, false), false);
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

// Per taşıma: basılan taşın satırdaki kesintisiz dizisi bir bütün olarak taşınır
{
    const p = row(['A', 'B', 'C', null, 'D']);
    assert.deepStrictEqual(rackGroupAt(p, 1), { start: 0, len: 3 });
    assert.strictEqual(rackGroupAt(p, 4), null, 'tek taş per değildir');
    assert.strictEqual(rackGroupAt(p, 3), null, 'boş hücre');
    // Satır sınırı: 14 ile 15 komşu değildir
    const edge = Array(30).fill(null); edge[13] = 'X'; edge[14] = 'Y'; edge[15] = 'Z';
    assert.deepStrictEqual(rackGroupAt(edge, 14), { start: 13, len: 2 });
    // B'den tutup 8'e bırak: B 8'e, A 7'ye, C 9'a gelir
    const m = moveGroup(p, { start: 0, len: 3 }, 1, 8);
    assert.deepStrictEqual(m.slice(0, 10), [null, null, null, null, 'D', null, null, 'A', 'B', 'C']);
    // İkinci satıra, satır sonuna taşarsa sığdırılır
    const d = moveGroup(p, { start: 0, len: 3 }, 0, 29);
    assert.deepStrictEqual(d.slice(27), ['A', 'B', 'C']);
    assert.strictEqual(d.filter(Boolean).length, 4, 'taş kaybolmaz');
    // Kendi üstüne bir hücre kaydırma çalışır; yer değişmiyorsa null
    assert.deepStrictEqual(moveGroup(p, { start: 0, len: 3 }, 0, 1).slice(0, 5), [null, 'A', 'B', 'C', 'D']);
    assert.strictEqual(moveGroup(p, { start: 0, len: 3 }, 1, 1), null, 'yer değişmez');
    // Başka taşın üstüne bırakılınca o taş en yakın boşluğa itilir: D sağa kayar
    assert.deepStrictEqual(moveGroup(p, { start: 0, len: 3 }, 0, 2).slice(0, 6), [null, null, 'A', 'B', 'C', 'D']);
}

// Per başka perin ortasına bırakılır: sol yarıdakiler sola, sağ yarıdakiler sağa itilir, sıraları korunur
{
    // _ _ X Y Z W _ _  +  [P Q] (alt satırdan) → hedef 4: X Y sola, Z W sağa
    const p = Array(30).fill(null);
    ['X', 'Y', 'Z', 'W'].forEach((id, i) => { p[2 + i] = id; });
    p[20] = 'P'; p[21] = 'Q';
    const m = moveGroup(p, { start: 20, len: 2 }, 20, 3);
    assert.deepStrictEqual(m.slice(0, 8), [null, 'X', 'Y', 'P', 'Q', 'Z', 'W', null]);
    assert.strictEqual(m[20], null); assert.strictEqual(m[21], null);
    assert.strictEqual(m.filter(Boolean).length, 6, 'taş kaybolmaz');
    // Sol taraf doluysa hepsi sağa: X Y Z W ... satır başında
    const q = Array(30).fill(null);
    ['X', 'Y', 'Z'].forEach((id, i) => { q[i] = id; });
    q[20] = 'P'; q[21] = 'Q';
    const r = moveGroup(q, { start: 20, len: 2 }, 20, 0);
    assert.deepStrictEqual(r.slice(0, 6), ['P', 'Q', 'X', 'Y', 'Z', null]);
    // Satırda yer yoksa taşınmaz
    const full = Array(30).fill(null).map((_, i) => (i < 15 ? `f${i}` : null));
    full[20] = 'P'; full[21] = 'Q';
    assert.strictEqual(moveGroup(full, { start: 20, len: 2 }, 20, 5), null, 'dolu satır');
}

// Basılı tutunca yalnızca kurala uyan per seçilir; per olmayan dizi seçilmez (taş tek sürüklenir)
{
    const opts = { okeyTile: { color: 'red', value: 1 }, isHugo: false };
    const hand = [tile('red', 5), tile('red', 6), tile('red', 7), tile('black', 9), tile('blue', 2), tile('blue', 9), tile('blue', 9), tile('yellow', 4), tile('yellow', 4)];
    const [r5, r6, r7, k9, b2, b9, b9b, y4, y4b] = hand;
    const p = row([r5.id, r6.id, r7.id, null, k9.id, b2.id, null, b9.id, b9b.id, y4.id, y4b.id]);
    assert.deepStrictEqual(perGroupAt(p, 1, hand, opts), { start: 0, len: 3 }, 'kırmızı 5-6-7 per seçilir');
    assert.strictEqual(perGroupAt(p, 4, hand, opts), null, 'siyah 9 + mavi 2 per değil: seçilmez');
    assert.deepStrictEqual(perGroupAt(p, 8, hand, opts), { start: 7, len: 2 }, 'yan yana çiftlerde basılan çift seçilir');
    const extra = row([r5.id, r6.id, r7.id, k9.id]);
    assert.strictEqual(perGroupAt(extra, 0, hand, opts), null, 'pere bitişik fazladan taş varsa dizi per değil');
}

// Sürükleme önizlemesi: kalkan taş yerinde gölge bırakmaz, hedefte görünür
{
    const p = row(['A', 'B', null, 'C']);
    const lifted = rackPreview(p, { kind: 'tile', srcIdx: 0, overCell: null });
    assert.deepStrictEqual(lifted.cells.slice(0, 4), [null, 'B', null, 'C'], 'ıstaka dışındayken taş yerinden kalkar');
    const over = rackPreview(p, { kind: 'tile', srcIdx: 0, overCell: 3 });
    assert.deepStrictEqual(over.cells.slice(0, 4), [null, 'B', 'C', 'A'], 'bırakınca olacağı gibi');
    assert.deepStrictEqual([...over.preview], [3]);
    assert.deepStrictEqual(insertShift(p, 0, 3), over.cells, 'önizleme = bırakma sonucu');
    const g = rackPreview(p, { kind: 'group', group: { start: 0, len: 2 }, srcIdx: 0, overCell: null });
    assert.deepStrictEqual(g.cells.slice(0, 4), [null, null, null, 'C'], 'per yerinden kalkar');
    const gOver = rackPreview(p, { kind: 'group', group: { start: 0, len: 2 }, srcIdx: 0, overCell: 6 });
    assert.deepStrictEqual([...gOver.preview], [6, 7]);
    assert.deepStrictEqual(gOver.cells, moveGroup(p, { start: 0, len: 2 }, 0, 6), 'per önizlemesi = bırakma sonucu');
    const same = rackPreview(p, { kind: 'group', group: { start: 0, len: 2 }, srcIdx: 0, overCell: 0 });
    assert.strictEqual(same.blocked, false, 'kendi yerine bırakmak engelli değil');
    const deck = rackPreview(p, { kind: 'deck', overCell: 1 });
    assert.deepStrictEqual([...deck.preview], [2], 'dolu hücre: ilk boşa gelir');
    assert.strictEqual(rackPreview(p, null).cells, p);
}

// Çiftler yan yana dizildiyse yalnızca basılan çift seçilir; çift olmayan blok bütün kalır
{
    const pairs = row(['a', 'a2', 'b', 'b2', 'c', 'c2']);
    const isPair = (x, y) => !!x && !!y && y === `${x}2`;
    assert.deepStrictEqual(rackGroupAt(pairs, 3, isPair), { start: 2, len: 2 });
    assert.deepStrictEqual(rackGroupAt(pairs, 4, isPair), { start: 4, len: 2 });
    assert.deepStrictEqual(rackGroupAt(row(['a', 'a2', 'b', 'x']), 0, isPair), { start: 0, len: 4 }, 'karışık blok bütün');
    assert.deepStrictEqual(rackGroupAt(row(['a', 'a2', 'b']), 0, isPair), { start: 0, len: 3 }, 'tek sayılı blok bütün');
    assert.deepStrictEqual(rackGroupAt(row(['a', 'a2']), 1, isPair), { start: 0, len: 2 });
}

// Istaka elle uyumlu tutulur: hayalet id silinir, kayıp taş boş hücreye gelir, değişiklik yoksa aynı dizi
{
    const tl = (...ids) => ids.map(id => ({ id }));
    const ok = row(['a', null, 'b']);
    assert.strictEqual(reconcilePositions(ok, tl('a', 'b')), ok, 'uyumluysa aynı dizi');
    assert.deepStrictEqual(reconcilePositions(row(['a', 'x', 'b']), tl('a', 'b')).slice(0, 3), ['a', null, 'b'], 'elde olmayan silinir');
    assert.deepStrictEqual(reconcilePositions(row(['a', 'a']), tl('a')).slice(0, 2), ['a', null], 'çift yazılan silinir');
    assert.deepStrictEqual(reconcilePositions(row(['a', null, 'b']), tl('a', 'b', 'c')).slice(0, 3), ['a', 'c', 'b'], 'kayıp taş boşa');
}

// Tıklayarak çekilen taş: üst sıranın en sağı, soldaki taşla arasında bir boşluk
{
    const p = Array(30).fill(null);
    for (let i = 0; i < 6; i++) p[i] = `a${i}`;
    assert.strictEqual(drawSlot(p), 14, 'üst sıranın en sağı');
    p[13] = 'x';
    assert.strictEqual(drawSlot(p), 11, '13 doluysa yanına yapışmaz: iki yanı boş en sağdaki hücre');
    const full = Array(30).fill(null).map((_, i) => (i < 15 && i !== 0 ? `f${i}` : null));
    assert.strictEqual(drawSlot(full), 29, 'üst sırada boşluklu yer yoksa alt sıranın en sağı');
    const packed = Array(30).fill(null).map((_, i) => (i !== 0 && i !== 20 ? `f${i}` : null));
    assert.strictEqual(drawSlot(packed), 20, 'hiç boşluklu yer yoksa sağdan ilk boş hücre');
}

console.log('rack.selftest: satır ayrımı, kaydırma, otomatik dizme, çiftler, sahte okey, per/çift taşıma, sürükleme önizlemesi ve ıstaka-el uyumu ✓');
