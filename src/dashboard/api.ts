import { getStatus, getIndexCoverage } from "../status";
import { listMemories, deleteMemory, updateMemory, findDuplicates, purgeDuplicates, restoreMemory } from "../heuristics/repository";
import { searchCode } from "../search/search";
import { getDb } from "../db";
import type { SemanthiccContext } from "../context";
import { log } from "../logger";
import { indexProject } from "../indexer";
import { deleteAllEmbeddings } from "../lance/embeddings";
import { loadConfig, loadGlobalConfig, updateGlobalEmbeddingConfig, clearConfigCache, type EmbeddingConfig } from "../config";
import { setEmbeddingConfig } from "../embeddings/embed";
import { deleteEmbeddingConfig, validateEmbeddingConfig, EmbeddingConfigMismatchError } from "../embeddings/config-store";

function getContext(): SemanthiccContext {
  return { db: getDb() };
}

const activeIndexers = new Map<number, AbortController>();

export async function handleRequest(
  req: Request, 
  projectId: number | null,
  context?: SemanthiccContext
): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace("/api", "");
  const ctx = context || getContext();
  
  log.api.info(`${req.method} ${path} (projectId: ${projectId})`);

  try {
    if (path === "/status") {
      const status = getStatus(ctx, projectId);
      let coverage = null;
      let embeddingWarning = null;
      
      if (status.projectPath && projectId) {
        coverage = await getIndexCoverage(status.projectPath, projectId);
        
        const globalConfig = loadGlobalConfig();
        const currentEmbedding = globalConfig.embedding ?? { provider: "local" };
        const mismatch = validateEmbeddingConfig(projectId, currentEmbedding);
        if (mismatch) {
          const error = new EmbeddingConfigMismatchError(mismatch);
          embeddingWarning = {
            type: "config_mismatch",
            message: error.message,
            storedProvider: mismatch.stored.provider,
            storedDimensions: mismatch.stored.dimensions,
            currentProvider: mismatch.current.provider,
            currentDimensions: mismatch.current.dimensions,
          };
        }
      }
      
      return Response.json({ ...status, coverage, embeddingWarning });
    }

    if (path === "/projects") {
      const projects = ctx.db.prepare(`
        SELECT p.id, p.name, p.path, p.last_indexed_at,
               (SELECT COUNT(*) FROM file_hashes WHERE project_id = p.id) as indexed_files
        FROM projects p
        ORDER BY p.last_indexed_at DESC NULLS LAST
      `).all() as Array<{ id: number; name: string; path: string; last_indexed_at: number | null; indexed_files: number }>;
      
      return Response.json(projects);
    }

    if (path === "/memories") {
      log.api.debug(`GET /memories - projectId=${projectId}`);
      const memories = listMemories(ctx, {
        projectId,
        includeGlobal: true,
        limit: 100,
        conceptTypes: ["pattern", "rule", "constraint", "decision", "context", "learning"],
      });
      log.api.debug(`Returning ${memories.length} memories`);
      const projectCount = memories.filter((m: { project_id: number | null }) => m.project_id !== null).length;
      const globalCount = memories.filter((m: { project_id: number | null }) => m.project_id === null).length;
      log.api.debug(`Project: ${projectCount}, Global: ${globalCount}`);
      return Response.json(memories);
    }

    if (req.method === "DELETE" && path.startsWith("/memories/")) {
      const idStr = path.split("/")[2];
      const id = parseInt(idStr || "");
      log.api.debug(`DELETE memory: idStr="${idStr}", parsed id=${id}`);
      if (isNaN(id)) {
        log.api.warn(`Invalid ID, returning 400`);
        return Response.json({ error: "Invalid ID" }, { status: 400 });
      }
      const deleted = deleteMemory(ctx, id);
      log.api.info(`deleteMemory result: ${deleted}`);
      return Response.json({ success: deleted, id });
    }

    if (req.method === "POST" && path.match(/^\/memories\/\d+\/restore$/)) {
      const idStr = path.split("/")[2];
      const id = parseInt(idStr || "");
      log.api.debug(`RESTORE memory: id=${id}`);
      if (isNaN(id)) {
        return Response.json({ error: "Invalid ID" }, { status: 400 });
      }
      const restored = restoreMemory(ctx, id);
      log.api.info(`restoreMemory result: ${restored}`);
      return Response.json({ success: restored });
    }

    if (req.method === "PUT" && path.startsWith("/memories/")) {
      const idStr = path.split("/")[2];
      const id = parseInt(idStr || "");
      log.api.debug(`PUT memory: idStr="${idStr}", parsed id=${id}`);
      if (isNaN(id)) {
        return Response.json({ error: "Invalid ID" }, { status: 400 });
      }
      const body = await req.json() as { content?: string; concept_type?: string; domain?: string | null; confidence?: number };
      log.api.debug(`PUT body:`, body);
      const updated = updateMemory(ctx, id, body);
      log.api.info(`updateMemory result: ${updated}`);
      return Response.json({ success: updated });
    }

    if (path === "/duplicates" && req.method === "GET") {
      const duplicates = findDuplicates(ctx, projectId);
      log.api.info(`Found ${duplicates.length} duplicate groups`);
      return Response.json(duplicates);
    }

    if (path === "/duplicates" && req.method === "DELETE") {
      const deleted = purgeDuplicates(ctx, projectId);
      log.api.info(`Purged ${deleted} duplicates`);
      return Response.json({ deleted });
    }

    if (path === "/search") {
      const query = url.searchParams.get("q");
      if (!query) {
        return Response.json({ error: "Query required" }, { status: 400 });
      }
      if (!projectId) {
        return Response.json({ error: "Project context required for search" }, { status: 400 });
      }
      const fileFilter = url.searchParams.get("filter") as "code" | "docs" | "all" | null;
      const useHybrid = url.searchParams.get("hybrid") !== "false";
      const response = await searchCode(ctx, query, projectId, { 
        limit: 10, 
        fileFilter: fileFilter ?? "all",
        useHybrid 
      });
      log.api.info(`Search completed: ${response.results.length} results, type=${response.searchType}, ftsIndexed=${response.ftsIndexed}`);
      return Response.json(response);
    }

    if (path === "/index" && req.method === "POST") {
      if (!projectId) {
        return Response.json({ error: "Project context required" }, { status: 400 });
      }
      const project = ctx.db.prepare("SELECT path, name FROM projects WHERE id = ?").get(projectId) as { path: string; name: string } | null;
      if (!project) {
        return Response.json({ error: "Project not found" }, { status: 404 });
      }
      
      const force = url.searchParams.get("force") === "true";
      if (force) {
        log.api.info(`Force reindex requested - clearing existing embeddings`);
        await deleteAllEmbeddings(projectId);
        deleteEmbeddingConfig(projectId);
        ctx.db.prepare("DELETE FROM file_hashes WHERE project_id = ?").run(projectId);
      }

      // Cancel existing indexing job if any
      if (activeIndexers.has(projectId)) {
        log.api.info(`Cancelling existing indexing job for project ${projectId}`);
        activeIndexers.get(projectId)!.abort();
        activeIndexers.delete(projectId);
      }

      const controller = new AbortController();
      activeIndexers.set(projectId, controller);

      const stream = new ReadableStream({
        async start(controllerStream) {
          const encoder = new TextEncoder();
          const send = (data: any) => {
            controllerStream.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          try {
            log.api.info(`Starting index for project ${projectId}: ${project.path}`);
            const result = await indexProject(ctx, project.path, { 
              projectName: project.name,
              onProgress: (p) => send({ type: "progress", ...p }),
              signal: controller.signal
            });
            log.api.info(`Index complete: ${result.filesIndexed} files, ${result.chunksCreated} chunks`);
            send({ type: "complete", result });
          } catch (e) {
            if (e instanceof Error && e.message === "Indexing aborted") {
              log.api.info(`Indexing aborted for project ${projectId}`);
              send({ type: "aborted" });
            } else {
              log.api.error(`Index failed:`, e);
              send({ type: "error", error: e instanceof Error ? e.message : String(e) });
            }
          } finally {
            activeIndexers.delete(projectId);
            controllerStream.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    if (path === "/index/stop" && req.method === "POST") {
      if (!projectId) {
        return Response.json({ error: "Project context required" }, { status: 400 });
      }
      
      if (activeIndexers.has(projectId)) {
        log.api.info(`Stopping indexing for project ${projectId}`);
        activeIndexers.get(projectId)!.abort();
        activeIndexers.delete(projectId);
        return Response.json({ success: true, message: "Indexing aborted" });
      }
      
      return Response.json({ success: false, message: "No active indexing job found" });
    }

    if (path === "/index" && req.method === "DELETE") {
      if (!projectId) {
        return Response.json({ error: "Project context required" }, { status: 400 });
      }
      log.api.info(`Deleting index for project ${projectId}`);
      await deleteAllEmbeddings(projectId);
      deleteEmbeddingConfig(projectId);
      ctx.db.prepare("DELETE FROM file_hashes WHERE project_id = ?").run(projectId);
      ctx.db.prepare("UPDATE projects SET chunk_count = 0, last_indexed_at = NULL WHERE id = ?").run(projectId);
      log.api.info(`Index deleted for project ${projectId}`);
      return Response.json({ success: true });
    }

    if (path === "/config" && req.method === "GET") {
      let config;
      if (projectId) {
        const project = ctx.db.prepare("SELECT path FROM projects WHERE id = ?").get(projectId) as { path: string } | null;
        config = project ? loadConfig(project.path) : loadGlobalConfig();
      } else {
        config = loadGlobalConfig();
      }
      const safeConfig = {
        embedding: {
          provider: config.embedding?.provider ?? "local",
          geminiModel: config.embedding?.geminiModel ?? "gemini-embedding-001",
          dimensions: config.embedding?.dimensions,
          hasApiKey: !!config.embedding?.geminiApiKey,
        }
      };
      return Response.json(safeConfig);
    }

    if (path === "/config" && req.method === "PUT") {
      const body = await req.json() as { embedding?: EmbeddingConfig };
      if (body.embedding) {
        updateGlobalEmbeddingConfig(body.embedding);
        clearConfigCache();
        setEmbeddingConfig(body.embedding);
        log.api.info(`Updated global embedding config`);
      }
      return Response.json({ success: true });
    }

    log.api.warn(`No route matched for: ${req.method} ${path}`);
    return new Response("Not Found", { status: 404 });
  } catch (e) {
    log.api.error(`Error:`, e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
