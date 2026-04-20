/**
 * KHAJNI YATRA — Google Apps Script backend
 * ------------------------------------------
 * Bound to sheet:
 *   https://docs.google.com/spreadsheets/d/1MBGewIiTatjRgV8zQVekzEehYMMjkoRAlRqCOSvA-FA/
 *
 * Handles:
 *   - POST /exec        : feedback + poll submissions
 *                         Rejects duplicate IPs per form.
 *                         Stores row in Sheet.
 *                         Emails feedback to candidate.
 *                         Returns live vote counts on successful poll.
 *   - GET  /exec?action=counts : returns live vote counts (for page load refresh)
 *
 * ============== SETUP (one-time, ~2 minutes) ==============
 *
 * 1. https://script.google.com → New Project.
 * 2. Paste this whole file into Code.gs.
 * 3. (Optional) Left sidebar → Project Settings → Script properties → add:
 *       NOTIFY_EMAIL    =  <candidate's private inbox>     (for email on feedback)
 *       SPREADSHEET_ID  =  <override>                      (only if switching sheets)
 *    The SPREADSHEET_ID defaults to the one above — no property needed.
 *    Tabs "feedback" and "poll" are auto-created on first write.
 * 4. Deploy (top-right) → New deployment → gear → Web app.
 *       Execute as:    Me
 *       Who has access: Anyone
 * 5. Authorize. Copy the "Web app URL".
 * 6. Paste that URL in assets/js/main.js → CONFIG.APPS_SCRIPT_URL.
 *
 * =========================================================
 */

// ---------- config ----------
var DEFAULT_SPREADSHEET_ID = "1MBGewIiTatjRgV8zQVekzEehYMMjkoRAlRqCOSvA-FA";

// ---------- entry points ----------
function doPost(e) {
  try {
    var body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};

    var formType = (body.formType || "feedback").toString().toLowerCase();
    if (formType !== "feedback" && formType !== "poll") {
      return _json({ ok: false, error: "Unknown formType" });
    }

    // ---- IP dedup ----
    var ip = String(body.ip || "").trim();
    if (ip && _isDuplicateIP(formType, ip)) {
      var out = { ok: false, reason: "duplicate" };
      if (formType === "poll") out.counts = _computePollCounts();
      return _json(out);
    }

    _appendRow(formType, body);

    if (formType === "feedback") {
      _notifyCandidate(body);
      return _json({ ok: true });
    }

    // poll — return updated counts
    return _json({ ok: true, counts: _computePollCounts() });
  } catch (err) {
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
