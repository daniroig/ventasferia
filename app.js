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

  var audioCtx;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; g.gain.value = 0.12;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.12);
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
  }

  /* ---------- Registros ---------- */
  function addRecord(fields, silent) {
    var rec = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      isbn: fields.isbn || null,
      code: fields.code || null,
      price: fields.price == null ? null : fields.price,
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

  function findRec(id) {
    for (var i = 0; i < records.length; i++) if (records[i].id === id) return records[i];
    return null;
  }

  function removeRec(id) {
    records = records.filter(function (r) { return r.id !== id; });
    save();
    if (lastId === id) lastId = null;
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
    $('lastPriceText').textContent = priceText(rec.price);
  }

  function renderList() {
    $('count').textContent = records.length;
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

      // Tocar cualquier parte de la fila lleva al campo del precio.
      li.addEventListener('click', function (e) {
        if (e.target === price || e.target === del) return;
        price.focus();
      });
      ul.appendChild(li);
    });
    $('emptyMsg').hidden = records.length > 0;
    $('btnClear').hidden = records.length === 0;
    $('btnXlsx').disabled = $('btnCsv').disabled = records.length === 0;
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

  // Guarda el precio editado en la lista y actualiza "Último registro" si es el mismo.
  function setPrice(rec, value) {
    rec.price = value;
    save();
    if (lastId === rec.id) $('lastPriceText').textContent = priceText(value);
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

  /* ---------- Código manual ---------- */
  $('code').addEventListener('input', function (e) {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    $('manualErr').textContent = '';
  });
  $('codePrice').addEventListener('input', function () { $('manualErr').textContent = ''; });
  $('manualForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('code').value;
    if (!/^\d{6}$/.test(v)) { $('manualErr').textContent = 'El código debe tener exactamente 6 dígitos.'; return; }
    var p = liveParse($('codePrice').value);
    if (!p) { $('manualErr').textContent = 'Precio no válido. Ejemplo: 12,50'; return; }
    if (addRecord({ code: v, price: p.value })) {
      $('code').value = '';
      $('codePrice').value = ''; // el precio vuelve a vacío (opcional) en cada entrada
    }
  });

  /* ---------- Cámara ---------- */
  var video = $('video');
  var stream = null, starting = false, scanning = false, lastVal = '', lastValT = 0, fallbackTimer = null;

  // El ISBN leído se escribe en el campo y solo se guarda al pulsar "Añadir".
  // Mientras el campo tenga algo, la cámara no lee otro. Para descartarlo basta con
  // borrarlo con la tecla de retroceso.
  var isbnField = $('isbnField');

  function handleScan(raw) {
    if (isbnField.value) return;
    if (!L.isBookISBN(raw)) return;
    var now = Date.now();
    if (raw === lastVal && now - lastValT < 4000) return;
    lastVal = raw; lastValT = now;
    isbnField.value = raw;
    refreshIsbn();
    beep();
    var cam = $('cam');
    cam.classList.add('hit');
    setTimeout(function () { cam.classList.remove('hit'); }, 500);
  }

  // Activa o desactiva "Añadir" y avisa si el ISBN ya estaba registrado.
  function refreshIsbn() {
    var v = isbnField.value;
    $('btnAdd').disabled = v === '';
    $('isbnErr').textContent = '';
    var previous = L.isBookISBN(v)
      ? records.filter(function (r) { return r.isbn === v; }).length
      : 0;
    $('isbnNote').textContent = previous > 0
      ? 'Ya lo habías registrado ' + previous + (previous === 1 ? ' vez.' : ' veces.')
      : '';
    if (v === '') lastValT = Date.now(); // evita que el mismo código vuelva a aparecer al instante
  }

  isbnField.addEventListener('input', function () {
    isbnField.value = isbnField.value.replace(/\D/g, '').slice(0, 13);
    refreshIsbn();
  });
  $('isbnPrice').addEventListener('input', function () { $('isbnErr').textContent = ''; });

  $('isbnCard').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = isbnField.value;
    if (!v) return;
    if (!L.isBookISBN(v)) {
      $('isbnErr').textContent = 'ISBN no válido: 13 dígitos que empiecen por 978 o 979.';
      return;
    }
    var p = liveParse($('isbnPrice').value);
    if (!p) { $('isbnErr').textContent = 'Precio no válido. Ejemplo: 12,50'; return; }
    if (addRecord({ isbn: v, price: p.value }, true)) {
      isbnField.value = '';
      $('isbnPrice').value = ''; // el precio vuelve a vacío (opcional) en cada entrada
      refreshIsbn();
      toast('Libro añadido.');
    }
  });

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

  function beepPrime() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

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
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('nav.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { showView(b.dataset.view); });
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

  $('btnXlsx').addEventListener('click', function () {
    if (!records.length) return;
    var bytes = L.toXLSX(records);
    download('libros_' + stamp() + '.xlsx', new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }));
  });
  $('btnCsv').addEventListener('click', function () {
    if (!records.length) return;
    download('libros_' + stamp() + '.csv', new Blob([L.toCSV(records)], { type: 'text/csv;charset=utf-8' }));
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
    records = []; lastId = null; save(); renderLast(0); renderList();
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
