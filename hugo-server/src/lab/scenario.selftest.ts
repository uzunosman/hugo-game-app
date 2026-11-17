// Senaryo öz-testi: `npm test` ile çalışır. Her senaryo kurulur (106 taş, tekrar yok); çift işleme senaryosu baştan sona oynanır.
import assert from 'assert';
import { GameManager } from '../utils/GameManager';
import { applyScenario, findScenario, listScenarios } from './scenario';
import { Room } from '../models/Room';

const gm: GameManager = new (GameManager as any)();
const makeRoom = (): Room => {
    const ps = [0, 1, 2, 3].map(i => gm.createPlayer(`P${i}`, `lab:${Math.random()}`));
    const room = gm.createRoom('lab', ps[0].id)!;
    ps.slice(1).forEach(p => gm.addPlayerToRoom(p.id, room.id));
    return room;
};

for (const s of listScenarios()) {
    const room = makeRoom();
    const g = applyScenario(room, s);
    const all = [...g.deck, ...g.discardPile, ...g.tableSets.flatMap(t => t.tiles), ...room.players.flatMap(p => p.tiles), g.indicatorTile!];
    assert.strictEqual(all.length, 106, `${s.id}: 106 taş olmalı`);
    assert.strictEqual(new Set(all.map(t => t.id)).size, 106, `${s.id}: aynı taş iki yerde`);
    assert.strictEqual(room.players[s.turn ?? 0].isTurn, true, `${s.id}: sıra`);
}

// Hatalı tanım masayı kurmaz
assert.throws(() => applyScenario(makeRoom(), { indicator: 'r1', seats: [{ name: 'a', hand: ['r5', 'r5', 'r5'] }, { name: 'b' }, { name: 'c' }, { name: 'd' }] }), /ikiden fazla/);
assert.throws(() => applyScenario(makeRoom(), { indicator: 'x9', seats: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }] }), /Geçersiz taş/);

// Çift işleme senaryosu: Sen çiftle açar, Ayşe'nin çiftine işler; Ayşe de Sen'in çiftine işler
{
    const room = makeRoom();
    const g = applyScenario(room, findScenario('pair-process-test')!);
    const [sen, ayse] = room.players;
    const pair = (p: typeof sen, c: string, v: number) => p.tiles.filter(t => t.color === c && t.value === v).map(t => t.id);

    const drawn = g.drawTile(sen.id);
    assert.ok(drawn && drawn.color === 'black' && drawn.value === 13, 'deckTop ilk çekilen taş');
    const open = g.openHand(sen.id, [pair(sen, 'red', 13), pair(sen, 'blue', 12), pair(sen, 'black', 11)], 'cift');
    assert.ok(open.success, `Sen çiftle açabilmeli: ${open.error}`);
    const ayseSet = g.tableSets.find(t => t.playerId === ayse.id)!;
    const r1 = g.addPairToSet(sen.id, pair(sen, 'yellow', 9), ayseSet.id);
    assert.ok(r1.success, `Sen çift işleyebilmeli: ${r1.error}`);
    assert.strictEqual(r1.penalty?.amount, 180, 'çift işleme cezası (9 + 9) × 10');
    assert.ok(g.discardTile(sen.id, sen.tiles.find(t => t.value === 3)!.id).tile, 'Sen taş atar');

    assert.ok(ayse.isTurn, 'sıra Ayşe');
    assert.ok(g.drawTile(ayse.id));
    const senSet = g.tableSets.find(t => t.playerId === sen.id)!;
    const r2 = g.addPairToSet(ayse.id, pair(ayse, 'black', 1), senSet.id);
    assert.ok(r2.success, `Ayşe çift işleyebilmeli: ${r2.error}`);
}

console.log(`scenario.selftest: ${listScenarios().length} senaryo kuruluyor (106 taş), hatalı tanım reddediliyor, çift açma ve çift işleme oynanıyor ✓`);
