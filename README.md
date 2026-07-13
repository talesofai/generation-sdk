# @neta-art/generation

A lightweight multimodal generation SDK with built-in model presets, model declaration files, and adapter-based provider calls.

## Install

```bash
npm install @neta-art/generation
```

## Quick start

```ts
import { createGenerationClient } from "@neta-art/generation";

const client = createGenerationClient({
  apiKey: process.env.NETA_ROUTER_API_KEY!,
});

const output = await client.generate({
  model: "gpt-image-2",
  content: [
    { type: "text", text: "a cinematic portrait of a robot florist, 35mm film" },
  ],
  parameters: {
    size: "1024x1024",
    quality: "high",
  },
});

console.log(output);
```

Use `generateResult` when you need observed request metadata:

```ts
const result = await client.generateResult({
  model: "gpt-image-2",
  content: [{ type: "text", text: "a small red toy robot on a white desk" }],
});

console.log(result.content);
console.log(result.requestId, result.cost);
```

`requestId` maps to the response body's top-level `request_id`. `cost` maps to the official request price in `usage.cost`.

`baseUrl` defaults to `https://router.neta.art`. Pass a different endpoint when needed:

```ts
const client = createGenerationClient({
  apiKey: process.env.NETA_ROUTER_API_KEY!,
  baseUrl: "https://router.neta.art",
});
```

## Local testing with `.env`

`.env` is ignored by Git. Copy `.env.example` to `.env` and fill in your router key:

```bash
cp .env.example .env
```

```dotenv
NETA_ROUTER_API_KEY=your_api_key_here
```

Node.js does not load `.env` automatically for library code. The example scripts use Node's native `--env-file` flag through npm scripts:

```bash
pnpm example:basic-image
pnpm example:image-editing
pnpm example:text-to-video
```

Live provider tests are separate from `pnpm test` because they use the real SDK client and submit real provider requests. Set
`NETA_ROUTER_API_KEY` or `NETA_API_KEY`, then run:

```bash
pnpm test:live:suno
```

Seedance live smoke tests exercise text-to-video, first/last frame video, and multi-reference-image plus reference-video
requests through the built SDK:

```bash
pnpm test:live:seedance
```

The script reads `NETA_ROUTER_API_KEY` or `NETA_API_KEY`, falling back to `/tmp/neta-router-key`, and writes reusable
JSON results under `/tmp/neta-generation-live/seedance`. Use `-- --download` to also save generated media files.
It also writes `visual-review.html`, which places the inputs and outputs side by side so the result can be checked for
actual first/last-frame or reference-media effect. Rebuild that report from an existing run with `-- --report-only`.

You can also call providers through the CLI:

```bash
node --env-file=.env ./dist/cli/index.js generate gemini-3.1-flash-image-preview \
  --prompt "a simple abstract geometric app icon" \
  --param aspect_ratio=1:1 \
  --param image_size=512 \
  --debug
```

Use `--image-url` for reference images, `--out` to write base64 outputs to files, and `json:` for non-string parameter values, for example `--param duration=json:5`.

## Debug provider requests

Pass `debug: true` to print the final provider request and response metadata to stderr. Sensitive fields such as `Authorization` and base64 image data are redacted by default.

```ts
const client = createGenerationClient({
  apiKey: process.env.NETA_ROUTER_API_KEY!,
  debug: true,
});
```

For a custom logger or unredacted secret headers. Base64 media payloads are always redacted from debug events:

```ts
const client = createGenerationClient({
  apiKey: process.env.NETA_ROUTER_API_KEY!,
  debug: {
    enabled: true,
    includeSensitive: true,
    logger: (event) => console.error(JSON.stringify(event, null, 2)),
  },
});
```

## Built-in models

- `gpt-image-2`
- `krea2`
- `z-image-turbo`
- `qwen-image-edit`
- `gemini-3.1-flash-image-preview`
- `kling-text-to-video`
- `kling-image-to-video`
- `kling-omni-video`
- `kling-multi-image-to-video`
- `seedance-2-0`
- `seedance-2-0-fast`
- `suno_music_chirp_fenix`
- `noobxl-t2i-onediff`
- `noobxl-i2i-ipa-onediff`
- `birefnet-general`
- `suno_style_tags`
- `suno_upload_audio`
- `suno_cover_chirp_v5`
- `suno_infill_chirp_v5`
- `suno_sound_chirp_v5`
- `suno_image_to_song_chirp_v5`
- `suno_video_to_song_chirp_v5`
- `suno_vox_chirp_v5`

Built-in model declarations share the same client-level `apiKey` and `baseUrl`.

## Image editing with a reference image

```ts
const output = await client.generate({
  model: "gemini-3.1-flash-image-preview",
  content: [
    { type: "text", text: "turn this portrait into a watercolor illustration" },
    { type: "image", source: { type: "url", url: "https://example.com/portrait.jpg" } },
  ],
  parameters: {
    aspect_ratio: "3:4",
    image_size: "2K",
  },
});
```

## Image models

These image models use the same client API as the other built-in models:

- `krea2`
- `z-image-turbo`
- `qwen-image-edit`
- `noobxl-t2i-onediff`
- `noobxl-i2i-ipa-onediff`
- `birefnet-general`

```ts
await client.generate({
  model: "krea2",
  content: [{ type: "text", text: "a cinematic mountain cabin at sunrise" }],
  parameters: {
    size: "1536x1024",
    seed: 123456,
  },
});

await client.generate({
  model: "z-image-turbo",
  content: [{ type: "text", text: "a clean product-style image of a small red toy robot" }],
  parameters: {
    size: "1024*1024",
  },
});

await client.generate({
  model: "qwen-image-edit",
  content: [
    { type: "text", text: "change the background to a clean white studio backdrop" },
    { type: "image", source: { type: "url", url: "https://example.com/input.png" } },
  ],
  parameters: {
    size: "1024x1024",
  },
});

await client.generate({
  model: "noobxl-t2i-onediff",
  content: [{ type: "text", text: "anime key visual, luminous city at night" }],
  parameters: {
    size: "1024x1024",
    negative_prompt: "low quality, blurry",
  },
});

await client.generate({
  model: "birefnet-general",
  content: [
    { type: "image", source: { type: "url", url: "https://example.com/portrait.png" } },
  ],
});
```

## Video generation

```ts
const output = await client.generate({
  model: "seedance-2-0-fast",
  content: [
    { type: "text", text: "a cat playing piano in a cozy jazz club, cinematic lighting" },
  ],
  parameters: {
    duration: 5,
    resolution: "720p",
    ratio: "16:9",
  },
});
```

Seedance frame and reference media video modes use `meta.role` with public URL media sources:

```ts
await client.generate({
  model: "seedance-2-0",
  content: [
    { type: "text", text: "create a smooth dramatic transition" },
    { type: "image", source: { type: "url", url: "https://example.com/start.jpg" }, meta: { role: "first_frame" } },
    { type: "image", source: { type: "url", url: "https://example.com/end.jpg" }, meta: { role: "last_frame" } },
  ],
});
```

```ts
await client.generate({
  model: "seedance-2-0-fast",
  content: [
    { type: "text", text: "keep the subject from the image and the motion style from the video" },
    { type: "image", source: { type: "url", url: "https://example.com/subject.jpg" }, meta: { role: "reference_image" } },
    { type: "video", source: { type: "url", url: "https://example.com/motion.mp4" }, meta: { role: "reference_video" } },
  ],
});
```

Kling exposes stable capability model ids while the adapter sends the latest upstream `model_name` for each capability:

```ts
await client.generate({
  model: "kling-image-to-video",
  content: [
    { type: "text", text: "gently turn toward the camera with soft natural motion" },
    { type: "image", source: { type: "url", url: "https://example.com/input.png" } },
  ],
  parameters: {
    duration: 5,
    aspect_ratio: "16:9",
  },
});
```

## Music generation

```ts
const output = await client.generate({
  model: "suno_music_chirp_fenix",
  content: [
    { type: "text", text: "uplifting cinematic pop with warm piano and clear chorus" },
  ],
  meta: {
    title: "Warm Horizon",
    tags: "cinematic pop, warm piano",
    make_instrumental: false,
  },
});

console.log(output);
```

Suno uses one shared adapter with a small public model set: `suno_music_chirp_fenix`, `suno_style_tags`,
`suno_upload_audio`, `suno_cover_chirp_v5`, `suno_infill_chirp_v5`, `suno_sound_chirp_v5`,
`suno_image_to_song_chirp_v5`, `suno_video_to_song_chirp_v5`, and `suno_vox_chirp_v5`. Provider-specific fields such as
`title`, `tags`, `make_instrumental`, and `metadata_params` belong in `meta`.

`suno_music` is removed in this release. Migrate to a concrete model name and stop sending `parameters.operation` or `meta.task`.

## Load model declarations from files

```ts
import { createGenerationClientFromDirectory } from "@neta-art/generation";

const client = await createGenerationClientFromDirectory("./models", {
  apiKey: process.env.NETA_ROUTER_API_KEY!,
});
```

Supported declaration formats:

- `.yaml`
- `.yml`
- `.json`

Custom declarations are merged with built-in models by default. If the same `model` exists, the custom declaration wins.

## Export model declarations

```ts
import { exportBuiltinModelConfig } from "@neta-art/generation";

await exportBuiltinModelConfig("gpt-image-2", "./gpt-image-2.yaml");
```

CLI:

```bash
neta-generation models list
neta-generation models export gpt-image-2 --out ./gpt-image-2.yaml
neta-generation models export-all --out ./models
```

## Model declaration schema

```yaml
schema: neta.generation.model.v1
model: gpt-image-2
title: GPT Image 2
adapter:
  type: openai.images
content:
  input:
    - type: text
      required: true
      min: 1
      max: 16
      merge: newline
    - type: image
      required: false
      max: 16
      sources:
        - url
        - base64
parameters:
  size:
    type: string
    optional: true
    default: 1024x1024
```

Adapter credentials are intentionally not stored in model declarations. Use client-level or request-level `apiKey` and `baseUrl` instead.

## Content sources

```ts
type GenerationSource =
  | { type: "url"; url: string }
  | { type: "base64"; mediaType: string; data: string };
```

The content block `type` selects the media kind (`image`, `video`, or `audio`). The source `type` selects how that media is supplied (`url` or `base64`). When a model declares `roles`, `meta.role` selects the media's provider-specific purpose. When it also sets `roleRequired`, that role must be present.

## Adapter types

Built-in adapters:

- `openai.images`
- `openai.imageEdits`
- `gemini.generateContent`
- `ark.videoGenerations`
- `kling.videoGenerations`
- `suno.tasks`

You can register custom adapters:

```ts
const client = createGenerationClient({
  apiKey,
  adapters: {
    "custom.adapter": async (input) => {
      return [];
    },
  },
});
```

## Validation without provider calls

```ts
const resolved = client.validate({
  model: "gpt-image-2",
  content: [{ type: "text", text: "hello" }],
});

console.log(resolved.parameters);
```

## Error handling

```ts
import { GenerationValidationError, GenerationProviderError } from "@neta-art/generation";

try {
  await client.generate(request);
} catch (error) {
  if (error instanceof GenerationValidationError) {
    console.error("Invalid request", error.message);
  } else if (error instanceof GenerationProviderError) {
    console.error("Provider failed", error.message);
  }
}
```
