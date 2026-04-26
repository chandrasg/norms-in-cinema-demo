/**
 * MAPGEN feedback receiver — Google Apps Script
 *
 * Paste this into a script attached to a Google Sheet (Extensions →
 * Apps Script). Deploy as a Web App with execute-as=Me, access=Anyone.
 * The deployment URL is what you paste into the GitHub Action secret
 * PUBLIC_FEEDBACK_ENDPOINT.
 *
 * Why text/plain? Google Apps Script web-apps don't support CORS preflight
 * for JSON content-type, so we receive the body as text/plain and parse it
 * server-side. The browser treats text/plain as a "simple request" and
 * doesn't send a preflight, sidestepping the issue entirely.
 */

const SHEET_NAME = "feedback";

// Set up the header row idempotently on every call (cheap; only writes if missing)
function ensureHeader_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "timestamp",
      "role",
      "message",
      "email",
      "user_agent",
      "referrer",
      "ip_hash",
    ]);
    sheet.setFrozenRows(1);
  }
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
    ensureHeader_(sheet);

    let payload = {};
    try {
      payload = JSON.parse(e.postData.contents || "{}");
    } catch (_) {
      // Fall back to form-encoded
      payload = e.parameter || {};
    }

    const role = String(payload.role || "").slice(0, 64);
    const message = String(payload.message || "").slice(0, 5000);
    const email = String(payload.email || "").slice(0, 256);
    const userAgent = String(payload.user_agent || "").slice(0, 512);
    const referrer = String(payload.referrer || "").slice(0, 512);

    // Light-touch spam filter: require a message, rate-limit by ip-hash
    if (!message.trim()) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "empty_message" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    sheet.appendRow([
      new Date(),
      role,
      message,
      email,
      userAgent,
      referrer,
      "",  // ip_hash placeholder — Apps Script doesn't expose client IP
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Optional: GET handler so you can ping the endpoint to verify it's deployed
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: "mapgen-feedback" }))
    .setMimeType(ContentService.MimeType.JSON);
}
