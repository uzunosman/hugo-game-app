import { useState, useEffect, useCallback } from 'react';
import socketService from '../services/socketService';
import { flyTilesIn, flyToCorner, playerPanelRect } from '../utils/flyTiles';
import { reconcilePositions } from '../utils/tileHandlers';

const rackKey = (playerId) => `hugo.rack.${playerId}`;
const readRack = (playerId) => {
    try {
        const v = JSON.parse(sessionStorage.getItem(rackKey(playerId)));
        return Array.isArray(v) && v.length === 30 ? v : null;
    } catch { return null; }
};
const writeRack = (playerId, positions) => {
    if (positions.every(id => id === null)) return; // ilk boş ıstaka kayıtlı düzeni ezmesin
    try { sessionStorage.setItem(rackKey(playerId), JSON.stringify(positions)); } catch { /* depolama kapalı */ }
};

/**
 * Oyun durumu ve taşlarla ilgili state yönetimi için hook
 * @param {Object} player - Oyuncu bilgisi
 * @param {Object} room - Oda bilgisi
 * @returns {Object} - Oyun durumu ve ilgili fonksiyonlar
 */
const useGameState = (player, room) => {
    const [tiles, setTiles] = useState([]);
    const [gameState, setGameState] = useState(room.game);
    // Bildirimler sıraya girer, art arda gösterilir (ör. perine iki taş işlenince iki ceza bildirimi). '' yeni bildirim eklemez.
    // Bildirimler aynı anda ayrı baloncuklarda alt alta görünür (ör. perine iki taş işlenince iki ceza), her biri 3 sn sonra
    // kendiliğinden kaybolur. '' yeni bildirim eklemez.
    const [notices, setNotices] = useState([]);
    const setError = useCallback((msg) => {
        if (!msg) return;
        const id = `${Date.now()}-${Math.random()}`;
        setNotices(q => [...q, { id, msg }].slice(-5));
        setTimeout(() => setNotices(q => q.filter(n => n.id !== id)), 3000);
    }, []);
    const [loading, setLoading] = useState(false);
    const [selectedTile, setSelectedTile] = useState(null);
    const [timeLeft, setTimeLeft] = useState(60);
    const [tilePositions, setTilePositions] = useState(Array(30).fill(null));
    // Sayfa yenilenip oyuna dönülünce atılan taşlar atanın köşesinde yeniden kurulur (sunucu her taşın atanını tutar)
    const [discardedTiles, setDiscardedTiles] = useState(() => {
        const empty = { topLeft: [], topRight: [], bottomRight: [], bottomLeft: [] };
        const pile = room.game?.discardPile || [];
        const owners = room.game?.discardOwners || [];
        const last = room.game?.lastDiscardPlayerId;
        const me = room.players.findIndex(p => p.id === player.id);
        pile.forEach((tile, i) => {
            // Eski kayıtta atanı bilinmeyen taşlardan yalnızca en üstteki, son atanın köşesine konur
            const by = owners[i] ?? (i === pile.length - 1 ? last : null);
            const idx = room.players.findIndex(p => p.id === by);
            if (idx === -1) return;
            const corner = ['bottomRight', 'topRight', 'topLeft', 'bottomLeft'][(idx - me + 4) % 4];
            empty[corner].push({ ...tile, discardedBy: by });
        });
        return empty;
    });
    // En son taş atan oyuncunun ID'si (hangi köşeden çekilebileceğini belirlemek için)
    const [lastDiscardPlayerId, setLastDiscardPlayerId] = useState(room.game?.lastDiscardPlayerId || null);
    // Masadaki açık setler
    const [tableSets, setTableSets] = useState(room.game?.tableSets || []);
    // Bekleyen açılış: tek tek yere inen, açılış eşiğine henüz ulaşmamış perler (sırası gelen oyuncunun)
    const [pendingOpen, setPendingOpen] = useState(null); // { playerId, setIds, total, needed }
    // Biten ellerin sonuçları ve cezaları (tabelada ele tıklayınca gösterilir)
    const [roundHistory, setRoundHistory] = useState(room.game?.roundHistory || []);
    // Ceza kaydı: masadaki herkesin gördüğü son cezalar
    const [penaltyLog, setPenaltyLog] = useState([]);
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

    // Istaka dizilişi sekmede saklanır: sayfa yenilenince oyuncunun düzeni kaybolmaz
    useEffect(() => { writeRack(player.id, tilePositions); }, [player.id, tilePositions]);

    // El değişince ıstaka elle uyumlanır (bkz. reconcilePositions)
    useEffect(() => {
        setTilePositions(prev => reconcilePositions(prev, tiles));
    }, [tiles]);

    // Gelen taş listesini state'e ve pozisyonlara uygula
    const applyTiles = (tileList) => {
        setTiles(tileList);
        // Sayfa yenilendiyse aynı elin dizilişi geri gelir (yeni elde taş id'leri farklı olduğundan eşleşmez)
        const saved = readRack(player.id);
        if (saved && tileList.some(t => saved.includes(t.id))) {
            setTilePositions(reconcilePositions(saved, tileList));
            return;
        }
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
            setPendingOpen(null);
            console.log('Sıra değişti:', data);
            setGameState(prevState => ({
                ...prevState,
                currentPlayerId: data.currentPlayerId,
                turnAction: data.turnAction || 'draw'
            }));
        });

        // Deste sayısı sunucudan: süre dolup otomatik çekilen taş da sayılır (eskiden kendi ekranında düşmüyordu)
        const syncDeck = (n) => { if (typeof n === 'number') setGameState(prev => (prev.deckCount === n ? prev : { ...prev, deckCount: n })); };

        // Taş çekme işlemini dinle
        socketService.onTileDraw((response) => {
            if (response.success) {
                // Başka bir oyuncu taş çekti
                if (response.playerId !== player.id) {
                    console.log('Başka bir oyuncu taş çekti:', response.playerId, response.fromDiscard);

                    // Desteden çekildiyse deckCount'u düşür (sunucu sayıyı gönderiyorsa o esas)
                    if (typeof response.deckCount === 'number') syncDeck(response.deckCount);
                    else if (!response.fromDiscard) {
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
                syncDeck(response.deckCount);
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
                        flyToCorner(corner, playerPanelRect(response.playerId), discardedTile.id); // taş atanın kartından köşeye uçar
                    }
                }
            }
        });

        // El açma işlemini dinle
        socketService.onHandOpened((response) => {
            if (response.success) {
                setPendingOpen(response.pendingSetIds?.length
                    ? { playerId: response.playerId, setIds: response.pendingSetIds, total: response.pendingTotal, needed: response.needed }
                    : null);
                // Masadaki setlere yeni setleri ekle: taşlar açanın yerinden uçarak gelir (herkesin ekranında)
                if (response.newSets) {
                    flyTilesIn(response.newSets.flatMap(st => st.tiles.map(t => t.id)), response.playerId, player.id, true);
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
        // Masada henüz çizilmemiş taşlar yeni işlenendir (animasyonla gelir)
        // Açılış değeri aynı sırada indirilen per / kendi perine işlenen taşla artar
        const applyOpenState = (r) => {
            if (r.openState) setPlayerOpenStates(prev => ({ ...prev, [r.playerId]: { ...prev[r.playerId], ...r.openState } }));
        };
        const notOnTable = (tiles) => tiles.map(t => t.id).filter(id => !document.querySelector(`.open-set-tile[data-tile-id="${id}"]`));

        socketService.onTileAddedToSet((response) => {
            if (response.success && response.updatedSet) {
                applyOpenState(response);
                flyTilesIn(notOnTable(response.updatedSet.tiles), response.playerId, player.id);
                setTableSets(prev => prev.map(s =>
                    s.id === response.updatedSet.id ? response.updatedSet : s
                ));
                // Ceza ayrıca game:penalty ile gelir
            }
        });

        // Per indirme işlemini dinle — sadece masaya set eklenir, skor değişmez
        socketService.onPerDropped((response) => {
            if (response.success && response.newSets) {
                applyOpenState(response);
                // İndirilen per de, başkasının çiftlerine işlenen çift de indirenin yerinden uçarak gelir
                // Kendi per indirmen uçar; başkasının çiftlerine işlediğin çift (işleme) kendi ekranında uçmaz
                flyTilesIn(notOnTable(response.newSets.flatMap(st => st.tiles)), response.playerId, player.id, response.newSets.every(st => st.playerId === response.playerId));
                setTableSets(prev => [...prev, ...response.newSets]);
            }
        });

        // Tur sonu
        socketService.onRoundEnded((data) => {
            console.log('Tur sonu:', data);
            setRoundEndResults(data);
            if (data.history) setRoundHistory(prev => [...prev.filter(h => h.round !== data.history.round), data.history]);
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
        socketService.onPenalty(({ playerId, playerName, amount, reason, tag, tile, penaltyScore }) => {
            setPlayerOpenStates(prev => {
                const entries = [...(prev[playerId]?.penaltyEntries || [])];
                // Negatif tutar: iptal edilen cezanın kaydı silinir
                if (amount < 0) {
                    const i = entries.lastIndexOf(-amount);
                    if (i !== -1) entries.splice(i, 1);
                } else entries.push(amount);
                return { ...prev, [playerId]: { ...prev[playerId], penaltyScore, penaltyEntries: entries } };
            });
            setPenaltyLog(prev => [...prev, { id: `${Date.now()}-${prev.length}`, tag, playerName, tile, amount }].slice(-30));
            if (playerId === player.id) setError(`${reason}: ${amount > 0 ? '+' : ''}${amount} ceza`);
        });

        // Geri al: masadaki setler ve oyuncunun açık durumu bu sıranın başına döner
        socketService.onTurnUndone(({ playerId, tableSets: sets, openState, turnAction }) => {
            setPendingOpen(null);
            setTableSets(sets || []);
            setPlayerOpenStates(prev => ({ ...prev, [playerId]: { ...prev[playerId], ...openState } }));
            if (playerId === player.id && turnAction) setGameState(prev => ({ ...prev, turnAction }));
        });

        // İşleme / per açma: sıradaki oyuncunun süresi uzadı (sunucu sayacıyla aynı)
        socketService.onTurnExtended(({ seconds }) => setTimeLeft(t => t + (seconds || 0)));

        // Kustu: yandan alınan taş, atanın köşesine geri döner
        socketService.onTileReturned(({ playerId, toPlayerId, tile }) => {
            const corner = getCornerByPlayerId(toPlayerId);
            if (corner) {
                setDiscardedTiles(prev => ({
                    ...prev,
                    [corner]: [...(prev[corner] || []), { ...tile, discardedBy: toPlayerId, locked: playerId === player.id }]
                }));
            }
            setLastDiscardPlayerId(toPlayerId);
            if (playerId === player.id) {
                setTiles(prev => prev.filter(t => t.id !== tile.id));
                setTilePositions(prev => prev.map(id => (id === tile.id ? null : id)));
                setGameState(prev => ({ ...prev, turnAction: 'draw' }));
            }
        });

        // Bir oyuncunun bağlantısı koptu / geri geldi
        socketService.onPlayerConnection(({ playerId, connected }) => {
            setPlayerOpenStates(prev => ({ ...prev, [playerId]: { ...prev[playerId], connected } }));
        });

        // Süre doldu: sunucu bizim yerimize çekti ve en küçük taşı attı
        // Önce çekilen eklenir, sonra atılan çıkarılır: atılan, çekilen taşın kendisi olabilir
        socketService.onAutoPlayed(({ drawnTile, discardedTile, deckCount }) => {
            syncDeck(deckCount);
            setTiles(prev => [...prev, ...(drawnTile ? [drawnTile] : [])].filter(t => t.id !== discardedTile.id));
            setTilePositions(prev => {
                const next = prev.map(id => (id === discardedTile.id ? null : id));
                if (drawnTile && drawnTile.id !== discardedTile.id && !next.includes(drawnTile.id)) {
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
            setPendingOpen(null);
            console.log('Yeni tur başladı:', data);

            const g = data.game;
            setGameState(g);
            setTableSets(g.tableSets || []);
            setDiscardedTiles({ topLeft: [], topRight: [], bottomRight: [], bottomLeft: [] });
            setLastDiscardPlayerId(null);
            setSelectedTile(null);
            setPenaltyLog([]); // el sonu tabelası açık kalır; oyuncu kendisi kapatır

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
            socketService.offTileReturned();
            socketService.offTurnUndone();
            socketService.offTurnExtended();
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
        // Sırası gelen her oyuncu için geri sayım (sunucu süresiyle aynı 60 sn): kart halkası herkeste akar
        if (gameState.currentPlayerId) {
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
        setError,
        notices,
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
        pendingOpen,
        playerOpenStates,
        setPlayerOpenStates,
        roundEndResults,
        setRoundEndResults,
        penaltyLog,
        roundHistory
    };
};

export default useGameState; 