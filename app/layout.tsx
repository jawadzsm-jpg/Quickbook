import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DataExportToolbar } from "./data-export-toolbar";
import { AttachmentCapture } from "./attachment-capture";
import { EscapeWindowCloser } from "./escape-window-closer";

export const metadata: Metadata = {
  title: "ComNet Enterprise Accounting",
  description: "Web-based accounting, sales, purchasing, inventory, banking and financial reporting for ComNet International.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#09111e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <EscapeWindowCloser />
        <DataExportToolbar />
        <AttachmentCapture />
      </body>
    </html>
  );
}
