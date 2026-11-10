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

const totals = new Map<string, number>();
for (let round = 1; round <= 9; round++) {
    const first = (round - 1) % 4;
    assert.strictEqual(game.round, round, `el numarası ${round} olmalı`);
    assert.strictEqual(game.currentPlayerIndex, first, `${round}. eli P${first} başlatmalı`);
    assert.strictEqual(game.players[first].tiles.length, 15, `${round}. elde 15 taş P${first}'de olmalı`);
    assert.strictEqual(game.isPlayerTurn(game.players[first].id), true);

    // 1-5-9 her zaman Hugo; gösterge sahte okey çıkarsa diğer eller de Hugo olabilir
    if ([1, 5, 9].includes(round)) assert.strictEqual(game.isHugoRound(), true);
    // Kimse açmadı, bitiren yok: herkese 800 + elde kalan okey başına 100, Hugo elinde ×2
    const hugo = game.isHugoRound();
    const okeyCount = (p: Player) => p.tiles.filter(t => hugo
        ? t.isJoker
        : !t.isJoker && t.color === game.okeyTile?.color && t.value === game.okeyTile?.value).length;
    const expected = new Map(game.players.map(p => [p.id, (800 + okeyCount(p) * 100) * (hugo ? 2 : 1)]));
    const results = game.endRound();
    results.forEach(r => {
        const e = expected.get(r.playerId)!;
        totals.set(r.playerId, (totals.get(r.playerId) || 0) + e);
        assert.strictEqual(r.roundTotal, e, `${round}. el puanı ${e} olmalı`);
        assert.strictEqual(r.totalScore, totals.get(r.playerId), `${round}. el sonunda toplam tutmalı`);
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
