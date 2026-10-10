// Emoji styles for products shared from Inventory Overview to WhatsApp and Telegram. Each user picks a style per
// channel; an administrator can switch emoji off for a company, which shares that company's products as "none".

export type ShareEmojiStyle = { id: string; label: string; title: string; condition: string; screen: string; quantity: string; price: string };

export const shareEmojiStyles: readonly ShareEmojiStyle[] = [
  { id: "classic", label: "🔺 Classic", title: "🔺", condition: "⚡", screen: "🖥", quantity: "📦", price: "💰" },
  { id: "fire", label: "🔥 Hot deal", title: "🔥", condition: "✨", screen: "🖥️", quantity: "📦", price: "💵" },
  { id: "star", label: "⭐ Star", title: "⭐", condition: "🌟", screen: "💻", quantity: "🛒", price: "🏷️" },
  { id: "ready", label: "✅ Ready stock", title: "✅", condition: "🆕", screen: "📺", quantity: "📦", price: "💲" },
  { id: "premium", label: "💎 Premium", title: "💎", condition: "👑", screen: "🖥️", quantity: "📦", price: "💰" },
  { id: "rocket", label: "🚀 Rocket", title: "🚀", condition: "💥", screen: "💻", quantity: "📦", price: "🤑" },
  { id: "none", label: "No emoji", title: "", condition: "", screen: "", quantity: "", price: "" },
];

export const defaultShareEmoji = "classic";
export const isShareEmojiStyle = (id: unknown) => shareEmojiStyles.some((style) => style.id === id);
export const shareEmojiStyle = (id: unknown) => shareEmojiStyles.find((style) => style.id === id) ?? shareEmojiStyles[0];
