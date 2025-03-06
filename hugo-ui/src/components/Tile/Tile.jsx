import React, { useEffect, useRef, useState } from 'react';
import '../../assets/css/components/Tile.css';

const Tile = ({ value, color, onClick, index }) => {
    const tileRef = useRef(null);
    const [prevIndex, setPrevIndex] = useState(index);

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

            console.log('Sürükleme başladı:', tileData);
            e.dataTransfer.setData('tile', JSON.stringify(tileData));

            // Sürükleme sırasında taşı gizle
            setTimeout(() => {
                if (tileRef.current) {
                    tileRef.current.style.visibility = 'hidden';
                }
            }, 0);
        } catch (error) {
            console.error('Sürükleme başlatılırken hata:', error);
        }
    };

    const handleDragEnd = (e) => {
        // Sürükleme bittiğinde taşı tekrar göster
        if (tileRef.current) {
            tileRef.current.style.visibility = 'visible';
        }
    };

    const handleClick = (e) => {
        if (onClick) {
            onClick();
        }
    };

    // Taş pozisyonu değiştiğinde animasyon ekle
    useEffect(() => {
        if (tileRef.current && prevIndex !== index) {
            // Taşın hareket yönünü belirle
            const direction = index > prevIndex ? 'right' : 'left';

            // Önceki animasyon sınıflarını temizle
            tileRef.current.classList.remove('slide-left', 'slide-right');

            // Yeni animasyon sınıfını ekle
            tileRef.current.classList.add(`slide-${direction}`);

            // Animasyon bittikten sonra sınıfı kaldır
            const timer = setTimeout(() => {
                if (tileRef.current) {
                    tileRef.current.classList.remove(`slide-${direction}`);
                }
            }, 300);

            // Önceki indeksi güncelle
            setPrevIndex(index);

            return () => clearTimeout(timer);
        }
    }, [index, prevIndex]);

    return (
        <div
            ref={tileRef}
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