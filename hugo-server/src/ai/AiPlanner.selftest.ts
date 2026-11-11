// Yapay zekâ planlayıcı öz-testi: `npm test` ile çalışır.
import assert from 'assert';
import { Game } from '../models/Game';
import { Player } from '../models/Player';
import { Tile, TileColor } from '../models/Tile';
import { planOpening, planSets } from './AiPlanner';

const { RED, BLUE, YELLOW, BLACK } = TileColor;
const t = (c: TileColor, v: number) => new Tile(c, v);
const game = new Game([0, 1, 2, 3].map(i => new Player(`P${i}`, `s${i}`)));
const ids = (sets: Tile[][]) => sets.map(s => s.map(x => x.value).join('-'));

// Seri ve aynı sayı perleri çakışmadan bulunur
const hand = [t(RED, 10), t(RED, 11), t(RED, 12), t(RED, 13), t(BLUE, 9), t(BLACK, 9), t(YELLOW, 9), t(BLUE, 2), t(BLACK, 5)];
assert.deepStrictEqual(ids(planSets(game, hand)).sort(), ['10-11-12-13', '9-9-9'].sort());

// 46 + 27 = 73 ≥ 51 → açılır, elde taş kalır
const plan = planOpening(game, hand);
assert.ok(plan && plan.length === 2 && plan.flat().length < hand.length);

// Eşik altı açılmaz
assert.strictEqual(planOpening(game, [t(RED, 1), t(RED, 2), t(RED, 3), t(BLUE, 9)]), null);

// Masada 80 açılış varken 73 yetmez
game.players[1].lastOpenedValue = 80;
assert.strictEqual(planOpening(game, hand), null);
game.players[1].lastOpenedValue = 0;

// Hugo elinde joker okeydir: kırmızı 12-13 + okey üçlü olur
const hugo = [new Tile(TileColor.PURPLE, 'H', true), t(RED, 12), t(RED, 13), t(BLUE, 4)];
assert.ok(planSets(game, hugo).some(s => s.length === 3 && s.some(x => x.isJoker)), 'okeyle tamamlanan per');

// Tüm el per olursa en az bir taş elde bırakılır
const full = [t(RED, 11), t(RED, 12), t(RED, 13), t(BLUE, 13), t(BLACK, 13), t(YELLOW, 13)];
const pf = planOpening(game, full);
assert.ok(pf === null || pf.flat().length < full.length);

console.log('AiPlanner.selftest: per bulma, açılış eşiği, okey ve elde taş bırakma ✓');
