/**
 * Simple message parser for order requests
 * Parses customer messages to extract medicine items and quantities
 */

export interface ParsedItem {
  name: string;
  quantity: number;
  raw: string;
}

export interface ParseResult {
  items: ParsedItem[];
  requiresRx: boolean;
}

// Common Rx drug keywords - expand based on Indian pharma regulations
const RX_KEYWORDS = [
  // Antibiotics
  'antibiotic',
  'amoxicillin',
  'azithromycin',
  'ciprofloxacin',
  'levofloxacin',
  'cefixime',
  'ofloxacin',
  'metronidazole',
  'doxycycline',
  // Steroids
  'steroid',
  'prednisolone',
  'dexamethasone',
  'betamethasone',
  // Diabetes
  'insulin',
  'metformin',
  'glimepiride',
  // Sedatives/Sleep
  'sleeping',
  'alprazolam',
  'diazepam',
  'clonazepam',
  'zolpidem',
  // Pain/Opioids
  'tramadol',
  'codeine',
  'morphine',
  // Blood Pressure
  'amlodipine',
  'losartan',
  'telmisartan',
  'atenolol',
  // Mental Health
  'antidepressant',
  'sertraline',
  'fluoxetine',
  'escitalopram',
  // Others requiring prescription
  'schedule h',
  'schedule h1',
  'schedule x',
];

/**
 * Parse order message to extract items
 */
export function parseOrderMessage(message: string): ParseResult {
  const items: ParsedItem[] = [];

  // Normalize message
  const normalized = message
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Split by common delimiters (newlines, commas, semicolons)
  const lines = normalized
    .split(/[,;\n]/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    const parsed = parseLineItem(line);
    if (parsed) {
      items.push(parsed);
    }
  }

  // Check if any items might require prescription
  const requiresRx = checkRxRequirement(items);

  return { items, requiresRx };
}

/**
 * Parse a single line item
 */
function parseLineItem(line: string): ParsedItem | null {
  // Skip very short lines (likely noise)
  if (line.length < 2) {
    return null;
  }

  // Remove bullet points, numbers at start
  let cleaned = line
    .replace(/^[\s\-•*·→]+/, '')
    .replace(/^\d+[.):\s]+/, '')
    .trim();

  if (!cleaned) {
    return null;
  }

  // Try to extract quantity patterns
  // Patterns: "x10", "× 10", "10 pcs", "2 strips", "10 tablets", etc.
  const quantityPatterns = [
    /[x×]\s*(\d+)/i,                          // x10, × 10
    /(\d+)\s*(pcs?|pieces?)/i,                 // 10 pcs
    /(\d+)\s*(strips?)/i,                      // 2 strips
    /(\d+)\s*(tablets?|tabs?)/i,               // 10 tablets
    /(\d+)\s*(bottles?)/i,                     // 1 bottle
    /(\d+)\s*(units?)/i,                       // 5 units
    /(\d+)\s*(boxes?)/i,                       // 2 boxes
    /(\d+)\s*(packets?|packs?)/i,              // 3 packets
    /[-–]\s*(\d+)/,                            // - 10
    /(\d+)\s*$/,                               // trailing number
  ];

  let quantity = 1;
  let name = cleaned;

  for (const pattern of quantityPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const parsedQty = parseInt(match[1], 10);
      if (parsedQty > 0 && parsedQty <= 100) { // Sanity check
        quantity = parsedQty;
        // Remove quantity part from name
        name = cleaned.replace(pattern, '').trim();
        break;
      }
    }
  }

  // Clean up remaining noise
  name = name
    .replace(/^[\s\-•*·→]+/, '')
    .replace(/[\s\-•*·→]+$/, '')
    .trim();

  if (!name) {
    return null;
  }

  return {
    name,
    quantity,
    raw: line,
  };
}

/**
 * Check if any items might require prescription
 */
export function checkRxRequirement(items: ParsedItem[]): boolean {
  const allText = items.map((i) => i.name.toLowerCase()).join(' ');

  return RX_KEYWORDS.some((keyword) => allText.includes(keyword.toLowerCase()));
}

/**
 * Format items for display in WhatsApp message
 */
export function formatItemsForDisplay(items: ParsedItem[]): string {
  if (items.length === 0) {
    return 'No items found';
  }

  return items
    .map((item, idx) => {
      const qty = item.quantity > 1 ? ` x ${item.quantity}` : '';
      return `${idx + 1}. ${item.name}${qty}`;
    })
    .join('\n');
}
