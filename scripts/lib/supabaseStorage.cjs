const { supabase } = require("./supabaseClient.cjs");
const fs = require("fs");
const path = require("path");

const BUCKET_NAME = process.env.SUPABASE_CLIPS_BUCKET || "clips";

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, "").replace(/\s+/g, "-").slice(0, 80) || "clip";
}

/**
 * Upload a video file to Supabase Storage and return the public URL.
 *
 * @param {string} filePath - Local path to the video file
 * @param {string} jobId - Job ID (used as folder prefix)
 * @param {string} [title] - Optional title for the filename
 * @returns {Promise<{ storagePath: string, publicUrl: string }>}
 */
async function uploadClipToStorage(filePath, jobId, title) {
  const fileName = title ? sanitizeFilename(title) + ".mp4" : path.basename(filePath);
  const storagePath = `${jobId}/${fileName}`;

  const fileBuffer = fs.readFileSync(filePath);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, fileBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Supabase storage upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath);

  console.log("Upload complete", {
    storagePath,
    publicUrl: urlData.publicUrl,
  });

  return {
    storagePath,
    publicUrl: urlData.publicUrl,
  };
}

module.exports = {
  uploadClipToStorage,
};
