import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createGenerationClient,
  exportBuiltinModelConfig,
  parseGenerationModelDeclaration,
  readGenerationModelDeclarationsFromDirectory,
  stringifyBuiltinModelConfig,
} from "../src/index.js";

describe("config", () => {
  it("roundtrips a built-in model declaration", () => {
    const raw = stringifyBuiltinModelConfig("gpt-image-2");
    const declaration = parseGenerationModelDeclaration(raw, "gpt-image-2.yaml");
    expect(declaration.schema).toBe("neta.generation.model.v1");
    expect(declaration.model).toBe("gpt-image-2");
  });

  it("exposes the Krea 2 model contract", () => {
    const client = createGenerationClient({ apiKey: "test" });
    expect(client.getModel("krea2")).toMatchObject({
      model: "krea2",
      adapter: { type: "openai.images" },
      parameters: {
        size: {
          type: "string",
          optional: true,
          default: "1024x1024",
        },
      },
    });
  });

  it("roundtrips built-in model meta declarations", () => {
    const raw = stringifyBuiltinModelConfig("suno_image_to_song_chirp_v5");
    const declaration = parseGenerationModelDeclaration(raw, "suno_image_to_song_chirp_v5.yaml");
    expect(declaration.adapter).toMatchObject({
      operation: "music",
      task: "image_to_song",
      payload: { mv: "chirp-v5" },
    });
    expect(declaration.meta?.taskVariants?.image_to_song).toMatchObject({
      requiredContent: ["image"],
      required: ["metadata_params"],
    });
  });

  it("does not expose the removed legacy Suno model", () => {
    const client = createGenerationClient({ apiKey: "test" });
    expect(client.getModel("suno_music")).toBeNull();
    expect(() =>
      client.validate({
        model: "suno_music",
        content: [{ type: "text", text: "warm piano" }],
      }),
    ).toThrow("Generation model is unavailable: suno_music");
    expect(() => client.stringifyModelConfig("suno_music")).toThrow("Generation model is unavailable: suno_music");
  });

  it("validates every built-in model example", () => {
    const client = createGenerationClient({ apiKey: "test" });
    for (const model of client.listModels()) {
      for (const example of model.examples ?? []) {
        expect(() => client.validate(example.request), `${model.model}: ${example.title ?? "example"}`).not.toThrow();
      }
    }
  });

  it("parses published model declaration files", async () => {
    const declarations = await readGenerationModelDeclarationsFromDirectory(join(process.cwd(), "models"));
    const client = createGenerationClient({ apiKey: "test" });

    expect(declarations).toEqual(client.listModels());

    expect(declarations.map((declaration) => declaration.model).sort()).toEqual(
      client
        .listModels()
        .map((model) => model.model)
        .sort(),
    );
  });

  it("exports model declarations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "generation-"));
    try {
      const file = join(dir, "gpt-image-2.yaml");
      await exportBuiltinModelConfig("gpt-image-2", file);
      const client = createGenerationClient({ apiKey: "test" });
      expect(client.stringifyModelConfig("gpt-image-2")).toContain("schema: neta.generation.model.v1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
