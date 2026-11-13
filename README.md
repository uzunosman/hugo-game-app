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
4. "Seri diz" perleri, "Çift diz" çiftleri yan yana dizer; toplamlar "El Aç" / "Çift Aç" butonlarında görünür.
   Açtıktan sonra yeni perleri tek butonla ("Perleri indir") masaya indirirsin.
5. 9 el sonunda en düşük toplam puan kazanır.

Kurallar `document.txt` içindedir (sondaki "Netleşen kurallar" bölümü esastır). Elde kalan taşlar
normal elde × 10 sayılır; Hugo, okeyle bitme, çiftten bitme ve elden bitme her biri × 2 ekler. Çiftlerin
toplamı 51 ve üstüyse "Çift Aç" ile açılır; elindeki çifti başkasının çiftlerine işlersen sahibine
(toplam × 10) × 2 ceza yazılır. Önemli olanlar: yandan alınan taş o turda kullanılmalıdır
(kullanılmazsa yalnızca o taş 100 cezayla geri atılabilir), işlenebilir taş atmak taş × 10 ceza,
yetersiz değerle açma denemesi 100 ceza. Sıra süresi 60 sn; süre dolunca sunucu taş çekip en küçük
taşı atar. Bağlantısı kopan oyuncunun koltuğu tutulur, sayfa yenilenince aynı koltuğa dönülür.
Oyun durumu `hugo-server/data/state.json` dosyasına yazılır; sunucu yeniden başlasa da masalar kaldığı yerden sürer.

## Test

```
cd hugo-server
npm test           # tur akışı, kural motoru ve kalıcılık öz-testleri
npm test           # + yapay zekâ planlayıcı öz-testi
npm run test:e2e   # 4 bot 9 eli oynar (süre aşımı, yeniden bağlanma, sunucu yeniden başlatma dahil);
                   # ardından 1 insan + 3 yapay zekâ 9 el (yapay zekânın eli gizli, onun adına hamle yapılamaz)

cd hugo-ui
npm test           # ıstaka mantığı (satır ayrımı, kaydırma, otomatik dizme)
```

Ortam değişkenleri (sunucu): `TEST_MODE=true` eli başlatana hazır bir açılış eli verir
(`TEST_HAND=cift` ile çift eli),
`TURN_TIMEOUT_MS` sıra süresi, `DISCONNECTED_TURN_MS` kopuk oyuncunun sırası,
`PERSIST=false` durumu diske yazmayı kapatır, `STATE_FILE` durum dosyasının yolu,
`BOT_THINK_MS` yapay zekânın düşünme payı (varsayılan 900 ms; bu ile 2 katı arası).

## El ve oyun sonu

- Her el sonunda kıraathane tabelası açılır; 5 sn sonra yeni el başlar (`ROUND_BREAK_MS`), tabela oyuncu kapatana kadar kalır.
- 9. elden sonra tabela 5 sn görünür, masa oda ekranına döner; puanlar sıfırlanır. Yeni oyun için insan oyuncular
  yeniden **Hazırım** der (yapay zekâ hazırdır), masa sahibi başlatır. Sunucu, herkes hazır olmadan oyunu başlatmaz.
- Sağ üstteki tabelada oynanmış bir ele tıklanınca o elin dökümü (elde kalan, cezalar, okey, çarpan, yıldız, el puanı)
  ve o elde yazılan cezaların listesi açılır.
- Sol altta masa sohbeti: yalnızca masadaki oyuncular yazar/okur, 200 karakter sınırı, son 50 mesaj bellekte tutulur.

## Yapay zekâ oyuncu

Masa sahibi, oda ekranında boş koltuktaki **Yapay zekâ ekle** ile oyuncu ekler (oyun başlamadan, × ile çıkarır).
Yapay zekâ tamamen sunucuda oynar (`hugo-server/src/ai/AiPlanner.ts`, sıra gelince `socketHandler` içindeki `botTurn`):
desteden çeker, eşiği geçiyorsa açar, per indirir, masadaki perlere işler, per adayı olmayan en küçük taşı atar (okeyi atmaz).
Soketi yoktur; eli hiçbir istemciye gönderilmez. Sunucu her oyun olayında isteği gönderen soketin o oyuncuya ait olduğunu
denetler, bu yüzden tarayıcı konsolundan ne yapay zekâ ne de başka bir oyuncu adına hamle yapılabilir ya da el okunabilir.
İstemci: `VITE_SOCKET_URL` sunucu adresi (varsayılan `http://localhost:3001`).

**Per taşıma:** ıstakada bir taşa basılı tutunca (yaklaşık yarım saniye) o taşın boşlukla ayrılmış bloğu (per) seçilir ve sürüklenince bütün olarak taşınır; masaüstünde fareyle, telefonda parmakla. Per yalnızca ıstakaya bırakılır, gittiği yerde başka taş varsa yerinde kalır.

**Masadan kalk:** oyun sürerken sağ üstteki kapı simgesi. Onaylayınca koltuk (eli, puanı, sırası) yapay zekâya geçer ve oyun sürer;
oyuncu lobiye yeni bir kimlikle döner. Masa sahibi kalkarsa sahiplik masadaki bir insana geçer; insan kalmazsa masa kapanır.

## Lobi ve masa yönetimi

- İlk ekran lobidir: masalar ve oturanlar kayıt olmadan görünür. Boş koltuğa (ya da "Masa aç"a) tıklayınca ad sorulur; varsayılan bir avatar atanır, istenirse değiştirilir.
- Yapay zekâ hiçbir zaman masa sahibi olmaz. Sahip ayrılırsa sahiplik masadaki bir insana geçer; sahip, yetkiyi bekleme ekranından başka bir oyuncuya ("Sahipliği ver") devredebilir.
- Masalar şu durumlarda kapatılır (arşivlenir, lobide görünmez):
  - masada yalnızca yapay zekâ kaldıysa,
  - 30 dakika boyunca hiçbir insan hamlesi olmadıysa (`IDLE_ROOM_MS`),
  - oyun bitti ve 10 dakika içinde yeniden başlamadıysa (`FINISHED_ROOM_MS`).
- Kapatılan masanın özeti (oyuncular, puanlar, el geçmişi) durum dosyasının yanındaki `archive.jsonl` dosyasına satır olarak eklenir (yayında `/var/lib/hugo/archive.jsonl`). Masadakiler lobiye döner ve kapanma nedenini görür.

## Yayına alma (VPS, Ubuntu 24.04)

Kod Mac'ten kopyalanır, GitHub gerekmez. Sunucuda Node 22, Caddy (80 portu) ve `hugo` servisi kurulur.

1. Hostinger panelinde VPS'e **Ubuntu 24.04** kur, IP adresini ve root şifresini al.
2. Mac'te bir kez SSH anahtarını sunucuya ekle (şifreyi bir kez sorar): `ssh-copy-id root@SUNUCU_IP`
3. Alan adının DNS'inde `@` ve `www` için A kaydını sunucu IP'sine yönlendir (eski A/AAAA/CNAME kayıtlarını sil).
4. Proje klasöründe: `./deploy/deploy.sh root@SUNUCU_IP hugola.io` (alan adı hatırlanır; sonraki güncellemelerde yazmaya gerek yok, alan adı yoksa boş bırak ve `http://SUNUCU_IP` kullan)
5. Tarayıcıda `https://hugola.io` aç. HTTPS sertifikasını Caddy kendisi alır ve yeniler.

Güncellemek için 4. adımı tekrar çalıştır. Masalar korunur (`/var/lib/hugo/state.json`).
Kayıtlar: `ssh root@SUNUCU_IP journalctl -u hugo -f`

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