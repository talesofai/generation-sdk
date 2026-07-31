import { describe, expect, it } from "vitest";
import {
  createGenerationClient,
  type GenerationAdapter,
  type GenerationModelDeclaration,
  GenerationUnsupportedAdapterError,
  GenerationValidationError,
  MODEL_SCHEMA,
} from "../src/index.js";

describe("validation", () => {
  it("resolves default parameters", () => {
    const client = createGenerationClient({ apiKey: "test" });
    const resolved = client.validate({
      model: "gpt-image-2",
      content: [{ type: "text", text: "hello" }],
    });
    expect(resolved.parameters).toMatchObject({ size: "1024x1024", quality: "auto" });
  });

  it("rejects unknown parameters", () => {
    const client = createGenerationClient({ apiKey: "test" });
    expect(() =>
      client.validate({
        model: "gpt-image-2",
        content: [{ type: "text", text: "hello" }],
        parameters: { nope: true },
      }),
    ).toThrow(GenerationValidationError);
  });

  it("rejects base64 media for Seedance video models", () => {
    const client = createGenerationClient({ apiKey: "test" });
    expect(() =>
      client.validate({
        model: "seedance-2-0-fast",
        content: [
          { type: "text", text: "animate this reference" },
          {
            type: "image",
            source: { type: "base64", mediaType: "image/png", data: "abc" },
            meta: { role: "reference_image" },
          },
        ],
      }),
    ).toThrow("image source is not supported by seedance-2-0-fast: base64");
  });

  it("rejects unsupported content roles when declared by the model", () => {
    const client = createGenerationClient({ apiKey: "test" });
    expect(() =>
      client.validate({
        model: "seedance-2-0-fast",
        content: [
          { type: "text", text: "animate this reference" },
          {
            type: "image",
            source: { type: "url", url: "https://example.com/input.png" },
            meta: { role: "reference_video" },
          },
        ],
      }),
    ).toThrow("image role is not supported by seedance-2-0-fast: reference_video");
  });

  it("rejects missing required content roles when declared by the model", () => {
    const client = createGenerationClient({ apiKey: "test" });
    expect(() =>
      client.validate({
        model: "seedance-2-0-fast",
        content: [
          { type: "text", text: "use this motion" },
          { type: "video", source: { type: "url", url: "https://example.com/motion.mp4" } },
        ],
      }),
    ).toThrow("video role is required by seedance-2-0-fast");
  });

  it("runs a custom adapter validation hook exactly once per validate or generate call", async () => {
    let validationCalls = 0;
    let adapterCalls = 0;
    const adapter: GenerationAdapter = Object.assign(
      async () => {
        adapterCalls += 1;
        return [];
      },
      {
        validate: () => {
          validationCalls += 1;
        },
      },
    );
    const model = customModel("custom.validated");
    const client = createGenerationClient({
      apiKey: "test",
      models: [model],
      includeBuiltinModels: false,
      adapters: { "custom.adapter": adapter },
    });
    const request = { model: model.model, content: [{ type: "text" as const, text: "hello" }] };

    client.validate(request);
    expect(validationCalls).toBe(1);
    expect(adapterCalls).toBe(0);

    validationCalls = 0;
    await client.generate(request);
    expect(validationCalls).toBe(1);
    expect(adapterCalls).toBe(1);
  });

  it("keeps a body request ID ahead of later header fallbacks across multiple fetches", async () => {
    const model = customModel("custom.multi-fetch");
    const responses = [
      new Response(JSON.stringify({ request_id: "body-request" }), {
        headers: { "content-type": "application/json", "x-request-id": "first-header" },
      }),
      new Response("ok", { headers: { "content-type": "text/plain", "x-request-id": "later-header" } }),
    ];
    const fetchMock = async () => responses.shift() as Response;
    const adapter: GenerationAdapter = async (input) => {
      await input.context.fetch("https://example.com/first");
      await input.context.fetch("https://example.com/second");
      return [];
    };
    const client = createGenerationClient({
      apiKey: "test",
      fetch: fetchMock as typeof fetch,
      models: [model],
      includeBuiltinModels: false,
      adapters: { "custom.adapter": adapter },
    });

    await expect(
      client.generateResult({ model: model.model, content: [{ type: "text", text: "hello" }] }),
    ).resolves.toMatchObject({ requestId: "body-request" });
  });

  it("keeps x-request-id ahead of a later x-oneapi-request-id across multiple fetches", async () => {
    const model = customModel("custom.multi-header-fetch");
    const responses = [
      new Response("first", { headers: { "x-request-id": "primary-header" } }),
      new Response("second", { headers: { "x-oneapi-request-id": "later-fallback-header" } }),
    ];
    const fetchMock = async () => responses.shift() as Response;
    const adapter: GenerationAdapter = async (input) => {
      await input.context.fetch("https://example.com/first");
      await input.context.fetch("https://example.com/second");
      return [];
    };
    const client = createGenerationClient({
      apiKey: "test",
      fetch: fetchMock as typeof fetch,
      models: [model],
      includeBuiltinModels: false,
      adapters: { "custom.adapter": adapter },
    });

    await expect(
      client.generateResult({ model: model.model, content: [{ type: "text", text: "hello" }] }),
    ).resolves.toMatchObject({ requestId: "primary-header" });
  });

  it("keeps custom adapters without hooks compatible", async () => {
    const model = customModel("custom.no-hook");
    const adapter: GenerationAdapter = async () => [];
    const client = createGenerationClient({
      apiKey: "test",
      models: [model],
      includeBuiltinModels: false,
      adapters: { "custom.adapter": adapter },
    });
    const request = { model: model.model, content: [{ type: "text" as const, text: "hello" }] };

    expect(() => client.validate(request)).not.toThrow();
    await expect(client.generate(request)).resolves.toEqual([]);
  });

  it("keeps validation non-throwing for an unregistered custom adapter", async () => {
    const model = customModel("custom.unregistered");
    const client = createGenerationClient({
      apiKey: "test",
      models: [model],
      includeBuiltinModels: false,
    });
    const request = { model: model.model, content: [{ type: "text" as const, text: "hello" }] };

    expect(() => client.validate(request)).not.toThrow();
    await expect(client.generate(request)).rejects.toBeInstanceOf(GenerationUnsupportedAdapterError);
  });

  it("does not expose the internal adapter validation lookup", async () => {
    const packageExports = await import("../src/index.js");
    expect(packageExports).not.toHaveProperty("tryGetGenerationAdapter");
  });
});

function customModel(model: string): GenerationModelDeclaration {
  return {
    schema: MODEL_SCHEMA,
    model,
    adapter: { type: "custom.adapter" },
    content: {
      input: [{ type: "text", required: true, min: 1, max: 1 }],
    },
  };
}
