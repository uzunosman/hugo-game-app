import React, { useEffect, useRef, useState } from 'react';
import '../../assets/css/themes.css';

// Ayarlar: masa görünümü (tasarım şablonu) seçimi. Varsayılan "Mevcut".
const DESIGNS = [
    { id: '', label: 'Mevcut', swatch: ['#0097b2', '#ffbd59'] },
    { id: 'kiraathane', label: 'Kıraathane', swatch: ['#1f5e3b', '#8b5a33'] },
    { id: 'gece', label: 'Gece', swatch: ['#17224a', '#f2b134'] },
    { id: 'cini', label: 'Çini', swatch: ['#1d3f8f', '#12908b'] },
    { id: 'karatahta', label: 'Kara tahta', swatch: ['#2f4038', '#d9b27c'] },
];
const KEY = 'hugo.uiDraft';
const read = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };

const DesignSwitcher = () => {
    const [ui, setUi] = useState(read);
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
        if (ui) document.documentElement.dataset.ui = ui;
        else delete document.documentElement.dataset.ui;
        try { localStorage.setItem(KEY, ui); } catch { /* özel pencere: yalnızca bu oturum */ }
    }, [ui]);

    // Dışarı tıklayınca ya da Esc ile kapanır
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    return (
        <div className="settings" ref={rootRef}>
            <button
                type="button"
                className="settings-toggle"
                aria-label="Ayarlar"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
            </button>
            {open && (
                <div className="settings-menu" role="menu" aria-label="Ayarlar">
                    <div className="settings-title">Masa görünümü</div>
                    {DESIGNS.map(d => (
                        <button
                            key={d.id || 'mevcut'}
                            type="button"
                            role="menuitemradio"
                            aria-checked={ui === d.id}
                            className="settings-option"
                            onClick={() => setUi(d.id)}
                        >
                            <span className="swatch" aria-hidden="true">
                                <i style={{ background: d.swatch[0] }} /><i style={{ background: d.swatch[1] }} />
                            </span>
                            {d.label}
                            {ui === d.id && <span className="check" aria-hidden="true">✓</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DesignSwitcher;
