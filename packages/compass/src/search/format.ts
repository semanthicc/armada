import type { SearchResult, SearchResponse } from "./search";

export interface FormattedSearchResult {
  file: string;
  lines: string;
  similarity: string;
  preview: string;
  projectName?: string;
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
      projectName: result.projectName,
    };
  });
}

export function formatSearchResultsForTool(response: SearchResponse): string {
  if (response.results.length === 0) {
    return "No results found.";
  }
  
  const formatted = formatSearchResults(response.results);
  const searchInfo = `[${response.searchType}${response.ftsIndexed ? " + FTS" : ""}]`;
  
  return `${searchInfo} Found ${response.results.length} results:\n\n` + formatted
    .map((r, i) => {
      const projectPrefix = r.projectName ? `[${r.projectName}] ` : "";
      return `**${i + 1}. ${projectPrefix}${r.file}** (lines ${r.lines}, ${r.similarity} match)
\`\`\`
${r.preview}
\`\`\``;
    })
    .join("\n\n");
}
