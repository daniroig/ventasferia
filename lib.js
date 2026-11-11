/* Funciones puras: validación ISBN, formato, CSV y XLSX (sin dependencias). */
(function (root) {
  'use strict';

  function validEAN13(s) {
    if (!/^\d{13}$/.test(s)) return false;
    var sum = 0;
    for (var i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === Number(s[12]);
  }

  // Un ISBN-13 es un EAN-13 que empieza por 978 o 979.
  function isBookISBN(s) {
    return validEAN13(s) && /^97[89]/.test(s);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function fmtDate(ts) {
    var d = new Date(ts);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function fmtPrice(p) {
    return p == null ? '' : p.toFixed(2).replace('.', ',');
  }

  // Acepta "12", "12,5", "12.50". Vacío = sin precio.
  function parsePrice(str) {
    var t = String(str == null ? '' : str).trim().replace(',', '.');
    if (t === '') return { ok: true, value: null };
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return { ok: false, value: null };
    return { ok: true, value: parseFloat(t) };
  }

  var HEADERS = ['ISBN', 'Código', 'Precio', 'Fecha', 'Hora'];

  // CSV con ; y BOM para que Excel en español lo abra bien.
  // ISBN y código van como ="..." para que Excel no los convierta en número
  // (perdería los ceros iniciales del código y pondría el ISBN en notación científica).
  function toCSV(records) {
    function textCell(v) { return v ? '="' + v + '"' : ''; }
    var lines = [HEADERS.join(';')];
    records.forEach(function (r) {
      lines.push([
        textCell(r.isbn),
        textCell(r.code),
        fmtPrice(r.price),
        fmtDate(r.ts),
        fmtTime(r.ts)
      ].join(';'));
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  /* ---------- XLSX mínimo (zip sin compresión) ---------- */

  var crcTable = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function u16(n) { return [n & 255, (n >>> 8) & 255]; }
  function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }

  function zipStore(files) {
    var enc = new TextEncoder();
    var parts = [];
    var central = [];
    var offset = 0;

    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var data = f.data;
      var crc = crc32(data);
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(33),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)
      );
      parts.push(new Uint8Array(local), name, data);
      central.push({ name: name, crc: crc, size: data.length, offset: offset });
      offset += local.length + name.length + data.length;
    });

    var cdStart = offset;
    var cdSize = 0;
    central.forEach(function (c) {
      var hdr = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(33),
        u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length),
        u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset)
      );
      parts.push(new Uint8Array(hdr), c.name);
      cdSize += hdr.length + c.name.length;
    });

    parts.push(new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
      u32(cdSize), u32(cdStart), u16(0)
    )));

    var total = parts.reduce(function (s, p) { return s + p.length; }, 0);
    var out = new Uint8Array(total);
    var pos = 0;
    parts.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function toXLSX(records) {
    var enc = new TextEncoder();
    var cols = ['A', 'B', 'C', 'D', 'E'];

    function strCell(ref, v, style) {
      if (v == null || v === '') return '';
      return '<c r="' + ref + '" t="inlineStr"' + (style ? ' s="' + style + '"' : '') +
        '><is><t>' + esc(v) + '</t></is></c>';
    }

    var rows = [];
    rows.push('<row r="1">' + HEADERS.map(function (h, i) {
      return strCell(cols[i] + '1', h, 1);
    }).join('') + '</row>');

    records.forEach(function (r, idx) {
      var n = idx + 2;
      var price = r.price == null ? '' : '<c r="C' + n + '" s="2"><v>' + r.price + '</v></c>';
      rows.push('<row r="' + n + '">' +
        strCell('A' + n, r.isbn) +
        strCell('B' + n, r.code) +
        price +
        strCell('D' + n, fmtDate(r.ts)) +
        strCell('E' + n, fmtTime(r.ts)) +
        '</row>');
    });

    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="2" width="10" customWidth="1"/>' +
      '<col min="3" max="3" width="10" customWidth="1"/><col min="4" max="4" width="12" customWidth="1"/>' +
      '<col min="5" max="5" width="10" customWidth="1"/></cols>' +
      '<sheetData>' + rows.join('') + '</sheetData></worksheet>';

    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';

    var files = [
      { name: '[Content_Types].xml', data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>') },
      { name: '_rels/.rels', data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>') },
      { name: 'xl/workbook.xml', data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Libros" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>') },
      { name: 'xl/styles.xml', data: enc.encode(styles) },
      { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) }
    ];

    return zipStore(files);
  }

  root.Libros = {
    validEAN13: validEAN13,
    isBookISBN: isBookISBN,
    fmtDate: fmtDate,
    fmtTime: fmtTime,
    fmtPrice: fmtPrice,
    parsePrice: parsePrice,
    toCSV: toCSV,
    toXLSX: toXLSX
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Libros;
})(typeof window !== 'undefined' ? window : globalThis);
