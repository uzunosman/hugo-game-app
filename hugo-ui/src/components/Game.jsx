import { useState, useEffect } from 'react';
import socketService from '../services/socketService';

function Game({ player, room }) {
    const [tiles, setTiles] = useState([]);
    const [gameState, setGameState] = useState(room.game);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedTile, setSelectedTile] = useState(null);

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
            }
        });

        return () => {
            // Component unmount olduğunda event listener'ları temizle
            socketService.socket.off('game:tiles');
            socketService.socket.off('game:tileDraw');
            socketService.socket.off('game:tileDiscard');
            socketService.socket.off('game:nextTurn');
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

    const handleDiscardTile = () => {
        if (!selectedTile) {
            setError('Lütfen atmak için bir taş seçin');
            return;
        }

        if (gameState.currentPlayerId !== player.id || gameState.turnAction !== 'discard') {
            setError('Şu anda taş atamazsınız');
            return;
        }

        setLoading(true);
        setError('');

        socketService.discardTile(selectedTile.id, (response) => {
            setLoading(false);

            if (response.success) {
                // Atılan taşı elinden çıkar
                setTiles(prevTiles => prevTiles.filter(tile => tile.id !== selectedTile.id));
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

    const isMyTurn = gameState.currentPlayerId === player.id;

    return (
        <div>
            <h2>Hugo Oyunu</h2>
            {error && <p style={{ color: 'red' }}>{error}</p>}

            <div>
                <h3>Oyun Bilgileri</h3>
                <p>Tur: {gameState.round}</p>
                <p>Hugo Turu: {gameState.isHugoRound ? 'Evet' : 'Hayır'}</p>
                <p>Sıra: {isMyTurn ? 'Senin Sıran' : 'Diğer Oyuncunun Sırası'}</p>
                <p>Aksiyon: {gameState.turnAction === 'draw' ? 'Taş Çek' : 'Taş At'}</p>
            </div>

            <div>
                <h3>Gösterge Taşı</h3>
                {gameState.indicatorTile ? (
                    <div>
                        Renk: {gameState.indicatorTile.color},
                        Değer: {gameState.indicatorTile.value}
                    </div>
                ) : (
                    <p>Gösterge taşı yok</p>
                )}
            </div>

            <div>
                <h3>Atılan Son Taş</h3>
                {gameState.discardPile && gameState.discardPile.length > 0 ? (
                    <div>
                        Renk: {gameState.discardPile[gameState.discardPile.length - 1].color},
                        Değer: {gameState.discardPile[gameState.discardPile.length - 1].value}
                    </div>
                ) : (
                    <p>Henüz atılan taş yok</p>
                )}
            </div>

            <div>
                <h3>Senin Taşların</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {tiles.map((tile) => (
                        <div
                            key={tile.id}
                            onClick={() => setSelectedTile(tile)}
                            style={{
                                padding: '10px',
                                margin: '5px',
                                border: '1px solid black',
                                backgroundColor: selectedTile && selectedTile.id === tile.id ? 'lightblue' : 'white'
                            }}
                        >
                            {tile.color} - {tile.value}
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <h3>Aksiyonlar</h3>
                {isMyTurn && gameState.turnAction === 'draw' && (
                    <>
                        <button
                            onClick={() => handleDrawTile(false)}
                            disabled={loading}
                        >
                            Desteden Çek
                        </button>

                        {gameState.discardPile && gameState.discardPile.length > 0 && (
                            <button
                                onClick={() => handleDrawTile(true)}
                                disabled={loading}
                            >
                                Atılan Taşı Al
                            </button>
                        )}
                    </>
                )}

                {isMyTurn && gameState.turnAction === 'discard' && (
                    <button
                        onClick={handleDiscardTile}
                        disabled={loading || !selectedTile}
                    >
                        Seçili Taşı At
                    </button>
                )}
            </div>
        </div>
    );
}

export default Game; 