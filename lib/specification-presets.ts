export const specificationFields = [
  "Brand", "Model", "Part Number", "Condition", "Product Category", "Processor Brand",
  "Processor Model", "Processor Generation", "RAM Capacity", "RAM Type", "Storage Capacity",
  "Storage Type", "Graphics", "Graphics Memory", "Screen Size", "Resolution", "Touchscreen",
  "Color", "Keyboard Language", "Backlit Keyboard", "Operating System", "Warranty", "Battery",
  "Ports", "Wireless", "Camera", "Weight", "Included Accessories", "Country of Origin", "Notes",
] as const;

export const specificationPresets: Record<string, string[]> = {
  Brand: ["ASUS", "Acer", "Apple", "Dell", "HP", "Lenovo", "Microsoft", "MSI"],
  Condition: ["Brand New", "Open Box", "Refurbished", "Used"],
  "Product Category": ["Laptop", "Desktop", "All-in-One", "Monitor", "Printer", "Networking", "Storage", "Accessory"],
  "Processor Brand": ["Intel", "AMD", "Apple", "Qualcomm"],
  "Processor Generation": ["12th Gen", "13th Gen", "14th Gen", "Core Ultra Series 1", "Core Ultra Series 2"],
  "RAM Capacity": ["8GB", "16GB", "24GB", "32GB", "48GB", "64GB", "128GB"],
  "RAM Type": ["DDR4", "DDR5", "LPDDR5", "LPDDR5X"],
  "Storage Capacity": ["256GB", "512GB", "1TB", "2TB", "4TB"],
  "Storage Type": ["SSD NVMe", "SSD SATA", "HDD", "eMMC"],
  "Graphics Memory": ["Integrated", "4GB", "6GB", "8GB", "12GB", "16GB", "24GB"],
  "Screen Size": ["13.3 inch", "14 inch", "15.6 inch", "16 inch", "17.3 inch"],
  Resolution: ["FHD (1920×1080)", "WUXGA (1920×1200)", "QHD (2560×1440)", "WQXGA (2560×1600)", "4K UHD (3840×2160)"],
  Touchscreen: ["Yes", "No", "2-in-1 / x360"],
  "Keyboard Language": ["English", "English / Arabic", "English / Russian"],
  "Backlit Keyboard": ["Yes", "No", "RGB"],
  "Operating System": ["DOS", "Windows 11 Home", "Windows 11 Pro", "macOS", "Linux"],
  Warranty: ["Manufacturer Warranty", "1 Year Shop Warranty", "3 Months Shop Warranty", "1 Month Shop Warranty"],
};
