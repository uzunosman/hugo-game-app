// Kural motoru öz-testi: `npm test` ile çalışır.
import assert from 'assert';
import { Game, TurnAction } from './Game';
import { Player } from './Player';
import { Tile, TileColor } from './Tile';

const { RED, BLUE, YELLOW, BLACK } = TileColor;
const t = (color: TileColor, value: number) => new Tile(color, value);

// 1. el (Hugo) — sıra P0'da, taş çekmiş (discard aşaması); eller elle kurulur
const setup = () => {
    const game = new Game([0, 1, 2, 3].map(i => new Player(`P${i}`, `s${i}`)));
    game.turnAction = TurnAction.DISCARD;
    const [p0, p1] = game.players;
    return { game, p0, p1 };
};
const give = (p: Player, tiles: Tile[]) => { p.tiles = []; tiles.forEach(x => p.addTile(x)); return tiles; };
const ids = (tiles: Tile[]) => tiles.map(x => x.id);

// El açma: 51 altı reddedilir
{
    const { game, p0 } = setup();
    const seq = give(p0, [t(RED, 5), t(RED, 6), t(RED, 7), t(BLUE, 1)]);
    const r = game.openHand(p0.id, [ids(seq.slice(0, 3))]);
    assert.strictEqual(r.success, false, '18 değerle açılmamalı');
    assert.strictEqual(p0.isOpen, false);
    assert.strictEqual(p0.penaltyScore, 100, 'yetersiz açma 100 ceza');
}

// El açma: 51+ kabul edilir, taşlar masaya iner
{
    const { game, p0 } = setup();
    const hand = give(p0, [t(RED, 11), t(RED, 12), t(RED, 13), t(BLACK, 9), t(YELLOW, 9), t(BLUE, 9), t(BLUE, 1)]);
    const r = game.openHand(p0.id, [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))]);
    assert.strictEqual(r.success, true, r.error);
    assert.strictEqual(r.openedTotal, 36 + 27);
    assert.strictEqual(p0.tiles.length, 1);
    assert.strictEqual(game.tableSets.length, 2);
}

// Geçersiz setler: 12-13-1 bağlantısı yok, aynı renk iki kez aynı sayı olamaz
{
    const { game, p0 } = setup();
    const wrap = give(p0, [t(RED, 12), t(RED, 13), t(RED, 1), t(RED, 9), t(RED, 9), t(BLUE, 9)]);
    assert.strictEqual(game.openHand(p0.id, [ids(wrap.slice(0, 3))]).success, false, '12-13-1 geçersiz olmalı');
    assert.strictEqual(game.openHand(p0.id, [ids(wrap.slice(3, 6))]).success, false, 'aynı renk 9-9 geçersiz olmalı');
}

// Sıra başkasındayken hiçbir hamle kabul edilmez
{
    const { game, p1 } = setup();
    const hand = give(p1, [t(RED, 11), t(RED, 12), t(RED, 13), t(BLACK, 9), t(YELLOW, 9), t(BLUE, 9)]);
    assert.strictEqual(game.openHand(p1.id, [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))]).success, false);
    assert.strictEqual(game.discardTile(p1.id, hand[0].id).tile, null);
}

// İşleme: başkasının perine taş eklemek per sahibine taş × 10 ceza yazar
{
    const { game, p0, p1 } = setup();
    // P1 açmış ve masada kırmızı 11-12-13 var
    const p1Set = give(p1, [t(RED, 10), t(RED, 11), t(RED, 12)]);
    game.tableSets.push({ id: 'set1', playerId: p1.id, tiles: p1Set, value: 33 });
    p1.isOpen = true;
    p0.isOpen = true;
    const [nine] = give(p0, [t(RED, 9), t(BLUE, 2)]);
    const r = game.addTileToSet(p0.id, nine.id, 'set1', 'start');
    assert.strictEqual(r.success, true, r.error);
    assert.strictEqual(p1.penaltyScore, 90, 'per sahibine 9 × 10 ceza');
    assert.strictEqual(game.tableSets[0].tiles.length, 4);
    // Yanlış uca ekleme reddedilir
    const [two] = p0.tiles;
    assert.strictEqual(game.addTileToSet(p0.id, two.id, 'set1', 'end').success, false);
}

// Yandan alınan taş kullanılmalı: başka taş atılamaz, aynı taş 100 cezayla geri atılabilir
{
    const { game, p0, p1 } = setup();
    const [x] = give(p0, [t(BLUE, 4), t(BLUE, 8)]);
    assert.ok(game.discardTile(p0.id, x.id).tile, 'P0 atabilmeli');
    give(p1, [t(BLACK, 1), t(YELLOW, 6), t(RED, 2)]);
    const taken = game.drawTile(p1.id, true);
    assert.strictEqual(taken?.id, x.id, 'P1 yandan alabilmeli');
    const other = game.discardTile(p1.id, p1.tiles[0].id);
    assert.strictEqual(other.tile, null, 'yandan alınan taş kullanılmadan başka taş atılamaz');
    assert.match(other.error || '', /Yandan/);
    const back = game.discardTile(p1.id, x.id);
    assert.ok(back.tile, 'aynı taş geri atılabilir');
    assert.strictEqual(p1.penaltyScore, 100);
}

// İşlek taş: masadaki pere eklenebilecek taşı atmak taş × 10 ceza; eli bitiren son taş muaf
{
    const { game, p0, p1 } = setup();
    game.tableSets.push({ id: 'set1', playerId: p1.id, tiles: [t(RED, 10), t(RED, 11), t(RED, 12)], value: 33 });
    const [thirteen] = give(p0, [t(RED, 13), t(BLUE, 2)]);
    const r = game.discardTile(p0.id, thirteen.id);
    assert.ok(r.tile);
    assert.deepStrictEqual(r.penalties.map(p => p.amount), [130]);
    assert.strictEqual(p0.penaltyScore, 130);

    const g2 = setup();
    g2.game.tableSets.push({ id: 'set1', playerId: g2.p1.id, tiles: [t(RED, 10), t(RED, 11), t(RED, 12)], value: 33 });
    const [last] = give(g2.p0, [t(RED, 9)]);
    assert.deepStrictEqual(g2.game.discardTile(g2.p0.id, last.id).penalties, [], 'bitiren taş cezasız');
}

// Süre dolunca: yandan alınan taş bekliyorsa o atılır, yoksa okey olmayan en küçük taş
{
    const { game, p0 } = setup();
    give(p0, [t(RED, 9), t(BLUE, 3), t(BLACK, 7), new Tile(TileColor.PURPLE, 'H', true)]);
    assert.strictEqual(game.pickAutoDiscard(p0.id)?.value, 3);
}

// Gösterge sahte okey ise el Hugo sayılır
{
    const { game } = setup();
    game.round = 2;
    game.indicatorTile = t(RED, 5);
    assert.strictEqual(game.isHugoRound(), false);
    game.indicatorTile = new Tile(TileColor.PURPLE, 'H', true);
    assert.strictEqual(game.isHugoRound(), true);
}

// Normal elde sahte okey (joker) okeyin değeriyle oynanır, joker gibi davranmaz; gerçek okey jokerdir
{
    const normal = () => {
        const g = setup();
        g.game.round = 2;
        g.game.indicatorTile = t(RED, 5);
        g.game.okeyTile = t(RED, 6); // okey: kırmızı 6
        return g;
    };
    const joker = () => new Tile(TileColor.PURPLE, 'H', true);
    const thirteens = () => [t(BLUE, 13), t(BLACK, 13), t(YELLOW, 13)];

    // kırmızı 4-5 + sahte okey (= kırmızı 6) geçerli seri: 15 + 39 = 54
    const a = normal();
    const h1 = give(a.p0, [t(RED, 4), t(RED, 5), joker(), ...thirteens()]);
    const r1 = a.game.openHand(a.p0.id, [ids(h1.slice(0, 3)), ids(h1.slice(3))]);
    assert.strictEqual(r1.success, true, r1.error);
    assert.strictEqual(r1.openedTotal, 54);

    // mavi 3-4 + sahte okey geçersiz: sahte okey mavi 5 olamaz
    const b = normal();
    const h2 = give(b.p0, [t(BLUE, 3), t(BLUE, 4), joker(), ...thirteens()]);
    assert.strictEqual(b.game.openHand(b.p0.id, [ids(h2.slice(0, 3)), ids(h2.slice(3))]).success, false);

    // mavi 3-4 + gerçek okey (kırmızı 6) geçerli: okey mavi 5 yerine geçer → 12 + 39 = 51
    const c = normal();
    const h3 = give(c.p0, [t(BLUE, 3), t(BLUE, 4), t(RED, 6), ...thirteens()]);
    const r3 = c.game.openHand(c.p0.id, [ids(h3.slice(0, 3)), ids(h3.slice(3))]);
    assert.strictEqual(r3.success, true, r3.error);
    assert.strictEqual(r3.openedTotal, 51);
}

// Çift açma: aynı renk ve sayıdan çiftlerin toplamı ≥ 51; okey + taş da çifttir
{
    const pairs = () => [t(RED, 13), t(RED, 13), t(BLUE, 12), t(BLUE, 12), t(BLACK, 1), t(BLACK, 1), t(YELLOW, 4)];
    const a = setup();
    const h = give(a.p0, pairs());
    const r = a.game.openHand(a.p0.id, [ids(h.slice(0, 2)), ids(h.slice(2, 4)), ids(h.slice(4, 6))], 'cift');
    assert.strictEqual(r.success, true, r.error);
    assert.strictEqual(r.openedTotal, 26 + 24 + 2);
    assert.strictEqual(a.p0.openedWithPairs, true);
    assert.strictEqual(a.p0.lastOpenedValue, 0, 'çift açılış seri eşiğini yükseltmez');
    assert.ok(a.game.tableSets.every(st => st.kind === 'cift'));

    // 26 + 24 = 50 → yetersiz, 100 ceza
    const b = setup();
    const hb = give(b.p0, pairs());
    const rb = b.game.openHand(b.p0.id, [ids(hb.slice(0, 2)), ids(hb.slice(2, 4))], 'cift');
    assert.strictEqual(rb.success, false);
    assert.strictEqual(b.p0.penaltyScore, 100);

    // Hugo elinde joker okeydir: joker + kırmızı 13 = 26, + mavi 12'ler 24 + siyah 1'ler 2 = 52
    const c = setup();
    const hc = give(c.p0, [new Tile(TileColor.PURPLE, 'H', true), t(RED, 13), t(BLUE, 12), t(BLUE, 12), t(BLACK, 1), t(BLACK, 1)]);
    const rc = c.game.openHand(c.p0.id, [ids(hc.slice(0, 2)), ids(hc.slice(2, 4)), ids(hc.slice(4, 6))], 'cift');
    assert.strictEqual(rc.success, true, rc.error);
    assert.strictEqual(rc.openedTotal, 52);

    // Farklı iki taş çift değildir
    const d = setup();
    const hd = give(d.p0, [t(RED, 13), t(RED, 13), t(BLUE, 12), t(BLUE, 12), t(BLACK, 1), t(BLACK, 2)]);
    assert.strictEqual(d.game.openHand(d.p0.id, [ids(hd.slice(0, 2)), ids(hd.slice(2, 4)), ids(hd.slice(4, 6))], 'cift').success, false, 'siyah 1-2 çift değil');
}

// Çiftle açan yalnızca çift indirir; seriyle açan çift indiremez; çiftlere tek taş işlenmez
{
    const { game, p0, p1 } = setup();
    p0.isOpen = true; p0.openedWithPairs = true;
    const [x, y, s1, s2, s3] = give(p0, [t(RED, 7), t(RED, 7), t(BLUE, 3), t(BLUE, 4), t(BLUE, 5), t(BLACK, 9)]);
    assert.strictEqual(game.dropPer(p0.id, [[s1.id, s2.id, s3.id]]).success, false, 'çiftle açan seri indiremez');
    assert.strictEqual(game.dropPer(p0.id, [[x.id, y.id]]).success, true, 'çiftle açan çift indirir');
    const pairSet = game.tableSets[game.tableSets.length - 1];
    assert.strictEqual(pairSet.kind, 'cift');

    p1.isOpen = true;
    const [r7, b1, b2] = give(p1, [t(RED, 7), t(BLACK, 1), t(BLACK, 1)]);
    game.currentPlayerIndex = 1; game.players.forEach((p, i) => p.setTurn(i === 1));
    assert.strictEqual(game.dropPer(p1.id, [[b1.id, b2.id]]).success, false, 'seriyle açan çift indiremez');
    assert.strictEqual(game.addTileToSet(p1.id, r7.id, pairSet.id, 'end').success, false, 'çiftlere tek taş işlenmez');
}

// El sonu: elde kalan × 10, her özel durum × 2, kullanılmayan okey + 100
{
    const { game, p0, p1 } = setup();
    const [, , p2, p3] = game.players;
    game.round = 2;
    game.indicatorTile = t(RED, 5);
    game.okeyTile = t(RED, 6);
    assert.strictEqual(game.isHugoRound(), false);

    // P0 aynı sırada çiftle açıp son taşı atar: çiftten bitme + elden bitme → × 4
    const h = give(p0, [t(RED, 13), t(RED, 13), t(BLACK, 13), t(BLACK, 13), t(BLUE, 1)]);
    assert.strictEqual(game.openHand(p0.id, [ids(h.slice(0, 2)), ids(h.slice(2, 4))], 'cift').success, true);
    const fin = game.discardTile(p0.id, h[4].id);
    assert.ok(fin.tile && p0.tiles.length === 0);
    assert.deepStrictEqual(fin.penalties, [], 'bitiren son taş işlek cezası almaz');

    p1.isOpen = true; give(p1, [t(RED, 5)]);                 // 5 × 10 = 50 → × 4 = 200
    give(p2, [t(YELLOW, 9), t(YELLOW, 10)]);                  // açmadı → 400 × 4 = 1600
    p3.isOpen = true; give(p3, [t(RED, 6), t(BLUE, 2)]);      // okey 0 + 2 × 10 = 20 → 80, + 100 okey
    const res = Object.fromEntries(game.endRound(p0.id).map(r => [r.playerName, r]));

    assert.strictEqual(res.P0.isFinisher, true);
    assert.strictEqual(res.P0.finishedWithPairs, true);
    assert.strictEqual(res.P0.finishedElden, true);
    assert.strictEqual(res.P0.stars, 1, 'çiftten bitiren 1 yıldız');
    assert.strictEqual(res.P0.roundTotal, 0);
    assert.strictEqual(res.P1.multiplier, 4);
    assert.strictEqual(res.P1.roundTotal, 200);
    assert.strictEqual(res.P2.roundTotal, 1600);
    assert.strictEqual(res.P3.unusedOkeyPenalty, 100);
    assert.strictEqual(res.P3.roundTotal, 180);
}

// Daha önceki bir sırada açıp bitiren "elden" bitirmiş sayılmaz
{
    const { game, p0, p1 } = setup();
    const h = give(p0, [t(RED, 13), t(RED, 13), t(BLACK, 13), t(BLACK, 13), t(BLUE, 1)]);
    assert.strictEqual(game.openHand(p0.id, [ids(h.slice(0, 2)), ids(h.slice(2, 4))], 'cift').success, true);
    game.turnCounter += 4; // dört sıra sonra bitiriyor
    assert.ok(game.discardTile(p0.id, h[4].id).tile);
    p1.isOpen = true; give(p1, [t(RED, 5)]);
    const r1 = game.endRound(p0.id).find(r => r.playerId === p1.id)!;
    assert.strictEqual(r1.multiplier, 2 * 2, 'Hugo (1. el) × çiftten bitme');
    assert.strictEqual(r1.roundTotal, 5 * 10 * 4);
}

// Çiftlere çift işleme: sahibine (taşların toplamı × 10) × 2 ceza; kendi çiftine işlemek cezasız
{
    const { game, p0, p1 } = setup();
    p0.isOpen = true; p0.openedWithPairs = true;
    game.tableSets.push({ id: 'cift0', playerId: p0.id, tiles: [t(RED, 13), t(RED, 13)], value: 26, kind: 'cift' });

    // P1'in sırası: iki 5'i P0'ın çiftlerine işler → ((5 + 5) × 10) × 2 = 200
    game.currentPlayerIndex = 1; game.players.forEach((p, i) => p.setTurn(i === 1));
    p1.isOpen = true;
    const [f1, f2, other, bad] = give(p1, [t(BLUE, 5), t(BLUE, 5), t(BLACK, 9), t(YELLOW, 5)]);
    assert.strictEqual(game.addPairToSet(p1.id, [f1.id, bad.id], 'cift0').success, false, 'farklı renk çift değil');
    const r = game.addPairToSet(p1.id, [f1.id, f2.id], 'cift0');
    assert.strictEqual(r.success, true, r.error);
    assert.deepStrictEqual(r.penalty, { targetPlayerId: p0.id, amount: 200 });
    assert.strictEqual(p0.penaltyScore, 200);
    assert.strictEqual(r.newSet?.playerId, p0.id, 'işlenen çift sahibinin alanına konur');
    assert.deepStrictEqual(p1.tiles.map(x => x.id), [other.id, bad.id]);

    // Seri setine çift işlenmez; açmamış oyuncu işleyemez
    game.tableSets.push({ id: 'seri1', playerId: p0.id, tiles: [t(RED, 1), t(RED, 2), t(RED, 3)], value: 6, kind: 'seri' });
    const [g1, g2] = give(p1, [t(BLACK, 8), t(BLACK, 8)]);
    assert.strictEqual(game.addPairToSet(p1.id, [g1.id, g2.id], 'seri1').success, false);
    p1.isOpen = false;
    assert.strictEqual(game.addPairToSet(p1.id, [g1.id, g2.id], 'cift0').success, false, 'açmadan işlenmez');

    // Kendi çiftine işlemek cezasız
    const own = setup();
    own.p0.isOpen = true; own.p0.openedWithPairs = true;
    own.game.tableSets.push({ id: 'c', playerId: own.p0.id, tiles: [t(RED, 13), t(RED, 13)], value: 26, kind: 'cift' });
    const [o1, o2] = give(own.p0, [t(BLUE, 7), t(BLUE, 7), t(BLACK, 1)]);
    const ro = own.game.addPairToSet(own.p0.id, [o1.id, o2.id], 'c');
    assert.strictEqual(ro.success, true, ro.error);
    assert.strictEqual(ro.penalty, undefined);
    assert.strictEqual(own.p0.penaltyScore, 0);
}

console.log('Rules.selftest: el açma, set doğrulama, sıra, işleme, yandan alma, işlek taş, otomatik atış, Hugo, sahte okey, çift açma, çift işleme ve el sonu puanlama kuralları ✓');
