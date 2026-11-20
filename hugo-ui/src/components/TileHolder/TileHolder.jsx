import React, { useEffect, useRef, useState } from 'react';
import Tile from '../Tile/Tile';
import { isOkeyTile } from '../../utils/gameUtils';
import { rackPreview, ROW } from '../../utils/rackDrag';
import '../../assets/css/components/TileHolder.css';

// Seri diz şekli: dişi (3-4-5, aynı renk seriler önce) ya da erkek (4-4-4, aynı sayılar önce). Cihazda saklanır.
const STYLE_KEY = 'hugo.seriStyle';
const readStyle = () => { try { return localStorage.getItem(STYLE_KEY) === 'group' ? 'group' : 'run'; } catch { return 'run'; } };
const FANS = {
    run: <span className="rt-fan rt-fan-3" aria-hidden="true"><span className="rt-tile">3</span><span className="rt-tile">4</span><span className="rt-tile">5</span></span>,
    group: <span className="rt-fan rt-fan-3" aria-hidden="true"><span className="rt-tile">4</span><span className="rt-tile rt-yellow">4</span><span className="rt-tile rt-blue">4</span></span>,
};
const LONG_PRESS_MS = 450;

// Istaka: 2 × 15 hücre. Sürükleme GameBoard'daki useBoardDrag ile yapılır; burada yalnızca çizilir.
// dragView sürerken taşlar bırakınca alacakları yerde gösterilir, sürüklenen taş yerinden kalkar.
const TileHolder = ({ tiles, tilePositions, onTileClick, onTileDoubleClick, selectedTileIndex, okeyTile, isHugo, flippedTileIds, onOkeyFlip, onArrange, dragView, hiddenIds, islekIds }) => {
    const tilesMap = Object.fromEntries(tiles.map(t => [t.id, t]));
    const dragging = dragView?.dragging ? dragView : null;
    const { cells, preview, blocked } = rackPreview(tilePositions, dragging);
    const armed = dragView && !dragView.dragging && dragView.group;
    const isArmed = (i) => armed && i >= armed.start && i < armed.start + armed.len;

    // Seri diz: dokununca seçili şekilde dizer; basılı tutunca (ya da sağ tık) şekil seçimi açılır (erkek 4-4-4 / dişi 3-4-5)
    const [seriStyle, setSeriStyle] = useState(readStyle);
    const [picker, setPicker] = useState(false);
    const press = useRef(null);
    const longFired = useRef(false);
    const toolsRef = useRef(null);
    const startPress = () => {
        longFired.current = false;
        clearTimeout(press.current);
        press.current = setTimeout(() => { longFired.current = true; setPicker(true); }, LONG_PRESS_MS);
    };
    const endPress = () => clearTimeout(press.current);
    useEffect(() => () => clearTimeout(press.current), []);
    useEffect(() => {
        if (!picker) return undefined;
        const away = (e) => { if (!toolsRef.current?.contains(e.target)) setPicker(false); };
        const esc = (e) => { if (e.key === 'Escape') setPicker(false); };
        document.addEventListener('pointerdown', away);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
    }, [picker]);
    const pickStyle = (style) => {
        setSeriStyle(style);
        try { localStorage.setItem(STYLE_KEY, style); } catch { /* depolama kapalı */ }
        setPicker(false);
        onArrange('seri', style);
    };

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
                <div className="rack-tools" ref={toolsRef}>
                    {picker && (
                        <div className="seri-picker" role="menu" aria-label="Seri diz şekli">
                            {[['group', 'erkek'], ['run', 'dişi']].map(([style, label]) => (
                                <button key={style} type="button" role="menuitemradio" aria-checked={seriStyle === style}
                                    className={`rack-tool-btn seri-option ${seriStyle === style ? 'is-sel' : ''}`} onClick={() => pickStyle(style)}>
                                    {FANS[style]}
                                    <span className="at-label">{label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <button type="button" className="rack-tool-btn" aria-label="Seri diz (basılı tut: dizme şekli)" title="Seri diz · basılı tut: şekil seç"
                        aria-haspopup="menu" aria-expanded={picker}
                        onPointerDown={startPress} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress}
                        onContextMenu={(e) => { e.preventDefault(); setPicker(true); longFired.current = true; }}
                        onClick={() => { if (longFired.current) { longFired.current = false; return; } onArrange('seri', seriStyle); }}>
                        {FANS[seriStyle]}
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
