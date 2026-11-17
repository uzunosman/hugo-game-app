import dotenv from 'dotenv';

// .env dosyasını yükle
dotenv.config();

export const config = {
    port: process.env.PORT || 3001,
    // İzin verilen arayüz adresleri, virgülle birden çok (örn. yerel + ağ + yayın adresi)
    origin: (process.env.ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean),
    testMode: process.env.TEST_MODE === 'true',
    // TEST_MODE açılış eli: 'seri' (11-12-13 + üç 9) ya da 'cift' (13'ler, 12'ler, 1'ler, sarı 7'ler çifti)
    testHand: process.env.TEST_HAND === 'cift' ? 'cift' : 'seri',
    autoStartGame: process.env.AUTO_START_GAME === 'true',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    // Oyun durumu diske yazılır (data/state.json); kapatmak için PERSIST=false
    persist: process.env.PERSIST !== 'false',
    // Ortam: production (hugola.io), staging (test.hugola.io; yalnızca admin bağlanır), development
    appEnv: process.env.APP_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
    // Lab (test senaryoları, koltuk değiştirme): prod'da hiç açılmaz
    get lab() { return this.appEnv !== 'production'; },

    // Oyun yapılandırmaları
    game: {
        maxPlayers: 4,
        minPlayers: 4,
        maxRooms: 10,
        inactivityTimeout: 5 * 60 * 1000, // 5 dakika
        turnTimeout: Number(process.env.TURN_TIMEOUT_MS) || 60 * 1000, // 1 dakika (testte kısaltılabilir)
        disconnectedTurnTimeout: Number(process.env.DISCONNECTED_TURN_MS) || 3000, // kopuk oyuncunun sırası
        roundBreakMs: Number(process.env.ROUND_BREAK_MS) || 5000, // el / oyun sonu tabelası süresi
        botThinkMs: Number(process.env.BOT_THINK_MS) || 900, // yapay zekânın düşünme payı (bu ile 2 katı arası)
        // Yapay zekânın masaya oynadığı adımlar arası bekleme: diğer oyuncular uçuş animasyonunu bitmiş görür (testte 0)
        botStepMs: process.env.BOT_STEP_MS !== undefined ? Number(process.env.BOT_STEP_MS) : 700,
        // Taş çekme ile atma arası bekleme (yapay zekâ ve süresi dolan oyuncu): çekilen taşın uçuşu görünsün (testte 0)
        drawGapMs: process.env.DRAW_GAP_MS !== undefined ? Number(process.env.DRAW_GAP_MS) : 1250,
        // Masa arşivleme: insan hamlesi olmadan bu süre geçerse, ya da oyun bitip yeniden başlamazsa
        idleRoomMs: Number(process.env.IDLE_ROOM_MS) || 30 * 60 * 1000,
        finishedRoomMs: Number(process.env.FINISHED_ROOM_MS) || 10 * 60 * 1000,
        roomSweepMs: Number(process.env.ROOM_SWEEP_MS) || 60 * 1000,
        maxRounds: 9,
        hugoRounds: [1, 5, 9], // Hugo turları
    }
}; 