import React, { useEffect, useRef, useState } from 'react';
import '../../assets/css/components/Tile.css';

const Tile = ({ value, color, onClick, index, tile, isDiscarded, canDrag, discardedFrom }) => {
    const tileRef = useRef(null);
    const [prevIndex, setPrevIndex] = useState(index);

    // Eğer tile prop'u verilmişse, value ve color değerlerini tile'dan al
    const tileValue = tile ? tile.value : value;
    const tileColor = tile ? tile.color : color;

    // Atılan taşlar için log
    if (isDiscarded) {
        console.log("Discarded tile render:", {
            tileValue,
            tileColor,
            isDiscarded,
            canDrag,
            discardedFrom,
            index
        });
    }

    const handleDragStart = (e) => {
        // Atılan taşlar sadece canDrag true ise sürüklenebilir
        console.log("Drag start attempt:", {
            isDiscarded,
            canDrag,
            tileValue,
            tileColor,
            discardedFrom
        });

        // Sürükleme kontrolünü kaldıralım (test için)
        // if (isDiscarded && !canDrag) {
        //     e.preventDefault();
        //     return;
        // }

        try {
            const rect = e.target.getBoundingClientRect();
            // Mouse'u taşın merkezine konumlandır
            e.dataTransfer.setDragImage(e.target, rect.width / 2, rect.height / 2);

            // Sürüklenen taşın bilgilerini saklayalım
            const tileData = {
                value: tileValue,
                color: tileColor,
                sourceIndex: index,
                isDiscarded: isDiscarded,
                discardedFrom: discardedFrom
            };

            console.log('Sürükleme başladı:', tileData);

            // Taş verisini text/plain formatında ayarla
            const tileDataString = JSON.stringify(tileData);
            e.dataTransfer.setData('text/plain', tileDataString);
            e.dataTransfer.setData('tile', tileDataString);

            // Sürükleme efektini ayarla
            e.dataTransfer.effectAllowed = 'move';

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
        if (tileRef.current && prevIndex !== index && !isDiscarded) {
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
    }, [index, prevIndex, isDiscarded]);

    return (
        <div
            ref={tileRef}
            className={`tile ${tileColor} ${isDiscarded ? 'discarded' : ''} ${canDrag && isDiscarded ? 'can-drag' : ''}`}
            onClick={handleClick}
            draggable="true"
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            data-index={index}
            data-discarded-from={discardedFrom}
        >
            {tileValue}
        </div>
    );
};

export default Tile; 