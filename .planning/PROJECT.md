# Hugo Oyunu

## What This Is

Hugo, 4 kişilik çok oyunculu bir karo oyunudur. Okey 101'e benzer ama farklı kural seti ile oynanır: 9 tur, Hugo turları (×2 çarpan), işleme ceza sistemi ve çok katmanlı puan çarpanları içerir. Node.js/Socket.IO backend + React frontend mimarisine sahip mevcut bir uygulamadır.

## Core Value

Oyunun belgelenmiş tüm kurallarını doğru uygulayan, özellikle puan hesaplamasının hatasız çalıştığı çok oyunculu bir deneyim sunmak.

## Requirements

### Validated

- ✓ 4 oyunculu çok oyunculu oyun — Socket.IO ile gerçek zamanlı
- ✓ 9 tur yapısı (1., 5., 9. turlar Hugo turu)
- ✓ Taş dağıtımı ve gösterge/okey belirleme
- ✓ El açma (minimum 51 değer)
- ✓ Perden taş çekme/işleme ve ceza sistemi (temel)
- ✓ Tur sonu puan hesabı (temel)
- ✓ Skor tablosu UI (temel)
- ✓ Tur özeti ekranı

### Active

- [ ] Joker ile bitişte diğer oyuncuların ceza puanları ×2 uygulanmalı
- [ ] Çift ile bitişte diğer oyuncuların tüm puanları ×2 uygulanmalı
- [ ] Çok katmanlı çarpanlar doğru hesaplanmalı (Hugo + joker + çift = ×8)
- [ ] Çift kuralları: aynı sayı ve renk çiftleri ile el açma/işleme
- [ ] Skor tablosu UI'ı tüm çarpan kombinasyonlarını doğru göstermeli

### Out of Scope

- Yapay zeka rakipler — önce çok oyunculu deneyim olgunlaşsın
- Mobil uygulama — web-first yaklaşım

## Context

- Mevcut kod: `hugo-server/` (Node.js/TypeScript) + `hugo-ui/` (React/Vite)
- Temel oyun mekanikleri çalışıyor; puan sistemi eksik/hatalı
- Belgelenmiş kurallar: `document.txt` dosyasında
- Hugo turlarında çarpan zaten uygulanıyor; joker ve çift çarpanları eksik

## Constraints

- **Tech stack**: Mevcut Stack değişmeyecek (Socket.IO, React, TypeScript)
- **Kural kaynağı**: `document.txt` içindeki kurallar referans alınacak

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Mevcut kodu tamamla, sıfırdan yazma | Temel mekanikler çalışıyor, değer var | — Pending |
| Puan sistemi ilk faz | Diğer geliştirmeler buraya bağımlı | — Pending |

---
*Last updated: 2026-03-16 after initialization*