const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

function getDriveClient() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!json || !folderId) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_FOLDER_ID must be set");
  }

  const creds = JSON.parse(json);
  const auth = new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    ["https://www.googleapis.com/auth/drive.file"]
  );
  const drive = google.drive({ version: "v3", auth });
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
