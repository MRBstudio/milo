import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MILO — Italian soul, Iranian taste",
  description: "A moving Italian deli. Where is MILO next?",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
