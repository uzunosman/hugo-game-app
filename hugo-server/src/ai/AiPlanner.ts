// Yapay zekâ oyuncunun karar mantığı: yalnızca sunucuda çalışır, eli hiçbir istemciye gönderilmez.
import { Game } from '../models/Game';
import { Tile } from '../models/Tile';

const COLORS = ['red', 'blue', 'black', 'yellow'];

// Eldeki taşlardan çakışmayan perler: önce okeysiz en değerli seri/aynı sayı, sonra okeyle tamamlanan üçlüler
export function planSets(game: Game, hand: Tile[]): Tile[][] {
    const val = (t: Tile) => game.asPlayed(t).value as number;
    let pool = hand.filter(t => !game.isOkeyTile(t) && typeof game.asPlayed(t).value === 'number');
    const okeys = hand.filter(t => game.isOkeyTile(t));
    const sets: Tile[][] = [];

    for (;;) {
        const candidates: Tile[][] = [];
        for (const color of COLORS) {
            // Aynı renkte ardışık sayılar (her sayıdan bir taş)
            const byValue = new Map<number, Tile>();
            pool.filter(t => game.asPlayed(t).color === color).forEach(t => { if (!byValue.has(val(t))) byValue.set(val(t), t); });
            const values = [...byValue.keys()].sort((a, b) => a - b);
            let run: Tile[] = [];
            values.forEach((v, i) => {
                run = i > 0 && v === values[i - 1] + 1 ? [...run, byValue.get(v)!] : [byValue.get(v)!];
                if (run.length >= 3) candidates.push([...run]);
            });
        }
        for (let v = 1; v <= 13; v++) {
            // Aynı sayı, farklı renkler (en fazla 4)
            const byColor = new Map<string, Tile>();
            pool.filter(t => val(t) === v).forEach(t => { const c = game.asPlayed(t).color; if (!byColor.has(c)) byColor.set(c, t); });
            if (byColor.size >= 3) candidates.push([...byColor.values()]);
        }
        const valid = candidates.map(c => ({ c, v: game.validateSetTiles(c) })).filter(x => x.v > 0);
        if (!valid.length) break;
        const best = valid.reduce((a, b) => (b.v > a.v ? b : a)).c;
        sets.push(best);
        pool = pool.filter(t => !best.includes(t));
    }

    // Okey: kalan iki taşla geçerli üçlü kurabiliyorsa en değerlisini kur
    for (const okey of okeys) {
        let best: { tiles: Tile[]; v: number } | null = null;
        for (let i = 0; i < pool.length; i++) {
            for (let j = i + 1; j < pool.length; j++) {
                const [a, b] = [pool[i], pool[j]];
                for (const o of [[okey, a, b], [okey, b, a], [a, okey, b], [b, okey, a], [a, b, okey], [b, a, okey]]) {
                    const v = game.validateSetTiles(o);
                    if (v > 0 && (!best || v > best.v)) best = { tiles: o, v };
                }
            }
        }
        if (!best) break;
        sets.push(best.tiles);
        pool = pool.filter(t => !best!.tiles.includes(t));
    }
    return sets;
}

// Açılış planı: eşik geçiliyorsa ve elde en az bir taş kalıyorsa perlerin id'leri; yoksa null
export function planOpening(game: Game, hand: Tile[]): string[][] | null {
    const sets = planSets(game, hand);
    const max = game.players.reduce((m, p) => Math.max(m, p.lastOpenedValue), 0);
    const need = max === 0 ? 51 : max + 1;
    const total = (s: Tile[][]) => s.reduce((n, x) => n + game.validateSetTiles(x), 0);
    const used = (s: Tile[][]) => s.reduce((n, x) => n + x.length, 0);
    // Tüm el per oluyorsa en düşük değerli peri elde bırak (el son taş atılarak biter)
    while (sets.length && used(sets) >= hand.length) {
        let low = 0;
        sets.forEach((x, i) => { if (game.validateSetTiles(x) < game.validateSetTiles(sets[low])) low = i; });
        sets.splice(low, 1);
    }
    if (!sets.length || total(sets) < need) return null;
    return sets.map(s => s.map(t => t.id));
}
