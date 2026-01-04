import { serve, type Server } from "bun";
import { handleRequest } from "./api";
import { join } from "node:path";
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
      
      if (url.pathname === "/favicon.ico") {
        return new Response(null, { status: 404 });
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
