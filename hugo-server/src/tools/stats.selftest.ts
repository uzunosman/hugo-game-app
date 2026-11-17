// Günlük istatistik öz-testi: `npm test` ile çalışır
import assert from 'assert';
import { dailyStats } from './stats';

const t = '2026-11-16T18:30:00.000Z'; // İstanbul 21:30
const s = dailyStats([
    { t, ev: 'baglanti' },
    { t, ev: 'istek', istek: 'player:register', ok: true, oyuncu: 'Ayşe' },
    { t, ev: 'istek', istek: 'player:register', ok: true, oyuncu: 'Can' },
    { t, ev: 'istek', istek: 'room:create', ok: true, oyuncu: 'Ayşe' },
    { t, ev: 'istek', istek: 'game:drawTile', ok: true, oyuncu: 'Ayşe', masa: 101701 },
    { t, ev: 'istek', istek: 'game:discardTile', ok: false, oyuncu: 'Ayşe', masa: 101701 },
    { t, ev: 'masa', olay: 'game:started', oyun: 'g1', masa: 101701 },
    { t, ev: 'masa', olay: 'game:roundEnded', oyun: 'g1', masa: 101701, veri: { gameStatus: 'finished' } },
]);
assert.deepStrictEqual(
    { ...s, saatlik: s.saatlik, oyuncular: s.oyuncular },
    { baglanti: 1, girisYapan: 2, yeniKayit: 2, oynayan: 1, acilanMasa: 1, baslayanOyun: 1, bitenOyun: 1, oynananEl: 1, reddedilen: 1,
      saatlik: [[21, 1]], oyuncular: [{ ad: 'Ayşe', hamle: 1, masa: 1 }] },
);
console.log('stats.selftest: giriş, oynayan, masa, oyun, el ve saatlik sayımlar ✓');
