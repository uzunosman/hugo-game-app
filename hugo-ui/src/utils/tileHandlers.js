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
    if (gameState.currentPlayerId !== playerId || gameState.turnAction !== 'draw') {
        setError('Şu anda taş çekemezsiniz');
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
 * Taş atma işlemi
 * @param {Object} params - Parametreler
 * @param {Array} params.tiles - Oyuncunun taşları
 * @param {Number} params.tileIndex - Atılacak taşın indeksi
 * @param {Object} params.gameState - Oyun durumu
 * @param {String} params.playerId - Oyuncunun ID'si
 * @param {Function} params.socketService - Socket servisi
 * @param {Function} params.setTiles - Taşları güncelleyen fonksiyon
 * @param {Function} params.setGameState - Oyun durumunu güncelleyen fonksiyon
 * @param {Function} params.setError - Hata mesajını güncelleyen fonksiyon
 * @param {Function} params.setLoading - Yükleme durumunu güncelleyen fonksiyon
 * @param {Function} params.setDiscardedTiles - Atılan taşları güncelleyen fonksiyon
 * @param {Function} params.getPlayerCorner - Oyuncunun köşesini belirleyen fonksiyon
 * @param {Number} params.currentPlayerIndex - Mevcut oyuncunun indeksi
 * @returns {void}
 */
export const handleDiscardTile = ({
    tiles,
    tileIndex,
    gameState,
    playerId,
    socketService,
    setTiles,
    setGameState,
    setError,
    setLoading,
    setDiscardedTiles,
    getPlayerCorner,
    currentPlayerIndex
}) => {
    const tileToDiscard = tiles[tileIndex];

    if (!tileToDiscard) {
        console.error('Lütfen atmak için bir taş seçin');
        return;
    }

    // Oyuncunun sırası olup olmadığını kontrol et
    if (gameState.currentPlayerId !== playerId) {
        console.error('Şu anda taş atamazsınız, sıranız değil');
        return;
    }

    // Taş atma işlemini başlat
    setLoading(true);

    socketService.discardTile(tileToDiscard.id, (response) => {
        setLoading(false);

        if (response.success) {
            // Taşı listeden kaldır
            setTiles(prevTiles => prevTiles.filter(t => t.id !== tileToDiscard.id));

            // Taşı atılan taşlar listesine ekle
            if (setDiscardedTiles && getPlayerCorner) {
                const corner = getPlayerCorner(currentPlayerIndex);
                if (corner) {
                    setDiscardedTiles(prevDiscardedTiles => {
                        const newDiscardedTiles = { ...prevDiscardedTiles };
                        newDiscardedTiles[corner] = [
                            ...(newDiscardedTiles[corner] || []),
                            { ...tileToDiscard, discardedBy: playerId }
                        ];
                        return newDiscardedTiles;
                    });
                }
            }

            // Oyun durumunu güncelle
            setGameState(prevState => ({
                ...prevState,
                currentPlayerId: response.nextPlayerId,
                turnAction: 'draw'
            }));
        } else {
            setError(response.error || 'Taş atılırken bir hata oluştu');
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
            console.error('Şu anda taş atamazsınız, sıranız değil');
            return;
        }

        // Oyun yeni başladıysa ve 15 taşımız varsa veya taş atma aksiyonu varsa taş atabilir
        const isFirstTurn = tiles.length === 15 && gameState.turnAction === 'draw';
        if (!isFirstTurn && gameState.turnAction !== 'discard') {
            console.error('Şu anda taş atamazsınız, önce taş çekmelisiniz');
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

    // Taşları taşı
    setTilePositions(prevPositions => {
        const newPositions = [...prevPositions];
        const tileId = newPositions[sourceIndex];

        // Hedef pozisyonda zaten bir taş varsa, yer değiştir
        if (newPositions[targetIndex]) {
            newPositions[sourceIndex] = newPositions[targetIndex];
        } else {
            newPositions[sourceIndex] = null;
        }

        newPositions[targetIndex] = tileId;
        return newPositions;
    });
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
    setError
}) => {
    // Sadece sıradaki oyuncu, draw aşamasında işlem yapabilir
    if (gameState.currentPlayerId !== playerId || gameState.turnAction !== 'draw') {
        setError('Şu anda taş çekemezsiniz');
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