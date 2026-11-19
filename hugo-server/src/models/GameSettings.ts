// Masa ayarları (oyun modu). İleride masa açılırken seçilecek (örn. "yardımlı"); şimdilik bütün masalar varsayılanla oynar.
// Yeni ayar: buraya alan + varsayılan eklenir; Room.settings ile kaydedilir ve istemciye room.settings olarak gider.
export interface GameSettings {
    // Yardımlı: işlenebilir (işlek) taş atılamaz, elde işaretlenir. Kapalıysa atılır ve işlek cezası yazılır.
    assisted: boolean;
    // Sesli sohbet: masa açılırken seçilir; en az 2 gerçek oyuncu varken çalışır (admin açıp kapatabilir: Room.voiceOverride)
    voice: boolean;
    // Ziyarete açık: herkes masayı izleyebilir ve bütün elleri görür. Kapalıysa yalnızca masadakilerin arkadaşları izler,
    // o da yalnızca arkadaşının elini görür.
    spectators: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = { assisted: true, voice: false, spectators: false };

// Eksik / eski kayıttaki ayarlar varsayılanla tamamlanır
export const settingsOf = (s?: Partial<GameSettings> | null): GameSettings => ({ ...DEFAULT_SETTINGS, ...(s || {}) });
