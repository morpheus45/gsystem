/****************************************************************************
 * G-SYSTEMS — Remplissage du .xlsm côté serveur (préserve les macros VBA)
 * --------------------------------------------------------------------------
 * Port de excel/ExcelFiller.kt (app native) en manipulation OOXML pure :
 *   dézip du .xlsm → édition des XML de feuille → rezip.
 * Le fichier vbaProject.bin (macros) n'est PAS touché → macros conservées.
 *
 * Conventions (identiques au natif) :
 *   - 1 feuille par semaine ISO : "S.1" … "S.53"
 *   - Blocs jour repérés en colonne A (LUNDI…SAMEDI), ligne TOTAL en bas
 *   - Colonnes : B=département · C=mission (TYPE NOM VILLE NUM) · E=heures
 *     (1re ligne du jour) · H=observations
 *
 * ⚠ v1 : écrit les valeurs dans les lignes EXISTANTES du bloc. Si un jour a
 *   plus d'interventions que la place dispo, le surplus est signalé (l'insertion
 *   de lignes du natif sera ajoutée après validation sur le vrai fichier).
 *
 * IMPORTANT : le remplissage se fait sur une COPIE. Le modèle d'origine du tech
 *   (Files/excel_template) n'est jamais modifié.
 ****************************************************************************/

var XL_DAYS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];

/* ---------- API : remplit le modèle d'un tech pour une période ---------- */
function fillTemplateForUser(userId, periodStartIso, periodEndIso) {
  var tpl = readAll("Files").filter(function (f) {
    return f.userId === userId && f.kind === "excel_template";
  })[0];
  if (!tpl) return { ok: false, reason: "no_template" };

  var entries = readData("Temps", userId).filter(function (e) {
    return (!periodStartIso || e.date >= periodStartIso) && (!periodEndIso || e.date <= periodEndIso);
  });
  if (!entries.length) return { ok: false, reason: "no_entries" };

  var blob = DriveApp.getFileById(tpl.fileId).getBlob();
  var result = xlFill(blob, entries);

  return { ok: true, blob: result.blob, report: result.report, sourceName: tpl.filename };
}

/* ---------- Cœur : remplit un blob .xlsm et renvoie un nouveau blob ---------- */
function xlFill(xlsmBlob, entries) {
  xlsmBlob.setContentType("application/zip");
  var parts = Utilities.unzip(xlsmBlob);            // array de Blobs (name = chemin)
  var byName = {};
  parts.forEach(function (p) { byName[p.getName()] = p; });

  var shared = xlSharedStrings(byName);
  var sheetPath = xlSheetPaths(byName);             // { "S.12": "xl/worksheets/sheet3.xml", ... }

  // grouper par semaine ISO puis par jour
  var byWeek = {};
  entries.forEach(function (e) {
    var d = xlParseDate(e.date);
    var wk = "S." + xlIsoWeek(d);
    (byWeek[wk] = byWeek[wk] || []).push(e);
  });

  var report = { weeks: 0, written: 0, overflow: [], missingSheets: [] };

  Object.keys(byWeek).forEach(function (wk) {
    var path = sheetPath[wk];
    if (!path || !byName[path]) { report.missingSheets.push(wk); return; }
    var xml = byName[path].getDataAsString("UTF-8");
    var res = xlFillSheet(xml, shared, byWeek[wk]);
    byName[path] = Utilities.newBlob(res.xml, "application/xml", path.replace(/.*\//, ""));
    // Utilities.zip a besoin du chemin complet : on re-set le nom complet
    byName[path].setName(path);
    report.weeks++;
    report.written += res.written;
    res.overflow.forEach(function (o) { report.overflow.push(wk + " " + o); });
  });

  // rezip dans l'ordre d'origine
  var rebuilt = parts.map(function (p) { return byName[p.getName()]; });
  var zipped = Utilities.zip(rebuilt);
  zipped.setContentType("application/vnd.ms-excel.sheet.macroEnabled.12");
  return { blob: zipped, report: report };
}

/* ---------- Remplit une feuille (XML) pour une semaine ---------- */
function xlFillSheet(xml, shared, weekEntries) {
  var blocks = xlFindDayBlocks(xml, shared);        // [{day:0..5, start, end}]
  var byDay = {};
  weekEntries.forEach(function (e) {
    var di = xlDayIndex(xlParseDate(e.date));
    if (di < 0) return; // dimanche ignoré
    (byDay[di] = byDay[di] || []).push(e);
  });

  var written = 0, overflow = [];
  Object.keys(byDay).forEach(function (diStr) {
    var di = parseInt(diStr, 10);
    var block = blocks.filter(function (b) { return b.day === di; })[0];
    if (!block) return;
    var items = byDay[di];
    var capacity = block.end - block.start + 1;
    var hours = xlComputeHours(items);
    for (var i = 0; i < items.length; i++) {
      if (i >= capacity) { overflow.push(XL_DAYS[di] + " (+" + (items.length - capacity) + ")"); break; }
      var rowNum = block.start + i;
      var it = items[i];
      xml = xlSetCell(xml, "B" + rowNum, it.departement || "", true);
      xml = xlSetCell(xml, "C" + rowNum, xlMission(it), true);
      if (i === 0) xml = xlSetCell(xml, "E" + rowNum, hours, false);
      var obs = xlObservation(it);
      if (obs) xml = xlSetCell(xml, "H" + rowNum, obs, true);
      written++;
    }
  });
  return { xml: xml, written: written, overflow: overflow };
}

/* ---------- Repérage des blocs jour (scan colonne A, comme le natif) ---------- */
function xlFindDayBlocks(xml, shared) {
  var starts = []; // {day, row}
  var totalRow = -1;
  var rowRe = /<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g, m;
  while ((m = rowRe.exec(xml)) !== null) {
    var rowNum = parseInt(m[1], 10);
    if (rowNum < 7) continue;
    var aVal = xlCellText(m[2], "A" + rowNum, shared);
    if (!aVal) continue;
    var up = aVal.trim().toUpperCase();
    var dayIdx = XL_DAYS.indexOf(up);
    if (dayIdx >= 0 && !starts.some(function (s) { return s.day === dayIdx; })) {
      starts.push({ day: dayIdx, row: rowNum });
    } else if (up === "TOTAL" && totalRow === -1) {
      totalRow = rowNum;
    }
  }
  starts.sort(function (a, b) { return a.row - b.row; });
  var blocks = [];
  for (var i = 0; i < starts.length; i++) {
    var end = (i + 1 < starts.length) ? starts[i + 1].row - 1 : (totalRow > 0 ? totalRow - 1 : starts[i].row);
    blocks.push({ day: starts[i].day, start: starts[i].row, end: end });
  }
  return blocks;
}

/* ---------- Lecture du texte d'une cellule dans un fragment de ligne ---------- */
function xlCellText(rowInner, ref, shared) {
  var re = new RegExp('<c[^>]*\\br="' + ref + '"[^>]*>([\\s\\S]*?)<\\/c>');
  var m = rowInner.match(re);
  if (!m) {
    // cellule auto-fermante (vide)
    if (new RegExp('<c[^>]*\\br="' + ref + '"[^>]*/>').test(rowInner)) return "";
    return null;
  }
  var cell = m[0], inner = m[1];
  var t = (cell.match(/\bt="([^"]+)"/) || [])[1];
  if (t === "s") { // shared string
    var idx = (inner.match(/<v>(\d+)<\/v>/) || [])[1];
    return idx != null ? (shared[parseInt(idx, 10)] || "") : "";
  }
  if (t === "inlineStr") {
    return xlDecode((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "");
  }
  // t="str" (formule) ou numérique
  return xlDecode((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || "");
}

/* ---------- Écriture d'une cellule (préserve le style s="...") ---------- */
function xlSetCell(xml, ref, value, isText) {
  var rowNum = ref.match(/\d+/)[0];
  // localiser la ligne
  var rowOpenRe = new RegExp('<row[^>]*\\br="' + rowNum + '"[^>]*>');
  var rowOpen = xml.match(rowOpenRe);
  if (!rowOpen) return xml; // pas de ligne (v1 : on n'en crée pas)
  var rowStart = xml.indexOf(rowOpen[0]);
  var rowEnd = xml.indexOf("</row>", rowStart);
  if (rowEnd < 0) return xml;
  var head = xml.slice(0, rowStart);
  var rowFull = xml.slice(rowStart, rowEnd);
  var tail = xml.slice(rowEnd);

  // style existant de la cellule (si présente)
  var existRe = new RegExp('<c[^>]*\\br="' + ref + '"[^>]*?(?:/>|>[\\s\\S]*?<\\/c>)');
  var existing = rowFull.match(existRe);
  var style = "";
  if (existing) {
    var sm = existing[0].match(/\bs="(\d+)"/);
    if (sm) style = ' s="' + sm[1] + '"';
  }

  var cellXml = xlBuildCell(ref, style, value, isText);

  if (existing) {
    rowFull = rowFull.replace(existRe, cellXml);
  } else {
    rowFull = xlInsertCellInRow(rowFull, ref, cellXml);
  }
  return head + rowFull + tail;
}

function xlBuildCell(ref, style, value, isText) {
  if (isText) {
    return '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' +
           xlEncode(String(value)) + '</t></is></c>';
  }
  return '<c r="' + ref + '"' + style + '><v>' + value + '</v></c>';
}

// insère une cellule au bon endroit (ordre des colonnes) dans une ligne
function xlInsertCellInRow(rowFull, ref, cellXml) {
  var col = xlColNum(ref.match(/[A-Z]+/)[0]);
  var cellRe = /<c[^>]*\br="([A-Z]+)\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g, m, insertPos = -1;
  while ((m = cellRe.exec(rowFull)) !== null) {
    if (xlColNum(m[1]) > col) { insertPos = m.index; break; }
  }
  if (insertPos < 0) { // après la dernière cellule, avant </row> implicite (rowFull n'inclut pas </row>)
    return rowFull + cellXml;
  }
  return rowFull.slice(0, insertPos) + cellXml + rowFull.slice(insertPos);
}

/* ---------- Shared strings ---------- */
function xlSharedStrings(byName) {
  var p = byName["xl/sharedStrings.xml"];
  if (!p) return [];
  var xml = p.getDataAsString("UTF-8");
  var out = [], re = /<si>([\s\S]*?)<\/si>/g, m;
  while ((m = re.exec(xml)) !== null) {
    var txt = "", tre = /<t[^>]*>([\s\S]*?)<\/t>/g, t;
    while ((t = tre.exec(m[1])) !== null) txt += t[1];
    out.push(xlDecode(txt));
  }
  return out;
}

/* ---------- Mapping nom de feuille → chemin XML ---------- */
function xlSheetPaths(byName) {
  var wb = byName["xl/workbook.xml"].getDataAsString("UTF-8");
  var rels = byName["xl/_rels/workbook.xml.rels"].getDataAsString("UTF-8");
  var ridToTarget = {}, rre = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g, r;
  while ((r = rre.exec(rels)) !== null) ridToTarget[r[1]] = r[2];
  var map = {}, sre = /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g, s;
  while ((s = sre.exec(wb)) !== null) {
    var target = ridToTarget[s[2]];
    if (target) map[xlDecode(s[1])] = "xl/" + target.replace(/^\//, "").replace(/^xl\//, "");
  }
  return map;
}

/* ---------- Métier (port de ExcelFiller.kt / HoursCalculator) ---------- */
function xlMission(e) {
  return [e.typeMission, e.nomClient, e.ville, e.numeroIntervention]
    .filter(function (x) { return x && String(x).trim(); }).join(" ").toUpperCase();
}
function xlObservation(e) {
  var label = { NR_CLIENT: "NR CLIENT", NR_TECHNIQUE: "NR TECHNIQUE", NR_CLIENT_ABS: "NR CLIENT ABS" }[e.observationType] || "";
  return [label, e.observations || ""].filter(function (x) { return x && String(x).trim(); }).join(" - ");
}
function xlComputeHours(items) {
  if (!items.length) return 0;
  var whole = ["VACANCES", "FORMATION", "FERIE"];
  if (items.some(function (e) { return whole.indexOf((e.typeMission || "").toUpperCase()) >= 0; })) return 7;
  function inSlot(e, s) { var v = e.slotMidi || ""; return s === "MATIN" ? (v === "MATIN" || v === "") : v === "APREM"; }
  var ma = items.some(function (e) { return inSlot(e, "MATIN"); });
  var aa = items.some(function (e) { return inSlot(e, "APREM"); });
  var mo = items.some(function (e) { return inSlot(e, "MATIN") && !(e.observationType || ""); });
  var ao = items.some(function (e) { return inSlot(e, "APREM") && !(e.observationType || ""); });
  var nA = (ma ? 1 : 0) + (aa ? 1 : 0), nO = (mo ? 1 : 0) + (ao ? 1 : 0);
  if (nA === 0) return 0; if (nA === 1) return 4; if (nO === 2) return 8; return 6;
}

/* ---------- Dates / ISO week ---------- */
function xlParseDate(iso) { var p = iso.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function xlDayIndex(d) { var wd = d.getDay(); return wd === 0 ? -1 : wd - 1; } // 0=dim → -1
function xlIsoWeek(d) {
  var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
}

/* ---------- Encodage XML ---------- */
function xlEncode(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function xlDecode(s) {
  return String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function xlColNum(letters) {
  var n = 0; for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64); return n;
}

/* ---------- Test manuel (à lancer dans l'éditeur Apps Script) ----------
 * Remplit le modèle d'un tech et dépose le résultat dans son dossier Drive.
 * Renseigne l'email du tech, exécute, lis les Logs.
 */
function testFillExcel() {
  var email = "tech@gsystem.fr"; // ← mets l'email d'un tech qui a déposé son Excel
  var u = findUserByEmail(email);
  if (!u) { Logger.log("Tech introuvable"); return; }
  var r = fillTemplateForUser(u.id, null, null);
  if (!r.ok) { Logger.log("Échec : " + r.reason); return; }
  var folder = DriveApp.getFolderById(u.driveFolderId);
  var f = folder.createFile(r.blob.setName("TEST-rempli-" + new Date().toISOString().slice(0, 10) + ".xlsm"));
  Logger.log("OK → " + f.getUrl());
  Logger.log("Rapport : " + JSON.stringify(r.report));
}