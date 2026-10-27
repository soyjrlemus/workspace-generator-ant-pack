const INVALID_NAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001F]/;
const RESERVED_WINDOWS_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

export function validateProjectName(value) {
  if (typeof value !== "string" || !value.trim()) return "Escribe un nombre para la tarea.";
  if (value !== value.trim()) return "Quita los espacios al inicio o al final.";
  if (value.length > 80) return "Usa un nombre de hasta 80 caracteres.";
  if (value === "." || value === "..") return "Ese nombre no es válido.";
  if (/[. ]$/.test(value)) return "El nombre no puede terminar en punto o espacio.";
  if (INVALID_NAME_CHARACTERS.test(value)) return "Evita / \\ : * ? \" < > | y caracteres de control.";
  if (RESERVED_WINDOWS_NAMES.test(value)) return "Ese nombre está reservado por Windows.";
  return "";
}

export function prepareWorkspace(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("La solicitud debe ser un objeto.");
  }
  const { name, author, templates } = input;
  const nameError = validateProjectName(name);
  if (nameError) throw new Error(nameError);

  const allowed = new Set(["images", "docs", "config"]);
  if (!Array.isArray(templates) || templates.length === 0 || templates.length > 3) {
    throw new Error("Selecciona al menos una plantilla.");
  }
  if (templates.some((template) => !allowed.has(template))) {
    throw new Error("Una de las plantillas seleccionadas no es válida.");
  }
  if (new Set(templates).size !== templates.length) throw new Error("No repitas plantillas.");
  if (author !== undefined && (typeof author !== "string" || author.length > 80)) {
    throw new Error("El autor debe ser texto de hasta 80 caracteres.");
  }

  const safeAuthor = typeof author === "string" && author.trim()
    ? author.trim().replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, 80)
    : "Equipo de desarrollo";
  const createdAt = new Date().toISOString();
  const files = [];

  if (templates.includes("images")) {
    files.push({
      relativePath: "images/placeholder.svg",
      content: createPlaceholderSvg(name),
    });
  }

  if (templates.includes("docs")) {
    files.push({
      relativePath: "docs/README.md",
      content: createReadme(name, safeAuthor, createdAt),
    });
  }

  if (templates.includes("config")) {
    files.push({
      relativePath: "config.json",
      content: JSON.stringify({
        name,
        author: safeAuthor,
        createdAt,
        version: "1.0.0",
        templates: [...templates],
      }, null, 2),
    });
  }

  return { projectName: name, author: safeAuthor, createdAt, files };
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;",
  })[character]);
}

function createPlaceholderSvg(name) {
  const label = escapeXml(name);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" role="img" aria-labelledby="title desc">
  <title id="title">Placeholder para ${label}</title>
  <desc id="desc">Reemplaza este recurso por una imagen del proyecto.</desc>
  <rect width="640" height="400" rx="24" fill="#eef4fb"/>
  <rect x="196" y="92" width="248" height="168" rx="16" fill="#d7e6f8"/>
  <circle cx="276" cy="148" r="22" fill="#8db4e3"/>
  <path d="m218 238 67-66 42 39 36-31 59 58H218Z" fill="#6c99cf"/>
  <text x="320" y="310" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="#29496b">${label}</text>
</svg>
`;
}

function createReadme(name, author, createdAt) {
  name = escapeMarkdown(name);
  author = escapeMarkdown(author);
  const date = createdAt.slice(0, 10);
  return `# ${name}

Estructura inicial para organizar los entregables del proyecto **${name}**.

- **Creado:** ${date}
- **Autor:** ${author}
- **Descripción:** Espacio de trabajo inicial para los recursos y notas del proyecto.

## Checklist de entrega

- [ ] Revisar y completar los recursos.
- [ ] Validar nombres y organización de archivos.
- [ ] Preparar la entrega final.
`;
}

function escapeMarkdown(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#+.!|])/g, "\\$1");
}
