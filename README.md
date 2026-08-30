# Çağrı Notepad

Aç, yaz, kapat. Yazdığın kendiliğinden kaydedilir ve geri döndüğünde tam bıraktığın
yerde durur.

Tek sayfa. Menü yok, hesap yok, kayıt düğmesi yok, reklam yok. Notların tarayıcından
çıkmaz — sunucuya hiçbir şey gönderilmez.

## Özellikler

- **Otomatik kayıt** — yazma durduktan 300 ms sonra, ayrıca sekme arkaya alınınca,
  odak kaybedilince ve sayfa kapanırken anında
- **Dakikalık yedek** — metni yanlışlıkla silersen araç çubuğundaki ⟲ ile geri al
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

Araç çubuğu normalde görünmez; fareyi kıpırdatınca belirir, yazmaya başlayınca söner.

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
| `…:theme`, `…:font`, `…:size`, `…:lang` | tercihler |

Tarayıcı verisini temizlersen notlar da gider. Önemli metinleri `⌘E` ile indir.

## Dosyalar

```
index.html            iskelet + tema ön yükleme
style.css             CSS değişkenli tema, zen davranışı, baskı stili
app.js                editör, otosave, yedek, tercihler, kısayollar
sw.js                 çevrimdışı önbellek
manifest.webmanifest  PWA tanımı
icon.svg              uygulama ikonu (+ türetilmiş png'ler)
```
