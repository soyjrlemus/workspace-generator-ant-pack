import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareWorkspace } from "./validation.js";

const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/manifest.js", ["manifest.js", "text/javascript; charset=utf-8"]],
  ["/activity-store.js", ["activity-store.js", "text/javascript; charset=utf-8"]],
  ["/file-system.js", ["file-system.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/fonts/inter-latin.woff2", ["fonts/inter-latin.woff2", "font/woff2"]],
  ["/fonts/OFL.txt", ["fonts/OFL.txt", "text/plain; charset=utf-8"]],
]);
const assetCache = new Map();

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const body = await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let exceeded = false;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > 32768) {
        if (!exceeded) reject(Object.assign(new Error("La solicitud es demasiado grande."), { status: 413 }));
        exceeded = true;
        chunks.length = 0;
      } else if (!exceeded) chunks.push(chunk);
    });
    request.on("end", () => { if (!exceeded) resolve(Buffer.concat(chunks).toString("utf8")); });
    request.on("error", reject);
    request.on("aborted", () => reject(new Error("Solicitud interrumpida.")));
  });
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("La solicitud debe contener JSON válido.");
  }
}

export function createAppServer() {
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const host = request.headers.host;
      if (!/^(localhost|127\.0\.0\.1):[0-9]+$/.test(host || "")) {
        sendJson(response, 403, { error: "Host no permitido." });
        return;
      }
      const origin = request.headers.origin;
      if ((origin && origin !== `http://${host}`) || request.headers["sec-fetch-site"] === "cross-site") {
        sendJson(response, 403, { error: "Origen no permitido." });
        return;
      }
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
      } catch {
        sendJson(response, 400, { error: "URL no válida." });
        return;
      }
      if (request.method === "GET" && pathname === "/api/health") {
        sendJson(response, 200, { status: "ok", service: "workspace-generator" });
        return;
      }
      if (request.method === "POST" && pathname === "/api/prepare") {
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) {
          sendJson(response, 415, { error: "Usa application/json." });
          return;
        }
        try {
          sendJson(response, 200, prepareWorkspace(await readJson(request)));
        } catch (error) {
          if (error.status === 413) response.shouldKeepAlive = false;
          sendJson(response, error.status || 400, { error: error.message });
        }
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        sendJson(response, 405, { error: "Método no permitido." });
        return;
      }
      const asset = assets.get(pathname);
      if (!asset) {
        sendJson(response, 404, { error: "No se encontró el recurso." });
        return;
      }
      const filename = path.join(publicDirectory, asset[0]);
      const metadata = await stat(filename);
      let cached = assetCache.get(filename);
      if (!cached || cached.modified !== metadata.mtimeMs) {
        const raw = await readFile(filename);
        cached = { raw, compressed: asset[1].startsWith("text/") ? gzipSync(raw) : null,
          modified: metadata.mtimeMs, hash: createHash("sha256").update(raw).digest("hex").slice(0, 20) };
        assetCache.set(filename, cached);
      }
      const gzipAccepted = (request.headers["accept-encoding"] || "").split(",")
        .some(value => /^gzip(?:;|$)/i.test(value.trim()) && !/;\s*q=0(?:\.0*)?\s*$/i.test(value));
      const compressed = gzipAccepted && cached.compressed;
      const etag = `"${cached.hash}-${compressed ? "gzip" : "raw"}"`;
      response.setHeader("Cache-Control", asset[1] === "font/woff2" ? "public, max-age=86400" : "no-cache");
      response.setHeader("ETag", etag);
      response.setHeader("Vary", "Accept-Encoding");
      if (request.headers["if-none-match"] === etag) {
        response.writeHead(304);
        response.end();
        return;
      }
      const content = compressed || cached.raw;
      if (compressed) response.setHeader("Content-Encoding", "gzip");
      response.writeHead(200, { "Content-Type": asset[1], "Content-Length": content.length });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch {
      if (!response.headersSent) sendJson(response, 500, { error: "No se pudo completar la solicitud." });
      else response.end();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 50;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4173;
  createAppServer().listen(port, "127.0.0.1", () => {
    console.log(`Workspace Generator disponible en http://localhost:${port}`);
  });
}
