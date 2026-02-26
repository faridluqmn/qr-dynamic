/***********************
 * ROUTER
 ***********************/
function doPost(e) {
  try {
    const path = e.parameter.path;
    const body = JSON.parse(e.postData.contents || "{}");

    if (path === "presence/qr/generate") return generateQR(body);
    if (path === "presence/checkin") return checkin(body);

    return outputError("unknown_endpoint");
  } catch (err) {
    return outputError("server_error");
  }
}

function doGet(e) {
  try {
    const path = e.parameter.path;

    if (path === "presence/status") return status(e.parameter);

    return outputError("unknown_endpoint");
  } catch (err) {
    return outputError("server_error");
  }
}

/***********************
 * RESPONSE HELPERS
 ***********************/
function outputSuccess(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function outputError(message) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

function validateRequired(fields, body) {
  for (let field of fields) {
    if (!body[field]) return "missing_field: " + field;
  }
  return null;
}

/***********************
 * GENERATE QR TOKEN
 ***********************/
function generateQR(body) {

  const requiredError = validateRequired(
    ["course_id", "session_id", "ts"],
    body
  );
  if (requiredError) return outputError(requiredError);

  const sheet = SpreadsheetApp.getActive().getSheetByName("tokens");

  const token = "TKN-" + Math.random().toString(36).substring(2,8).toUpperCase();
  const now = new Date();
  const exp = new Date(now.getTime() + 2 * 60 * 1000); // 2 menit

  sheet.appendRow([
    token,
    body.course_id,
    body.session_id,
    exp.toISOString(),
    now.toISOString(),
    false
  ]);

  return outputSuccess({
    qr_token: token,
    expires_at: exp.toISOString()
  });
}

/***********************
 * CHECK-IN
 ***********************/
function checkin(body) {

  const requiredError = validateRequired(
    ["user_id", "device_id", "course_id", "session_id", "qr_token", "ts"],
    body
  );
  if (requiredError) return outputError(requiredError);

  const ss = SpreadsheetApp.getActive();
  const tokenSheet = ss.getSheetByName("tokens");
  const presSheet = ss.getSheetByName("presence");

  const tokens = tokenSheet.getDataRange().getValues();

  let tokenRow = null;

  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i][0] === body.qr_token) {
      tokenRow = tokens[i];
      break;
    }
  }

  if (!tokenRow) return outputError("token_invalid");

  const tokenCourse = tokenRow[1];
  const tokenSession = tokenRow[2];
  const tokenExpiry = new Date(tokenRow[3]);

  if (tokenCourse !== body.course_id || tokenSession !== body.session_id)
    return outputError("token_mismatch");

  if (new Date() > tokenExpiry)
    return outputError("token_expired");

  // Cek sudah pernah check-in?
  const presData = presSheet.getDataRange().getValues();

  for (let i = 1; i < presData.length; i++) {
    if (
      presData[i][1] === body.user_id &&
      presData[i][3] === body.course_id &&
      presData[i][4] === body.session_id
    ) {
      return outputError("already_checked_in");
    }
  }

  const presenceId = "PR-" + Date.now();

  presSheet.appendRow([
    presenceId,
    body.user_id,
    body.device_id,
    body.course_id,
    body.session_id,
    body.ts,
    "checked_in"
  ]);

  return outputSuccess({
    presence_id: presenceId,
    status: "checked_in"
  });
}

/***********************
 * STATUS
 ***********************/
function status(q) {

  if (!q.user_id || !q.course_id || !q.session_id)
    return outputError("missing_query_parameter");

  const sheet = SpreadsheetApp.getActive().getSheetByName("presence");
  const data = sheet.getDataRange().getValues();

  for (let i = data.length - 1; i > 0; i--) {
    if (
      data[i][1] === q.user_id &&
      data[i][3] === q.course_id &&
      data[i][4] === q.session_id
    ) {
      return outputSuccess({
        user_id: q.user_id,
        course_id: q.course_id,
        session_id: q.session_id,
        status: data[i][6],
        last_ts: data[i][5]
      });
    }
  }

  return outputError("not_found");
}