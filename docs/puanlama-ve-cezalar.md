# Hugo — Puanlama, Cezalar ve Yıldızlar

Bu belge sunucuda **şu an çalışan** kuralları anlatır (kaynak: `hugo-server/src/models/Game.ts`).
Az puan iyidir: 9 el sonunda toplam puanı en düşük olan kazanır (eşitlikte birden çok kazanan).

## 1. Temel kavramlar

| Kavram | Anlamı |
|---|---|
| Taş değeri | Taşın üzerindeki sayı (1–13). |
| Çarpan | Anlık cezalar çarpanla yazılır: taş değeri × 10, Hugo elinde × 20 (sabit cezalar Hugo elinde 200). El sonunda cezalar ayrıca katlanmaz. |
| Okey | Normal elde göstergenin bir üstü (gösterge 13 ise 1). Hugo elinde sahte okeyler (jokerler) okeydir. Hugo eli dışında gösterge sahte okey çıkarsa yine Hugo eli gibi oynanır. |
| Sahte okey (normal el) | Okeyin rengi ve sayısıyla sıradan taş gibi oynanır; joker gibi davranmaz. Ceza hesabında da okeyin değerini taşır. |
| Hugo eli | 1., 5. ve 9. eller. Gösterge sahte okey çıkarsa o el de Hugo elidir. |
| Anlık ceza | Oyun sırasında yazılan ceza. Masadaki herkes sağ alttaki ceza kaydında görür. |
| El sonu puanı | El bitince her oyuncuya yazılan puan (elde kalan + cezalar, çarpanlar ve yıldızlarla). |
| Yıldız (silici) | Her yıldız o elin puanından **100 düşer**. Puan eksiye düşebilir. |
| Elden bitme | Masaya hiç taş açılmamışken (bitiren dahil kimse açmamış) bir oyuncunun açmadan bitirmesi. Rakiplerin elde kalan puanı × 2, bitiş yıldızı × 2. Masaya herhangi biri taş açtıysa normal bitiştir. |

## 2. Anlık cezalar (oyun sırasında)

| Durum | Kime yazılır | Normal el | Hugo eli | Not |
|---|---|---|---|---|
| **İşlek taş atmak**: atılan taş masadaki bir seriye/pere baştan ya da sondan eklenebiliyor | Taşı atana | **100** | **200** | Eli bitiren son taş için yazılmaz. Okey atmak işlek sayılmaz (ayrı okey atma cezası var). Çiftler kontrol edilmez. İşlek atılan taş sıradaki oyuncu tarafından **yerden alınamaz** (ikinci ceza yazdırılamaz). Süre dolup taş otomatik atılırsa da uygulanır. |
| **Okeyi yere atmak** (Hugo elinde sahte okeyi) | Taşı atana | **200** | **400** | Eli bitiren son taş okeyse ceza yok (okeyle bitme). Okey atmak işlek sayılmaz; bu ayrı bir cezadır. |
| **Yerden (yandan) taş almak** | Taşı **atana** | taş değeri × 10 | taş değeri × 20 | Sahte okey, okeyin değeriyle hesaplanır. Kendi attığın taş için yazılmaz. |
| **Yandan alınan taşı atmak** | — | **atılamaz** | **atılamaz** | Yandan alınan taş atılamaz, başka taş da atılamaz: pere eklenip (açarak ya da işleyerek) kullanılmalı ya da Kustu ile geri konmalı. Süre dolarsa taş kendiliğinden kusulur (masaya oynandıysa önce geri alınır). |
| **Kusmak**: yandan alınan taşı kullanmadan geri koymak | — | **0** | **0** | Cezasız. Atana yazılan "yerden" cezası **silinir**. Oyuncu desteden çeker, kusulan taş o sırada tekrar alınamaz. Kustu taş atılana kadar basılabilir: o sırada masaya oynandıysa (el açma, per indirme, işleme) önce hepsi ele döner ve **geri alma cezası** yazılır (100, Hugo elinde 200), sonra taş kusulur. |
| **İşleme**: başkasının serisine/perine taş eklemek | Per **sahibine** | taş değeri × 10 | taş değeri × 20 | Okey işlenirse eklendiği yerdeki değer sayılır (örn. 5-6-7'nin sonuna okey → 8 × 10 = 80). Kendi perine işlemek cezasızdır. |
| **Okey almak**: perdeki okeyin yerine gerçek taşı koyup okeyi almak | Per **sahibine** | **100** | **200** | Aynı sayılı perde (erkek per) okey ancak per 4 taşa tamamlanınca alınabilir. Aynı sırada okey işleyen tekrar okey alamaz. Kendi perinden / çiftinden okey alan ceza yemez. |
| **Çift işlemek**: başkasının çiftlerine elindeki çifti eklemek | Çift **sahibine** | çiftin toplamı × 10 | çiftin toplamı × 20 | Normal işleme gibi; ek çarpan yok. Örn. iki 5: (5 + 5) × 10 = **100**. Çift, ıstakada yan yana duran iki taş basılı tutulup çiftlerin üstüne sürüklenerek işlenir. Çiftlere tek taş işlenmez; yalnızca çiftte okey varsa okeyin eşi olan taş işlenip okey alınır (sahibine okey cezası 100). Per açmış oyuncu da çift işleyebilir. Kendi çiftine işlemek cezasızdır. |
| **Geri almak**: o sırada masaya oynananları ele döndürmek | Geri alana | **100** | **200** | Açılış, indirilen perler ve işlenen taşlar ele döner. Bu sırada başkalarına yazılan işleme/okey cezaları **silinir**. Taş atıldıktan sonra geri alınamaz. |
| **Açılış tamamlanmadan süre dolması**: tek tek yere indirilen perler eşiğe ulaşmadı, elde de tamamlayacak per yok | Süresi dolana | **100** | **200** | Yere inen perler ele döner (geri alma gibi), sonra taş otomatik atılır. Eldeki perlerle (okey dahil) eşik tamamlanıyorsa ceza yazılmaz, perler açılır. |
| Yetersiz değerle el açmayı denemek | — | **0** | **0** | Ceza yazılmaz, el açılmaz (bkz. bölüm 3). |

> **Önemli:** Anlık cezalar çarpanıyla yazılır: Hugo elinde işlek taş tabelaya doğrudan 200, yerden alma taş × 20 olarak yazılır.
> El sonunda cezalar bir daha katlanmaz; Hugo × 2 yalnızca elde kalan puana ve kullanılmayan okeye uygulanır.
> Tabela detayında çarpan ayrıca gösterilmez; her satır çarpılmış değeriyle yazılır.

## 3. El açma eşikleri (ceza değil, kural)

| Durum | Gereken |
|---|---|
| Masada henüz kimse açmamışsa | Seri veya çiftlerin toplamı **en az 51** |
| Masada açan varsa | Masadaki **en yüksek açılışı geçmek** (seri ve çift aynı eşiği kullanır) |
| Çiftle açan | Sonra yalnızca çift indirir |
| Çiftle açan | Köşelere atılmış eski taşları görebilir: köşeye tıklayınca yana açılır, başka yere tıklayınca kapanır |
| Masaya her oynayışta | Elde en az bir taş kalmalı; el son taş atılarak biter |
| Açtığı sırada ekleme | Açan oyuncu taş atmadan (sırası geçmeden) yeni per indirir ya da kendi perine taş işlerse açılış değerine eklenir. Örn. 65 açıp aynı sırada 10 eklerse açılışı 75 olur (sonraki oyuncular 75'i geçmeli; 100+ yıldızı da buna bakar). Aynı sırada başkasının perine / çiftine işlenir ya da okey alınırsa ekleme durur: örn. 80 açıp okeyi alan, okeyle indirdiği peri 80'e ekleyemez. |
| Per per açma | Per ıstakadan masaya sürüklenince yalnızca o per yere iner. Eşik dolana kadar perler yerde bekler (kesik çerçeve) ve taş atılamaz. "Tümünü aç" ıstakadaki tüm geçerli perleri açar. |

## 4. El sonu puanı

El iki şekilde biter: bir oyuncu son taşını atar (**bitiren**), ya da deste biter (bitiren yok). Deste bitince el, destenin son taşını çeken oyuncu taşını attığı anda biter; atılan o taş artık alınamaz. Son taş ıstaka dışında herhangi bir yere (köşe, masa, per) bırakılınca atılmış sayılır ve işlek cezası yazılmaz.

### 4.1 Elde kalan puan (bitiren dışındakiler)

| Oyuncunun durumu | Elde kalan puan |
|---|---|
| Eli **açmış** | Elde kalan taşların değer toplamı **× 2**. Okey 0 sayılır, sahte okey okeyin değeriyle sayılır. Yuvarlama yapılmaz. |
| Eli **çiftle açmış** | Elde kalan taşların değer toplamı × 2, **ayrıca × 2** (toplam × 4), sonra bitme çarpanları. |
| Eli **açmamış** | **400** (kimse açmamışken elden bitişte elden çarpanıyla 800) |
| Bitiren | 0 |

### 4.2 Özel durum çarpanları

Her özel durum **× 2**'dir ve çarpanlar birbiriyle çarpılır.

| Özel durum | Ne zaman | Neyi katlar |
|---|---|---|
| **Hugo eli** | 1., 5., 9. eller veya gösterge sahte okey | Elde kalan + kullanılmayan okey (anlık cezalar zaten × 2 yazıldı) |
| **Okeyle bitme** | Atılan son taş o elin okeyi | Yalnızca rakiplerin **elde kalan** puanını |
| **Çiftten bitme** | Bitiren eli çiftle açmış | Yalnızca rakiplerin **elde kalan** puanını |
| **Elden bitme** | Bitiren hiç açmadan bitirdi (bkz. 4.4) **ve masaya kimse taş açmamış** | Yalnızca rakiplerin **elde kalan** puanını. Masaya biri (bitiren dahil) taş açtıysa normal bitiştir: çarpan ve ek yıldız yok. |

Örnek: Hugo elinde okeyle bitişte rakibin elde kalanı × 4 olur, cezaları Hugo eli olduğu için × 2 olur.
Örnek: eli açmış rakibin elinde 3 ve 7 kaldıysa normal bitişte (3 + 7) × 2 = 20, okeyle bitişte 40 yazılır.

### 4.3 Kullanılmayan okey

Eli **açmış** bir oyuncunun elinde el sonunda kalan **her okey için 100**. Okeyle, çiftten ya da elden bitmede bu ceza o çarpanla katlanır (örn. okeyle bitişte 200); Hugo elinde ayrıca × 2.
Eli açmamış oyuncuya yazılmaz (zaten 400 alır).

### 4.4 Açmadan bitme

Eli açmamış oyuncunun, atacağı son taş dışındaki **bütün taşları geçerli per** ise (ıstakada yan yana dizili), yere açmadan son taşı atarak eli bitirir.
- Perler masaya inmez; oyuncu o sırada hiçbir pere taş işleyemez.
- Elden bitme sayılır; ama masada daha önce açan varsa elden bitme çarpanı **eklenmez**.
- Son taş için işlek cezası yazılmaz.

### 4.5 Formül

```
elde kalan  = (bölüm 4.1: açmışsa taş toplamı × 2, açmamışsa 400) × okeyle bitme × çiftten bitme × elden bitme
okey cezası = elde kalan okey × 100 × okeyle bitme × çiftten bitme × elden bitme
el puanı    = (elde kalan + okey cezası) × Hugo + o elin anlık cezaları (çarpanla yazıldı) − yıldız × 100
              (eksiye düşebilir, yuvarlama yok)
toplam puan = bütün ellerin el puanlarının toplamı
```

Deste bittiğinde bitiren olmadığı için okey/çift/elden çarpanları uygulanmaz; yalnızca Hugo çarpanı geçerlidir.
Kimse açmadıysa herkes 800 alır.

## 5. Yıldızlar (siliciler)

Her yıldız o elin puanından **100 siler**. Silme işlemi Hugo çarpanından **sonra** yapılır ve puan eksiye düşebilir
(kullanılmayan yıldız bir sonraki ele devretmez). Tabeladaki ★ sayısı oyun boyunca kazanılan toplam yıldızdır.

### 5.1 Bitirenin yıldızı

Temel **1 yıldız** alınır, aşağıdaki her koşul bunu **× 2** yapar:

| Koşul | Çarpan |
|---|---|
| Okeyle bitirdi | × 2 |
| Hugo eli | × 2 |
| Elden bitme (masada hiç açılış yokken açmadan bitiş) | × 2 |
| Çiftle bitirdi | × 2 |

Örneğin Hugo elinde çiftle biten 1 × 2 × 2 = **4 yıldız** alır.

| Bitiş | Yıldız | Silinen |
|---|---|---|
| Normal bitiş | 1 | 100 |
| Okeyle bitiş | 2 | 200 |
| Hugo elinde bitiş | 2 | 200 |
| Hugo elinde okeyle bitiş | 4 | 400 |
| Elden bitiş | 2 | 200 |
| Hugo + okey + elden | 8 | 800 |

### 5.2 100+ açılış yıldızı

Oyuncunun o eldeki **açılışının** toplam değeri **100 veya üzeriyse** her zaman +1 yıldız alır. Bitiren de alır; bitiş yıldızına eklenir (örn. Hugo elinde 100+ açıp okeysiz bitiş: 1 × 2 + 1 = 3 yıldız).
Açtığı sırada (taş atmadan) eklenen perler ve kendi perine işlenen taşlar açılışa eklenir; sonraki sıralarda eklenenler sayılmaz.

## 6. Örnekler

**Normal el.** A normal bitirir. B eli açmış, elinde 3 ve 7 kalmış, o elde 140 ceza yemiş, açılışı 104 (+1 yıldız).
- B: elde kalan (3 + 7) × 2 = 20 → ham 20 + 140 = 160 → 160 − 1 yıldız × 100 = **60**
- A: ceza yoksa 0 − 100 = **−100**
- C eli açmamış: **400**

**Hugo elinde okeyle bitiş.** A Hugo elinde okeyle bitirir. B açmış, elinde 5 ve 8 kalmış, bir işlek atmış (tabelada 200).
- B: elde kalan (5 + 8) × 2 = 26 × 2 (okey) = 52 × 2 (Hugo) = 104 → + 200 ceza = **304**
- A: 4 yıldız → 0 − 400 = **−400**
- C eli açmamış: 400 × 2 (okey) × 2 (Hugo) = **1600**

**Çift işleme.** B, A'nın çiftlerine iki 9 işler: A'ya (9 + 9) × 10 = **180** ceza yazılır.

**Çiftle açan.** Normal bitiş. B çiftle açmış, elinde 5 ve 8 kalmış: (5 + 8) × 2 × 2 = **52**.

## 7. Süre dolunca (otomatik oynama)

Sıra süresi 60 sn'dir; bağlantısı kopan oyuncunun sırası 3 sn sonra otomatik oynanır.
Her işleme, el açma (per per açma dahil) ve per indirmede sıradaki oyuncunun süresine **10 sn** eklenir.
Süre dolunca:
1. Yandan alınmış taş varsa ve o sırada masaya oynanmadıysa cezasız kusulur.
2. Desteden taş çekilir.
3. Per adayına girmeyen en küçük taş atılır; okey asla atılmaz, **işlek taş atılmaz** (elde yalnızca işlek taş kalmadıkça).

Elde yalnızca işlek taş kaldıysa işlek kuralı bu atışta da geçerlidir.

## 8. `document.txt` başındaki eski maddelerle farklar

`document.txt`'nin ilk bölümündeki bazı maddeler sonradan netleşen kurallarla değişti. Geçerli olan bu belgedeki değerlerdir.

| Eski madde | Şu an geçerli olan |
|---|---|
| Oyunu bitirme −100, joker ile bitirme −200 | Ayrı bir eksi puan yok; yerine bitiş **yıldızları** var (1 yıldız = 100 siler) |
| Yetersiz değerde el açma 100 ceza | Ceza yok, el açılmaz |
| İşlenebilir taş atma = taş × 10 | Sabit **100** (Hugo elinde **200**) |
| Elde kalan taşlar × 2 / deste bitince × 2 | Elde kalan taş × 2 (çiftle açan ayrıca × 2); yuvarlama yok, puan eksiye düşebilir; deste bitince ek çarpan yok |
| Joker ile bitiş ceza puanlarını × 2 yapar | Yalnızca rakiplerin elde kalanını × 2 yapar; cezaları yalnızca Hugo katlar |
| Çift açma min 52 | 51 |
