export type ChequeFieldPosition = {
  left: number;
  top: number;
  width: number;
};

export type UaeChequeLayout = {
  key: string;
  name: string;
  widthMm: number;
  heightMm: number;
  date: ChequeFieldPosition;
  payee: ChequeFieldPosition;
  words: ChequeFieldPosition;
  amount: ChequeFieldPosition;
  crossing: ChequeFieldPosition;
};

type LayoutVariant = "standard" | "compact" | "wide-date" | "lower-amount" | "habib";

export const UAE_CHEQUE_WIDTH_MM = 190.5;
export const UAE_CHEQUE_HEIGHT_MM = 88.9;
export const HABIB_CHEQUE_WIDTH_MM = 187;
export const HABIB_CHEQUE_HEIGHT_MM = 90;

const variants: Record<LayoutVariant, Omit<UaeChequeLayout, "key" | "name">> = {
  standard: {
    widthMm: UAE_CHEQUE_WIDTH_MM, heightMm: UAE_CHEQUE_HEIGHT_MM,
    date: { left: 139, top: 13.5, width: 42.5 },
    payee: { left: 31, top: 33, width: 148 },
    words: { left: 24.5, top: 47.5, width: 124 },
    amount: { left: 149, top: 49.5, width: 32.5 },
    crossing: { left: 8, top: 7, width: 43.5 },
  },
  compact: {
    widthMm: UAE_CHEQUE_WIDTH_MM, heightMm: UAE_CHEQUE_HEIGHT_MM,
    date: { left: 140.5, top: 12, width: 40 },
    payee: { left: 35.5, top: 31.5, width: 142.5 },
    words: { left: 28, top: 45.5, width: 118 },
    amount: { left: 149, top: 46.5, width: 31.5 },
    crossing: { left: 7.5, top: 6.5, width: 44.5 },
  },
  "wide-date": {
    widthMm: UAE_CHEQUE_WIDTH_MM, heightMm: UAE_CHEQUE_HEIGHT_MM,
    date: { left: 134.5, top: 12.5, width: 46 },
    payee: { left: 27, top: 34, width: 152.5 },
    words: { left: 22.5, top: 49.5, width: 125 },
    amount: { left: 147, top: 50.5, width: 34.5 },
    crossing: { left: 8, top: 8, width: 45.5 },
  },
  "lower-amount": {
    widthMm: UAE_CHEQUE_WIDTH_MM, heightMm: UAE_CHEQUE_HEIGHT_MM,
    date: { left: 139.5, top: 14, width: 41 },
    payee: { left: 32.5, top: 34.5, width: 145 },
    words: { left: 25.5, top: 49.5, width: 121.5 },
    amount: { left: 149, top: 54, width: 31.5 },
    crossing: { left: 7.5, top: 7, width: 45.5 },
  },
  habib: {
    widthMm: HABIB_CHEQUE_WIDTH_MM, heightMm: HABIB_CHEQUE_HEIGHT_MM,
    date: { left: 105, top: 14.5, width: 50 },
    payee: { left: 7, top: 34, width: 172 },
    words: { left: 7, top: 49.5, width: 128 },
    amount: { left: 136, top: 55, width: 47 },
    crossing: { left: 7, top: 7, width: 45 },
  },
};

const bankLayouts: Array<[string, string, LayoutVariant]> = [
  ["emirates-nbd-business", "Emirates NBD · Business", "standard"],
  ["emirates-nbd-personal", "Emirates NBD · Personal", "compact"],
  ["first-abu-dhabi-bank", "First Abu Dhabi Bank (FAB)", "wide-date"],
  ["abu-dhabi-commercial-bank", "Abu Dhabi Commercial Bank (ADCB)", "standard"],
  ["abu-dhabi-islamic-bank", "Abu Dhabi Islamic Bank (ADIB)", "compact"],
  ["dubai-islamic-bank", "Dubai Islamic Bank (DIB)", "lower-amount"],
  ["mashreq-business", "Mashreq · Business", "standard"],
  ["mashreq-personal", "Mashreq · Personal", "compact"],
  ["rakbank-business", "RAKBANK · Business", "wide-date"],
  ["rakbank-personal", "RAKBANK · Personal", "compact"],
  ["emirates-islamic", "Emirates Islamic", "lower-amount"],
  ["commercial-bank-dubai", "Commercial Bank of Dubai (CBD)", "standard"],
  ["hsbc-uae", "HSBC UAE", "wide-date"],
  ["standard-chartered-business", "Standard Chartered · Business", "standard"],
  ["standard-chartered-personal", "Standard Chartered · Personal", "compact"],
  ["habib-bank-ag-zurich", "Habib Bank AG Zurich", "habib"],
  ["national-bank-fujairah", "National Bank of Fujairah (NBF)", "wide-date"],
  ["sharjah-islamic-bank", "Sharjah Islamic Bank", "compact"],
  ["united-arab-bank", "United Arab Bank", "standard"],
  ["commercial-bank-international", "Commercial Bank International (CBI)", "wide-date"],
  ["bank-of-sharjah", "Bank of Sharjah", "standard"],
  ["bank-of-baroda-uae", "Bank of Baroda · UAE", "lower-amount"],
  ["citibank-uae", "Citibank UAE", "compact"],
  ["ajman-bank", "Ajman Bank", "standard"],
  ["national-bank-umm-al-qaiwain", "National Bank of Umm Al Qaiwain (NBQ)", "wide-date"],
  ["wio-business", "Wio Business", "compact"],
  ["mbank-uae", "Mbank UAE", "compact"],
  ["ruya-bank", "Ruya Bank", "standard"],
  ["other-uae-bank", "Other UAE bank · Standard layout", "standard"],
];

export const uaeChequeLayouts: UaeChequeLayout[] = bankLayouts.map(([key, name, variant]) => ({ key, name, ...variants[variant] }));

export function uaeChequeLayout(key: string | undefined): UaeChequeLayout {
  return uaeChequeLayouts.find((layout) => layout.key === key) ?? uaeChequeLayouts[uaeChequeLayouts.length - 1];
}

export function inferUaeChequeLayout(bankName: string): string {
  const value = bankName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const rules: Array<[RegExp, string]> = [
    [/emirates nbd.*personal|personal.*emirates nbd/, "emirates-nbd-personal"],
    [/emirates nbd/, "emirates-nbd-business"],
    [/first abu dhabi|\bfab\b|national bank of abu dhabi|first gulf/, "first-abu-dhabi-bank"],
    [/abu dhabi commercial|\badcb\b/, "abu-dhabi-commercial-bank"],
    [/abu dhabi islamic|\badib\b/, "abu-dhabi-islamic-bank"],
    [/dubai islamic|\bdib\b/, "dubai-islamic-bank"],
    [/mashreq.*personal|personal.*mashreq/, "mashreq-personal"],
    [/mashreq/, "mashreq-business"],
    [/rakbank.*personal|personal.*rakbank/, "rakbank-personal"],
    [/rakbank|national bank of ras al khaimah/, "rakbank-business"],
    [/emirates islamic/, "emirates-islamic"],
    [/commercial bank of dubai|\bcbd\b/, "commercial-bank-dubai"],
    [/hsbc/, "hsbc-uae"],
    [/standard chartered.*personal|personal.*standard chartered/, "standard-chartered-personal"],
    [/standard chartered/, "standard-chartered-business"],
    [/habib bank ag zurich/, "habib-bank-ag-zurich"],
    [/national bank of fujairah|\bnbf\b/, "national-bank-fujairah"],
    [/sharjah islamic/, "sharjah-islamic-bank"],
    [/united arab bank/, "united-arab-bank"],
    [/commercial bank international|\bcbi\b/, "commercial-bank-international"],
    [/bank of sharjah/, "bank-of-sharjah"],
    [/bank of baroda/, "bank-of-baroda-uae"],
    [/citibank|citi bank/, "citibank-uae"],
    [/ajman bank/, "ajman-bank"],
    [/umm al qaiwain|\bnbq\b/, "national-bank-umm-al-qaiwain"],
    [/\bwio\b/, "wio-business"],
    [/\bmbank\b/, "mbank-uae"],
    [/\bruya\b/, "ruya-bank"],
  ];
  return rules.find(([pattern]) => pattern.test(value))?.[1] ?? "other-uae-bank";
}
