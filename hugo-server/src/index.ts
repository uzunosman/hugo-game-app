import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config/config';
import { setupSocketHandlers } from './socket/socketHandler';
import { GameManager } from './utils/GameManager';
import { loadState, saveState } from './utils/Persistence';
import { adminToken } from './utils/Admin';
import { migrate, pool } from './db/db';
import { importFiles } from './db/importFiles';
import { flushEvents } from './utils/EventLog';

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
    // Görevlere ekran görüntüsü (yalnızca admin; tasks.ts'te resim başına 1,5 MB sınırı)
    // shortcut: sınır bütün bağlantılar için geçerli; oyuncu bağlantısına ayrı sınır gerekirse admin yüklemesi HTTP'ye taşınmalı
    maxHttpBufferSize: 3e6,
    cors: {
        origin: config.origin,
        methods: ['GET', 'POST'],
        credentials: true
    }
});


// Temel API rotası
app.get('/', (req, res) => {
    res.json({
        message: 'Hugo Oyunu API',
        version: '1.0.0',
        status: 'running'
    });
});

// Açılış: veritabanı şeması, ilk geçişte dosyaların aktarımı, kayıtlı oyun durumu; sonra Socket.IO ve dinleme
let ready = false; // durum yüklenmeden kapanırsa boş durum kaydın üzerine yazılmasın
const start = async () => {
    if (config.persist) {
        if (pool) {
            await migrate();
            await importFiles();
        }
        await loadState(GameManager.getInstance());
        adminToken(); // yönetim anahtarı dosyası yoksa şimdi üretilir
    }
    ready = true;
    setupSocketHandlers(io);
    const PORT = config.port;
    server.listen(PORT, () => {
        console.log(`Sunucu çalışıyor: http://localhost:${PORT} (${pool ? 'Postgres' : 'dosya'} kaydı)`);
        console.log(`CORS izin verilen origin: ${config.origin}`);
    });
};
// Veritabanına ulaşılamazsa sunucu açılmaz (systemd 2 sn sonra yeniden dener): eski dosya durumuyla açılıp veriyi ayırmaktan iyidir
start().catch((error) => { console.error('Sunucu açılamadı:', error); process.exit(1); });

// Kapanırken (deploy / yeniden başlatma) son hamleler de yazılır; açılışta masalar kaldığı yerden sürer
const shutdown = async () => {
    try {
        if (config.persist && ready) await saveState(GameManager.getInstance());
        await flushEvents();
        await pool?.end();
    } catch (error) { console.error('Kapanışta kayıt hatası:', error); }
    process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
