import type { Metadata } from "next";
import "./globals.css";
import { DataExportToolbar } from "./data-export-toolbar";

export const metadata: Metadata = {
  title: "ComNet Enterprise Accounting",
  description: "Web-based accounting, sales, purchasing, inventory, banking and financial reporting for ComNet International.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
        <DataExportToolbar />
      </body>
    </html>
  );
}
