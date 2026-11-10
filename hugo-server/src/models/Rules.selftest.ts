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

console.log('Rules.selftest: el açma, set doğrulama, sıra, işleme, yandan alma, işlek taş, otomatik atış, Hugo ve sahte okey kuralları ✓');
