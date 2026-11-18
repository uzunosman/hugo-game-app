import assert from 'assert';
import { Profiles } from './Profiles';

const ps = new Profiles();
const { profile: a, key } = ps.create('Ayşe');
const { profile: b } = ps.create('Barış');
assert.strictEqual(ps.verify(a.id, key), a, 'doğru anahtar');
assert.strictEqual(ps.verify(a.id, 'yanlis'), null, 'yanlış anahtar');
assert.strictEqual(ps.verify(a.id, undefined), null);
assert.strictEqual(ps.request(a.id, a.id), 'error', 'kendine istek olmaz');
assert.strictEqual(ps.request(a.id, b.id), 'sent');
assert.strictEqual(ps.request(a.id, b.id), 'sent', 'tekrar istek çoğalmaz');
assert.deepStrictEqual(b.requests, [a.id]);
assert.strictEqual(ps.respond(b.id, a.id, true), true);
assert.deepStrictEqual([a.friends, b.friends, b.requests], [[b.id], [a.id], []], 'kabul: karşılıklı arkadaş');
ps.remove(a.id, b.id);
assert.deepStrictEqual([a.friends, b.friends], [[], []], 'arkadaşlıktan çıkarma iki taraflı');
// Karşılıklı istek: doğrudan arkadaş
ps.request(a.id, b.id);
assert.strictEqual(ps.request(b.id, a.id), 'friends');
// Saklama / geri yükleme
const copy = new Profiles();
copy.restore(JSON.parse(JSON.stringify(ps.toJSON())));
assert.strictEqual(copy.verify(a.id, key)?.name, 'Ayşe', 'geri yüklenen profil anahtarla açılır');
console.log('Profiles selftest ✓');
