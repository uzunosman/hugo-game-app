import { useState, useEffect } from 'react';
import socketService from '../services/socketService';
import PlayerPanel from './PlayerPanel/PlayerPanel';
import TileHolder from './TileHolder/TileHolder';
import CenterArea from './CenterArea/CenterArea';
import Tile from './Tile/Tile';
import '../assets/css/components/GameBoard.css';

function Game({ player, room }) {
    const [tiles, setTiles] = useState([]);
    const [gameState, setGameState] = useState(room.game);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedTile, setSelectedTile] = useState(null);
    const [timeLeft, setTimeLeft] = useState(60);
    const [tilePositions, setTilePositions] = useState(Array(30).fill(null));
    const [discardedTiles, setDiscardedTiles] = useState({
        topLeft: [],
        topRight: [],
        bottomRight: [],
        bottomLeft: []
    });

    useEffect(() => {
        // Taşları dinle
        socketService.onGameTiles((response) => {
            if (response.success) {
                // Taşları al
                setTiles(response.tiles);

                // Taşları ilk 14-15 pozisyona yerleştir
                const initialPositions = Array(30).fill(null);
                response.tiles.forEach((tile, index) => {
                    if (index < 30) {
                        initialPositions[index] = tile.id;
                    }
                });
                setTilePositions(initialPositions);
            }
        });

        // Taş çekme olayını dinle
        socketService.onTileDraw((response) => {
            if (response.success) {
                // Diğer oyuncuların taş çekme olayı
                if (response.playerId !== player.id) {
                    console.log(`${response.playerId} bir taş çekti`);
                }
            }
        });

        // Taş atma olayını dinle
        socketService.onTileDiscard((response) => {
            if (response.success) {
                console.log('Taş atma olayı:', response);

                // Atılan taşı göster
                setGameState(prevState => ({
                    ...prevState,
                    discardPile: [...(prevState.discardPile || []), response.tile]
                }));

                // Atılan taşı ilgili köşeye ekle
                const players = getOrderedPlayers();
                console.log('Oyuncular:', players);

                // Taşın playerId değerini kontrol et
                if (!response.tile.playerId) {
                    console.error('Taş atma olayında playerId eksik:', response.tile);
                    return;
                }

                const discardPlayerIndex = players.findIndex(p => p.id === response.tile.playerId);
                console.log('Taş atan oyuncu indeksi:', discardPlayerIndex, 'Oyuncu ID:', response.tile.playerId);

                if (discardPlayerIndex !== -1) {
                    const corner = getPlayerCorner(discardPlayerIndex);
                    console.log(`${response.tile.playerId} oyuncusu ${corner} köşesine taş attı:`, response.tile);

                    setDiscardedTiles(prev => {
                        const newDiscardedTiles = {
                            ...prev,
                            [corner]: [response.tile]
                        };
                        console.log('Yeni atılan taşlar:', newDiscardedTiles);
                        return newDiscardedTiles;
                    });
                } else {
                    console.error('Taş atan oyuncu bulunamadı:', response.tile.playerId);
                }
            } else {
                console.error('Taş atma olayı başarısız:', response.error);
            }
        });

        // Sıra değişimini dinle
        socketService.onNextTurn((response) => {
            if (response.success) {
                console.log('Sıra değişimi:', response);

                // Oyuncuların sıra durumunu güncelle
                setGameState(prevState => ({
                    ...prevState,
                    currentPlayerId: response.playerId,
                    turnAction: 'draw' // Yeni oyuncu önce taş çekecek
                }));

                // Süreyi sıfırla
                setTimeLeft(60);
            }
        });

        // Süre sayacı
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 0) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            // Component unmount olduğunda event listener'ları temizle
            socketService.socket.off('game:tiles');
            socketService.socket.off('game:tileDraw');
            socketService.socket.off('game:tileDiscard');
            socketService.socket.off('game:nextTurn');
            clearInterval(timer);
        };
    }, [player.id]);

    const handleDrawTile = (fromDiscard) => {
        if (gameState.currentPlayerId !== player.id || gameState.turnAction !== 'draw') {
            setError('Şu anda taş çekemezsiniz');
            return;
        }

        socketService.drawTile(fromDiscard, (response) => {

            if (response.success) {
                // Yeni taşı ekle
                setTiles(prevTiles => [...prevTiles, response.tile]);

                // Oyun durumunu güncelle
                setGameState(prevState => ({
                    ...prevState,
                    turnAction: 'discard'
                }));
            } else {
                setError(response.error || 'Taş çekilirken bir hata oluştu');
            }
        });
    };

    const handleDiscardTile = (tileIndex) => {
        const tileToDiscard = tiles[tileIndex];

        if (!tileToDiscard) {
            console.error('Lütfen atmak için bir taş seçin');
            return;
        }

        // Oyuncunun sırası olup olmadığını kontrol et
        if (gameState.currentPlayerId !== player.id) {
            console.error('Şu anda taş atamazsınız, sıranız değil');
            return;
        }

        // Oyun yeni başladıysa ve 15 taşımız varsa veya taş atma aksiyonu varsa taş atabilir
        const isFirstTurn = tiles.length === 15 && gameState.turnAction === 'draw';
        if (!isFirstTurn && gameState.turnAction !== 'discard') {
            console.error('Şu anda taş atamazsınız, önce taş çekmelisiniz');
            return;
        }

        setLoading(true);
        setError('');

        socketService.discardTile(tileToDiscard.id, (response) => {
            setLoading(false);

            if (response.success) {
                // Atılan taşı elinden çıkar
                setTiles(prevTiles => prevTiles.filter(tile => tile.id !== tileToDiscard.id));
                setSelectedTile(null);

                // Oyun durumunu güncelle - sıra diğer oyuncuya geçecek
                // Bu işlem sunucu tarafından yapılacak ve socket üzerinden bildirilecek
                // Burada sadece yerel durumu güncelliyoruz
                setGameState(prevState => ({
                    ...prevState,
                    turnAction: 'draw'
                }));

                // Atılan taşı ilgili köşeye ekle
                const currentPlayerIndex = getCurrentPlayerIndex();
                const corner = getPlayerCorner(currentPlayerIndex);
                setDiscardedTiles(prev => ({
                    ...prev,
                    [corner]: [{ ...tileToDiscard, playerId: player.id }]
                }));
            } else {
                console.error('Taş atılamadı:', response.error || 'Taş atılırken bir hata oluştu');
            }
        });
    };

    const handleTileMove = (sourceIndex, targetIndex) => {
        console.log(`handleTileMove: ${sourceIndex} -> ${targetIndex}`);

        // Geçersiz indeksleri kontrol et
        if (sourceIndex < 0 || sourceIndex >= 30) {
            console.error('Geçersiz kaynak indeks:', sourceIndex);
            return;
        }

        // Eğer targetIndex -1 ise, taş köşeye bırakılmıştır (taş atma işlemi)
        if (targetIndex === -1) {
            // Oyuncunun sırası olup olmadığını kontrol et
            if (gameState.currentPlayerId !== player.id) {
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

            // Taşın orijinal pozisyonunu kaydet (hata durumunda geri dönmek için)
            const originalTilePosition = sourceIndex;

            // Taş atma isteğini gönder
            socketService.discardTile(tileToDiscard.id, (response) => {
                setLoading(false);

                if (response.success) {
                    // Atılan taşı elinden çıkar
                    setTiles(prevTiles => prevTiles.filter(tile => tile.id !== tileToDiscard.id));
                    setSelectedTile(null);

                    // Pozisyonu güncelle
                    const newPositions = [...tilePositions];
                    newPositions[sourceIndex] = null;
                    setTilePositions(newPositions);

                    // Oyun durumunu güncelle
                    setGameState(prevState => ({
                        ...prevState,
                        turnAction: 'draw'
                    }));

                    // Atılan taşı ilgili köşeye ekle
                    const currentPlayerIndex = getCurrentPlayerIndex();
                    const corner = getPlayerCorner(currentPlayerIndex);

                    // Atılan taşı discardedTiles state'ine ekle
                    const discardedTile = {
                        ...tileToDiscard,
                        playerId: player.id
                    };

                    setDiscardedTiles(prev => {
                        const newDiscardedTiles = {
                            ...prev,
                            [corner]: [discardedTile]
                        };
                        console.log('Atılan taş köşeye eklendi:', corner, discardedTile);
                        return newDiscardedTiles;
                    });

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

        // Pozisyonları güncelle (30 elemanlı dizi)
        const newPositions = [...tilePositions];

        // Sürüklenen taşın ID'sini al
        const tileId = newPositions[sourceIndex];

        // Taş yoksa işlem yapma
        if (!tileId) {
            console.error('Sürüklenen taş bulunamadı:', sourceIndex);
            return;
        }

        console.log('Taş ID:', tileId);

        // Animasyon için taşları işaretle
        const tilesToAnimate = [];

        // Hedef konumda taş yoksa, basitçe taşı
        if (newPositions[targetIndex] === null) {
            newPositions[sourceIndex] = null;
            newPositions[targetIndex] = tileId;

            // Animasyon için taşı işaretle
            tilesToAnimate.push(targetIndex);
        } else {
            // Hedef konumda taş varsa

            // Kaynak taşı geçici olarak sakla
            const movingTile = tileId;

            // Kaynak konumu boşalt
            newPositions[sourceIndex] = null;

            // Eğer taş hemen yanındaki dolu bir hücreye bırakılırsa, iki taş yer değiştirir
            const isAdjacent = Math.abs(sourceIndex - targetIndex) === 1;

            if (isAdjacent) {
                // İki taş yer değiştirir
                const targetTile = newPositions[targetIndex];
                newPositions[sourceIndex] = targetTile;
                newPositions[targetIndex] = movingTile;

                // Animasyon için taşları işaretle
                tilesToAnimate.push(sourceIndex);
                tilesToAnimate.push(targetIndex);
            } else {
                // Taşlar kaydırılır

                // Sağa doğru kaydırma için boş yer ara
                let rightEmptyIndex = -1;
                for (let i = targetIndex; i < 30; i++) {
                    if (newPositions[i] === null) {
                        rightEmptyIndex = i;
                        break;
                    }
                }

                // Sola doğru kaydırma için boş yer ara
                let leftEmptyIndex = -1;
                for (let i = targetIndex; i >= 0; i--) {
                    if (newPositions[i] === null) {
                        leftEmptyIndex = i;
                        break;
                    }
                }

                // Hangi yöne kaydıracağımızı belirle
                let shiftRight = true;

                // Eğer sağda boş yer yoksa, sola kaydır
                if (rightEmptyIndex === -1) {
                    shiftRight = false;
                }
                // Eğer solda boş yer yoksa, sağa kaydır
                else if (leftEmptyIndex === -1) {
                    shiftRight = true;
                }
                // Her iki yönde de boş yer varsa, daha yakın olanı seç
                else {
                    const rightDistance = rightEmptyIndex - targetIndex;
                    const leftDistance = targetIndex - leftEmptyIndex;
                    shiftRight = rightDistance <= leftDistance;
                }

                // Kaydırma işlemi yap
                if (shiftRight) {
                    console.log(`Sağa kaydırma: ${targetIndex} -> ${rightEmptyIndex}`);
                    // Sağa kaydır
                    for (let i = rightEmptyIndex; i > targetIndex; i--) {
                        newPositions[i] = newPositions[i - 1];
                        // Animasyon için taşı işaretle
                        tilesToAnimate.push(i);
                    }
                } else {
                    console.log(`Sola kaydırma: ${targetIndex} -> ${leftEmptyIndex}`);
                    // Sola kaydır
                    for (let i = leftEmptyIndex; i < targetIndex; i++) {
                        newPositions[i] = newPositions[i + 1];
                        // Animasyon için taşı işaretle
                        tilesToAnimate.push(i);
                    }
                }

                // Hedef konuma sürüklenen taşı yerleştir
                newPositions[targetIndex] = movingTile;

                // Animasyon için taşı işaretle
                tilesToAnimate.push(targetIndex);
            }
        }

        // Animasyon için taşları işaretle
        setTimeout(() => {
            // Taşları animasyonlu olarak işaretle
            const tileCells = document.querySelectorAll('.tile-cell');
            tilesToAnimate.forEach(index => {
                const cell = tileCells[index];
                if (cell) {
                    cell.classList.add('animated');

                    // Animasyon bittikten sonra sınıfı kaldır
                    setTimeout(() => {
                        cell.classList.remove('animated');
                    }, 300);
                }
            });
        }, 0);

        // Pozisyonları güncelle
        setTilePositions(newPositions);
    };

    const handleTileClick = (tileIndex) => {
        // Oyuncu her zaman taşlarını düzenleyebilir
        // Ancak sadece sırası geldiğinde ve taş atma aksiyonu varsa taş atabilir
        if (gameState.currentPlayerId === player.id) {
            const isFirstTurn = tiles.length === 15 && gameState.turnAction === 'draw';
            if (gameState.turnAction === 'discard' || isFirstTurn) {
                const tileId = tilePositions[tileIndex];
                if (tileId) {
                    const tileToDiscard = tiles.find(t => t.id === tileId);
                    if (tileToDiscard) {
                        // Taş atma işlemini başlat
                        setLoading(true);
                        setError('');

                        // Taşın orijinal pozisyonunu kaydet (hata durumunda geri dönmek için)
                        const originalTilePosition = tileIndex;

                        // Taş atma isteğini gönder
                        socketService.discardTile(tileToDiscard.id, (response) => {
                            setLoading(false);

                            if (response.success) {
                                // Atılan taşı elinden çıkar
                                setTiles(prevTiles => prevTiles.filter(tile => tile.id !== tileToDiscard.id));
                                setSelectedTile(null);

                                // Pozisyonu güncelle
                                const newPositions = [...tilePositions];
                                newPositions[tileIndex] = null;
                                setTilePositions(newPositions);

                                // Oyun durumunu güncelle
                                setGameState(prevState => ({
                                    ...prevState,
                                    turnAction: 'draw'
                                }));

                                // Atılan taşı ilgili köşeye ekle
                                const currentPlayerIndex = getCurrentPlayerIndex();
                                const corner = getPlayerCorner(currentPlayerIndex);

                                // Atılan taşı discardedTiles state'ine ekle
                                const discardedTile = {
                                    ...tileToDiscard,
                                    playerId: player.id
                                };

                                setDiscardedTiles(prev => {
                                    const newDiscardedTiles = {
                                        ...prev,
                                        [corner]: [discardedTile]
                                    };
                                    console.log('Atılan taş köşeye eklendi:', corner, discardedTile);
                                    return newDiscardedTiles;
                                });

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
                    }
                }
            } else {
                // Taşı seçili olarak işaretle (düzenleme için)
                const tileId = tilePositions[tileIndex];
                if (tileId) {
                    const selectedTile = tiles.find(t => t.id === tileId);
                    setSelectedTile(selectedTile);
                }
            }
        }
    };

    // Oyuncuları düzenle (kendimiz her zaman altta olacak şekilde)
    const getOrderedPlayers = () => {
        const myIndex = room.players.findIndex(p => p.id === player.id);
        if (myIndex === -1) return room.players;

        // Kendimizi 0. indekse (alt) yerleştir
        const orderedPlayers = [];
        for (let i = 0; i < room.players.length; i++) {
            const index = (myIndex + i) % room.players.length;
            orderedPlayers.push(room.players[index]);
        }
        return orderedPlayers;
    };

    // Oyuncunun pozisyonunu belirle
    const getPlayerPosition = (index) => {
        const positionMap = {
            0: 'current-player', // Kendimiz (alt)
            1: 'right',          // Sağımızdaki oyuncu
            2: 'top',            // Karşımızdaki oyuncu
            3: 'left'            // Solumuzdaki oyuncu
        };
        return positionMap[index] || 'current-player';
    };

    // Oyuncunun köşesini belirle (taş atma için)
    const getPlayerCorner = (index) => {
        const cornerMap = {
            0: 'bottomRight', // Alt oyuncu sağ köşeye atar
            1: 'topRight',    // Sağ oyuncu sağ üst köşeye atar
            2: 'topLeft',     // Üst oyuncu sol üst köşeye atar
            3: 'bottomLeft'   // Sol oyuncu sol alt köşeye atar
        };
        return cornerMap[index];
    };

    // Mevcut oyuncunun indeksini bul
    const getCurrentPlayerIndex = () => {
        const players = getOrderedPlayers();
        return players.findIndex(p => p.id === gameState.currentPlayerId);
    };

    const players = getOrderedPlayers();
    const currentPlayerIndex = getCurrentPlayerIndex();
    const isMyTurn = gameState.currentPlayerId === player.id;

    // Oyuncu taşlarını hazırla (sadece kendi taşlarımızı biliyoruz)
    const playerTiles = Array(players.length).fill([]);
    playerTiles[0] = tiles; // Kendimiz her zaman 0. indekste

    // Taş çekme durumunu takip et
    const hasDrawnTile = {};
    players.forEach((p, index) => {
        hasDrawnTile[index] = p.id === gameState.currentPlayerId && gameState.turnAction === 'discard';
    });

    return (
        <div className="game-container">
            {error && <div style={{ color: 'red', textAlign: 'center', padding: '10px', display: 'none' }}>{error}</div>}

            {/* Player Panels */}
            {players.map((p, index) => (
                <PlayerPanel
                    key={index}
                    name={p.name}
                    score={0}
                    position={getPlayerPosition(index)}
                    isCurrentPlayer={p.id === gameState.currentPlayerId}
                    timeLeft={p.id === gameState.currentPlayerId ? timeLeft : null}
                />
            ))}

            <div className="game-board">
                <div className="board-content">
                    {/* Köşe Bırakma Alanları */}
                    <div
                        className={`tile-drop-zone top-left ${getPlayerCorner(currentPlayerIndex) === 'topLeft' && isMyTurn && (gameState.turnAction === 'discard' || tiles.length === 15) ? 'active' : ''}`}
                        onDragOver={(e) => {
                            const isFirstTurn = tiles.length === 15 && gameState.turnAction === 'draw';
                            if (getPlayerCorner(currentPlayerIndex) === 'topLeft' && isMyTurn && (gameState.turnAction === 'discard' || isFirstTurn)) {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                e.currentTarget.classList.add('drag-over');
                            }
                        }}
                        onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag-over');
                        }}
                        onDrop={(e) => {
                            const isFirstTurn = tiles.length === 15 && gameState.turnAction === 'draw';
                            if (getPlayerCorner(currentPlayerIndex) === 'topLeft' && isMyTurn && (gameState.turnAction === 'discard' || isFirstTurn)) {
                                e.preventDefault();
                                e.currentTarget.classList.remove('drag-over');
                                try {
                                    const tileData = JSON.parse(e.dataTransfer.getData('tile'));
                                    handleTileMove(tileData.sourceIndex, -1);
                                } catch (error) {
                                    console.error('Taş bırakma sırasında hata:', error);
                                }
                            }
                        }}
                    />
                    <div
                        className={`tile-drop-zone top-right ${getPlayerCorner(currentPlayerIndex) === 'topRight' && isMyTurn && (gameState.turnAction === 'discard' || tiles.length === 15) ? 'active' : ''}`}
                        onDragOver={(e) => {
                            const isFirstTurn = tiles.length === 15 && gameState.turnAction === 'draw';
                            if (getPlayerCorner(currentPlayerIndex) === 'topRight' && isMyTurn && (gameState.turnAction === 'discard' || isFirstTurn)) {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                e.currentTarget.classList.add('drag-over');
                            }
                        }}
                        onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag-over');
                        }}
                        onDrop={(e) => {
                            const isFirstTurn = tiles.length === 15 && gameState.turnAction === 'draw';
                            if (getPlayerCorner(currentPlayerIndex) === 'topRight' && isMyTurn && (gameState.turnAction === 'discard' || isFirstTurn)) {
                                e.preventDefault();
                                e.currentTarget.classList.remove('drag-over');
                                try {
                                    const tileData = JSON.parse(e.dataTransfer.getData('tile'));
                                    handleTileMove(tileData.sourceIndex, -1);
                                } catch (error) {
                                    console.error('Taş bırakma sırasında hata:', error);
                                }
                            }
                        }}
                    />
                    <div
                        className={`tile-drop-zone bottom-left ${getPlayerCorner(currentPlayerIndex) === 'bottomLeft' && isMyTurn && (gameState.turnAction === 'discard' || tiles.length === 15) ? 'active' : ''}`}
                        onDragOver={(e) => {
                            const isFirstTurn = tiles.length === 15 && gameState.turnAction === 'draw';
                            if (getPlayerCorner(currentPlayerIndex) === 'bottomLeft' && isMyTurn && (gameState.turnAction === 'discard' || isFirstTurn)) {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                e.currentTarget.classList.add('drag-over');
                            }
                        }}
                        onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag-over');
                        }}
                        onDrop={(e) => {
                            const isFirstTurn = tiles.length === 15 && gameState.turnAction === 'draw';
                            if (getPlayerCorner(currentPlayerIndex) === 'bottomLeft' && isMyTurn && (gameState.turnAction === 'discard' || isFirstTurn)) {
                                e.preventDefault();
                                e.currentTarget.classList.remove('drag-over');
                                try {
                                    const tileData = JSON.parse(e.dataTransfer.getData('tile'));
                                    handleTileMove(tileData.sourceIndex, -1);
                                } catch (error) {
                                    console.error('Taş bırakma sırasında hata:', error);
                                }
                            }
                        }}
                    />
                    <div
                        className={`tile-drop-zone bottom-right ${getPlayerCorner(currentPlayerIndex) === 'bottomRight' && isMyTurn && (gameState.turnAction === 'discard' || tiles.length === 15) ? 'active' : ''}`}
                        onDragOver={(e) => {
                            const isFirstTurn = tiles.length === 15 && gameState.turnAction === 'draw';
                            if (getPlayerCorner(currentPlayerIndex) === 'bottomRight' && isMyTurn && (gameState.turnAction === 'discard' || isFirstTurn)) {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                e.currentTarget.classList.add('drag-over');
                            }
                        }}
                        onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag-over');
                        }}
                        onDrop={(e) => {
                            const isFirstTurn = tiles.length === 15 && gameState.turnAction === 'draw';
                            if (getPlayerCorner(currentPlayerIndex) === 'bottomRight' && isMyTurn && (gameState.turnAction === 'discard' || isFirstTurn)) {
                                e.preventDefault();
                                e.currentTarget.classList.remove('drag-over');
                                try {
                                    const tileData = JSON.parse(e.dataTransfer.getData('tile'));
                                    handleTileMove(tileData.sourceIndex, -1);
                                } catch (error) {
                                    console.error('Taş bırakma sırasında hata:', error);
                                }
                            }
                        }}
                    />

                    {/* Atılan taşlar */}
                    <div className="discarded-tiles-container">
                        <div className="discarded-tiles top-left">
                            {discardedTiles.topLeft && discardedTiles.topLeft.length > 0 && (
                                <div className="discarded-tile topLeft">
                                    <Tile
                                        value={discardedTiles.topLeft[0].value}
                                        color={discardedTiles.topLeft[0].color}
                                        isDiscarded={true}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="discarded-tiles top-right">
                            {discardedTiles.topRight && discardedTiles.topRight.length > 0 && (
                                <div className="discarded-tile topRight">
                                    <Tile
                                        value={discardedTiles.topRight[0].value}
                                        color={discardedTiles.topRight[0].color}
                                        isDiscarded={true}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="discarded-tiles bottom-left">
                            {discardedTiles.bottomLeft && discardedTiles.bottomLeft.length > 0 && (
                                <div className="discarded-tile bottomLeft">
                                    <Tile
                                        value={discardedTiles.bottomLeft[0].value}
                                        color={discardedTiles.bottomLeft[0].color}
                                        isDiscarded={true}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="discarded-tiles bottom-right">
                            {discardedTiles.bottomRight && discardedTiles.bottomRight.length > 0 && (
                                <div className="discarded-tile bottomRight">
                                    <Tile
                                        value={discardedTiles.bottomRight[0].value}
                                        color={discardedTiles.bottomRight[0].color}
                                        isDiscarded={true}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center Area */}
                    <CenterArea
                        remainingTiles={gameState.deck ? gameState.deck.length : 0}
                        onDrawTile={() => isMyTurn && gameState.turnAction === 'draw' ? handleDrawTile(false) : null}
                        openTile={gameState.indicatorTile}
                        gameRound={gameState.round || 1}
                        canDrawTile={isMyTurn && gameState.turnAction === 'draw'}
                    />
                </div>
            </div>

            {/* Current Player's Tiles */}
            <TileHolder
                tiles={tiles}
                tilePositions={tilePositions}
                onTileClick={(tileIndex) => handleTileClick(tileIndex)}
                onTileMove={handleTileMove}
            />
        </div>
    );
}

export default Game; 