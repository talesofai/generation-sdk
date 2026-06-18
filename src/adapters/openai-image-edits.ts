import { GenerationProviderError, GenerationValidationError } from "../errors.js";
import { fetchWithTimeout, joinUrl } from "../http.js";
import type { GenerationAdapterInput, GenerationContentBlock } from "../types.js";
import { compactArray, compactObject } from "../utils.js";
import { mergeTextBlocks } from "../validation.js";

const REQUEST_TIMEOUT_MS = 300_000;

type OpenAiImageEditsResponse = {
  data?: Array<{
    url?: unknown;
    b64_json?: unknown;
    revised_prompt?: unknown;
  }>;
  created?: unknown;
  usage?: unknown;
};

function firstUrlImage(input: GenerationAdapterInput): string {
  const image = input.request.content.find(
    (block): block is Extract<GenerationContentBlock, { type: "image" }> => block.type === "image",
  );
  if (!image) throw new GenerationValidationError("Source image is required");
  if (image.source.type !== "url") throw new GenerationValidationError("Image edits require an image URL");
  return image.source.url;
}

function collectOpenAiImageEditsNoOutputDetails(raw: OpenAiImageEditsResponse): Record<string, unknown> {
  const data = raw.data ?? [];
  return compactObject({
    created: raw.created,
    usage: raw.usage,
    dataCount: data.length,
    data: compactArray(
      data.map((item) =>
        compactObject({
          hasUrl: typeof item.url === "string" && item.url.length > 0,
          hasBase64Json: typeof item.b64_json === "string" && item.b64_json.length > 0,
          revisedPrompt: item.revised_prompt,
        }),
      ),
    ),
  });
}

export async function openAiImageEditsAdapter(input: GenerationAdapterInput): Promise<GenerationContentBlock[]> {
  const prompt = mergeTextBlocks(input.declaration, input.request.content);
  if (!prompt) throw new GenerationValidationError("Edit instruction is required");

  const body = new FormData();
  body.set("model", input.declaration.model);
  body.set("prompt", prompt);
  body.set("image", firstUrlImage(input));
  for (const [key, value] of Object.entries(input.parameters)) {
    if (value !== undefined && value !== null) body.set(key, String(value));
  }

  const response = await fetchWithTimeout(
    input.context.fetch,
    joinUrl(input.context.baseUrl, "/v1/images/edits"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.context.apiKey}`,
      },
      body,
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    const bodyText = await response.text().catch(() => response.statusText);
    throw new GenerationProviderError("Image edit provider request failed", {
      status: response.status,
      body: bodyText,
    });
  }

  const raw = (await response.json()) as OpenAiImageEditsResponse;
  const output: GenerationContentBlock[] = [];
  for (const item of raw.data ?? []) {
    if (typeof item.url === "string" && item.url) {
      output.push({ type: "image", source: { type: "url", url: item.url } });
    }
    if (typeof item.b64_json === "string" && item.b64_json) {
      output.push({ type: "image", source: { type: "base64", mediaType: "image/png", data: item.b64_json } });
    }
    if (typeof item.revised_prompt === "string" && item.revised_prompt.trim()) {
      output.push({ type: "text", text: item.revised_prompt, meta: { role: "revised_prompt" } });
    }
  }
  if (output.length === 0) {
    throw new GenerationProviderError("Image edit returned no output", {
      details: collectOpenAiImageEditsNoOutputDetails(raw),
    });
  }
  return output;
}
