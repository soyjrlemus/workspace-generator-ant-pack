const paths = { images: "images/placeholder.svg", docs: "docs/README.md", config: "config.json" };

export function validateManifest(payload, name, templates) {
  const expected = new Set(templates.map(template => paths[template]));
  if (!payload || payload.projectName !== name || !Array.isArray(payload.files)
      || payload.files.length !== expected.size) throw new Error("Manifiesto no válido.");
  for (const file of payload.files) {
    if (!file || !expected.delete(file.relativePath) || typeof file.content !== "string"
        || file.content.length > 65536) throw new Error("Manifiesto no válido.");
  }
  return payload;
}
