# Hugo (101 okey çeşidi) — çalışma notları

4 kişilik, 9 elli çok oyunculu taş oyunu. Canlı: https://hugola.io

## İletişim
- Kullanıcıyla Türkçe konuş. Kullanıcı çoğunlukla telefondan test edip yazar; yazım hataları ve oyun jargonu olur
  (per, çift, işlemek, işlek, okey, sahte okey, gösterge, kusmak/Kustu, yandan/yerden almak, elden bitmek, silici/yıldız, ıstaka).
- Belirsiz bir kural isteğinde yorumunu açıkça yaz ve sonuçta onayla.
- Dil kuralı: konuşma ve mesajlar Türkçe; teknik terimler (deploy, staging, branch, migration, socket…) İngilizce jargonla
  kullanılır, çevrilmez. Yeni kodda dosya, klasör, değişken, fonksiyon, tablo ve kolon adları İngilizce. Arayüzde oyuncunun
  gördüğü metinler ve kod yorumları Türkçe kalır. Mevcut Türkçe adlar dokunulan yerde fırsat oldukça İngilizceye çevrilir.

## Yapı
- `hugo-server/`: Node + TypeScript + Socket.IO. Kurallar ve puanlama tamamen sunucuda (`src/models/Game.ts`), olaylar `src/socket/socketHandler.ts`,
  yapay zekâ `src/ai/`, durum `state.json`'a yazılır (yeniden başlatmada oyunlar korunur).
- `hugo-ui/`: React + Vite. Masa `components/GameBoard`, sürükle-bırak `hooks/useBoardDrag.js`, taş animasyonları `utils/flyTiles.js`,
  oyun durumu `hooks/useGameState.js`, yerleşim (taş çakışmasız) `utils/tableFit.js`.
- `docs/puanlama-ve-cezalar.md`: geçerli puanlama ve ceza kuralları (tek kaynak). Kural değişince bu belgeyi ve
  `docs/hugo-puanlama-ve-cezalar.xlsx` dosyasını güncelle (Excel, md'deki tablolardan üretilir).
- `docs/yapilacaklar.md`: sonraya bırakılan işler.

## Komutlar
- Sunucu: `cd hugo-server && npm run dev` (port 3001), testler `npm test`, uçtan uca `npx ts-node scripts/e2e-{ai,bots,leave,lobby}.ts`
- Arayüz: `cd hugo-ui && npm run dev`, testler `npm test`, `npx eslint src`, `npx vite build`
- Kural değişikliğinde `hugo-server/src/models/Rules.selftest.ts` içine test ekle.

## Canlıya alma
- Commit, push ve prod deploy yalnızca kullanıcı açıkça "canlıya al" / "deploy et" dediğinde. Staging deploy
  (`./deploy/update.sh --staging`) test için serbest: geliştirme bitince kullanıcı testine hazırlamak için yapılır.
- `./deploy/update.sh`: kodu VPS'e kopyalar, orada derler, servisi yeniden başlatır; sürüm `v1.<commit sayısı> <hash>` olarak
  ekranın sağ altında görünür. Deploy'dan önce commit at (sürüm numarası commit sayısından gelir).
- VPS (`ssh hugola`, kullanıcı `deploy`): yalnızca `sudo systemctl restart hugo` yetkisi var; root gerektiren işleri kullanıcı yapar.
  Sunucuda değişiklik öncesi izin al. Günlük: `ssh hugola 'journalctl -u hugo -n 100 --no-pager'`
  (istemci hata / donma kayıtları `İstemci [ad]:` ile başlar).
- Veritabanı: Postgres 17 (VPS'te `hugo-db` container'ı, 127.0.0.1:5432), `hugo_prod` ve `hugo_staging`. Servis
  `DATABASE_URL`'i `/etc/hugo/hugo.env`'den alır (systemd drop-in `hugo.service.d/db.conf`); kurulum `deploy/postgres-setup.sh`
  (root). Şema `hugo-server/migrations/*.sql`, açılışta otomatik uygulanır (`src/db/db.ts`). `DATABASE_URL` yoksa (testler,
  yerel) dosyalara yazılır. Tablolar: `app_state` (masalar/oyunlar, eski state.json), `players`, `archived_rooms`, `events`.
  Gece yedeği `/var/backups/hugo` (14 gün).
- Oyun kaydı: `events` tablosu (`type` = eski `ev`: her istek `istek`, masaya giden her olay `masa`, el başında eller ve
  deste sırası `dagitim`; `table_no` = masa numarası #101701). Geçiş haftası boyunca `/var/lib/hugo/events/*.jsonl`'a da yazılır.
  Günlük istatistik: `ssh hugola 'cd /opt/hugo/hugo-server && set -a && . /etc/hugo/hugo.env && node dist/tools/stats.js [YYYY-MM-DD]'`
- Staging: https://test.hugola.io (parola korumalı, Caddy basic_auth). `./deploy/update.sh --staging` o anki branch'i
  `/opt/hugo-staging`'e kurar, `hugo-staging` servisi (port 3002, `APP_ENV=staging`, `hugo_staging` DB). Kurulum
  `deploy/staging-setup.sh` (root). Akış: görev → branch → staging → kullanıcı testi → onayda merge + prod deploy
  (`docs/plan-design-test-workflow.md`).
- Lab (yalnızca staging / yerel, admin anahtarıyla; prod'da kapalı): lobide "Test senaryoları", oyunda koltuk çubuğu
  (koltuk değiştir, sıfırla, adımlar). Senaryolar `hugo-server/scenarios/*.json` (taş kodları `r5`, `k13`, `j`; biçim
  `src/lab/scenario.ts`). Her yeni test isteği için bir senaryo yaz; `npm test` her senaryoyu kurar (106 taş kontrolü).
  Staging'de sunucu admin anahtarsız bağlantıyı reddeder (`admin-required`), arayüz anahtarı sorar.
- Masa ayarları (oyun modu): `hugo-server/src/models/GameSettings.ts` (`room.settings`, istemciye `room.settings`). Şimdilik
  hepsi varsayılan; ileride masa açılırken seçilecek. `assisted` (yardımlı, açık): işlek taşın sağ üst köşesi mor, kıvrık (ambalaj açılışı gibi) ve
  atılamaz (sunucu `Game.islekBlocked`, istemci `isIslekTile`); elde başka atılabilecek taş yoksa eski kural (ceza).
- Görevler (Faz 4): kullanıcı isteklerini https://hugola.io/admin → Görevler'e yazar (prod DB: `tasks`, `task_notes`,
  `task_attachments`). Oturum başında açık görevlere bak; araç:
  `ssh hugola 'cd /opt/hugo/hugo-server && set -a && . /etc/hugo/hugo.env && node dist/tools/tasks.js list'`
  (`show <id>`, `start <id> [not]`, `ready <id> --scenario a,b [--branch x] [not]`, `done <id> [not]`, `note <id> <not>`,
  `attachments <id> <klasör>` → sonra scp ile al, Read ile bak). Akış: görev → `start` → geliştir + senaryo yaz →
  staging deploy → `ready --scenario` → kullanıcı "Test et" (staging `?scenario=`) → Onay / Revize → onayda
  "canlıya al" beklenir → deploy → `done`. Test: `TEST_DATABASE_URL=… npx ts-node scripts/e2e-tasks.ts`.
- Yönetim ekranı: https://hugola.io/admin (menü: Panel · Görevler `/admin/tasks` · Geçmiş `/admin/history`). Panel: masaları
  canlı izle / gizli izle, oyuncu kaldır (koltuk 15 sn bekler), yapay zekâ ekle, masa sohbeti (Yönetici olarak yaz), kapat,
  duyuru, günlük istatistik, sorunlar. Geçmiş: oyuncu → oyunları → el tablosu → elin dağıtımı ve hamleleri (`utils/History.ts`). Veriler Socket.IO
  `admin:*` isteklerinden; anahtar `/var/lib/hugo/admin-token` (ya da `ADMIN_TOKEN`). Sunucu: `src/utils/Admin.ts`, arayüz: `components/Admin`.

## Sesli sohbet
- WebRTC, oyuncular arası doğrudan (mesh); sunucu yalnızca `voice:join` / `voice:signal` / `voice:peer-*` aktarır
  (`socketHandler.ts`), istemci `utils/voice.js` + `hooks/useVoice.js` (Room'da kurulur: bekleme ekranında başlar, oyunda sürer), sekmeler `components/Voice`; konuşan avatarı yeşil parlar. Masa açarken seçilir (`settings.voice`), en az
  2 gerçek oyuncuyla açılır (`Room.voiceActive`); admin aç / kapat / otomatik (`voiceOverride`). Durum değişince `room:voice`.
- Bağlantı sunucusu yalnızca STUN (Google). TURN yok: bazı mobil / kurumsal ağlarda bağlantı kurulamayabilir;
  kurulursa `TURN_URL`, `TURN_USER`, `TURN_PASS` (systemd ortamı). Test: `scripts/e2e-voice.ts` (sinyal), ses gerçek cihazda.

## Ekran (sahne)
- Oyun ekranı her cihazda aynı: referans kullanıcının iPhone 14'ü, ana ekran uygulaması yatay = 750×390 CSS px. Ekran bu
  ölçüde çizilir (`html.stage`, `utils/stage.js`) ve görünen alana orantılı sığdırılır; oranı farklı ekranda kenarda masa
  rengi boşluk kalır. Telefon yatay tasarımı (`mobile.css`, eskiden media query) artık hep `html.stage` altında.
- Yeni oyun ekranı CSS'inde `vw` / `dvh` yerine `var(--stage-w)` / `var(--stage-h)`; gövdeye eklenen kopyalar (uçan taş vb.)
  `stageRoot()`'a eklenir, ekran koordinatı `toStage()` ile çevrilir.
- Tasarım değişikliğinde kullanıcıyı farklı cihazlarda nasıl görüneceği konusunda uyar (Android, küçük / büyük iPhone, tablet).

## Dikkat
- Animasyonlar `utils/flyTiles.js` (`PLACE_MS`): işlenen taş bırakıldığı / ıstakadaki yerden pere süzülür (sürükleyerek
  işlemede per taş oturana kadar büyük kalır: `holdSet`); diğer oyuncunun çektiği taş desteden / yerden kartına uçar
  (`flyToPlayer`); işleme cezası üstten bildirim yerine taşın üstünde patlar (`utils/penaltyBurst.js`).
- Istakadan çıkan taş sunucu cevabına kadar gizli kalır; reddedilirse geri kayar (`GameBoard` hide / rejectId).
- Yapay zekâ adımları arası bekleme `BOT_STEP_MS` (testlerde 0); çekme-atma arası `DRAW_GAP_MS` (1,25 sn).
- Tek gerçek oyuncu 3 yapay zekâya karşı oynarken koparsa masa kapanmaz: sırası 2 saat bekler (`SOLO_AWAY_TURN_MS`), dönmezse
  otomatik oynanır; kopmasından 6 saat sonra hâlâ yoksa masa kapanır (`SOLO_AWAY_MAX_MS`). Test: `scripts/e2e-solo.ts`.
