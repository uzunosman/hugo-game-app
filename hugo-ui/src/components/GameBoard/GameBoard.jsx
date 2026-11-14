import React from 'react';
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
    pendingSetIds
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

    return (
        <div className={`game-board ${dragView?.dragging ? 'is-dragging' : ''} ${dragView?.overTable ? 'drop-table' : ''}`} onPointerDown={onPointerDown}>
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
                />

                {/* Merkez Alan */}
                <CenterArea
                    onDrawTile={() => handleDrawTile(false)}
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
