const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

function getDriveClient() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI || "urn:ietf:wg:oauth:2.0:oob";
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID must be set");
  }
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN must be set to upload to Drive"
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  return { drive, folderId };
}

async function uploadFileToDrive(filePath, title) {
  const { drive, folderId } = getDriveClient();
  const fileName = title ? sanitizeFilename(title) + ".mp4" : path.basename(filePath);

  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };
  const media = {
    mimeType: "video/mp4",
    body: fs.createReadStream(filePath),
  };

  const res = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: "id, webViewLink, webContentLink",
  });

  const file = res.data;
  // STEP 9 – upload complete
  console.log("STEP 9 – upload complete", {
    fileId: file.id,
    link: file.webViewLink || file.webContentLink,
    folderId,
    fileName,
  });
  return {
    fileId: file.id,
    link: file.webViewLink || file.webContentLink,
  };
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, "").slice(0, 80) || "clip";
}

module.exports = {
  uploadFileToDrive,
};
