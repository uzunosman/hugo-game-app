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
    // Sayfa yenilenip oyuna dönülünce son atılan taş, atanın köşesinde yeniden gösterilir
    // shortcut: yalnızca son taş geri kurulur (köşeler zaten sadece son taşı gösterir); tam geçmiş gerekirse sunucu köşe başına yığın göndermeli
    const [discardedTiles, setDiscardedTiles] = useState(() => {
        const empty = { topLeft: [], topRight: [], bottomRight: [], bottomLeft: [] };
        const pile = room.game?.discardPile || [];
        const by = room.game?.lastDiscardPlayerId;
        if (!pile.length || !by) return empty;
        const rel = (room.players.findIndex(p => p.id === by) - room.players.findIndex(p => p.id === player.id) + 4) % 4;
        const corner = ['bottomRight', 'topRight', 'topLeft', 'bottomLeft'][rel];
        return { ...empty, [corner]: [{ ...pile[pile.length - 1], discardedBy: by }] };
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
            states[p.id] = { isOpen: p.isOpen || false, openedTotal: p.openedTotal || 0, lastOpenedValue: p.lastOpenedValue || 0, penaltyScore: p.penaltyScore || 0, penaltyEntries: p.penaltyEntries || [], roundScores: p.roundScores || [], totalScore: p.totalScore || 0, per100PlusCount: p.per100PlusCount || 0, connected: p.connected !== false, openedWithPairs: !!p.openedWithPairs };
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
                        ...prev[response.playerId], // ceza, puan geçmişi ve bağlantı bilgisi korunur
                        isOpen: response.isOpen,
                        openedWithPairs: !!response.openedWithPairs,
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
            // Tabela: el puanları, toplam ve yıldızlar
            setPlayerOpenStates(prev => {
                const next = { ...prev };
                (data.players || []).forEach(p => {
                    next[p.id] = {
                        ...next[p.id],
                        roundScores: p.roundScores || [],
                        totalScore: p.totalScore || 0,
                        per100PlusCount: p.per100PlusCount || 0
                    };
                });
                return next;
            });
        });

        // Anlık ceza (işlek taş, kullanılmayan yandan taş, yetersiz açma)
        socketService.onPenalty(({ playerId, amount, reason, penaltyScore }) => {
            setPlayerOpenStates(prev => ({
                ...prev,
                [playerId]: {
                    ...prev[playerId],
                    penaltyScore,
                    penaltyEntries: [...(prev[playerId]?.penaltyEntries || []), amount]
                }
            }));
            if (playerId === player.id) setError(`${reason}: +${amount} ceza`);
        });

        // Bir oyuncunun bağlantısı koptu / geri geldi
        socketService.onPlayerConnection(({ playerId, connected }) => {
            setPlayerOpenStates(prev => ({ ...prev, [playerId]: { ...prev[playerId], connected } }));
        });

        // Süre doldu: sunucu bizim yerimize çekti ve en küçük taşı attı
        socketService.onAutoPlayed(({ drawnTile, discardedTile }) => {
            setTiles(prev => [...prev.filter(t => t.id !== discardedTile.id), ...(drawnTile ? [drawnTile] : [])]);
            setTilePositions(prev => {
                const next = prev.map(id => (id === discardedTile.id ? null : id));
                if (drawnTile && !next.includes(drawnTile.id)) {
                    const empty = next.indexOf(null);
                    if (empty !== -1) next[empty] = drawnTile.id;
                }
                return next;
            });
            setDiscardedTiles(prev => ({
                ...prev,
                bottomRight: [...(prev.bottomRight || []), { ...discardedTile, discardedBy: player.id }]
            }));
            setSelectedTile(null);
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
                    per100PlusCount: p.per100PlusCount || 0,
                    connected: p.connected !== false,
                    openedWithPairs: !!p.openedWithPairs
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
            socketService.offPlayerConnection();
            socketService.offPenalty();
            socketService.offAutoPlayed();
        };
        // Dinleyiciler oyuncu başına bir kez kurulur; room.players oyun boyunca değişmez
        // eslint-disable-next-line react-hooks/exhaustive-deps
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