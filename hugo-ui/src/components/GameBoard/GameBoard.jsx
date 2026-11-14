import React, { useLayoutEffect, useRef } from 'react';
import TileHolder from '../TileHolder/TileHolder';
import CenterArea from '../CenterArea/CenterArea';
import DiscardAreas from '../DiscardAreas/DiscardAreas';
import OpenSetsArea from '../OpenSetsArea/OpenSetsArea';
import useBoardDrag from '../../hooks/useBoardDrag';
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
    canPlaySets
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

    // Üst oyuncunun perleri aşağı uzadıkça orta taşlar da aşağı kayar: üst ve alt perlerin arasındaki boşluğun ortası
    const boardRef = useRef(null);
    useLayoutEffect(() => {
        const place = () => {
            const board = boardRef.current;
            if (!board) return;
            const top = board.querySelector('.open-sets-top');
            const bottom = board.querySelector('.open-sets-bottom');
            const h = board.querySelector('.open-sets-container')?.offsetHeight || 0;
            const topEdge = top ? top.offsetTop + top.offsetHeight : 0; // offset*: büyüyen (scale) per ölçüyü bozmaz
            const bottomEdge = bottom ? bottom.offsetTop : h;
            board.style.setProperty('--center-y', `${Math.round((topEdge + bottomEdge) / 2)}px`);
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
