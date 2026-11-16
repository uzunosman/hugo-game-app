import React, { useState } from 'react';
import { isOkeyTile, asPlayedTile, canTakePairOkey } from '../../utils/gameUtils';
import '../../assets/css/components/OpenSetsArea.css';
import { incomingTiles } from '../../utils/flyTiles';
import JokerFace from '../Tile/JokerFace';

/**
 * Masadaki açık setleri 4 oyuncu alanında gösteren bileşen.
 * - Setler alt alta (dikey) sıralanır.
 * - Taş sürüklenip setin üzerine gelindiğinde taşlar normal boyuta büyür.
 * - Geçerli ekleme pozisyonları (insertion slot) gösterilir.
 * - Slot'a bırakıldığında onAddTileToSet(tileId, setId, position) tetiklenir.
 */

// ── Yardımcı fonksiyonlar ────────────────────────────────

function isSequentialSet(tiles, isOkey = (t) => t.isJoker) {
    const normal = tiles.filter(t => !isOkey(t));
    if (normal.length < 2) return tiles.length >= 3;
    const color = normal[0].color;
    if (!normal.every(t => t.color === color)) return false;
    const values = normal.map(t => t.value).sort((a, b) => a - b);
    for (let i = 1; i < values.length; i++) {
        if (values[i] - values[i - 1] > tiles.length - normal.length + 1) return false;
    }
    return true;
}

function isSameNumberSet(tiles, isOkey = (t) => t.isJoker) {
    const normal = tiles.filter(t => !isOkey(t));
    if (normal.length === 0) return false;
    const val = normal[0].value;
    return normal.every(t => t.value === val);
}

function getSetColor(tiles, isOkey = (t) => t.isJoker) {
    const normal = tiles.filter(t => !isOkey(t));
    return normal.length > 0 ? normal[0].color : null;
}

function getSetDirection(tiles, isOkey = (t) => t.isJoker) {
    const normal = tiles.filter(t => !isOkey(t) && typeof t.value === 'number');
    if (normal.length < 2) return 1;
    let firstIdx = -1, firstVal = 0, secondIdx = -1, secondVal = 0;
    for (let i = 0; i < tiles.length; i++) {
        if (!isOkey(tiles[i])) {
            if (firstIdx === -1) { firstIdx = i; firstVal = tiles[i].value; }
            else { secondIdx = i; secondVal = tiles[i].value; break; }
        }
    }
    if (secondIdx === -1) return 1;
    return secondVal > firstVal ? 1 : -1;
}

function getEdgeValues(tiles, isOkey = (t) => t.isJoker) {
    const dir = getSetDirection(tiles, isOkey);
    const normal = tiles.filter(t => !isOkey(t) && typeof t.value === 'number');
    if (normal.length === 0) return { startVal: null, endVal: null };

    let anchorIdx = -1, anchorVal = 0;
    for (let i = 0; i < tiles.length; i++) {
        if (!isOkey(tiles[i])) { anchorIdx = i; anchorVal = tiles[i].value; break; }
    }

    const firstExpected = anchorVal + (0 - anchorIdx) * dir;
    const lastExpected = anchorVal + (tiles.length - 1 - anchorIdx) * dir;

    const startVal = firstExpected - dir;
    const endVal = lastExpected + dir;
    return { startVal, endVal };
}

/**
 * Aktif taş ve set bilgisine göre geçerli ekleme pozisyonlarını hesapla.
 */
function calculateValidPositions(set, rawActiveTile, okeyTile, isHugo) {
    if (!rawActiveTile) return [];
    // Çiftlere tek taş işlenmez: ıstakadaki çift basılı tutulup sürüklenir (useBoardDrag)
    if (set.kind === 'cift') return [];
    const positions = [];
    // Sahte okeyler okeyin değeriyle hesaba girer
    const tiles = set.tiles.map(t => asPlayedTile(t, okeyTile, isHugo));
    const activeTile = asPlayedTile(rawActiveTile, okeyTile, isHugo);
    const isOkey = (t) => isOkeyTile(t, okeyTile, isHugo);

    if (isSequentialSet(tiles, isOkey)) {
        const color = getSetColor(tiles, isOkey);
        const { startVal, endVal } = getEdgeValues(tiles, isOkey);

        // Kenar ekleme slot'ları
        if (startVal !== null && startVal >= 1 && startVal <= 13) {
            if (isOkey(activeTile) || (activeTile.color === color && activeTile.value === startVal)) {
                positions.push({ position: 'start', displayValue: startVal, displayColor: color });
            }
        }
        if (endVal !== null && endVal >= 1 && endVal <= 13) {
            if (isOkey(activeTile) || (activeTile.color === color && activeTile.value === endVal)) {
                positions.push({ position: 'end', displayValue: endVal, displayColor: color });
            }
        }

        // Okey swap: sette okey varsa, okey'in temsil ettiği değer ile eşleşen taş swap yapabilir
        if (!isOkey(activeTile)) {
            const dir = getSetDirection(tiles, isOkey);
            let anchorIdx = -1, anchorVal = 0;
            for (let i = 0; i < tiles.length; i++) {
                if (!isOkey(tiles[i])) { anchorIdx = i; anchorVal = tiles[i].value; break; }
            }
            if (anchorIdx !== -1) {
                for (let i = 0; i < tiles.length; i++) {
                    if (isOkey(tiles[i])) {
                        const okeyRepresents = anchorVal + (i - anchorIdx) * dir;
                        if (activeTile.color === color && activeTile.value === okeyRepresents) {
                            const slotPos = i === 0 ? 'start' : 'end';
                            if (!positions.some(p => p.position === slotPos)) {
                                positions.push({ position: slotPos, displayValue: okeyRepresents, displayColor: color });
                            }
                        }
                    }
                }
            }
        }
    } else if (isSameNumberSet(tiles, isOkey)) {
        const normal = tiles.filter(t => !isOkey(t));
        const val = normal.length > 0 ? normal[0].value : 0;
        const hasOkey = tiles.some(t => isOkey(t));
        const existingColors = normal.map(t => t.color);
        const allColors = ['red', 'yellow', 'blue', 'black'];
        const missing = allColors.filter(c => !existingColors.includes(c));

        if (tiles.length < 4 && missing.length > 0) {
            if (isOkey(activeTile) || (activeTile.value === val && missing.includes(activeTile.color))) {
                positions.push({
                    position: 'end',
                    displayValue: val,
                    displayColor: isOkey(activeTile) ? missing[0] : activeTile.color
                });
            }
        } else if (tiles.length === 4 && hasOkey && missing.length > 0 && !isOkey(activeTile)) {
            if (activeTile.value === val && missing.includes(activeTile.color)) {
                positions.push({
                    position: 'end',
                    displayValue: val,
                    displayColor: activeTile.color
                });
            }
        }
    }

    return positions;
}

// Erkek per: okey olmayan taşlar aynı sayı (en az iki taş); tek taş + okeyler sıralı sayılır
function isGroupSet(set, okeyTile, isHugo) {
    const normal = set.tiles.filter(t => !isOkeyTile(t, okeyTile, isHugo)).map(t => asPlayedTile(t, okeyTile, isHugo));
    return normal.length >= 2 && normal.every(t => t.value === normal[0].value);
}

// ── Bileşen ──────────────────────────────────────────────

// dragOverKey: sürüklenen taşın üstünde olduğu per / çift yeri (useBoardDrag); bırakma da orada yapılır
// canPlay: oyuncu yere açmış ve sırası onda; değilse perler üstüne gelince büyümez
const OpenSetsArea = ({ tableSets, players, selectedTileId, activeTile, onAddTileToSet, okeyTile, isHugo, dragOverKey, dragOverSide, dragOverPairs, pendingSetIds, canPlay = true }) => {
    const [hovered, setHovered] = useState(null); // { setId, tileId }: üstüne gelinen per, o anda seçili taşla

    const positionMap = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' };

    const getPlayerSets = (playerId) => tableSets.filter(s => s.playerId === playerId);

    // Seç & Tıkla: slot'a tıklanınca
    const handleSlotClick = (setId, position) => {
        if (selectedTileId && onAddTileToSet) {
            onAddTileToSet(selectedTileId, setId, position);
        }
    };

    // Mouse hover (select & click modu). Dokunmatikte mouseleave gelmez: büyüme yalnızca dokunulduğu andaki seçili taş için,
    // ıstakada başka taş seçilince eski dokunulan per kendiliğinden büyümez
    const handleMouseEnter = (setId) => {
        if (selectedTileId) setHovered({ setId, tileId: selectedTileId });
    };

    const handleMouseLeave = (setId) => {
        if (hovered?.setId === setId) setHovered(null);
    };

    const isInteractive = !!selectedTileId || !!activeTile;

    const renderSet = (set) => {
        // Çiftlere işleme, çiftlerin önündeki soluk çift yerinden yapılır
        // Dörtlü erkek per dolu: okey yoksa hiç işlenmez (büyümez); okey varsa büyür, yuva açılmaz, yalnızca okey alınır
        const isOkey = (t) => isOkeyTile(t, okeyTile, isHugo);
        const played = set.tiles.map(t => asPlayedTile(t, okeyTile, isHugo));
        const fullGroup = set.kind !== 'cift' && set.tiles.length === 4 && isSameNumberSet(played, isOkey);
        const fullHasOkey = fullGroup && set.tiles.some(isOkey);
        const pairOkey = canPlay && canTakePairOkey(set, activeTile, okeyTile, isHugo); // çiftteki okey eşiyle alınır
        const isExpanded = canPlay && ((!!selectedTileId && hovered?.setId === set.id && hovered.tileId === selectedTileId) || dragOverKey === set.id)
            && (set.kind !== 'cift' ? (!fullGroup || fullHasOkey) : pairOkey);
        const validPositions = isExpanded && set.kind !== 'cift'
            ? calculateValidPositions(set, activeTile, okeyTile, isHugo)
            : [];
        const okeyTakeable = fullHasOkey && validPositions.length > 0; // çiftteki okey alınabilir ama parlamaz
        const hasStartSlot = !fullGroup && validPositions.some(v => v.position === 'start');
        const hasEndSlot = !fullGroup && validPositions.some(v => v.position === 'end');
        // Sürüklenen taşın gideceği uç: iki uç da uyuyorsa (okey) parmağın olduğu yarı, tek uç uyuyorsa o uç
        const activeSide = dragOverKey === set.id
            ? (hasStartSlot && hasEndSlot ? dragOverSide : hasStartSlot ? 'start' : 'end')
            : null;

        return (
            <div
                key={set.id}
                className={`open-set-group ${isExpanded ? 'expanded' : ''} ${pendingSetIds?.includes(set.id) ? 'is-pending' : ''} ${set.tiles.length > 10 ? 'long-set' : ''} ${isInteractive && canPlay && (set.kind !== 'cift' ? (!fullGroup || fullHasOkey) : pairOkey) ? 'droppable' : ''}`}
                data-set-id={set.id}
                data-hover-key={canPlay && (!fullGroup || fullHasOkey) ? set.id : undefined}
                onMouseEnter={() => handleMouseEnter(set.id)}
                onMouseLeave={() => handleMouseLeave(set.id)}
            >
                {isExpanded && hasStartSlot && (
                    <div
                        className={`insertion-slot ${activeSide === 'start' ? 'active' : ''}`}
                        data-set-id={set.id}
                        data-position="start"
                        onClick={() => handleSlotClick(set.id, 'start')}
                    />
                )}
                {set.tiles.map((tile) => {
                    const tileIsOkey = isOkeyTile(tile, okeyTile, isHugo);
                    return (
                        <div
                            key={tile.id}
                            className={`open-set-tile ${tile.color} ${tile.isJoker ? 'is-joker' : ''} ${tileIsOkey ? 'is-okey' : ''} ${tileIsOkey && okeyTakeable ? 'okey-takeable' : ''} ${incomingTiles.has(tile.id) ? 'incoming' : ''}`}
                            data-set-id={set.id}
                            data-tile-id={tile.id}
                            data-is-okey={tileIsOkey ? 'true' : undefined}
                            onClick={tileIsOkey && isExpanded && selectedTileId ? () => handleSlotClick(set.id, 'end') : undefined}
                        >
                            {/* Yerdeki okey düz taş görünür: numarası / simgesi yazılmaz */}
                            {tileIsOkey ? null : tile.isJoker ? <JokerFace /> : tile.value}
                        </div>
                    );
                })}
                {isExpanded && hasEndSlot && (
                    <div
                        className={`insertion-slot ${activeSide === 'end' ? 'active' : ''}`}
                        data-set-id={set.id}
                        data-position="end"
                        onClick={() => handleSlotClick(set.id, 'end')}
                    />
                )}
            </div>
        );
    };

    return (
        <div className="open-sets-container">
            {players.map((p, index) => {
                const position = positionMap[index];
                const playerSets = getPlayerSets(p.id);

                if (playerSets.length === 0) return null;

                const seriSets = playerSets.filter(st => st.kind !== 'cift');
                // Dişi (sıralı) ve erkek (aynı sayı) perler ayrı dizilir: yanlarda sıralılar ortada, erkekler üstte/altta;
                // alt/üstte 2×2 tablo (soldan sağa, iki satır; 4'ten fazlada sütun eklenir): önce sıralılar, sonra erkekler
                const groupSets = seriSets.filter(st => isGroupSet(st, okeyTile, isHugo));
                const seqSets = seriSets.filter(st => !groupSets.includes(st));
                const isSide = position === 'left' || position === 'right';
                const list = (sets, cls = '', style) => sets.length > 0 && (
                    <div className={`open-sets-list ${cls}`} style={style}>{sets.map(renderSet)}</div>
                );
                const pairSets = playerSets.filter(st => st.kind === 'cift');

                return (
                    <div
                        key={p.id}
                        className={`open-sets-area open-sets-${position}`}
                    >
                        {isSide ? (
                            <>
                                {list(groupSets.filter((_, i) => i % 2 === 0), 'open-groups-list')}
                                {list(seqSets, 'open-seq-list')}
                                {list(groupSets.filter((_, i) => i % 2 === 1), 'open-groups-list')}
                            </>
                        ) : (
                            list([...seqSets, ...groupSets], 'open-seq-list open-table-list', { '--set-cols': Math.max(2, Math.ceil((seqSets.length + groupSets.length) / 2)) })
                        )}
                        {pairSets.length > 0 && (
                            // Istakadaki çift basılı tutulup buraya sürüklenince çiftler parlar: bırakınca çift işlenir
                            <div className={`open-sets-list open-pairs-list ${dragOverPairs && dragOverPairs === pairSets[0].id ? 'pair-drop' : ''}`}>
                                {pairSets.map(renderSet)}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default OpenSetsArea;
