import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": ["./scripts/lib/**/*"],
  },
  serverExternalPackages: [
    "fluent-ffmpeg",
    "@notionhq/client",
    "openai",
    "youtube-transcript",
  ],
};

export default nextConfig;
