// Tur akışı öz-testi: `npm test` ile çalışır.
import assert from 'assert';
import { Game, GameStatus } from './Game';
import { Player } from './Player';

const players = [0, 1, 2, 3].map(i => new Player(`P${i}`, `s${i}`));
const game = new Game(players);
const counts = () => game.players.map(p => p.tiles.length);

// 1. el: ilk oyuncu index 0, 15 taş ondadır
assert.strictEqual(game.round, 1);
assert.strictEqual(game.currentPlayerIndex, 0);
assert.deepStrictEqual(counts(), [15, 14, 14, 14]);

let expectedTotal = 0;
for (let round = 1; round <= 9; round++) {
    const first = (round - 1) % 4;
    assert.strictEqual(game.round, round, `el numarası ${round} olmalı`);
    assert.strictEqual(game.currentPlayerIndex, first, `${round}. eli P${first} başlatmalı`);
    assert.strictEqual(game.players[first].tiles.length, 15, `${round}. elde 15 taş P${first}'de olmalı`);
    assert.strictEqual(game.isPlayerTurn(game.players[first].id), true);

    const results = game.endRound();
    // Kimse açmadı, bitiren yok: herkese 800, Hugo elinde ×2
    const expected = [1, 5, 9].includes(round) ? 1600 : 800;
    expectedTotal += expected;
    results.forEach(r => {
        assert.strictEqual(r.roundTotal, expected, `${round}. el puanı ${expected} olmalı`);
        assert.strictEqual(r.totalScore, expectedTotal, `${round}. el sonunda toplam ${expectedTotal} olmalı`);
    });
    game.players.forEach(p => assert.strictEqual(p.roundScores.length, round, 'her el roundScores’a yazılmalı'));

    // endRound eli ilerletmez; tur arasında kimse hamle yapamaz
    assert.strictEqual(game.round, round, 'endRound el numarasını değiştirmemeli');
    assert.strictEqual(game.isPlayerTurn(game.players[first].id), false);

    if (round < 9) {
        assert.strictEqual(game.status, GameStatus.ROUND_ENDED);
        game.startNextRound();
        assert.strictEqual(game.status, GameStatus.STARTED);
        assert.strictEqual(game.players.filter(p => p.isTurn).length, 1, 'sırası olan tek oyuncu olmalı');
    }
}

assert.strictEqual(game.status, GameStatus.FINISHED);
assert.strictEqual(game.round, 9);
console.log('Game.selftest: 9 el doğru sırayla oynandı ✓');
