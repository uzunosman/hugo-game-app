import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config/config';
import { setupSocketHandlers } from './socket/socketHandler';

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

// Socket.IO işleyicilerini ayarla
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