import React, { useRef } from 'react';
import Tile from '../Tile/Tile';
import '../../assets/css/components/TileHolder.css';

const TileHolder = ({ tiles, tilePositions, onTileClick, onTileMove, onTileDoubleClick, onDrawDiscardedTile, onDrawFromDeck, selectedTileIndex, onTileDragStart, onTileDragEnd }) => {
    const firstRowRef = useRef(null);
    const secondRowRef = useRef(null);

    // Sabit 30 hücre oluştur (15 x 2 satır)
    const TOTAL_CELLS = 30;
    const CELLS_PER_ROW = 15;

    // Taşları ID'lerine göre bir Map'e dönüştür
    const tilesMap = {};
    tiles.forEach(tile => {
        tilesMap[tile.id] = tile;
    });

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const cell = e.target.closest('.tile-cell');
        if (cell) {
            const row = cell.closest('.tile-row');
            row.querySelectorAll('.tile-cell').forEach(c => c.classList.remove('drag-over'));
            cell.classList.add('drag-over');
        }
    };

    const handleDragLeave = (e) => {
        const cell = e.target.closest('.tile-cell');
        if (cell) {
            cell.classList.remove('drag-over');
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const cell = e.target.closest('.tile-cell');
        const row = e.currentTarget;

        try {
            console.log('Drop event:', e);
            console.log('Drop target:', e.target);
            console.log('Cell:', cell);
            console.log('Row:', row);

            // dataTransfer'dan veriyi al
            let tileDataString = e.dataTransfer.getData('tile');
            if (!tileDataString) {
                tileDataString = e.dataTransfer.getData('text/plain');
            }

            console.log('Tile data string:', tileDataString);

            if (!tileDataString) {
                console.error('Taş verisi bulunamadı');
                return;
            }

            const tileData = JSON.parse(tileDataString);

            // Desteden sürüklenerek bırakılan taş — cell olmasa bile ilk boş slota yerleştir
            if (tileData.isFromDeck) {
                let targetIndex = tilePositions.findIndex(pos => pos === null);
                if (cell) {
                    let cellIndex = parseInt(cell.dataset.index);
                    if (row === secondRowRef.current) cellIndex += CELLS_PER_ROW;
                    if (!tilePositions[cellIndex]) targetIndex = cellIndex;
                }
                if (targetIndex === -1) return;
                if (onDrawFromDeck) onDrawFromDeck(targetIndex);
                return;
            }

            if (cell) {
                let targetIndex = parseInt(cell.dataset.index);

                // İkinci satır için offset ekle
                if (row === secondRowRef.current) {
                    targetIndex += CELLS_PER_ROW;
                }

                console.log(`Hedef hücre indeksi: ${targetIndex}, Satır: ${row === secondRowRef.current ? 'İkinci Satır' : 'Birinci Satır'}`);
                console.log('Mevcut taş pozisyonları:', tilePositions);

                // İndeksi kontrol et
                if (targetIndex < 0 || targetIndex >= TOTAL_CELLS) {
                    console.error('Geçersiz hedef indeks:', targetIndex);
                    return;
                }

                // Köşeden sürüklenerek bırakılan atılan taş
                if (tileData.isDiscarded) {
                    if (tilePositions[targetIndex]) {
                        const emptyIndex = tilePositions.findIndex(pos => pos === null);
                        if (emptyIndex !== -1) {
                            targetIndex = emptyIndex;
                        } else {
                            console.error('Boş hücre bulunamadı, taş bırakılamaz');
                            return;
                        }
                    }
                    onDrawDiscardedTile(tileData.discardedFrom, tileData.sourceIndex, targetIndex);
                    return;
                }

                if (tileData.sourceIndex < 0 || tileData.sourceIndex >= TOTAL_CELLS) {
                    console.error('Geçersiz kaynak indeks:', tileData.sourceIndex);
                    return;
                }

                console.log(`Taş taşınıyor: ${tileData.sourceIndex} -> ${targetIndex}`);

                // Taşı hareket ettir
                onTileMove(tileData.sourceIndex, targetIndex);
            }
        } catch (error) {
            console.error('Taş taşıma sırasında hata:', error);
        } finally {
            // Vurguları temizle
            row.querySelectorAll('.tile-cell').forEach(c => c.classList.remove('drag-over'));
        }
    };

    // Boş hücreye dokunma/tıklama — seçili taş varsa oraya taşı
    const handleEmptyCellClick = (index) => {
        if (selectedTileIndex !== null && selectedTileIndex !== undefined) {
            onTileClick(index);
        }
    };

    const renderCell = (index) => {
        // İndeksi kontrol et
        if (index < 0 || index >= TOTAL_CELLS) {
            return null;
        }

        const tileId = tilePositions[index];
        const tile = tileId ? tilesMap[tileId] : null;
        const isSelected = selectedTileIndex === index;

        return (
            <div
                key={index}
                className={`tile-cell ${!tile ? 'empty-cell' : ''} ${isSelected ? 'cell-selected' : ''}`}
                data-index={index % CELLS_PER_ROW}
                onClick={!tile ? () => handleEmptyCellClick(index) : undefined}
            >
                {tile && (
                    <Tile
                        index={index}
                        tileId={tileId}
                        value={tile.value}
                        color={tile.color}
                        isSelected={isSelected}
                        onClick={() => onTileClick(index)}
                        onDoubleClick={() => onTileDoubleClick && onTileDoubleClick(index)}
                        onDragStartCallback={() => onTileDragStart?.(index)}
                        onDragEndCallback={() => onTileDragEnd?.()}
                    />
                )}
            </div>
        );
    };

    // Sadece 30 hücre render et
    const firstRowIndices = Array(CELLS_PER_ROW).fill(null).map((_, i) => i);
    const secondRowIndices = Array(CELLS_PER_ROW).fill(null).map((_, i) => i + CELLS_PER_ROW);

    return (
        <div className="tile-holder-container">
            <div className="tile-holder">
                <div
                    ref={firstRowRef}
                    className="tile-row first-row"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {firstRowIndices.map(index => renderCell(index))}
                </div>
                <hr className="tile-row-divider" />
                <div
                    ref={secondRowRef}
                    className="tile-row second-row"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {secondRowIndices.map(index => renderCell(index))}
                </div>
            </div>
        </div>
    );
};

export default TileHolder; 