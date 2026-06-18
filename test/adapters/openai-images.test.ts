import { describe, expect, it } from "vitest";
import { createGenerationClient, type GenerationProviderError } from "../../src/index.js";

describe("openai.images adapter", () => {
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
