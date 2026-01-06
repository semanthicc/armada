export function shortId(messageID: string, salt: string = '', expansionChain: string[] = []): string {
  const chainKey = expansionChain.join('/');
  const input = `${messageID}:${salt}:${chainKey}`;
  
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    hash = hash >>> 0;
  }
  
  return hash.toString(36);
}

export function showToast(
  ctx: unknown,
  message: string,
  variant: 'success' | 'info' | 'warning' | 'error' = 'info',
  title?: string
): void {
  const app = ctx as { toast?: (opts: { title: string; message: string; variant?: string }) => void };
  app.toast?.({ title: title || 'Workflows', message, variant });
}
