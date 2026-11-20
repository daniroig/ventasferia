(function () {
  'use strict';

  var L = window.Libros;
  var KEY = 'libros.v1';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Almacenamiento ---------- */
  function load() {
    try {
      var r = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(r) ? r : [];
    } catch (e) { return []; }
  }
  var records = load();
  var lastId = null;
  var selectedId = null; // fila seleccionada en la lista: solo esa se puede editar

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(records)); return true; }
    catch (e) { toast('No se pudo guardar. Revisa el espacio del navegador.'); return false; }
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  /* ---------- Avisos ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // Pitido al leer un ISBN. Chrome mantiene el audio bloqueado hasta que el usuario toca la pantalla,
  // así que se desbloquea con el primer toque y se vuelve a intentar antes de cada pitido.
  var audioCtx;
  function getAudio() {
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    return audioCtx;
  }
  function unlockAudio() {
    var c = getAudio();
    if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} }
  }
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(function (ev) {
    document.addEventListener(ev, unlockAudio, { passive: true });
  });

  function beep() {
    var c = getAudio();
    function play() {
      try {
        var t = c.currentTime;
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = 1000;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(c.destination);
        o.start(t); o.stop(t + 0.24);
      } catch (e) {}
    }
    if (c) {
      if (c.state === 'suspended') { try { c.resume().then(play, function () {}); } catch (e) {} }
      else play();
    }
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
  }

  /* ---------- Registros ---------- */
  function addRecord(fields, silent) {
    var rec = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      isbn: fields.isbn || null,
      code: fields.code || null,
      price: fields.price == null ? null : fields.price,
      kind: fields.kind === 'T' ? 'T' : 'E', // E = Efectivo, T = Tarjeta
      exportedAt: null, // fecha y hora de exportación (vacío = aún no exportado)
      ts: Date.now()
    };
    var previous = records.filter(function (r) {
      return fields.isbn ? r.isbn === fields.isbn : r.code === fields.code;
    }).length;
    records.push(rec);
    if (!save()) { records.pop(); return null; }
    lastId = rec.id;
    renderLast(previous);
    renderList();
    if (!silent) beep();
    return rec;
  }

  function applySelection() {
    var items = $('list').children;
    for (var i = 0; i < items.length; i++) {
      var li = items[i], on = li.dataset.id === selectedId;
      li.classList.toggle('sel', on);
      li._ctl.forEach(function (c) { c.disabled = !on; });
    }
  }

  function selectRow(id) {
    if (selectedId === id) return;
    selectedId = id;
    applySelection();
  }

  function findRec(id) {
    for (var i = 0; i < records.length; i++) if (records[i].id === id) return records[i];
    return null;
  }

  function removeRec(id) {
    records = records.filter(function (r) { return r.id !== id; });
    save();
    if (lastId === id) lastId = null;
    if (selectedId === id) selectedId = null;
    renderLast(0);
    renderList();
  }

  function renderLast(previous) {
    var box = $('last');
    var rec = lastId ? findRec(lastId) : null;
    box.hidden = !rec;
    if (!rec) return;
    $('lastKind').textContent = rec.isbn ? 'Último registro · ISBN' : 'Último registro · Código';
    $('lastVal').textContent = rec.isbn || rec.code;
    $('lastMeta').textContent = L.fmtDate(rec.ts) + ' · ' + L.fmtTime(rec.ts);
    $('lastNote').textContent = previous > 0
      ? 'Guardado. Ya lo habías registrado ' + previous + (previous === 1 ? ' vez' : ' veces') + ' antes.'
      : 'Guardado.';
    $('lastPriceText').textContent = lastSummary(rec);
  }

  function renderList() {
    var ul = $('list');
    ul.textContent = '';
    var sorted = records.slice().reverse();
    sorted.forEach(function (r) {
      var li = document.createElement('li');

      var main = document.createElement('div');
      main.className = 'main';
      if (!r.isbn) {
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'CÓD.';
        main.appendChild(tag);
      }
      main.appendChild(document.createTextNode(r.isbn || r.code));
      var meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = L.fmtDate(r.ts) + ' · ' + L.fmtTime(r.ts);
      var info = document.createElement('div');
      info.className = 'info';
      info.appendChild(main);
      info.appendChild(meta);
      li.appendChild(info);

      // Precio editable en la propia fila.
      var price = document.createElement('input');
      price.type = 'text';
      price.className = 'price-in';
      price.placeholder = 'Precio';
      price.setAttribute('inputmode', 'decimal');
      price.setAttribute('autocomplete', 'off');
      price.setAttribute('aria-label', 'Precio de ' + (r.isbn || r.code));
      price.value = L.fmtPrice(r.price);
      price.addEventListener('focus', function () { setTimeout(function () { price.select(); }, 0); });
      price.addEventListener('input', function () {
        var p = liveParse(price.value);
        if (!p) { price.classList.add('bad'); return; }
        price.classList.remove('bad');
        setPrice(r, p.value);
      });
      price.addEventListener('blur', function () {
        price.classList.remove('bad');
        price.value = L.fmtPrice(r.price);
      });
      li.appendChild(price);

      // Interruptor E / T editable en la propia fila (registros antiguos sin valor: "–").
      var kb = document.createElement('button');
      kb.type = 'button';
      kb.className = 'btn kind-in';
      paintKind(kb, r.kind);
      kb.addEventListener('click', function () {
        setKind(r, r.kind === 'E' ? 'T' : 'E');
        paintKind(kb, r.kind);
      });
      li.appendChild(kb);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn danger small del';
      del.textContent = 'Borrar';
      var armed = false, timer;
      del.addEventListener('click', function () {
        if (!armed) {
          armed = true; del.textContent = '¿Seguro?';
          timer = setTimeout(function () { armed = false; del.textContent = 'Borrar'; }, 3000);
        } else {
          clearTimeout(timer); removeRec(r.id); toast('Registro borrado.');
        }
      });

      li.appendChild(del);

      // Hay que seleccionar la fila antes de cambiar precio, E/T o borrar (evita cambios accidentales).
      li.dataset.id = r.id;
      li.tabIndex = 0;
      li._ctl = [price, kb, del];
      li.addEventListener('click', function () { selectRow(r.id); });
      li.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === li) { e.preventDefault(); selectRow(r.id); }
      });
      ul.appendChild(li);
    });
    applySelection();
    $('emptyMsg').hidden = records.length > 0;
    $('btnClear').hidden = records.length === 0;
    renderTotals();
  }

  /* ---------- Precio del último registro ---------- */
  // Acepta también un separador final mientras se escribe ("12,").
  function liveParse(text) {
    var p = L.parsePrice(String(text).replace(/[.,]$/, ''));
    return p.ok ? p : null;
  }

  function priceText(p) {
    return p == null ? 'Sin precio' : L.fmtPrice(p) + ' €';
  }

  var KIND_NAME = { E: 'Efectivo', T: 'Tarjeta' };

  function money(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }

  // Totales por forma de pago (en céntimos para evitar errores de redondeo) y estado de exportación.
  function renderTotals() {
    var e = 0, t = 0, untyped = 0, pending = 0;
    records.forEach(function (r) {
      if (!r.exportedAt) pending++;
      if (r.price == null) return;
      var c = Math.round(r.price * 100);
      if (r.kind === 'E') e += c; else if (r.kind === 'T') t += c; else untyped++;
    });
    $('sumCount').textContent = records.length;
    $('sumE').textContent = money(e);
    $('sumT').textContent = money(t);
    $('sumTotal').textContent = money(e + t);
    var note = $('sumNote');
    note.hidden = untyped === 0;
    note.textContent = untyped + (untyped === 1 ? ' registro con precio y sin tipo E/T no entra' : ' registros con precio y sin tipo E/T no entran') + ' en los totales.';
    $('pendingNote').textContent = records.length === 0 ? ''
      : pending === 0 ? 'Todos los registros están exportados.'
      : pending + (pending === 1 ? ' registro pendiente' : ' registros pendientes') + ' de exportar.';
    $('btnNew').disabled = pending === 0;
    $('btnFull').disabled = records.length === 0;
  }

  function lastSummary(rec) {
    return priceText(rec.price) + (KIND_NAME[rec.kind] ? ' · ' + rec.kind : '');
  }

  // Pinta un botón E/T: letra y color según el valor.
  function paintKind(btn, k) {
    btn.textContent = KIND_NAME[k] ? k : '–';
    btn.dataset.k = KIND_NAME[k] ? k : '';
    btn.setAttribute('aria-label', 'Forma de pago: ' + (KIND_NAME[k] || 'sin indicar') + '. Toca para cambiar');
  }

  // Guarda el precio editado en la lista y actualiza "Último registro" si es el mismo.
  function setPrice(rec, value) {
    rec.price = value;
    save();
    if (lastId === rec.id) $('lastPriceText').textContent = lastSummary(rec);
    renderTotals();
  }

  function setKind(rec, k) {
    rec.kind = k;
    save();
    if (lastId === rec.id) $('lastPriceText').textContent = lastSummary(rec);
    renderTotals();
  }

  var delArmed = false, delTimer;
  $('lastDelete').addEventListener('click', function () {
    var btn = $('lastDelete');
    if (!delArmed) {
      delArmed = true; btn.textContent = '¿Seguro?';
      delTimer = setTimeout(function () { delArmed = false; btn.textContent = 'Eliminar'; }, 3000);
    } else {
      clearTimeout(delTimer); delArmed = false; btn.textContent = 'Eliminar';
      if (lastId) removeRec(lastId);
      toast('Registro eliminado.');
    }
  });

  /* ---------- Cámara ---------- */
  var video = $('video');
  var stream = null, starting = false, scanning = false, lastVal = '', lastValT = 0, fallbackTimer = null;

  /* Campo único "ISBN / Código".
     - Por defecto (al abrir la app y tras cada registro) está en modo escáner: solo lo rellena la cámara.
     - Si lo tocas pasa a modo manual: se vacía y admite un código de 6 dígitos.
     - Si en modo manual lo dejas vacío y sales del campo, vuelve al modo escáner.
     Nada se guarda hasta pulsar "Añadir". */
  var field = $('isbnField');
  var manual = false;
  var payKind = 'E'; // E = Efectivo, T = Tarjeta; vuelve a E en cada registro nuevo

  function setScanMode() {
    manual = false;
    field.readOnly = true;
    field.maxLength = 13;
    field.placeholder = 'Escanea o toca para código';
  }

  function enterManual() {
    manual = true;
    field.value = '';
    field.readOnly = false;
    field.maxLength = 6;
    field.placeholder = 'Código de 6 dígitos';
    refreshEntry();
    field.focus();
  }

  function handleScan(raw) {
    if (manual || field.value) return;
    if (!L.isBookISBN(raw)) return;
    var now = Date.now();
    if (raw === lastVal && now - lastValT < 4000) return;
    lastVal = raw; lastValT = now;
    field.value = raw;
    refreshEntry();
    beep();
    var cam = $('cam');
    cam.classList.add('hit');
    setTimeout(function () { cam.classList.remove('hit'); }, 500);
  }

  // Activa o desactiva "Añadir" y avisa si el ISBN o código ya estaba registrado.
  function refreshEntry() {
    var v = field.value;
    $('btnAdd').disabled = v === '';
    $('isbnErr').textContent = '';
    var previous = (L.isBookISBN(v) || /^\d{6}$/.test(v))
      ? records.filter(function (r) { return r.isbn === v || r.code === v; }).length
      : 0;
    $('isbnNote').textContent = previous > 0
      ? 'Ya lo habías registrado ' + previous + (previous === 1 ? ' vez.' : ' veces.')
      : '';
    if (v === '') lastValT = Date.now(); // evita que el mismo código vuelva a aparecer al instante
  }

  function paintPayKind() {
    var b = $('kindBtn');
    b.textContent = payKind + ' · ' + KIND_NAME[payKind];
    b.dataset.k = payKind;
    b.setAttribute('aria-label', 'Forma de pago: ' + KIND_NAME[payKind] + '. Toca para cambiar');
  }

  field.addEventListener('click', function () { if (!manual) enterManual(); });
  field.addEventListener('input', function () {
    field.value = field.value.replace(/\D/g, '').slice(0, manual ? 6 : 13);
    refreshEntry();
  });
  field.addEventListener('blur', function () {
    if (manual && field.value === '') { setScanMode(); refreshEntry(); }
  });
  $('isbnPrice').addEventListener('input', function () { $('isbnErr').textContent = ''; });
  $('kindBtn').addEventListener('click', function () {
    payKind = payKind === 'E' ? 'T' : 'E';
    paintPayKind();
  });

  $('isbnCard').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = field.value;
    if (!v) return;
    var fields;
    if (manual) {
      if (!/^\d{6}$/.test(v)) { $('isbnErr').textContent = 'El código debe tener exactamente 6 dígitos.'; return; }
      fields = { code: v };
    } else {
      if (!L.isBookISBN(v)) { $('isbnErr').textContent = 'ISBN no válido. Vuelve a escanearlo.'; return; }
      fields = { isbn: v };
    }
    var p = liveParse($('isbnPrice').value);
    if (!p) { $('isbnErr').textContent = 'Precio no válido. Ejemplo: 12,50'; return; }
    fields.price = p.value;
    fields.kind = payKind;
    if (addRecord(fields, true)) {
      field.value = '';
      $('isbnPrice').value = '';   // el precio vuelve a vacío (opcional)
      payKind = 'E';               // el pago vuelve a Efectivo
      paintPayKind();
      setScanMode();               // vuelve a escanear
      refreshEntry();
      toast('Libro añadido.');
    }
  });

  setScanMode();
  paintPayKind();

  function camMessage(msg) { $('camMsg').textContent = msg; }

  // Un único botón: activa o apaga la cámara.
  function showCamOn(on) {
    $('camEmpty').hidden = on;
    $('guide').hidden = !on;
    var b = $('btnCam');
    b.textContent = on ? 'Apagar cámara' : 'Activar cámara';
    b.classList.toggle('primary', !on);
  }

  async function startCamera() {
    if (stream || starting) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      camMessage('Este navegador no permite usar la cámara. Abre la app desde Chrome con una dirección https.');
      return;
    }
    starting = true;
    try { beepPrime(); } catch (e) {}
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
    } catch (e) {
      stream = null;
      starting = false;
      camMessage(e && e.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Actívalo en los ajustes del sitio en Chrome.'
        : 'No se pudo abrir la cámara.');
      return;
    }
    starting = false;
    video.srcObject = stream;
    try { await video.play(); } catch (e) {}
    try {
      var track = stream.getVideoTracks()[0];
      var caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      }
    } catch (e) {}
    showCamOn(true);
    scanning = true;
    if ('BarcodeDetector' in window) startNative(); else startFallback();
  }

  function beepPrime() { unlockAudio(); }

  function startNative() {
    var detector;
    try { detector = new BarcodeDetector({ formats: ['ean_13'] }); }
    catch (e) { startFallback(); return; }
    var lastRun = 0, busy = false;
    function tick() {
      if (!scanning) return;
      var now = performance.now();
      if (!busy && video.readyState >= 2 && now - lastRun > 120) {
        lastRun = now; busy = true;
        detector.detect(video).then(function (codes) {
          codes.forEach(function (c) { handleScan(c.rawValue); });
        }).catch(function () {}).then(function () { busy = false; });
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = fail;
      document.head.appendChild(s);
    });
  }

  // Solo se usa si el navegador no trae BarcodeDetector (Chrome en Android sí lo trae).
  async function startFallback() {
    try {
      if (!window.ZXing) await loadScript('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js');
    } catch (e) {
      camMessage('Este navegador no puede leer códigos y no hay conexión para cargar el lector. Usa Chrome.');
      stopCamera();
      return;
    }
    var hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    var reader = new ZXing.MultiFormatReader();
    reader.setHints(hints);
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    fallbackTimer = setInterval(function () {
      if (!scanning || video.readyState < 2) return;
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      try {
        var src = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
        var bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(src));
        handleScan(reader.decode(bmp).getText());
      } catch (e) { /* sin código en este fotograma */ }
    }, 250);
  }

  function stopCamera() {
    scanning = false;
    clearInterval(fallbackTimer); fallbackTimer = null;
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    video.srcObject = null;
    showCamOn(false);
    camMessage('Apunta al código de barras del libro (empieza por 978 o 979).');
  }

  $('btnCam').addEventListener('click', function () {
    if (stream) stopCamera(); else startCamera();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopCamera(); });

  /* ---------- Pestañas ---------- */
  function showView(name) {
    $('view-entry').hidden = name !== 'entry';
    $('view-list').hidden = name !== 'list';
    document.querySelectorAll('nav.tabs button').forEach(function (b) {
      if (b.dataset.view === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (name !== 'entry') stopCamera();
    if (name !== 'list') { selectedId = null; applySelection(); }
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('nav.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { showView(b.dataset.view); });
  });

  // Tocar fuera de una fila de la lista quita la selección.
  $('view-list').addEventListener('click', function (e) {
    if (!e.target.closest('li')) { selectedId = null; applySelection(); }
  });

  /* ---------- Exportar ---------- */
  function stamp() {
    var n = Date.now();
    var d = new Date(n);
    var p = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }

  function download(name, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    toast('Archivo ' + name + ' guardado en Descargas.');
  }

  function downloadXlsx(name, list) {
    try {
      download(name, new Blob([L.toXLSX(list)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }));
      return true;
    } catch (e) {
      toast('No se pudo generar el Excel.');
      return false;
    }
  }

  // Export Nuevos: solo los registros sin Fecha_Hora_Export. Todos reciben el mismo instante.
  $('btnNew').addEventListener('click', function () {
    var pend = records.filter(function (r) { return !r.exportedAt; });
    if (!pend.length) { toast('No hay registros nuevos.'); return; }
    var when = Date.now();
    var copy = pend.map(function (r) { return Object.assign({}, r, { exportedAt: when }); });
    if (!downloadXlsx('libros_nuevos_' + stamp() + '.xlsx', copy)) return;
    pend.forEach(function (r) { r.exportedAt = when; });
    save();
    renderList();
  });

  // Export Completo: todos los registros con todos los campos; no cambia su estado de exportación.
  $('btnFull').addEventListener('click', function () {
    if (!records.length) return;
    downloadXlsx('libros_completo_' + stamp() + '.xlsx', records);
  });

  // Borrar todo: dos pulsaciones y después un diálogo Sí / No (No es la opción por defecto).
  var clearArmed = false, clearTimer;
  var dlg = $('confirmClear');
  $('btnClear').addEventListener('click', function () {
    var b = $('btnClear');
    if (!clearArmed) {
      clearArmed = true; b.textContent = 'Pulsa otra vez para borrar TODO';
      clearTimer = setTimeout(function () { clearArmed = false; b.textContent = 'Borrar todos los registros'; }, 4000);
    } else {
      clearTimeout(clearTimer); clearArmed = false; b.textContent = 'Borrar todos los registros';
      $('cText').textContent = 'Se borrarán ' + records.length + (records.length === 1 ? ' registro' : ' registros') +
        '. Esta acción no se puede deshacer.';
      dlg.showModal();
      $('clearNo').focus();
    }
  });
  $('clearNo').addEventListener('click', function () { dlg.close(); });
  $('clearYes').addEventListener('click', function () {
    dlg.close();
    records = []; lastId = null; selectedId = null; save(); renderLast(0); renderList();
    toast('Todos los registros borrados.');
  });

  /* ---------- Inicio ---------- */
  renderList();
  renderLast(0);

  // Si ya diste permiso de cámara antes, se activa sola.
  try {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'camera' }).then(function (s) {
        if (s.state === 'granted') startCamera();
      }).catch(function () {});
    }
  } catch (e) {}

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
