import React, { useRef } from 'react';
import Tile from '../Tile/Tile';
import '../../assets/css/components/TileHolder.css';

const TileHolder = ({ tiles, tilePositions, onTileClick, onTileMove }) => {
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

        // Hedef hücreyi bul ve vurgula
        const cell = e.target.closest('.tile-cell');
        if (cell) {
            // Önceki vurguları temizle
            const row = cell.closest('.tile-row');
            row.querySelectorAll('.tile-cell').forEach(c => c.classList.remove('drag-over'));

            // Yeni hücreyi vurgula
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
            if (cell) {
                const tileData = JSON.parse(e.dataTransfer.getData('tile'));
                let targetIndex = parseInt(cell.dataset.index);

                // İkinci satır için offset ekle
                if (row === secondRowRef.current) {
                    targetIndex += CELLS_PER_ROW;
                }

                console.log(`Hedef hücre indeksi: ${targetIndex}, Satır: ${row === secondRowRef.current ? 'İkinci Satır' : 'Birinci Satır'}`);

                // İndeksi kontrol et
                if (targetIndex < 0 || targetIndex >= TOTAL_CELLS) {
                    console.error('Geçersiz hedef indeks:', targetIndex);
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

    const renderCell = (index) => {
        // İndeksi kontrol et
        if (index < 0 || index >= TOTAL_CELLS) {
            return null;
        }

        const tileId = tilePositions[index];
        const tile = tileId ? tilesMap[tileId] : null;

        return (
            <div
                key={index}
                className={`tile-cell ${!tile ? 'empty-cell' : ''}`}
                data-index={index % CELLS_PER_ROW}
            >
                {tile && (
                    <Tile
                        index={index}
                        value={tile.value}
                        color={tile.color}
                        onClick={() => onTileClick(index)}
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