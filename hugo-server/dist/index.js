"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const config_1 = require("./config/config");
const socketHandler_1 = require("./socket/socketHandler");
// Express uygulaması oluştur
const app = (0, express_1.default)();
// CORS yapılandırması
app.use((0, cors_1.default)({
    origin: config_1.config.origin,
    methods: ['GET', 'POST'],
    credentials: true
}));
// JSON middleware
app.use(express_1.default.json());
// HTTP sunucusu oluştur
const server = http_1.default.createServer(app);
// Socket.IO sunucusu oluştur
const io = new socket_io_1.Server(server, {
    cors: {
        origin: config_1.config.origin,
        methods: ['GET', 'POST'],
        credentials: true
    }
});
// Socket.IO işleyicilerini ayarla
(0, socketHandler_1.setupSocketHandlers)(io);
// Temel API rotası
app.get('/', (req, res) => {
    res.json({
        message: 'Hugo Oyunu API',
        version: '1.0.0',
        status: 'running'
    });
});
// Sunucuyu başlat
const PORT = config_1.config.port;
server.listen(PORT, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
    console.log(`Socket.IO bağlantısı: ws://localhost:${PORT}`);
    console.log(`CORS izin verilen origin: ${config_1.config.origin}`);
});
