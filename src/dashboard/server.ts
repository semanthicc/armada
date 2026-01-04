import { serve, type Server } from "bun";
import { handleRequest } from "./api";
import { join, extname } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import type { SemanthiccContext } from "../context";

let server: Server<any> | null = null;

export function startDashboard(
  port: number = 4567, 
  projectId: number | null = null,
  context?: SemanthiccContext
): string {
  if (server) {
    return `Dashboard already running at ${server.url}`;
  }

  server = serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      
      if (url.pathname.startsWith("/api")) {
        return handleRequest(req, projectId, context);
      }
      
      const staticPath = join(import.meta.dir, "static", url.pathname === "/" ? "index.html" : url.pathname.slice(1));
      
      if (existsSync(staticPath) && !url.pathname.endsWith("/")) {
        try {
          const content = readFileSync(staticPath);
          const ext = extname(staticPath);
          const type = getMimeType(ext);
          return new Response(content, {
            headers: { "Content-Type": type },
          });
        } catch {}
      }

      return new Response(getHtml(), {
        headers: { "Content-Type": "text/html" },
      });
    },
  });

  return `Dashboard started at ${server.url}`;
}

export function stopDashboard(): string {
  if (server) {
    server.stop();
    server = null;
    return "Dashboard stopped";
  }
  return "Dashboard not running";
}

function getHtml(): string {
  const htmlPath = join(import.meta.dir, "static", "index.html");
  if (existsSync(htmlPath)) {
    return readFileSync(htmlPath, "utf-8");
  }
  
  return `
    <!DOCTYPE html>
    <html>
      <head><title>Semanthicc Dashboard</title></head>
      <body>
        <h1>Semanthicc Dashboard</h1>
        <p>Error: static/index.html not found.</p>
      </body>
    </html>
  `;
}

function getMimeType(ext: string): string {
  switch (ext) {
    case ".html": return "text/html";
    case ".js": return "text/javascript";
    case ".css": return "text/css";
    case ".json": return "application/json";
    case ".png": return "image/png";
    case ".jpg": return "image/jpeg";
    case ".svg": return "image/svg+xml";
    case ".ico": return "image/x-icon";
    default: return "application/octet-stream";
  }
}
