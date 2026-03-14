import React, { useState } from 'react';
import '../../assets/css/components/OpenSetsArea.css';

/**
 * Masadaki açık setleri 4 oyuncu alanında gösteren bileşen.
 * - Setler alt alta (dikey) sıralanır.
 * - Taş sürüklenip setin üzerine gelindiğinde taşlar normal boyuta büyür.
 * - Geçerli ekleme pozisyonları (insertion slot) gösterilir.
 * - Slot'a bırakıldığında onAddTileToSet(tileId, setId, position) tetiklenir.
 */

// ── Yardımcı fonksiyonlar ────────────────────────────────

function isSequentialSet(tiles) {
    const normal = tiles.filter(t => !t.isJoker);
    if (normal.length < 2) return tiles.length >= 3;
    const color = normal[0].color;
    if (!normal.every(t => t.color === color)) return false;
    const values = normal.map(t => t.value).sort((a, b) => a - b);
    for (let i = 1; i < values.length; i++) {
        if (values[i] - values[i - 1] > tiles.length - normal.length + 1) return false;
    }
    return true;
}

function isSameNumberSet(tiles) {
    const normal = tiles.filter(t => !t.isJoker);
    if (normal.length === 0) return false;
    const val = normal[0].value;
    return normal.every(t => t.value === val);
}

function getSetColor(tiles) {
    const normal = tiles.filter(t => !t.isJoker);
    return normal.length > 0 ? normal[0].color : null;
}

function getSetDirection(tiles) {
    const normal = tiles.filter(t => !t.isJoker && typeof t.value === 'number');
    if (normal.length < 2) return 1;
    let firstIdx = -1, firstVal = 0, secondIdx = -1, secondVal = 0;
    for (let i = 0; i < tiles.length; i++) {
        if (!tiles[i].isJoker) {
            if (firstIdx === -1) { firstIdx = i; firstVal = tiles[i].value; }
            else { secondIdx = i; secondVal = tiles[i].value; break; }
        }
    }
    if (secondIdx === -1) return 1;
    return secondVal > firstVal ? 1 : -1;
}

function getEdgeValues(tiles) {
    const dir = getSetDirection(tiles);
    const normal = tiles.filter(t => !t.isJoker && typeof t.value === 'number');
    if (normal.length === 0) return { startVal: null, endVal: null };

    let anchorIdx = -1, anchorVal = 0;
    for (let i = 0; i < tiles.length; i++) {
        if (!tiles[i].isJoker) { anchorIdx = i; anchorVal = tiles[i].value; break; }
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
function calculateValidPositions(set, activeTile) {
    if (!activeTile) return [];
    const positions = [];
    const tiles = set.tiles;

    if (isSequentialSet(tiles)) {
        const color = getSetColor(tiles);
        const { startVal, endVal } = getEdgeValues(tiles);

        // Kenar ekleme slot'ları
        if (startVal !== null && startVal >= 1 && startVal <= 13) {
            if (activeTile.isJoker || (activeTile.color === color && activeTile.value === startVal)) {
                positions.push({ position: 'start', displayValue: startVal, displayColor: color });
            }
        }
        if (endVal !== null && endVal >= 1 && endVal <= 13) {
            if (activeTile.isJoker || (activeTile.color === color && activeTile.value === endVal)) {
                positions.push({ position: 'end', displayValue: endVal, displayColor: color });
            }
        }

        // Okey swap: sette okey varsa, okey'in temsil ettiği değer ile eşleşen taş swap yapabilir
        if (!activeTile.isJoker) {
            const dir = getSetDirection(tiles);
            let anchorIdx = -1, anchorVal = 0;
            for (let i = 0; i < tiles.length; i++) {
                if (!tiles[i].isJoker) { anchorIdx = i; anchorVal = tiles[i].value; break; }
            }
            if (anchorIdx !== -1) {
                for (let i = 0; i < tiles.length; i++) {
                    if (tiles[i].isJoker) {
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
    } else if (isSameNumberSet(tiles)) {
        const normal = tiles.filter(t => !t.isJoker);
        const val = normal.length > 0 ? normal[0].value : 0;
        const hasOkey = tiles.some(t => t.isJoker);
        const existingColors = normal.map(t => t.color);
        const allColors = ['red', 'yellow', 'blue', 'black'];
        const missing = allColors.filter(c => !existingColors.includes(c));

        if (tiles.length < 4 && missing.length > 0) {
            // Normal ekleme: set henüz dolmamış
            if (activeTile.isJoker || (activeTile.value === val && missing.includes(activeTile.color))) {
                positions.push({
                    position: 'end',
                    displayValue: val,
                    displayColor: activeTile.isJoker ? missing[0] : activeTile.color
                });
            }
        } else if (tiles.length === 4 && hasOkey && missing.length > 0 && !activeTile.isJoker) {
            // Okey swap: set 4 taşlı ve okey içeriyor, eksik renk taşıyla değiştirilebilir
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

// ── Bileşen ──────────────────────────────────────────────

const OpenSetsArea = ({ tableSets, players, selectedTileId, activeTile, onAddTileToSet }) => {
    const [hoveredSetId, setHoveredSetId] = useState(null);

    const positionMap = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' };

    const getPlayerSets = (playerId) => tableSets.filter(s => s.playerId === playerId);

    // Seç & Tıkla: slot'a tıklanınca
    const handleSlotClick = (setId, position) => {
        if (selectedTileId && onAddTileToSet) {
            onAddTileToSet(selectedTileId, setId, position);
        }
    };

    // HTML5 DnD
    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDragEnter = (setId) => {
        setHoveredSetId(setId);
    };

    const handleDragLeave = (e, setId) => {
        const related = e.relatedTarget;
        const current = e.currentTarget;
        if (related && current.contains(related)) return;
        if (hoveredSetId === setId) setHoveredSetId(null);
    };

    const handleSlotDrop = (e, setId, position) => {
        e.preventDefault();
        e.stopPropagation();
        const tileId = e.dataTransfer.getData('text/tile-id');
        if (tileId && onAddTileToSet) {
            onAddTileToSet(tileId, setId, position);
        }
        setHoveredSetId(null);
    };

    // Mouse hover (select & click modu)
    const handleMouseEnter = (setId) => {
        if (selectedTileId) setHoveredSetId(setId);
    };

    const handleMouseLeave = (setId) => {
        if (hoveredSetId === setId) setHoveredSetId(null);
    };

    const isInteractive = !!selectedTileId || !!activeTile;

    return (
        <div className="open-sets-container">
            {players.map((p, index) => {
                const position = positionMap[index];
                const playerSets = getPlayerSets(p.id);

                if (playerSets.length === 0) return null;

                return (
                    <div
                        key={p.id}
                        className={`open-sets-area open-sets-${position}`}
                    >
                        <div className="open-sets-list">
                            {playerSets.map((set) => {
                                const isExpanded = hoveredSetId === set.id;
                                const validPositions = isExpanded
                                    ? calculateValidPositions(set, activeTile)
                                    : [];
                                const hasStartSlot = validPositions.some(p => p.position === 'start');
                                const hasEndSlot = validPositions.some(p => p.position === 'end');
                                const startSlot = validPositions.find(p => p.position === 'start');
                                const endSlot = validPositions.find(p => p.position === 'end');

                                return (
                                    <div
                                        key={set.id}
                                        className={`open-set-group ${isExpanded ? 'expanded' : ''} ${isInteractive ? 'droppable' : ''}`}
                                        data-set-id={set.id}
                                        onDragOver={handleDragOver}
                                        onDragEnter={() => handleDragEnter(set.id)}
                                        onDragLeave={(e) => handleDragLeave(e, set.id)}
                                        onMouseEnter={() => handleMouseEnter(set.id)}
                                        onMouseLeave={() => handleMouseLeave(set.id)}
                                    >
                                        {/* Başa ekleme slot'u */}
                                        {isExpanded && hasStartSlot && (
                                            <div
                                                className="insertion-slot"
                                                data-set-id={set.id}
                                                data-position="start"
                                                onClick={() => handleSlotClick(set.id, 'start')}
                                                onDragOver={handleDragOver}
                                                onDrop={(e) => handleSlotDrop(e, set.id, 'start')}
                                            />
                                        )}

                                        {/* Mevcut taşlar */}
                                        {set.tiles.map((tile) => (
                                            <div
                                                key={tile.id}
                                                className={`open-set-tile ${tile.color} ${tile.isJoker ? 'is-okey' : ''}`}
                                                data-set-id={set.id}
                                                data-is-okey={tile.isJoker ? 'true' : undefined}
                                                onDragOver={tile.isJoker && isExpanded ? handleDragOver : undefined}
                                                onDrop={tile.isJoker && isExpanded ? (e) => handleSlotDrop(e, set.id, 'end') : undefined}
                                                onClick={tile.isJoker && isExpanded && selectedTileId ? () => handleSlotClick(set.id, 'end') : undefined}
                                            >
                                                {tile.value}
                                            </div>
                                        ))}

                                        {/* Sona ekleme slot'u */}
                                        {isExpanded && hasEndSlot && (
                                            <div
                                                className="insertion-slot"
                                                data-set-id={set.id}
                                                data-position="end"
                                                onClick={() => handleSlotClick(set.id, 'end')}
                                                onDragOver={handleDragOver}
                                                onDrop={(e) => handleSlotDrop(e, set.id, 'end')}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default OpenSetsArea;
