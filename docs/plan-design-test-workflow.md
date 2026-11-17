# Plan: tasarım, test ve yayın akışı (task board + staging + scenario + Postgres)

Durum: onaylandı (2026-11-17). Faz 1 (Postgres) kodu hazır, VPS kurulumu bekliyor.

## Amaç
İstekler madde madde bir **task board**'da durur. Geliştirme bitince Claude **staging**'de (test.hugola.io) o işe özel bir
**test scenario** hazırlar: hazır taş dizilimi, hazır masa durumu, gerekirse sohbet geçmişi. Kullanıcı test eder ve sonucu
yazar: **Onay** (canlıya al), **Revize** (not ile geri) ya da **İptal**. Veriler JSON dosyaları yerine **Postgres**'te,
prod ve staging için iki ayrı veritabanında tutulur. Bütün bunlara yalnızca admin erişir.

## Profesyoneller nasıl yapıyor, biz neyi alıyoruz
| Profesyonel pratik | Bizdeki karşılığı |
|---|---|
| Issue tracker (Jira, Linear, GitHub Issues) | Admin içinde **Görevler** ekranı (`tasks` tablosu): senaryo ve test linki göreve bağlı |
| Feature branch + PR | Her görev için `task/<id>-<slug>` branch'i; onayda `main`'e merge |
| Staging / preview environment | `test.hugola.io`: ayrı servis, ayrı DB, canlı oyuncular etkilenmez |
| QA fixture / seed data | **Scenario**: JSON tanımından masa kurulur (eller, gösterge, deste, açılmış perler, sıra, chat) |
| Design tool (Figma) | Staging'de **design mode**: gerçek ekranda taşı / boyutla / font-renk değiştir / yeni öğe yer tutucusu koy |
| Release onayı | Görevde **Onay** → Claude prod'a deploy eder (CLAUDE.md kuralı sürer: onaysız deploy yok) |

Almadıklarımız: GitHub Actions ile otomatik deploy, ayrı preview ortamı (her branch için), Storybook. Tek kişilik ekip
için gereksiz yük. Gerekirse sonra eklenir.

## Akış
```
Yeni ──► Geliştiriliyor ──► Teste hazır ──► Onaylandı ──► Canlıda
  ▲                             │
  └──────── Revize ◄────────────┤
                                └──► İptal
```
1. Kullanıcı görevi yazar. İsterse design mode'da ekranda değişikliği yapar; çizim taslağı göreve eklenir.
2. Claude görevi okur (`npm run tasks` CLI ya da admin ekranı), branch açar, geliştirir, testleri koşar.
3. Claude branch'i staging'e deploy eder ve göreve bir ya da birkaç scenario bağlar. Görev **Teste hazır** olur.
4. Kullanıcı görevdeki "Test et" ile scenario'yu staging'de açar ve oynar.
5. Sonuç görevde yazılır: Onay / Revize (+ not, ekran görüntüsü) / İptal. Claude bir sonraki oturumda bunu okur.
   Kullanıcı aynı şeyi sohbette de söyleyebilir.
6. Onayda: merge, commit, prod deploy, görev **Canlıda**.

## Senin örneklerin bu akışta
- **Chat alanı:** Design mode'da chat kutusunu taşırsın, boyutlarsın, fontu küçültürsün, kaydedersin. Claude bunu CSS'e
  çevirir. Scenario "chat-test": 4 kişilik masa, 30 mesajlık geçmiş (uzun, kısa, emoji). **Seat switcher** ile Ali, Ayşe ya
  da bot adına yazarsın.
- **Çift işleme:** Scenario "pair-process-test": senin elinde 5 çift hazır, sıra sende. Sağdaki oyuncu çift açmış, yerde
  işlenebilir çiftler var. Önce kendin çift açarsın; sonra seat switcher ile başka oyuncunun yerine geçip onun açtığı
  perlere işlersin.
- **Yeni bir şey eklemek:** Design mode yeni özelliği kodlamaz ama **isteği ekranda tarif eder**: "Yeni öğe" ile boş bir
  kutu koyarsın (ör. "emoji butonu, buraya, bu boyutta") ve not yazarsın. Claude kodu yazar ve test için scenario hazırlar.
  Tasarım tarafında yeni kutu, taşıma, boyutlandırma ve stil (font, renk, kenar) desteklenir. Yeni davranış (ne yaptığı)
  her zaman kod işidir.

## Güvenlik
- **Staging tamamen kapalı:** `test.hugola.io` önünde Traefik basic auth (birinci kat). Staging sunucusu admin girişi
  olmayan socket'i reddeder (ikinci kat). Robotlar indekslemez.
- **Design mode, scenario, seat switcher ve tasks** yalnızca sunucu tarafında `socket.data.admin` kontrolüyle çalışır
  (mevcut `admin()` wrapper'ı). Scenario ve seat switcher **prod'da hiç açılmaz**: sunucu `APP_ENV=production` iken bu
  event'leri kaydetmez.
- **Kimlik:** Admin token yerine Postgres'te `admin_users` (parola hash'i, argon2/scrypt) ve oturum token'ı. Yanlış giriş
  sınırı sürer. Admin işlemleri `audit_log` tablosuna yazılır.
- **DB:** Postgres yalnızca sunucunun içinden erişilir (port dışa açık değil). Prod ve staging için ayrı rol ve ayrı
  parola; staging rolü prod DB'yi göremez. Her gece `pg_dump` yedeği alınır, 14 gün saklanır.

## Postgres veri modeli (ilk sürüm)
Kütüphane `pg` (node-postgres), ORM yok, `hugo-server/migrations/*.sql` ile düz SQL migration'lar.

| Tablo | İçerik | Bugün nerede |
|---|---|---|
| `players` | id, name, avatar, created_at, last_seen_at, device token | state.json |
| `rooms` | id, table_no, name, status, settings, created_at, closed_at | state.json |
| `game_snapshots` | room_id, state (jsonb), updated_at; restart sonrası geri yükleme | state.json |
| `events` | id, at, type, table_no, player_id, data (jsonb); günlük partition | events/*.jsonl |
| `tasks` | id, title, body, status, branch, created_at, updated_at | yok |
| `task_notes` | task_id, author, kind (revize/onay/not), body, attachments | yok |
| `scenarios` | id, task_id, name, definition (jsonb) | yok |
| `layout_drafts` | id, task_id, viewport (phone/tablet/desktop), changes (jsonb) | yok |
| `admin_users`, `admin_sessions`, `audit_log` | admin girişi ve kayıt | admin-token dosyası |

Oyunun anlık durumu yine bellekte kalır (hız için). DB'ye şimdiki gibi değişiklikte yazılır. Event log satır satır
`INSERT` yerine 1 saniyelik batch ile yazılır. Günlük istatistik (`stats.ts`) SQL sorgusuna döner. Event adları ve alanları
dil kuralına göre İngilizceye çevrilir (`istek` → `request`, `masa` → `table`…). Admin ekranı da buna göre güncellenir.

## Fazlar
Her faz ayrı ayrı onaylanır ve canlıya alınır.

**Faz 1: Postgres (prod + staging DB)**
- VPS'te mevcut Traefik/Caddy compose stack'ine `postgres:17` container'ı eklenir: yalnızca localhost, volume, iki DB, iki
  rol. Gece yedeği için cron.
- `hugo-server`: `pg` bağlantısı, migration runner, `Persistence` ve `EventLog` DB'ye yazacak şekilde değişir. Mevcut
  state.json ve .jsonl dosyaları bir kerelik import script'iyle DB'ye taşınır.
- Geçiş masa yokken (gece) yapılır. Bir hafta boyunca dosyaya da yazılır (geri dönüş yolu).
- Oyuncu kimliği kaybolma sorunu bu fazda kalıcı **device token** ile (localStorage + DB) çözülür. `yapilacaklar.md`'deki
  madde kapanır.

**Faz 2: Staging ortamı (test.hugola.io)**
- `/opt/hugo-staging`, `hugo-staging` systemd servisi (port 3002), `APP_ENV=staging`, staging DB.
- Traefik route + basic auth; Caddy'de ikinci site.
- `./deploy/update.sh --staging <branch>`: branch'i staging'e kurar. Ekranın sağ altında "STAGING · branch · sürüm"
  etiketi görünür.

**Faz 3: Scenario + seat switcher (yalnız staging)**
- Scenario tanımı (JSON): koltuklar (insan/bot, ad), her elin taşları, gösterge, deste sırası, yerdeki perler, atılan
  taşlar, sıra ve eylem, el numarası, puanlar, chat geçmişi.
- `admin:loadScenario`: tanımdan odayı kurar. Sunucudaki `Game`'i doğrudan doldurur; kural motoru aynen çalışır.
- **Seat switcher:** Admin tek tarayıcıdan 4 koltuğun herhangi birine geçer (oyna, chat yaz, el aç). Diğer koltuklar
  botsa "bot dursun / oynasın" seçeneği vardır.
- "Scenario'yu sıfırla" düğmesi; aynı testi tekrar tekrar başa sarmak için.
- Sunucu testi: her scenario tanımı yüklenir ve kural doğrulaması (taş sayıları 106, ellerde tekrar yok) geçer.

**Faz 4: Görevler ekranı (admin içinde)**
- Liste: duruma göre filtre. Detayda madde madde istek, notlar, bağlı scenario'lar, layout taslakları ve "Test et"
  (staging'de scenario'yu açar).
- Butonlar: Onayla / Revize iste (not + ekran görüntüsü) / İptal.
- Claude tarafı: `npm run tasks` (ssh üzerinden DB'den okur ve durum günceller). Claude yeni oturumda açık görevleri buradan
  görür.

**Faz 5: Design mode (yalnız staging)**
- `?design` ile açılır; ekrandaki işaretli parçalar seçilebilir hâle gelir (ıstaka, deste, gösterge, chat, oyuncu
  kartları, butonlar…). Bunun için bileşenlere `data-design="chat"` gibi işaretler eklenir.
- Seçilen parçada: sürükle, köşeden boyutla, panelden font boyutu, renk, kenar, opaklık.
- "Yeni öğe": isim + not ile yer tutucu kutu.
- Değişiklikler canlı önizlenir (CSS override). Kaydet → göreve `layout_draft` olarak eklenir; telefon, tablet ve masaüstü
  ayrı ayrı kaydedilir.
- Claude taslağı okur, kalıcı CSS'e çevirir (yatay/dikey ve ekran boyutları için) ve staging'e kurar. Taslak hiçbir zaman
  prod'a doğrudan uygulanmaz.

## Senden gerekenler (root / hesap işleri)
- DNS: `test.hugola.io` A kaydı → 31.97.38.250
- VPS'te root: Postgres container'ı, `hugo-staging` servisi, sudoers'a `systemctl restart hugo-staging`. Komutları Claude
  hazır yazar, sen çalıştırırsın.
- Staging basic auth parolası ve admin parolası: sen belirlersin, Claude görmez.

## Riskler
- Faz 1 canlı veriyi taşır: önce yerelde prod kopyası üzerinde prova yapılır, geçişte dosya yedeği tutulur.
- Postgres yaklaşık 200–400 MB RAM kullanır; VPS'te 8 GB var, sorun değil.
- Design mode'un ürettiği taslak "ne istendiğini" gösterir; kalıcı CSS'e çeviri her ekran boyutunda kontrol edilmelidir
  (taş çakışmasız yerleşim `tableFit.js` ile etkileşir).
- Tek staging ortamı var: aynı anda tek görev test edilir.
  shortcut: tek staging, aynı anda iki görev test edilecekse branch başına preview ortamı eklenir.
