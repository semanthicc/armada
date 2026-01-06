const ERROR_PATTERNS = [
  /^Error:/im,
  /\bfailed\s+(to|with)\b/i,
  /\bnot found\b/i,
  /\bno such file\b/i,
  /\bpermission denied\b/i,
  /\baccess denied\b/i,
  /\bsyntax error\b/i,
  /\bunexpected token\b/i,
  /\bexception\b/i,
  /\bstack trace\b/i,
  /\btimeout\b.*\b(exceeded|expired)\b/i,
  /\bconnection refused\b/i,
  /\bEACCES\b/,
  /\bENOENT\b/,
  /\bEPERM\b/,
  /at \w+\.\w+ \(/,  // JS stack trace pattern
];

const TITLE_ERROR_KEYWORDS = ["error", "failed", "failure", "denied", "timeout"];

export function isToolError(output: string, title?: string): boolean {
  if (!output) return false;

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(output)) return true;
  }

  if (title) {
    const lowerTitle = title.toLowerCase();
    for (const keyword of TITLE_ERROR_KEYWORDS) {
      if (lowerTitle.includes(keyword)) return true;
    }
  }

  return false;
}
