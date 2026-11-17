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
- Commit, push ve deploy yalnızca kullanıcı açıkça "canlıya al" / "deploy et" dediğinde.
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
- Yönetim ekranı: https://hugola.io/admin (masaları canlı izle, kapat, duyuru, günlük istatistik, sorunlar). Veriler Socket.IO
  `admin:*` isteklerinden; anahtar `/var/lib/hugo/admin-token` (ya da `ADMIN_TOKEN`). Sunucu: `src/utils/Admin.ts`, arayüz: `components/Admin`.

## Dikkat
- Oynayan oyuncu kendi işleme ve sürükleyerek atma animasyonunu görmez; diğer oyuncular görür. Çift tıkla atma, yere per açma,
  desteden / yerden tıklayarak çekme ve ıstakaya bırakma animasyonludur (`PLACE_MS`).
- Istakadan çıkan taş sunucu cevabına kadar gizli kalır; reddedilirse geri kayar (`GameBoard` hide / rejectId).
- Yapay zekâ adımları arası bekleme `BOT_STEP_MS` (testlerde 0).
