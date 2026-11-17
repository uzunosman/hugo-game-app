# Hugo (101 okey çeşidi) — çalışma notları

4 kişilik, 9 elli çok oyunculu taş oyunu. Canlı: https://hugola.io

## İletişim
- Kullanıcıyla Türkçe konuş. Kullanıcı çoğunlukla telefondan test edip yazar; yazım hataları ve oyun jargonu olur
  (per, çift, işlemek, işlek, okey, sahte okey, gösterge, kusmak/Kustu, yandan/yerden almak, elden bitmek, silici/yıldız, ıstaka).
- Belirsiz bir kural isteğinde yorumunu açıkça yaz ve sonuçta onayla.

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
- Oyun kaydı: `/var/lib/hugo/events/YYYY-MM-DD.jsonl` (her istek `ev:"istek"`, masaya giden her olay `ev:"masa"`, el başında
  eller ve deste sırası `dagitim`; masa `#101701` gibi `masa` numarasıyla). Günlük istatistik:
  `ssh hugola 'cd /opt/hugo/hugo-server && STATE_FILE=/var/lib/hugo/state.json node dist/tools/stats.js [YYYY-MM-DD]'`

## Dikkat
- Oynayan oyuncu kendi işleme ve sürükleyerek atma animasyonunu görmez; diğer oyuncular görür. Çift tıkla atma, yere per açma,
  desteden / yerden tıklayarak çekme ve ıstakaya bırakma animasyonludur (`PLACE_MS`).
- Istakadan çıkan taş sunucu cevabına kadar gizli kalır; reddedilirse geri kayar (`GameBoard` hide / rejectId).
- Yapay zekâ adımları arası bekleme `BOT_STEP_MS` (testlerde 0).
