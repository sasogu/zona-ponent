/* Sincronización de diapositivas entre dispositivos (Zona ponente).
 * ?mando=1    → este dispositivo manda (iPad del ponente): publica la diapositiva actual.
 * ?pantalla=1 → este dispositivo sigue al mando (ordenador del proyector).
 * El canal y la clave de cifrado de las anotaciones viajan dentro de la página cifrada.
 * Relé propio: server/server.js bajo /sync/<canal> (solo índices de diapositiva). */
(function () {
  var topic = window.PONENTE_SYNC_TOPIC;
  var params = new URLSearchParams(location.search);
  var mode = params.has('mando') ? 'mando' : params.has('pantalla') ? 'pantalla' : null;
  if (!topic || !mode || !window.Reveal) return;
  var url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/sync/' + encodeURIComponent(topic);

  // Conexión con reconexión automática; al conectar, el relé envía la última posición del canal.
  function channel(onOpen, onMessage, onDown) {
    var api = { ws: null, send: function (m) { if (api.ws && api.ws.readyState === 1) { api.ws.send(m); return true; } return false; } };
    (function connect() {
      var ws = api.ws = new WebSocket(url, ['ponente-v1', 'auth.' + window.PONENTE_SYNC_TOKEN]);
      ws.onopen = onOpen;
      ws.onmessage = function (e) { onMessage(e.data); };
      ws.onclose = function () { onDown(); setTimeout(connect, 2000); };
    })();
    return api;
  }

  var dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:9999;padding:4px 10px;border-radius:12px;' +
    'font:12px system-ui,sans-serif;color:#fff;background:#6b7280;opacity:.85;transition:opacity .6s';
  if (mode === 'mando') { dot.style.bottom = 'auto'; dot.style.top = '10px'; }
  document.body.appendChild(dot);
  function status(text, color, fade) {
    dot.textContent = text; dot.style.background = color; dot.style.opacity = '.85';
    clearTimeout(dot._t);
    if (fade) dot._t = setTimeout(function () { dot.style.opacity = '0'; }, 2500);
  }

  // Panel de notas legible para el mando: la diapositiva arriba (o a la izquierda en
  // horizontal) y las notas en grande, con botones A−/A+ y anterior/siguiente.
  function notesPanel() {
    var KEY = 'ponenteNotesSize';
    var size = 26;
    try { size = parseInt(localStorage.getItem(KEY), 10) || 26; } catch (e) {}
    var css = document.createElement('style');
    css.textContent =
      '.reveal .speaker-notes,.licencia-cc{display:none!important}' +
      '.reveal{position:fixed!important;top:0;left:0;right:0;height:calc(var(--pn-slide-height,46vh) - 10px)!important}' +
      '#pn{position:fixed;left:0;right:0;top:calc(var(--pn-slide-height,46vh) + 10px);bottom:0;display:flex;flex-direction:column;' +
      'background:#111827;color:#f9fafb;font-family:system-ui,sans-serif;z-index:30}' +
      '#pn-split{position:fixed;left:0;right:0;top:var(--pn-slide-height,46vh);height:20px;transform:translateY(-50%);z-index:40;' +
      'background:#1f2937;cursor:row-resize;touch-action:none;user-select:none;-webkit-user-select:none;display:flex;align-items:center;justify-content:center}' +
      '#pn-split::after{content:"";width:64px;height:5px;border-radius:4px;background:#f97316}' +
      '#pn-split:focus-visible{outline:3px solid #38bdf8;outline-offset:-3px}#pn-split.dragging{background:#374151}' +
      '#pn-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 12px;background:#1f2937;flex:none}' +
      '#pn-bar button{font:600 20px system-ui;min-width:52px;min-height:44px;border:0;border-radius:10px;background:#374151;color:#fff;display:inline-flex;align-items:center;justify-content:center}' +
      '#pn-bar .pn-nav{background:#c2410c;min-width:72px}' +
      '#pn-count{margin-left:auto;font:600 18px system-ui;color:#fdba74}' +
      '#pn-cloud{padding:0;color:#fcd34d;background:#374151}#pn-cloud svg{width:22px;height:22px}' +
      '#pn-next{padding:6px 16px 0;color:#9ca3af;font-size:15px;flex:none}' +
      'html,body{overflow:hidden!important;overscroll-behavior:none;height:100%}' +
      '#pn-scroll{overscroll-behavior:contain;touch-action:pan-y}' +
      '#pn-bar button#pn-full.on{background:#0369a1}' +
      '#pn-scroll{flex:1;min-height:0;padding:10px 18px 24px;overflow-y:auto;line-height:1.45;-webkit-overflow-scrolling:touch}' +
      '#pn-mine{margin-top:1em}' +
      '#pn-mine .box{border-left:4px solid #38bdf8;background:#0c2a3a;padding:8px 12px;border-radius:6px;white-space:pre-wrap;color:#e0f2fe}' +
      '#pn-mine .lbl{font:600 .6em system-ui;letter-spacing:.06em;text-transform:uppercase;color:#7dd3fc;margin-bottom:4px}' +
      '#pn-mine button{font:600 16px system-ui;min-height:40px;padding:0 14px;margin:8px 8px 0 0;border:0;border-radius:10px;background:#374151;color:#fff}' +
      '#pn-mine button.pri{background:#0369a1}' +
      '#pn-mine textarea{width:100%;box-sizing:border-box;min-height:6em;font:inherit;line-height:1.4;padding:8px 10px;border-radius:8px;border:2px solid #38bdf8;background:#0b1220;color:#f9fafb}' +
      '#pn-text,#pn-mine .content{-webkit-user-select:text;user-select:text}' +
      '#pn-text mark,#pn-mine .content mark{background:#fde047;color:#111827;border-radius:3px;padding:0 2px}' +
      '#pn-bar #pn-hl{background:#a16207}#pn-bar #pn-hl.on{background:#ca8a04}' +
      '#pn-text p{margin:0 0 .7em}#pn-text li{margin:.25em 0}' +
      '@media (orientation:landscape){.reveal{right:auto;width:calc(var(--pn-slide-width,52vw) - 10px)!important;height:100%!important}' +
      '#pn{left:calc(var(--pn-slide-width,52vw) + 10px);top:0}' +
      '#pn-split{left:var(--pn-slide-width,52vw);right:auto;top:0;bottom:0;width:20px;height:auto;transform:translateX(-50%);cursor:col-resize}' +
      '#pn-split::after{width:5px;height:64px}#pn-bar{gap:6px;padding:8px}#pn-bar button{min-width:44px;font-size:18px}#pn-bar .pn-nav{min-width:58px}}';
    document.head.appendChild(css);
    var pn = document.createElement('div');
    pn.id = 'pn';
    pn.innerHTML = '<div id="pn-bar"><button class="pn-nav" id="pn-prev">◀</button><button class="pn-nav" id="pn-nxt">▶</button>' +
      '<button id="pn-minus">A−</button><button id="pn-plus">A+</button><span id="pn-count"></span><button id="pn-hl" title="Subrayar la selección" aria-label="Subrayar"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg></button>' +
      '<button id="pn-full" title="Pantalla completa" aria-label="Pantalla completa"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button></div>' +
      '<div id="pn-next"></div><div id="pn-scroll"><div id="pn-text"></div><div id="pn-mine"></div></div>';
    document.body.appendChild(pn);
    // Reparto por dispositivo y orientación; no modifica las notas ni el proyector.
    var SPLIT_KEY = 'ponenteNotesSplit', splits = { portrait: 46, landscape: 52 };
    try {
      var storedSplits = JSON.parse(localStorage.getItem(SPLIT_KEY));
      ['portrait', 'landscape'].forEach(function (o) {
        if (storedSplits && Number.isFinite(storedSplits[o])) splits[o] = Math.max(20, Math.min(75, storedSplits[o]));
      });
    } catch (e) {}
    var split = document.createElement('div');
    split.id = 'pn-split'; split.tabIndex = 0; split.setAttribute('role', 'separator');
    split.setAttribute('aria-label', 'Ajustar espacio entre diapositiva y notas');
    split.setAttribute('aria-controls', 'pn');
    split.title = 'Arrastra para ajustar las notas. Doble toque para restablecer.';
    document.body.appendChild(split);
    function splitOrientation() { return matchMedia('(orientation:landscape)').matches ? 'landscape' : 'portrait'; }
    function splitBounds(o) {
      var length = o === 'landscape' ? window.innerWidth : window.innerHeight;
      return { min: 20, max: Math.max(20, Math.min(75, 100 * (length - (o === 'landscape' ? 280 : 220)) / length)) };
    }
    function applySplit() {
      var o = splitOrientation(), bounds = splitBounds(o), value = Math.max(bounds.min, Math.min(bounds.max, splits[o]));
      document.documentElement.style.setProperty('--pn-slide-' + (o === 'landscape' ? 'width' : 'height'),
        (value * (o === 'landscape' ? window.innerWidth : window.innerHeight) / 100) + 'px');
      split.setAttribute('aria-orientation', o === 'landscape' ? 'vertical' : 'horizontal');
      split.setAttribute('aria-valuemin', bounds.min); split.setAttribute('aria-valuemax', Math.round(bounds.max));
      split.setAttribute('aria-valuenow', Math.round(value));
      split.setAttribute('aria-valuetext', Math.round(100 - value) + '% para notas');
      Reveal.layout();
    }
    function setSplit(value) {
      var o = splitOrientation(), bounds = splitBounds(o);
      splits[o] = Math.max(bounds.min, Math.min(bounds.max, value));
      applySplit();
    }
    function saveSplit() { try { localStorage.setItem(SPLIT_KEY, JSON.stringify(splits)); } catch (e) {} }
    var drag = null, splitFrame = null, lastSplitTap = 0;
    function moveSplit(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.orientation !== splitOrientation()) { endSplit(); return; }
      e.preventDefault();
      var length = drag.orientation === 'landscape' ? window.innerWidth : window.innerHeight;
      drag.value = 100 * (drag.orientation === 'landscape' ? e.clientX : e.clientY) / length;
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 8) drag.moved = true;
      if (splitFrame === null) splitFrame = requestAnimationFrame(function () {
        splitFrame = null; if (drag) setSplit(drag.value);
      });
    }
    function endSplit(e) {
      if (!drag) return;
      if (splitFrame !== null) { cancelAnimationFrame(splitFrame); splitFrame = null; }
      if (drag.orientation === splitOrientation()) setSplit(drag.value);
      var tap = e && e.type === 'pointerup' && !drag.moved && Date.now() - drag.started < 350;
      var id = drag.id; drag = null;
      split.classList.remove('dragging');
      if (split.hasPointerCapture(id)) split.releasePointerCapture(id);
      if (tap) {
        var now = Date.now();
        if (lastSplitTap && now - lastSplitTap < 350) {
          setSplit(splitOrientation() === 'landscape' ? 52 : 46); lastSplitTap = 0;
        } else lastSplitTap = now;
      } else lastSplitTap = 0;
      saveSplit();
    }
    split.addEventListener('pointerdown', function (e) {
      if (!e.isPrimary || e.button !== 0) return;
      e.preventDefault();
      drag = { id: e.pointerId, orientation: splitOrientation(), value: Number(split.getAttribute('aria-valuenow')),
        x: e.clientX, y: e.clientY, started: Date.now(), moved: false };
      split.setPointerCapture(e.pointerId); split.classList.add('dragging'); split.focus({ preventScroll: true });
    });
    split.addEventListener('pointermove', moveSplit);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { split.addEventListener(ev, endSplit); });
    split.addEventListener('dblclick', function () { setSplit(splitOrientation() === 'landscape' ? 52 : 46); saveSplit(); });
    split.addEventListener('keydown', function (e) {
      var o = splitOrientation(), value = Number(split.getAttribute('aria-valuenow'));
      if (e.key === 'Home') value = o === 'landscape' ? 52 : 46;
      else if (e.key === (o === 'landscape' ? 'ArrowLeft' : 'ArrowUp')) value -= 2;
      else if (e.key === (o === 'landscape' ? 'ArrowRight' : 'ArrowDown')) value += 2;
      else return;
      e.preventDefault(); e.stopPropagation(); setSplit(value); saveSplit();
    });
    var cloud = document.createElement('button');
    cloud.id = 'pn-cloud'; cloud.type = 'button'; cloud.setAttribute('role', 'status');
    cloud.setAttribute('aria-label', 'Preparando sincronización…');
    pn.querySelector('#pn-hl').insertAdjacentElement('afterend', cloud);
    cloud.addEventListener('click', function () { status(cloud.dataset.detail || cloud.title, cloud.style.color || '#d1d5db', true); });
    var text = pn.querySelector('#pn-text'), scroll = pn.querySelector('#pn-scroll'), mine = pn.querySelector('#pn-mine');
    function setSize(s) {
      size = Math.max(16, Math.min(48, s)); scroll.style.fontSize = size + 'px';
      try { localStorage.setItem(KEY, size); } catch (e) {}
    }
    // Subrayados: se guardan en localStorage por presentación y diapositiva, junto con
    // una huella de la nota original para descartarlos si la nota cambia.
    var MARKS = 'ponenteMarks:' + location.pathname;
    function loadMarks() { try { return JSON.parse(localStorage.getItem(MARKS)) || {}; } catch (e) { return {}; } }
    function saveMarks(m) { try { localStorage.setItem(MARKS, JSON.stringify(m)); } catch (e) {} }
    var DEVICE = '';
    try {
      DEVICE = localStorage.getItem('ponenteSyncDeviceId') || '';
      if (!DEVICE) { DEVICE = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); localStorage.setItem('ponenteSyncDeviceId', DEVICE); }
    } catch (e) { DEVICE = 'device-' + Math.random().toString(36).slice(2); }
    function stamp(entry) { entry._updated = Date.now(); entry._device = DEVICE; }
    function normalizeMarks(m) {
      var changed = false, now = Date.now();
      Object.keys(m).forEach(function (k) {
        var e = m[k];
        if (!e || typeof e !== 'object') { delete m[k]; changed = true; return; }
        if (!Number.isFinite(e._updated)) { e._updated = now; e._device = DEVICE; changed = true; }
        if (typeof e._device !== 'string') { e._device = DEVICE; changed = true; }
      });
      return changed;
    }
    function canonical(m) {
      return JSON.stringify(Object.keys(m).sort().map(function (k) {
        var e = m[k], v = {};
        Object.keys(e).sort().forEach(function (p) { v[p] = e[p]; });
        return [k, v];
      }));
    }
    function mergeMarks(local, remote) {
      var merged = {}, keys = Object.keys(local).concat(Object.keys(remote));
      keys.forEach(function (k) {
        var a = local[k], b = remote[k];
        if (!a) merged[k] = b;
        else if (!b) merged[k] = a;
        else if ((a._updated || 0) > (b._updated || 0) ||
          ((a._updated || 0) === (b._updated || 0) && String(a._device || '') >= String(b._device || ''))) merged[k] = a;
        else merged[k] = b;
      });
      return merged;
    }
    function bytesToBase64Url(bytes) {
      var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function base64UrlToBytes(s) {
      s = s.replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      var raw = atob(s), bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return bytes;
    }
    function hexToBytes(hex) {
      var out = new Uint8Array(hex.length / 2);
      for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      return out;
    }
    var syncTimer = null, syncing = false, syncAgain = false;
    function cloudStatus(s, color) {
      var c = color || '#fcd34d', icon;
      if (s === 'Sincronizado') {
        icon = '<path d="M20 16.2A4.5 4.5 0 0 0 18 7.5h-1.2A6 6 0 1 0 5 16.5"/><path d="m9 13 2 2 4-4"/>';
      } else if (s === 'Sincronizando…') {
        icon = '<path d="M20 16.2A4.5 4.5 0 0 0 18 7.5h-1.2A6 6 0 1 0 5 16.5"/><path d="M12 10v4l2 1"/>';
      } else {
        icon = '<path d="M20 16.2A4.5 4.5 0 0 0 18 7.5h-1.2A6 6 0 1 0 5 16.5"/><path d="m9 10 6 6m0-6-6 6"/>';
      }
      cloud.title = s; cloud.dataset.detail = s; cloud.setAttribute('aria-label', s); cloud.style.color = c;
      cloud.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icon + '</svg>';
    }
    var syncKeyPromise = window.PONENTE_STORAGE_KEY && window.crypto && crypto.subtle ?
      crypto.subtle.importKey('raw', hexToBytes(window.PONENTE_STORAGE_KEY), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']) :
      Promise.reject(new Error('cifrado no disponible'));
    var syncUrl = '/sync/data?topic=' + encodeURIComponent(topic);
    function api(method, body) {
      var options = { method: method, cache: 'no-store', credentials: 'same-origin', headers: { 'Authorization': 'Bearer ' + window.PONENTE_SYNC_TOKEN } };
      if (body) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
      return fetch(syncUrl, options).then(function (r) {
        if (r.status === 409) return r.json().then(function (d) { d.conflict = true; return d; });
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      });
    }
    function encryptMarks(m) {
      return syncKeyPromise.then(function (key) {
        var iv = crypto.getRandomValues(new Uint8Array(12));
        var data = new TextEncoder().encode(JSON.stringify({ v: 1, path: location.pathname, marks: m }));
        return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data).then(function (encrypted) {
          return { v: 1, iv: bytesToBase64Url(iv), data: bytesToBase64Url(new Uint8Array(encrypted)) };
        });
      });
    }
    function decryptMarks(blob) {
      return syncKeyPromise.then(function (key) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlToBytes(blob.iv) }, key, base64UrlToBytes(blob.data));
      }).then(function (plain) {
        var data = JSON.parse(new TextDecoder().decode(plain));
        if (data.v !== 1 || data.path !== location.pathname || !data.marks || typeof data.marks !== 'object') throw new Error('datos inválidos');
        return data.marks;
      });
    }
    function syncNow() {
      if (syncing) { syncAgain = true; return; }
      syncing = true; syncAgain = false; cloudStatus('Sincronizando…');
      var tries = 0;
      function attempt() {
        if (++tries > 4) throw new Error('conflicto repetido');
        return api('GET').then(function (remoteState) {
          return (remoteState.blob ? decryptMarks(remoteState.blob) : Promise.resolve({})).then(function (remote) {
            var local = loadMarks();
            if (normalizeMarks(local)) saveMarks(local);
            var merged = mergeMarks(local, remote);
            if (canonical(merged) !== canonical(local)) {
              saveMarks(merged);
              if (Reveal.isReady()) update(); else Reveal.on('ready', update);
            }
            if (remoteState.blob && canonical(merged) === canonical(remote)) return remoteState;
            return encryptMarks(merged).then(function (blob) {
              return api('PUT', { revision: remoteState.revision, blob: blob }).then(function (saved) {
                return saved.conflict ? attempt() : saved;
              });
            });
          });
        });
      }
      syncKeyPromise.then(attempt).then(function () {
        cloudStatus('Sincronizado', '#86efac');
        if (syncAgain || canonical(loadMarks()) !== canonical(normalizedSnapshot)) scheduleSync();
      }).catch(function (e) {
        var detail = e && e.message === 'Failed to fetch' ?
          'No se pudo conectar con el servidor de sincronización' :
          'Error al sincronizar: ' + (e && e.message ? e.message : 'fallo desconocido');
        cloudStatus(navigator.onLine ? 'Pendiente · guardado en este iPad' : 'Sin conexión · guardado en este iPad', '#fcd34d');
        cloud.dataset.detail = detail;
      }).finally(function () { syncing = false; });
      var normalizedSnapshot = loadMarks(); normalizeMarks(normalizedSnapshot);
    }
    function scheduleSync() {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(syncNow, 700);
    }
    window.addEventListener('online', syncNow);
    window.addEventListener('focus', syncNow);
    window.addEventListener('ponente-annotations-updated', syncNow);
    setInterval(syncNow, 20000);
    syncNow();
    function hash(str) { var h = 5381; for (var k = 0; k < str.length; k++) h = (h * 33 + str.charCodeAt(k)) | 0; return String(h); }
    function slideKey() {
      var i = Reveal.getIndices(), key = i.h + '.' + (i.v || 0);
      return (window.PONENTE_NOTE_KEYS || {})[key] || key;
    }
    // Cada diapositiva guarda { hash, html } (subrayados, válidos mientras no cambie la nota)
    // y/o { extra, extraHtml } (texto propio y sus subrayados, independientes del original).
    function storeCurrent(root) {
      var orig = Reveal.getSlideNotes() || '', m = loadMarks(), k = slideKey(), e = m[k] || {};
      if (root === text) {
        if (text.querySelector('mark')) { e.hash = hash(orig); e.html = text.innerHTML; } else { delete e.hash; delete e.html; }
      } else if (root && root.textContent === e.extra) {
        if (root.querySelector('mark')) e.extraHtml = root.innerHTML; else delete e.extraHtml;
      }
      if (e.html || e.extra) { delete e.deleted; stamp(e); m[k] = e; }
      else { e = { deleted: true }; stamp(e); m[k] = e; }
      saveMarks(m); scheduleSync();
    }
    function setExtra(value, restoreHtml) {
      var m = loadMarks(), k = slideKey(), e = m[k] || {};
      if (value !== e.extra) delete e.extraHtml;
      if (value.trim()) e.extra = value; else delete e.extra;
      if (e.extra && restoreHtml) e.extraHtml = restoreHtml;
      if (!e.extra) delete e.extraHtml;
      if (e.html || e.extra) { delete e.deleted; stamp(e); m[k] = e; }
      else { e = { deleted: true }; stamp(e); m[k] = e; }
      saveMarks(m); scheduleSync();
    }
    function renderMine() {
      var entry = loadMarks()[slideKey()] || {}, extra = entry.extra || '';
      mine.innerHTML = '';
      if (extra) {
        var box = document.createElement('div'); box.className = 'box';
        box.innerHTML = '<div class="lbl">Mi nota</div>';
        var content = document.createElement('div'); content.className = 'content';
        if (typeof entry.extraHtml === 'string') content.innerHTML = clean(entry.extraHtml);
        if (!entry.extraHtml || content.textContent !== extra) content.textContent = extra;
        box.appendChild(content);
        mine.appendChild(box);
      }
      var edit = document.createElement('button');
      edit.className = extra ? '' : 'pri';
      edit.textContent = extra ? 'Editar mi nota' : '+ Añadir mi nota';
      edit.onclick = editMine;
      mine.appendChild(edit);
    }
    function editMine() {
      var entry = loadMarks()[slideKey()] || {}, before = entry.extra || '', beforeHtml = entry.extraHtml;
      mine.innerHTML = '<textarea placeholder="Escribe aquí tu nota para esta diapositiva…"></textarea>';
      var ta = mine.firstChild; ta.value = before;
      ta.oninput = function () { setExtra(ta.value); }; // se guarda mientras escribes
      var ok = document.createElement('button'); ok.className = 'pri'; ok.textContent = 'Hecho';
      ok.onclick = function () { setExtra(ta.value); renderMine(); };
      var cancel = document.createElement('button'); cancel.textContent = 'Cancelar';
      cancel.onclick = function () { setExtra(before, beforeHtml); renderMine(); };
      mine.appendChild(ok); mine.appendChild(cancel);
      if (before) {
        var del = document.createElement('button'); del.textContent = 'Borrar';
        del.onclick = function () { if (confirm('¿Borrar tu nota de esta diapositiva?')) { setExtra(''); renderMine(); } };
        mine.appendChild(del);
      }
      ta.focus();
      ta.scrollIntoView({ block: 'nearest' });
    }
    var savedRange = null;
    function selectionRoot(r) {
      var content = mine.querySelector('.content');
      if (text.contains(r.startContainer) && text.contains(r.endContainer)) return text;
      if (content && content.contains(r.startContainer) && content.contains(r.endContainer)) return content;
      return null;
    }
    document.addEventListener('selectionchange', function () {
      var sel = window.getSelection();
      if (sel.rangeCount && !sel.isCollapsed) {
        var r = sel.getRangeAt(0);
        savedRange = selectionRoot(r) ? r.cloneRange() : null;
      }
    });
    function highlight() {
      var r = savedRange; savedRange = null;
      var root = r && selectionRoot(r);
      if (!r || r.collapsed || !root) { status('Selecciona texto de la nota y pulsa el rotulador', '#a16207', true); return; }
      var group = Date.now().toString(36);
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [], n;
      while ((n = walker.nextNode())) if (r.intersectsNode(n) && n.nodeValue.trim()) nodes.push(n);
      nodes.forEach(function (node) {
        var start = node === r.startContainer ? r.startOffset : 0;
        var end = node === r.endContainer ? r.endOffset : node.nodeValue.length;
        if (end <= start || (node.parentNode && node.parentNode.nodeName === 'MARK')) return;
        if (end < node.nodeValue.length) node.splitText(end);
        if (start > 0) node = node.splitText(start);
        var mk = document.createElement('mark'); mk.dataset.g = group; node.parentNode.insertBefore(mk, node); mk.appendChild(node);
      });
      window.getSelection().removeAllRanges();
      storeCurrent(root);
    }
    scroll.addEventListener('click', function (e) {
      var mk = e.target.closest && e.target.closest('mark');
      if (!mk || !window.getSelection().isCollapsed) return;
      var content = mine.querySelector('.content');
      var root = text.contains(mk) ? text : content && content.contains(mk) ? content : null;
      if (!root) return;
      if (!confirm('¿Quitar este subrayado?')) return;
      // Un subrayado que cruza negritas se compone de varios <mark> del mismo grupo.
      var all = mk.dataset.g ? root.querySelectorAll('mark[data-g="' + mk.dataset.g + '"]') : [mk];
      Array.prototype.forEach.call(all, function (x) {
        while (x.firstChild) x.parentNode.insertBefore(x.firstChild, x);
        x.parentNode.removeChild(x);
      });
      root.normalize(); storeCurrent(root);
    });
    function exportMarks() {
      var m = loadMarks(), keys = Object.keys(m).filter(function (k) { return !m[k].deleted; }).sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
      if (!keys.length) { status('Aún no hay subrayados ni notas propias', '#a16207', true); return; }
      var title = document.title || 'Presentación', out = '# Notas del ponente · ' + title + '\n\n';
      keys.forEach(function (k) {
        var hv = k.split('.'), slide = Reveal.getSlide(+hv[0], +hv[1]);
        var h = slide && slide.querySelector('h1,h2,h3');
        out += '## ' + (+hv[0] + 1) + '. ' + (h ? h.textContent.trim() : 'Diapositiva') + '\n\n';
        if (m[k].extra) out += '**Mi nota:**\n\n' + m[k].extra.trim().replace(/\n/g, '  \n') + '\n\n';
        if (!m[k].html) return;
        var tmp = document.createElement('div'); tmp.innerHTML = clean(m[k].html);
        out += '**Subrayados:**\n\n';
        var marks = Array.prototype.slice.call(tmp.querySelectorAll('mark')), groups = [];
        marks.forEach(function (mk, idx) {
          var prev = marks[idx - 1], nxt = marks[idx + 1], g = mk.dataset.g;
          var first = !prev || !g || prev.dataset.g !== g, last = !nxt || !g || nxt.dataset.g !== g;
          if (first) groups.push(''); groups[groups.length - 1] += mk.textContent;
          var t = mk.textContent, lead = first ? t.match(/^\s*/)[0] : '', trail = last ? t.match(/\s*$/)[0] : '';
          mk.replaceWith(lead + (first ? '==' : '') + t.slice(lead.length, t.length - trail.length) + (last ? '==' : '') + trail);
        });
        groups.forEach(function (t) { out += '- ' + t.replace(/\s+/g, ' ').trim() + '\n'; });
        out += '\n> ' + tmp.innerText.trim().replace(/\n+/g, '\n> ') + '\n\n';
      });
      // Copia de datos para «Importar»: el mismo archivo sirve para leer y para restaurar.
      var exportData = {}; keys.forEach(function (k) { exportData[k] = m[k]; });
      out += '<!-- ponente-marks\n' + JSON.stringify({ v: 1, path: location.pathname, marks: exportData }) + '\nponente-marks -->\n';
      var name = 'notas-ponente-' + location.pathname.split('/').filter(Boolean).slice(-2).join('-') + '.md';
      var file = new File([out], name, { type: 'text/markdown' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: name }).catch(function () {});
      } else {
        var a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
      }
    }
    var hl = pn.querySelector('#pn-hl');
    // pointerdown + preventDefault: en iPad, tocar un botón no debe borrar la selección.
    hl.addEventListener('pointerdown', function (e) { e.preventDefault(); highlight(); });

    function importMarks(file) {
      file.text().then(function (txt) {
        var m = /<!-- ponente-marks\n([\s\S]*?)\nponente-marks -->/.exec(txt), data;
        try { data = JSON.parse(m ? m[1] : txt); } catch (e) { data = null; }
        if (!data || !data.marks) { alert('Este archivo no contiene notas ni subrayados exportados desde la Zona ponente.'); return; }
        if (data.path !== location.pathname &&
            !confirm('Estas notas son de otra presentación (' + data.path + '). ¿Importarlos aquí igualmente?')) return;
        var cur = loadMarks(), n = 0;
        Object.keys(data.marks).forEach(function (k) {
          var it = data.marks[k];
          if (!it || it.deleted || !/^\d+\.\d+$/.test(k)) return;
          var e = cur[k] || {}, ok = false;
          if (typeof it.html === 'string' && typeof it.hash === 'string') { e.html = it.html; e.hash = it.hash; ok = true; }
          if (typeof it.extra === 'string' && it.extra.trim()) {
            e.extra = it.extra.slice(0, 20000); delete e.extraHtml;
            if (typeof it.extraHtml === 'string') e.extraHtml = clean(it.extraHtml);
            ok = true;
          }
          if (ok) { delete e.deleted; stamp(e); cur[k] = e; n++; }
        });
        saveMarks(cur); scheduleSync(); update();
        status('Importadas notas y subrayados de ' + n + ' diapositiva' + (n === 1 ? '' : 's'), '#15803d', true);
      });
    }
    // Los subrayados importados vienen de un archivo: solo se admiten etiquetas de texto.
    var SAFE = /^(P|BR|STRONG|B|EM|I|U|MARK|UL|OL|LI|CODE|SPAN|A|SMALL)$/;
    function clean(html) {
      var tpl = document.createElement('template'); tpl.innerHTML = html;
      Array.prototype.slice.call(tpl.content.querySelectorAll('*')).forEach(function (el) {
        if (!SAFE.test(el.nodeName)) { el.remove(); return; }
        Array.prototype.slice.call(el.attributes).forEach(function (at) {
          var ok = at.name === 'data-g' || (at.name === 'href' && /^https?:/i.test(at.value));
          if (!ok) el.removeAttribute(at.name);
        });
      });
      return tpl.innerHTML;
    }

    function update() {
      savedRange = null;
      var orig = Reveal.getSlideNotes() || '', saved = loadMarks()[slideKey()];
      text.innerHTML = saved && saved.hash === hash(orig) ? clean(saved.html) : (orig || '<em style="color:#9ca3af">Sin notas en esta diapositiva.</em>');
      scroll.scrollTop = 0;
      renderMine();
      var i = Reveal.getIndices(), total = Reveal.getTotalSlides();
      pn.querySelector('#pn-count').textContent = (Reveal.getSlidePastCount() + 1) + ' / ' + total;
      var next = Reveal.getSlide(i.h + 1);
      var h = next && next.querySelector('h1,h2,h3');
      pn.querySelector('#pn-next').textContent = next ? 'Siguiente: ' + (h ? h.textContent : '…') : 'Última diapositiva';
    }
    pn.querySelector('#pn-prev').onclick = function () { if (window.PONENTE_HORIZONTAL_NAV) Reveal.left(); else Reveal.prev(); };
    pn.querySelector('#pn-nxt').onclick = function () { if (window.PONENTE_HORIZONTAL_NAV) Reveal.right(); else Reveal.next(); };
    pn.querySelector('#pn-minus').onclick = function () { setSize(size - 3); };
    pn.querySelector('#pn-plus').onclick = function () { setSize(size + 3); };
    // Pantalla completa: Safari de iPad solo admite la versión con prefijo webkit.
    var root = document.documentElement, full = pn.querySelector('#pn-full');
    var req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!req) full.style.display = 'none';
    // Modo fijo: una vez activada, solo se sale con el botón. iPadOS sale solo con
    // gestos (arrastrar hacia abajo) y no se puede impedir: si pasa, el siguiente toque
    // en cualquier sitio la recupera (un toque es el gesto que exige Safari).
    var wantFull = false;
    function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
    function enter() { try { var r = req.call(root); if (r && r.catch) r.catch(function () {}); } catch (e) {} }
    full.onclick = function (e) {
      e.stopPropagation();
      if (wantFull) { wantFull = false; if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
      else { wantFull = true; enter(); }
      full.classList.toggle('on', wantFull);
    };
    document.addEventListener('click', function () { if (wantFull && !isFull()) enter(); }, true);
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        if (wantFull && !isFull()) status('Toca la pantalla para volver a pantalla completa', '#0369a1', false);
        else if (isFull()) status('Pantalla completa · sal con el botón', '#0369a1', true);
        setTimeout(applySplit, 300);
      });
    });
    // Truco de iOS: si el panel de notas nunca está exactamente arriba o abajo del todo,
    // el arrastre no se propaga a la página y no dispara la salida.
    scroll.addEventListener('touchstart', function () {
      var max = scroll.scrollHeight - scroll.clientHeight;
      if (max <= 0) return;
      if (scroll.scrollTop <= 0) scroll.scrollTop = 1;
      else if (scroll.scrollTop >= max) scroll.scrollTop = max - 1;
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (wantFull && !scroll.contains(e.target) && !(e.target.closest && e.target.closest('textarea'))) e.preventDefault();
    }, { passive: false });
    setSize(size);
    Reveal.on('slidechanged', update);
    window.addEventListener('resize', function (e) {
      // Reveal.layout emite resize en .reveal y burbujea; solo reaccionar al viewport.
      if (e.target !== window) return;
      endSplit(); applySplit();
    });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', applySplit);
    if (Reveal.isReady()) { update(); applySplit(); } else Reveal.on('ready', function () { update(); applySplit(); });
  }

  if (mode === 'mando') {
    var current = null;
    function publish() {
      var i = Reveal.getIndices();
      current = JSON.stringify({ h: i.h, v: i.v || 0, f: i.f === undefined ? -1 : i.f, t: Date.now() });
      if (ch.send(current)) status('Mando · enviado ' + (i.h + 1), '#15803d', true);
    }
    var ch = channel(
      function () { status('Mando conectado', '#15803d', true); if (current) publish(); },
      function (msg) {
        try { if (JSON.parse(msg).type === 'annotations-updated') window.dispatchEvent(new Event('ponente-annotations-updated')); } catch (e) {}
      },
      function () { status('Mando · sin conexión, reconectando…', '#b91c1c', false); }
    );
    notesPanel();
    ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden'].forEach(function (ev) { Reveal.on(ev, publish); });
    if (Reveal.isReady()) publish();
    return;
  }

  // Pantalla: sigue al mando.
  function go(msg) {
    try {
      var d = JSON.parse(msg);
      if (d.type === 'annotations-updated') { window.dispatchEvent(new Event('ponente-annotations-updated')); return; }
      if (Date.now() - d.t > 6 * 3600 * 1000) return; // ignora posiciones de otra sesión
      Reveal.slide(d.h, d.v, d.f < 0 ? undefined : d.f);
      status('Siguiendo al mando', '#15803d', true);
    } catch (e) { /* mensaje ajeno */ }
  }
  function start() {
    channel(
      function () { status('Pantalla conectada', '#15803d', true); },
      go,
      function () { status('Pantalla · reconectando…', '#b45309', false); }
    );
  }
  if (Reveal.isReady()) start(); else Reveal.on('ready', start);
})();
