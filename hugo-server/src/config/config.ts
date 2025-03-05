import dotenv from 'dotenv';

// .env dosyasını yükle
dotenv.config();

export const config = {
    port: process.env.PORT || 3001,
    origin: process.env.ORIGIN || 'http://localhost:5173',
    testMode: process.env.TEST_MODE === 'true',
    autoStartGame: process.env.AUTO_START_GAME === 'true',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

    // Oyun yapılandırmaları
    game: {
        maxPlayers: 4,
        minPlayers: 4,
        maxRooms: 10,
        inactivityTimeout: 5 * 60 * 1000, // 5 dakika
        turnTimeout: 60 * 1000, // 1 dakika
        maxRounds: 9,
        hugoRounds: [1, 5, 9], // Hugo turları
    }
}; 