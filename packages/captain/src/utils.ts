// Normalizes AI input like "a, b", "[a, b]" → ["a", "b"]
// Preserves bracket groups for tags: "commit, [staged, changes]" → ["commit", "[staged, changes]"]
// Rejects if AI passes the param name as value (e.g., shortcuts: "shortcuts")
export function normalizeArrayInput(input: string | undefined, paramName?: string): string[] {
  if (!input || !input.trim()) return [];
  
  let cleaned = input.trim();
  
  // Only strip outer brackets if they wrap a SIMPLE list (no nested brackets inside)
  // "[a, b]" → "a, b" but "[a, b], [c, d]" stays as-is
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    const inner = cleaned.slice(1, -1);
    if (!inner.includes('[') && !inner.includes(']')) {
      cleaned = inner;
    }
  }
  
  const result: string[] = [];
  let current = '';
  let bracketDepth = 0;
  
  for (const char of cleaned) {
    if (char === '[') { bracketDepth++; current += char; }
    else if (char === ']') { bracketDepth--; current += char; }
    else if (char === ',' && bracketDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) result.push(trimmed);
      current = '';
    } else { current += char; }
  }
  
  const lastTrimmed = current.trim();
  if (lastTrimmed) result.push(lastTrimmed);
  
  return result.filter(item => 
    item && item !== '[]' && item !== '[ ]' && 
    !(paramName && item.toLowerCase() === paramName.toLowerCase())
  );
}
