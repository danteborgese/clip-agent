import type { NextConfig } from "next";

const nextConfig: NextConfig = {
serverExternalPackages: [
    "fluent-ffmpeg",
    "@notionhq/client",
    "openai",
    "youtube-transcript",
  ],
};

export default nextConfig;
