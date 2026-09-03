import { GenerationProviderError, GenerationValidationError } from "../errors.js";
import { fetchWithTimeout, joinUrl } from "../http.js";
import type {
  GenerationAdapter,
  GenerationAdapterInput,
  GenerationContentBlock,
  ResolvedGenerationRequest,
} from "../types.js";

const REQUEST_TIMEOUT_MS = 210_000;
const QWEN_MODELS = new Set(["qwen-tts", "qwen-audio-3.0-tts-plus", "qwen-audio-3.0-tts-flash"]);
const QWEN_AUDIO_3_MODELS = new Set(["qwen-audio-3.0-tts-plus", "qwen-audio-3.0-tts-flash"]);
const HIGGS_MODEL = "higgs-tts";
const INDEX_TTS_MODEL = "index-tts-2.5";
const BREEZE_MODEL = "breeze-tts-2";
const INDEX_TTS_EMO_VECTOR_LEN = 8;

type TextBlock = Extract<GenerationContentBlock, { type: "text" }>;
type AudioBlock = Extract<GenerationContentBlock, { type: "audio" }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function textBlocks(input: ResolvedGenerationRequest): TextBlock[] {
  return input.request.content.filter((block): block is TextBlock => block.type === "text");
}

function audioBlocks(input: ResolvedGenerationRequest): AudioBlock[] {
  return input.request.content.filter((block): block is AudioBlock => block.type === "audio");
}

function validateMetaKeys(
  label: string,
  meta: Record<string, unknown> | undefined,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(meta ?? {})) {
    if (!allowed.has(key)) throw new GenerationValidationError(`Unknown ${label} field: ${key}`);
  }
}

function validateHttpUrl(value: unknown, label: string): void {
  if (typeof value !== "string") throw new GenerationValidationError(`${label} must be a valid HTTP(S) URL`);
  const trimmed = value.trim();
  if (!trimmed) throw new GenerationValidationError(`${label} must be a non-empty HTTP(S) URL`);
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
  } catch {
    throw new GenerationValidationError(`${label} must be a valid HTTP(S) URL`);
  }
}

function validateCommonContent(input: ResolvedGenerationRequest): { text: TextBlock; audio: AudioBlock[] } {
  const texts = textBlocks(input);
  if (texts.length !== 1 || typeof texts[0]?.text !== "string" || !texts[0].text.trim()) {
    throw new GenerationValidationError(
      `${input.declaration.model} requires exactly one non-empty text content block as input`,
    );
  }

  const audio = audioBlocks(input);
  for (const [index, block] of audio.entries()) {
    if (block.source.type !== "url") {
      throw new GenerationValidationError(`${input.declaration.model} reference audio must use a URL source`);
    }
    validateHttpUrl(block.source.url, `audio content block ${index} URL`);
  }
  return { text: texts[0], audio };
}

function validateQwen(input: ResolvedGenerationRequest, text: TextBlock, audio: AudioBlock[]): void {
  if (audio.length > 1) {
    throw new GenerationValidationError(`${input.declaration.model} supports at most one reference audio`);
  }
  // Keep accepting the retired preview_text key for compatibility, but never use or forward it.
  const requestMetaKeys = new Set(["voice_prompt", "preview_text"]);
  validateMetaKeys("request.metadata", input.request.metadata, requestMetaKeys);
  validateMetaKeys("request.meta", input.request.meta, requestMetaKeys);
  validateMetaKeys("text content meta", text.meta, new Set());
  for (const block of audio) validateMetaKeys("audio content meta", block.meta, new Set());

  const voicePrompt = input.meta.voice_prompt;
  const hasVoicePrompt = typeof voicePrompt === "string" && voicePrompt.trim().length > 0;
  if (voicePrompt !== undefined && !hasVoicePrompt) {
    throw new GenerationValidationError(`${input.declaration.model} meta.voice_prompt must be a non-empty string`);
  }
  if (audio.length === 0 && !hasVoicePrompt) {
    throw new GenerationValidationError(`${input.declaration.model} requires one reference audio or meta.voice_prompt`);
  }
  if (audio.length > 0 && hasVoicePrompt) {
    throw new GenerationValidationError(
      `${input.declaration.model} reference audio and meta.voice_prompt are mutually exclusive`,
    );
  }

  if (QWEN_AUDIO_3_MODELS.has(input.declaration.model) && Array.from(text.text.trim()).length < 15) {
    throw new GenerationValidationError(`${input.declaration.model} requires input of at least 15 Unicode code points`);
  }
}

function hasOwnWeight(block: AudioBlock): boolean {
  return Object.hasOwn(block.meta ?? {}, "weight");
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validateHiggs(input: ResolvedGenerationRequest, text: TextBlock, audio: AudioBlock[]): void {
  if (audio.length > 16)
    throw new GenerationValidationError(`${input.declaration.model} supports at most 16 references`);
  validateMetaKeys("request.metadata", input.request.metadata, new Set());
  validateMetaKeys("request.meta", input.request.meta, new Set());
  validateMetaKeys("text content meta", text.meta, new Set());

  for (const [index, block] of audio.entries()) {
    validateMetaKeys(`audio content block ${index} meta`, block.meta, new Set(["weight"]));
    const weight = block.meta?.weight;
    if (audio.length === 1 && (!hasOwnWeight(block) || weight === undefined)) continue;
    if (!isPositiveFiniteNumber(weight)) {
      throw new GenerationValidationError(`audio content block ${index} meta.weight must be a finite positive number`);
    }
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateIndexTts(input: ResolvedGenerationRequest, text: TextBlock, audio: AudioBlock[]): void {
  // IndexTTS-2.5 is voice-cloning only -- unlike Qwen there is no from-text-only
  // design mode, so exactly one reference audio is always required.
  if (audio.length !== 1) {
    throw new GenerationValidationError(
      `${input.declaration.model} requires exactly one reference audio (voice cloning; there is no from-text-only mode)`,
    );
  }
  const requestMetaKeys = new Set([
    "lang",
    "emo_audio_url",
    "emo_alpha",
    "emo_vector",
    "use_emo_text",
    "emo_text",
    "duration_factor",
  ]);
  validateMetaKeys("request.metadata", input.request.metadata, requestMetaKeys);
  validateMetaKeys("request.meta", input.request.meta, requestMetaKeys);
  validateMetaKeys("text content meta", text.meta, new Set());
  validateMetaKeys("audio content meta", audio[0]?.meta, new Set());

  const { lang, emo_audio_url, emo_alpha, emo_vector, use_emo_text, emo_text, duration_factor } = input.meta;

  if (lang !== undefined && (typeof lang !== "string" || !lang.trim())) {
    throw new GenerationValidationError(`${input.declaration.model} meta.lang must be a non-empty string`);
  }
  if (emo_audio_url !== undefined) validateHttpUrl(emo_audio_url, "meta.emo_audio_url");
  if (emo_alpha !== undefined) {
    if (emo_audio_url === undefined) {
      throw new GenerationValidationError(`${input.declaration.model} meta.emo_alpha requires meta.emo_audio_url`);
    }
    if (!isFiniteNumber(emo_alpha) || emo_alpha < 0 || emo_alpha > 1) {
      throw new GenerationValidationError(`${input.declaration.model} meta.emo_alpha must be a number in [0, 1]`);
    }
  }
  if (emo_vector !== undefined) {
    if (
      !Array.isArray(emo_vector) ||
      emo_vector.length !== INDEX_TTS_EMO_VECTOR_LEN ||
      !emo_vector.every(isFiniteNumber)
    ) {
      throw new GenerationValidationError(
        `${input.declaration.model} meta.emo_vector must be an array of exactly ${INDEX_TTS_EMO_VECTOR_LEN} finite numbers`,
      );
    }
  }
  if (use_emo_text !== undefined && typeof use_emo_text !== "boolean") {
    throw new GenerationValidationError(`${input.declaration.model} meta.use_emo_text must be a boolean`);
  }
  if (emo_text !== undefined && (typeof emo_text !== "string" || !emo_text.trim())) {
    throw new GenerationValidationError(`${input.declaration.model} meta.emo_text must be a non-empty string`);
  }
  if (duration_factor !== undefined) {
    if (!isFiniteNumber(duration_factor) || duration_factor < 0.5 || duration_factor > 2.0) {
      throw new GenerationValidationError(`${input.declaration.model} meta.duration_factor must be a number in [0.5, 2.0]`);
    }
  }
}

function validateBreeze(input: ResolvedGenerationRequest, text: TextBlock, audio: AudioBlock[]): void {
  if (audio.length > 1) {
    throw new GenerationValidationError(`${input.declaration.model} supports at most one reference audio`);
  }
  const requestMetaKeys = new Set(["instruction", "ref_text", "cfg_scale", "seed"]);
  validateMetaKeys("request.metadata", input.request.metadata, requestMetaKeys);
  validateMetaKeys("request.meta", input.request.meta, requestMetaKeys);
  validateMetaKeys("text content meta", text.meta, new Set());
  for (const block of audio) validateMetaKeys("audio content meta", block.meta, new Set());

  const { instruction, ref_text, cfg_scale, seed } = input.meta;
  const hasInstruction = typeof instruction === "string" && instruction.trim().length > 0;
  if (instruction !== undefined && !hasInstruction) {
    throw new GenerationValidationError(`${input.declaration.model} meta.instruction must be a non-empty string`);
  }
  const hasRefText = typeof ref_text === "string" && ref_text.trim().length > 0;
  if (ref_text !== undefined && !hasRefText) {
    throw new GenerationValidationError(`${input.declaration.model} meta.ref_text must be a non-empty string`);
  }
  if (audio.length === 1 && !hasRefText) {
    throw new GenerationValidationError(
      `${input.declaration.model} requires meta.ref_text (the reference audio's exact transcript) whenever reference audio is provided -- there is no server-side ASR fallback`,
    );
  }
  if (audio.length === 0 && !hasInstruction) {
    throw new GenerationValidationError(
      `${input.declaration.model} requires meta.instruction (voice design) and/or a reference audio + meta.ref_text (voice clone / voice direction)`,
    );
  }
  if (cfg_scale !== undefined && (!isFiniteNumber(cfg_scale) || cfg_scale <= 0)) {
    throw new GenerationValidationError(`${input.declaration.model} meta.cfg_scale must be a positive finite number`);
  }
  if (seed !== undefined && (!Number.isInteger(seed))) {
    throw new GenerationValidationError(`${input.declaration.model} meta.seed must be an integer`);
  }
}

function validateAudioSpeechRequest(input: ResolvedGenerationRequest): void {
  const { text, audio } = validateCommonContent(input);
  if (QWEN_MODELS.has(input.declaration.model)) {
    validateQwen(input, text, audio);
    return;
  }
  if (input.declaration.model === HIGGS_MODEL) {
    validateHiggs(input, text, audio);
    return;
  }
  if (input.declaration.model === INDEX_TTS_MODEL) {
    validateIndexTts(input, text, audio);
    return;
  }
  if (input.declaration.model === BREEZE_MODEL) {
    validateBreeze(input, text, audio);
    return;
  }
  throw new GenerationValidationError(`Unsupported audio speech model: ${input.declaration.model}`);
}

function requestIdFromHeaders(headers: Headers): string | undefined {
  return headers.get("x-request-id")?.trim() || headers.get("x-oneapi-request-id")?.trim() || undefined;
}

function buildPayload(input: ResolvedGenerationRequest): Record<string, unknown> {
  const text = textBlocks(input)[0];
  if (!text) throw new GenerationValidationError("Audio speech input was not validated");
  const audio = audioBlocks(input);
  const payload: Record<string, unknown> = {
    model: input.declaration.model,
    input: text.text,
  };

  if (QWEN_MODELS.has(input.declaration.model)) {
    if (audio[0]?.source.type === "url") payload.ref_audio = audio[0].source.url.trim();
    else payload.metadata = { voice_prompt: input.meta.voice_prompt };
    return payload;
  }

  if (input.declaration.model === INDEX_TTS_MODEL) {
    const refAudio = audio[0];
    if (refAudio?.source.type === "url") payload.ref_audio = refAudio.source.url.trim();
    const { lang, emo_audio_url, emo_alpha, emo_vector, use_emo_text, emo_text, duration_factor } = input.meta;
    const meta: Record<string, unknown> = {};
    if (lang !== undefined) meta.lang = lang;
    if (emo_audio_url !== undefined) {
      meta.emo_audio_url = emo_audio_url;
      if (emo_alpha !== undefined) meta.emo_alpha = emo_alpha;
    }
    if (emo_vector !== undefined) meta.emo_vector = emo_vector;
    if (use_emo_text !== undefined) meta.use_emo_text = use_emo_text;
    if (emo_text !== undefined) meta.emo_text = emo_text;
    if (duration_factor !== undefined) meta.duration_factor = duration_factor;
    if (Object.keys(meta).length > 0) payload.metadata = meta;
    return payload;
  }

  if (input.declaration.model === BREEZE_MODEL) {
    const refAudio = audio[0];
    const { instruction, ref_text, cfg_scale, seed } = input.meta;
    const meta: Record<string, unknown> = {};
    if (refAudio?.source.type === "url") {
      payload.ref_audio = refAudio.source.url.trim();
      meta.ref_text = ref_text;
    }
    if (instruction !== undefined) meta.instruction = instruction;
    if (cfg_scale !== undefined) meta.cfg_scale = cfg_scale;
    if (seed !== undefined) meta.seed = seed;
    if (Object.keys(meta).length > 0) payload.metadata = meta;
    return payload;
  }

  const firstAudio = audio[0];
  if (audio.length === 1 && firstAudio && (!hasOwnWeight(firstAudio) || firstAudio.meta?.weight === undefined)) {
    if (firstAudio.source.type === "url") payload.ref_audio = firstAudio.source.url.trim();
    return payload;
  }
  if (audio.length > 0) {
    payload.metadata = {
      references: audio.map((block) => ({
        url: block.source.type === "url" ? block.source.url.trim() : "",
        weight: block.meta?.weight,
      })),
    };
  }
  return payload;
}

function parseJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return undefined;
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function providerError(response: Response, rawBody: string): GenerationProviderError {
  const requestId = requestIdFromHeaders(response.headers);
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const parsed =
    contentType.includes("application/json") || contentType.includes("+json") ? parseJson(rawBody) : undefined;
  const parsedRecord = isRecord(parsed) ? parsed : undefined;
  const errorRecord = isRecord(parsedRecord?.error) ? parsedRecord.error : undefined;
  const message =
    nonEmptyString(errorRecord?.message) ??
    (rawBody.trim() ? rawBody : undefined) ??
    (response.statusText.trim() ? response.statusText : undefined) ??
    "Audio speech provider request failed";
  const code = nonEmptyString(errorRecord?.code);

  return new GenerationProviderError(message, {
    status: response.status,
    body: rawBody,
    details: {
      requestId,
      code,
      ...(parsedRecord ? { error: parsedRecord } : {}),
    },
  });
}

function unsupportedSuccessResponse(response: Response, rawBody: string): GenerationProviderError {
  const statusText = response.statusText.trim();
  const message =
    response.status === 204 && statusText
      ? statusText
      : "Audio speech provider returned an unsupported success response";
  return new GenerationProviderError(message, {
    status: response.status,
    body: rawBody,
    details: { requestId: requestIdFromHeaders(response.headers) },
  });
}

function parseSuccessResponse(response: Response, rawBody: string): GenerationContentBlock {
  const parsed = parseJson(rawBody);
  if (!isRecord(parsed)) throw unsupportedSuccessResponse(response, rawBody);

  const urlValue = nonEmptyString(parsed.url);
  const contentType = nonEmptyString(parsed.content_type);
  if (
    !urlValue ||
    parsed.media_type !== "audio" ||
    !contentType ||
    !/^audio\/[^\s/;]+(?:\s*;.*)?$/i.test(contentType)
  ) {
    throw unsupportedSuccessResponse(response, rawBody);
  }
  try {
    const url = new URL(urlValue.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
  } catch {
    throw unsupportedSuccessResponse(response, rawBody);
  }

  const size = parsed.size;
  if (
    size !== undefined &&
    (typeof size !== "number" || !Number.isFinite(size) || !Number.isInteger(size) || size < 0)
  ) {
    throw unsupportedSuccessResponse(response, rawBody);
  }

  const requestId = requestIdFromHeaders(response.headers);
  return {
    type: "audio",
    source: { type: "url", url: urlValue.trim() },
    meta: {
      content_type: contentType,
      ...(size !== undefined ? { size } : {}),
      ...(requestId ? { request_id: requestId } : {}),
    },
  };
}

async function generateAudioSpeech(input: GenerationAdapterInput): Promise<GenerationContentBlock[]> {
  const response = await fetchWithTimeout(
    input.context.fetch,
    joinUrl(input.context.baseUrl, "/v1/audio/speech"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.context.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildPayload(input)),
    },
    REQUEST_TIMEOUT_MS,
  );
  const rawBody = await response.text().catch(() => "");
  if (!response.ok) throw providerError(response, rawBody);
  return [parseSuccessResponse(response, rawBody)];
}

export const audioSpeechAdapter: GenerationAdapter = Object.assign(generateAudioSpeech, {
  validate: validateAudioSpeechRequest,
});
