import type { GenerationModelDeclaration } from "./types.js";
import { MODEL_SCHEMA } from "./types.js";
import { cloneJson } from "./utils.js";

const imageSizeParameters = {
  size: {
    type: "string",
    optional: true,
    default: "1024x1024",
    description: "Output image size.",
    examples: ["auto", "1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "3840x2160", "2160x3840"],
  },
  quality: {
    type: "string",
    optional: true,
    default: "auto",
    enum: ["auto", "low", "medium", "high"],
    description: "Image quality.",
  },
} satisfies GenerationModelDeclaration["parameters"];

const zImageTurboParameters = {
  size: {
    type: "string",
    optional: true,
    default: "1024*1024",
    enum: ["1024*1024", "1536*1024", "1024*1536", "2048*2048"],
    description: "Output image size.",
  },
} satisfies GenerationModelDeclaration["parameters"];

const krea2ImageParameters = {
  size: {
    type: "string",
    optional: true,
    default: "1024x1024",
    description: "Output image size as WIDTHxHEIGHT. Each side must be 1024-2048 and divisible by 16.",
    examples: ["1024x1024", "1536x1024", "1024x1536", "2048x2048"],
  },
  seed: {
    type: "integer",
    optional: true,
    min: 0,
    description: "Random seed for reproducibility.",
  },
} satisfies GenerationModelDeclaration["parameters"];

const qwenImageEditParameters = {
  size: {
    type: "string",
    optional: true,
    default: "1024x1024",
    description: "Output image size.",
    examples: ["1024x1024", "768x1024", "1024x768"],
  },
} satisfies GenerationModelDeclaration["parameters"];

const noobxlImageParameters = {
  size: {
    type: "string",
    optional: true,
    default: "1024x1024",
    description: "Output image size as WIDTHxHEIGHT.",
    examples: ["1024x1024", "768x1024", "1024x768"],
  },
  negative_prompt: {
    type: "string",
    optional: true,
    description: "Content to avoid in generated images.",
  },
  seed: {
    type: "integer",
    optional: true,
    min: 0,
    description: "Random seed for reproducibility.",
  },
} satisfies GenerationModelDeclaration["parameters"];

const noobxlImageToImageParameters = {
  ...noobxlImageParameters,
  controlnet_weight: {
    type: "number",
    optional: true,
    min: 0,
    max: 2,
    description: "ControlNet tile weight. The provider default is 0.8.",
  },
  ipadapter_face_image_ref: {
    type: "string",
    optional: true,
    description: "Optional face reference image URL for IP-Adapter.",
  },
  ipadapter_face_weight: {
    type: "number",
    optional: true,
    min: 0,
    max: 2,
    description: "IP-Adapter face weight. The provider default is 0.6 when a face reference is supplied.",
  },
} satisfies GenerationModelDeclaration["parameters"];

function seedanceVideoParameters(defaults: { resolution: string; maxWait: number }) {
  return {
    duration: {
      type: "integer",
      optional: true,
      default: 5,
      min: 4,
      max: 15,
      description: "Video duration in seconds.",
    },
    resolution: {
      type: "string",
      optional: true,
      default: defaults.resolution,
      enum: ["480p", "720p", "1080p", "2K"],
      description: "Output video resolution.",
    },
    ratio: {
      type: "string",
      optional: true,
      default: "16:9",
      enum: ["16:9", "9:16", "1:1", "4:3", "3:2", "2:3", "3:4", "21:9", "adaptive"],
      description: "Output aspect ratio. Use adaptive to let the model choose.",
    },
    aspect_ratio: {
      type: "string",
      optional: true,
      enum: ["16:9", "9:16", "1:1", "4:3", "3:2", "2:3", "3:4", "21:9", "adaptive"],
      description: "Deprecated alias for ratio.",
    },
    fps: { type: "integer", optional: true, default: 30, min: 1, max: 60, description: "Frames per second." },
    seed: { type: "integer", optional: true, description: "Random seed for reproducibility." },
    generate_audio: { type: "boolean", optional: true, default: true, description: "Generate synchronized audio." },
    return_last_frame: {
      type: "boolean",
      optional: true,
      default: true,
      description: "Return the last frame as an image for chaining video segments.",
    },
    camera_fixed: {
      type: "boolean",
      optional: true,
      default: false,
      description: "Fix camera position when supported.",
    },
    watermark: { type: "boolean", optional: true, default: false, description: "Add AI Generated watermark." },
    poll_interval: {
      type: "integer",
      optional: true,
      default: 2,
      min: 1,
      max: 30,
      description: "Seconds between task status checks.",
    },
    max_wait: {
      type: "integer",
      optional: true,
      default: defaults.maxWait,
      min: 30,
      max: 1800,
      description: "Maximum seconds to wait for task completion.",
    },
  } satisfies GenerationModelDeclaration["parameters"];
}

function klingVideoParameters(options: {
  maxDuration: number;
  negativePrompt?: boolean;
  seed?: boolean;
  sound?: boolean;
}) {
  const parameters: GenerationModelDeclaration["parameters"] = {
    duration: {
      type: "integer",
      optional: true,
      default: 5,
      min: 5,
      max: options.maxDuration,
      description: "Video duration in seconds.",
    },
    aspect_ratio: {
      type: "string",
      optional: true,
      default: "16:9",
      enum: ["16:9", "9:16", "1:1"],
      description: "Output aspect ratio.",
    },
    mode: {
      type: "string",
      optional: true,
      default: "std",
      enum: ["std", "pro"],
      description: "Kling generation mode.",
    },
    cfg_scale: {
      type: "number",
      optional: true,
      default: 0.5,
      min: 0,
      max: 1,
      description: "Prompt adherence scale.",
    },
    poll_interval: {
      type: "integer",
      optional: true,
      default: 5,
      min: 1,
      max: 30,
      description: "Seconds between task status checks.",
    },
    max_wait: {
      type: "integer",
      optional: true,
      default: 900,
      min: 30,
      max: 1800,
      description: "Maximum seconds to wait for task completion.",
    },
  };
  if (options.negativePrompt) {
    parameters.negative_prompt = {
      type: "string",
      optional: true,
      description: "Negative prompt.",
    };
  }
  if (options.seed) {
    parameters.seed = {
      type: "integer",
      optional: true,
      description: "Random seed for reproducibility.",
    };
  }
  if (options.sound) {
    parameters.sound = {
      type: "string",
      optional: true,
      enum: ["on", "off"],
      description: "Enable or disable generated sound when supported.",
    };
  }
  return parameters;
}

const sunoTaskParameters = {
  poll_interval: {
    type: "integer",
    optional: true,
    default: 5,
    min: 1,
    max: 60,
    description: "Seconds between task status checks.",
  },
  max_wait: {
    type: "integer",
    optional: true,
    default: 600,
    min: 30,
    max: 3600,
    description: "Maximum seconds to wait for task completion.",
  },
} satisfies GenerationModelDeclaration["parameters"];

const sunoCommonMetaFields = {
  title: { type: "string", optional: true, description: "Suno song title." },
  tags: { type: "string", optional: true, description: "Comma-separated Suno music style tags." },
  gpt_description_prompt: { type: "string", optional: true, description: "Suno inspiration-mode prompt." },
  negative_tags: { type: "string", optional: true, description: "Styles to avoid." },
  generation_type: { type: "string", optional: true, description: "Suno generation type." },
  make_instrumental: { type: "boolean", optional: true, default: false, description: "Generate instrumental music." },
  metadata: { type: "object", optional: true, description: "Suno provider metadata payload." },
  metadata_params: {
    type: "object",
    optional: true,
    description: "Suno task-specific metadata payload.",
  },
} satisfies NonNullable<GenerationModelDeclaration["meta"]>["fields"];

const sunoTaskVariants = {
  extend: { required: ["continue_clip_id"] },
  upload_extend: { required: ["continue_clip_id"] },
  infill: { required: ["continue_clip_id", "metadata_params"] },
  fixed_infill: { required: ["continue_clip_id", "metadata_params"] },
  infill_intro: { required: ["continue_clip_id", "metadata_params"] },
  infill_outro: { required: ["continue_clip_id", "metadata_params"] },
  cover_infill: { required: ["continue_clip_id", "metadata_params"] },
  cover_extend: { required: ["continue_clip_id"] },
  artist_infill: { required: ["continue_clip_id", "metadata_params"] },
  artist_consistency: { required: ["persona_id", "artist_clip_id"] },
  cover: { required: ["task_id", "continue_clip_id"] },
  image_to_song: { requiredContent: ["image"], required: ["metadata_params"] },
  video_to_song: { requiredContent: ["video"], required: ["metadata_params"] },
  concat: { required: ["clip_id"] },
  sound: { required: ["metadata_params"] },
  underpainting: { required: ["metadata_params"] },
  overpainting: { required: ["metadata_params"] },
  remaster: { required: ["metadata_params"] },
  vox: { required: ["artist_clip_id"] },
  chop_sample_condition: { required: ["metadata_params"] },
  mashup_condition: { required: ["metadata_params"] },
  playlist_condition: { required: ["metadata_params"] },
} satisfies NonNullable<GenerationModelDeclaration["meta"]>["taskVariants"];

function sunoContentInput(
  options: { text?: "required" | "optional" | "none"; audio?: boolean; image?: boolean; video?: boolean } = {},
): GenerationModelDeclaration["content"]["input"] {
  const input: GenerationModelDeclaration["content"]["input"] = [];
  if (options.text !== "none") {
    input.push({
      type: "text",
      required: options.text === "required",
      max: 16,
      merge: "newline",
      description:
        "Prompt text. The adapter maps merged text to the operation's text field when that field is not provided.",
    });
  }
  if (options.audio) {
    input.push({
      type: "audio",
      required: true,
      max: 1,
      sources: ["url", "base64"],
      description: "Reference audio.",
    });
  }
  if (options.image) {
    input.push({
      type: "image",
      required: true,
      max: 1,
      sources: ["url", "base64"],
      description: "Reference image.",
    });
  }
  if (options.video) {
    input.push({
      type: "video",
      required: true,
      max: 1,
      sources: ["url", "base64"],
      description: "Reference video.",
    });
  }
  return input;
}

const sunoVersions = [
  { model: "suno_music_chirp_fenix", title: "Suno Music Chirp Fenix v5.5", mv: "chirp-fenix" },
] as const;

const sunoMusicExample = {
  title: "Music generation",
  request: {
    model: "suno_music_chirp_fenix",
    content: [{ type: "text", text: "uplifting cinematic pop with warm piano and clear chorus" }],
    meta: {
      title: "Warm Horizon",
      tags: "cinematic pop, warm piano",
      make_instrumental: false,
    },
  },
} satisfies NonNullable<GenerationModelDeclaration["examples"]>[number];

function sunoVersionModel(version: (typeof sunoVersions)[number]): GenerationModelDeclaration {
  return {
    schema: MODEL_SCHEMA,
    model: version.model,
    title: version.title,
    description: "Suno text-to-music model with a fixed Suno model version.",
    adapter: { type: "suno.tasks", operation: "music", payload: { mv: version.mv } },
    content: {
      input: sunoContentInput({ text: "required" }),
    },
    parameters: sunoTaskParameters,
    meta: {
      fields: sunoCommonMetaFields,
    },
    ...(version.model === "suno_music_chirp_fenix" ? { examples: [sunoMusicExample] } : {}),
  };
}

function sunoTaskModel(options: {
  model: string;
  title: string;
  description: string;
  task: string;
  mv?: string;
  content?: Parameters<typeof sunoContentInput>[0];
  fields?: NonNullable<GenerationModelDeclaration["meta"]>["fields"];
  examples?: GenerationModelDeclaration["examples"];
}): GenerationModelDeclaration {
  return {
    schema: MODEL_SCHEMA,
    model: options.model,
    title: options.title,
    description: options.description,
    adapter: {
      type: "suno.tasks",
      operation: "music",
      task: options.task,
      payload: { mv: options.mv ?? "chirp-v5" },
    },
    content: {
      input: sunoContentInput(options.content ?? { text: "optional" }),
    },
    parameters: sunoTaskParameters,
    meta: {
      fields: {
        ...sunoCommonMetaFields,
        ...options.fields,
      },
      taskVariants: sunoTaskVariants,
    },
    ...(options.examples ? { examples: options.examples } : {}),
  };
}

const sunoModels = [
  ...sunoVersions.map(sunoVersionModel),
  {
    schema: MODEL_SCHEMA,
    model: "suno_style_tags",
    title: "Suno Style Tags",
    description: "Suno style tag upsampling model.",
    adapter: { type: "suno.tasks", operation: "upsample_tags" },
    content: {
      input: sunoContentInput({ text: "required" }),
    },
  },
  {
    schema: MODEL_SCHEMA,
    model: "suno_upload_audio",
    title: "Suno Upload Audio",
    description: "Suno reference-audio upload model.",
    adapter: { type: "suno.tasks", operation: "upload_audio", defaults: { name: "reference-audio", timeout: 120 } },
    content: {
      input: sunoContentInput({ text: "none", audio: true }),
    },
    parameters: sunoTaskParameters,
    meta: {
      fields: {
        name: { type: "string", optional: true, description: "Upload name." },
        timeout: { type: "integer", optional: true, description: "Upload timeout in seconds." },
      },
    },
  },
  sunoTaskModel({
    model: "suno_image_to_song_chirp_v5",
    title: "Suno Image to Song Chirp v5.0",
    description: "Suno image-to-song task with a fixed chirp-v5 engine.",
    task: "image_to_song",
    content: { text: "optional", image: true },
    fields: {
      metadata_params: { type: "object", description: "Image-to-song metadata payload." },
    },
  }),
  sunoTaskModel({
    model: "suno_video_to_song_chirp_v5",
    title: "Suno Video to Song Chirp v5.0",
    description: "Suno video-to-song task with a fixed chirp-v5 engine.",
    task: "video_to_song",
    content: { text: "optional", video: true },
    fields: {
      metadata_params: { type: "object", description: "Video-to-song metadata payload." },
    },
  }),
  sunoTaskModel({
    model: "suno_sound_chirp_v5",
    title: "Suno Sound Chirp v5.0",
    description: "Suno sound-effect generation task with a fixed chirp-v5 engine.",
    task: "sound",
    content: { text: "optional" },
    fields: {
      metadata_params: { type: "object", description: "Sound task metadata payload." },
    },
  }),
  sunoTaskModel({
    model: "suno_cover_chirp_v5",
    title: "Suno Cover Chirp v5.0",
    description: "Suno cover task with a fixed chirp-v5 engine.",
    task: "cover",
    content: { text: "optional" },
    fields: {
      cover_clip_id: { type: "string", description: "Clip id to cover." },
      task_id: { type: "string", description: "Source Suno task id used for cover routing." },
      continue_clip_id: { type: "string", description: "Source clip id used for cover generation." },
      continue_at: { type: "number", optional: true, description: "Source clip continuation position in seconds." },
    },
  }),
  sunoTaskModel({
    model: "suno_infill_chirp_v5",
    title: "Suno Infill Chirp v5.0",
    description: "Suno local edit task with a fixed chirp-v5 engine.",
    task: "infill",
    content: { text: "optional" },
    fields: {
      continue_clip_id: { type: "string", description: "Clip id to edit." },
      metadata_params: { type: "object", description: "Infill timing and replacement metadata." },
    },
  }),
  sunoTaskModel({
    model: "suno_vox_chirp_v5",
    title: "Suno Vox Chirp v5.0",
    description: "Suno hum-to-song task with a fixed chirp-v5 engine.",
    task: "vox",
    content: { text: "optional" },
    fields: {
      artist_clip_id: { type: "string", description: "Reference hum or vocal clip id." },
    },
  }),
] satisfies GenerationModelDeclaration[];

const builtinModels = [
  {
    schema: MODEL_SCHEMA,
    model: "gpt-image-2",
    title: "GPT Image 2",
    description:
      "Image generation model with optional reference images. Good for photorealistic scenes, detailed images, and image editing with references.",
    adapter: { type: "openai.images" },
    content: {
      input: [
        { type: "text", required: true, min: 1, max: 16, merge: "newline", description: "Prompt text." },
        {
          type: "image",
          required: false,
          max: 16,
          sources: ["url", "base64"],
          description: "Optional reference images.",
        },
      ],
    },
    parameters: imageSizeParameters,
    examples: [
      {
        title: "Basic image",
        request: {
          model: "gpt-image-2",
          content: [{ type: "text", text: "a cyberpunk cat in neon rain" }],
          parameters: { size: "1024x1024", quality: "auto" },
        },
      },
    ],
  },
  {
    schema: MODEL_SCHEMA,
    model: "z-image-turbo",
    title: "Z-Image Turbo",
    description:
      "Fast text-to-image generation through Neta Router. Z-Image Turbo accepts prompt text only; it does not support reference images.",
    adapter: { type: "openai.images" },
    content: {
      input: [{ type: "text", required: true, min: 1, max: 16, merge: "newline", description: "Prompt text." }],
    },
    parameters: zImageTurboParameters,
    examples: [
      {
        title: "Text to image",
        request: {
          model: "z-image-turbo",
          content: [
            { type: "text", text: "a clean product-style image of a small red toy robot standing on a white desk" },
          ],
          parameters: { size: "1024*1024" },
        },
      },
    ],
  },
  {
    schema: MODEL_SCHEMA,
    model: "krea2",
    title: "Krea 2",
    description: "Krea 2 text-to-image generation through Neta Router.",
    adapter: { type: "openai.images" },
    content: {
      input: [{ type: "text", required: true, min: 1, max: 16, merge: "newline", description: "Prompt text." }],
    },
    parameters: krea2ImageParameters,
    examples: [
      {
        title: "Text to image",
        request: {
          model: "krea2",
          content: [{ type: "text", text: "a cinematic mountain cabin at sunrise, soft natural light" }],
          parameters: { size: "1536x1024", seed: 123456 },
        },
      },
    ],
  },
  {
    schema: MODEL_SCHEMA,
    model: "qwen-image-edit",
    title: "Qwen Image Edit",
    description: "Neta Qwen image editing with one source image URL and an edit instruction.",
    adapter: { type: "openai.imageEdits" },
    content: {
      input: [
        { type: "text", required: true, min: 1, max: 16, merge: "newline", description: "Edit instruction." },
        {
          type: "image",
          required: true,
          min: 1,
          max: 1,
          sources: ["url"],
          description: "Source image URL to edit.",
        },
      ],
    },
    parameters: qwenImageEditParameters,
    examples: [
      {
        title: "Edit image",
        request: {
          model: "qwen-image-edit",
          content: [
            { type: "text", text: "change the background to a clean white studio backdrop" },
            { type: "image", source: { type: "url", url: "https://example.com/input.png" } },
          ],
          parameters: { size: "1024x1024" },
        },
      },
    ],
  },
  {
    schema: MODEL_SCHEMA,
    model: "gemini-3.1-flash-image-preview",
    title: "Gemini 3.1 Flash Image Preview",
    description:
      "Gemini image generation and editing model. Good for text rendering, infographics, style transfer, and iterative image editing with references.",
    adapter: { type: "gemini.generateContent" },
    content: {
      input: [
        { type: "text", required: true, min: 1, max: 16, merge: "newline", description: "Prompt text." },
        {
          type: "image",
          required: false,
          max: 14,
          sources: ["url", "base64"],
          description: "Optional reference images.",
        },
      ],
    },
    parameters: {
      aspect_ratio: {
        type: "string",
        optional: true,
        default: "1:1",
        enum: ["1:1", "16:9", "4:3", "3:2", "3:4", "2:3", "9:16", "5:4", "4:5", "21:9", "1:4", "4:1", "1:8", "8:1"],
        description: "Output aspect ratio.",
      },
      image_size: {
        type: "string",
        optional: true,
        default: "2K",
        enum: ["512", "1K", "2K", "4K"],
        description: "Output image resolution.",
      },
    },
    examples: [
      {
        title: "Basic image",
        request: {
          model: "gemini-3.1-flash-image-preview",
          content: [
            { type: "text", text: "a vibrant infographic explaining photosynthesis with clear readable labels" },
          ],
          parameters: { aspect_ratio: "16:9", image_size: "1K" },
        },
      },
    ],
  },
  {
    schema: MODEL_SCHEMA,
    model: "kling-text-to-video",
    title: "Kling Text To Video",
    description: "Kling latest text-to-video generation through Neta Router.",
    adapter: { type: "kling.videoGenerations" },
    content: {
      input: [{ type: "text", required: true, min: 1, max: 16, merge: "newline", description: "Video prompt." }],
    },
    parameters: klingVideoParameters({ maxDuration: 10, negativePrompt: true, seed: true }),
    examples: [
      {
        title: "Text to video",
        request: {
          model: "kling-text-to-video",
          content: [{ type: "text", text: "a small paper boat floating on calm water, cinematic motion" }],
          parameters: { duration: 5, aspect_ratio: "16:9", mode: "std" },
        },
      },
    ],
  },
  {
    schema: MODEL_SCHEMA,
    model: "kling-image-to-video",
    title: "Kling Image To Video",
    description: "Kling latest image-to-video generation through Neta Router.",
    adapter: { type: "kling.videoGenerations" },
    content: {
      input: [
        { type: "text", required: true, min: 1, max: 16, merge: "newline", description: "Video prompt." },
        {
          type: "image",
          required: false,
          max: 2,
          sources: ["url", "base64"],
          description:
            "First frame and optional tail frame image input. Provider-native image input may be passed in meta.",
        },
      ],
    },
    parameters: klingVideoParameters({ maxDuration: 10, negativePrompt: true, seed: true }),
    examples: [
      {
        title: "Image to video",
        request: {
          model: "kling-image-to-video",
          content: [
            { type: "text", text: "gently turn toward the camera with soft natural motion" },
            { type: "image", source: { type: "url", url: "https://example.com/input.png" } },
          ],
          parameters: { duration: 5, aspect_ratio: "16:9" },
        },
      },
    ],
  },
  {
    schema: MODEL_SCHEMA,
    model: "kling-omni-video",
    title: "Kling Omni Video",
    description: "Kling latest Omni-Video generation through Neta Router.",
    adapter: { type: "kling.videoGenerations" },
    content: {
      input: [
        {
          type: "text",
          required: false,
          max: 16,
          merge: "newline",
          description: "Optional video prompt. Use Kling Omni placeholders such as <<<image_1>>> with image_list.",
        },
        {
          type: "image",
          required: false,
          max: 2,
          sources: ["url", "base64"],
          description: "Optional simple image input. Provider-native Omni media arrays belong in request meta.",
        },
      ],
    },
    parameters: klingVideoParameters({ maxDuration: 15, sound: true }),
    meta: {
      fields: {
        multi_shot: {
          type: "boolean",
          optional: true,
          description: "Enable Kling Omni multi-shot mode.",
        },
        shot_type: {
          type: "string",
          optional: true,
          description: "Kling Omni shot type.",
        },
      },
    },
    examples: [
      {
        title: "Omni text to video",
        request: {
          model: "kling-omni-video",
          content: [{ type: "text", text: "a small paper boat floating on calm water, cinematic motion" }],
          parameters: { duration: 5, aspect_ratio: "16:9", mode: "std" },
        },
      },
      {
        title: "Omni image to video",
        request: {
          model: "kling-omni-video",
          content: [{ type: "text", text: "<<<image_1>>> gently turns toward the camera with soft natural motion" }],
          parameters: { duration: 5, aspect_ratio: "16:9" },
          meta: {
            image_list: [{ image_url: "https://example.com/input.png", type: "first_frame" }],
          },
        },
      },
    ],
  },
  {
    schema: MODEL_SCHEMA,
    model: "kling-multi-image-to-video",
    title: "Kling Multi-Image Reference To Video",
    description: "Kling latest multi-image reference video generation through Neta Router.",
    adapter: { type: "kling.videoGenerations" },
    content: {
      input: [
        { type: "text", required: true, min: 1, max: 16, merge: "newline", description: "Video prompt." },
        {
          type: "image",
          required: false,
          max: 4,
          sources: ["url", "base64"],
          description: "Reference image inputs. Provider-native image_list input may be passed in meta.",
        },
      ],
    },
    parameters: klingVideoParameters({ maxDuration: 10, negativePrompt: true, seed: true }),
    examples: [
      {
        title: "Multi-image reference to video",
        request: {
          model: "kling-multi-image-to-video",
          content: [
            { type: "text", text: "combine the references into one cinematic shot" },
            { type: "image", source: { type: "url", url: "https://example.com/reference-1.png" } },
            { type: "image", source: { type: "url", url: "https://example.com/reference-2.png" } },
          ],
          parameters: { duration: 5, aspect_ratio: "16:9" },
        },
      },
    ],
  },
  {
    schema: MODEL_SCHEMA,
    model: "noobxl-t2i-onediff",
    title: "NoobXL T2I OneDiff",
    description: "NoobXL text-to-image model.",
    allowUnknownParameters: true,
    adapter: { type: "openai.images" },
    content: {
      input: [{ type: "text", required: true, min: 1, max: 16, merge: "newline", description: "Prompt text." }],
    },
    parameters: noobxlImageParameters,
    examples: [
      {
        title: "Text to image",
        request: {
          model: "noobxl-t2i-onediff",
          content: [{ type: "text", text: "anime key visual, luminous city at night, crisp linework" }],
          parameters: { size: "1024x1024", negative_prompt: "low quality, blurry" },
        },
      },
    ],
  },
  {
    schema: MODEL_SCHEMA,
    model: "noobxl-i2i-ipa-onediff",
    title: "NoobXL I2I IPA OneDiff",
    description: "NoobXL image-to-image model with optional face reference controls.",
    allowUnknownParameters: true,
    adapter: { type: "openai.images" },
    content: {
      input: [
        { type: "text", required: true, min: 1, max: 16, merge: "newline", description: "Prompt text." },
        {
          type: "image",
          required: true,
          min: 1,
          max: 1,
          sources: ["url", "base64"],
          description: "Single source image.",
        },
      ],
    },
    parameters: noobxlImageToImageParameters,
    examples: [
      {
        title: "Image to image",
        request: {
          model: "noobxl-i2i-ipa-onediff",
          content: [
            { type: "text", text: "keep the character identity, redraw as a polished anime illustration" },
            { type: "image", source: { type: "url", url: "https://example.com/reference.png" } },
          ],
          parameters: { size: "1024x1024", controlnet_weight: 0.8 },
        },
      },
    ],
  },
  {
    schema: MODEL_SCHEMA,
    model: "birefnet-general",
    title: "BiRefNet General",
    description: "BiRefNet single-image segmentation and background removal model.",
    adapter: { type: "openai.images" },
    content: {
      input: [
        {
          type: "image",
          required: true,
          min: 1,
          max: 1,
          sources: ["url", "base64"],
          description: "Single source image.",
        },
      ],
    },
    examples: [
      {
        title: "Remove background",
        request: {
          model: "birefnet-general",
          content: [{ type: "image", source: { type: "url", url: "https://example.com/portrait.png" } }],
        },
      },
    ],
  },
  {
    schema: MODEL_SCHEMA,
    model: "seedance-2-0",
    title: "Seedance 2.0",
    description: "Higher quality Ark video generation model for final production outputs.",
    adapter: { type: "ark.videoGenerations" },
    content: {
      input: [
        { type: "text", required: true, min: 1, max: 16, merge: "newline", description: "Video prompt." },
        {
          type: "image",
          required: false,
          max: 9,
          sources: ["url"],
          roles: ["first_frame", "last_frame", "reference_image"],
          description: "Optional public URL image input. Use meta.role as first_frame, last_frame, or reference_image.",
        },
        {
          type: "video",
          required: false,
          max: 1,
          sources: ["url"],
          roles: ["reference_video"],
          roleRequired: true,
          description: "Optional public URL reference video input. Use meta.role as reference_video.",
        },
      ],
    },
    parameters: seedanceVideoParameters({ resolution: "1080p", maxWait: 900 }),
    examples: [
      {
        title: "Text to video",
        request: {
          model: "seedance-2-0",
          content: [
            {
              type: "text",
              text: "a cat playing piano in a cozy jazz club, cinematic lighting, smooth camera movement",
            },
          ],
          parameters: { duration: 5, resolution: "1080p", ratio: "16:9" },
        },
      },
    ],
  },
  {
    schema: MODEL_SCHEMA,
    model: "seedance-2-0-fast",
    title: "Seedance 2.0 Fast",
    description:
      "Fast Ark video generation model for drafts, rapid iteration, text-to-video, image-to-video, and reference-guided video generation.",
    adapter: { type: "ark.videoGenerations" },
    content: {
      input: [
        { type: "text", required: true, min: 1, max: 16, merge: "newline", description: "Video prompt." },
        {
          type: "image",
          required: false,
          max: 9,
          sources: ["url"],
          roles: ["first_frame", "last_frame", "reference_image"],
          description: "Optional public URL image input. Use meta.role as first_frame, last_frame, or reference_image.",
        },
        {
          type: "video",
          required: false,
          max: 1,
          sources: ["url"],
          roles: ["reference_video"],
          roleRequired: true,
          description: "Optional public URL reference video input. Use meta.role as reference_video.",
        },
      ],
    },
    parameters: seedanceVideoParameters({ resolution: "720p", maxWait: 600 }),
    examples: [
      {
        title: "Text to video",
        request: {
          model: "seedance-2-0-fast",
          content: [
            {
              type: "text",
              text: "a cat playing piano in a cozy jazz club, cinematic lighting, smooth camera movement",
            },
          ],
          parameters: { duration: 5, resolution: "720p", ratio: "16:9" },
        },
      },
    ],
  },
  ...sunoModels,
] satisfies GenerationModelDeclaration[];

export const builtinGenerationModels: GenerationModelDeclaration[] = cloneJson(builtinModels);

export function getBuiltinGenerationModel(model: string): GenerationModelDeclaration | null {
  return cloneJson(builtinModels.find((declaration) => declaration.model === model) ?? null);
}

export function listBuiltinGenerationModels(): GenerationModelDeclaration[] {
  return cloneJson(builtinModels);
}
