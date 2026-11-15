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
    // Rastgele gösterge testleri bozmasın: sahte okey çıkarsa el Hugo sayılır; sabit gösterge sarı 1, okey sarı 2
    game.indicatorTile = t(YELLOW, 1); game.okeyTile = t(YELLOW, 2);
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
    assert.strictEqual(p0.penaltyScore, 0, 'yetersiz açma denemesi ceza yazmaz');
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
    // Uymayan taş hiçbir uca işlenmez
    const [two] = p0.tiles;
    assert.strictEqual(game.addTileToSet(p0.id, two.id, 'set1', 'end').success, false);
    // Yanlış uç istense de taş uyan uca işlenir (telefonda parmak perin öbür ucunda kalabilir)
    const [eight] = give(p0, [t(RED, 8), t(BLUE, 2)]);
    assert.strictEqual(game.addTileToSet(p0.id, eight.id, 'set1', 'end').success, true);
    assert.strictEqual(game.tableSets[0].tiles[0].value, 8, 'kırmızı 8 başa eklendi');
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

// İşlek taş: masadaki pere eklenebilecek taşı atmak 100 ceza (Hugo dışı el); eli bitiren son taş muaf
{
    const { game, p0, p1 } = setup();
    game.round = 2;
    game.tableSets.push({ id: 'set1', playerId: p1.id, tiles: [t(RED, 10), t(RED, 11), t(RED, 12)], value: 33 });
    const [thirteen] = give(p0, [t(RED, 13), t(BLUE, 2)]);
    const r = game.discardTile(p0.id, thirteen.id);
    assert.ok(r.tile);
    assert.deepStrictEqual(r.penalties.map(p => p.amount), [100]);
    assert.strictEqual(p0.penaltyScore, 100);

    const g2 = setup();
    g2.game.tableSets.push({ id: 'set1', playerId: g2.p1.id, tiles: [t(RED, 10), t(RED, 11), t(RED, 12)], value: 33 });
    const [last] = give(g2.p0, [t(RED, 9)]);
    assert.deepStrictEqual(g2.game.discardTile(g2.p0.id, last.id).penalties, [], 'bitiren taş cezasız');
}

// İşlek: perde okeyin yerini tuttuğu taşı atmak da işlek (normal elde okey sarı 2, Hugo elinde sahte okey; normal elde 100, Hugo elinde 200; son taş muaf)
{
    const seqSet = () => [t(RED, 6), t(YELLOW, 2), t(RED, 8)];      // okey = kırmızı 7
    const sameSet = () => [t(RED, 9), t(BLUE, 9), t(BLACK, 9), new Tile(TileColor.PURPLE, 'H', true)]; // Hugo elinde okey sahte okeydir; burada sarı 9
    const g = setup(); g.game.round = 2;
    g.game.tableSets.push({ id: 's', playerId: g.p1.id, tiles: seqSet(), value: 21 });
    const [r7] = give(g.p0, [t(RED, 7), t(BLUE, 1)]);
    assert.deepStrictEqual(g.game.discardTile(g.p0.id, r7.id).penalties.map(p => p.amount), [100], 'okeyin yerindeki taş işlek');

    const h = setup(); // 1. el Hugo
    h.game.tableSets.push({ id: 's', playerId: h.p1.id, tiles: sameSet(), value: 36 });
    const [y9] = give(h.p0, [t(YELLOW, 9), t(BLUE, 1)]);
    assert.deepStrictEqual(h.game.discardTile(h.p0.id, y9.id).penalties.map(p => p.amount), [200], 'Hugo elinde 200');

    const l = setup();
    l.game.tableSets.push({ id: 's', playerId: l.p1.id, tiles: seqSet(), value: 21 });
    const [last] = give(l.p0, [t(RED, 7)]);
    assert.deepStrictEqual(l.game.discardTile(l.p0.id, last.id).penalties, [], 'son taş muaf');

    const n = setup(); n.game.round = 2;
    n.game.tableSets.push({ id: 's', playerId: n.p1.id, tiles: seqSet(), value: 21 });
    const [b7] = give(n.p0, [t(BLUE, 7), t(BLUE, 1)]);
    assert.deepStrictEqual(n.game.discardTile(n.p0.id, b7.id).penalties, [], 'okeyin yerini tutmayan taş işlek değil');
}

// Per per açma (sürükle-bırak): eşik dolana kadar perler yerde bekler, taş atılamaz; eşik dolunca el açılır
{
    const { game, p0 } = setup(); game.round = 2;
    const [r10, r11, r12, b7, b8, b9, k1, k13] = give(p0, [t(RED, 10), t(RED, 11), t(RED, 12), t(BLUE, 7), t(BLUE, 8), t(BLUE, 9), t(BLACK, 1), t(BLACK, 13)]);
    assert.strictEqual(game.openHand(p0.id, [ids([r10, r11, r12])]).success, false, 'Tümünü aç: 33 yetmez');
    const a = game.openHand(p0.id, [ids([r10, r11, r12])], 'seri', true);
    assert.ok(a.success && !p0.isOpen, 'tek per yere iner, el henüz açık değil');
    assert.strictEqual(a.pendingTotal, 33);
    assert.strictEqual(game.tableSets.length, 1);
    assert.ok(/Açılış yetersiz/.test(game.discardTile(p0.id, k1.id).error || ''), 'bekleyen açılışla taş atılamaz');
    const b = game.openHand(p0.id, [ids([b7, b8, b9])], 'seri', true);
    assert.ok(b.success && p0.isOpen, '33 + 24 = 57: el açıldı');
    assert.strictEqual(p0.lastOpenedValue, 57);
    assert.strictEqual(game.pendingOpen, null);
    assert.ok(game.discardTile(p0.id, k1.id).tile, 'açıldıktan sonra taş atılır');
    void k13;
}

// Süre dolunca bekleyen açılış: elde per varsa tamamlanır; yoksa perler ele döner, ceza yazılır
{
    const { game, p0 } = setup(); game.round = 2;
    const hand = give(p0, [t(RED, 10), t(RED, 11), t(RED, 12), t(BLUE, 7), t(BLUE, 8), t(BLUE, 9), t(BLACK, 1)]);
    game.openHand(p0.id, [ids(hand.slice(0, 3))], 'seri', true);
    const done = game.completePendingOpen(p0.id);
    assert.ok(done.success && p0.isOpen, 'eldeki mavi 7-8-9 ile açılış tamamlandı');
    assert.strictEqual(p0.tiles.length, 1);

    const h = setup(); // 1. el Hugo: geri alma cezası 200
    const hh = give(h.p0, [t(RED, 10), t(RED, 11), t(RED, 12), t(BLUE, 1), t(BLACK, 5)]);
    h.game.openHand(h.p0.id, [ids(hh.slice(0, 3))], 'seri', true);
    assert.strictEqual(h.game.completePendingOpen(h.p0.id).success, false, 'elde per yok');
    const u = h.game.undoTurnPlays(h.p0.id, h.game.isHugoRound() ? 200 : 100);
    assert.ok(u.success);
    assert.strictEqual(h.p0.tiles.length, 5, 'perler ele döndü');
    assert.strictEqual(h.game.tableSets.length, 0);
    assert.strictEqual(h.p0.penaltyScore, 200);
    assert.strictEqual(h.game.pendingOpen, null);
    assert.ok(h.game.discardTile(h.p0.id, hh[3].id).tile, 'geri alındıktan sonra taş atılır');
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
    const thirteens = () => [t(BLUE, 13), t(BLACK, 13), t(YELLOW, 13), t(BLACK, 2)]; // son taş elde kalır

    // kırmızı 4-5 + sahte okey (= kırmızı 6) geçerli seri: 15 + 39 = 54
    const a = normal();
    const h1 = give(a.p0, [t(RED, 4), t(RED, 5), joker(), ...thirteens()]);
    const r1 = a.game.openHand(a.p0.id, [ids(h1.slice(0, 3)), ids(h1.slice(3, 6))]);
    assert.strictEqual(r1.success, true, r1.error);
    assert.strictEqual(r1.openedTotal, 54);

    // mavi 3-4 + sahte okey geçersiz: sahte okey mavi 5 olamaz
    const b = normal();
    const h2 = give(b.p0, [t(BLUE, 3), t(BLUE, 4), joker(), ...thirteens()]);
    assert.strictEqual(b.game.openHand(b.p0.id, [ids(h2.slice(0, 3)), ids(h2.slice(3, 6))]).success, false);

    // mavi 3-4 + gerçek okey (kırmızı 6) geçerli: okey mavi 5 yerine geçer → 12 + 39 = 51
    const c = normal();
    const h3 = give(c.p0, [t(BLUE, 3), t(BLUE, 4), t(RED, 6), ...thirteens()]);
    const r3 = c.game.openHand(c.p0.id, [ids(h3.slice(0, 3)), ids(h3.slice(3, 6))]);
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
    assert.strictEqual(a.p0.lastOpenedValue, 52, 'çift açılış da ortak eşiği belirler');
    assert.ok(a.game.tableSets.every(st => st.kind === 'cift'));

    // 26 + 24 = 50 → yetersiz, ceza yok
    const b = setup();
    const hb = give(b.p0, pairs());
    const rb = b.game.openHand(b.p0.id, [ids(hb.slice(0, 2)), ids(hb.slice(2, 4))], 'cift');
    assert.strictEqual(rb.success, false);
    assert.strictEqual(b.p0.penaltyScore, 0);

    // Çift açan da masadaki en yüksek açılışı geçmeli: masada 60 varken 52'lik çift açılmaz
    const e = setup();
    e.p1.lastOpenedValue = 60;
    const he = give(e.p0, pairs());
    assert.strictEqual(e.game.openHand(e.p0.id, [ids(he.slice(0, 2)), ids(he.slice(2, 4)), ids(he.slice(4, 6))], 'cift').success, false, '52 < 60');

    // Hugo elinde joker okeydir: joker + kırmızı 13 = 26, + mavi 12'ler 24 + siyah 1'ler 2 = 52
    const c = setup();
    const hc = give(c.p0, [new Tile(TileColor.PURPLE, 'H', true), t(RED, 13), t(BLUE, 12), t(BLUE, 12), t(BLACK, 1), t(BLACK, 1), t(YELLOW, 4)]);
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

// El sonu: elde kalan taş değerleri toplamı × 2, her özel durum × 2 (elden bitme yalnızca başka açan yoksa), kullanılmayan okey 100 × özel durum
{
    const { game, p0, p1 } = setup();
    const [, , p2, p3] = game.players;
    game.round = 2;
    game.indicatorTile = t(RED, 5);
    game.okeyTile = t(RED, 6);
    assert.strictEqual(game.isHugoRound(), false);

    // P0 aynı sırada çiftle açıp son taşı atar: P1 ve P3 açmış olduğundan elden bitme sayılmaz, yalnızca çiftten bitme → × 2
    const h = give(p0, [t(RED, 13), t(RED, 13), t(BLACK, 13), t(BLACK, 13), t(BLUE, 1)]);
    assert.strictEqual(game.openHand(p0.id, [ids(h.slice(0, 2)), ids(h.slice(2, 4))], 'cift').success, true);
    const fin = game.discardTile(p0.id, h[4].id);
    assert.ok(fin.tile && p0.tiles.length === 0);
    assert.deepStrictEqual(fin.penalties, [], 'bitiren son taş işlek cezası almaz');

    p1.isOpen = true; give(p1, [t(RED, 5)]);                 // 5 × 2 = 10 → çiftten × 2 = 20
    give(p2, [t(YELLOW, 9), t(RED, 6)]);                      // açmadı → 400 × 2 = 800; okey cezası yok
    p3.isOpen = true; give(p3, [t(RED, 6), t(BLUE, 2)]);      // okey 0 + 2 × 2 = 4 → 8, + okey 100 × 2 = 200
    const res = Object.fromEntries(game.endRound(p0.id).map(r => [r.playerName, r]));

    assert.strictEqual(res.P0.isFinisher, true);
    assert.strictEqual(res.P0.finishedWithPairs, true);
    assert.strictEqual(res.P0.finishedElden, false, 'masada açan varken elden bitme çarpanı yok');
    assert.strictEqual(res.P0.stars, 1, 'çiftten bitiren 1 yıldız');
    assert.strictEqual(res.P0.roundTotal, 0);
    assert.strictEqual(res.P1.multiplier, 2);
    assert.strictEqual(res.P1.roundTotal, 20);
    assert.strictEqual(res.P2.roundTotal, 800);
    assert.strictEqual(res.P3.unusedOkeyPenalty, 200, 'okey cezası özel durum çarpanıyla');
    assert.strictEqual(res.P2.unusedOkeyPenalty, 0, 'eli açmamış oyuncuya kullanılmayan okey cezası yazılmaz');
    assert.strictEqual(res.P3.roundTotal, 208);
    assert.strictEqual(res.P1.stars, 0, '100 altı açılış yıldız almaz');
}

// Okeyle bitme: normal elde gerçek okey (göstergenin bir üstü) sayılır, sahte okey sayılmaz
{
    const finish = (last: Tile) => {
        const { game, p0, p1 } = setup();
        game.round = 2; game.indicatorTile = t(RED, 5); game.okeyTile = t(RED, 6);
        p0.isOpen = true; p0.openedAtTurn = -5;
        give(p0, [last]);
        p1.isOpen = true; give(p1, [t(BLUE, 3)]);
        assert.ok(game.discardTile(p0.id, last.id).tile);
        return Object.fromEntries(game.endRound(p0.id).map(r => [r.playerName, r]));
    };
    const real = finish(t(RED, 6));
    assert.strictEqual(real.P0.finishedWithJoker, true, 'gerçek okeyle bitti');
    assert.strictEqual(real.P0.stars, 2, 'okeyle bitiren 2 yıldız');
    assert.strictEqual(real.P1.roundTotal, 3 * 2 * 2, 'rakibin elde kalanı (× 2) okeyle bitişte × 2');
    const fake = finish(new Tile(TileColor.PURPLE, 'H', true));
    assert.strictEqual(fake.P0.finishedWithJoker, false, 'normal elde sahte okey okey sayılmaz');
    assert.strictEqual(fake.P0.stars, 1);

    // Hugo elinde okey sahte okeydir
    const { game, p0, p1 } = setup();
    p0.isOpen = true; p0.openedAtTurn = -5;
    p1.isOpen = true; // başka biri açtı: "kimse açmadı" çarpanı yok
    const h = new Tile(TileColor.PURPLE, 'H', true);
    give(p0, [h]);
    assert.ok(game.discardTile(p0.id, h.id).tile);
    const hr = Object.fromEntries(game.endRound(p0.id).map(r => [r.playerName, r]));
    assert.strictEqual(hr.P0.finishedWithJoker, true);
    assert.strictEqual(hr.P0.stars, 4, 'Hugo elinde okeyle bitiş: 1 × 2 × 2');
}

// 100 ve üzeri açılış 1 yıldız (bitiren dahil, bitiş yıldızına eklenir)
{
    const { game, p0, p1 } = setup(); // Hugo eli: bitiş yıldızı 1 × 2 = 2
    const h = give(p0, [t(RED, 11), t(RED, 12), t(RED, 13), t(BLACK, 13), t(YELLOW, 13), t(BLUE, 13), t(BLACK, 12), t(YELLOW, 12), t(BLUE, 12), t(BLUE, 1)]);
    const r = game.openHand(p0.id, [ids(h.slice(0, 3)), ids(h.slice(3, 6)), ids(h.slice(6, 9))]);
    assert.ok(r.success && r.openedTotal! >= 100, r.error);
    p1.isOpen = true; p1.openingScore = 120; give(p1, [t(RED, 5)]);
    assert.ok(game.discardTile(p0.id, h[9].id).tile);
    const res = Object.fromEntries(game.endRound(p0.id).map(x => [x.playerName, x]));
    assert.strictEqual(res.P0.stars, 3, 'Hugo bitişi 2 + 100+ açılış 1');
    assert.strictEqual(res.P1.stars, 1, 'bitirmeyen 100+ açan 1 yıldız');
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
    assert.strictEqual(r1.roundTotal, 5 * 2 * 4);
}

// Elden bitme: kimse açmamışken aynı sırada açıp biten → × 2 (ve kimse açmamış: rakiplere 800)
{
    const { game, p0, p1 } = setup();
    game.round = 2; game.indicatorTile = t(RED, 5); game.okeyTile = t(RED, 6);
    // Açmadan bitme: kalan bütün taşlar per, son taş atılır; perler masaya inmez
    const all = give(p0, [t(BLUE, 3), t(BLUE, 4), t(BLUE, 5), t(BLACK, 9), t(RED, 10), t(RED, 11), t(RED, 12), t(BLACK, 13), t(YELLOW, 13), t(BLUE, 13)]);
    const h = all.slice(0, 4), g = all.slice(4);
    const before = game.tableSets.length;
    assert.ok(game.discardTile(p0.id, h[3].id, [ids(h.slice(0, 3)), ids(g.slice(0, 3))]).error, 'eksik per kabul edilmez');
    assert.ok(game.discardTile(p0.id, h[3].id, [ids(h.slice(0, 2)), ids([h[2], ...g.slice(0, 3)]), ids(g.slice(3))]).error, 'geçersiz per kabul edilmez');
    const fin = game.discardTile(p0.id, h[3].id, [ids(h.slice(0, 3)), ids(g.slice(0, 3)), ids(g.slice(3))]);
    assert.ok(fin.tile && p0.tiles.length === 0, fin.error);
    assert.deepStrictEqual(fin.penalties, [], 'açmadan bitirirken işlek cezası yok');
    assert.strictEqual(game.tableSets.length, before, 'perler masaya inmez');
    give(p1, [t(RED, 2)]);
    const res = Object.fromEntries(game.endRound(p0.id).map(r => [r.playerName, r]));
    assert.strictEqual(res.P0.finishedElden, true, 'kimse açmamış: elden bitme sayılır');
    assert.strictEqual(res.P1.roundTotal, 800 * 2, 'kimse açmamış 800 × elden 2');
}

// Açmadan bitme, masada açan varken: elden çarpanı yok
{
    const { game, p0, p1 } = setup();
    game.round = 2; game.indicatorTile = t(RED, 5); game.okeyTile = t(RED, 6);
    p0.tiles = [];
    const g = give(p0, [t(BLUE, 3), t(BLUE, 4), t(BLUE, 5), t(BLACK, 9)]);
    p1.isOpen = true; give(p1, [t(RED, 2), t(RED, 3)]);
    assert.ok(game.discardTile(p0.id, g[3].id, [ids(g.slice(0, 3))]).tile);
    const r1 = game.endRound(p0.id).find(r => r.playerId === p1.id)!;
    assert.strictEqual(r1.multiplier, 1);
    assert.strictEqual(r1.roundTotal, 10, 'açan rakip: (2 + 3) × 2');
}

// Açtığı sırada taş atmadan indirilen per ve kendi perine işlenen taş açılış değerine eklenir
{
    const { game, p0 } = setup();
    game.round = 2; game.indicatorTile = t(RED, 5); game.okeyTile = t(RED, 6);
    const h = give(p0, [t(BLUE, 10), t(BLUE, 11), t(BLUE, 12), t(BLACK, 10), t(YELLOW, 10), t(RED, 10), t(BLACK, 3), t(BLACK, 4), t(BLACK, 5), t(BLUE, 13), t(RED, 1)]);
    const r = game.openHand(p0.id, [ids(h.slice(0, 3)), ids(h.slice(3, 6))]);
    assert.ok(r.success, r.error);
    const opened = p0.lastOpenedValue;
    assert.strictEqual(opened, 63);
    assert.ok(game.dropPer(p0.id, [ids(h.slice(6, 9))]).success);
    assert.strictEqual(p0.lastOpenedValue, 63 + 12, 'aynı sırada indirilen per eklenir');
    const seri = game.tableSets.find(x => x.playerId === p0.id && x.tiles.some(y => y.id === h[0].id))!;
    assert.ok(game.addTileToSet(p0.id, h[9].id, seri.id, 'end').success);
    assert.strictEqual(p0.lastOpenedValue, 75 + 13, 'kendi perine işlenen taş eklenir');
    assert.strictEqual(p0.openedTotal, 88);
    // Sıra geçince (sonraki sıralarda) eklenmez
    game.turnCounter += 4;
    const [b9, b8] = give(p0, [t(BLUE, 9), t(RED, 2)]);
    assert.ok(game.addTileToSet(p0.id, b9.id, seri.id, 'start').success);
    assert.strictEqual(p0.lastOpenedValue, 88, 'sonraki sırada eklenmez');
    void b8;
}

// Çiftlere çift işleme: sahibine normal işleme gibi taşların toplamı × 10 ceza; kendi çiftine işlemek cezasız
{
    const { game, p0, p1 } = setup();
    p0.isOpen = true; p0.openedWithPairs = true;
    game.tableSets.push({ id: 'cift0', playerId: p0.id, tiles: [t(RED, 13), t(RED, 13)], value: 26, kind: 'cift' });

    // P1'in sırası: iki 5'i P0'ın çiftlerine işler → (5 + 5) × 10 = 100
    game.currentPlayerIndex = 1; game.players.forEach((p, i) => p.setTurn(i === 1));
    p1.isOpen = true;
    const [f1, f2, other, bad] = give(p1, [t(BLUE, 5), t(BLUE, 5), t(BLACK, 9), t(YELLOW, 5)]);
    assert.strictEqual(game.addPairToSet(p1.id, [f1.id, bad.id], 'cift0').success, false, 'farklı renk çift değil');
    const r = game.addPairToSet(p1.id, [f1.id, f2.id], 'cift0');
    assert.strictEqual(r.success, true, r.error);
    assert.deepStrictEqual({ to: r.penalty?.targetPlayerId, amount: r.penalty?.amount, tag: r.penalty?.tag }, { to: p0.id, amount: 100, tag: 'çift işleme' });
    assert.strictEqual(p0.penaltyScore, 100);
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

// Yerden alma: atana değer × 10 (Hugo ×20); kusunca ceza silinir ve taş aynı sırada tekrar alınamaz
{
    const { game, p0, p1 } = setup(); // 1. el Hugo
    give(p0, [t(RED, 7), t(BLUE, 1)]);
    give(p1, [t(BLACK, 2), t(BLACK, 3)]);
    const r7 = p0.tiles[0];
    assert.ok(game.discardTile(p0.id, r7.id).tile);
    assert.ok(game.drawTile(p1.id, true), 'yerden alınmalı');
    assert.strictEqual(p0.penaltyScore, 140, 'Hugo elinde 7 × 20');
    const k = game.returnTakenTile(p1.id);
    assert.ok(k.tile && k.revert && k.revert.amount === -140, k.error);
    assert.strictEqual(p0.penaltyScore, 0, 'kusunca atanın cezası silinir');
    assert.strictEqual(p1.penaltyScore, 0, 'kusmak cezasız');
    assert.strictEqual(game.turnAction, TurnAction.DRAW, 'kusan desteden çeker');
    assert.strictEqual(game.drawTile(p1.id, true), null, 'kusulan taş aynı sırada tekrar alınamaz');
    assert.ok(game.drawTile(p1.id, false), 'desteden çekilir');
}

// İşlek atılan taş yerden alınamaz
{
    const { game, p0, p1 } = setup();
    game.tableSets.push({ id: 's', playerId: p1.id, kind: 'seri', value: 15, tiles: [t(RED, 4), t(RED, 5), t(RED, 6)] });
    give(p0, [t(RED, 7), t(BLUE, 1)]);
    give(p1, [t(BLACK, 2)]);
    const res = game.discardTile(p0.id, p0.tiles[0].id);
    assert.ok(res.penalties.some(p => p.tag === 'işlek'));
    assert.strictEqual(game.drawTile(p1.id, true), null, 'işlek taş alınamaz');
}

// İşlek cezası taşın değerinden bağımsız: 100, Hugo elinde 200
for (const [round, amount] of [[2, 100], [5, 200]]) {
    const { game, p0, p1 } = setup();
    game.round = round;
    game.tableSets.push({ id: 's', playerId: p1.id, kind: 'seri', value: 15, tiles: [t(RED, 4), t(RED, 5), t(RED, 6)] });
    give(p0, [t(RED, 7), t(BLUE, 1)]);
    const res = game.discardTile(p0.id, p0.tiles[0].id);
    assert.strictEqual(res.penalties.find(p => p.tag === 'işlek')?.amount, amount, `${round}. elde işlek cezası ${amount}`);
}

// Süre dolunca: okey ve per adayı atılmaz, en küçük boşta taş atılır
{
    const { game, p0 } = setup(); // Hugo: joker okeydir
    give(p0, [new Tile(TileColor.PURPLE, 'H', true), t(RED, 1), t(RED, 2), t(RED, 3), t(BLUE, 5), t(BLACK, 9)]);
    assert.strictEqual(game.pickAutoDiscard(p0.id)?.value, 5, 'kırmızı 1-2-3 per; okey atılmaz; mavi 5 atılır');
    // Okey per adayını tamamlar: kırmızı 1-2 + okey per sayılır, mavi 5 atılır
    give(p0, [new Tile(TileColor.PURPLE, 'H', true), t(RED, 1), t(RED, 2), t(BLUE, 5), t(BLACK, 9)]);
    assert.strictEqual(game.pickAutoDiscard(p0.id)?.value, 5, 'okeyle tamamlanan per bozulmaz');
    // En küçük taş perdeyse atılmaz: kırmızı 1-2-3 per, per dışındaki en küçük mavi 7
    give(p0, [t(RED, 1), t(RED, 2), t(RED, 3), t(BLACK, 9), t(BLUE, 7), new Tile(TileColor.PURPLE, 'H', true)]);
    assert.strictEqual(game.pickAutoDiscard(p0.id)?.value, 7, 'perdeki küçük taş korunur, okey atılmaz');
    // Hepsi perdeyse okey değil, en küçük taş atılır
    give(p0, [t(RED, 1), t(RED, 2), t(RED, 3), t(BLUE, 4), t(BLUE, 5), t(BLUE, 6), new Tile(TileColor.PURPLE, 'H', true)]);
    const all = game.pickAutoDiscard(p0.id)!;
    assert.ok(!game.isOkeyTile(all) && all.value === 1, 'hepsi perde: okey yerine en küçük taş');
    // Elde iki okey ve bir taş: okey atılmaz
    give(p0, [new Tile(TileColor.PURPLE, 'H', true), new Tile(TileColor.PURPLE, 'H', true), t(RED, 5)]);
    assert.strictEqual(game.pickAutoDiscard(p0.id)?.value, 5);
    // İşlek taş atılmaz: masada mavi 10-11-12 varken mavi 9 yerine siyah 11
    game.tableSets.push({ id: 'islek', playerId: p0.id, tiles: [t(BLUE, 10), t(BLUE, 11), t(BLUE, 12)], value: 33 });
    give(p0, [t(BLUE, 9), t(BLACK, 11)]);
    assert.strictEqual(game.pickAutoDiscard(p0.id)?.color, BLACK, 'işlek mavi 9 atılmaz');
    // Hepsi işlekse yine bir taş atılır
    give(p0, [t(BLUE, 9), t(BLUE, 13)]);
    assert.ok(game.pickAutoDiscard(p0.id));
    game.tableSets = game.tableSets.filter(st => st.id !== 'islek');
}

// Elde taş kalmadan masaya oynanmaz: en az bir taş atılarak bitirilir
{
    const { game, p0 } = setup();
    const hand = give(p0, [t(RED, 11), t(RED, 12), t(RED, 13), t(BLACK, 9), t(YELLOW, 9), t(BLUE, 9)]);
    const r = game.openHand(p0.id, [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))]);
    assert.strictEqual(r.success, false, 'tüm taşlar per iken açılmaz');
    assert.strictEqual(p0.tiles.length, 6);
}

// Geri al: el açma ve işleme bu sırada 100 cezayla geri alınır; işleme cezası silinir; taş atınca geri alınamaz
{
    const { game, p0, p1 } = setup();
    game.tableSets.push({ id: 's1', playerId: p1.id, kind: 'seri', value: 15, tiles: [t(BLUE, 4), t(BLUE, 5), t(BLUE, 6)] });
    const hand = give(p0, [t(RED, 11), t(RED, 12), t(RED, 13), t(BLACK, 9), t(YELLOW, 9), t(BLUE, 9), t(BLUE, 7), t(BLACK, 1)]);
    assert.ok(game.openHand(p0.id, [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))]).success);
    assert.ok(game.addTileToSet(p0.id, hand[6].id, 's1', 'end').success);
    assert.strictEqual(p1.penaltyScore, 70);
    const u = game.undoTurnPlays(p0.id);
    assert.ok(u.success, u.error);
    assert.strictEqual(p0.tiles.length, 8, 'tüm taşlar ele döner');
    assert.strictEqual(p0.isOpen, false, 'açılış geri alınır');
    assert.strictEqual(p0.lastOpenedValue, 0);
    assert.strictEqual(game.tableSets.length, 1);
    assert.strictEqual(game.tableSets[0].tiles.length, 3, 'işlenen taş setten çıkar');
    assert.strictEqual(p1.penaltyScore, 0, 'işleme cezası silinir');
    assert.strictEqual(p0.penaltyScore, 100, 'geri alma 100 ceza');
    assert.strictEqual(game.undoTurnPlays(p0.id).success, false, 'ikinci kez geri alınacak hamle yok');
    // Tekrar açıp taş atınca geri alma biter
    assert.ok(game.openHand(p0.id, [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))]).success);
    assert.ok(game.discardTile(p0.id, hand[7].id).tile);
    game.currentPlayerIndex = 0; game.players.forEach((p, i) => p.setTurn(i === 0)); game.turnAction = TurnAction.DISCARD;
    assert.strictEqual(game.undoTurnPlays(p0.id).success, false, 'taş atıldıktan sonra geri alınamaz');
}

// Masaya oynadıktan sonra yandan alınan taş kusulamaz
{
    const { game, p0, p1 } = setup();
    give(p0, [t(BLUE, 2), t(BLUE, 1)]);
    give(p1, [t(RED, 11), t(RED, 12), t(RED, 13), t(BLACK, 9), t(YELLOW, 9), t(BLUE, 9), t(BLACK, 4)]);
    assert.ok(game.discardTile(p0.id, p0.tiles[0].id).tile);
    assert.ok(game.drawTile(p1.id, true));
    const h = p1.tiles;
    assert.ok(game.openHand(p1.id, [ids(h.slice(0, 3)), ids(h.slice(3, 6))]).success);
    const k = game.returnTakenTile(p1.id);
    assert.strictEqual(k.tile, null, 'el açtıktan sonra kusmak yasak');
    assert.ok(k.error);
}

// Hugo elinde iki okeyli perde ikinci okeyin yerini tutan taş da okeyi alır
{
    const J = () => new Tile(TileColor.PURPLE, 'H', true);
    const { game, p0, p1 } = setup(); // 1. el Hugo: joker okeydir
    p0.isOpen = true;
    const [r7] = give(p0, [t(RED, 7), t(BLUE, 1), t(BLUE, 3)]);
    game.tableSets.push({ id: 's', playerId: p1.id, tiles: [t(RED, 5), J(), J(), t(RED, 8)], value: 26 });
    const r = game.addTileToSet(p0.id, r7.id, 's', 'end');
    assert.strictEqual(r.success, true, r.error);
    assert.ok(r.swappedOkeyTile, 'ortadaki ikinci okey alınmalı');
    assert.strictEqual(game.tableSets[0].tiles[2].id, r7.id);
}

// Per açmış oyuncu da çift açanın çiftlerine çift işleyebilir; çiftteki okey eşi olan taşla alınır
{
    const J = () => new Tile(TileColor.PURPLE, 'H', true);
    const { game, p0, p1 } = setup(); // 1. el Hugo: joker okeydir
    p0.isOpen = true; p0.openedWithPairs = false; // per açmış
    p1.isOpen = true; p1.openedWithPairs = true;
    game.tableSets.push({ id: 'c1', playerId: p1.id, tiles: [t(RED, 4), t(RED, 4)], value: 8, kind: 'cift' });
    game.tableSets.push({ id: 'c2', playerId: p1.id, tiles: [t(BLUE, 9), J()], value: 18, kind: 'cift' });
    const [b6a, b6b, b9] = give(p0, [t(BLUE, 6), t(BLUE, 6), t(BLUE, 9), t(BLACK, 1), t(BLACK, 3)]);
    const pr = game.addPairToSet(p0.id, [b6a.id, b6b.id], 'c1');
    assert.strictEqual(pr.success, true, pr.error);
    const r = game.addTileToSet(p0.id, b9.id, 'c2', 'end');
    assert.strictEqual(r.success, true, r.error);
    assert.ok(r.swappedOkeyTile, 'çiftteki okey alınmalı');
    assert.deepStrictEqual(game.tableSets.find(x => x.id === 'c2')!.tiles.map(x => x.value), [9, 9]);
    assert.ok(p0.tiles.some(x => x.isJoker), 'okey ele geçmeli');
    const [k1] = give(p0, [t(BLACK, 1), t(BLACK, 3)]);
    assert.strictEqual(game.addTileToSet(p0.id, k1.id, 'c1', 'end').success, false, 'okeysiz çifte tek taş işlenmez');

    // Çift açan kendi çiftindeki okeyi alırsa ceza yemez
    const own = setup();
    own.p0.isOpen = true; own.p0.openedWithPairs = true;
    own.game.tableSets.push({ id: 'oc', playerId: own.p0.id, tiles: [t(BLACK, 7), J()], value: 14, kind: 'cift' });
    const [b7] = give(own.p0, [t(BLACK, 7), t(RED, 1), t(RED, 2)]);
    const before = own.p0.penaltyScore;
    const ro = own.game.addTileToSet(own.p0.id, b7.id, 'oc', 'end');
    assert.ok(ro.success && ro.swappedOkeyTile, ro.error);
    assert.strictEqual(own.p0.penaltyScore, before, 'kendi çiftinden okey alan ceza yemez');
    assert.strictEqual(ro.penalty, undefined);
}

// Atılan taşların atanı tutulur (sayfa yenilenince köşe geçmişi kurulur); yerden alınınca listeden düşer
{
    const { game, p0, p1 } = setup();
    const [a] = give(p0, [t(RED, 3), t(BLUE, 1)]);
    game.discardTile(p0.id, a.id);
    assert.deepStrictEqual(game.toPublicJSON().discardOwners, [p0.id]);
    give(p1, [t(BLACK, 1), t(BLACK, 2)]);
    assert.ok(game.drawTile(p1.id, true), 'yerden alınmalı');
    assert.deepStrictEqual(game.toPublicJSON().discardOwners, []);
}

console.log('Rules.selftest: el açma, set doğrulama, sıra, işleme, yandan alma, işlek taş, otomatik atış, Hugo, sahte okey, çift açma, çift işleme ve el sonu puanlama kuralları ✓');
