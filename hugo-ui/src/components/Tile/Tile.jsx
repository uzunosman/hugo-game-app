import React from 'react';
import '../../assets/css/components/Tile.css';

const Tile = ({ value, color, onClick, index }) => {
    const handleDragStart = (e) => {
        try {
            const rect = e.target.getBoundingClientRect();
            // Mouse'u taşın merkezine konumlandır
            e.dataTransfer.setDragImage(e.target, rect.width / 2, rect.height / 2);

            // Sürüklenen taşın bilgilerini saklayalım
            const tileData = {
                value,
                color,
                sourceIndex: index
            };
            e.dataTransfer.setData('tile', JSON.stringify(tileData));

            // Sürükleme sırasında görsel geri bildirim
            e.target.style.opacity = '0.5';
        } catch (error) {
            console.error('Sürükleme başlatılırken hata:', error);
        }
    };

    const handleDragEnd = (e) => {
        // Sürükleme bittiğinde opaklığı geri alalım
        e.target.style.opacity = '1';
    };

    const handleClick = (e) => {
        if (onClick) {
            const rect = e.target.getBoundingClientRect();
            // Mouse'u taşın merkezine konumlandır
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // Mouse'u merkeze taşı
            const event = new MouseEvent('mousemove', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: centerX,
                clientY: centerY
            });
            document.dispatchEvent(event);

            onClick();
        }
    };

    return (
        <div
            className={`tile ${color}`}
            onClick={handleClick}
            draggable="true"
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            data-index={index}
        >
            {value}
        </div>
    );
};

export default Tile; 