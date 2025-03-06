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
                // Atılan taşı göster
                setGameState(prevState => ({
                    ...prevState,
                    discardPile: [...(prevState.discardPile || []), response.tile]
                }));
            }
        });

        // Sıra değişimini dinle
        socketService.onNextTurn((response) => {
            if (response.success) {
                // Oyuncuların sıra durumunu güncelle
                setGameState(prevState => ({
                    ...prevState,
                    currentPlayerId: response.playerId
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

        setLoading(true);
        setError('');

        socketService.drawTile(fromDiscard, (response) => {
            setLoading(false);

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
            setError('Lütfen atmak için bir taş seçin');
            return;
        }

        if (gameState.currentPlayerId !== player.id || gameState.turnAction !== 'discard') {
            setError('Şu anda taş atamazsınız');
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

                // Oyun durumunu güncelle
                setGameState(prevState => ({
                    ...prevState,
                    turnAction: 'draw'
                }));
            } else {
                setError(response.error || 'Taş atılırken bir hata oluştu');
            }
        });
    };

    const handleTileMove = (sourceIndex, targetIndex) => {
        console.log(`handleTileMove: ${sourceIndex} -> ${targetIndex}`);

        // Geçersiz indeksleri kontrol et
        if (sourceIndex < 0 || sourceIndex >= 30 || targetIndex < 0 || targetIndex >= 30) {
            console.error('Geçersiz indeks:', sourceIndex, targetIndex);
            return;
        }

        // Eğer targetIndex -1 ise, taş köşeye bırakılmıştır (taş atma işlemi)
        if (targetIndex === -1) {
            // Sadece sırası gelen oyuncu ve taş atma aksiyonu varsa taş atabilir
            if (gameState.currentPlayerId !== player.id || gameState.turnAction !== 'discard') {
                setError('Şu anda taş atamazsınız');
                return;
            }

            // Atılacak taşı belirle
            const tileId = tilePositions[sourceIndex];
            if (!tileId) {
                setError('Geçerli bir taş seçmelisiniz');
                return;
            }

            const tileToDiscard = tiles.find(t => t.id === tileId);
            if (!tileToDiscard) {
                setError('Geçerli bir taş seçmelisiniz');
                return;
            }

            // Taşı at
            handleDiscardTile(tiles.findIndex(t => t.id === tileId));

            // Pozisyonu güncelle
            const newPositions = [...tilePositions];
            newPositions[sourceIndex] = null;
            setTilePositions(newPositions);

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
        console.log('Eski pozisyonlar:', JSON.parse(JSON.stringify(newPositions)));

        // Önce kaynak konumu boşalt (önemli: taşı geçici olarak saklıyoruz)
        newPositions[sourceIndex] = null;

        // Hedef konumda taş yoksa, basitçe taşı
        if (newPositions[targetIndex] === null) {
            newPositions[targetIndex] = tileId;
        } else {
            // Hedef konumda taş varsa, kaydırma işlemi yap

            // Önce tercih edilen yönü belirle (sağa veya sola)
            const moveRight = targetIndex > sourceIndex;

            // İlk deneme için tercih edilen yön
            let canShift = false;
            let shiftDirection = moveRight ? 1 : -1;

            // Kaydırma için boş yer bul
            let emptyIndex = -1;

            // İlk yönde kaydırma dene
            for (let i = targetIndex; moveRight ? (i < 30) : (i >= 0); i += shiftDirection) {
                if (newPositions[i] === null) {
                    emptyIndex = i;
                    canShift = true;
                    break;
                }
            }

            // Eğer ilk yönde kaydırma mümkün değilse, diğer yönü dene
            if (!canShift) {
                shiftDirection = moveRight ? -1 : 1;

                for (let i = targetIndex; moveRight ? (i >= 0) : (i < 30); i += shiftDirection) {
                    if (i !== sourceIndex && newPositions[i] === null) {
                        emptyIndex = i;
                        canShift = true;
                        break;
                    }
                }
            }

            if (canShift) {
                // Kaydırma işlemi yap
                if (shiftDirection === 1) {
                    // Sağa kaydır
                    for (let i = emptyIndex; i > targetIndex; i--) {
                        newPositions[i] = newPositions[i - 1];
                    }
                } else {
                    // Sola kaydır
                    for (let i = emptyIndex; i < targetIndex; i++) {
                        newPositions[i] = newPositions[i + 1];
                    }
                }

                // Hedef konuma sürüklenen taşı yerleştir
                newPositions[targetIndex] = tileId;
            } else {
                // Kaydırma mümkün değilse, işlem yapma
                console.error('Kaydırma için boş yer bulunamadı');
                // Kaynak konumu geri yükle
                newPositions[sourceIndex] = tileId;
                return;
            }
        }

        console.log('Yeni pozisyonlar:', JSON.parse(JSON.stringify(newPositions)));

        // Pozisyonları güncelle
        setTilePositions(newPositions);
    };

    const handleTileClick = (tileIndex) => {
        // Oyuncu her zaman taşlarını düzenleyebilir
        // Ancak sadece sırası geldiğinde ve taş atma aksiyonu varsa taş atabilir
        if (gameState.currentPlayerId === player.id && gameState.turnAction === 'discard') {
            const tileId = tilePositions[tileIndex];
            if (tileId) {
                const tileToDiscard = tiles.find(t => t.id === tileId);
                if (tileToDiscard) {
                    handleDiscardTile(tiles.findIndex(t => t.id === tileId));

                    // Pozisyonu güncelle
                    const newPositions = [...tilePositions];
                    newPositions[tileIndex] = null;
                    setTilePositions(newPositions);
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

    // Atılan taşları köşelere göre düzenle
    const discardedTiles = {
        topLeft: [],
        topRight: [],
        bottomRight: [],
        bottomLeft: []
    };

    if (gameState.discardPile && gameState.discardPile.length > 0) {
        // Son taşı atan oyuncunun indeksini bul
        const lastTile = gameState.discardPile[gameState.discardPile.length - 1];

        // Taşı atan oyuncunun köşesine yerleştir
        // Her oyuncu sağındaki köşeye atar
        players.forEach((p, index) => {
            if (p.id === lastTile.playerId) {
                const corner = getPlayerCorner(index);
                discardedTiles[corner] = [lastTile];
            }
        });
    }

    // Taş çekme durumunu takip et
    const hasDrawnTile = {};
    players.forEach((p, index) => {
        hasDrawnTile[index] = p.id === gameState.currentPlayerId && gameState.turnAction === 'discard';
    });

    return (
        <div className="game-container">
            {error && <div style={{ color: 'red', textAlign: 'center', padding: '10px' }}>{error}</div>}

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
                        className={`tile-drop-zone top-left ${getPlayerCorner(currentPlayerIndex) === 'topLeft' ? 'active' : ''}`}
                        onDragOver={(e) => {
                            if (getPlayerCorner(currentPlayerIndex) === 'topLeft') {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                e.currentTarget.classList.add('drag-over');
                            }
                        }}
                        onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag-over');
                        }}
                        onDrop={(e) => {
                            if (getPlayerCorner(currentPlayerIndex) === 'topLeft') {
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
                        className={`tile-drop-zone top-right ${getPlayerCorner(currentPlayerIndex) === 'topRight' ? 'active' : ''}`}
                        onDragOver={(e) => {
                            if (getPlayerCorner(currentPlayerIndex) === 'topRight') {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                e.currentTarget.classList.add('drag-over');
                            }
                        }}
                        onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag-over');
                        }}
                        onDrop={(e) => {
                            if (getPlayerCorner(currentPlayerIndex) === 'topRight') {
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
                        className={`tile-drop-zone bottom-left ${getPlayerCorner(currentPlayerIndex) === 'bottomLeft' ? 'active' : ''}`}
                        onDragOver={(e) => {
                            if (getPlayerCorner(currentPlayerIndex) === 'bottomLeft') {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                e.currentTarget.classList.add('drag-over');
                            }
                        }}
                        onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag-over');
                        }}
                        onDrop={(e) => {
                            if (getPlayerCorner(currentPlayerIndex) === 'bottomLeft') {
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
                        className={`tile-drop-zone bottom-right ${getPlayerCorner(currentPlayerIndex) === 'bottomRight' ? 'active' : ''}`}
                        onDragOver={(e) => {
                            if (getPlayerCorner(currentPlayerIndex) === 'bottomRight') {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                e.currentTarget.classList.add('drag-over');
                            }
                        }}
                        onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag-over');
                        }}
                        onDrop={(e) => {
                            if (getPlayerCorner(currentPlayerIndex) === 'bottomRight') {
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
                            {discardedTiles.topLeft.length > 0 && (
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
                            {discardedTiles.topRight.length > 0 && (
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
                            {discardedTiles.bottomLeft.length > 0 && (
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
                            {discardedTiles.bottomRight.length > 0 && (
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