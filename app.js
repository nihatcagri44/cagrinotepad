/* Çağrı Notepad — kendiliğinden kaydeden defter.
   Bağımlılık yok. Veri tarayıcıdan çıkmaz.

   Yazının animasyonlu belirmesi için metin iki katmanda yaşar: gerçek
   <textarea> (saydam yazı, görünür imleç) ve onun arkasında birebir aynı
   tipografiye sahip bir "ayna". Görünen harfler aynanın harfleridir; yeni
   yazılanlar oraya kısa bir animasyonla eklenir.

   Notlar tek bir JSON dizisinde tutulur (v2). İlk açılışta v1'deki tek not
   dizinin ilk elemanı olur; eski anahtar silinmez.                          */

(function () {
  'use strict';

  var V1 = 'cagrinotepad:v1:';
  var V2 = 'cagrinotepad:v2:';
  var K = {
    legacyNote: V1 + 'note',
    theme: V1 + 'theme',
    font: V1 + 'font',
    size: V1 + 'size',
    paper: V1 + 'paper',
    lang: V1 + 'lang',
    notes: V2 + 'notes',
    current: V2 + 'current',
    panel: V2 + 'panel',
    backup: V2 + 'backup'
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
  var DRAG_MIN = 4;          // çerçeve bu kadar px sürüklenince belirir
  var PANEL_ANIM = 380;      // panel açılırken kağıt hizasını bu süre boyunca izle
  var TITLE_MAX = 60;

  var STR = {
    tr: {
      placeholder: 'Yazmaya başla. Yazdığın kendiliğinden kaydedilir.',
      typing: 'yazılıyor',
      saved: 'Kaydedildi',
      error: 'Kaydedilemedi — metni indir',
      count: function (w, c) { return w + ' kelime · ' + c + ' karakter'; },
      panel: 'Notlar', newNote: 'Yeni not', deleteNote: 'Notu sil',
      theme: 'Tema', paper: 'Kağıt', font: 'Yazı tipi',
      smaller: 'Yazıyı küçült', bigger: 'Yazıyı büyüt',
      urgent: 'Acil — kırmızı uyarı ekle / kaldır',
      important: 'Önemli — sarı uyarı ekle / kaldır',
      download: 'Metni indir', restore: 'Yedeği geri yükle', lang: 'Dili değiştir',
      restoreAsk: function (t) {
        return t + ' tarihli yedek geri yüklensin mi?\nŞu anki metnin yerine geçecek.';
      },
      deleteAsk: function (title) { return '"' + title + '" silinsin mi?\nBu geri alınamaz.'; },
      untitled: 'not',
      emptyTitle: 'Boş not',
      words: function (n) { return n + ' kelime'; }
    },
    en: {
      placeholder: 'Start typing. Everything saves itself.',
      typing: 'typing',
      saved: 'Saved',
      error: 'Could not save — download your text',
      count: function (w, c) { return w + ' words · ' + c + ' characters'; },
      panel: 'Notes', newNote: 'New note', deleteNote: 'Delete note',
      theme: 'Theme', paper: 'Paper', font: 'Typeface',
      smaller: 'Smaller text', bigger: 'Larger text',
      urgent: 'Urgent — toggle red alert',
      important: 'Important — toggle yellow alert',
      download: 'Download text', restore: 'Restore backup', lang: 'Switch language',
      restoreAsk: function (t) {
        return 'Restore the backup from ' + t + '?\nIt will replace your current text.';
      },
      deleteAsk: function (title) { return 'Delete "' + title + '"?\nThis cannot be undone.'; },
      untitled: 'note',
      emptyTitle: 'Empty note',
      words: function (n) { return n + ' words'; }
    }
  };

  var root = document.documentElement;
  var body = document.body;
  var editor = document.getElementById('editor');
  var mirror = document.getElementById('mirror');
  var ghost = document.getElementById('ghost');
  var paper = document.getElementById('paper');
  var marquee = document.getElementById('marquee');
  var panel = document.getElementById('panel');
  var panelTitle = document.getElementById('panel-title');
  var notesEl = document.getElementById('notes');
  var scrim = document.getElementById('scrim');
  var statusEl = document.getElementById('status');
  var countEl = document.getElementById('count');
  var bar = document.querySelector('.bar');
  var btn = {
    panel: document.getElementById('t-panel'),
    newNote: document.getElementById('n-new'),
    urgent: document.getElementById('t-urgent'),
    important: document.getElementById('t-important'),
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
  var narrow = matchMedia('(max-width: 900px)');

  var notes = [];            // [{ id, text, created, updated }]
  var current = null;        // notes içindeki aktif nesne

  var saveTimer = null, statusTimer = null, uiTimer = null;
  var flattenTimer = null, ghostTimer = null;
  var lastTypedAt = 0, prevValue = '', padTop = 0, colLeft = 0;
  var introPending = true;   // açılış daktilosu henüz başlamadı
  var drag = null;           // seçim çerçevesi durumu

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

  function readJSON(key) {
    var raw = read(key, null);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  /* ---- Notlar ----------------------------------------------------------- */

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function makeNote(text) {
    var now = Date.now();
    return { id: uid(), text: text || '', created: now, updated: now };
  }

  function loadNotes() {
    var arr = readJSON(K.notes);
    if (!Array.isArray(arr)) arr = [];
    arr = arr.filter(function (n) { return n && typeof n.id === 'string'; });
    if (!arr.length) arr = [makeNote(read(K.legacyNote, ''))];   // v1'den taşı
    notes = arr;

    var wanted = read(K.current, null);
    current = notes.filter(function (n) { return n.id === wanted; })[0] || sorted()[0];
  }

  function persistNotes() {
    return store(K.notes, JSON.stringify(notes)) && store(K.current, current.id);
  }

  function sorted() {
    return notes.slice().sort(function (a, b) { return b.updated - a.updated; });
  }

  function firstLine(text) {
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (s) return s;
    }
    return '';
  }

  function titleOf(note) {
    var s = firstLine(note.text);
    return s ? s.slice(0, TITLE_MAX) : t.emptyTitle;
  }

  function whenOf(ts) {
    var d = new Date(ts), now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
    }
    var opts = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(lang, opts);
  }

  function wordCount(text) {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }

  function renderList() {
    var frag = document.createDocumentFragment();
    sorted().forEach(function (n) {
      var li = document.createElement('li');
      li.className = 'note' + (n === current ? ' is-current' : '') + (firstLine(n.text) ? '' : ' is-empty');
      li.dataset.id = n.id;

      var open = document.createElement('button');
      open.type = 'button';
      open.className = 'note-open';
      if (n === current) open.setAttribute('aria-current', 'true');

      var title = document.createElement('span');
      title.className = 'note-title';
      title.appendChild(paintedText(titleOf(n)));

      var meta = document.createElement('span');
      meta.className = 'note-meta';
      meta.textContent = whenOf(n.updated) + ' · ' + t.words(wordCount(n.text).toLocaleString(lang));

      open.appendChild(title);
      open.appendChild(meta);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'tool note-del';
      del.setAttribute('aria-label', t.deleteNote);
      del.title = t.deleteNote;
      del.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8"/></svg>';

      li.appendChild(open);
      li.appendChild(del);
      frag.appendChild(li);
    });
    notesEl.replaceChildren(frag);
  }

  function openNote(id) {
    var n = notes.filter(function (x) { return x.id === id; })[0];
    if (!n || n === current) return;
    flushNow();
    current = n;
    store(K.current, current.id);
    setText(current.text);
    editor.scrollTop = 0;
    syncScroll();
    renderList();
    editor.focus();
    try { editor.setSelectionRange(current.text.length, current.text.length); } catch (e) {}
    if (narrow.matches) setPanel(false);
  }

  function newNote() {
    flushNow();
    var n = makeNote('');
    notes.push(n);
    current = n;
    persistNotes();
    setText('');
    editor.scrollTop = 0;
    syncScroll();
    renderList();
    editor.focus();
    if (narrow.matches) setPanel(false);
  }

  function deleteNote(id) {
    var n = notes.filter(function (x) { return x.id === id; })[0];
    if (!n) return;
    if (!confirm(t.deleteAsk(titleOf(n)))) return;

    notes = notes.filter(function (x) { return x !== n; });
    if (n === current) {
      if (!notes.length) notes.push(makeNote(''));
      current = sorted()[0];
      setText(current.text);
      editor.scrollTop = 0;
      syncScroll();
    }
    persistNotes();
    renderList();
    editor.focus();
  }

  /* ---- Panel ------------------------------------------------------------ */

  function panelOpen() { return root.dataset.panel === '1'; }

  function setPanel(open) {
    root.dataset.panel = open ? '1' : '0';
    btn.panel.setAttribute('aria-pressed', open ? 'true' : 'false');
    store(K.panel, open ? '1' : '0');
    trackMeasure();
  }

  /* Panel açılıp kapanırken metin sütunu kayar; kağıt çizgileri onu izlesin. */
  function trackMeasure() {
    var t0 = performance.now();
    (function step() {
      measure();
      if (performance.now() - t0 < PANEL_ANIM) requestAnimationFrame(step);
    })();
  }

  /* ---- Ayna katmanı -----------------------------------------------------
     from/to verilirse o aralıktaki harfler tek tek animasyonlu eklenir.    */

  function appendInk(parent, value, offset, from, to) {
    var start = Math.max(0, from - offset), end = Math.min(value.length, to - offset);
    if (from == null || start >= end) {
      parent.appendChild(document.createTextNode(value));
    } else {
      parent.appendChild(document.createTextNode(value.slice(0, start)));
      var i = start;
      while (i < end) {
        var ch = String.fromCodePoint(value.codePointAt(i));
        var span = document.createElement('span');
        span.className = 'ink';
        span.textContent = ch;
        span.style.animationDelay = Math.min((offset + i - from) * INK_STAGGER, 320) + 'ms';
        parent.appendChild(span);
        i += ch.length;
      }
      parent.appendChild(document.createTextNode(value.slice(end)));
    }
  }

  /* İşaret metnin içinde kaldığı için kayıt, yedek, kopyalama ve .txt kayıpsızdır.
     Görünmez glif kendi genişliğini korur; çizilen ikon imleci kaydırmaz. */
  function paintedText(value, from, to) {
    var frag = document.createDocumentFragment();
    var re = /^[\t ]*(🔴|🟡)(?=[\t ]|$)/gm;
    var match, cursor = 0;
    while ((match = re.exec(value))) {
      var at = match.index + match[0].length - match[1].length;
      appendInk(frag, value.slice(cursor, at), cursor, from, to);
      var marker = document.createElement('span');
      marker.className = 'priority-marker priority--' + (match[1] === '🔴' ? 'red' : 'yellow');
      var glyph = document.createElement('span');
      glyph.className = 'priority-glyph';
      glyph.textContent = match[1];
      marker.appendChild(glyph);
      frag.appendChild(marker);
      cursor = at + match[1].length;
    }
    appendInk(frag, value.slice(cursor), cursor, from, to);
    return frag;
  }

  function paint(value, from, to) {
    /* Son boş satır textarea ile aynı kaydırma yüksekliğini sağlar. */
    var frag = paintedText(value + '\n', from, to);
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
    refreshPriority();
  }

  function syncScroll() {
    mirror.scrollTop = editor.scrollTop;
    paper.style.backgroundPosition = colLeft + 'px ' + (padTop - editor.scrollTop) + 'px';
  }

  function measure() {
    padTop = parseFloat(getComputedStyle(editor).paddingTop) || 0;
    colLeft = Math.round(editor.getBoundingClientRect().left);
    syncScroll();
  }

  /* ---- Satır öncelikleri ------------------------------------------------ */

  function priorityLines() {
    var value = editor.value, start = editor.selectionStart, end = editor.selectionEnd;
    var first = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
    // Seçimin sonundaki satır sonu, bir sonraki satırı seçime katmaz.
    var last = end > start && value[end - 1] === '\n' ? end - 1 : end;
    var stop = value.indexOf('\n', last);
    if (stop < 0) stop = value.length;
    var offset = first;
    return value.slice(first, stop).split('\n').map(function (line) {
      var match = /^([\t ]*)(?:(🔴|🟡)(?:[\t ]|$))?/.exec(line);
      var item = { start: offset + match[1].length,
        end: offset + match[0].length, token: match[2], blank: !line.trim() };
      offset += line.length + 1;
      return item;
    }).filter(function (line, i, lines) { return lines.length === 1 || !line.blank; });
  }

  function refreshPriority() {
    var lines = priorityLines();
    btn.urgent.setAttribute('aria-pressed', String(lines.length > 0 && lines.every(function (line) { return line.token === '🔴'; })));
    btn.important.setAttribute('aria-pressed', String(lines.length > 0 && lines.every(function (line) { return line.token === '🟡'; })));
  }

  function togglePriority(token) {
    var lines = priorityLines();
    if (!lines.length) return;
    var remove = lines.every(function (line) { return line.token === token; });
    var replacement = remove ? '' : token + ' ';
    var value = editor.value, start = editor.selectionStart, end = editor.selectionEnd;
    var direction = editor.selectionDirection, scroll = editor.scrollTop;
    var from = lines[0].start, to = lines[lines.length - 1].end;
    var text = '', cursor = from;
    lines.forEach(function (line) {
      text += value.slice(cursor, line.start) + replacement;
      cursor = line.end;
    });

    function moved(pos) {
      var next = pos;
      lines.forEach(function (line) {
        if (pos >= line.start) next += replacement.length - Math.min(pos - line.start, line.end - line.start);
      });
      return next;
    }

    editor.focus({ preventScroll: true });
    editor.setSelectionRange(from, to);
    // Tarayıcının geri alma geçmişinde tek bir düzenleme olarak tut.
    var ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) {}
    if (!ok) {
      editor.setRangeText(text, from, to, 'end');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
    editor.setSelectionRange(moved(start), moved(end), direction);
    editor.scrollTop = scroll;
    syncScroll();
    refreshPriority();
    showUI();
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
    var changed = current.text !== editor.value;
    if (changed) {
      current.text = editor.value;
      current.updated = Date.now();
    }
    if (persistNotes()) setStatus('saved', STATUS_HIDE);
    else setStatus('error', 0);
    if (changed) renderList();
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
    countEl.textContent = t.count(wordCount(v).toLocaleString(lang), v.length.toLocaleString(lang));
  }

  /* ---- Yedek ------------------------------------------------------------
     Dakikada bir, aktif notun anlık kopyası. Yanlışlıkla silersen dönüş yolu. */

  function takeBackup() {
    var v = editor.value;
    var b = readJSON(K.backup);
    if (!v.trim() || (b && b.id === current.id && b.text === v)) return;
    store(K.backup, JSON.stringify({ id: current.id, text: v, at: Date.now() }));
    refreshRestore();
  }

  function refreshRestore() {
    var b = readJSON(K.backup);
    btn.restore.hidden = !(b && b.id === current.id && b.text && b.text !== editor.value);
  }

  function restoreBackup() {
    var b = readJSON(K.backup);
    if (!b || b.id !== current.id || !b.text) return;
    var when = b.at
      ? new Date(b.at).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })
      : '—';
    if (!confirm(t.restoreAsk(when))) return;
    setText(b.text);
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
    panel.setAttribute('aria-label', t.panel);
    panelTitle.textContent = t.panel;
    for (var key in btn) {
      if (btn[key] && t[key]) {
        btn[key].setAttribute('aria-label', t[key]);
        btn[key].title = t[key];
      }
    }
    btn.lang.textContent = lang === 'tr' ? 'EN' : 'TR';
    updateCount();
    ghostShow(false);
    if (current) renderList();
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
    var name = slug(firstLine(editor.value)) || t.untitled;
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

  /* ---- Seçim çerçevesi ----------------------------------------------------
     Fareyle basılı tutup sürüklerken masaüstündeki dosya seçimi gibi bir
     dikdörtgen. Yalnızca görsel; asıl seçimi textarea yapmaya devam eder.  */

  function dragStart(e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, on: false };
  }

  function dragMove(e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(dx) < DRAG_MIN && Math.abs(dy) < DRAG_MIN) return;
      drag.on = true;
      marquee.hidden = false;
    }
    marquee.style.transform = 'translate(' + Math.min(e.clientX, drag.x) + 'px,' + Math.min(e.clientY, drag.y) + 'px)';
    marquee.style.width = Math.abs(dx) + 'px';
    marquee.style.height = Math.abs(dy) + 'px';
  }

  function dragEnd() {
    if (!drag) return;
    drag = null;
    marquee.hidden = true;
    marquee.style.width = marquee.style.height = '0px';
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

  loadNotes();
  applyLang();
  setText(current.text);
  persistNotes();                 // v1'den taşındıysa v2'ye hemen yaz
  renderList();
  btn.panel.setAttribute('aria-pressed', panelOpen() ? 'true' : 'false');
  measure();
  editor.focus();
  try { editor.setSelectionRange(editor.value.length, editor.value.length); } catch (e) {}
  setTimeout(function () { introPending = false; ghostShow(true); }, GHOST_DELAY);
  showUI();
  setInterval(takeBackup, BACKUP_EVERY);
  requestAnimationFrame(function () { body.classList.add('ready'); });   // geçişler ancak şimdi

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
  editor.addEventListener('select', refreshPriority);
  document.addEventListener('selectionchange', function () {
    if (document.activeElement === editor) refreshPriority();
  });
  editor.addEventListener('blur', flush);
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  window.addEventListener('resize', measure);

  editor.addEventListener('pointerdown', dragStart);
  window.addEventListener('pointermove', dragMove, { passive: true });
  window.addEventListener('pointerup', dragEnd);
  window.addEventListener('pointercancel', dragEnd);
  window.addEventListener('blur', dragEnd);

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
    var arr = readJSON(K.notes);
    if (!Array.isArray(arr) || !arr.length) return;
    if (Date.now() - lastTypedAt < ADOPT_GRACE) return;

    notes = arr.filter(function (n) { return n && typeof n.id === 'string'; });
    var same = notes.filter(function (n) { return n.id === current.id; })[0];
    if (!same) {                          // aktif not başka sekmede silinmiş
      current = sorted()[0];
      setText(current.text);
      renderList();
      return;
    }
    current = same;
    renderList();
    if (current.text === editor.value) return;
    var start = editor.selectionStart, end = editor.selectionEnd;
    setText(current.text);
    try {
      editor.setSelectionRange(Math.min(start, current.text.length), Math.min(end, current.text.length));
    } catch (e) {}
  }

  window.addEventListener('storage', function (e) {
    if (e.key === K.notes) adoptExternal();
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
      if (k === 'b') { e.preventDefault(); setPanel(!panelOpen()); return; }
    }
    if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') {
      e.preventDefault(); newNote(); return;
    }
    if (e.key === 'Escape') {
      if (narrow.matches && panelOpen()) { setPanel(false); editor.focus(); return; }
      body.classList.toggle('zen');
      if (body.classList.contains('zen')) hideUI();
      trackMeasure();
      editor.focus();
    }
  });

  /* Sayfanın herhangi bir yerine dokunmak yazmaya başlatır. */
  document.addEventListener('pointerdown', function (e) {
    if (e.target === editor || e.target.closest('.bar, .panel, .scrim')) return;
    e.preventDefault();
    editor.focus();
  });

  /* Çubuğa tıklayınca imleç yazıda kalsın. */
  bar.addEventListener('mousedown', function (e) { e.preventDefault(); });

  window.addEventListener('mousemove', showUI, { passive: true });
  window.addEventListener('touchstart', showUI, { passive: true });

  notesEl.addEventListener('click', function (e) {
    var li = e.target.closest('.note');
    if (!li) return;
    if (e.target.closest('.note-del')) deleteNote(li.dataset.id);
    else openNote(li.dataset.id);
  });

  scrim.addEventListener('click', function () { setPanel(false); editor.focus(); });

  btn.panel.addEventListener('click', function () { setPanel(!panelOpen()); showUI(); });
  btn.newNote.addEventListener('click', newNote);
  btn.urgent.addEventListener('click', function () { togglePriority('🔴'); });
  btn.important.addEventListener('click', function () { togglePriority('🟡'); });
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
