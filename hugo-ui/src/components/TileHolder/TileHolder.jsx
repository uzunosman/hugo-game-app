import React from 'react';
import Tile from '../Tile/Tile';
import { isOkeyTile } from '../../utils/gameUtils';
import { rackPreview, ROW } from '../../utils/rackDrag';
import '../../assets/css/components/TileHolder.css';

// Istaka: 2 × 15 hücre. Sürükleme GameBoard'daki useBoardDrag ile yapılır; burada yalnızca çizilir.
// dragView sürerken taşlar bırakınca alacakları yerde gösterilir, sürüklenen taş yerinden kalkar.
const TileHolder = ({ tiles, tilePositions, onTileClick, onTileDoubleClick, selectedTileIndex, okeyTile, isHugo, flippedTileIds, onOkeyFlip, onArrange, dragView, hiddenIds, islekIds }) => {
    const tilesMap = Object.fromEntries(tiles.map(t => [t.id, t]));
    const dragging = dragView?.dragging ? dragView : null;
    const { cells, preview, blocked } = rackPreview(tilePositions, dragging);
    const armed = dragView && !dragView.dragging && dragView.group;
    const isArmed = (i) => armed && i >= armed.start && i < armed.start + armed.len;

    const renderCell = (index) => {
        const tileId = cells[index];
        const tile = tileId && !hiddenIds?.has(tileId) ? tilesMap[tileId] : null; // gizli: sunucu cevabı bekleyen, ıstakadan çıkan taş
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
                        isIslek={islekIds?.has(tileId)}
                        isOkey={isOkeyTile(tile, okeyTile, isHugo)}
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
                // Dizme düğmeleri: tek taş boyunda, ıstakanın sağına yapışık, alt alta; içinde yelpaze gibi açılmış küçük taşlar
                // (seri: kırmızı 3-4-5, çift: kırmızı 5-5)
                <div className="rack-tools">
                    <button type="button" className="rack-tool-btn" onClick={() => onArrange('seri')} aria-label="Seri diz" title="Seri diz">
                        <span className="rt-fan rt-fan-3" aria-hidden="true"><span className="rt-tile">3</span><span className="rt-tile">4</span><span className="rt-tile">5</span></span>
                        <span className="at-label" aria-hidden="true">Diz</span>
                    </button>
                    <button type="button" className="rack-tool-btn" onClick={() => onArrange('cift')} aria-label="Çift diz" title="Çift diz">
                        <span className="rt-fan rt-fan-2" aria-hidden="true"><span className="rt-tile">5</span><span className="rt-tile">5</span></span>
                        <span className="at-label" aria-hidden="true">Diz</span>
                    </button>
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
