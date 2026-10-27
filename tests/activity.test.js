import test from "node:test";
import assert from "node:assert/strict";
import { createActivityStore } from "../public/activity-store.js";

function memoryStorage() {
  let value = null;
  return { getItem: () => value, setItem: (_key, next) => { value = next; } };
}

test("los eventos conservan contenido y hora tras recargar", () => {
  const storage = memoryStorage();
  const first = createActivityStore(storage);
  const event = first.append("Archivo generado", "success", "demo/config.json");
  assert.deepEqual(createActivityStore(storage).list(), [event]);
});
test("el historial conserva solo los 200 eventos más recientes y puede limpiarse", () => {
  const storage = memoryStorage();
  const store = createActivityStore(storage);
  for (let i = 0; i < 220; i++) store.append(String(i));
  const restored = createActivityStore(storage);
  assert.equal(restored.list().length, 200);
  assert.equal(restored.list()[0].message, "20");
  restored.clear();
  assert.deepEqual(createActivityStore(storage).list(), []);
});
test("ignora almacenamiento corrupto y eventos con fecha o estado inválidos", () => {
  for (const saved of ["{broken", "null", JSON.stringify([{ message: "x", detail: "", status: "unknown", createdAt: "bad" }])]) {
    assert.deepEqual(createActivityStore({ getItem: () => saved }).list(), []);
  }
});
test("sigue registrando en memoria cuando el almacenamiento está bloqueado", () => {
  const store = createActivityStore({ getItem() { throw new Error(); }, setItem() { throw new Error(); } });
  store.append("Permiso denegado", "error");
  assert.equal(store.list().length, 1);
});
