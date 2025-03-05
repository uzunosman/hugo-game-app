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

1. İstemci uygulamasını açın ve bir kullanıcı adı ile giriş yapın.
2. Lobi ekranında yeni bir oda oluşturun veya mevcut bir odaya katılın.
3. Odada "Hazır" butonuna tıklayarak hazır olduğunuzu belirtin.
4. Oda sahibi, tüm oyuncular hazır olduğunda "Oyunu Başlat" butonuna tıklayabilir.
5. Oyun başladığında, sıranız geldiğinde desteden veya atılan taşlardan bir taş çekebilirsiniz.
6. Elinizden bir taş seçip "Seçili Taşı At" butonuna tıklayarak taş atabilirsiniz.
7. Oyun, bir oyuncu Hugo yapana kadar devam eder.

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