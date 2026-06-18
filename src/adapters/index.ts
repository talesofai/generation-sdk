import { GenerationUnsupportedAdapterError } from "../errors.js";
import type { GenerationAdapter } from "../types.js";
import { arkVideoGenerationsAdapter } from "./ark-video-generations.js";
import { geminiGenerateContentAdapter } from "./gemini-generate-content.js";
import { klingVideoGenerationsAdapter } from "./kling-video-generations.js";
import { openAiImageEditsAdapter } from "./openai-image-edits.js";
import { openAiImagesAdapter } from "./openai-images.js";
import { sunoTasksAdapter } from "./suno-tasks.js";

export const builtinGenerationAdapters: Record<string, GenerationAdapter> = {
  "ark.videoGenerations": arkVideoGenerationsAdapter,
  "gemini.generateContent": geminiGenerateContentAdapter,
  "kling.videoGenerations": klingVideoGenerationsAdapter,
  "openai.imageEdits": openAiImageEditsAdapter,
  "openai.images": openAiImagesAdapter,
  "suno.tasks": sunoTasksAdapter,
};

export function getGenerationAdapter(
  type: string,
  adapters: Record<string, GenerationAdapter> = {},
): GenerationAdapter {
  const adapter = adapters[type] ?? builtinGenerationAdapters[type];
  if (!adapter) throw new GenerationUnsupportedAdapterError(type);
  return adapter;
}

export * from "./ark-video-generations.js";
export * from "./gemini-generate-content.js";
export * from "./kling-video-generations.js";
export * from "./openai-image-edits.js";
export * from "./openai-images.js";
export * from "./suno-tasks.js";
