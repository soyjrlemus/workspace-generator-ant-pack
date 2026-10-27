import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { createAppServer } from "../server/index.js";
import { prepareWorkspace, validateProjectName } from "../server/validation.js";
import { validateManifest } from "../public/manifest.js";

const valid = { name: "demo-qa", author: "Equipo", templates: ["images", "docs", "config"] };
let server, base;
before(async () => {
  server = createAppServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

test("rechaza traversal, dispositivos y caracteres prohibidos", () => {
  for (const name of ["../x", "..", "a/b", "a\\b", "CON.txt", "LPT1", "abc.", " a", "a:stream"]) {
    assert.ok(validateProjectName(name), name);
  }
  assert.equal(validateProjectName("campaña-2026"), "");
});
test("valida la estructura del JSON, autor y plantillas", () => {
  for (const input of [null, [], 42, {}, { ...valid, author: {} }, { ...valid, templates: ["docs", "docs"] },
    { ...valid, templates: ["unknown"] }, { ...valid, templates: Array(10000).fill("docs") }]) {
    assert.throws(() => prepareWorkspace(input));
  }
});
test("escapa XML y Markdown y conserva JSON estructurado", () => {
  const manifest = prepareWorkspace({ ...valid, name: "A&B", author: '<img src=x onerror=alert(1)> [link](https://example.com)' });
  const svg = manifest.files.find(f => f.relativePath.endsWith(".svg")).content;
  const readme = manifest.files.find(f => f.relativePath.endsWith(".md")).content;
  assert.ok(svg.includes("A&amp;B"));
  assert.ok(!readme.includes("<img"));
  assert.ok(readme.includes("&lt;img"));
  assert.equal(JSON.parse(manifest.files[2].content).name, "A&B");
});
test("el navegador rechaza rutas, duplicados y contenidos no esperados", () => {
  const manifest = prepareWorkspace(valid);
  assert.equal(validateManifest(manifest, valid.name, valid.templates), manifest);
  for (const path of ["../secret.txt", "/secret", "docs/../../secret", "other.txt"]) {
    assert.throws(() => validateManifest({ ...manifest, files: [{ relativePath: path, content: "x" }] }, valid.name, ["docs"]));
  }
  assert.throws(() => validateManifest({ ...manifest, files: [manifest.files[0], manifest.files[0]] }, valid.name, ["images", "docs"]));
});
test("API válida genera tres archivos", async () => {
  const response = await fetch(base + "/api/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valid) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).files.length, 3);
});
test("JSON inválido y null responden 400", async () => {
  for (const body of ["{broken", "null"]) {
    const response = await fetch(base + "/api/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    assert.equal(response.status, 400);
    assert.ok(!(await response.text()).includes("TypeError"));
  }
});
test("payload excesivo responde 413", async () => {
  const response = await fetch(base + "/api/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "á".repeat(33000) }) });
  assert.equal(response.status, 413);
});
test("bloquea solicitudes de otros sitios y tipos de contenido", async () => {
  let response = await fetch(base + "/api/prepare", { method: "POST", headers: { Origin: "https://other.example", "Content-Type": "application/json" }, body: JSON.stringify(valid) });
  assert.equal(response.status, 403);
  response = await fetch(base + "/api/prepare", { method: "POST", body: "{}" });
  assert.equal(response.status, 415);
});
test("bloquea host de DNS rebinding", async () => {
  const status = await new Promise((resolve, reject) => {
    const req = request(base + "/", { headers: { Host: "attacker.example" } }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(status, 403);
});
test("URL malformada no detiene el servidor", async () => {
  const response = await fetch(base + "/%E0%A4%A");
  assert.equal(response.status, 400);
  assert.equal((await fetch(base + "/api/health")).status, 200);
});
test("solo sirve recursos permitidos y añade cabeceras", async () => {
  for (const url of ["/server/index.js", "/%2e%2e%5cserver%5cindex.js", "/package.json"]) {
    assert.equal((await fetch(base + url)).status, 404);
  }
  const response = await fetch(base + "/");
  assert.ok(response.headers.get("content-security-policy").includes("frame-ancestors 'none'"));
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await fetch(base + "/manifest.js")).status, 200);
});

test("comprime texto, respeta q=0 y revalida por ETag", async () => {
  const response = await fetch(base + "/app.js", { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(response.headers.get("content-encoding"), "gzip");
  assert.ok((await response.text()).includes("validateManifest"));
  const cached = await fetch(base + "/app.js", { headers: {
    "Accept-Encoding": "gzip", "If-None-Match": response.headers.get("etag"),
  } });
  assert.equal(cached.status, 304);
  const raw = await fetch(base + "/app.js", { headers: { "Accept-Encoding": "gzip;q=0" } });
  assert.equal(raw.headers.get("content-encoding"), null);
});

test("carga inicial con fuente local pesa menos de 75 KB de contenido", async () => {
  const resources = ["/", "/styles.css", "/app.js", "/manifest.js", "/activity-store.js", "/file-system.js", "/fonts/inter-latin.woff2", "/api/health"];
  let transferred = 0;
  const measurements = [];
  for (const resource of resources) {
    const response = await fetch(base + resource, { headers: { "Accept-Encoding": "gzip" } });
    assert.equal(response.status, 200);
    const raw = (await response.arrayBuffer()).byteLength;
    const bytes = Number(response.headers.get("content-length")) || raw;
    transferred += bytes;
    measurements.push({ resource, decodedBytes: raw, transferredBytes: bytes });
    if (resource.endsWith(".woff2")) assert.equal(response.headers.get("content-type"), "font/woff2");
  }
  console.log(JSON.stringify({ measurements, transferredBytes: transferred }));
  assert.ok(transferred < 75000, String(transferred));
});
