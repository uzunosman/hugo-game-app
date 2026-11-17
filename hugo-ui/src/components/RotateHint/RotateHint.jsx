import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { canLockLandscape, enterLandscape, leaveLandscape } from '../../utils/orientation';

// Oyun yatay oynanır. Telefon dikey tutulursa bu ekran görünür (CSS: orientation: portrait).
// Destekleyen tarayıcıda (Android Chrome) tek dokunuşla tam ekran + yatay kilit; iOS'ta çevirmek yeterli.

const RotateHint = () => {
    const [lockable] = useState(canLockLandscape);

    // Oyun ekranından çıkınca (oda / lobi dikey) kilidi ve tam ekranı bırak
    useEffect(() => leaveLandscape, []);

    // Sayfanın gövdesine çizilir: ölçeklenen oyun sahnesinin değil, bütün ekranın üstünü örter
    return createPortal(
        <div className="rotate-hint" role="dialog" aria-label="Telefonu yatay çevir">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="7" y="2" width="10" height="20" rx="2" />
                <line x1="11" y1="18" x2="13" y2="18" />
            </svg>
            <span>Oyun yatay ekranda oynanır. Telefonunu yan çevir.</span>
            {lockable && <button type="button" onClick={enterLandscape}>Yatay ekrana geç</button>}
            <small>Ekran döndürme kilidi açıksa kapat.</small>
        </div>,
        document.body
    );
};

export default RotateHint;
