const KEY = "workspace-generator.activity.v1";
const statuses = new Set(["success", "warning", "error"]);
const valid = event => event && typeof event.message === "string" && event.message.length <= 300
  && typeof event.detail === "string" && event.detail.length <= 500 && statuses.has(event.status)
  && typeof event.createdAt === "string" && Number.isFinite(Date.parse(event.createdAt));

export function createActivityStore(storage) {
  let events = [];
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || "[]");
    if (Array.isArray(saved)) events = saved.filter(valid).slice(-200);
  } catch { /* Unavailable or invalid storage starts a fresh in-memory history. */ }
  function save() {
    try { storage?.setItem(KEY, JSON.stringify(events)); } catch { /* Keep logging in memory. */ }
  }
  return {
    list: () => events.map(event => ({ ...event })),
    append(message, status = "success", detail = "") {
      const event = { message: message.slice(0, 300), status, detail: detail.slice(0, 500), createdAt: new Date().toISOString() };
      if (!valid(event)) throw new Error("Evento de actividad no válido.");
      events.push(event);
      events = events.slice(-200);
      save();
      return event;
    },
    clear() { events = []; save(); },
  };
}
