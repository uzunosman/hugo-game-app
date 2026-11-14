import React, { useLayoutEffect, useRef } from 'react';
import TileHolder from '../TileHolder/TileHolder';
import CenterArea from '../CenterArea/CenterArea';
import DiscardAreas from '../DiscardAreas/DiscardAreas';
import OpenSetsArea from '../OpenSetsArea/OpenSetsArea';
import useBoardDrag from '../../hooks/useBoardDrag';
import { fitTable } from '../../utils/tableFit';
import '../../assets/css/components/GameBoard.css';

/**
 * Oyun tahtası: köşeler, masadaki perler, deste ve ıstaka.
 * Sürükle-bırak useBoardDrag'da (Pointer Events; fare, dokunmatik ve kalem aynı yol):
 *  ıstaka taşı → ıstaka / köşe / per, basılı tutulan per → ıstaka ya da masa (el aç / per indir),
 *  deste ya da yerdeki taş → ıstaka.
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
    lastDiscardCorner,
    deckCount,
    indicatorTile,
    okeyTile,
    gameRound,
    isHugoRound,
    onArrange,
    pairPartnerId,
    onTapDiscard,
    kustuCorner,
    onKustu,
    selectedTile,
    tableSets,
    orderedPlayers,
    selectedTileId,
    activeTile,
    onAddTileToSet,
    onTileDragStart,
    onTileDragEnd,
    flippedTileIds,
    onOkeyFlip,
    onGroupMove,
    onPlayGroup,
    pendingSetIds,
    onWarn,
    canPlaySets,
    canSeeDiscards
}) => {
    const isFirstHandBlock = tiles.length === 15 && turnAction === 'draw';
    const canDrawFromDeck = isMyTurn && turnAction === 'draw' && !isFirstHandBlock;

    // Tüm sürükle-bırak (fare + dokunmatik) tek yoldan: useBoardDrag
    const { dragView, onPointerDown } = useBoardDrag({
        positions: tilePositions,
        tiles,
        playerCorner,
        canDrawFromDeck,
        setOpts: { okeyTile, isHugo: isHugoRound },
        actions: {
            moveTile: handleTileMove,
            moveGroup: onGroupMove,
            playGroup: onPlayGroup, // per masaya sürüklendi: el aç / per indir
            discard: handleTileDoubleClick, // köşeye atma ile aynı yol (sıra / aşama kontrolü orada)
            addToSet: onAddTileToSet,
            drawDeck: handleDrawFromDeck,
            drawDiscard: handleDrawDiscardedTile,
            dragStart: onTileDragStart,
            dragEnd: onTileDragEnd,
        },
    });

    // Hiçbir taş üst üste gelmesin: orta taşlar ve yan perler dikeyde boşluğa kayar, sığmazsa küçülür (utils/tableFit)
    const boardRef = useRef(null);
    useLayoutEffect(() => {
        const place = () => {
            const board = boardRef.current;
            const box = board?.querySelector('.open-sets-container');
            const deck = board?.querySelectorAll('.center-tiles > *');
            if (!box || !deck?.length) return;
            if (box.querySelector('.open-set-group.expanded')) return; // işlerken büyüyen per ölçüyü bozmasın: yerleşim sabit kalır
            const q = (pos) => box.querySelector(`.open-sets-${pos}`);
            const areas = { top: q('top'), bottom: q('bottom'), left: q('left'), right: q('right') };
            // Önce varsayılan yerlere dön, sonra ölç (aynı karede: titreme olmaz)
            board.style.removeProperty('--center-y');
            Object.values(areas).forEach(el => { el?.style.removeProperty('--fit-y'); el?.style.removeProperty('--fit-s'); });
            const o = box.getBoundingClientRect();
            const rel = (r) => ({ x0: r.left - o.left, x1: r.right - o.left, y0: r.top - o.top, y1: r.bottom - o.top });
            const groups = (el) => (el ? [...el.querySelectorAll('.open-set-group, .pair-slot')].map(g => rel(g.getBoundingClientRect())) : []);
            const c = [...deck].map(el => el.getBoundingClientRect());
            const center = rel({ left: Math.min(...c.map(r => r.left)), right: Math.max(...c.map(r => r.right)), top: Math.min(...c.map(r => r.top)), bottom: Math.max(...c.map(r => r.bottom)) });
            const fixed = [...board.querySelectorAll('.tile-drop-zone')].map(z => rel(z.getBoundingClientRect()));
            const sides = ['left', 'right'].filter(k => areas[k]).map(k => {
                const a = rel(areas[k].getBoundingClientRect());
                return { k, a, rects: groups(areas[k]), originX: k === 'left' ? a.x0 : a.x1, originY: (a.y0 + a.y1) / 2 };
            });
            const fit = fitTable({ H: o.height, top: groups(areas.top), bottom: groups(areas.bottom), center, sides, fixed });
            board.style.setProperty('--center-y', `${Math.round(fit.centerY)}px`);
            if (fit.topScale < 1) { areas.top?.style.setProperty('--fit-s', fit.topScale); areas.bottom?.style.setProperty('--fit-s', fit.bottomScale); }
            sides.forEach(({ k, a }, i) => {
                areas[k].style.setProperty('--fit-y', `${Math.round((a.y0 + a.y1) / 2 + fit.sides[i].dy)}px`);
                if (fit.sides[i].s < 1) areas[k].style.setProperty('--fit-s', fit.sides[i].s);
            });
        };
        place();
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    });

    return (
        <div ref={boardRef} className={`game-board ${dragView?.dragging ? 'is-dragging' : ''} ${dragView?.overTable ? 'drop-table' : ''}`} onPointerDown={onPointerDown}>
            <div className="board-content">
                {/* Köşe Bırakma Alanları */}
                <DiscardAreas
                    discardedTiles={discardedTiles}
                    dragOverCorner={dragView?.dragging && dragView.kind === 'tile' ? dragView.overCorner : null}
                    handleDrawDiscardedTile={handleDrawDiscardedTile}
                    isMyTurn={isMyTurn}
                    turnAction={turnAction}
                    playerCorner={playerCorner}
                    tilesLength={tiles.length}
                    lastDiscardCorner={lastDiscardCorner}
                    hasSelection={selectedTile !== null && selectedTile !== undefined}
                    onTapDiscard={onTapDiscard}
                    kustuCorner={kustuCorner}
                    canSeeHistory={canSeeDiscards}
                    onKustu={onKustu}
                />

                {/* Masadaki Açık Setler */}
                <OpenSetsArea
                    tableSets={tableSets || []}
                    players={orderedPlayers || []}
                    selectedTileId={selectedTileId}
                    activeTile={activeTile}
                    onAddTileToSet={onAddTileToSet}
                    okeyTile={okeyTile}
                    isHugo={isHugoRound}
                    pairPartnerId={pairPartnerId}
                    dragOverKey={dragView?.dragging ? dragView.overSet : null}
                    dragOverSide={dragView?.dragging ? dragView.overSide : null}
                    pendingSetIds={pendingSetIds}
                    canPlay={canPlaySets}
                />

                {/* Merkez Alan */}
                <CenterArea
                    onDrawTile={() => (isMyTurn && isFirstHandBlock ? onWarn?.('İlk elde taş çekilmez: bir taş at') : handleDrawTile(false))}
                    canDrawTile={canDrawFromDeck}
                    remainingTiles={Array(deckCount ?? 0).fill(null)}
                    openTile={indicatorTile}
                    gameRound={gameRound}
                    isHugoRound={isHugoRound}
                />

                {/* Oyuncunun Taşları */}
                <TileHolder
                    tiles={tiles}
                    tilePositions={tilePositions}
                    onTileClick={handleTileClick}
                    onTileDoubleClick={handleTileDoubleClick}
                    selectedTileIndex={selectedTile}
                    dragView={dragView}
                    okeyTile={okeyTile}
                    isHugo={isHugoRound}
                    flippedTileIds={flippedTileIds || new Set()}
                    onOkeyFlip={onOkeyFlip}
                    onArrange={onArrange}
                />
            </div>
        </div>
    );
};

export default GameBoard;
