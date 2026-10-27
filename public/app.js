import { ensureWritePermission, findExistingDirectory, writeGeneratedFile, friendlyWriteError } from "./file-system.js";
import { validateManifest } from "./manifest.js";
import { createActivityStore } from "./activity-store.js";

let sessionStorageHandle;
try { sessionStorageHandle = window.sessionStorage; } catch { /* Logging still works in memory. */ }
const activityStore = createActivityStore(sessionStorageHandle);

const form = document.querySelector("#workspace-form");
const chooseDirectoryButton = document.querySelector("#choose-directory");
const createButton = document.querySelector("#create-workspace");
const projectNameInput = document.querySelector("#project-name");
const authorInput = document.querySelector("#author");
const directoryName = document.querySelector("#destination-name");
const directoryHelp = document.querySelector("#destination-help");
const directoryError = document.querySelector("#directory-error");
const nameError = document.querySelector("#name-error");
const templatesError = document.querySelector("#templates-error");
const formError = document.querySelector("#form-error");
const previewRootName = document.querySelector("#preview-root-name");
const previewTree = document.querySelector("#preview-tree");
const previewCount = document.querySelector("#preview-count");
const activityList = document.querySelector("#activity-list");
const activityEmpty = document.querySelector("#activity-empty");
const activityCount = document.querySelector("#activity-count");
const progressWrap = document.querySelector("#progress-wrap");
const progressText = document.querySelector("#progress-text");
const progressPercent = document.querySelector("#progress-percent");
const progressBar = document.querySelector("#progress-bar");
const collisionDialog = document.querySelector("#collision-dialog");
const collisionName = document.querySelector("#collision-name");
const resultPanel = document.querySelector("#result-panel");
const resultDescription = document.querySelector("#result-description");
const resultFiles = document.querySelector("#result-files");

const invalidNameCharacters = /[<>:"/\\|?*\u0000-\u001F]/;
const reservedName = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
const templatePaths = {
  images: "images/placeholder.svg",
  docs: "docs/README.md",
  config: "config.json",
};
let targetDirectory = null;
let busy = false;
let pickingDirectory = false;

function selectedTemplates() {
  return [...form.querySelectorAll('input[name="templates"]:checked')].map((input) => input.value);
}

function validateName(name) {
  if (!name.trim()) return "Escribe un nombre para la tarea.";
  if (name !== name.trim()) return "Quita los espacios al inicio o al final.";
  if (name.length > 80) return "Usa un nombre de hasta 80 caracteres.";
  if (name === "." || name === "..") return "Ese nombre no es válido.";
  if (/[. ]$/.test(name)) return "El nombre no puede terminar en punto o espacio.";
  if (invalidNameCharacters.test(name)) return "Evita / \\ : * ? \" < > | y caracteres de control.";
  if (reservedName.test(name)) return "Ese nombre está reservado por Windows.";
  return "";
}

function setError(element, message, input) {
  element.textContent = message;
  if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
}

function clearErrors() {
  setError(nameError, "", projectNameInput);
  setError(templatesError, "");
  setError(directoryError, "");
  formError.hidden = true;
  formError.textContent = "";
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function appendActivity(message, status = "success", detail = "") {
  renderActivity(activityStore.append(message, status, detail));
}

function renderActivity({message, status, detail, createdAt}) {
  activityEmpty.hidden = true;
  const item = document.createElement("li");
  item.className = `activity-item event-${status}`;

  const mark = document.createElement("span");
  mark.className = "event-mark";
  mark.setAttribute("aria-hidden", "true");

  const copy = document.createElement("span");
  copy.className = "event-copy";
  const title = document.createElement("strong");
  title.textContent = message;
  copy.append(title);
  if (detail) {
    const detailLine = document.createElement("span");
    detailLine.textContent = detail;
    copy.append(detailLine);
  }

  const time = document.createElement("time");
  time.className = "event-time";
  time.dateTime = createdAt;
  time.textContent = new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date(createdAt));

  item.append(mark, copy, time);
  activityList.prepend(item);
  const events = activityList.querySelectorAll(".activity-item");
  if (events.length > 200) events[events.length - 1].remove();
  activityCount.textContent = String(activityList.querySelectorAll(".activity-item").length);
}

function updatePreview() {
  const name = projectNameInput.value.trim() || "mi-proyecto";
  const templates = selectedTemplates();
  previewRootName.textContent = name;
  previewTree.replaceChildren();

  for (const template of templates) {
    const item = document.createElement("li");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.classList.add("icon");
    icon.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-file");
    icon.append(use);
    const path = document.createElement("span");
    path.textContent = templatePaths[template];
    item.append(icon, path);
    previewTree.append(item);
  }

  previewCount.textContent = `${templates.length} ${templates.length === 1 ? "archivo" : "archivos"} seleccionado${templates.length === 1 ? "" : "s"}`;
}

async function checkBackend() {
  const status = document.querySelector("#backend-status");
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("API no disponible");
    status.textContent = "Backend conectado";
    status.classList.remove("is-error");
    appendActivity("Backend conectado", "success", "La API local está disponible para preparar las plantillas.");
  } catch {
    status.textContent = "Backend sin conexión";
    status.classList.add("is-error");
    appendActivity("Backend sin conexión", "error", "Comprueba que el servidor local siga en ejecución.");
  }
}

function checkPickerSupport() {
  const supported = window.isSecureContext && typeof window.showDirectoryPicker === "function";
  if (!supported) {
    chooseDirectoryButton.disabled = true;
    setError(directoryError, "Usa Chrome o Edge de escritorio en localhost para seleccionar carpetas.");
  }
  return supported;
}

chooseDirectoryButton.addEventListener("click", async () => {
  if (busy || pickingDirectory) return;
  if (!checkPickerSupport()) return;
  pickingDirectory = true;
  chooseDirectoryButton.disabled = true;
  createButton.disabled = true;
  try {
    targetDirectory = await window.showDirectoryPicker({ mode: "readwrite" });
    directoryName.textContent = targetDirectory.name;
    directoryHelp.textContent = "Destino seleccionado para esta sesión";
    setError(directoryError, "");
    appendActivity("Carpeta de destino seleccionada", "success", targetDirectory.name);
  } catch (error) {
    if (error?.name === "AbortError") {
      appendActivity("Selección de carpeta cancelada", "warning", "Puedes intentarlo de nuevo cuando quieras.");
      return;
    }
    setError(directoryError, "No se pudo seleccionar la carpeta. Revisa el navegador e inténtalo de nuevo.");
    appendActivity("No se pudo seleccionar la carpeta", "error");
  } finally {
    pickingDirectory = false;
    chooseDirectoryButton.disabled = busy;
    createButton.disabled = busy;
  }
});

function requestCollisionChoice(name) {
  collisionName.textContent = name;
  collisionDialog.showModal();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (choice) => {
      if (settled) return;
      settled = true;
      collisionDialog.removeEventListener("cancel", onCancel);
      ["collision-cancel", "collision-close", "collision-rename", "collision-overwrite"]
        .forEach(id => { document.getElementById(id).onclick = null; });
      collisionDialog.close();
      resolve(choice);
    };
    const onCancel = (event) => {
      event.preventDefault();
      finish("cancel");
    };

    document.querySelector("#collision-cancel").onclick = () => finish("cancel");
    document.querySelector("#collision-close").onclick = () => finish("cancel");
    document.querySelector("#collision-rename").onclick = () => finish("rename");
    document.querySelector("#collision-overwrite").onclick = () => finish("overwrite");
    collisionDialog.addEventListener("cancel", onCancel, { once: true });
  });
}

function updateProgress(done, total, label) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  progressWrap.hidden = false;
  progressText.textContent = label;
  progressPercent.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;
}

async function prepareManifest(name, author, templates) {
  let response;
  try {
    response = await fetch("/api/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, author, templates }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("No se pudo conectar con el backend local. Comprueba que el servidor siga activo.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "El backend no pudo preparar los archivos.");
  return validateManifest(payload, name, templates);
}

function setBusy(value) {
  busy = value;
  form.querySelectorAll("input").forEach(input => { input.disabled = value; });
  document.querySelector("#new-project").disabled = value;
  createButton.disabled = value;
  chooseDirectoryButton.disabled = value || !(window.isSecureContext && typeof window.showDirectoryPicker === "function");
  createButton.querySelector(".button-spark").classList.toggle("is-busy", value);
  document.querySelector("#create-label").textContent = value ? "Creando…" : "Crear estructura";
}

async function handleCreate(event) {
  event.preventDefault();
  if (busy || pickingDirectory) return;
  clearErrors();
  resultPanel.hidden = true;

  const name = projectNameInput.value;
  const author = authorInput.value;
  const templates = selectedTemplates();
  const invalidName = validateName(name);
  if (invalidName) {
    setError(nameError, invalidName, projectNameInput);
    appendActivity("Nombre no válido", "warning", invalidName);
    projectNameInput.focus();
    return;
  }
  if (!targetDirectory) {
    setError(directoryError, "Selecciona primero una carpeta de destino.");
    appendActivity("Falta la carpeta de destino", "warning", "Selecciona una carpeta antes de crear la estructura.");
    return;
  }
  if (!templates.length) {
    setError(templatesError, "Selecciona al menos una plantilla.");
    appendActivity("No hay plantillas seleccionadas", "warning", "Selecciona al menos una plantilla.");
    return;
  }
  if (!checkPickerSupport()) return;

  setBusy(true);
  progressBar.style.width = "0%";
  updateProgress(0, 1, "Verificando permisos…");

  try {
    await ensureWritePermission(targetDirectory);
    let rootHandle = await findExistingDirectory(targetDirectory, name);
    let isOverwrite = false;

    if (rootHandle) {
      appendActivity("La carpeta ya existe", "warning", `${name}/`);
      const choice = await requestCollisionChoice(name);
      if (choice === "cancel") {
        appendActivity("Creación cancelada", "warning", "No se modificaron archivos.");
        progressWrap.hidden = true;
        setBusy(false);
        return;
      }
      if (choice === "rename") {
        setBusy(false);
        setError(nameError, "Escribe un nombre nuevo y vuelve a intentarlo.", projectNameInput);
        projectNameInput.focus();
        appendActivity("Pendiente un nombre nuevo", "warning", "La carpeta existente no se modificó.");
        progressWrap.hidden = true;
        setBusy(false);
        return;
      }
      isOverwrite = true;
    }

    const manifest = await prepareManifest(name, author, templates);
    const totalSteps = 1 + manifest.files.reduce((total, file) => total + file.relativePath.split("/").length, 0);
    let completedSteps = 0;

    if (!rootHandle) {
      rootHandle = await targetDirectory.getDirectoryHandle(name, { create: true });
      appendActivity("Carpeta creada", "success", `${name}/`);
    } else if (isOverwrite) {
      appendActivity("Carpeta existente reutilizada", "warning", "Se actualizarán solo los archivos seleccionados.");
    }
    completedSteps += 1;
    updateProgress(completedSteps, totalSteps, "Carpeta de proyecto lista");

    for (const file of manifest.files) {
      const before = activityList.querySelectorAll(".activity-item").length;
      await writeGeneratedFile(rootHandle, name, file, appendActivity);
      const after = activityList.querySelectorAll(".activity-item").length;
      completedSteps += file.relativePath.split("/").length;
      updateProgress(completedSteps, totalSteps, after > before + 1 ? "Carpeta y archivo listos" : "Archivo generado");
    }

    updateProgress(totalSteps, totalSteps, "Estructura completa");
    appendActivity("Generación completada", "success", `${manifest.files.length} ${manifest.files.length === 1 ? "archivo listo" : "archivos listos"}.`);
    resultDescription.textContent = `Destino: ${targetDirectory.name}/${name}/ · ${manifest.files.length} ${manifest.files.length === 1 ? "archivo generado" : "archivos generados"}.`;
    resultFiles.replaceChildren(...manifest.files.map((file) => {
      const item = document.createElement("li");
      item.textContent = file.relativePath;
      return item;
    }));
    resultPanel.hidden = false;
    resultPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    const message = friendlyWriteError(error);
    showFormError(message);
    appendActivity("No se pudo completar la estructura", "error", message);
  } finally {
    setBusy(false);
  }
}

form.addEventListener("submit", handleCreate);
projectNameInput.addEventListener("input", () => {
  if (nameError.textContent) setError(nameError, "", projectNameInput);
  updatePreview();
});
form.querySelectorAll('input[name="templates"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (templatesError.textContent && selectedTemplates().length) setError(templatesError, "");
    updatePreview();
  });
});
document.querySelector("#new-project").addEventListener("click", () => {
  projectNameInput.value = "";
  form.querySelectorAll('input[name="templates"]').forEach((input) => { input.checked = true; });
  resultPanel.hidden = true;
  progressWrap.hidden = true;
  clearErrors();
  updatePreview();
  projectNameInput.focus();
});

document.querySelector("#clear-activity").addEventListener("click", () => {
  activityStore.clear();
  activityList.querySelectorAll(".activity-item").forEach(item => item.remove());
  activityEmpty.hidden = false;
  activityCount.textContent = "0";
});
activityStore.list().forEach(renderActivity);
updatePreview();
checkPickerSupport();
checkBackend();
