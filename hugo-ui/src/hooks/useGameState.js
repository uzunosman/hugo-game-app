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
    // En son taş atan oyuncunun ID'si (hangi köşeden çekilebileceğini belirlemek için)
    const [lastDiscardPlayerId, setLastDiscardPlayerId] = useState(room.game?.lastDiscardPlayerId || null);
    // Masadaki açık setler
    const [tableSets, setTableSets] = useState(room.game?.tableSets || []);
    // Tur sonu sonuçları (null = tur devam ediyor)
    const [roundEndResults, setRoundEndResults] = useState(null);
    // Oyuncu açık durumları { playerId: { isOpen, openedTotal, lastOpenedValue } }
    const [playerOpenStates, setPlayerOpenStates] = useState(() => {
        const states = {};
        room.players.forEach(p => {
            states[p.id] = { isOpen: p.isOpen || false, openedTotal: p.openedTotal || 0, lastOpenedValue: p.lastOpenedValue || 0, penaltyScore: p.penaltyScore || 0, penaltyEntries: p.penaltyEntries || [] };
        });
        return states;
    });

    // Gelen taş listesini state'e ve pozisyonlara uygula
    const applyTiles = (tileList) => {
        setTiles(tileList);
        const newTilePositions = Array(30).fill(null);
        tileList.forEach((tile, index) => {
            if (index < 30) {
                newTilePositions[index] = tile.id;
            }
        });
        setTilePositions(newTilePositions);
    };

    useEffect(() => {
        // Taşları dinle
        socketService.onGameTiles((response) => {
            if (response.success) {
                applyTiles(response.tiles);
            } else {
                setError(response.error || 'Taşlar alınırken bir hata oluştu');
            }
        });

        // game:tiles event'i mount öncesi gelmiş olabilir (race condition).
        // Oyun zaten başlamışsa sunucudan taşları talep et.
        if (room.game && room.status === 'playing') {
            socketService.requestTiles(player.id, (response) => {
                if (response.success && response.tiles?.length > 0) {
                    applyTiles(response.tiles);
                }
            });
        }

        // Oyun durumunu dinle — sadece ilgili alanları güncelle
        socketService.onNextTurn((data) => {
            console.log('Sıra değişti:', data);
            setGameState(prevState => ({
                ...prevState,
                currentPlayerId: data.currentPlayerId,
                turnAction: data.turnAction || 'draw'
            }));
        });

        // Taş çekme işlemini dinle
        socketService.onTileDraw((response) => {
            if (response.success) {
                // Başka bir oyuncu taş çekti
                if (response.playerId !== player.id) {
                    console.log('Başka bir oyuncu taş çekti:', response.playerId, response.fromDiscard);

                    // Desteden çekildiyse deckCount'u düşür
                    if (!response.fromDiscard) {
                        setGameState(prevState => ({
                            ...prevState,
                            deckCount: Math.max(0, (prevState.deckCount ?? 0) - 1)
                        }));
                    }

                    // Atılan taşlardan çekildiyse, o oyuncunun köşesinden son taşı kaldır
                    if (response.fromDiscard && response.fromDiscardOfPlayerId) {
                        const corner = getCornerByPlayerId(response.fromDiscardOfPlayerId);
                        if (corner) {
                            setDiscardedTiles(prevDiscardedTiles => {
                                const newDiscardedTiles = { ...prevDiscardedTiles };
                                if (newDiscardedTiles[corner].length > 0) {
                                    newDiscardedTiles[corner] = newDiscardedTiles[corner].slice(0, -1);
                                }
                                return newDiscardedTiles;
                            });
                        }
                    }
                }
            }
        });

        // Taş atma işlemini dinle
        socketService.onTileDiscard((response) => {
            if (response.success) {
                // En son atan oyuncuyu güncelle (kendimiz dahil)
                setLastDiscardPlayerId(response.playerId);

                // Başka bir oyuncu taş attıysa köşeye ekle (kendi taşımızı handler'da zaten ekliyoruz)
                if (response.playerId !== player.id) {
                    console.log('Başka bir oyuncu taş attı:', response.playerId, response.tile);

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

        // El açma işlemini dinle
        socketService.onHandOpened((response) => {
            if (response.success) {
                // Masadaki setlere yeni setleri ekle
                if (response.newSets) {
                    setTableSets(prev => [...prev, ...response.newSets]);
                }
                // Oyuncu açık durumunu güncelle
                setPlayerOpenStates(prev => ({
                    ...prev,
                    [response.playerId]: {
                        isOpen: response.isOpen,
                        openedTotal: response.openedTotal,
                        lastOpenedValue: response.lastOpenedValue
                    }
                }));
                // İlk turda direkt açan oyuncu için turnAction: discard (tekrar taş çekemesin)
                if (response.turnAction) {
                    setGameState(prev => ({ ...prev, turnAction: response.turnAction }));
                }
            }
        });

        // İşleme işlemini dinle — masadaki set güncellenir, ceza yazılır
        socketService.onTileAddedToSet((response) => {
            if (response.success && response.updatedSet) {
                setTableSets(prev => prev.map(s =>
                    s.id === response.updatedSet.id ? response.updatedSet : s
                ));
                // Ceza varsa oyuncu state'ini güncelle
                if (response.penalty) {
                    setPlayerOpenStates(prev => {
                        const target = prev[response.penalty.targetPlayerId];
                        if (!target) return prev;
                        return {
                            ...prev,
                            [response.penalty.targetPlayerId]: {
                                ...target,
                                penaltyScore: (target.penaltyScore || 0) + response.penalty.amount,
                                penaltyEntries: [...(target.penaltyEntries || []), response.penalty.amount]
                            }
                        };
                    });
                }
            }
        });

        // Per indirme işlemini dinle — sadece masaya set eklenir, skor değişmez
        socketService.onPerDropped((response) => {
            if (response.success && response.newSets) {
                setTableSets(prev => [...prev, ...response.newSets]);
            }
        });

        // Tur sonu
        socketService.onRoundEnded((data) => {
            console.log('Tur sonu:', data);
            setRoundEndResults(data);
        });

        // Yeni tur başladı — tüm state'leri sıfırla ve yeniden yükle
        socketService.onRoundStarted((data) => {
            console.log('Yeni tur başladı:', data);

            const g = data.game;
            setGameState(g);
            setTableSets(g.tableSets || []);
            setDiscardedTiles({ topLeft: [], topRight: [], bottomRight: [], bottomLeft: [] });
            setLastDiscardPlayerId(null);
            setSelectedTile(null);

            // Oyuncu açık durumlarını sıfırla
            const states = {};
            g.players.forEach(p => {
                states[p.id] = {
                    isOpen: p.isOpen || false,
                    openedTotal: p.openedTotal || 0,
                    lastOpenedValue: p.lastOpenedValue || 0,
                    penaltyScore: p.penaltyScore || 0,
                    penaltyEntries: p.penaltyEntries || [],
                    roundScores: p.roundScores || [],
                    totalScore: p.totalScore || 0,
                    per100PlusCount: p.per100PlusCount || 0
                };
            });
            setPlayerOpenStates(states);

            // Taşları server'dan iste
            socketService.requestTiles(player.id, (response) => {
                if (response.success && response.tiles?.length > 0) {
                    applyTiles(response.tiles);
                }
            });
        });

        // Temizleme işlemi
        return () => {
            socketService.offGameTiles();
            socketService.offNextTurn();
            socketService.offTileDraw();
            socketService.offTileDiscard();
            socketService.offHandOpened();
            socketService.offTileAddedToSet();
            socketService.offPerDropped();
            socketService.offRoundEnded();
            socketService.offRoundStarted();
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
        setDiscardedTiles,
        lastDiscardPlayerId,
        setLastDiscardPlayerId,
        tableSets,
        setTableSets,
        playerOpenStates,
        setPlayerOpenStates,
        roundEndResults,
        setRoundEndResults
    };
};

export default useGameState; 