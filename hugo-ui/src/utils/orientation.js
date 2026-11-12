// Tam ekran + yatay kilit (Android Chrome). iOS ve masaüstü kilidi reddeder: kullanıcı telefonu çevirir.
export const canLockLandscape = () =>
    typeof screen !== 'undefined' && !!screen.orientation?.lock && !!document.documentElement.requestFullscreen;

export const enterLandscape = async () => {
    try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        await screen.orientation.lock('landscape');
    } catch {
        /* kilit reddedildi */
    }
};

export const leaveLandscape = () => {
    try { screen.orientation?.unlock?.(); } catch { /* desteklenmiyor */ }
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
};

// Dokunmatik telefon (yatay ya da dikey)
export const isTouchPhone = () =>
    !!window.matchMedia?.('(pointer: coarse) and (max-width: 950px), (pointer: coarse) and (max-height: 500px)').matches;
