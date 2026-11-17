// Günlük istatistik: oyun kaydından (events/YYYY-MM-DD.jsonl) kim girdi, kim oynadı, kaç masa / oyun / el.
// Kullanım (VPS): ssh hugola 'cd /opt/hugo/hugo-server && STATE_FILE=/var/lib/hugo/state.json node dist/tools/stats.js [YYYY-MM-DD]'
import fs from 'fs';
import path from 'path';
import { dayOf, eventsDir } from '../utils/EventLog';

type Ev = Record<string, any>;

export const dailyStats = (events: Ev[]) => {
    const hourOf = (t: string) => Number(new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }));
    const requests = events.filter(e => e.ev === 'istek');
    const loggedIn = new Set(requests.filter(e => e.ok && (e.istek === 'player:register' || e.istek === 'player:reconnect') && e.oyuncu).map(e => e.oyuncu));
    const moves = requests.filter(e => e.ok && e.masa && String(e.istek).startsWith('game:') && e.oyuncu);
    const players = new Map<string, { hamle: number; masalar: Set<number> }>();
    moves.forEach(e => {
        const p = players.get(e.oyuncu) || { hamle: 0, masalar: new Set<number>() };
        p.hamle++; p.masalar.add(e.masa); players.set(e.oyuncu, p);
    });
    const table = events.filter(e => e.ev === 'masa');
    const hourly = new Map<number, Set<string>>();
    moves.forEach(e => { const h = hourOf(e.t); hourly.set(h, (hourly.get(h) || new Set()).add(e.oyuncu)); });
    return {
        baglanti: events.filter(e => e.ev === 'baglanti').length,
        girisYapan: loggedIn.size,
        yeniKayit: requests.filter(e => e.ok && e.istek === 'player:register').length,
        oynayan: players.size,
        acilanMasa: requests.filter(e => e.ok && e.istek === 'room:create').length,
        baslayanOyun: new Set(table.filter(e => e.olay === 'game:started').map(e => e.oyun)).size,
        bitenOyun: table.filter(e => e.olay === 'game:roundEnded' && e.veri?.gameStatus === 'finished').length,
        oynananEl: table.filter(e => e.olay === 'game:roundEnded').length,
        reddedilen: requests.filter(e => e.ok === false).length,
        saatlik: [...hourly].sort((a, b) => a[0] - b[0]).map(([h, s]) => [h, s.size] as const),
        oyuncular: [...players].sort((a, b) => b[1].hamle - a[1].hamle).map(([ad, p]) => ({ ad, hamle: p.hamle, masa: p.masalar.size })),
    };
};

if (require.main === module) {
    const day = process.argv[2] || dayOf();
    const file = path.join(eventsDir(), `${day}.jsonl`);
    if (!fs.existsSync(file)) { console.log(`${day}: kayıt yok (${file})`); process.exit(0); }
    const events = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const s = dailyStats(events);
    console.log(`${day} günü
  Bağlantı (uygulama açılışı): ${s.baglanti}
  Giriş yapan oyuncu:          ${s.girisYapan} (yeni kayıt ${s.yeniKayit})
  Oynayan oyuncu:              ${s.oynayan}
  Açılan masa:                 ${s.acilanMasa}
  Başlayan / biten oyun:       ${s.baslayanOyun} / ${s.bitenOyun}
  Oynanan el:                  ${s.oynananEl}
  Reddedilen istek:            ${s.reddedilen}
  Saatlik oynayan:             ${s.saatlik.map(([h, n]) => `${String(h).padStart(2, '0')}:00 ${n}`).join(', ') || '-'}
  Oyuncular (hamle, masa):
${s.oyuncular.map(p => `    ${p.ad}: ${p.hamle} hamle, ${p.masa} masa`).join('\n') || '    -'}`);
}
