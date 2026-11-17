# Yapılacaklar

Sonra gündeme getirilecek işler.

- [ ] **Botlara zorluk seviyesi**: masa sahibi YZ koltuğu eklerken kolay / orta / zor seçebilsin.
- [ ] **Sesler**: taş atma ve işleme sesleri; ayarlar menüsünden açılıp kapatılabilsin.
- [ ] **Elden bitme kuralı**: kural karışık; netleştirilip yeniden ele alınacak (bkz. `puanlama-ve-cezalar.md` bölüm 4).
- [ ] **Kısa oyun modu**: masa kurulurken ayarlardan 5 el ya da 9 el seçilebilsin (Hugo elleri 5 elde nasıl dağılacak netleştirilmeli).
- [x] **Oyuncu kimliği kayboluyor** (çözüldü: oturum localStorage'da + gizli anahtar, 2026-11-17): ana ekran uygulaması (iPhone) yeniden açılınca oyuncu her seferinde yeni kimlikle kaydoluyor
  (16.11'de Volkan 5 dakikada 4 farklı kimlik). Masadaki koltuğuna dönemiyor olabilir; kimliğin nerede saklandığına (localStorage / standalone) bakılacak.
- [ ] **Dosya yazımını kaldır (Postgres geçişinden 1 hafta sonra)**: `saveState` içindeki state.json yazımı, `EventLog` içindeki
  .jsonl yazımı ve `appendArchive` dosya yazımı kalkar; Admin `readDay` dosya yolu yalnızca DB'siz yerel geliştirmede kalır.
