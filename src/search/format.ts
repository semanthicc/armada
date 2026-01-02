import type { SearchResult } from "./search";

export interface FormattedSearchResult {
  file: string;
  lines: string;
  similarity: string;
  preview: string;
}

export function formatSearchResults(
  results: SearchResult[],
  options: { maxPreviewLines?: number } = {}
): FormattedSearchResult[] {
  const { maxPreviewLines = 5 } = options;
  
  return results.map(result => {
    const lines = result.content.split("\n");
    const preview = lines.slice(0, maxPreviewLines).join("\n");
    const truncated = lines.length > maxPreviewLines ? "..." : "";
    
    return {
      file: result.filePath,
      lines: `${result.chunkStart}-${result.chunkEnd}`,
      similarity: (result.similarity * 100).toFixed(1) + "%",
      preview: preview + truncated,
    };
  });
}

export function formatSearchResultsForTool(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No results found.";
  }
  
  const formatted = formatSearchResults(results);
  
  return formatted
    .map((r, i) => {
      return `**${i + 1}. ${r.file}** (lines ${r.lines}, ${r.similarity} match)
\`\`\`
${r.preview}
\`\`\``;
    })
    .join("\n\n");
}
