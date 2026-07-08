import type { GenerationResultMeta } from "./types.js";

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function extractRouterResultMeta(raw: unknown): GenerationResultMeta | undefined {
  if (!isRecord(raw)) return undefined;
  const newApi = (raw as { new_api?: unknown }).new_api;
  if (!isRecord(newApi)) return undefined;
  const meta: GenerationResultMeta = {};
  const cost = numberValue(newApi.cost);
  const costOrigin = numberValue(newApi.cost_origin);
  if (cost !== undefined) meta.cost = cost;
  if (costOrigin !== undefined) meta.costOrigin = costOrigin;
  return Object.keys(meta).length > 0 ? meta : undefined;
}

export function mergeGenerationResultMeta(
  first: GenerationResultMeta | undefined,
  second: GenerationResultMeta | undefined,
): GenerationResultMeta | undefined {
  if (!first) return second;
  if (!second) return first;
  const meta: GenerationResultMeta = { ...first, ...second };
  const cost = second.cost ?? first.cost;
  const costOrigin = second.costOrigin ?? first.costOrigin;
  if (cost !== undefined) meta.cost = cost;
  if (costOrigin !== undefined) meta.costOrigin = costOrigin;
  return Object.keys(meta).length > 0 ? meta : undefined;
}
