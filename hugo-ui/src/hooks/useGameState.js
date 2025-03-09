import { useState, useEffect } from 'react';
import socketService from '../services/socketService';

/**
 * Oyun durumu ve taşlarla ilgili state yönetimi için hook
 * @param {Object} player - Oyuncu bilgisi
 * @param {Object} room - Oda bilgisi
 * @returns {Object} - Oyun durumu ve ilgili fonksiyonlar
 */
const useGameState = (player, room) => {
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

                // Taşları ıstakaya yerleştir
                const newTilePositions = Array(30).fill(null);
                response.tiles.forEach((tile, index) => {
                    // İlk 15 taşı ilk satıra, sonraki taşları ikinci satıra yerleştir
                    if (index < 30) {
                        newTilePositions[index] = tile.id;
                    }
                });
                setTilePositions(newTilePositions);
            } else {
                setError(response.error || 'Taşlar alınırken bir hata oluştu');
            }
        });

        // Oyun durumunu dinle
        socketService.onNextTurn((newGameState) => {
            setGameState(newGameState);
        });

        // Taş çekme işlemini dinle
        socketService.onTileDraw((response) => {
            if (response.success) {
                // Başka bir oyuncu taş çekti
                if (response.playerId !== player.id) {
                    console.log('Başka bir oyuncu taş çekti:', response.playerId);
                }
            }
        });

        // Taş atma işlemini dinle
        socketService.onTileDiscard((response) => {
            if (response.success) {
                // Başka bir oyuncu taş attı
                if (response.playerId !== player.id) {
                    console.log('Başka bir oyuncu taş attı:', response.playerId, response.tile);

                    // Atılan taşı köşeye ekle
                    const discardedTile = response.tile;
                    const corner = getCornerByPlayerId(response.playerId);

                    if (corner) {
                        setDiscardedTiles(prevDiscardedTiles => {
                            const newDiscardedTiles = { ...prevDiscardedTiles };
                            newDiscardedTiles[corner] = [
                                ...(newDiscardedTiles[corner] || []),
                                { ...discardedTile, discardedBy: response.playerId }
                            ];
                            return newDiscardedTiles;
                        });
                    }
                }
            }
        });

        // Temizleme işlemi
        return () => {
            socketService.offGameTiles();
            socketService.offNextTurn();
            socketService.offTileDraw();
            socketService.offTileDiscard();
        };
    }, [player.id]);

    // Oyuncunun ID'sine göre köşeyi belirle
    const getCornerByPlayerId = (playerId) => {
        const playerIndex = room.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return null;

        const myIndex = room.players.findIndex(p => p.id === player.id);
        if (myIndex === -1) return null;

        // Göreceli indeksi hesapla
        const relativeIndex = (playerIndex - myIndex + 4) % 4;

        const cornerMap = {
            0: 'bottomRight', // Kendimiz
            1: 'topRight',    // Sağımızdaki oyuncu
            2: 'topLeft',     // Karşımızdaki oyuncu
            3: 'bottomLeft'   // Solumuzdaki oyuncu
        };

        return cornerMap[relativeIndex];
    };

    // Süreyi başlat
    useEffect(() => {
        let timer;
        if (gameState.currentPlayerId === player.id) {
            setTimeLeft(60);
            timer = setInterval(() => {
                setTimeLeft(prevTime => {
                    if (prevTime <= 1) {
                        clearInterval(timer);
                        return 0;
                    }
                    return prevTime - 1;
                });
            }, 1000);
        }

        return () => {
            clearInterval(timer);
        };
    }, [gameState.currentPlayerId, player.id]);

    return {
        tiles,
        setTiles,
        gameState,
        setGameState,
        error,
        setError,
        loading,
        setLoading,
        selectedTile,
        setSelectedTile,
        timeLeft,
        setTimeLeft,
        tilePositions,
        setTilePositions,
        discardedTiles,
        setDiscardedTiles
    };
};

export default useGameState; 