# Requirements: Hugo Oyunu

**Defined:** 2026-03-16
**Core Value:** Oyunun belgelenmiş tüm kurallarını doğru uygulayan, puan hesaplamasının hatasız çalıştığı çok oyunculu deneyim

## v1 Requirements

### Puan Sistemi

- [ ] **PUAN-01**: Joker ile biten oyuncu, diğer oyuncuların anlık ceza puanlarını (penaltyScore) ×2 ile çarpar
- [ ] **PUAN-02**: Hugo turu (1., 5., 9. tur) × joker bitişi kombinasyonu doğru hesaplanır (×4)
- [ ] **PUAN-03**: Çarpan hesabı tek bir yerde (multiplier) yapılır, tüm kombinasyonlar doğru sonuç verir
- [ ] **PUAN-04**: Tur özeti ekranında (RoundSummary) joker bitişi çarpanı ayrı satır olarak gösterilir
- [ ] **PUAN-05**: Scoreboard'da her oyuncunun tur puanları, ceza puanları ve toplam puan doğru listelenir
- [ ] **PUAN-06**: Scoreboard'da çarpan uygulanan turlar görsel olarak belirtilir (Hugo/joker etiketi)

### Oyun Akışı

- [ ] **AKIS-01**: Gösterge taşı sahte okey (joker) çıkarsa o tur otomatik Hugo turu sayılır
- [ ] **AKIS-02**: 9. tur tamamlandığında oyun bitti ekranı açılır, kazanan en az puanlı oyuncu olarak gösterilir

## v2 Requirements

### Çift Kuralları

- **CIFT-01**: Aynı sayı ve renkteki taşlarla (çift) el açma yapılabilir (minimum toplam 52)
- **CIFT-02**: Çiftlere diğer oyuncular izinsiz taş işleyebilir
- **CIFT-03**: Çift ile biten oyuncu diğerlerinin tüm tur puanlarını ×2 çarpar

### Ek Ceza Kuralları

- **CEZA-01**: İşlenebilir taş atma cezası — açık perlere eklenebilecek bir taş atılırsa taş değeri ×10 ceza
- **CEZA-02**: Yandan alınan taş mutlaka o turda kullanılmalı, kullanılmadan tur bitmez

## Out of Scope

| Feature | Reason |
|---------|--------|
| Yapay zeka rakipler | Çok oyunculu deneyim öncelikli |
| Mobil uygulama | Web-first yaklaşım |
| Online eşleşme (matchmaking) | Oda sistemi yeterli |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PUAN-01 | Phase 1 | Pending |
| PUAN-02 | Phase 1 | Pending |
| PUAN-03 | Phase 1 | Pending |
| PUAN-04 | Phase 1 | Pending |
| PUAN-05 | Phase 1 | Pending |
| PUAN-06 | Phase 1 | Pending |
| AKIS-01 | Phase 1 | Pending |
| AKIS-02 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-16*
*Last updated: 2026-03-16 after initial definition*