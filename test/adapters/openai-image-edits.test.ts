import { describe, expect, it } from "vitest";
import { createGenerationClient, type GenerationProviderError, openAiImageEditsAdapter } from "../../src/index.js";

describe("openai.imageEdits adapter", () => {
  it("builds image edit requests", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ data: [{ url: "https://example.com/edited.png" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const client = createGenerationClient({ apiKey: "key", fetch: fetchMock as typeof fetch });
    const output = await client.generate({
      model: "qwen-image-edit",
      content: [
        { type: "text", text: "change the background" },
        { type: "image", source: { type: "url", url: "https://example.com/input.png" } },
      ],
      parameters: { size: "1024x1024" },
    });

    expect(calls[0]?.url).toBe("https://router.neta.art/v1/images/edits");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toEqual({ Authorization: "Bearer key" });
    expect(calls[0]?.init.body).toBeInstanceOf(FormData);
    const body = calls[0]?.init.body as FormData;
    expect(body.get("model")).toBe("qwen-image-edit");
    expect(body.get("prompt")).toBe("change the background");
    expect(body.get("image")).toBe("https://example.com/input.png");
    expect(body.get("size")).toBe("1024x1024");
    expect(output[0]).toEqual({ type: "image", source: { type: "url", url: "https://example.com/edited.png" } });
  });

  it("exposes new-api cost metadata for image edits", async () => {
    const fetchMock = async () =>
      new Response(
        JSON.stringify({
          data: [{ url: "https://example.com/edited.png" }],
          new_api: {
            request_id: "router-request-1",
            cost: 0.08,
            cost_origin: 0.16,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const client = createGenerationClient({ apiKey: "key", fetch: fetchMock as typeof fetch });
    const result = await client.generateResult({
      model: "qwen-image-edit",
      content: [
        { type: "text", text: "change the background" },
        { type: "image", source: { type: "url", url: "https://example.com/input.png" } },
      ],
    });

    expect(result.content[0]).toEqual({
      type: "image",
      source: { type: "url", url: "https://example.com/edited.png" },
    });
    expect(result.meta).toEqual({
      cost: 0.08,
      costOrigin: 0.16,
    });
  });

  it("keeps the public openai image edits adapter array return contract", async () => {
    const fetchMock = async () =>
      new Response(JSON.stringify({ data: [{ url: "https://example.com/edited.png" }], new_api: { cost: 0.08 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const output = await openAiImageEditsAdapter({
      declaration: {
        schema: "neta.generation.model.v1",
        model: "qwen-image-edit",
        adapter: { type: "openai.imageEdits" },
        content: {
          input: [
            { type: "text", required: true },
            { type: "image", required: true, sources: ["url"] },
          ],
        },
      },
      request: {
        model: "qwen-image-edit",
        content: [
          { type: "text", text: "change the background" },
          { type: "image", source: { type: "url", url: "https://example.com/input.png" } },
        ],
      },
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
    expect(output).toEqual([{ type: "image", source: { type: "url", url: "https://example.com/edited.png" } }]);
  });

  it("rejects non-url image input", async () => {
    const client = createGenerationClient({ apiKey: "key", fetch: (() => undefined) as unknown as typeof fetch });
    await expect(
      client.generate({
        model: "qwen-image-edit",
        content: [
          { type: "text", text: "change the background" },
          { type: "image", source: { type: "base64", mediaType: "image/png", data: "abc" } },
        ],
      }),
    ).rejects.toThrow(/image source/i);
  });

  it("includes provider diagnostics when a successful response has no output", async () => {
    const fetchMock = async () =>
      new Response(JSON.stringify({ created: 123, usage: { total_tokens: 42 }, data: [{ url: "", b64_json: "" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const client = createGenerationClient({ apiKey: "key", fetch: fetchMock as typeof fetch });
    await expect(
      client.generate({
        model: "qwen-image-edit",
        content: [
          { type: "text", text: "change the background" },
          { type: "image", source: { type: "url", url: "https://example.com/input.png" } },
        ],
      }),
    ).rejects.toMatchObject({
      name: "GenerationProviderError",
      message: "Image edit returned no output",
      details: {
        created: 123,
        usage: { total_tokens: 42 },
        dataCount: 1,
        data: [{ hasUrl: false, hasBase64Json: false }],
      },
    } satisfies Partial<GenerationProviderError>);
  });
});
