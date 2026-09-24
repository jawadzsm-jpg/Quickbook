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

type LayoutVariant = "standard" | "compact" | "wide-date" | "lower-amount" | "habib-186x90";

const variants: Record<LayoutVariant, Omit<UaeChequeLayout, "key" | "name">> = {
  standard: {
    widthMm: 210, heightMm: 99,
    date: { left: 153, top: 15, width: 47 },
    payee: { left: 34, top: 37, width: 163 },
    words: { left: 27, top: 53, width: 137 },
    amount: { left: 164, top: 55, width: 36 },
    crossing: { left: 9, top: 8, width: 48 },
  },
  compact: {
    widthMm: 210, heightMm: 95,
    date: { left: 155, top: 13, width: 44 },
    payee: { left: 39, top: 34, width: 157 },
    words: { left: 31, top: 49, width: 130 },
    amount: { left: 164, top: 50, width: 35 },
    crossing: { left: 8, top: 7, width: 49 },
  },
  "wide-date": {
    widthMm: 210, heightMm: 99,
    date: { left: 148, top: 14, width: 51 },
    payee: { left: 30, top: 38, width: 168 },
    words: { left: 25, top: 55, width: 138 },
    amount: { left: 162, top: 56, width: 38 },
    crossing: { left: 9, top: 9, width: 50 },
  },
  "lower-amount": {
    widthMm: 210, heightMm: 100,
    date: { left: 154, top: 16, width: 45 },
    payee: { left: 36, top: 39, width: 160 },
    words: { left: 28, top: 56, width: 134 },
    amount: { left: 164, top: 61, width: 35 },
    crossing: { left: 8, top: 8, width: 50 },
  },
  "habib-186x90": {
    widthMm: 186, heightMm: 90,
    date: { left: 136.5, top: 14.5, width: 40 },
    payee: { left: 32, top: 35, width: 142 },
    words: { left: 25, top: 50.5, width: 119 },
    amount: { left: 145, top: 55, width: 31 },
    crossing: { left: 7, top: 7, width: 44 },
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
  ["habib-bank-ag-zurich", "Habib Bank AG Zurich", "habib-186x90"],
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
