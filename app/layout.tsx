import type { Metadata, Viewport } from "next";
import "./globals.css";
import { appFontVariables } from "./fonts";
import { AttachmentCapture } from "./attachment-capture";
import { DevtoolsDeterrent } from "./devtools-deterrent";
import { PeriodLockPinPrompt } from "./period-lock-pin";
import { EscapeWindowCloser } from "./escape-window-closer";
import { RequiredFieldHighlighter } from "./required-field-highlighter";
import { SearchHighlighter } from "./search-highlighter";

export const metadata: Metadata = {
  title: "EasyBook Online Accounting ERP",
  description: "EasyBook Online Accounting ERP: web-based accounting, sales, purchasing, inventory, banking and financial reporting.",
  icons: {
    icon: "/easybook-mark.png",
    shortcut: "/easybook-mark.png",
    apple: "/easybook-mark.png",
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
    <html lang="en" className={appFontVariables}>
      <body className="antialiased">
        {children}
        <EscapeWindowCloser />
        <RequiredFieldHighlighter />
        <SearchHighlighter />
        <AttachmentCapture />
        <PeriodLockPinPrompt />
        <DevtoolsDeterrent />
      </body>
    </html>
  );
}
