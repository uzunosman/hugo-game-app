import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config/config';
import { setupSocketHandlers } from './socket/socketHandler';
import { GameManager } from './utils/GameManager';
import { loadState, saveState } from './utils/Persistence';
import { adminToken } from './utils/Admin';

// Express uygulaması oluştur
const app = express();

// CORS yapılandırması
app.use(cors({
    origin: config.origin,
    methods: ['GET', 'POST'],
    credentials: true
}));

// JSON middleware
app.use(express.json());

// HTTP sunucusu oluştur
const server = http.createServer(app);

// Socket.IO sunucusu oluştur
const io = new Server(server, {
    cors: {
        origin: config.origin,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Kayıtlı oyun durumu varsa yükle, sonra Socket.IO işleyicilerini ayarla
if (config.persist) loadState(GameManager.getInstance());
if (config.persist) adminToken(); // yönetim anahtarı dosyası yoksa şimdi üretilir
setupSocketHandlers(io);

// Temel API rotası
app.get('/', (req, res) => {
    res.json({
        message: 'Hugo Oyunu API',
        version: '1.0.0',
        status: 'running'
    });
});

// Sunucuyu başlat
const PORT = config.port;
server.listen(PORT, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
    console.log(`Socket.IO bağlantısı: ws://localhost:${PORT}`);
    console.log(`CORS izin verilen origin: ${config.origin}`);
}); 
// Kapanırken (deploy / yeniden başlatma) son hamleler de diske yazılır; açılışta masalar kaldığı yerden sürer
const shutdown = () => {
    try { if (config.persist) saveState(GameManager.getInstance()); } catch (error) { console.error('Kapanışta kayıt hatası:', error); }
    process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
