# Hugo Oyunu

Bu repo, Hugo taş oyununun çok oyunculu bir versiyonunu içerir. Proje, bir Node.js sunucu uygulaması (Hugo Server) ve bir React istemci uygulaması (Hugo UI) olmak üzere iki ana bileşenden oluşmaktadır.

## Proje Yapısı

- `hugo-server/`: Node.js, Express, Socket.IO ve TypeScript ile geliştirilmiş sunucu uygulaması
- `hugo-ui/`: React, Vite ve TypeScript ile geliştirilmiş istemci uygulaması

## Özellikler

- Gerçek zamanlı çok oyunculu oyun deneyimi
- Oda oluşturma ve yönetme
- Oyuncu kaydı ve yönetimi
- Taş çekme ve atma mekanizmaları
- Hugo oyun kuralları uygulaması

## Kurulum ve Çalıştırma

### Sunucu (Hugo Server)

1. Sunucu klasörüne gidin:
   ```
   cd hugo-server
   ```

2. Bağımlılıkları yükleyin:
   ```
   npm install
   ```

3. `.env` dosyasını oluşturun:
   ```
   PORT=3001
   ORIGIN=http://localhost:5173
   TEST_MODE=false
   AUTO_START_GAME=false
   CLIENT_URL=http://localhost:5173
   ```

4. Uygulamayı derleyin:
   ```
   npm run build
   ```

5. Sunucuyu başlatın:
   ```
   npm start
   ```

   Geliştirme modunda çalıştırmak için:
   ```
   npm run dev
   ```

### İstemci (Hugo UI)

1. İstemci klasörüne gidin:
   ```
   cd hugo-ui
   ```

2. Bağımlılıkları yükleyin:
   ```
   npm install
   ```

3. Uygulamayı geliştirme modunda başlatın:
   ```
   npm run dev
   ```

4. Tarayıcınızda `http://localhost:5173` adresine giderek uygulamayı kullanabilirsiniz.

## Oyun Nasıl Oynanır

1. İsminle masaya otur, lobide bir masa aç ya da açık bir masaya katıl.
2. Odada "Hazırım"a bas; 4 kişi hazır olunca masa sahibi "Oyunu başlat"a basar.
3. Sıran gelince desteden ya da solundaki oyuncunun attığı taştan çek, sonra bir taşı kendi köşene at
   (sürükle-bırak, çift tıklama ya da dokunmatikte: taşa dokun, sonra köşene dokun).
4. "Seri diz" / "Çift diz" ıstakayı otomatik dizer; per toplamı "El Aç" butonunda görünür.
5. 9 el sonunda en düşük toplam puan kazanır.

Kurallar `document.txt` içindedir. Önemli olanlar: yandan alınan taş o turda kullanılmalıdır
(kullanılmazsa yalnızca o taş 100 cezayla geri atılabilir), işlenebilir taş atmak taş × 10 ceza,
yetersiz değerle açma denemesi 100 ceza. Sıra süresi 60 sn; süre dolunca sunucu taş çekip en küçük
taşı atar. Bağlantısı kopan oyuncunun koltuğu tutulur, sayfa yenilenince aynı koltuğa dönülür.
Oyun durumu `hugo-server/data/state.json` dosyasına yazılır; sunucu yeniden başlasa da masalar kaldığı yerden sürer.

## Test

```
cd hugo-server
npm test           # tur akışı, kural motoru ve kalıcılık öz-testleri
npm run test:e2e   # sunucuyu 3099'da başlatır, 4 bot 9 eli oynar (süre aşımı, yeniden bağlanma ve sunucu yeniden başlatma dahil)

cd hugo-ui
npm test           # ıstaka mantığı (satır ayrımı, kaydırma, otomatik dizme)
```

Ortam değişkenleri (sunucu): `TEST_MODE=true` eli başlatana hazır bir açılış eli verir,
`TURN_TIMEOUT_MS` sıra süresi, `DISCONNECTED_TURN_MS` kopuk oyuncunun sırası,
`PERSIST=false` durumu diske yazmayı kapatır, `STATE_FILE` durum dosyasının yolu.
İstemci: `VITE_SOCKET_URL` sunucu adresi (varsayılan `http://localhost:3001`).

## Geliştirme

### Sunucu (Hugo Server)

Proje yapısı:
- `src/config`: Yapılandırma dosyaları
- `src/models`: Veri modelleri (Oyuncu, Oda, Taş, Oyun)
- `src/socket`: Socket.IO olay işleyicileri
- `src/utils`: Yardımcı sınıflar ve fonksiyonlar

### İstemci (Hugo UI)

Proje yapısı:
- `src/components`: React bileşenleri
- `src/services`: Servisler (Socket.IO bağlantısı vb.)

## Lisans

Bu proje MIT lisansı altında lisanslanmıştır. 