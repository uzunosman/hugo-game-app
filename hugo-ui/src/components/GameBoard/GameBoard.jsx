import React, { useRef, useEffect } from 'react';
import TileHolder from '../TileHolder/TileHolder';
import CenterArea from '../CenterArea/CenterArea';
import DiscardAreas from '../DiscardAreas/DiscardAreas';
import '../../assets/css/components/GameBoard.css';

/**
 * Oyun tahtası bileşeni.
 * Masaüstü: HTML5 Drag & Drop ile çalışır.
 * Mobil   : Touch event (touchstart/touchmove/touchend) tabanlı sürükle-bırak.
 *
 * Desteklenen touch sürükleme senaryoları:
 *  1. TileHolder taşı → TileHolder hücresi  (sıralama)
 *  2. TileHolder taşı → köşe drop-zone      (taş atma)
 *  3. Deste taşı     → TileHolder hücresi  (desteden çek)
 *  4. Köşe taşı      → TileHolder hücresi  (atılan taşı al)
 */
const GameBoard = ({
    tiles,
    tilePositions,
    discardedTiles,
    handleTileClick,
    handleTileMove,
    handleTileDoubleClick,
    handleDrawTile,
    handleDrawDiscardedTile,
    handleDrawFromDeck,
    isMyTurn,
    turnAction,
    playerCorner,
    currentPlayerIndex,
    lastDiscardCorner,
    deckCount,
    indicatorTile,
    gameRound,
    selectedTile
}) => {
    const isFirstHandBlock = tiles.length === 15 && turnAction === 'draw';
    const canDrawFromDeck = isMyTurn && turnAction === 'draw' && !isFirstHandBlock;

    // ─────────────────────────────────────────────────
    // Refs — stale closure'ları önlemek için her render
    // sonrası güncellenir, ancak effect yalnızca bir kez eklenir.
    // ─────────────────────────────────────────────────
    const tilesRef            = useRef(tiles);
    const tilePositionsRef    = useRef(tilePositions);
    const discardedTilesRef   = useRef(discardedTiles);
    const handleTileMoveRef   = useRef(handleTileMove);
    const handleTileDoubleClickRef = useRef(handleTileDoubleClick);
    const handleDrawFromDeckRef    = useRef(handleDrawFromDeck);
    const handleDrawDiscardedTileRef = useRef(handleDrawDiscardedTile);
    const canDrawFromDeckRef  = useRef(canDrawFromDeck);

    useEffect(() => { tilesRef.current            = tiles;            }, [tiles]);
    useEffect(() => { tilePositionsRef.current    = tilePositions;    }, [tilePositions]);
    useEffect(() => { discardedTilesRef.current   = discardedTiles;   }, [discardedTiles]);
    useEffect(() => { handleTileMoveRef.current   = handleTileMove;   }, [handleTileMove]);
    useEffect(() => { handleTileDoubleClickRef.current = handleTileDoubleClick; }, [handleTileDoubleClick]);
    useEffect(() => { handleDrawFromDeckRef.current    = handleDrawFromDeck;    }, [handleDrawFromDeck]);
    useEffect(() => { handleDrawDiscardedTileRef.current = handleDrawDiscardedTile; }, [handleDrawDiscardedTile]);
    useEffect(() => { canDrawFromDeckRef.current  = canDrawFromDeck;  }, [canDrawFromDeck]);

    // ─────────────────────────────────────────────────
    // Touch DnD — bir kez mount edilir
    // ─────────────────────────────────────────────────
    useEffect(() => {
        const DRAG_THRESHOLD = 8; // px — kaydırma = gerçek sürükleme
        const CELLS_PER_ROW  = 15;

        let drag = null;   // aktif sürükleme durumu
        let ghost = null;  // takip eden görsel klon

        // ── Ghost yönetimi ──────────────────────────
        const createGhost = (sourceEl, cx, cy) => {
            if (!sourceEl || ghost) return;
            const rect = sourceEl.getBoundingClientRect();
            ghost = sourceEl.cloneNode(true);
            Object.assign(ghost.style, {
                position:     'fixed',
                width:        rect.width  + 'px',
                height:       rect.height + 'px',
                left:         (cx - rect.width  / 2) + 'px',
                top:          (cy - rect.height / 2) + 'px',
                zIndex:       '9999',
                pointerEvents:'none',
                opacity:      '0.9',
                transform:    'scale(1.15)',
                boxShadow:    '0 6px 20px rgba(0,0,0,0.4)',
                transition:   'none',
                margin:       '0',
                borderRadius: '2px',
            });
            document.body.appendChild(ghost);
        };

        const moveGhost = (cx, cy) => {
            if (!ghost) return;
            ghost.style.left = (cx - ghost.offsetWidth  / 2) + 'px';
            ghost.style.top  = (cy - ghost.offsetHeight / 2) + 'px';
        };

        const destroyGhost = () => {
            if (ghost?.parentNode) ghost.parentNode.removeChild(ghost);
            ghost = null;
        };

        // ── Sürükleme kaynağını tanı ────────────────
        const onTouchStart = (e) => {
            const touch  = e.touches[0];
            const target = e.target;

            // 1) TileHolder taşı
            const cell = target.closest('.tile-cell');
            if (cell) {
                const tileEl = cell.querySelector('.tile');
                if (!tileEl) return; // boş hücre — tap-to-move devreye girer
                const dataIdx  = parseInt(cell.dataset.index);
                const isSecond = !!cell.closest('.second-row');
                const srcIdx   = dataIdx + (isSecond ? CELLS_PER_ROW : 0);
                drag = { type: 'tile', srcIdx, sourceEl: tileEl,
                         startX: touch.clientX, startY: touch.clientY };
                return;
            }

            // 2) Deste taşı
            const deckWrapper = target.closest('.deck-tile-wrapper');
            if (deckWrapper && canDrawFromDeckRef.current) {
                const deckEl = deckWrapper.querySelector('.center-tile.closed') || deckWrapper;
                drag = { type: 'deck', sourceEl: deckEl,
                         startX: touch.clientX, startY: touch.clientY };
                return;
            }

            // 3) Köşede bekleyen atılmış taş (can-drag)
            const discardTile = target.closest('.tile.can-drag');
            if (discardTile) {
                const corner = discardTile.dataset.discardedFrom;
                if (!corner) return;
                drag = { type: 'discarded', corner, sourceEl: discardTile,
                         startX: touch.clientX, startY: touch.clientY };
                return;
            }
        };

        // ── Hareket ─────────────────────────────────
        const onTouchMove = (e) => {
            if (!drag) return;
            const touch = e.touches[0];
            const dx = touch.clientX - drag.startX;
            const dy = touch.clientY - drag.startY;

            if (!drag.isDragging && Math.sqrt(dx*dx + dy*dy) > DRAG_THRESHOLD) {
                drag.isDragging = true;
                createGhost(drag.sourceEl, touch.clientX, touch.clientY);
                if (drag.sourceEl) drag.sourceEl.style.opacity = '0.2';
            }

            if (drag.isDragging) {
                e.preventDefault(); // scroll'u engelle
                moveGhost(touch.clientX, touch.clientY);
            }
        };

        // ── Bırakma ─────────────────────────────────
        const onTouchEnd = (e) => {
            if (!drag) return;

            // Kaynak opacity'yi geri al
            if (drag.sourceEl) drag.sourceEl.style.opacity = '1';

            if (!drag.isDragging) {
                // Mesafe eşiğini geçmediyse tap — click handler devreye girer
                drag = null;
                return;
            }

            const touch   = e.changedTouches[0];
            const { type, srcIdx, corner } = drag;

            // Ghost'u kaldır, SONRA elementFromPoint çağır
            destroyGhost();
            const target = document.elementFromPoint(touch.clientX, touch.clientY);

            if (type === 'tile') {
                // Hedef: TileHolder hücresi
                const dropCell = target?.closest('.tile-cell');
                if (dropCell) {
                    const di       = parseInt(dropCell.dataset.index);
                    const isSecond = !!dropCell.closest('.second-row');
                    const tgtIdx   = di + (isSecond ? CELLS_PER_ROW : 0);
                    if (tgtIdx !== srcIdx) handleTileMoveRef.current(srcIdx, tgtIdx);
                    drag = null; return;
                }
                // Hedef: köşe drop-zone (taş at)
                const dropZone = target?.closest('.tile-drop-zone.active');
                if (dropZone) {
                    handleTileDoubleClickRef.current?.(srcIdx);
                    drag = null; return;
                }
            }

            if (type === 'deck') {
                // Hedef: TileHolder hücresi (desteden çek → oraya yerleştir)
                const dropCell = target?.closest('.tile-cell');
                if (dropCell) {
                    const di       = parseInt(dropCell.dataset.index);
                    const isSecond = !!dropCell.closest('.second-row');
                    const tgtIdx   = di + (isSecond ? CELLS_PER_ROW : 0);
                    handleDrawFromDeckRef.current?.(tgtIdx);
                    drag = null; return;
                }
                // TileHolder üzerinde ama boş hücre değilse → ilk boş slota ekle
                const holderEl = target?.closest('.tile-holder');
                if (holderEl) {
                    const firstEmpty = tilePositionsRef.current.findIndex(p => p === null);
                    if (firstEmpty !== -1) handleDrawFromDeckRef.current?.(firstEmpty);
                }
            }

            if (type === 'discarded') {
                // Hedef: TileHolder hücresi (atılan taşı al)
                const dropCell = target?.closest('.tile-cell');
                if (dropCell) {
                    const di       = parseInt(dropCell.dataset.index);
                    const isSecond = !!dropCell.closest('.second-row');
                    let   tgtIdx   = di + (isSecond ? CELLS_PER_ROW : 0);
                    // Hedef dolu ise ilk boş slota ekle
                    if (tilePositionsRef.current[tgtIdx]) {
                        const empty = tilePositionsRef.current.findIndex(p => p === null);
                        if (empty === -1) { drag = null; return; }
                        tgtIdx = empty;
                    }
                    const cornerTiles = discardedTilesRef.current[corner] || [];
                    const lastIdx = cornerTiles.length - 1;
                    handleDrawDiscardedTileRef.current?.(corner, lastIdx, tgtIdx);
                }
            }

            drag = null;
        };

        const onTouchCancel = () => {
            if (drag?.sourceEl) drag.sourceEl.style.opacity = '1';
            destroyGhost();
            drag = null;
        };

        // touchstart: passive olabilir (preventDefault gerekmez)
        // touchmove : { passive: false } — sürükleme sırasında scroll engeli
        document.addEventListener('touchstart',  onTouchStart,  { passive: true  });
        document.addEventListener('touchmove',   onTouchMove,   { passive: false });
        document.addEventListener('touchend',    onTouchEnd);
        document.addEventListener('touchcancel', onTouchCancel);

        return () => {
            document.removeEventListener('touchstart',  onTouchStart);
            document.removeEventListener('touchmove',   onTouchMove);
            document.removeEventListener('touchend',    onTouchEnd);
            document.removeEventListener('touchcancel', onTouchCancel);
        };
    }, []); // Sadece bir kez bağlan — dinamik değerler ref üzerinden okunur

    return (
        <div className="game-board">
            <div className="board-content">
                {/* Köşe Bırakma Alanları */}
                <DiscardAreas
                    discardedTiles={discardedTiles}
                    handleTileMove={handleTileMove}
                    handleDrawDiscardedTile={handleDrawDiscardedTile}
                    isMyTurn={isMyTurn}
                    turnAction={turnAction}
                    playerCorner={playerCorner}
                    tilesLength={tiles.length}
                    currentPlayerIndex={currentPlayerIndex}
                    lastDiscardCorner={lastDiscardCorner}
                />

                {/* Merkez Alan */}
                <CenterArea
                    onDrawTile={() => handleDrawTile(false)}
                    canDrawTile={canDrawFromDeck}
                    remainingTiles={Array(deckCount ?? 0).fill(null)}
                    openTile={indicatorTile}
                    gameRound={gameRound}
                />

                {/* Oyuncunun Taşları */}
                <TileHolder
                    tiles={tiles}
                    tilePositions={tilePositions}
                    onTileClick={handleTileClick}
                    onTileMove={handleTileMove}
                    onTileDoubleClick={handleTileDoubleClick}
                    onDrawDiscardedTile={handleDrawDiscardedTile}
                    onDrawFromDeck={handleDrawFromDeck}
                    selectedTileIndex={selectedTile}
                />
            </div>
        </div>
    );
};

export default GameBoard;
