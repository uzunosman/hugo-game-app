// Istaka sürükle-bırak mantığı (saf fonksiyonlar; rack.selftest.mjs ile test edilir)
import { insertShift, rackGroupAt } from './tileHandlers.js';
import { validatePair, validateSet } from './gameUtils.js';

export const ROW = 15;
const rowOf = (i) => (i < ROW ? 0 : 1);

// Peri (ya da tek taşı) hedefe taşır: tutulan taş hedef hücreye gelir, per satıra sığdırılır.
// Hedefte duran taşlar en yakın boşluklara itilir (sıraları bozulmaz). Satırda yer yoksa null.
export const moveGroup = (positions, group, grabIdx, targetIdx) => {
    const { start, len } = group;
    const rowMin = rowOf(targetIdx) * ROW;
    const newStart = Math.min(Math.max(targetIdx - (grabIdx - start), rowMin), rowMin + ROW - len);
    if (newStart === start) return null;
    const ids = positions.slice(start, start + len);
    const next = [...positions];
    for (let i = start; i < start + len; i++) next[i] = null;

    // Hedef satırı tek başına düzenle
    const row = next.slice(rowMin, rowMin + ROW);
    const s = newStart - rowMin;
    const inRange = [];
    for (let i = s; i < s + len; i++) if (row[i]) inRange.push(i);
    const freeL = row.slice(0, s).filter(x => !x).length;
    const freeR = row.slice(s + len).filter(x => !x).length;
    if (inRange.length > freeL + freeR) return null;
    // Perin sol yarısındakiler sola, sağ yarısındakiler sağa; bir taraf doluysa öbürüne
    const mid = s + len / 2;
    const wantL = inRange.filter(i => i < mid).length;
    const nLeft = Math.min(Math.max(wantL, inRange.length - freeR), freeL);
    const goLeft = inRange.slice(0, nLeft);
    const goRight = inRange.slice(nLeft);

    // Sola itilecekler soldan sağa: her biri s-1'e girer, aradaki blok bir sola kayar
    for (const p of goLeft) {
        const tile = row[p]; row[p] = null;
        let g = s - 1; while (row[g]) g--;
        for (let i = g; i < s - 1; i++) row[i] = row[i + 1];
        row[s - 1] = tile;
    }
    // Sağa itilecekler sağdan sola: her biri s+len'e girer, aradaki blok bir sağa kayar
    for (const p of [...goRight].reverse()) {
        const tile = row[p]; row[p] = null;
        let g = s + len; while (row[g]) g++;
        for (let i = g; i > s + len; i--) row[i] = row[i - 1];
        row[s + len] = tile;
    }
    ids.forEach((id, i) => { row[s + i] = id; });
    row.forEach((id, i) => { next[rowMin + i] = id; });
    return next;
};

// Sürükleme sırasında ıstakanın görünümü: kaldırılan taşlar yerinden kalkar (gölge kalmaz),
// hedef hücre üstündeyken taşların bırakınca alacağı yer gösterilir.
// drag: { kind: 'tile' | 'group' | 'deck' | 'discard', srcIdx, group, overCell }
// Dönüş: { cells, preview: Set(önizleme hücreleri), blocked: bırakılamaz mı }
export const rackPreview = (positions, drag) => {
    const none = { cells: positions, preview: new Set(), blocked: false };
    if (!drag) return none;
    const over = drag.overCell;
    if (drag.kind === 'tile') {
        if (over == null || over === drag.srcIdx) {
            const cells = [...positions];
            if (over == null) cells[drag.srcIdx] = null;
            return { cells, preview: new Set(over == null ? [] : [over]), blocked: false };
        }
        return { cells: insertShift(positions, drag.srcIdx, over), preview: new Set([over]), blocked: false };
    }
    if (drag.kind === 'group') {
        const { start, len } = drag.group;
        const lifted = positions.map((id, i) => (i >= start && i < start + len ? null : id));
        if (over == null) return { cells: lifted, preview: new Set(), blocked: false };
        const moved = moveGroup(positions, drag.group, drag.srcIdx, over);
        if (!moved) {
            // Kendi yerine bırakılıyorsa yerinde göster; sığmıyorsa engelli
            const rowMin = rowOf(over) * ROW;
            const newStart = Math.min(Math.max(over - (drag.srcIdx - start), rowMin), rowMin + ROW - len);
            if (newStart === start) return { cells: positions, preview: new Set(range(start, len)), blocked: false };
            return { cells: lifted, preview: new Set(), blocked: true };
        }
        const first = moved.indexOf(positions[start]);
        return { cells: moved, preview: new Set(range(first, len)), blocked: false };
    }
    // Desteden / yerden çekilen taş: hedef hücre boşsa oraya, değilse ilk boşa gelir
    if (over == null) return none;
    const slot = positions[over] ? positions.indexOf(null) : over;
    return { cells: positions, preview: new Set(slot === -1 ? [] : [slot]), blocked: slot === -1 };
};

const range = (s, n) => Array.from({ length: n }, (_, i) => s + i);

// Basılı tutulan taşın peri: satırdaki kesintisiz dizi yalnızca kurala uyan bir perse (seri / aynı sayı en az 3 taş,
// ya da çift) seçilir. Per değilse null: taş tek başına sürüklenir.
export const perGroupAt = (positions, idx, tiles, opts) => {
    const byId = Object.fromEntries(tiles.map(t => [t.id, t]));
    const isPair = (a, b) => !!byId[a] && !!byId[b] && validatePair([byId[a], byId[b]], opts) > 0;
    const group = rackGroupAt(positions, idx, isPair);
    if (!group) return null;
    const groupTiles = positions.slice(group.start, group.start + group.len).map(id => byId[id]);
    if (groupTiles.some(t => !t)) return null;
    const ok = group.len === 2 ? validatePair(groupTiles, opts) > 0 : validateSet(groupTiles, opts) > 0;
    return ok ? group : null;
};
