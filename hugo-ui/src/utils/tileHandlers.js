/**
 * Taş işleme fonksiyonları
 */

/**
 * Taş çekme işlemi
 * @param {Object} params - Parametreler
 * @param {Object} params.gameState - Oyun durumu
 * @param {String} params.playerId - Oyuncunun ID'si
 * @param {Function} params.socketService - Socket servisi
 * @param {Function} params.setTiles - Taşları güncelleyen fonksiyon
 * @param {Function} params.setGameState - Oyun durumunu güncelleyen fonksiyon
 * @param {Function} params.setError - Hata mesajını güncelleyen fonksiyon
 * @param {Boolean} params.fromDiscard - Atılan taşlardan mı çekiliyor
 * @param {Function} params.setTilePositions - Taş pozisyonlarını güncelleyen fonksiyon
 * @returns {void}
 */
export const handleDrawTile = ({
    gameState,
    playerId,
    socketService,
    setTiles,
    setGameState,
    setError,
    fromDiscard,
    setTilePositions,
    targetIndex // Sürükle-bırak ile belirtilen hedef pozisyon (opsiyonel)
}) => {
    if (gameState.currentPlayerId !== playerId) {
        setError('Sıra sende değil');
        return;
    }
    if (gameState.turnAction !== 'draw') {
        setError('Bu sırada taş çektin, şimdi taş at');
        return;
    }

    socketService.drawTile(fromDiscard, (response) => {
        if (response.success) {
            // Yeni taşı elde ekle
            setTiles(prevTiles => [...prevTiles, response.tile]);

            // Yeni taşı ıstakaya yerleştir
            setTilePositions(prevPositions => {
                const newPositions = [...prevPositions];
                // Hedef pozisyon belirtilmiş ve boşsa oraya koy, değilse ilk boşa
                if (targetIndex !== undefined && targetIndex !== null && newPositions[targetIndex] === null) {
                    newPositions[targetIndex] = response.tile.id;
                } else {
                    const emptyIndex = newPositions.findIndex(pos => pos === null);
                    if (emptyIndex !== -1) {
                        newPositions[emptyIndex] = response.tile.id;
                    }
                }
                return newPositions;
            });

            // Oyun durumunu güncelle: discard aşamasına geç, deste sayısını düşür
            setGameState(prevState => ({
                ...prevState,
                turnAction: 'discard',
                deckCount: Math.max(0, (prevState.deckCount ?? 0) - (fromDiscard ? 0 : 1))
            }));
        } else {
            setError(response.error || 'Taş çekilirken bir hata oluştu');
        }
    });
};

/**
 * Taş taşıma işlemi
 * @param {Object} params - Parametreler
 * @param {Number} params.sourceIndex - Kaynak indeks
 * @param {Number} params.targetIndex - Hedef indeks
 * @param {Array} params.tilePositions - Taş pozisyonları
 * @param {Array} params.tiles - Oyuncunun taşları
 * @param {Object} params.gameState - Oyun durumu
 * @param {String} params.playerId - Oyuncunun ID'si
 * @param {Function} params.socketService - Socket servisi
 * @param {Function} params.setTilePositions - Taş pozisyonlarını güncelleyen fonksiyon
 * @param {Function} params.setDiscardedTiles - Atılan taşları güncelleyen fonksiyon
 * @param {Function} params.setLoading - Yükleme durumunu güncelleyen fonksiyon
 * @param {Function} params.setError - Hata mesajını güncelleyen fonksiyon
 * @param {Function} params.getPlayerCorner - Oyuncunun köşesini belirleyen fonksiyon
 * @param {Number} params.currentPlayerIndex - Mevcut oyuncunun indeksi
 * @returns {void}
 */
/**
 * Gerçekçi zincir kaydırma (chain-shift):
 * Taş kaynak konumdan alınır; hedefe doğru olan tüm taşlar (ve boşluklar)
 * bir adım kaydırılır; taş hedefe yerleşir. Tıpkı fiziksel bir raf gibi.
 * Satır sınırları aşılmaz. Farklı satırlar için hedef satırda yer açılır.
 * @param {Array} positions - Mevcut pozisyon dizisi (mutate edilmez)
 * @param {Number} sourceIdx - Kaynak pozisyon indeksi
 * @param {Number} targetIdx - Hedef pozisyon indeksi
 * @returns {Array} Güncellenmiş pozisyon dizisi
 */
export const insertShift = (positions, sourceIdx, targetIdx) => {
    const newPos = [...positions];
    const tileId = newPos[sourceIdx];
    newPos[sourceIdx] = null;

    if (sourceIdx === targetIdx) return newPos;

    // Hedef boşsa doğrudan yerleştir
    if (newPos[targetIdx] === null) {
        newPos[targetIdx] = tileId;
        return newPos;
    }

    const sourceRow = sourceIdx < 15 ? 0 : 1;
    const targetRow = targetIdx < 15 ? 0 : 1;

    if (sourceRow === targetRow) {
        // Aynı satır: hedefteki taşlar kaynağa doğru yalnızca İLK boşluğa kadar itilir.
        // (Önceden kaynağa kadar her şey kayıyordu; aradaki boşluklar ve diziler bozuluyordu.)
        // Kaynak hücre artık boş olduğu için döngü her zaman durur.
        if (targetIdx > sourceIdx) {
            let gap = targetIdx;
            while (newPos[gap] !== null) gap--;
            for (let i = gap; i < targetIdx; i++) newPos[i] = newPos[i + 1];
        } else {
            let gap = targetIdx;
            while (newPos[gap] !== null) gap++;
            for (let i = gap; i > targetIdx; i--) newPos[i] = newPos[i - 1];
        }
        newPos[targetIdx] = tileId;
    } else {
        // Farklı satır: hedef satırda en yakın boşluğu bul ve oraya yerleştir
        const rowMin = targetRow * 15;
        const rowMax = rowMin + 14;

        let emptySlot = -1;
        for (let offset = 0; offset <= 15; offset++) {
            if (targetIdx + offset <= rowMax && newPos[targetIdx + offset] === null) {
                emptySlot = targetIdx + offset;
                break;
            }
            if (offset > 0 && targetIdx - offset >= rowMin && newPos[targetIdx - offset] === null) {
                emptySlot = targetIdx - offset;
                break;
            }
        }

        if (emptySlot !== -1) {
            // Hedef satır içinde yer açmak için kaydır
            if (emptySlot > targetIdx) {
                for (let i = emptySlot; i > targetIdx; i--) newPos[i] = newPos[i - 1];
            } else {
                for (let i = emptySlot; i < targetIdx; i++) newPos[i] = newPos[i + 1];
            }
            newPos[targetIdx] = tileId;
        }
    }

    return newPos;
};

export const handleTileMove = ({
    sourceIndex,
    targetIndex,
    tilePositions,
    tiles,
    gameState,
    playerId,
    socketService,
    setTiles,
    setTilePositions,
    setDiscardedTiles,
    setLoading,
    setError,
    setGameState,
    getPlayerCorner,
    currentPlayerIndex
}) => {
    console.log(`handleTileMove: ${sourceIndex} -> ${targetIndex}`);

    // Geçersiz indeksleri kontrol et
    if (sourceIndex < 0 || sourceIndex >= 30) {
        console.error('Geçersiz kaynak indeks:', sourceIndex);
        return;
    }

    // Eğer targetIndex -1 ise, taş köşeye bırakılmıştır (taş atma işlemi)
    if (targetIndex === -1) {
        // Oyuncunun sırası olup olmadığını kontrol et
        if (gameState.currentPlayerId !== playerId) {
            setError('Sıra sende değil');
            return;
        }

        // Oyun yeni başladıysa ve 15 taşımız varsa veya taş atma aksiyonu varsa taş atabilir
        const isFirstTurn = tiles.length === 15 && gameState.turnAction === 'draw';
        if (!isFirstTurn && gameState.turnAction !== 'discard') {
            setError('Önce taş çekmelisin');
            return;
        }

        // Atılacak taşı belirle
        const tileId = tilePositions[sourceIndex];
        if (!tileId) {
            console.error('Geçerli bir taş seçmelisiniz');
            return;
        }

        const tileToDiscard = tiles.find(t => t.id === tileId);
        if (!tileToDiscard) {
            console.error('Geçerli bir taş seçmelisiniz');
            return;
        }

        // Taş atma işlemini başlat
        setLoading(true);
        setError('');

        // Taşın orijinal pozisyonunu kaydet (hata durumunda geri getirmek için)
        const originalTilePosition = sourceIndex;

        socketService.discardTile(tileToDiscard.id, (response) => {
            setLoading(false);

            if (response.success) {
                // Taşı tiles dizisinden kaldır (tiles.length doğru kalmalı — ilk el kontrolü için kritik)
                setTiles(prevTiles => prevTiles.filter(t => t.id !== tileToDiscard.id));

                // Taşı pozisyonlardan kaldır
                setTilePositions(prevPositions => {
                    const newPositions = [...prevPositions];
                    newPositions[sourceIndex] = null;
                    return newPositions;
                });

                // Taşı atılan taşlar listesine ekle
                const corner = getPlayerCorner(currentPlayerIndex);
                const discardedTile = { ...tileToDiscard, discardedBy: playerId };

                setDiscardedTiles(prevDiscardedTiles => {
                    const newDiscardedTiles = { ...prevDiscardedTiles };
                    newDiscardedTiles[corner] = [
                        ...(newDiscardedTiles[corner] || []),
                        discardedTile
                    ];
                    console.log('Atılan taş köşeye eklendi:', corner, discardedTile);
                    return newDiscardedTiles;
                });

                // Sırayı bir sonraki oyuncuya geçir (game:nextTurn event'i de gelecek ama önce yerel güncelle)
                setGameState(prevState => ({
                    ...prevState,
                    currentPlayerId: response.nextPlayerId,
                    turnAction: 'draw'
                }));

                console.log('Taş başarıyla atıldı:', tileToDiscard);
            } else {
                console.error('Taş atılamadı:', response.error || 'Taş atılırken bir hata oluştu');
                setError(response.error || 'Taş atılırken bir hata oluştu');

                // Hata durumunda taşı orijinal pozisyonuna geri getir
                // Burada hiçbir şey yapmamıza gerek yok, çünkü taşın pozisyonu değiştirilmedi
                // Sadece kullanıcıya görsel geri bildirim verelim

                // Taşın bulunduğu hücreyi kırmızı yanıp sönme efekti ile işaretle
                const tileCells = document.querySelectorAll('.tile-cell');
                const cell = tileCells[originalTilePosition];
                if (cell) {
                    cell.classList.add('error-animation');
                    setTimeout(() => {
                        cell.classList.remove('error-animation');
                    }, 1000);
                }
            }
        });

        return;
    }

    // Hedef indeksi kontrol et
    if (targetIndex < 0 || targetIndex >= 30) {
        console.error('Geçersiz hedef indeks:', targetIndex);
        return;
    }

    // Eğer taş aynı yere bırakılıyorsa hiçbir şey yapma
    if (sourceIndex === targetIndex) {
        return;
    }

    // Zincir kaydırma ile yerleştir
    setTilePositions(prevPositions => insertShift(prevPositions, sourceIndex, targetIndex));
};

/**
 * Atılan taşı çekme işlemi
 * @param {Object} params - Parametreler
 * @param {String} params.corner - Taşın atıldığı köşe
 * @param {Number} params.tileIndex - Atılan taşın indeksi (köşedeki)
 * @param {Number} params.targetIndex - Hedef indeks (ıstakada)
 * @param {Object} params.gameState - Oyun durumu
 * @param {String} params.playerId - Oyuncunun ID'si
 * @param {Object} params.discardedTiles - Atılan taşlar
 * @param {Function} params.socketService - Socket servisi
 * @param {Function} params.setTiles - Taşları güncelleyen fonksiyon
 * @param {Function} params.setTilePositions - Taş pozisyonlarını güncelleyen fonksiyon
 * @param {Function} params.setDiscardedTiles - Atılan taşları güncelleyen fonksiyon
 * @param {Function} params.setGameState - Oyun durumunu güncelleyen fonksiyon
 * @param {Function} params.setError - Hata mesajını güncelleyen fonksiyon
 * @returns {void}
 */
export const handleDrawDiscardedTile = ({
    corner,
    tileIndex,
    targetIndex,
    gameState,
    playerId,
    discardedTiles,
    socketService,
    setTiles,
    setTilePositions,
    setDiscardedTiles,
    setGameState,
    setError,
    onTaken
}) => {
    // Sadece sıradaki oyuncu, draw aşamasında işlem yapabilir
    if (gameState.currentPlayerId !== playerId) {
        setError('Sıra sende değil');
        return;
    }
    if (gameState.turnAction !== 'draw') {
        setError('Bu sırada taş çektin, şimdi taş at');
        return;
    }

    // Seçilen köşede atılan taş var mı kontrol et
    const cornerTiles = discardedTiles[corner] || [];
    if (cornerTiles.length === 0) {
        setError('Bu köşede atılan taş yok');
        return;
    }

    // Sadece son atılan taş (en üstteki) çekilebilir
    const lastTileIndex = cornerTiles.length - 1;
    if (cornerTiles[lastTileIndex].locked) {
        setError('Bu taş yerden alınamaz');
        return;
    }
    if (tileIndex !== lastTileIndex) {
        setError('Sadece en son atılan taşı alabilirsiniz');
        return;
    }

    console.log('Atılan taş sunucudan çekiliyor:', { corner, tileIndex, targetIndex });

    // Sunucuya taş çekme isteği gönder (fromDiscard=true)
    socketService.drawTile(true, (response) => {
        console.log('Sunucudan gelen yanıt:', response);

        if (response.success) {
            console.log('Sunucudan gelen taş:', response.tile);
            onTaken?.({ tileId: response.tile.id, corner });

            // Yeni taşı elde ekle
            setTiles(prevTiles => [...prevTiles, response.tile]);

            // Yeni taşı ıstakaya yerleştir
            setTilePositions(prevPositions => {
                const newPositions = [...prevPositions];

                if (targetIndex !== undefined && targetIndex !== null && newPositions[targetIndex] === null) {
                    newPositions[targetIndex] = response.tile.id;
                } else {
                    const emptyIndex = newPositions.findIndex(pos => pos === null);
                    if (emptyIndex !== -1) {
                        newPositions[emptyIndex] = response.tile.id;
                    }
                }

                return newPositions;
            });

            // Atılan taşı köşeden kaldır
            setDiscardedTiles(prevDiscardedTiles => {
                const newDiscardedTiles = { ...prevDiscardedTiles };
                newDiscardedTiles[corner] = newDiscardedTiles[corner].slice(0, -1);
                return newDiscardedTiles;
            });

            // Taş çekildikten sonra artık discard aşamasına geç
            setGameState(prevState => ({
                ...prevState,
                turnAction: 'discard'
            }));
        } else {
            console.error('Taş çekme hatası:', response.error);
            setError(response.error || 'Taş çekilirken bir hata oluştu');
        }
    });
}; 
// Istakadaki per: basılan taşın satırındaki kesintisiz taş dizisi (en az 2 taş). Oyuncu perleri boşlukla ayırır.
// isPair(idA, idB) verilirse ve blok baştan sona çiftlerden oluşuyorsa (7 7 9 9) yalnızca basılan çift seçilir.
export const rackGroupAt = (positions, idx, isPair) => {
    if (!positions[idx]) return null;
    const rowMin = idx < 15 ? 0 : 15;
    const rowMax = rowMin + 14;
    let start = idx;
    let end = idx;
    while (start > rowMin && positions[start - 1]) start--;
    while (end < rowMax && positions[end + 1]) end++;
    const len = end - start + 1;
    if (len < 2) return null;
    if (isPair && len >= 4 && len % 2 === 0) {
        let allPairs = true;
        for (let i = start; i < end && allPairs; i += 2) allPairs = isPair(positions[i], positions[i + 1]);
        if (allPairs) return { start: start + Math.floor((idx - start) / 2) * 2, len: 2 };
    }
    return { start, len };
};

// Istaka ile el her zaman aynı: elde olmayan ya da iki kez yazılmış id hücreden silinir (hücre boş görünüp
// dolu davranmasın), elde olup ıstakada olmayan taş ilk boş hücreye konur (taş görünmez kalmasın).
// Değişiklik yoksa aynı dizi döner (gereksiz render olmaz).
export const reconcilePositions = (positions, tiles) => {
    const ids = new Set(tiles.map(t => t.id));
    const seen = new Set();
    let changed = false;
    const next = positions.map(id => {
        if (id === null) return null;
        if (!ids.has(id) || seen.has(id)) { changed = true; return null; }
        seen.add(id);
        return id;
    });
    for (const t of tiles) {
        if (seen.has(t.id)) continue;
        const empty = next.indexOf(null);
        if (empty === -1) break;
        next[empty] = t.id;
        seen.add(t.id);
        changed = true;
    }
    return changed ? next : positions;
};
