import React, { useEffect, useState } from 'react';
import Tile from '../Tile/Tile';

/**
 * Köşelerdeki atma alanları bileşeni
 * @param {Object} props - Bileşen özellikleri
 * @param {Object} props.discardedTiles - Atılan taşlar
 * @param {Function} props.handleDrawDiscardedTile - Atılan taşı çekme işleyicisi
 * @param {Boolean} props.isMyTurn - Oyuncunun sırası mı
 * @param {String} props.turnAction - Mevcut aksiyon (draw/discard)
 * @param {String} props.playerCorner - Oyuncunun köşesi
 * @param {Number} props.tilesLength - Oyuncunun taş sayısı
 * @param {Number} props.currentPlayerIndex - Mevcut oyuncunun indeksi
 * @returns {JSX.Element} - Köşe atma alanları bileşeni
 */
const DiscardAreas = ({
    discardedTiles,
    handleDrawDiscardedTile,
    isMyTurn,
    turnAction,
    playerCorner,
    tilesLength,
    lastDiscardCorner,
    hasSelection,
    onTapDiscard,
    kustuCorner,
    onKustu,
    dragOverCorner, // sürüklenen ıstaka taşı bu köşenin üstünde (useBoardDrag)
    canSeeHistory // çift açan oyuncu köşeye tıklayınca o köşeye atılmış eski taşları görür
}) => {
    const [historyCorner, setHistoryCorner] = useState(null);
    // Geçmiş açıkken başka bir yere tıklanınca kapanır
    useEffect(() => {
        if (!historyCorner) return;
        const close = (e) => { if (!e.target.closest?.(`[data-corner="${historyCorner}"]`)) setHistoryCorner(null); };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, [historyCorner]);
    useEffect(() => { if (!canSeeHistory) setHistoryCorner(null); }, [canSeeHistory]);
    const toggleHistory = (corner) => {
        if (canSeeHistory && (discardedTiles[corner] || []).length > 1) setHistoryCorner(c => (c === corner ? null : corner));
    };

    // Bir köşenin interaktif (pointer-events: all) olup olmayacağını belirle:
    // 1. Kendi köşesi + discard aşaması → taş atma hedefi
    // 2. lastDiscardCorner + draw aşaması → önceki oyuncunun taşını alma
    const isCornerActive = (corner) => {
        // İlk oyuncunun ilk el kuralı: 15 taş + draw → kendi köşesi atma için aktif
        const isFirstHand = tilesLength === 15 && turnAction === 'draw';
        const canDiscard = playerCorner === corner && isMyTurn && (turnAction === 'discard' || isFirstHand);
        const canPickUp = corner === lastDiscardCorner && isMyTurn && turnAction === 'draw';
        return canDiscard || canPickUp;
    };

    // Atılan taşı sürükleyebilme / alabilme koşulu:
    // - Sıradaki oyuncu olmalı
    // - Taş çekme aşamasında (draw) olmalı
    // - Sadece bir önceki oyuncunun köşesindeki son taş alınabilir
    const canTakeDiscardedTile = (corner, tileIndex) => {
        if (!isMyTurn || turnAction !== 'draw') return false;
        if (corner !== lastDiscardCorner) return false;
        // Sadece köşedeki en son (üstteki) taş alınabilir
        const cornerTiles = discardedTiles[corner] || [];
        // İşlek atılan / kusulan taş alınamaz
        return tileIndex === cornerTiles.length - 1 && !cornerTiles[tileIndex]?.locked;
    };

    // Atılan taşa tıklama işleyicisi
    const handleDiscardedTileClick = (corner, tileIndex) => {
        if (canTakeDiscardedTile(corner, tileIndex)) {
            handleDrawDiscardedTile(corner, tileIndex);
        } else {
            toggleHistory(corner);
        }
    };

    // Her köşe için yalnızca son atılan taşı render et
    const renderCorner = (corner, positionClass) => {
        const tiles = discardedTiles[corner] || [];
        const lastTile = tiles.length > 0 ? tiles[tiles.length - 1] : null;
        const lastIndex = tiles.length - 1;
        const canDrag = lastTile ? canTakeDiscardedTile(corner, lastIndex) : false;

        return (
            <div
                className={`tile-drop-zone ${positionClass} ${isCornerActive(corner) ? 'active' : ''} ${dragOverCorner === corner && (corner === playerCorner || corner === kustuCorner) ? 'drag-over' : ''}`}
                data-corner={corner}
                onClick={(e) => {
                    // Dokunmatik: seçili taş varken kendi köşene dokun → at
                    const isFirstHand = tilesLength === 15 && turnAction === 'draw';
                    if (corner === playerCorner && hasSelection && isMyTurn && (turnAction === 'discard' || isFirstHand)) onTapDiscard?.();
                    else if (e.target === e.currentTarget) toggleHistory(corner);
                }}
            >
                {historyCorner === corner && (
                    // En yeni taş köşeye en yakın; köşedeki üst taş zaten görünüyor
                    <div className="discard-history" aria-label="Bu köşeye atılan önceki taşlar">
                        {tiles.slice(0, -1).reverse().map(t => <Tile key={t.id} tile={t} isDiscarded={true} />)}
                    </div>
                )}
                {corner === kustuCorner && (
                    <button
                        type="button"
                        className="kustu-btn"
                        title="Yandan aldığın taşı geri koy, desteden çek (taşı buraya sürükleyerek de kusabilirsin)"
                        onClick={(e) => { e.stopPropagation(); onKustu?.(); }}
                    >
                        Kustu
                        {/* Taş geri konuyor: aşağı inen ok, altında köşe yuvası */}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 3v11" /><path d="M7.5 9.5 12 14l4.5-4.5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
                        </svg>
                    </button>
                )}
                {lastTile && corner !== kustuCorner && (
                    <div className={lastTile.locked ? 'discard-locked' : undefined} title={lastTile.locked ? 'Bu taş yerden alınamaz' : undefined}>
                    <Tile
                        tile={lastTile}
                        onClick={() => handleDiscardedTileClick(corner, lastIndex)}
                        isDiscarded={true}
                        canDrag={canDrag}
                        discardedFrom={corner}
                        index={lastIndex}
                    />
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            {renderCorner('topLeft', 'top-left')}
            {renderCorner('topRight', 'top-right')}
            {renderCorner('bottomRight', 'bottom-right')}
            {renderCorner('bottomLeft', 'bottom-left')}
        </>
    );
};

export default DiscardAreas; 