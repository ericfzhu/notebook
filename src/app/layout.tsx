import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Notebook — Kindle highlights",
  description:
    "A private, searchable library for Kindle highlights, notes, and bookmarks.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f3f0e9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
