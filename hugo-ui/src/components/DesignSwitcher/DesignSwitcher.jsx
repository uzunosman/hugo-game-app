import React, { useEffect, useState } from 'react';
import '../../assets/css/themes.css';

// shortcut: taslak seçici; bir tasarım seçilince bu bileşen ve themes.css'teki diğer taslaklar silinir
const DESIGNS = [
    { id: '', label: 'Mevcut' },
    { id: 'kiraathane', label: 'Kıraathane' },
    { id: 'gece', label: 'Gece' },
    { id: 'cini', label: 'Çini' },
    { id: 'karatahta', label: 'Kara tahta' },
];
const KEY = 'hugo.uiDraft';

const read = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };

const DesignSwitcher = () => {
    const [ui, setUi] = useState(read);
    useEffect(() => {
        if (ui) document.documentElement.dataset.ui = ui;
        else delete document.documentElement.dataset.ui;
        try { localStorage.setItem(KEY, ui); } catch { /* özel pencere: yalnızca bu oturum */ }
    }, [ui]);

    return (
        <div className="ui-switcher" role="group" aria-label="Tasarım taslağı">
            <span>Taslak</span>
            {DESIGNS.map(d => (
                <button key={d.id || 'mevcut'} type="button" aria-pressed={ui === d.id} onClick={() => setUi(d.id)}>
                    {d.label}
                </button>
            ))}
        </div>
    );
};

export default DesignSwitcher;
