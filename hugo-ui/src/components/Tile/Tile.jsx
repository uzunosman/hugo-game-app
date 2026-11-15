import React, { useEffect, useRef, useState } from 'react';
import '../../assets/css/components/Tile.css';
import JokerFace from './JokerFace';

// Taş görünümü. Sürükleme useBoardDrag'dadır (Pointer Events); burada HTML5 sürükle-bırak yok.
const Tile = ({ value, color, onClick, onDoubleClick, index, tile, isDiscarded, canDrag, discardedFrom, isSelected, isFlipped, isOkey, onContextMenu }) => {
    const tileRef = useRef(null);
    const [prevIndex, setPrevIndex] = useState(index);

    // Eğer tile prop'u verilmişse, value ve color değerlerini tile'dan al
    const tileValue = tile ? tile.value : value;
    const tileColor = tile ? tile.color : color;

    const handleClick = () => {
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
            className={`tile ${tileColor} ${tile?.isJoker ? 'is-joker' : ''} ${isDiscarded ? 'discarded' : ''} ${canDrag && isDiscarded ? 'can-drag' : ''} ${isSelected ? 'selected' : ''} ${isFlipped ? 'tile-flipped' : ''} ${isOkey ? 'is-okey' : ''}`}
            onClick={handleClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            title={onContextMenu ? (isFlipped ? 'Okey (kapalı) · çift tık: aç' : 'Okey · çift tık: kapat') : undefined}
            draggable="false"
            data-index={index}
            data-discarded-from={discardedFrom}
            data-tile-id={tile?.id}
        >
            {!isFlipped && (tile?.isJoker ? <JokerFace /> : tileValue)}
        </div>
    );
};

export default Tile; 