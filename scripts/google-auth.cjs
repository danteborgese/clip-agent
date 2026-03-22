#!/usr/bin/env node

// One-time helper to get a Google OAuth refresh token for Drive.
// Usage (from the clip-agent folder):
//   node scripts/google-auth.cjs
//
// It will print an authorization URL. Open it in your browser, approve access,
// then paste the code back into this script when prompted. It will then print
// a refresh token you can put in GOOGLE_OAUTH_REFRESH_TOKEN.

const path = require("path");
const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");

// Load .env.local if present
const envLocal = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocal)) {
  try {
    require("dotenv").config({ path: envLocal });
  } catch {
    // dotenv is optional; env vars may already be set
  }
}

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const redirectUri =
  process.env.GOOGLE_OAUTH_REDIRECT_URI || "urn:ietf:wg:oauth:2.0:oob";

if (!clientId || !clientSecret) {
  console.error(
    "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in .env.local before running this script."
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

const scopes = ["https://www.googleapis.com/auth/drive.file"];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: scopes,
  prompt: "consent",
});

console.log("\n--- Google OAuth for Drive (clip-agent) ---\n");
console.log("1. Open this URL in your browser:");
console.log(authUrl + "\n");
console.log(
  "2. Log in with the Google account whose Drive you want to use and click Allow."
);
console.log("3. Copy the code Google shows you.");
console.log("4. Paste it below and press Enter.\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Paste authorization code here: ", async (code) => {
  rl.close();
  const trimmed = String(code || "").trim();
  if (!trimmed) {
    console.error("No code provided. Aborting.");
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken(trimmed);
    if (!tokens.refresh_token) {
      console.error(
        "No refresh_token returned. Make sure you used 'access_type=offline' and 'prompt=consent', then try again."
      );
      process.exit(1);
    }

    console.log("\nSuccess! Here is your refresh token:\n");
    console.log(tokens.refresh_token + "\n");
    console.log(
      "Add this to .env.local and GitHub Actions secrets as GOOGLE_OAUTH_REFRESH_TOKEN."
    );
  } catch (err) {
    console.error("\nFailed to exchange code for tokens:\n", err.message || err);
    process.exit(1);
  }
});

