import { Almarai, Cairo, IBM_Plex_Sans_Arabic, Inter, Lato, Noto_Kufi_Arabic, Noto_Sans_Arabic, Nunito_Sans, Open_Sans, Poppins, Readex_Pro, Roboto, Source_Sans_3, Tajawal } from "next/font/google";

// Fonts a company can choose in Company Setup → Fonts & text (lib/app-typography.ts). next/font self-hosts them; each only
// defines `--font-app-<key>` and is not preloaded, so the browser downloads a font only when the company has chosen it
// (or, for Noto Sans Arabic, when Arabic text is shown in a Latin-only font).
// next/font needs literal options in every call (no shared object or spread).
const inter = Inter({ display: "swap", preload: false, subsets: ["latin"], variable: "--font-app-inter" });
const roboto = Roboto({ display: "swap", preload: false, subsets: ["latin"], variable: "--font-app-roboto" });
const openSans = Open_Sans({ display: "swap", preload: false, subsets: ["latin"], variable: "--font-app-open-sans" });
const lato = Lato({ display: "swap", preload: false, subsets: ["latin"], weight: ["400", "700"], variable: "--font-app-lato" });
const poppins = Poppins({ display: "swap", preload: false, subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-app-poppins" });
const sourceSans = Source_Sans_3({ display: "swap", preload: false, subsets: ["latin"], variable: "--font-app-source-sans-3" });
const nunitoSans = Nunito_Sans({ display: "swap", preload: false, subsets: ["latin"], variable: "--font-app-nunito-sans" });
const cairo = Cairo({ display: "swap", preload: false, subsets: ["arabic", "latin"], variable: "--font-app-cairo" });
const tajawal = Tajawal({ display: "swap", preload: false, subsets: ["arabic", "latin"], weight: ["400", "500", "700"], variable: "--font-app-tajawal" });
const plexArabic = IBM_Plex_Sans_Arabic({ display: "swap", preload: false, subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-app-ibm-plex-sans-arabic" });
const almarai = Almarai({ display: "swap", preload: false, subsets: ["arabic", "latin"], weight: ["400", "700"], variable: "--font-app-almarai" });
const readexPro = Readex_Pro({ display: "swap", preload: false, subsets: ["arabic", "latin"], variable: "--font-app-readex-pro" });
const notoSansArabic = Noto_Sans_Arabic({ display: "swap", preload: false, subsets: ["arabic", "latin"], variable: "--font-app-noto-sans-arabic" });
const notoKufiArabic = Noto_Kufi_Arabic({ display: "swap", preload: false, subsets: ["arabic", "latin"], variable: "--font-app-noto-kufi-arabic" });

/** Class names that define every `--font-app-*` variable; set on <html> in the root layout. */
export const appFontVariables = [inter, roboto, openSans, lato, poppins, sourceSans, nunitoSans, cairo, tajawal, plexArabic, almarai, readexPro, notoSansArabic, notoKufiArabic].map((font) => font.variable).join(" ");
