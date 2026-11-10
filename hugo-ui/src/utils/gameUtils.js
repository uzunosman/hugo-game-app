/**
 * Oyun yardımcı fonksiyonları
 */

/**
 * Oyuncuları mevcut oyuncuyu baz alarak sıralar
 * @param {Array} players - Tüm oyuncular
 * @param {String} currentPlayerId - Mevcut oyuncunun ID'si
 * @returns {Array} - Sıralanmış oyuncular
 */
export const getOrderedPlayers = (players, currentPlayerId) => {
    const myIndex = players.findIndex(p => p.id === currentPlayerId);
    if (myIndex === -1) return players;

    // Kendimizi 0. indekse (alt) yerleştir
    const orderedPlayers = [];
    for (let i = 0; i < players.length; i++) {
        const index = (myIndex + i) % players.length;
        orderedPlayers.push(players[index]);
    }
    return orderedPlayers;
};

/**
 * Oyuncunun pozisyonunu belirler
 * @param {Number} index - Oyuncunun sıralanmış dizideki indeksi
 * @returns {String} - Pozisyon adı
 */
export const getPlayerPosition = (index) => {
    const positionMap = {
        0: 'current-player', // Kendimiz (alt)
        1: 'right',          // Sağımızdaki oyuncu
        2: 'top',            // Karşımızdaki oyuncu
        3: 'left'            // Solumuzdaki oyuncu
    };
    return positionMap[index] || 'current-player';
};

/**
 * Oyuncunun taş atma köşesini belirler
 * @param {Number} index - Oyuncunun sıralanmış dizideki indeksi
 * @returns {String} - Köşe adı
 */
export const getPlayerCorner = (index) => {
    const cornerMap = {
        0: 'bottomRight', // Alt oyuncu sağ köşeye atar
        1: 'topRight',    // Sağ oyuncu sağ üst köşeye atar
        2: 'topLeft',     // Üst oyuncu sol üst köşeye atar
        3: 'bottomLeft'   // Sol oyuncu sol alt köşeye atar
    };
    return cornerMap[index];
};

/**
 * Mevcut oyuncunun indeksini bulur
 * @param {Array} players - Sıralanmış oyuncular
 * @param {String} currentPlayerId - Mevcut oyuncunun ID'si
 * @returns {Number} - Mevcut oyuncunun indeksi
 */
export const getCurrentPlayerIndex = (players, currentPlayerId) => {
    return players.findIndex(p => p.id === currentPlayerId);
};


/**
 * Gösterge taşından okey değerini hesaplar
 * Okey = gösterge + 1 (13 ise 1 olur)
 * @param {Object} indicatorTile - Gösterge taşı
 * @returns {number} - Okey'in sayısal değeri
 */
export const getOkeyValue = (indicatorTile) => {
    if (!indicatorTile || typeof indicatorTile.value !== 'number') return 0;
    return indicatorTile.value >= 13 ? 1 : indicatorTile.value + 1;
};

/**
 * Taş okey (joker gibi wildcard) mı?
 * Hugo: joker taşları okey. Hugo dışı: gösterge+1 taşı (okeyTile) okey.
 */
export const isOkeyTile = (tile, okeyTile, isHugo) => {
    if (!tile) return false;
    // isHugo sunucudan gelir (gameState.isHugoRound): sahte okey göstergesi de Hugo yapar
    if (isHugo) return !!tile.isJoker;
    if (!okeyTile) return false;
    return tile.color === okeyTile.color && tile.value === okeyTile.value;
};

/**
 * tilePositions dizisinden ardışık (aralarında boşluk olmayan) taş gruplarını bulur.
 * Minimum 3 taşlık gruplar döner.
 *
 * @param {Array} tilePositions - 30 elemanlı pozisyon dizisi (null veya tileId)
 * @param {Array} tiles - Oyuncunun elindeki taş objeleri
 * @returns {Array<Array>} - Ardışık taş grupları
 */
export const CELLS_PER_ROW = 15; // ıstakada satır başına hücre (TileHolder ile aynı)

export const getConsecutiveGroups = (tilePositions, tiles) => {
    const groups = [];
    let currentGroup = [];

    for (let i = 0; i < tilePositions.length; i++) {
        // Üst satırın sonu ile alt satırın başı aynı gruba sayılmaz
        if (i % CELLS_PER_ROW === 0) {
            if (currentGroup.length >= 3) groups.push([...currentGroup]);
            currentGroup = [];
        }
        const tileId = tilePositions[i];
        if (tileId) {
            const tile = tiles.find(t => t.id === tileId);
            if (tile) {
                currentGroup.push(tile);
            }
        } else {
            if (currentGroup.length >= 3) {
                groups.push([...currentGroup]);
            }
            currentGroup = [];
        }
    }
    if (currentGroup.length >= 3) {
        groups.push([...currentGroup]);
    }

    return groups;
};

/**
 * "Aynı sayı farklı renk" set kontrolü.
 * Min 3, max 4 taş. Tüm normal taşlar aynı sayıda ve farklı renklerde olmalı.
 * Joker/okey eksik renkleri temsil eder.
 *
 * @param {Array} group - Taş grubu
 * @param {Function} isWildcard - (tile) => tile wildcard mı (joker veya okey)
 * @returns {number} - Geçerliyse set toplam değeri, değilse 0
 */
const validateSameNumberSet = (group, isWildcard) => {
    if (group.length < 3 || group.length > 4) return 0;

    const normalTiles = group.filter(t => !isWildcard(t));
    if (normalTiles.length === 0) return 0;

    const value = normalTiles[0].value;
    if (typeof value !== 'number') return 0;

    const colors = new Set();
    for (const tile of normalTiles) {
        if (tile.value !== value) return 0;
        if (colors.has(tile.color)) return 0;
        colors.add(tile.color);
    }

    return value * group.length;
};

/**
 * "Aynı renk sıralı" set kontrolü.
 * Min 3 taş. Tüm normal taşlar aynı renkte olmalı.
 * Hem artan (3,4,5) hem azalan (5,4,3) sıra desteklenir.
 * Joker/okey dizideki boşlukları doldurur.
 *
 * @param {Array} group - Taş grubu (holder'daki fiziksel sıra ile)
 * @param {Function} isWildcard - (tile) => tile wildcard mı
 * @returns {number} - Geçerliyse set toplam değeri, değilse 0
 */
const validateSequentialSet = (group, isWildcard) => {
    if (group.length < 3) return 0;

    const normalTiles = group.filter(t => !isWildcard(t));
    if (normalTiles.length === 0) return 0;

    const color = normalTiles[0].color;
    for (const tile of normalTiles) {
        if (tile.color !== color) return 0;
        if (typeof tile.value !== 'number') return 0;
    }

    // Artan sıra (+1) ve azalan sıra (-1) dene
    for (const direction of [1, -1]) {
        const result = trySequentialDirection(group, color, direction, isWildcard);
        if (result > 0) return result;
    }

    return 0;
};

/**
 * Belirli bir yön (artan/azalan) için sıralı set kontrolü yapar.
 * @param {Array} group - Taş grubu
 * @param {string} color - Beklenen renk
 * @param {number} direction - 1 (artan) veya -1 (azalan)
 * @param {Function} isWildcard - (tile) => tile wildcard mı
 * @returns {number} - Geçerliyse toplam, değilse 0
 */
const trySequentialDirection = (group, color, direction, isWildcard) => {
    let anchorIdx = -1;
    let anchorVal = 0;

    for (let i = 0; i < group.length; i++) {
        if (!isWildcard(group[i])) {
            anchorIdx = i;
            anchorVal = group[i].value;
            break;
        }
    }

    let sum = 0;
    for (let i = 0; i < group.length; i++) {
        const expectedVal = anchorVal + (i - anchorIdx) * direction;

        if (expectedVal < 1 || expectedVal > 13) return 0;

        if (!isWildcard(group[i])) {
            if (group[i].value !== expectedVal) return 0;
            if (group[i].color !== color) return 0;
        }

        sum += expectedVal;
    }

    return sum;
};

/**
 * Bir grubun geçerli set olup olmadığını kontrol eder.
 * Önce "aynı sayı farklı renk", sonra "aynı renk sıralı" dener.
 *
 * @param {Array} group - Taş grubu
 * @param {Object} opts - { okeyTile, round } Hugo dışında okey taşı wildcard
 * @returns {number} - Geçerliyse set toplam değeri, değilse 0
 */
export const validateSet = (group, opts = {}) => {
    if (group.length < 3) return 0;

    const { okeyTile, isHugo } = opts;
    const isWildcard = (t) => isOkeyTile(t, okeyTile, isHugo);

    const sameNumberScore = validateSameNumberSet(group, isWildcard);
    if (sameNumberScore > 0) return sameNumberScore;

    const sequentialScore = validateSequentialSet(group, isWildcard);
    if (sequentialScore > 0) return sequentialScore;

    return 0;
};

/**
 * Oyuncunun elindeki taşların set ve per hesabını yapar.
 *
 * Ardışık taş grupları set adayı olarak değerlendirilir.
 * Geçerli setlerin toplam değeri (setTotal) ve
 * geçerli setlere dahil olmayan taşların toplam değeri (perTotal) hesaplanır.
 *
 * Hugo: joker taşları okey. Hugo dışı: gösterge+1 taşı okey, hesaplamaya dahil.
 *
 * Per kuralları (sete dahil olmayan taşlar):
 *  - Sayılı taşlar (1-13): yüz değeri
 *  - Joker/okey: okey değeri kadar (gösterge + 1)
 *
 * @param {Array} tilePositions - 30 elemanlı pozisyon dizisi
 * @param {Array} tiles - Oyuncunun elindeki taş objeleri
 * @param {Object} indicatorTile - Gösterge taşı
 * @param {Object} okeyTile - Okey taşı (Hugo dışı turlarda)
 * @param {number} round - Tur numarası
 * @returns {{ setTotal: number, perTotal: number, validSetCount: number }}
 */
export const calculateHandScore = (tilePositions, tiles, indicatorTile, okeyTile, isHugo) => {
    if (!tiles || tiles.length === 0) {
        return { setTotal: 0, perTotal: 0, validSetCount: 0 };
    }

    const okeyValue = getOkeyValue(indicatorTile);
    const groups = getConsecutiveGroups(tilePositions, tiles);
    const opts = { okeyTile, isHugo };

    const tilesInSets = new Set();
    let setTotal = 0;
    let validSetCount = 0;

    for (const group of groups) {
        const score = validateSet(group, opts);
        if (score > 0) {
            setTotal += score;
            validSetCount++;
            group.forEach(t => tilesInSets.add(t.id));
        }
    }

    // Per: geçerli setlere dahil olmayan taşlar
    let perTotal = 0;
    for (const tile of tiles) {
        if (!tilesInSets.has(tile.id)) {
            if (isOkeyTile(tile, okeyTile, isHugo)) {
                perTotal += okeyValue;
            } else if (typeof tile.value === 'number') {
                perTotal += tile.value;
            }
        }
    }

    return { setTotal, perTotal, validSetCount };
}; 
/**
 * Istakayı otomatik dizer: per adaylarını yan yana, aralarında bir boşlukla yerleştirir.
 * mode 'seri': aynı renk ardışık sayılar; mode 'cift': aynı sayı farklı renkler.
 * Okeyler en sona konur. Grup satıra sığmazsa alt satıra geçer.
 * @returns {Array} 30 elemanlı pozisyon dizisi
 */
export const arrangeTiles = (tiles, mode, okeyTile, isHugo) => {
    const COLOR_ORDER = ['red', 'yellow', 'blue', 'black'];
    const colorIdx = (t) => { const i = COLOR_ORDER.indexOf(t.color); return i === -1 ? 9 : i; };
    const wild = tiles.filter(t => isOkeyTile(t, okeyTile, isHugo) || typeof t.value !== 'number');
    const plain = tiles.filter(t => !wild.includes(t));

    const byColor = (a, b) => colorIdx(a) - colorIdx(b) || a.value - b.value;
    const byValue = (a, b) => a.value - b.value || colorIdx(a) - colorIdx(b);

    // Seriler: aynı renk ardışık (çift taşlar ayrı seriye düşer)
    const takeRuns = (pool) => {
        const runs = [];
        for (const t of [...pool].sort(byColor)) {
            const g = runs.find(r => r[r.length - 1].color === t.color && r[r.length - 1].value + 1 === t.value);
            if (g) g.push(t); else runs.push([t]);
        }
        return runs;
    };
    // Aynı sayı perleri: farklı renkler (aynı renkten ikinci taş ayrı gruba düşer)
    const takeSameNumber = (pool) => {
        const sets = [];
        for (const t of [...pool].sort(byValue)) {
            const g = sets.find(r => r[0].value === t.value && !r.some(x => x.color === t.color) && r.length < 4);
            if (g) g.push(t); else sets.push([t]);
        }
        return sets;
    };

    // Önce seçilen türde 3+ perleri çıkar, kalanlardan diğer türü dene, artanları sırala
    const [first, second] = mode === 'cift' ? [takeSameNumber, takeRuns] : [takeRuns, takeSameNumber];
    const firstGroups = first(plain);
    const kept = firstGroups.filter(g => g.length >= 3);
    const rest = firstGroups.filter(g => g.length < 3).flat();
    const secondGroups = second(rest);
    kept.push(...secondGroups.filter(g => g.length >= 3));
    const singles = secondGroups.filter(g => g.length < 3).flat().sort(mode === 'cift' ? byValue : byColor);

    const groups = [...kept];
    if (singles.length) groups.push(singles);
    if (wild.length) groups.push(wild);

    const positions = Array(CELLS_PER_ROW * 2).fill(null);
    let cursor = 0;
    const leftovers = [];
    for (const g of groups) {
        const rowEnd = (Math.floor(cursor / CELLS_PER_ROW) + 1) * CELLS_PER_ROW;
        if (cursor + g.length > rowEnd) cursor = rowEnd; // satıra sığmıyor → alt satır
        if (cursor + g.length > positions.length) { leftovers.push(...g); continue; }
        g.forEach((t, i) => { positions[cursor + i] = t.id; });
        cursor += g.length + 1; // gruplar arası boşluk
    }
    // Sığmayanları kalan boş hücrelere koy (hiçbir taş kaybolmaz)
    for (const t of leftovers) positions[positions.indexOf(null)] = t.id;
    return positions;
};
