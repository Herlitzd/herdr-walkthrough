import { parseMermaid } from "./diagram.js";
import { filesByAlias, resolveHunks, plainLabel } from "./alias.js";

export const CONNECTION_SCHEMA = {
  type: "array",
  items: {
    type: "object", additionalProperties: false,
    required: ["from", "to", "label", "hunks"],
    properties: {
      from: { type: "string" }, to: { type: "string" },
      label: { type: "string", minLength: 1, maxLength: 60 },
      hunks: { type: "array", minItems: 1, items: { type: "string" } },
    },
  },
};

/**
 * Labels annotate existing directed relationships, never invent new edges.
 * A label that names no single declared edge, or cites no real resulting code,
 * is left out (counted in `omit.count`); its edge is still drawn, unlabeled.
 * Labels are made plain and short rather than refused for a stray character.
 */
export function normalizeConnections(raw, source, aliases, files, omit = { count: 0 }) {
  if (raw === undefined) return undefined; // Legacy reports remain unlabeled.
  if (!Array.isArray(raw)) { omit.count++; return []; }
  const graph = parseMermaid(source), seen = new Set();
  const fileByAlias = filesByAlias(files);
  const out = [];
  for (const c of raw) {
    const from = typeof c?.from === "string" ? c.from.trim() : "", to = typeof c?.to === "string" ? c.to.trim() : "";
    const key = `${from}:${to}`;
    const label = plainLabel(c?.label, 60);
    const hits = resolveHunks(c?.hunks, aliases, fileByAlias, (f) => f.status !== "deleted");
    if (graph.edges.filter((e) => e.from === from && e.to === to).length !== 1 || seen.has(key) || !label || !hits.length) { omit.count++; continue; }
    seen.add(key);
    out.push({ from, to, label, paths: [...new Set(hits.map((h) => h.file.path))], hunkIds: hits.map((h) => h.id) });
  }
  return out;
}
