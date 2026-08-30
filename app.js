/* Çağrı Notepad — tek sayfa, kendiliğinden kaydeden defter.
   Bağımlılık yok. Veri tarayıcıdan çıkmaz.

   Yazının animasyonlu belirmesi için metin iki katmanda yaşar: gerçek
   <textarea> (saydam yazı, görünür imleç) ve onun arkasında birebir aynı
   tipografiye sahip bir "ayna". Görünen harfler aynanın harfleridir; yeni
   yazılanlar oraya kısa bir animasyonla eklenir.                            */

(function () {
  'use strict';

  var NS = 'cagrinotepad:v1:';
  var K = {
    note: NS + 'note',
    backup: NS + 'backup',
    backupAt: NS + 'backupAt',
    theme: NS + 'theme',
    font: NS + 'font',
    size: NS + 'size',
    paper: NS + 'paper',
    lang: NS + 'lang'
  };

  var SAVE_DELAY = 300;      // yazma durduktan sonra diske yazma gecikmesi
  var BACKUP_EVERY = 60000;  // anlık kopya aralığı
  var STATUS_HIDE = 1800;    // "Kaydedildi" ne kadar ekranda kalsın
  var UI_HIDE = 2600;        // çubuk boşta ne kadar sonra sönsün
  var ADOPT_GRACE = 2000;    // bu süre içinde yazdıysan başka sekmenin metnini alma
  var INK_STAGGER = 16;      // harfler arası animasyon gecikmesi
  var INK_MAX = 240;         // bundan uzun eklemeler (yapıştırma) animasyonsuz
  var GHOST_SPEED = 26;      // karşılama yazısının daktilo hızı
  var GHOST_DELAY = 320;

  var STR = {
    tr: {
      placeholder: 'Yazmaya başla. Yazdığın kendiliğinden kaydedilir.',
      typing: 'yazılıyor',
      saved: 'Kaydedildi',
      error: 'Kaydedilemedi — metni indir',
      count: function (w, c) { return w + ' kelime · ' + c + ' karakter'; },
      theme: 'Tema', paper: 'Kağıt', font: 'Yazı tipi',
      smaller: 'Yazıyı küçült', bigger: 'Yazıyı büyüt',
      download: 'Metni indir', restore: 'Yedeği geri yükle', lang: 'Dili değiştir',
      restoreAsk: function (t) {
        return t + ' tarihli yedek geri yüklensin mi?\nŞu anki metnin yerine geçecek.';
      },
      untitled: 'not'
    },
    en: {
      placeholder: 'Start typing. Everything saves itself.',
      typing: 'typing',
      saved: 'Saved',
      error: 'Could not save — download your text',
      count: function (w, c) { return w + ' words · ' + c + ' characters'; },
      theme: 'Theme', paper: 'Paper', font: 'Typeface',
      smaller: 'Smaller text', bigger: 'Larger text',
      download: 'Download text', restore: 'Restore backup', lang: 'Switch language',
      restoreAsk: function (t) {
        return 'Restore the backup from ' + t + '?\nIt will replace your current text.';
      },
      untitled: 'note'
    }
  };

  var root = document.documentElement;
  var body = document.body;
  var editor = document.getElementById('editor');
  var mirror = document.getElementById('mirror');
  var ghost = document.getElementById('ghost');
  var paper = document.getElementById('paper');
  var statusEl = document.getElementById('status');
  var countEl = document.getElementById('count');
  var bar = document.querySelector('.bar');
  var btn = {
    theme: document.getElementById('t-theme'),
    paper: document.getElementById('t-paper'),
    font: document.getElementById('t-font'),
    smaller: document.getElementById('t-smaller'),
    bigger: document.getElementById('t-bigger'),
    download: document.getElementById('t-download'),
    restore: document.getElementById('t-restore'),
    lang: document.getElementById('t-lang')
  };

  var lang = STR[root.lang] ? root.lang : 'tr';
  var t = STR[lang];
  var calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var saveTimer = null, statusTimer = null, uiTimer = null;
  var flattenTimer = null, ghostTimer = null;
  var lastTypedAt = 0, lastBackup = null, prevValue = '', padTop = 0;
  var introPending = true;   // açılış daktilosu henüz başlamadı

  /* ---- Depolama ------------------------------------------------------- */

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function store(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) { return false; }
  }

  /* ---- Ayna katmanı -----------------------------------------------------
     from/to verilirse o aralıktaki harfler tek tek animasyonlu eklenir.    */

  function paint(value, from, to) {
    var frag = document.createDocumentFragment();

    if (from == null) {
      frag.appendChild(document.createTextNode(value + '\n'));
    } else {
      if (from > 0) frag.appendChild(document.createTextNode(value.slice(0, from)));
      var i = from, n = 0;
      while (i < to) {
        var ch = String.fromCodePoint(value.codePointAt(i));
        var span = document.createElement('span');
        span.className = 'ink';
        span.textContent = ch;
        span.style.animationDelay = Math.min(n * INK_STAGGER, 320) + 'ms';
        frag.appendChild(span);
        i += ch.length;
        n++;
      }
      /* Sondaki satır sonu, textarea'nın gösterdiği boş son satırı taklit eder;
         olmazsa en alta kaydırınca satırlar bir satır kayar. */
      frag.appendChild(document.createTextNode(value.slice(to) + '\n'));
    }

    mirror.replaceChildren(frag);
    body.classList.add('mirrored');
  }

  /* Eski ve yeni metnin ortak ön/son ekini atıp eklenen aralığı bulur. */
  function insertedRange(a, b) {
    if (a === b) return null;
    var min = Math.min(a.length, b.length);
    var p = 0;
    while (p < min && a.charCodeAt(p) === b.charCodeAt(p)) p++;
    var s = 0;
    while (s < min - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
    var to = b.length - s;
    return to > p ? [p, to] : null;   // saf silme ise animasyon yok
  }

  function flattenSoon(value, count) {
    if (flattenTimer) clearTimeout(flattenTimer);
    flattenTimer = setTimeout(function () {
      flattenTimer = null;
      if (editor.value === value) paint(value, null);
    }, Math.min(count * INK_STAGGER, 320) + 260);
  }

  function refreshMirror(animate) {
    var v = editor.value;
    var range = animate && !calm ? insertedRange(prevValue, v) : null;

    if (range && range[1] - range[0] <= INK_MAX) {
      paint(v, range[0], range[1]);
      flattenSoon(v, range[1] - range[0]);
    } else {
      if (flattenTimer) { clearTimeout(flattenTimer); flattenTimer = null; }
      paint(v, null);
    }

    prevValue = v;
    syncScroll();
  }

  function syncScroll() {
    mirror.scrollTop = editor.scrollTop;
    paper.style.backgroundPositionY = (padTop - editor.scrollTop) + 'px';
  }

  function measure() {
    padTop = parseFloat(getComputedStyle(editor).paddingTop) || 0;
    syncScroll();
  }

  /* ---- Karşılama yazısı --------------------------------------------------
     Boş sayfada daktilo gibi yazılır; ilk tuşa basılınca kaybolur.         */

  function ghostStop(clear) {
    if (ghostTimer) { clearInterval(ghostTimer); ghostTimer = null; }
    if (clear) ghost.replaceChildren();
  }

  function ghostShow(animate) {
    ghostStop(true);
    if (editor.value) return;

    /* Açılış daktilosu beklerken sabit metni basma; yoksa önce tamamı
       görünüp sonra sıfırlanıyor. */
    if (!animate && introPending) return;

    if (!animate || calm) {
      ghost.textContent = t.placeholder;
      return;
    }

    var text = document.createElement('span');
    var caret = document.createElement('span');
    caret.className = 'ghost-caret';
    ghost.replaceChildren(text, caret);

    var chars = Array.from(t.placeholder);
    var i = 0;
    ghostTimer = setInterval(function () {
      if (i >= chars.length) {
        ghostStop(false);
        caret.remove();          // gerçek imleçle karışmasın
        return;
      }
      text.textContent += chars[i++];
    }, GHOST_SPEED);
  }

  /* ---- Kaydetme -------------------------------------------------------- */

  function commit() {
    saveTimer = null;
    if (store(K.note, editor.value)) setStatus('saved', STATUS_HIDE);
    else setStatus('error', 0);
  }

  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); commit(); }
  }

  function flushNow() {
    if (saveTimer) clearTimeout(saveTimer);
    commit();
  }

  function schedule() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(commit, SAVE_DELAY);
  }

  function setStatus(state, hideAfter) {
    statusEl.dataset.state = state;
    statusEl.textContent = t[state] || '';
    statusEl.classList.add('is-visible');
    if (statusTimer) clearTimeout(statusTimer);
    if (hideAfter) {
      statusTimer = setTimeout(function () {
        statusEl.classList.remove('is-visible');
      }, hideAfter);
    }
  }

  function updateCount() {
    var v = editor.value;
    var words = v.trim() ? v.trim().split(/\s+/).length : 0;
    countEl.textContent = t.count(words.toLocaleString(lang), v.length.toLocaleString(lang));
  }

  /* ---- Yedek ------------------------------------------------------------
     Dakikada bir anlık kopya. Metni yanlışlıkla silersen geri dönüş yolu.  */

  function takeBackup() {
    var v = editor.value;
    if (!v.trim() || v === lastBackup) return;
    if (store(K.backup, v)) {
      store(K.backupAt, String(Date.now()));
      lastBackup = v;
    }
    refreshRestore();
  }

  function refreshRestore() {
    var b = read(K.backup, '');
    btn.restore.hidden = !b || b === editor.value;
  }

  function restoreBackup() {
    var b = read(K.backup, '');
    if (!b) return;
    var at = Number(read(K.backupAt, 0));
    var when = at
      ? new Date(at).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })
      : '—';
    if (!confirm(t.restoreAsk(when))) return;
    setText(b);
    flushNow();
  }

  function setText(v) {
    editor.value = v;
    refreshMirror(false);
    updateCount();
    refreshRestore();
    ghostShow(false);
  }

  /* ---- Tercihler -------------------------------------------------------- */

  function effectiveTheme() {
    if (root.dataset.theme) return root.dataset.theme;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function toggleTheme() {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    store(K.theme, next);
  }

  var FONTS = ['sans', 'serif', 'mono'];
  var PAPERS = ['plain', 'ruled', 'grid'];

  function cycle(list, attr, key) {
    var i = list.indexOf(root.dataset[attr]);
    var next = list[(i + 1) % list.length];
    root.dataset[attr] = next;
    store(key, next);
    requestAnimationFrame(measure);
  }

  function stepSize(delta) {
    var cur = Number(root.dataset.size || 2);
    var next = Math.min(3, Math.max(1, cur + delta));
    root.dataset.size = String(next);
    store(K.size, String(next));
    requestAnimationFrame(measure);
  }

  function toggleLang() {
    lang = lang === 'tr' ? 'en' : 'tr';
    t = STR[lang];
    root.lang = lang;
    store(K.lang, lang);
    applyLang();
  }

  function applyLang() {
    editor.setAttribute('aria-label', lang === 'tr' ? 'Not' : 'Note');
    for (var key in btn) {
      if (btn[key] && t[key]) {
        btn[key].setAttribute('aria-label', t[key]);
        btn[key].title = t[key];
      }
    }
    btn.lang.textContent = lang === 'tr' ? 'EN' : 'TR';
    updateCount();
    ghostShow(false);
    if (statusEl.dataset.state) statusEl.textContent = t[statusEl.dataset.state] || '';
  }

  /* ---- İndirme ---------------------------------------------------------- */

  var TR_MAP = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
                 'Ç': 'C', 'Ğ': 'G', 'İ': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U' };

  function slug(s) {
    return s.replace(/[çğıöşüÇĞİÖŞÜ]/g, function (c) { return TR_MAP[c]; })
            .replace(/[^\w\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .slice(0, 40)
            .replace(/-+$/, '')
            .toLowerCase();
  }

  function download() {
    var lines = editor.value.split('\n');
    var first = '';
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim()) { first = lines[i].trim(); break; }
    }
    var name = slug(first) || t.untitled;
    var blob = new Blob([editor.value], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name + '-' + new Date().toISOString().slice(0, 10) + '.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---- Çubuğun belirip sönmesi ------------------------------------------ */

  function showUI() {
    if (body.classList.contains('zen')) return;
    body.classList.add('ui-on');
    if (uiTimer) clearTimeout(uiTimer);
    uiTimer = setTimeout(hideUI, UI_HIDE);
  }

  function hideUI() {
    body.classList.remove('ui-on');
    if (uiTimer) { clearTimeout(uiTimer); uiTimer = null; }
  }

  /* ---- Başlangıç -------------------------------------------------------- */

  applyLang();
  setText(read(K.note, ''));
  lastBackup = read(K.backup, null);
  measure();
  editor.focus();
  try { editor.setSelectionRange(editor.value.length, editor.value.length); } catch (e) {}
  setTimeout(function () { introPending = false; ghostShow(true); }, GHOST_DELAY);
  showUI();
  setInterval(takeBackup, BACKUP_EVERY);

  /* ---- Olaylar ---------------------------------------------------------- */

  editor.addEventListener('input', function () {
    lastTypedAt = Date.now();
    ghostStop(true);
    refreshMirror(true);
    updateCount();
    setStatus('typing', 0);
    schedule();
    hideUI();
    if (!editor.value) ghostShow(false);
  });

  editor.addEventListener('scroll', syncScroll, { passive: true });
  editor.addEventListener('blur', flush);
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  window.addEventListener('resize', measure);

  /* Çince/Japonca gibi girdi yöntemlerinde besteleme sırasında aynayı
     devre dışı bırak, asıl metni görünür kıl. */
  editor.addEventListener('compositionstart', function () {
    body.classList.add('composing');
  });
  editor.addEventListener('compositionend', function () {
    body.classList.remove('composing');
    refreshMirror(false);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { flush(); return; }
    adoptExternal();
  });

  /* Başka sekmede yazılanı al — burada az önce yazmadıysan ve imleci koru. */
  function adoptExternal() {
    var stored = read(K.note, null);
    if (stored === null || stored === editor.value) return;
    if (Date.now() - lastTypedAt < ADOPT_GRACE) return;
    var start = editor.selectionStart, end = editor.selectionEnd;
    setText(stored);
    try {
      editor.setSelectionRange(Math.min(start, stored.length), Math.min(end, stored.length));
    } catch (e) {}
  }

  window.addEventListener('storage', function (e) {
    if (e.key === K.note) adoptExternal();
    if (e.key === K.backup) refreshRestore();
  });

  /* Tab girinti eklesin, odağı kaçırmasın. */
  editor.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    var ok = false;
    try { ok = document.execCommand('insertText', false, '\t'); } catch (err) {}
    if (!ok) {
      var s = editor.selectionStart, en = editor.selectionEnd;
      editor.setRangeText('\t', s, en, 'end');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  document.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (mod && !e.shiftKey && !e.altKey) {
      var k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); flushNow(); setStatus('saved', STATUS_HIDE); return; }
      if (k === 'd') { e.preventDefault(); toggleTheme(); showUI(); return; }
      if (k === 'e') { e.preventDefault(); download(); return; }
    }
    if (e.key === 'Escape') {
      body.classList.toggle('zen');
      if (body.classList.contains('zen')) hideUI();
      editor.focus();
    }
  });

  /* Sayfanın herhangi bir yerine dokunmak yazmaya başlatır. */
  document.addEventListener('pointerdown', function (e) {
    if (e.target === editor || e.target.closest('.bar')) return;
    e.preventDefault();
    editor.focus();
  });

  /* Çubuğa tıklayınca imleç yazıda kalsın. */
  bar.addEventListener('mousedown', function (e) { e.preventDefault(); });

  window.addEventListener('mousemove', showUI, { passive: true });
  window.addEventListener('touchstart', showUI, { passive: true });

  btn.theme.addEventListener('click', function () { toggleTheme(); showUI(); });
  btn.paper.addEventListener('click', function () { cycle(PAPERS, 'paper', K.paper); showUI(); });
  btn.font.addEventListener('click', function () { cycle(FONTS, 'font', K.font); showUI(); });
  btn.smaller.addEventListener('click', function () { stepSize(-1); showUI(); });
  btn.bigger.addEventListener('click', function () { stepSize(1); showUI(); });
  btn.download.addEventListener('click', function () { download(); showUI(); });
  btn.restore.addEventListener('click', function () { restoreBackup(); showUI(); });
  btn.lang.addEventListener('click', function () { toggleLang(); showUI(); });

  /* ---- Çevrimdışı ------------------------------------------------------- */

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
