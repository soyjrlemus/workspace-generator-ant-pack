export async function ensureWritePermission(targetDirectory) {
  const current = await targetDirectory.queryPermission({ mode: "readwrite" });
  if (current === "granted") return;
  const permission = await targetDirectory.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    throw new Error("El navegador no concedió permiso para escribir en esa carpeta.");
  }
}

export async function findExistingDirectory(parent, name) {
  try {
    return await parent.getDirectoryHandle(name, { create: false });
  } catch (error) {
    if (error?.name === "NotFoundError") return null;
    throw error;
  }
}

async function openOrCreateSubdirectory(parent, name, relativePath, report) {
  const existing = await findExistingDirectory(parent, name);
  if (existing) {
    report("Carpeta existente conservada", "warning", `${relativePath}/`);
    return existing;
  }
  const created = await parent.getDirectoryHandle(name, { create: true });
  report("Carpeta creada", "success", `${relativePath}/`);
  return created;
}

export async function writeGeneratedFile(rootHandle, projectName, file, report = () => {}) {
  if (!["images/placeholder.svg", "docs/README.md", "config.json"].includes(file.relativePath)
      || typeof file.content !== "string") throw new Error("Manifiesto no válido.");
  const parts = file.relativePath.split("/");
  let parent = rootHandle;
  const relativeDirectories = [];

  for (const folder of parts.slice(0, -1)) {
    relativeDirectories.push(folder);
    parent = await openOrCreateSubdirectory(parent, folder, `${projectName}/${relativeDirectories.join("/")}`, report);
  }

  const filename = parts.at(-1);
  const fileHandle = await parent.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(file.content);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
  report("Archivo generado", "success", `${projectName}/${file.relativePath}`);
}

export function friendlyWriteError(error) {
  if (error?.name === "NotAllowedError") return "El permiso para escribir fue denegado. Selecciona la carpeta e inténtalo otra vez.";
  if (error?.name === "QuotaExceededError") return "No hay espacio suficiente para completar la estructura.";
  if (error instanceof Error && error.message.startsWith("El navegador")) return error.message;
  if (error instanceof Error && error.message.startsWith("No se pudo conectar")) return error.message;
  if (error?.message === "Manifiesto no válido.") return "La API devolvió archivos no válidos. No se inició la escritura.";
  return "La creación se detuvo. Revisa los permisos; los archivos ya escritos se conservaron.";
}
