# Phase 1: Fix Scoring Multipliers - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Çarpan hesaplama mantığını düzelterek joker bitişinin el taşı çarpanını (×2), Hugo turu çarpanını (×2), ve Hugo+Joker kombinasyonunu (×4) doğru hesaplamak. Ayrıca mevcut handScore hesaplama hatasını (×2 → ×10) düzeltmek ve "kapalı el" bitişi özel durumunu implement etmek. Bu faz yalnızca backend Game.ts mantığını kapsar; UI gösterimi Phase 2'de ele alınacak.

</domain>

<decisions>
## Implementation Decisions

### Hand Score Hesabı (Mevcut Kod Yanlış)

- El AÇMAMIŞ oyuncu: 400 sabit ceza
- El AÇMIŞ ama taşı kalan oyuncu: `tile.value × 10` her taş için (mevcut kod `tile.value × 2` kullanıyor — BUG)
- Örnek: 5 değerli taş = 50 puan (normal, joker yok, Hugo yok)

### Joker Bitiş Çarpanı (×2)

- Tetikleyici: Finisher'ın son attığı taş joker (`tile.isJoker === true`)
- Tespit yöntemi: `finishedWithJoker: boolean` flag'i — discardPile kontrolü değil
- Kapsam: YALNIZCA diğer oyuncuların `handScore` bileşenine uygulanır
- UYGULANMAZ: penaltyScore (işleme cezaları), openBonus, finishBonus
- Finisher'ın kendi puanına etki etmez
- Hesaplama: `effectiveHandScore = handScore × jokerMult` (jokerMult = 2 ise joker bitiş)

### Hugo Turu Çarpanı (×2)

- Tetikleyici: 1., 5., 9. turlar (`isHugoRound()` mevcut kod doğru)
- Kapsam: TÜM rawTotal'e uygulanır (handScore + penaltyScore + openBonus + finishBonus)
- Mevcut kod mantığı doğru, değişiklik gerekmez

### Hugo + Joker Kombinasyonu (×4)

- El taşları: `handScore × jokerMult × hugoMult` = tile × 10 × 2 × 2 = tile × 40
- Ceza puanları: `penaltyScore × hugoMult` = yalnızca Hugo ×2 (joker cezaları etkilemez)
- El açmamış: 400 × 2 × 2 = 1600
- Multiplier field gösterimi: `multiplier = hugoMult × jokerMult` (tek sayı: 1, 2 veya 4)

### Kapalı El Bitiş Özel Durumu (Yeni)

- Koşul: Bir oyuncu bitirdiğinde HİÇBİR başka oyuncu el açmamışsa (isOpen = false)
- Ceza: Açmamış diğer oyuncular 400 yerine **800** alır
- Çarpanlar yine uygulanır: Hugo × 800 = 1600, Joker × 800 = 1600, Hugo+Joker × 800 = 3200
- Bu özel durum şu an kodda yok — Phase 1'e eklenmeli

### Yıldız Sistemi (Yeni — Backend)

Yıldızlar her tur hesaplanır ve o turun `roundTotal`'inden düşülür.

**Yıldız kazanma koşulları:**

| Koşul | Yıldız |
|-------|--------|
| Tur açılışı 100+ puan | +1 |
| Normal bitiş | +1 |
| Joker ile bitiş | +2 (normal yerine) |
| Hugo turunda bitiş | +2 (normal yerine) |
| Kimse açmadan bitiş | +2 (normal yerine) |
| Hugo + Joker ile bitiş | +4 |
| Hugo + Kimse açmadan | +4 |
| Joker + Kimse açmadan | +4 |
| Hugo + Joker + Kimse açmadan | +8 |

**Bitiş yıldızı çarpım kuralı:** Her bonus koşul ×2 yapar — tüm geçerli koşullar çarpılır (1 × 2 × 2 × 2 = 8 gibi).

**Uygulama:** `roundTotal = rawTotal * hugoMult - stars * 100`
→ Yıldız düşümü `hugoMult` uygulandıktan SONRA yapılır.
→ `stars * 100` negatife gidemez (min 0 kontrolü).

**RoundResult'a eklenmesi gereken alan:** `stars: number`

### roundTotal Formülü (Her Oyuncu İçin)

```
// Finisher olmayan oyuncular:
handScore = !player.isOpen ? closedHandPenalty : sum(tile.value * 10)
// closedHandPenalty = (noOtherPlayersOpened ? 800 : 400)
effectiveHandScore = handScore * jokerMult   // jokerMult: 2 if finishedWithJoker, else 1
rawTotal = effectiveHandScore + penaltyScore + openBonus + finishBonus
preMult = rawTotal * hugoMult                // hugoMult: 2 if Hugo round, else 1
stars = (player.openingScore >= 100 ? 1 : 0) // yıldız: 100+ açma
roundTotal = preMult - (stars * 100)         // yıldız düşümü
multiplier = hugoMult * jokerMult            // for RoundResult display field

// Finisher:
rawTotal = 0 + penaltyScore + openBonus + finishBonus  // jokerMult doesn't apply
preMult = rawTotal * hugoMult
stars = finishStars                          // jokerMult_star * hugoMult_star * closedMult_star
// finishStars: 1 × (finishedWithJoker?2:1) × (isHugoRound?2:1) × (noOtherPlayersOpened?2:1)
roundTotal = preMult - (stars * 100)
multiplier = hugoMult * jokerMult
```

### RoundResult Interface Değişiklikleri

- `multiplier: number` field korunur (combined multiplier: 1, 2 veya 4)
- `stars: number` field eklenmeli (o tur kazanılan yıldız sayısı)
- `finishedWithJoker` bilgisi endRound()'a parametre olarak iletilmeli (veya Game state'e eklenmeli)

### Claude'un İnisiyatifine Bırakılanlar

- `finishedWithJoker` flag'inin Game sınıfında nasıl tutulacağı (alan mı, parametre mi)
- `noOtherPlayersOpened` kontrolünün endRound() içindeki yeri
- `checkRoundEnd()` / `endRound()` method imzalarının refactor detayı
- `openingScore` alanının Player'da nasıl takip edileceği (el açma anındaki skor)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Oyun Kuralları
- `document.txt` — Puanlama sistemi, çarpan kuralları (Hugo, joker, çift), taş değerleri, tur sonu hesabı

### Mevcut Kod (Değiştirilecek)
- `hugo-server/src/models/Game.ts` — `endRound()` metodu (satır 764), `checkRoundEnd()`, `isHugoRound()`
- `hugo-server/src/models/Player.ts` — Player state (penaltyScore, isOpen, tiles, roundScores)
- `hugo-server/src/socket/socketHandler.ts` — endRound trigger'ı ve round result emit'i

### Gereksinimler
- `.planning/REQUIREMENTS.md` — PUAN-01, PUAN-02, PUAN-03 (Phase 1 scope)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `isHugoRound()`: Hugo turu tespiti doğru çalışıyor (satır 869)
- `RoundResult` interface: `multiplier` field zaten var (satır 20)
- `finisherPlayerId`: Round sonunda kimin bitirdiği zaten Game state'inde tutuluyor
- `player.isOpen`: El açma durumu Player'da mevcut

### Mevcut Hatalar (Düzeltilecek)
- `endRound()` satır 773: `tile.value * 2` → `tile.value * 10` (açmış oyuncular için)
- Joker bitiş tespiti: `discardPile[last].isJoker` kontrolü → `finishedWithJoker` flag'e geçilecek
- Joker çarpanı: penaltyScore'a değil handScore'a uygulanacak
- Kapalı el 800 cezası: hiç implement edilmemiş

### Established Patterns
- `endRound()` tüm puan hesabını centralize ediyor — mantık buraya eklenmeli
- `RoundResult[]` array'i her oyuncu için ayrı sonuç tutuyor
- `player.penaltyEntries: number[]` işleme cezası detayını kaydediyor (pattern: yeni ceza girdisi ekleme)

### Integration Points
- `socketHandler.ts` → `endRound()` çağrısı: `multiplier` dahil tüm `RoundResult` frontend'e emit ediliyor
- Frontend `roundEndResults` field'ını `toPublicJSON()` üzerinden alıyor (satır 912)

</code_context>

<specifics>
## Specific Ideas

- "Hugo turu = tüm puanı ×2" (Hugo multiplier tüm rawTotal'i çarpar, mevcut kod doğru)
- "Joker bitiş = el taşları ×2" (joker multiplier YALNIZCA handScore, penaltyScore değil)
- "Hugo + joker: el taşları ×4, cezalar ×2" (ayrı bileşen çarpanları)
- Kapalı el kuralı: "hiç kimse açmadan biten = 800 ceza" (400'ün iki katı)
- Kullanıcı örnekleri: normal+kapalı=800, Hugo+kapalı=1600, normal+joker+kapalı=1600, Hugo+joker+kapalı=3200
- Yıldız örnekleri: normal bitiş=1★, joker bitiş=2★, Hugo+joker bitiş=4★, Hugo+joker+kimse açmadan=8★
- Scoreboard layout: en üst → yıldız ikonları | oyuncu adı altı → o el toplam ceza | bir alt → toplam (cezalar - yıldız×100) | en alt → tekil ceza kalemleri

</specifics>

<deferred>
## Deferred Ideas

- Çift kuralları (CIFT-01, CIFT-02, CIFT-03) — v2, Phase 2 sonrası
- İşlenebilir taş atma cezası (CEZA-01) — v2
- Yandan alınan taşın kullanım zorunluluğu (CEZA-02) — v2

</deferred>

---

*Phase: 01-fix-scoring-multipliers*
*Context gathered: 2026-03-16*
