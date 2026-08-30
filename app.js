/* Çağrı Notepad — tek sayfa, kendiliğinden kaydeden defter.
   Bağımlılık yok. Veri tarayıcıdan çıkmaz. */

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
    lang: NS + 'lang'
  };

  var SAVE_DELAY = 300;      // yazma durduktan sonra diske yazma gecikmesi
  var BACKUP_EVERY = 60000;  // anlık kopya aralığı
  var STATUS_HIDE = 1800;    // "Kaydedildi" ne kadar ekranda kalsın
  var UI_HIDE = 2600;        // araç çubuğu boşta ne kadar sonra sönsün
  var ADOPT_GRACE = 2000;    // bu süre içinde yazdıysan başka sekmenin metnini alma

  var STR = {
    tr: {
      placeholder: 'Yazmaya başla. Yazdığın kendiliğinden kaydedilir.',
      typing: 'yazılıyor',
      saved: 'Kaydedildi',
      error: 'Kaydedilemedi — metni indir',
      count: function (w, c) { return w + ' kelime · ' + c + ' karakter'; },
      theme: 'Tema', font: 'Yazı tipi', smaller: 'Yazıyı küçült', bigger: 'Yazıyı büyüt',
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
      theme: 'Theme', font: 'Typeface', smaller: 'Smaller text', bigger: 'Larger text',
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
  var statusEl = document.getElementById('status');
  var countEl = document.getElementById('count');
  var btn = {
    theme: document.getElementById('t-theme'),
    font: document.getElementById('t-font'),
    smaller: document.getElementById('t-smaller'),
    bigger: document.getElementById('t-bigger'),
    download: document.getElementById('t-download'),
    restore: document.getElementById('t-restore'),
    lang: document.getElementById('t-lang')
  };

  var lang = STR[root.lang] ? root.lang : 'tr';
  var t = STR[lang];
  var saveTimer = null, statusTimer = null, uiTimer = null;
  var lastTypedAt = 0, lastBackup = null;

  /* ---- Depolama ------------------------------------------------------- */

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) { return false; }
  }

  /* ---- Kaydetme -------------------------------------------------------- */

  function commit() {
    saveTimer = null;
    if (write(K.note, editor.value)) setStatus('saved', STATUS_HIDE);
    else setStatus('error', 0);
  }

  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); commit(); }
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
    if (write(K.backup, v)) {
      write(K.backupAt, String(Date.now()));
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

  function flushNow() {
    if (saveTimer) clearTimeout(saveTimer);
    commit();
  }

  function setText(v) {
    editor.value = v;
    updateCount();
    refreshRestore();
  }

  /* ---- Tercihler -------------------------------------------------------- */

  function effectiveTheme() {
    if (root.dataset.theme) return root.dataset.theme;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function toggleTheme() {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    write(K.theme, next);
  }

  var FONTS = ['sans', 'serif', 'mono'];

  function cycleFont() {
    var i = FONTS.indexOf(root.dataset.font || 'sans');
    var next = FONTS[(i + 1) % FONTS.length];
    root.dataset.font = next;
    write(K.font, next);
  }

  function stepSize(delta) {
    var cur = Number(root.dataset.size || 2);
    var next = Math.min(3, Math.max(1, cur + delta));
    root.dataset.size = String(next);
    write(K.size, String(next));
  }

  function toggleLang() {
    lang = lang === 'tr' ? 'en' : 'tr';
    t = STR[lang];
    root.lang = lang;
    write(K.lang, lang);
    applyLang();
  }

  function applyLang() {
    editor.placeholder = t.placeholder;
    editor.setAttribute('aria-label', lang === 'tr' ? 'Not' : 'Note');
    btn.theme.setAttribute('aria-label', t.theme);
    btn.font.setAttribute('aria-label', t.font);
    btn.smaller.setAttribute('aria-label', t.smaller);
    btn.bigger.setAttribute('aria-label', t.bigger);
    btn.download.setAttribute('aria-label', t.download);
    btn.restore.setAttribute('aria-label', t.restore);
    btn.lang.setAttribute('aria-label', t.lang);
    btn.lang.textContent = lang === 'tr' ? 'EN' : 'TR';
    for (var key in btn) if (btn[key]) btn[key].title = t[key] || '';
    updateCount();
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
    var date = new Date().toISOString().slice(0, 10);
    var blob = new Blob([editor.value], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name + '-' + date + '.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---- Arayüzün belirip sönmesi ----------------------------------------- */

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

  setText(read(K.note, ''));
  lastBackup = read(K.backup, null);
  applyLang();
  editor.focus();
  try { editor.setSelectionRange(editor.value.length, editor.value.length); } catch (e) {}
  showUI();
  setInterval(takeBackup, BACKUP_EVERY);

  /* ---- Olaylar ---------------------------------------------------------- */

  editor.addEventListener('input', function () {
    lastTypedAt = Date.now();
    updateCount();
    setStatus('typing', 0);
    schedule();
    hideUI();
  });

  editor.addEventListener('blur', flush);
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);

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

  window.addEventListener('mousemove', showUI, { passive: true });
  window.addEventListener('touchstart', showUI, { passive: true });

  btn.theme.addEventListener('click', function () { toggleTheme(); showUI(); });
  btn.font.addEventListener('click', function () { cycleFont(); showUI(); });
  btn.smaller.addEventListener('click', function () { stepSize(-1); showUI(); });
  btn.bigger.addEventListener('click', function () { stepSize(1); showUI(); });
  btn.download.addEventListener('click', function () { download(); showUI(); });
  btn.restore.addEventListener('click', function () { restoreBackup(); showUI(); });
  btn.lang.addEventListener('click', function () { toggleLang(); showUI(); });

  /* Araç çubuğuna tıklayınca imleç yazıda kalsın. */
  document.querySelector('.bar').addEventListener('mousedown', function (e) {
    e.preventDefault();
  });

  /* ---- Çevrimdışı ------------------------------------------------------- */

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
