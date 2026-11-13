# Hugo — Puanlama, Cezalar ve Yıldızlar

Bu belge sunucuda **şu an çalışan** kuralları anlatır (kaynak: `hugo-server/src/models/Game.ts`).
Az puan iyidir: 9 el sonunda toplam puanı en düşük olan kazanır (eşitlikte birden çok kazanan).

## 1. Temel kavramlar

| Kavram | Anlamı |
|---|---|
| Taş değeri | Taşın üzerindeki sayı (1–13). Puanda genelde **sayı × 10** olarak geçer. |
| Okey | Normal elde göstergenin bir üstü (gösterge 13 ise 1). Hugo elinde sahte okeyler (jokerler) okeydir. |
| Sahte okey (normal el) | Okeyin rengi ve sayısıyla sıradan taş gibi oynanır; joker gibi davranmaz. Ceza hesabında da okeyin değerini taşır. |
| Hugo eli | 1., 5. ve 9. eller. Gösterge sahte okey çıkarsa o el de Hugo elidir. |
| Anlık ceza | Oyun sırasında yazılan ceza. Masadaki herkes sağ alttaki ceza kaydında görür. |
| El sonu puanı | El bitince her oyuncuya yazılan puan (elde kalan + cezalar, çarpanlar ve yıldızlarla). |
| Yıldız (silici) | Her yıldız o elin puanından **100 düşer**. Puan 0'ın altına inmez. |

## 2. Anlık cezalar (oyun sırasında)

| Durum | Kime yazılır | Normal el | Hugo eli | Not |
|---|---|---|---|---|
| **İşlek taş atmak**: atılan taş masadaki bir seriye/pere baştan ya da sondan eklenebiliyor | Taşı atana | **100** | **200** | Eli bitiren son taş için yazılmaz. Okey atmak işlek sayılmaz. Çiftler kontrol edilmez. İşlek atılan taş sıradaki oyuncu tarafından **yerden alınamaz** (ikinci ceza yazdırılamaz). Süre dolup taş otomatik atılırsa da uygulanır. |
| **Yerden (yandan) taş almak** | Taşı **atana** | taş değeri × 10 | taş değeri × 20 | Sahte okey, okeyin değeriyle hesaplanır. Kendi attığın taş için yazılmaz. |
| **Yandan alınan taşı kullanmadan geri atmak** | Taşı alana | **100** | **100** | Yandan alınan taş kullanılmadıysa yalnızca o taş atılabilir. |
| **Kusmak**: yandan alınan taşı kullanmadan geri koymak | — | **0** | **0** | Cezasız. Atana yazılan "yerden" cezası **silinir**. Oyuncu desteden çeker, kusulan taş o sırada tekrar alınamaz. O sırada el açıldıysa, per indirildiyse ya da işlendiyse kusulamaz. |
| **İşleme**: başkasının serisine/perine taş eklemek | Per **sahibine** | taş değeri × 10 | taş değeri × 10 | Okey işlenirse eklendiği yerdeki değer sayılır (örn. 5-6-7'nin sonuna okey → 8 × 10 = 80). Kendi perine işlemek cezasızdır. |
| **Okey almak**: perdeki okeyin yerine gerçek taşı koyup okeyi almak | Per **sahibine** | **100** | **100** | Aynı sayılı perde (erkek per) okey ancak per 4 taşa tamamlanınca alınabilir. Aynı sırada okey işleyen tekrar okey alamaz. |
| **Çift işlemek**: başkasının çiftlerine elindeki çifti eklemek | Çift **sahibine** | (çiftin toplamı × 10) × 2 | aynı | Örn. iki 5: ((5 + 5) × 10) × 2 = **200**. Çiftlere tek taş işlenmez. Kendi çiftine işlemek cezasızdır. |
| **Geri almak**: o sırada masaya oynananları ele döndürmek | Geri alana | **100** | **100** | Açılış, indirilen perler ve işlenen taşlar ele döner. Bu sırada başkalarına yazılan işleme/okey cezaları **silinir**. Taş atıldıktan sonra geri alınamaz. |
| Yetersiz değerle el açmayı denemek | — | **0** | **0** | Ceza yazılmaz, el açılmaz (bkz. bölüm 3). |

> **Önemli:** Hugo elinde, el sonunda **bütün cezalar ayrıca × 2** olur (bkz. bölüm 4).
> Bu yüzden Hugo elinde atılan bir işlek taş tabelaya 200 olarak yazılır, el sonunda 400 sayılır.
> Yerden alma cezası da Hugo elinde taş × 20 yazılır, el sonunda taş × 40 sayılır.

## 3. El açma eşikleri (ceza değil, kural)

| Durum | Gereken |
|---|---|
| Masada henüz kimse açmamışsa | Seri veya çiftlerin toplamı **en az 51** |
| Masada açan varsa | Masadaki **en yüksek açılışı geçmek** (seri ve çift aynı eşiği kullanır) |
| Çiftle açan | Sonra yalnızca çift indirir |
| Masaya her oynayışta | Elde en az bir taş kalmalı; el son taş atılarak biter |

## 4. El sonu puanı

El iki şekilde biter: bir oyuncu son taşını atar (**bitiren**), ya da deste biter (bitiren yok). Deste bitince el, destenin son taşını çeken oyuncu taşını attığı anda biter; atılan o taş artık alınamaz. Son taş ıstaka dışında herhangi bir yere (köşe, masa, per) bırakılınca atılmış sayılır ve işlek cezası yazılmaz.

### 4.1 Elde kalan puan (bitiren dışındakiler)

| Oyuncunun durumu | Elde kalan puan |
|---|---|
| Eli **açmış** | Elde kalan taşların değer toplamı × 10. Okey 0 sayılır, sahte okey okeyin değeriyle sayılır. |
| Eli **açmamış** | **400** |
| Eli açmamış ve **bitiren dışında kimse açmamış** | **800** |
| Bitiren | 0 |

### 4.2 Özel durum çarpanları

Her özel durum **× 2**'dir ve çarpanlar birbiriyle çarpılır.

| Özel durum | Ne zaman | Neyi katlar |
|---|---|---|
| **Hugo eli** | 1., 5., 9. eller veya gösterge sahte okey | **Her şeyi**: elde kalan + cezalar + kullanılmayan okey |
| **Okeyle bitme** | Atılan son taş o elin okeyi | Yalnızca rakiplerin **elde kalan** puanını |
| **Çiftten bitme** | Bitiren eli çiftle açmış | Yalnızca rakiplerin **elde kalan** puanını |
| **Elden bitme** | Bitiren aynı sırada hem açıp hem bitirdi (daha önce açmamıştı) | Yalnızca rakiplerin **elde kalan** puanını |

Örnek: Hugo elinde okeyle bitişte rakibin elde kalanı × 4 olur, cezaları × 2 olur.

### 4.3 Kullanılmayan okey

Eli **açmış** bir oyuncunun elinde el sonunda kalan **her okey için +100**. Eli açmamış oyuncuya yazılmaz (zaten 400/800 alır).
Bu ceza yalnızca Hugo çarpanıyla katlanır.

### 4.4 Formül

```
elde kalan  = (bölüm 4.1) × okeyle bitme × çiftten bitme × elden bitme
ham toplam  = elde kalan + o elin anlık cezaları + kullanılmayan okey
el puanı    = max(0, ham toplam × Hugo − yıldız × 100)
toplam puan = bütün ellerin el puanlarının toplamı
```

Deste bittiğinde bitiren olmadığı için okey/çift/elden çarpanları uygulanmaz; yalnızca Hugo çarpanı geçerlidir.
Kimse açmadıysa herkes 800 alır.

## 5. Yıldızlar (siliciler)

Her yıldız o elin puanından **100 siler**. Silme işlemi Hugo çarpanından **sonra** yapılır ve puan 0'ın altına inmez
(kullanılmayan yıldız bir sonraki ele devretmez). Tabeladaki ★ sayısı oyun boyunca kazanılan toplam yıldızdır.

### 5.1 Bitirenin yıldızı

Temel **1 yıldız** alınır, aşağıdaki her koşul bunu **× 2** yapar:

| Koşul | Çarpan |
|---|---|
| Okeyle bitirdi | × 2 |
| Hugo eli | × 2 |
| Bitiren dışında kimse eli açmamış | × 2 |

Çiftten bitirmek ve elden bitirmek yıldızı artırmaz; çiftten biten de 1 yıldız alır.

| Bitiş | Yıldız | Silinen |
|---|---|---|
| Normal bitiş | 1 | 100 |
| Okeyle bitiş | 2 | 200 |
| Hugo elinde bitiş | 2 | 200 |
| Hugo elinde okeyle bitiş | 4 | 400 |
| Kimse açmamışken bitiş | 2 | 200 |
| Hugo + okey + kimse açmamış | 8 | 800 |

### 5.2 100+ açılış yıldızı

Oyuncunun o eldeki **ilk açılışının** toplam değeri **100 veya üzeriyse** +1 yıldız alır. Bitiren de alır; bitiş yıldızına eklenir.
Not: kod yalnızca ilk açılışa bakar; aynı elde sonradan indirilen perler bu toplama eklenmez.

## 6. Örnekler

**Normal el.** A normal bitirir. B eli açmış, elinde 3 ve 7 kalmış, o elde 140 ceza yemiş, ilk açılışı 104.
- B: elde kalan (3 + 7) × 10 = 100 → ham 100 + 140 = 240 → 240 − 1 yıldız × 100 = **140**
- A: ceza yoksa max(0, 0 − 100) = **0**
- C eli açmamış: **400**

**Hugo elinde okeyle bitiş.** A Hugo elinde okeyle bitirir. B açmış, elinde 5 ve 8 kalmış, bir işlek atmış (200).
- B: elde kalan (5 + 8) × 10 = 130 × 2 (okey) = 260 → ham 260 + 200 = 460 → × 2 (Hugo) = **920**
- A: 4 yıldız → max(0, 0 − 400) = **0**
- C eli açmamış: 400 × 2 (okey) × 2 (Hugo) = **1600**

**Çift işleme.** B, A'nın çiftlerine iki 9 işler: A'ya ((9 + 9) × 10) × 2 = **360** ceza yazılır.

## 7. Süre dolunca (otomatik oynama)

Sıra süresi 60 sn'dir; bağlantısı kopan oyuncunun sırası 3 sn sonra otomatik oynanır.
Süre dolunca:
1. Yandan alınmış taş varsa cezasız kusulur.
2. Desteden taş çekilir.
3. Per adayına girmeyen en küçük taş atılır; okey asla atılmaz.

Bu atışta da işlek kuralı geçerlidir.

## 8. `document.txt` başındaki eski maddelerle farklar

`document.txt`'nin ilk bölümündeki bazı maddeler sonradan netleşen kurallarla değişti. Geçerli olan bu belgedeki değerlerdir.

| Eski madde | Şu an geçerli olan |
|---|---|
| Oyunu bitirme −100, joker ile bitirme −200 | Ayrı bir eksi puan yok; yerine bitiş **yıldızları** var (1 yıldız = 100 siler) |
| Yetersiz değerde el açma 100 ceza | Ceza yok, el açılmaz |
| İşlenebilir taş atma = taş × 10 | Sabit **100** (Hugo elinde **200**) |
| Elde kalan taşlar × 2 / deste bitince × 2 | Elde kalan taş × 10; deste bitince ek çarpan yok |
| Joker ile bitiş ceza puanlarını × 2 yapar | Yalnızca rakiplerin elde kalanını × 2 yapar; cezaları yalnızca Hugo katlar |
| Çift açma min 52 | 51 |
