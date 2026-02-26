/***********************
 * ROUTER
 ***********************/
function doPost(e) {
  const path = e.parameter.path;
  const body = JSON.parse(e.postData.contents);

  if (path === "presence/qr/generate") return generateQR(body);
  if (path === "presence/checkin") return checkin(body);

  return output({ ok: false, error: "unknown_endpoint" });
}

function doGet(e) {
  const path = e.parameter.path;

  if (path === "presence/status") return status(e.parameter);

  return output({ ok: false, error: "unknown_endpoint" });
}

/***********************
 * RESPONSE HELPER
 ***********************/
function output(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/***********************
 * GENERATE QR TOKEN
 ***********************/
function generateQR(body) {
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

  return output({
    ok: true,
    data: {
      qr_token: token,
      expires_at: exp.toISOString()
    }
  });
}

/***********************
 * CHECK-IN
 ***********************/
function checkin(body) {
  const ss = SpreadsheetApp.getActive();
  const tokenSheet = ss.getSheetByName("tokens");
  const presSheet = ss.getSheetByName("presence");

  const tokens = tokenSheet.getDataRange().getValues();

  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i][0] === body.qr_token) {

      // expired?
      if (new Date(tokens[i][3]) < new Date())
        return output({ ok:false, error:"token_expired" });

      const pid = "PR-" + Date.now();

      presSheet.appendRow([
        pid,
        body.user_id,
        body.device_id,
        body.course_id,
        body.session_id,
        body.ts,
        "checked_in"
      ]);

      return output({
        ok:true,
        data:{ presence_id: pid, status:"checked_in" }
      });
    }
  }

  return output({ ok:false, error:"token_invalid" });
}

/***********************
 * STATUS
 ***********************/
function status(q) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("presence");
  const data = sheet.getDataRange().getValues();

  for (let i = data.length - 1; i > 0; i--) {
    if (
      data[i][1] === q.user_id &&
      data[i][3] === q.course_id &&
      data[i][4] === q.session_id
    ) {
      return output({
        ok:true,
        data:{
          user_id:q.user_id,
          course_id:q.course_id,
          session_id:q.session_id,
          status:data[i][6],
          last_ts:data[i][5]
        }
      });
    }
  }

  return output({ ok:false, error:"not_found" });
}

/***********************
 * LOCAL TEST
 ***********************/
function testQR() {
  const body = {
    course_id: "cloud-101",
    session_id: "sesi-01"
  };

  Logger.log(generateQR(body).getContent());
}

function testCheckin() {
  const body = {
    user_id: "20230001",
    device_id: "dev-001",
    course_id: "cloud-101",
    session_id: "sesi-01",
    qr_token: "PASTE_TOKEN",
    ts: new Date().toISOString()
  };

  Logger.log(checkin(body).getContent());
}