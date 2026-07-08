import { describe, expect, it } from "vitest";
import {
  createGenerationClient,
  type GenerationClient,
  type GenerationProviderError,
  mergeGenerationResultMeta,
  openAiImagesAdapter,
} from "../../src/index.js";

describe("openai.images adapter", () => {
  it("keeps GenerationClient mocks source-compatible without generateResult", () => {
    const client: GenerationClient = {
      async generate() {
        return [];
      },
      validate(request) {
        return {
          declaration: {
            schema: "neta.generation.model.v1",
            model: request.model,
            adapter: { type: "openai.images" },
            content: { input: [] },
          },
          request,
          parameters: {},
          meta: {},
        };
      },
      listModels() {
        return [];
      },
      getModel() {
        return null;
      },
      stringifyModelConfig() {
        return "";
      },
      async exportModelConfig() {},
      async exportModelConfigs() {},
    };

    expect(client).toBeDefined();
  });

  it("merges router request ids", () => {
    expect(mergeGenerationResultMeta({ cost: 0.1 }, { costOrigin: 0.2 })).toEqual({
      cost: 0.1,
      costOrigin: 0.2,
    });
  });

  it("builds image generation requests", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({ data: [{ url: "https://example.com/out.png", revised_prompt: "revised" }] }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    };

    const client = createGenerationClient({ apiKey: "key", fetch: fetchMock as typeof fetch });
    const output = await client.generate({
      model: "gpt-image-2",
      content: [{ type: "text", text: "hello" }],
      parameters: { size: "1024x1024" },
    });

    expect(calls[0]?.url).toBe("https://router.neta.art/v1/images/generations");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      model: "gpt-image-2",
      prompt: "hello",
      size: "1024x1024",
    });
    expect(output[0]).toEqual({ type: "image", source: { type: "url", url: "https://example.com/out.png" } });
  });

  it("exposes new-api cost metadata through generateResult", async () => {
    let cloneCalls = 0;
    const fetchMock = async () =>
      trackClone(
        new Response(
          JSON.stringify({
            data: [{ url: "https://example.com/out.png" }],
            new_api: {
              request_id: "router-request-1",
              upstream_request_id: "newapi-request-1",
              cost: 0.12,
              cost_origin: 0.24,
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
        () => {
          cloneCalls += 1;
        },
      );

    const client = createGenerationClient({ apiKey: "key", fetch: fetchMock as typeof fetch });
    const result = await client.generateResult({
      model: "gpt-image-2",
      content: [{ type: "text", text: "hello" }],
    });

    expect(result.content[0]).toEqual({ type: "image", source: { type: "url", url: "https://example.com/out.png" } });
    expect(cloneCalls).toBe(1);
    expect(result.meta).toEqual({
      cost: 0.12,
      costOrigin: 0.24,
    });
  });

  it("keeps generate compatible without metadata response cloning", async () => {
    let cloneCalls = 0;
    const fetchMock = async () =>
      trackClone(
        new Response(JSON.stringify({ data: [{ url: "https://example.com/out.png" }], new_api: { cost: 0.12 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        () => {
          cloneCalls += 1;
        },
      );

    const client = createGenerationClient({ apiKey: "key", fetch: fetchMock as typeof fetch });
    await expect(
      client.generate({
        model: "gpt-image-2",
        content: [{ type: "text", text: "hello" }],
      }),
    ).resolves.toEqual([{ type: "image", source: { type: "url", url: "https://example.com/out.png" } }]);
    expect(cloneCalls).toBe(0);
  });

  it("keeps the public openai images adapter array return contract", async () => {
    const fetchMock = async () =>
      new Response(JSON.stringify({ data: [{ url: "https://example.com/out.png" }], new_api: { cost: 0.12 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const output = await openAiImagesAdapter({
      declaration: {
        schema: "neta.generation.model.v1",
        model: "gpt-image-2",
        adapter: { type: "openai.images" },
        content: { input: [{ type: "text", required: true }] },
      },
      request: { model: "gpt-image-2", content: [{ type: "text", text: "hello" }] },
      parameters: {},
      meta: {},
      context: {
        apiKey: "key",
        baseUrl: "https://router.neta.art",
        fetch: fetchMock as typeof fetch,
        resolveSource: (source) => {
          if (source.type === "url") return source.url;
          return source.data;
        },
      },
    });

    expect(Array.isArray(output)).toBe(true);
    expect(output).toEqual([{ type: "image", source: { type: "url", url: "https://example.com/out.png" } }]);
  });

  it("exposes numeric cost metadata without cost_origin", async () => {
    const fetchMock = async () =>
      new Response(
        JSON.stringify({
          data: [{ url: "https://example.com/out.png" }],
          new_api: {
            request_id: "router-request-1",
            cost: 0.12,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );

    const client = createGenerationClient({ apiKey: "key", fetch: fetchMock as typeof fetch });
    const result = await client.generateResult({
      model: "gpt-image-2",
      content: [{ type: "text", text: "hello" }],
    });

    expect(result.content[0]).toEqual({ type: "image", source: { type: "url", url: "https://example.com/out.png" } });
    expect(result.meta).toEqual({ cost: 0.12 });
    expect(result.meta?.costOrigin).toBeUndefined();
  });

  it("builds Z-Image Turbo text-to-image requests", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ data: [{ url: "https://example.com/z-image.png" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const client = createGenerationClient({ apiKey: "key", fetch: fetchMock as typeof fetch });
    await client.generate({
      model: "z-image-turbo",
      content: [{ type: "text", text: "clean product photo" }],
      parameters: { size: "1024*1024" },
    });

    expect(calls[0]?.url).toBe("https://router.neta.art/v1/images/generations");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: "z-image-turbo",
      prompt: "clean product photo",
      size: "1024*1024",
    });
  });

  it("rejects Z-Image Turbo reference images", async () => {
    const client = createGenerationClient({ apiKey: "key", fetch: (() => undefined) as unknown as typeof fetch });
    await expect(
      client.generate({
        model: "z-image-turbo",
        content: [
          { type: "text", text: "clean product photo" },
          { type: "image", source: { type: "url", url: "https://example.com/ref.png" } },
        ],
      }),
    ).rejects.toThrow(/image/i);
  });

  it("returns base64 image output", async () => {
    const fetchMock = async () =>
      new Response(JSON.stringify({ data: [{ b64_json: "abc" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const client = createGenerationClient({ apiKey: "key", fetch: fetchMock as typeof fetch });
    const output = await client.generate({
      model: "gpt-image-2",
      content: [{ type: "text", text: "hello" }],
    });

    expect(output[0]).toEqual({ type: "image", source: { type: "base64", mediaType: "image/png", data: "abc" } });
  });

  it("builds NoobXL text-to-image requests", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ data: [{ url: "https://example.com/noobxl.png" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const client = createGenerationClient({ apiKey: "key", fetch: fetchMock as typeof fetch });
    await client.generate({
      model: "noobxl-t2i-onediff",
      content: [{ type: "text", text: "anime key visual" }],
      parameters: { size: "768x1024", negative_prompt: "blurry", seed: 123 },
    });

    expect(calls[0]?.url).toBe("https://router.neta.art/v1/images/generations");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: "noobxl-t2i-onediff",
      prompt: "anime key visual",
      size: "768x1024",
      negative_prompt: "blurry",
      seed: 123,
    });
  });

  it("builds NoobXL image-to-image requests", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ data: [{ url: "https://example.com/i2i.png" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const client = createGenerationClient({ apiKey: "key", fetch: fetchMock as typeof fetch });
    await client.generate({
      model: "noobxl-i2i-ipa-onediff",
      content: [
        { type: "text", text: "redraw this character" },
        { type: "image", source: { type: "url", url: "https://example.com/ref.png" } },
      ],
      parameters: {
        size: "1024x1024",
        controlnet_weight: 0.7,
        ipadapter_face_image_ref: "https://example.com/face.png",
        ipadapter_face_weight: 0.5,
      },
    });

    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: "noobxl-i2i-ipa-onediff",
      prompt: "redraw this character",
      size: "1024x1024",
      controlnet_weight: 0.7,
      ipadapter_face_image_ref: "https://example.com/face.png",
      ipadapter_face_weight: 0.5,
      image: ["https://example.com/ref.png"],
    });
  });

  it("allows single-image tools without prompt text", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ data: [{ url: "https://example.com/cutout.png" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const client = createGenerationClient({ apiKey: "key", fetch: fetchMock as typeof fetch });
    const output = await client.generate({
      model: "birefnet-general",
      content: [{ type: "image", source: { type: "url", url: "https://example.com/portrait.png" } }],
    });

    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: "birefnet-general",
      prompt: "",
      image: ["https://example.com/portrait.png"],
    });
    expect(output[0]).toEqual({ type: "image", source: { type: "url", url: "https://example.com/cutout.png" } });
  });

  it("includes provider diagnostics when a successful response has no output", async () => {
    const fetchMock = async () =>
      new Response(
        JSON.stringify({
          created: 123,
          usage: { total_tokens: 42 },
          data: [{ url: "", b64_json: "" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );

    const client = createGenerationClient({ apiKey: "key", fetch: fetchMock as typeof fetch });
    await expect(
      client.generate({
        model: "gpt-image-2",
        content: [{ type: "text", text: "hello" }],
      }),
    ).rejects.toMatchObject({
      name: "GenerationProviderError",
      message: "Image generation returned no output",
      details: {
        created: 123,
        usage: { total_tokens: 42 },
        dataCount: 1,
        data: [{ hasUrl: false, hasBase64Json: false }],
      },
    } satisfies Partial<GenerationProviderError>);
  });
});

function trackClone(response: Response, onClone: () => void): Response {
  const clone = response.clone.bind(response);
  response.clone = () => {
    onClone();
    return clone();
  };
  return response;
}
