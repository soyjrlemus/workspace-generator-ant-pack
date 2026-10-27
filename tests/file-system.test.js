import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, stat, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureWritePermission, findExistingDirectory, writeGeneratedFile, friendlyWriteError } from "../public/file-system.js";
import { prepareWorkspace } from "../server/validation.js";

const domError = name => Object.assign(new Error(name), { name });
class Directory {
  constructor(folder, failFile = "") { this.folder = folder; this.failFile = failFile; this.aborted = false; }
  async getDirectoryHandle(name, { create } = {}) {
    const folder = path.join(this.folder, name);
    try {
      if (!(await stat(folder)).isDirectory()) throw domError("TypeMismatchError");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (!create) throw domError("NotFoundError");
      await mkdir(folder);
    }
    return new Directory(folder, this.failFile);
  }
  async getFileHandle(name) {
    const owner = this;
    return { async createWritable() {
      let pending;
      return {
        async write(content) {
          if (name === owner.failFile) throw domError("QuotaExceededError");
          pending = content;
        },
        async close() { await writeFile(path.join(owner.folder, name), pending); },
        async abort() { owner.aborted = true; },
      };
    } };
  }
}
async function fixture(run) {
  const prefix = path.join(tmpdir(), "workspace-generator-qa-");
  const folder = await mkdtemp(prefix);
  try { await run(folder); } finally {
    if (!folder.startsWith(prefix)) throw new Error("Ruta temporal inesperada.");
    await rm(folder, { recursive: true, force: true });
  }
}

test("sobrescritura conserva archivos ajenos en raíz y subcarpetas", async () => fixture(async folder => {
  await mkdir(path.join(folder, "docs"));
  await writeFile(path.join(folder, "conservar.txt"), "NO MODIFICAR");
  await writeFile(path.join(folder, "docs", "notas.txt"), "NOTAS DEL USUARIO");
  await writeFile(path.join(folder, "docs", "README.md"), "versión anterior");
  const files = prepareWorkspace({ name: "qa", templates: ["images", "docs", "config"] }).files;
  const directory = new Directory(folder);
  for (const file of files) await writeGeneratedFile(directory, "qa", file);
  assert.equal(await readFile(path.join(folder, "conservar.txt"), "utf8"), "NO MODIFICAR");
  assert.equal(await readFile(path.join(folder, "docs", "notas.txt"), "utf8"), "NOTAS DEL USUARIO");
  for (const file of files) assert.equal(await readFile(path.join(folder, file.relativePath), "utf8"), file.content);
}));
test("un fallo de escritura aborta el archivo y conserva su contenido anterior", async () => fixture(async folder => {
  await writeFile(path.join(folder, "config.json"), "original");
  const directory = new Directory(folder, "config.json");
  await assert.rejects(writeGeneratedFile(directory, "qa", { relativePath: "config.json", content: "nuevo" }), { name: "QuotaExceededError" });
  assert.equal(directory.aborted, true);
  assert.equal(await readFile(path.join(folder, "config.json"), "utf8"), "original");
}));
test("fallo parcial conserva archivos completados y produce un mensaje entendible", async () => fixture(async folder => {
  const directory = new Directory(folder, "config.json");
  await writeGeneratedFile(directory, "qa", { relativePath: "docs/README.md", content: "completado" });
  await assert.rejects(writeGeneratedFile(directory, "qa", { relativePath: "config.json", content: "{}" }));
  assert.equal(await readFile(path.join(folder, "docs/README.md"), "utf8"), "completado");
  assert.match(friendlyWriteError(domError("QuotaExceededError")), /espacio suficiente/);
  assert.match(friendlyWriteError(new Error()), /archivos ya escritos se conservaron/);
}));
test("permiso denegado se propaga y permiso concedido no vuelve a solicitarse", async () => {
  await assert.rejects(ensureWritePermission({ queryPermission: async () => "prompt", requestPermission: async () => "denied" }), /no concedió permiso/);
  await ensureWritePermission({ queryPermission: async () => "granted", requestPermission: () => { throw new Error("No debe solicitarse"); } });
  assert.match(friendlyWriteError(domError("NotAllowedError")), /denegado/);
});
test("solo NotFound se interpreta como carpeta ausente", async () => {
  assert.equal(await findExistingDirectory({ getDirectoryHandle: async () => { throw domError("NotFoundError"); } }, "qa"), null);
  await assert.rejects(findExistingDirectory({ getDirectoryHandle: async () => { throw domError("NotAllowedError"); } }, "qa"), { name: "NotAllowedError" });
});
test("rutas ajenas al manifiesto no llegan al sistema de archivos", async () => {
  await assert.rejects(writeGeneratedFile({}, "qa", { relativePath: "../ajeno", content: "x" }), /Manifiesto no válido/);
});
