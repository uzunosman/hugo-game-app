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