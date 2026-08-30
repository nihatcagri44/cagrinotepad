# Çağrı Notepad

Aç, yaz, kapat. Yazdığın kendiliğinden kaydedilir ve geri döndüğünde tam bıraktığın
yerde durur.

Tek sayfa. Menü yok, hesap yok, kayıt düğmesi yok, reklam yok. Notların tarayıcından
çıkmaz — sunucuya hiçbir şey gönderilmez.

## Özellikler

- **Otomatik kayıt** — yazma durduktan 300 ms sonra, ayrıca sekme arkaya alınınca,
  odak kaybedilince ve sayfa kapanırken anında
- **Animasyonlu yazı** — yazdığın her harf kısa bir mürekkep parlamasıyla yerine oturur
- **Daktilo karşılaması** — boş sayfada örnek metin harf harf yazılır, ilk tuşta kaybolur
- **Sayfanın her yeri tıklanabilir** — nereye dokunursan dokun imleç yazıya gelir
- **Üç kağıt** — düz, çizgili, kareli; çizgiler satır yüksekliğine oturur
- **Ortada tek çubuk** — bütün ayarlar altta ortalanmış bir barda toplanır
- **Dakikalık yedek** — metni yanlışlıkla silersen çubuktaki ⟲ ile geri al
- **Çoklu sekme** — bir sekmede yazdığın diğerine geçer, sekmeler birbirini ezmez
- **Açık / koyu tema** — sistem tercihini izler, elle de değiştirilebilir
- **Üç yazı tipi** (sans / serif / mono) ve üç boyut — tercih hatırlanır
- **Türkçe / İngilizce** arayüz
- **Çevrimdışı çalışır** — service worker; telefona uygulama olarak kurulabilir (PWA)
- **`.txt` indirme** — dosya adı ilk satırdan üretilir

## Kısayollar

| Tuş | İş |
|---|---|
| `⌘S` / `Ctrl+S` | Anında kaydet |
| `⌘D` / `Ctrl+D` | Açık ↔ koyu tema |
| `⌘E` / `Ctrl+E` | Metni `.txt` indir |
| `Tab` | Girinti ekle |
| `Esc` | Arayüzü tamamen gizle (zen) |

Çubuk normalde görünmez; fareyi kıpırdatınca (mobilde dokununca) belirir, yazmaya
başlayınca söner.

## Yazı animasyonu nasıl çalışıyor

`<textarea>` içindeki harfler tek tek canlandırılamaz. Bu yüzden metin iki katmanda
yaşıyor: üstte gerçek textarea (yazısı saydam, imleci görünür), altında birebir aynı
tipografiye sahip bir **ayna** katmanı. Gördüğün harfler aynanınkiler; her tuş
vuruşunda eski ve yeni metnin farkı alınıp yalnızca yeni gelen harfler `<span>` olarak
animasyonla ekleniyor, ~250 ms sonra düz metne indirgeniyor (DOM şişmesin diye).

- Animasyon yalnızca `opacity` ve `color` üzerinde — `transform` satır kırılmasını
  bozacağı için kullanılmıyor, iki katman piksel piksel örtüşüyor
- Yapıştırma gibi 240 karakterden uzun eklemeler animasyonsuz basılır
- `prefers-reduced-motion` açıksa animasyon tamamen devre dışı
- JS çalışmazsa ayna kurulmaz ve textarea'nın kendi yazısı görünür kalır — metin
  hiçbir koşulda görünmez olmaz

## Çalıştırma

Build adımı yok, bağımlılık yok. Yerelde:

```
python3 -m http.server 8787
```

`http://localhost:8787` adresini aç. (`file://` ile de açılır ama service worker
devre dışı kalır.)

## Yayına alma

Statik dosyalar; klasörün tamamı olduğu gibi yüklenir.

```
npx wrangler pages deploy . --project-name=cagrinotepad
```

## Veri nerede duruyor

Tarayıcının `localStorage`'ında, `cagrinotepad:v1:` önekiyle:

| Anahtar | İçerik |
|---|---|
| `…:note` | metnin kendisi |
| `…:backup`, `…:backupAt` | dakikalık yedek ve zamanı |
| `…:theme`, `…:paper`, `…:font`, `…:size`, `…:lang` | tercihler |

Tarayıcı verisini temizlersen notlar da gider. Önemli metinleri `⌘E` ile indir.

## Dosyalar

```
index.html            katmanlar (kağıt / ayna / karşılama / textarea) + tercih ön yükleme
style.css             tema, kağıt desenleri, ortadaki çubuk, animasyonlar, baskı stili
app.js                ayna, animasyon, daktilo, otosave, yedek, tercihler, kısayollar
sw.js                 çevrimdışı önbellek
manifest.webmanifest  PWA tanımı
icon.svg              uygulama ikonu (+ türetilmiş png'ler)
```
