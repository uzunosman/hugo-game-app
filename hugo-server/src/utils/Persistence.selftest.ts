// Kalıcılık öz-testi: `npm test` ile çalışır. El ortasında kaydedilen oyun geri yüklenince oynanabilir olmalı.
import assert from 'assert';
import { GameManager } from './GameManager';
import { serialize, deserialize } from './Persistence';
import { Tile } from '../models/Tile';

const gm = GameManager.getInstance();
const players = [0, 1, 2, 3].map(i => gm.createPlayer(`P${i}`, `s${i}`));
const room = gm.createRoom('kayıt', players[0].id)!;
players.slice(1).forEach(p => gm.addPlayerToRoom(p.id, room.id));
assert.ok(gm.startGame(room.id), 'oyun başlamalı');
const game = room.game!;

// Birkaç hamle: P0 atar, P1 çeker
assert.ok(game.discardTile(players[0].id, players[0].tiles[0].id).tile);
assert.ok(game.drawTile(players[1].id, false));
const before = { deck: game.deck.length, hand1: players[1].tiles.map(t => t.id), round: game.round, turn: game.currentPlayerIndex };

const restored = deserialize(serialize(gm));
const r = restored.rooms[0];
const g = r.game!;

// Nesne bağları: odadaki ve oyundaki oyuncu aynı nesne, sahip de öyle
r.players.forEach((p, i) => assert.strictEqual(g.players[i], p, 'oda ve oyun aynı oyuncu nesnesini paylaşmalı'));
assert.strictEqual(r.owner, r.players[0]);
// Masa numarası korunur, sayaç geri yüklenince geriye gitmez (numarasız eski masa da numara alır)
assert.strictEqual(r.no, room.no);
assert.strictEqual(restored.nextTableNo, room.no + 1);
const fresh: GameManager = new (GameManager as any)();
const old = { ...r, no: 0 } as typeof r;
fresh.restore(restored.players, [r, Object.assign(Object.create(Object.getPrototypeOf(r)), old, { id: 'eski' })], restored.nextTableNo);
assert.strictEqual(fresh.getRoomById('eski')!.no, room.no + 1, 'numarasız masa sıradaki numarayı almalı');
assert.strictEqual(fresh.nextTableNo, room.no + 2);
assert.ok(g.deck[0] instanceof Tile && g.players[1].tiles[0] instanceof Tile, 'taşlar Tile olarak geri gelmeli');
assert.ok(r.players.every(p => p.connected === false && p.socketId === ''), 'geri yüklenen oyuncular kopuk başlar');

// Durum aynı ve oyun sürdürülebilir
assert.deepStrictEqual(
    { deck: g.deck.length, hand1: g.players[1].tiles.map(t => t.id), round: g.round, turn: g.currentPlayerIndex },
    before
);
const p1 = g.players[1];
const res = g.discardTile(p1.id, p1.tiles[0].id);
assert.ok(res.tile, `geri yüklenen oyunda taş atılabilmeli: ${res.error}`);
assert.strictEqual(g.currentPlayerIndex, 2);

console.log('Persistence.selftest: kaydet → yükle sonrası oyun aynı ve oynanabilir ✓');
