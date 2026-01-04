import { getStatus } from "../status";
import { listMemories } from "../heuristics/repository";
import { searchCode } from "../search/search";
import { getDb } from "../db";
import type { SemanthiccContext } from "../context";

function getContext(): SemanthiccContext {
  return { db: getDb() };
}

export async function handleRequest(
  req: Request, 
  projectId: number | null,
  context?: SemanthiccContext
): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace("/api", "");
  const ctx = context || getContext();

  try {
    if (path === "/status") {
      const status = getStatus(ctx, projectId);
      return Response.json(status);
    }

    if (path === "/memories") {
      const memories = listMemories(ctx, {
        projectId,
        includeGlobal: true,
        limit: 100,
        conceptTypes: ["pattern", "rule", "constraint", "decision", "context", "learning"],
      });
      return Response.json(memories);
    }

    if (path === "/search") {
      const query = url.searchParams.get("q");
      if (!query) {
        return Response.json({ error: "Query required" }, { status: 400 });
      }
      if (!projectId) {
        return Response.json({ error: "Project context required for search" }, { status: 400 });
      }
      const results = await searchCode(ctx, query, projectId, 10);
      return Response.json(results);
    }

    return new Response("Not Found", { status: 404 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
