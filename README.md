# Çağrı Notepad

**https://nihatcagri44.github.io/cagrinotepad/**

Aç, yaz, kapat. Yazdığın kendiliğinden kaydedilir ve geri döndüğünde tam bıraktığın
yerde durur.

Menü yok, hesap yok, kayıt düğmesi yok, reklam yok. Solda istersen açtığın sade bir
not listesi var, o kadar. Notların tarayıcından çıkmaz — sunucuya hiçbir şey
gönderilmez.

## Özellikler

- **Not paneli** — solda açılıp kapanan sade liste: yeni not, eski notlar (ilk satır
  başlık olur, tarihe göre sıralı), hover'da sil. Masaüstünde sayfayı iter, mobilde
  üstüne kayar. Durumu hatırlanır.
- **Seçim çerçevesi** — fareyle basılı tutup sürüklerken masaüstündeki dosya seçimi
  gibi bir dikdörtgen belirir; asıl metin seçimi aynen çalışır
- **Otomatik kayıt** — yazma durduktan 300 ms sonra, ayrıca sekme arkaya alınınca,
  odak kaybedilince ve sayfa kapanırken anında
- **Animasyonlu yazı** — yazdığın her harf kısa bir mürekkep parlamasıyla yerine oturur
- **Animasyonlu öncelik ikonları** — çubuktaki kırmızı uyarı “Acil”, sarı uyarı
  “Önemli” için. İmlecin bulunduğu satırın (veya seçili satırların) başına eklenir;
  aynı düğmeye tekrar basınca kaldırılır, diğer renge basınca değiştirilir.
  Girintiler korunur; çoklu seçimde boş satırlar atlanır. İşaretler notla birlikte
  kaydedilir, kopyalama ve `.txt` indirmede 🔴 / 🟡 olarak taşınır.
  Hareketi azalt tercihi açıksa ikonlar sabit görünür.
- **Daktilo karşılaması** — boş sayfada örnek metin harf harf yazılır, ilk tuşta kaybolur
- **Sayfanın her yeri tıklanabilir** — nereye dokunursan dokun imleç yazıya gelir
- **Üç kağıt** — düz, çizgili, kareli; ekranı tamamen kaplar, çizgiler satır
  yüksekliğine oturur ve metinle birlikte kayar
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
| `⌘B` / `Ctrl+B` | Not panelini aç / kapat |
| `⌘⇧N` / `Ctrl+Shift+N` | Yeni not |
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

**GitHub Pages (birincil).** `main` dalı / root'tan yayınlanır — push yeter:

```
git push origin main
```

Push için repoya özel bir deploy key kullanılıyor (hesabın fine-grained PAT'i bu
repoyu kapsamıyor):

```
GIT_SSH_COMMAND="ssh -i ~/.ssh/cagrinotepad_deploy -o IdentitiesOnly=yes" git push origin main
```

**Neden Cloudflare Pages değil:** `pages.dev` Türkiye'de DNS seviyesinde engelli —
ISP çözücüsünde apex `195.175.254.2`'ye (engel sinkhole) düşüyor, alt alan adları
NXDOMAIN dönüyor. Site sorunsuz çalışıyor ama Türkiye'den açılmıyor. `github.io`
gerçek IP'sine çözülüyor, o yüzden birincil adres orası. Kendi alan adı alınırsa
Cloudflare Pages'e bağlanabilir, engel yalnızca `pages.dev` adında.

Cloudflare Pages (yedek, TR dışı):

```
npx wrangler pages deploy . --project-name=cagrinotepad --branch=main
```

Wrangler oturumu kapalıysa cihaz akışıyla aç (tarayıcı callback'i zaman aşımına
uğruyorsa tek çalışan yol budur):

```
npx wrangler login --device --browser false
```

## Veri nerede duruyor

Tarayıcının `localStorage`'ında, `cagrinotepad:` önekiyle:

| Anahtar | İçerik |
|---|---|
| `v2:notes` | notların tamamı — `[{ id, text, created, updated }]` |
| `v2:current` | açık notun id'si |
| `v2:panel` | panel açık mı |
| `v2:backup` | aktif notun dakikalık yedeği — `{ id, text, at }` |
| `v1:theme`, `v1:paper`, `v1:font`, `v1:size`, `v1:lang` | tercihler |
| `v1:note` | eski tek not; ilk açılışta `v2:notes`'a taşınır, silinmez |

Tarayıcı verisini temizlersen notlar da gider. Önemli metinleri `⌘E` ile indir.

## Dosyalar

```
index.html            panel + katmanlar (kağıt / ayna / karşılama / textarea) + tercih ön yükleme
style.css             tema, kağıt desenleri, panel, seçim çerçevesi, çubuk, animasyonlar, baskı
app.js                notlar, panel, ayna, animasyon, daktilo, otosave, yedek, tercihler, kısayollar
sw.js                 çevrimdışı önbellek
manifest.webmanifest  PWA tanımı
icon.svg              uygulama ikonu (+ türetilmiş png'ler)
```
