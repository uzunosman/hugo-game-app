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

const HUGO_ROUNDS = [1, 5, 9];

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
export const isOkeyTile = (tile, okeyTile, round) => {
    if (!tile) return false;
    const isHugo = HUGO_ROUNDS.includes(round || 1);
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
export const getConsecutiveGroups = (tilePositions, tiles) => {
    const groups = [];
    let currentGroup = [];

    for (let i = 0; i < tilePositions.length; i++) {
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

    const { okeyTile, round } = opts;
    const isWildcard = (t) => isOkeyTile(t, okeyTile, round);

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
export const calculateHandScore = (tilePositions, tiles, indicatorTile, okeyTile, round) => {
    if (!tiles || tiles.length === 0) {
        return { setTotal: 0, perTotal: 0, validSetCount: 0 };
    }

    const okeyValue = getOkeyValue(indicatorTile);
    const groups = getConsecutiveGroups(tilePositions, tiles);
    const opts = { okeyTile, round };

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
            if (isOkeyTile(tile, okeyTile, round)) {
                perTotal += okeyValue;
            } else if (typeof tile.value === 'number') {
                perTotal += tile.value;
            }
        }
    }

    return { setTotal, perTotal, validSetCount };
}; 