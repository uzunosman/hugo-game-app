import dotenv from 'dotenv';

// .env dosyasını yükle
dotenv.config();

export const config = {
    port: process.env.PORT || 3001,
    origin: process.env.ORIGIN || 'http://localhost:5173',
    testMode: process.env.TEST_MODE === 'true',
    // TEST_MODE açılış eli: 'seri' (11-12-13 + üç 9) ya da 'cift' (13'ler, 12'ler, 1'ler çifti = 52)
    testHand: process.env.TEST_HAND === 'cift' ? 'cift' : 'seri',
    autoStartGame: process.env.AUTO_START_GAME === 'true',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    // Oyun durumu diske yazılır (data/state.json); kapatmak için PERSIST=false
    persist: process.env.PERSIST !== 'false',

    // Oyun yapılandırmaları
    game: {
        maxPlayers: 4,
        minPlayers: 4,
        maxRooms: 10,
        inactivityTimeout: 5 * 60 * 1000, // 5 dakika
        turnTimeout: Number(process.env.TURN_TIMEOUT_MS) || 60 * 1000, // 1 dakika (testte kısaltılabilir)
        disconnectedTurnTimeout: Number(process.env.DISCONNECTED_TURN_MS) || 3000, // kopuk oyuncunun sırası
        maxRounds: 9,
        hugoRounds: [1, 5, 9], // Hugo turları
    }
}; 