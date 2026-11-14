import React from 'react';
import Tile from '../Tile/Tile';
import { isOkeyTile } from '../../utils/gameUtils';
import { rackPreview, ROW } from '../../utils/rackDrag';
import '../../assets/css/components/TileHolder.css';

// Istaka: 2 × 15 hücre. Sürükleme GameBoard'daki useBoardDrag ile yapılır; burada yalnızca çizilir.
// dragView sürerken taşlar bırakınca alacakları yerde gösterilir, sürüklenen taş yerinden kalkar.
const TileHolder = ({ tiles, tilePositions, onTileClick, onTileDoubleClick, selectedTileIndex, okeyTile, isHugo, flippedTileIds, onOkeyFlip, onArrange, dragView }) => {
    const tilesMap = Object.fromEntries(tiles.map(t => [t.id, t]));
    const dragging = dragView?.dragging ? dragView : null;
    const { cells, preview, blocked } = rackPreview(tilePositions, dragging);
    const armed = dragView && !dragView.dragging && dragView.group;
    const isArmed = (i) => armed && i >= armed.start && i < armed.start + armed.len;

    const renderCell = (index) => {
        const tileId = cells[index];
        const tile = tileId ? tilesMap[tileId] : null;
        const isSelected = !dragging && selectedTileIndex === index;
        const classes = [
            'tile-cell',
            !tile && 'empty-cell',
            isSelected && 'cell-selected',
            preview.has(index) && 'drop-preview',
            dragging && dragView.overCell === index && blocked && 'drop-blocked',
            isArmed(index) && 'group-armed',
        ].filter(Boolean).join(' ');

        return (
            <div
                key={index}
                className={classes}
                data-cell={index}
                onClick={!tile && selectedTileIndex != null ? () => onTileClick(index) : undefined}
            >
                {tile && (
                    <Tile
                        index={index}
                        tile={tile}
                        tileId={tileId}
                        isSelected={isSelected}
                        isFlipped={flippedTileIds?.has(tileId)}
                        onClick={() => onTileClick(index)}
                        // Okeye çift tıklama atmaz, okey simgesine çevirir (sürükleyip köşeye bırakınca yine atılır)
                        onDoubleClick={onOkeyFlip && isOkeyTile(tile, okeyTile, isHugo) ? () => onOkeyFlip(tileId) : () => onTileDoubleClick?.(index)}
                        onContextMenu={onOkeyFlip && isOkeyTile(tile, okeyTile, isHugo) ? (e) => { e.preventDefault(); onOkeyFlip(tileId); } : undefined}
                    />
                )}
            </div>
        );
    };

    const row = (offset) => Array.from({ length: ROW }, (_, i) => renderCell(i + offset));

    return (
        <div className={`tile-holder-container ${dragging ? 'is-dragging' : ''}`}>
            {onArrange && (
                <div className="rack-tools">
                    <button type="button" className="rack-tool-btn" onClick={() => onArrange('seri')}>Seri diz</button>
                    <button type="button" className="rack-tool-btn" onClick={() => onArrange('cift')}>Çift diz</button>
                </div>
            )}
            <div className="tile-holder">
                <div className="tile-row first-row">{row(0)}</div>
                <hr className="tile-row-divider" />
                <div className="tile-row second-row">{row(ROW)}</div>
            </div>
        </div>
    );
};

export default TileHolder;
