import { describe, expect, it, vi } from "vitest";
import { createGenerationClient, type GenerationContentBlock } from "../../src/index.js";

type CapturedRequest = {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown> | undefined;
};

function textBlock(text: string): GenerationContentBlock {
  return { type: "text", text };
}

function imageBlock(url: string, meta?: Record<string, unknown>): GenerationContentBlock {
  return {
    type: "image",
    source: { type: "url", url },
    ...(meta ? { meta } : {}),
  };
}

function base64ImageBlock(data: string, meta?: Record<string, unknown>): GenerationContentBlock {
  return {
    type: "image",
    source: { type: "base64", mediaType: "image/png", data },
    ...(meta ? { meta } : {}),
  };
}

function createClient() {
  const requests: CapturedRequest[] = [];
  const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    requests.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body,
    });

    if (requests.length === 1) {
      return new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        status: "completed",
        progress: 100,
        metadata: { url: "https://example.com/output.mp4" },
      }),
      { status: 200 },
    );
  };
  return {
    client: createGenerationClient({
      apiKey: "sk-test",
      baseUrl: "https://router.example",
      fetch: fetchMock as typeof fetch,
    }),
    requests,
  };
}

function createDebugClient() {
  const events: unknown[] = [];
  const fetchMock = async () => {
    throw new Error("fetch should not be called");
  };
  return {
    client: createGenerationClient({
      apiKey: "sk-test",
      baseUrl: "https://router.example",
      debug: {
        enabled: true,
        includeSensitive: true,
        logger: (event) => {
          events.push(event);
          throw new Error("stop after debug request");
        },
      },
      fetch: fetchMock as typeof fetch,
    }),
    events,
  };
}

async function generateWithTimers<T>(value: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(1000);
  return value;
}

describe("kling.videoGenerations adapter", () => {
  it("registers only latest Kling capability models", () => {
    const client = createGenerationClient({ apiKey: "sk-test" });
    const modelIds = client
      .listModels()
      .map((model) => model.model)
      .filter((model) => model.startsWith("kling"))
      .sort();

    expect(modelIds).toEqual([
      "kling-image-to-video",
      "kling-multi-image-to-video",
      "kling-omni-video",
      "kling-text-to-video",
      "kling-v3",
    ]);
  });

  it("posts latest Kling text-to-video payload", async () => {
    vi.useFakeTimers();
    try {
      const { client, requests } = createClient();
      const outputPromise = client.generate({
        model: "kling-text-to-video",
        content: [textBlock("paper boat on calm water")],
        parameters: {
          duration: 10,
          aspect_ratio: "9:16",
          mode: "pro",
          cfg_scale: 0.7,
          negative_prompt: "blurry",
          seed: 123,
          poll_interval: 1,
        },
        meta: { cohub: { taskRunId: "internal" } },
      });

      const output = await generateWithTimers(outputPromise);

      expect(requests[0]?.url).toBe("https://router.example/kling/v1/videos/text2video");
      expect(requests[0]?.method).toBe("POST");
      expect(requests[0]?.headers.get("authorization")).toBe("Bearer sk-test");
      expect(requests[1]?.url).toBe("https://router.example/kling/v1/videos/text2video/task-1");
      expect(requests[0]?.body).toEqual({
        model_name: "kling-v3",
        prompt: "paper boat on calm water",
        duration: "10",
        mode: "pro",
        cfg_scale: 0.7,
        aspect_ratio: "9:16",
        negative_prompt: "blurry",
        seed: 123,
      });
      expect(output).toEqual([
        {
          type: "video",
          source: { type: "url", url: "https://example.com/output.mp4" },
          meta: { task_id: "task-1", status: "succeeded", progress: 100 },
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("posts latest Kling image-to-video payload", async () => {
    vi.useFakeTimers();
    try {
      const { client, requests } = createClient();
      const outputPromise = client.generate({
        model: "kling-image-to-video",
        content: [
          textBlock("gently turn toward the camera"),
          imageBlock("https://example.com/first.png"),
          imageBlock("https://example.com/last.png"),
        ],
        parameters: { poll_interval: 1 },
      });

      await generateWithTimers(outputPromise);

      expect(requests[0]?.url).toBe("https://router.example/kling/v1/videos/image2video");
      expect(requests[0]?.body).toEqual({
        model_name: "kling-v3",
        prompt: "gently turn toward the camera",
        duration: "5",
        mode: "std",
        cfg_scale: 0.5,
        aspect_ratio: "16:9",
        image: "https://example.com/first.png",
        image_tail: "https://example.com/last.png",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("posts provider-native Kling image meta payload", async () => {
    vi.useFakeTimers();
    try {
      const { client, requests } = createClient();
      const outputPromise = client.generate({
        model: "kling-image-to-video",
        content: [textBlock("gently turn toward the camera")],
        parameters: { poll_interval: 1 },
        meta: { image: "provider-native-image-base64" },
      });

      await generateWithTimers(outputPromise);

      expect(requests[0]?.body).toMatchObject({
        image: "provider-native-image-base64",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes kling-v3 text-only requests to text-to-video", async () => {
    vi.useFakeTimers();
    try {
      const { client, requests } = createClient();
      const outputPromise = client.generate({
        model: "kling-v3",
        content: [textBlock("paper boat on calm water")],
        parameters: { duration: 10, aspect_ratio: "9:16", mode: "pro", poll_interval: 1 },
      });

      await generateWithTimers(outputPromise);

      expect(requests[0]?.url).toBe("https://router.example/kling/v1/videos/text2video");
      expect(requests[1]?.url).toBe("https://router.example/kling/v1/videos/text2video/task-1");
      expect(requests[0]?.body).toEqual({
        model_name: "kling-v3",
        prompt: "paper boat on calm water",
        duration: "10",
        mode: "pro",
        cfg_scale: 0.5,
        aspect_ratio: "9:16",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes kling-v3 image requests to image-to-video", async () => {
    vi.useFakeTimers();
    try {
      const { client, requests } = createClient();
      const outputPromise = client.generate({
        model: "kling-v3",
        content: [
          textBlock("gently turn toward the camera"),
          imageBlock("https://example.com/first.png"),
          imageBlock("https://example.com/last.png"),
        ],
        parameters: { poll_interval: 1 },
      });

      await generateWithTimers(outputPromise);

      expect(requests[0]?.url).toBe("https://router.example/kling/v1/videos/image2video");
      expect(requests[1]?.url).toBe("https://router.example/kling/v1/videos/image2video/task-1");
      expect(requests[0]?.body).toEqual({
        model_name: "kling-v3",
        prompt: "gently turn toward the camera",
        duration: "5",
        mode: "std",
        cfg_scale: 0.5,
        aspect_ratio: "16:9",
        image: "https://example.com/first.png",
        image_tail: "https://example.com/last.png",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes kling-v3 native image meta to image-to-video", async () => {
    vi.useFakeTimers();
    try {
      const { client, requests } = createClient();
      const outputPromise = client.generate({
        model: "kling-v3",
        content: [textBlock("gently turn toward the camera")],
        parameters: { poll_interval: 1 },
        meta: { image: "provider-native-image-base64" },
      });

      await generateWithTimers(outputPromise);

      expect(requests[0]?.url).toBe("https://router.example/kling/v1/videos/image2video");
      expect(requests[0]?.body).toMatchObject({
        model_name: "kling-v3",
        image: "provider-native-image-base64",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects omni media on kling-v3", async () => {
    const { client, requests } = createClient();
    await expect(
      client.generate({
        model: "kling-v3",
        content: [textBlock("follow the reference")],
        meta: { element_list: [{ element_id: 123 }] },
      }),
    ).rejects.toThrow("kling-v3 only supports text-to-video and image-to-video");
    await expect(
      client.generate({
        model: "kling-v3",
        content: [textBlock("follow the reference")],
        meta: { video_list: [{ video_url: "https://example.com/ref.mp4" }] },
      }),
    ).rejects.toThrow("kling-v3 only supports text-to-video and image-to-video");
    await expect(
      client.generate({
        model: "kling-v3",
        content: [textBlock("follow the reference")],
        meta: { image_list: [{ image_url: "https://example.com/ref.png", type: "first_frame" }] },
      }),
    ).rejects.toThrow("kling-v3 only supports text-to-video and image-to-video");
    expect(requests).toHaveLength(0);
  });

  it("posts bare base64 for latest Kling image-to-video payload", async () => {
    vi.useFakeTimers();
    try {
      const { client, requests } = createClient();
      const outputPromise = client.generate({
        model: "kling-image-to-video",
        content: [
          textBlock("gently turn toward the camera"),
          base64ImageBlock("first-frame-base64"),
          base64ImageBlock("last-frame-base64"),
        ],
        parameters: { poll_interval: 1 },
      });

      await generateWithTimers(outputPromise);

      expect(requests[0]?.body).toMatchObject({
        image: "first-frame-base64",
        image_tail: "last-frame-base64",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("posts latest Kling Omni-Video payload", async () => {
    vi.useFakeTimers();
    try {
      const { client, requests } = createClient();
      const outputPromise = client.generate({
        model: "kling-omni-video",
        content: [
          textBlock("<<<image_1>>> moves toward <<<image_2>>>"),
          imageBlock("https://example.com/first.png", { role: "first_frame" }),
          imageBlock("https://example.com/last.png", { role: "last_frame" }),
        ],
        parameters: { sound: "on", poll_interval: 1 },
      });

      await generateWithTimers(outputPromise);

      expect(requests[0]?.url).toBe("https://router.example/kling/v1/videos/omni-video");
      expect(requests[0]?.body).toEqual({
        model_name: "kling-v3-omni",
        prompt: "<<<image_1>>> moves toward <<<image_2>>>",
        duration: "5",
        mode: "std",
        cfg_scale: 0.5,
        aspect_ratio: "16:9",
        sound: "on",
        image_list: [
          { image_url: "https://example.com/first.png", type: "first_frame" },
          { image_url: "https://example.com/last.png", type: "end_frame" },
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("redacts Kling base64 payloads from debug events", async () => {
    const { client, events } = createDebugClient();

    await expect(
      client.generate({
        model: "kling-image-to-video",
        content: [
          textBlock("move"),
          base64ImageBlock("image-first-base64"),
          {
            type: "image",
            source: { type: "base64", mediaType: "image/png", data: "data:image/png;base64,image-last-base64" },
          },
        ],
        parameters: { poll_interval: 1 },
      }),
    ).rejects.toThrow("stop after debug request");
    await expect(
      client.generate({
        model: "kling-image-to-video",
        content: [textBlock("move")],
        meta: {
          image: "provider-native-base64",
        },
      }),
    ).rejects.toThrow("stop after debug request");
    await expect(
      client.generate({
        model: "kling-multi-image-to-video",
        content: [textBlock("combine")],
        meta: { image_list: [{ image: "provider-native-list-base64" }] },
      }),
    ).rejects.toThrow("stop after debug request");

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("image-first-base64");
    expect(serialized).not.toContain("image-last-base64");
    expect(serialized).not.toContain("provider-native-base64");
    expect(serialized).not.toContain("provider-native-list-base64");
    expect(serialized).toContain("[REDACTED]");
  });

  it("posts bare base64 for latest Kling Omni-Video payload", async () => {
    vi.useFakeTimers();
    try {
      const { client, requests } = createClient();
      const outputPromise = client.generate({
        model: "kling-omni-video",
        content: [
          textBlock("<<<image_1>>> moves toward <<<image_2>>>"),
          base64ImageBlock("omni-first-base64", { role: "first_frame" }),
          base64ImageBlock("omni-last-base64", { role: "last_frame" }),
        ],
        parameters: { poll_interval: 1 },
      });

      await generateWithTimers(outputPromise);

      expect(requests[0]?.body).toMatchObject({
        image_list: [
          { image_url: "omni-first-base64", type: "first_frame" },
          { image_url: "omni-last-base64", type: "end_frame" },
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves official Omni media meta arrays", async () => {
    vi.useFakeTimers();
    try {
      const imageList = [{ image_url: "https://example.com/ref.png", type: "first_frame" }];
      const elementList = [{ element_id: "subject" }];
      const { client, requests } = createClient();
      const outputPromise = client.generate({
        model: "kling-omni-video",
        content: [],
        parameters: { poll_interval: 1 },
        meta: {
          image_list: imageList,
          element_list: elementList,
          cohub: { taskRunId: "internal" },
        },
      });

      await generateWithTimers(outputPromise);

      expect(requests[0]?.body).toEqual({
        model_name: "kling-v3-omni",
        image_list: imageList,
        element_list: elementList,
        duration: "5",
        mode: "std",
        cfg_scale: 0.5,
        aspect_ratio: "16:9",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects empty provider-native Kling media inputs", async () => {
    const client = createGenerationClient({ apiKey: "sk-test" });

    expect(() =>
      client.validate({
        model: "kling-image-to-video",
        content: [textBlock("move")],
        meta: { image: "" },
      }),
    ).not.toThrow();
    await expect(
      client.generate({
        model: "kling-image-to-video",
        content: [textBlock("move")],
        meta: { image: "" },
      }),
    ).rejects.toThrow("Image input is required");

    await expect(
      client.generate({
        model: "kling-multi-image-to-video",
        content: [textBlock("combine")],
        meta: { image_list: [] },
      }),
    ).rejects.toThrow("Multi-image input is required");

    await expect(
      client.generate({
        model: "kling-omni-video",
        content: [],
        meta: { image_list: [] },
      }),
    ).rejects.toThrow("Prompt text or Omni media input is required");

    await expect(
      client.generate({
        model: "kling-omni-video",
        content: [],
        meta: { multi_shot: true },
      }),
    ).rejects.toThrow("Prompt text or Omni media input is required");
  });

  it("posts latest Kling multi-image reference video payload", async () => {
    vi.useFakeTimers();
    try {
      const { client, requests } = createClient();
      const outputPromise = client.generate({
        model: "kling-multi-image-to-video",
        content: [
          textBlock("combine the references into one cinematic shot"),
          imageBlock("https://example.com/ref-1.png"),
          imageBlock("https://example.com/ref-2.png"),
        ],
        parameters: { poll_interval: 1 },
      });

      await generateWithTimers(outputPromise);

      expect(requests[0]?.url).toBe("https://router.example/kling/v1/videos/multi-image2video");
      expect(requests[0]?.body).toEqual({
        model_name: "kling-v1-6",
        prompt: "combine the references into one cinematic shot",
        duration: "5",
        mode: "std",
        cfg_scale: 0.5,
        aspect_ratio: "16:9",
        image_list: [{ image: "https://example.com/ref-1.png" }, { image: "https://example.com/ref-2.png" }],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("posts provider-native Kling multi-image meta payload", async () => {
    vi.useFakeTimers();
    try {
      const imageList = [{ image: "provider-native-ref-1" }, { image: "provider-native-ref-2" }];
      const { client, requests } = createClient();
      const outputPromise = client.generate({
        model: "kling-multi-image-to-video",
        content: [textBlock("combine the references into one cinematic shot")],
        parameters: { poll_interval: 1 },
        meta: { image_list: imageList },
      });

      await generateWithTimers(outputPromise);

      expect(requests[0]?.body).toMatchObject({
        image_list: imageList,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("posts bare base64 for latest Kling multi-image reference video payload", async () => {
    vi.useFakeTimers();
    try {
      const { client, requests } = createClient();
      const outputPromise = client.generate({
        model: "kling-multi-image-to-video",
        content: [
          textBlock("combine the references into one cinematic shot"),
          base64ImageBlock("multi-ref-1-base64"),
          base64ImageBlock("multi-ref-2-base64"),
        ],
        parameters: { poll_interval: 1 },
      });

      await generateWithTimers(outputPromise);

      expect(requests[0]?.body).toMatchObject({
        image_list: [{ image: "multi-ref-1-base64" }, { image: "multi-ref-2-base64" }],
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
