/**
 * KHAJNI YATRA — Google Apps Script backend
 * ------------------------------------------
 * Bound to sheet:
 *   https://docs.google.com/spreadsheets/d/1MBGewIiTatjRgV8zQVekzEehYMMjkoRAlRqCOSvA-FA/
 *
 * Client talks to this Web App with a fire-and-forget pattern
 * (sendBeacon / no-cors fetch) so the POST response body is opaque.
 * After a poll vote, the client fetches counts separately via GET.
 *
 * Endpoints:
 *   POST /exec                     form submission (feedback | poll)
 *                                  - Writes a row on success.
 *                                  - Silently drops duplicate IPs (no error).
 *                                  - Emails candidate on feedback.
 *                                  - Response body is NOT read by client —
 *                                    return minimal JSON for logs only.
 *   GET  /exec?action=counts       live poll tallies (client reads this).
 *   GET  /exec                     health probe.
 *
 * ============== SETUP (one-time) ==============
 *
 * 1. https://script.google.com → New Project.
 * 2. Paste this file into Code.gs. Save.
 * 3. (Optional) Project Settings → Script properties:
 *       NOTIFY_EMAIL    =  <candidate's private inbox>   (enables feedback email)
 *       SPREADSHEET_ID  =  <override>                    (only if swapping sheet)
 *    Defaults to the sheet above; tabs "feedback" + "poll" auto-create.
 * 4. Deploy → New deployment → gear → Web app
 *       Execute as:      Me
 *       Who has access:  Anyone
 * 5. Authorize. Copy the "Web app URL".
 * 6. Paste URL into assets/js/main.js → CONFIG.APPS_SCRIPT_URL.
 *
 * Re-deploy (NOT manage deployments → edit) every time you push code
 * changes — or use "New version" so the /exec URL stays the same.
 *
 * ==============================================
 */

// ---------- config ----------
var DEFAULT_SPREADSHEET_ID = "1MBGewIiTatjRgV8zQVekzEehYMMjkoRAlRqCOSvA-FA";

var FORM_TYPES = { feedback: true, poll: true };

// ---------- entry points ----------
function doPost(e) {
  try {
    var body = _parseBody(e);
    var formType = String(body.formType || "feedback").toLowerCase();
    if (!FORM_TYPES[formType]) return _json({ ok: false, error: "Unknown formType" });

    var ip = String(body.ip || "").trim();

    // Silent duplicate-IP drop — client can't read this response anyway,
    // so we just skip the row write and return ok. Keeps the sheet clean.
    if (ip && _isDuplicateIP(formType, ip)) {
      return _json({ ok: true, deduped: true });
    }

    _appendRow(formType, body);
    if (formType === "feedback") _notifyCandidate(body);

    return _json({ ok: true });
  } catch (err) {
    // Best-effort error log; client under no-cors won't see this.
    return _json({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  try {
    var action = e && e.parameter && e.parameter.action;
    if (action === "counts") {
      return _json({ ok: true, counts: _computePollCounts() });
    }
    return _json({ ok: true, service: "Khajni Yatra forms", time: new Date().toISOString() });
  } catch (err) {
    return _json({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------- helpers ----------

function _parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try { return JSON.parse(e.postData.contents) || {}; }
  catch (err) { return {}; }
}

function _getSheet(tabName) {
  var id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || DEFAULT_SPREADSHEET_ID;
  if (!id) throw new Error("SPREADSHEET_ID is not configured.");
  var ss = SpreadsheetApp.openById(id);
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) sheet = ss.insertSheet(tabName);
  return sheet;
}

function _headers(formType) {
  return formType === "poll"
    ? ["timestamp", "priority", "location", "ip", "pageLang", "userAgent"]
    : ["timestamp", "name", "phone", "location", "message", "ip", "pageLang", "userAgent"];
}

function _ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

function _isDuplicateIP(formType, ip) {
  var sheet = _getSheet(formType);
  var headers = _headers(formType);
  _ensureHeaders(sheet, headers);
  var ipCol = headers.indexOf("ip") + 1; // 1-based
  if (ipCol <= 0) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var ips = sheet.getRange(2, ipCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < ips.length; i++) {
    if (String(ips[i][0]).trim() === ip) return true;
  }
  return false;
}

function _appendRow(formType, body) {
  var sheet = _getSheet(formType);
  var headers = _headers(formType);
  _ensureHeaders(sheet, headers);
  var row = headers.map(function (h) {
    if (h === "timestamp") return body.submittedAt || new Date().toISOString();
    return body[h] != null ? String(body[h]) : "";
  });
  sheet.appendRow(row);
}

function _computePollCounts() {
  var sheet = _getSheet("poll");
  var headers = _headers("poll");
  _ensureHeaders(sheet, headers);
  var col = headers.indexOf("priority") + 1;
  var last = sheet.getLastRow();
  var counts = {};
  if (last < 2 || col <= 0) return counts;
  var vals = sheet.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    var raw = String(vals[i][0] || "");
    if (!raw) continue;
    raw.split("|").forEach(function (p) {
      p = p.trim();
      if (p) counts[p] = (counts[p] || 0) + 1;
    });
  }
  return counts;
}

function _notifyCandidate(body) {
  var to = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL");
  if (!to) return;
  var subject = "🟥 Khajni Yatra · New message from " + (body.name || "someone");
  var lines = [
    "A new private message on the Khajni Yatra site.",
    "",
    "Name     : " + (body.name || "—"),
    "Phone    : " + (body.phone || "—"),
    "Location : " + (body.location || "—"),
    "Lang     : " + (body.pageLang || "—"),
    "IP       : " + (body.ip || "—"),
    "When     : " + (body.submittedAt || new Date().toISOString()),
    "",
    "Message :",
    (body.message || "(empty)"),
    "",
    "— Sent automatically from the Khajni Yatra site."
  ];
  MailApp.sendEmail({ to: to, subject: subject, body: lines.join("\n") });
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
