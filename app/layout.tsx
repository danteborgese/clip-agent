import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clip Agent",
  description: "Submit a link and instruction to generate a clip.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
