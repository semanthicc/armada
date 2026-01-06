import { logger } from './logger';
import { parseOrderArgs } from './scrolls';

const parseWorkflowArgs = parseOrderArgs;

export interface TokenizedMention {
  name: string;
  force: boolean;
  args: Record<string, string>;
}

export class MarkdownAwareTokenizer {
  static tokenize(text: string): TokenizedMention[] {
    const mentions: TokenizedMention[] = [];
    const seen = new Set<string>();
    const len = text.length;

    let inBacktick = false;
    let inFence = false;
    let inWorkflowTag = 0; // Track nesting depth of <workflow> tags
    let i = 0;

    while (i < len) {
      const char = text[i];
      const next = text[i + 1];
      const next2 = text[i + 2];

      // Track <workflow> tag state - don't expand mentions inside already-expanded workflows
      if (char === '<' && text.substring(i, i + 10) === '<workflow ') {
        inWorkflowTag++;
        i += 10;
        continue;
      }
      if (char === '<' && text.substring(i, i + 11) === '</workflow>') {
        inWorkflowTag = Math.max(0, inWorkflowTag - 1);
        i += 11;
        continue;
      }

      // Track code fence state (```)
      if (char === '`' && next === '`' && next2 === '`') {
        inFence = !inFence;
        i += 3;
        continue;
      }

      // Track inline code state (`) - only outside fences
      if (char === '`' && !inFence) {
        inBacktick = !inBacktick;
        i++;
        continue;
      }

      // Skip everything inside code or workflow tags
      if (inFence || inBacktick || inWorkflowTag > 0) {
        i++;
        continue;
      }

      // Detect workflow mention: //
      if (char === '/' && next === '/') {
        const parsed = this.tryParseMention(text, i);
        if (parsed && !seen.has(parsed.name)) {
          seen.add(parsed.name);
          const { endPos, ...mention } = parsed;
          mentions.push(mention);
          logger.trace({
            phase: 'tokenize',
            message: 'Found mention',
            data: { name: mention.name, position: i }
          });
        }
        if (parsed) {
          i = parsed.endPos;
          continue;
        }
      }

      i++;
    }

    return mentions;
  }

  private static tryParseMention(
    text: string,
    start: number
  ): (TokenizedMention & { endPos: number }) | null {
    // Negative lookbehind: not preceded by : or word char or /
    if (start > 0) {
      const prev = text[start - 1];
      if (/[:\w/]/.test(prev)) return null;
    }

    let i = start + 2; // Skip //

    // First char must be letter or number (Unicode aware)
    if (i >= text.length) return null;
    const firstChar = text[i];
    if (!/[\p{L}\p{N}]/u.test(firstChar)) return null;

    const nameStart = i;

    // Consume valid name chars: letters, numbers, underscore, hyphen
    while (i < text.length && /[\p{L}\p{N}_-]/u.test(text[i])) {
      i++;
    }

    const name = text.substring(nameStart, i);
    let args: Record<string, string> = {};
    let force = false;

    // Parse args (...) if present
    if (text[i] === '(') {
      const closeIdx = text.indexOf(')', i);
      if (closeIdx > -1) {
        const argsString = text.substring(i + 1, closeIdx);
        args = parseWorkflowArgs(argsString);
        i = closeIdx + 1;
      }
    }

    // Check for force flag !
    if (text[i] === '!') {
      force = true;
      i++;
    }

    return { name, force, args, endPos: i };
  }
}
