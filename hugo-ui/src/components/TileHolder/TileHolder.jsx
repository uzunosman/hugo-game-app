import React, { useRef } from 'react';
import Tile from '../Tile/Tile';
import '../../assets/css/components/TileHolder.css';

const TileHolder = ({ tiles, onTileClick, onTileMove }) => {
    const firstRowRef = useRef(null);
    const secondRowRef = useRef(null);

    // İlk 15 hücre
    const firstRow = Array(15).fill(null).map((_, index) => tiles[index]);
    // Son 15 hücre
    const secondRow = Array(15).fill(null).map((_, index) => tiles[index + 15]);

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
                    targetIndex += 15;
                }

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

    const renderRow = (rowTiles, startIndex) => {
        return Array(15).fill(null).map((_, index) => (
            <div
                key={index}
                className="tile-cell"
                data-index={index}
            >
                {rowTiles[index] && (
                    <Tile
                        index={startIndex + index}
                        value={rowTiles[index].value}
                        color={rowTiles[index].color}
                        onClick={() => onTileClick(startIndex + index)}
                    />
                )}
            </div>
        ));
    };

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
                    {renderRow(firstRow, 0)}
                </div>
                <hr className="tile-row-divider" />
                <div
                    ref={secondRowRef}
                    className="tile-row second-row"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {renderRow(secondRow, 15)}
                </div>
            </div>
        </div>
    );
};

export default TileHolder; 