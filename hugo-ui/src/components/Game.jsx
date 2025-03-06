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

    useEffect(() => {
        // Taşları dinle
        socketService.onGameTiles((response) => {
            if (response.success) {
                setTiles(response.tiles);
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

    const handleTileClick = (playerIndex, tileIndex) => {
        if (playerIndex === getCurrentPlayerIndex() && gameState.turnAction === 'discard') {
            handleDiscardTile(tileIndex);
        }
    };

    const handleTileMove = (sourceIndex, targetIndex) => {
        // Taşları yeniden düzenle
        if (sourceIndex !== targetIndex && targetIndex !== -1) {
            const newTiles = [...tiles];
            const [movedTile] = newTiles.splice(sourceIndex, 1);
            newTiles.splice(targetIndex, 0, movedTile);
            setTiles(newTiles);
        }
    };

    // Oyuncunun köşesini belirle
    const getPlayerCorner = (playerIndex) => {
        const cornerMap = {
            0: 'topLeft',     // 3. oyuncu
            1: 'topRight',    // 2. oyuncu
            2: 'bottomRight', // 1. oyuncu (kendimiz)
            3: 'bottomLeft'   // 4. oyuncu
        };
        return cornerMap[playerIndex];
    };

    // Mevcut oyuncunun indeksini bul
    const getCurrentPlayerIndex = () => {
        return room.players.findIndex(p => p.id === gameState.currentPlayerId);
    };

    // Oyuncuları düzenle (kendimiz her zaman altta olacak şekilde)
    const getOrderedPlayers = () => {
        const myIndex = room.players.findIndex(p => p.id === player.id);
        if (myIndex === -1) return room.players;

        // Kendimizi 2. indekse (alt) yerleştir
        const orderedPlayers = [...room.players];
        const myPlayer = orderedPlayers.splice(myIndex, 1)[0];
        orderedPlayers.splice(2, 0, myPlayer);
        return orderedPlayers;
    };

    const players = getOrderedPlayers();
    const currentPlayerIndex = getCurrentPlayerIndex();
    const isMyTurn = gameState.currentPlayerId === player.id;

    // Oyuncu taşlarını hazırla (sadece kendi taşlarımızı biliyoruz)
    const playerTiles = Array(players.length).fill([]);
    const myOrderedIndex = players.findIndex(p => p.id === player.id);
    playerTiles[myOrderedIndex] = tiles;

    // Atılan taşları köşelere göre düzenle
    const discardedTiles = {
        topLeft: [],
        topRight: [],
        bottomRight: [],
        bottomLeft: []
    };

    if (gameState.discardPile && gameState.discardPile.length > 0) {
        const lastTile = gameState.discardPile[gameState.discardPile.length - 1];
        const corner = getPlayerCorner(currentPlayerIndex);
        discardedTiles[corner] = [lastTile];
    }

    // Taş çekme durumunu takip et
    const hasDrawnTile = {};
    players.forEach((p, index) => {
        hasDrawnTile[index] = p.id === gameState.currentPlayerId && gameState.turnAction === 'discard';
    });

    return (
        <>
            {error && <div style={{ color: 'red', textAlign: 'center', padding: '10px' }}>{error}</div>}

            {/* Player Panels */}
            {players.map((p, index) => (
                <PlayerPanel
                    key={index}
                    name={p.name}
                    score={0}
                    position={index === 2 ? 'current-player' : ['top', 'right', 'left'][index === 3 ? 2 : index]}
                    isCurrentPlayer={p.id === gameState.currentPlayerId}
                    timeLeft={p.id === gameState.currentPlayerId ? timeLeft : null}
                />
            ))}

            <div className="game-board">
                <div className="board-content">
                    {/* Köşe Bırakma Alanları */}
                    <div className={`tile-drop-zone top-left ${getPlayerCorner(currentPlayerIndex) === 'topLeft' ? 'active' : ''}`} />
                    <div className={`tile-drop-zone top-right ${getPlayerCorner(currentPlayerIndex) === 'topRight' ? 'active' : ''}`} />
                    <div className={`tile-drop-zone bottom-left ${getPlayerCorner(currentPlayerIndex) === 'bottomLeft' ? 'active' : ''}`} />
                    <div className={`tile-drop-zone bottom-right ${getPlayerCorner(currentPlayerIndex) === 'bottomRight' ? 'active' : ''}`} />

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
                        onDrawTile={() => handleDrawTile(false)}
                        openTile={gameState.indicatorTile}
                        gameRound={gameState.round || 1}
                        canDrawTile={isMyTurn && gameState.turnAction === 'draw'}
                    />
                </div>
            </div>

            {/* Current Player's Tiles */}
            {isMyTurn && (
                <TileHolder
                    tiles={tiles}
                    onTileClick={(tileIndex) => handleTileClick(myOrderedIndex, tileIndex)}
                    onTileMove={handleTileMove}
                />
            )}
        </>
    );
}

export default Game; 