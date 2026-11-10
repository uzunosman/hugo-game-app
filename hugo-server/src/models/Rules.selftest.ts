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
    assert.strictEqual(game.discardTile(p1.id, hand[0].id), null);
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

console.log('Rules.selftest: el açma, set doğrulama, sıra ve işleme kuralları ✓');
