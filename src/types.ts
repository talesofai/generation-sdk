import type { WebSocket } from "ws";

export const MODEL_SCHEMA = "neta.generation.model.v1" as const;

export type GenerationSource = { type: "url"; url: string } | { type: "base64"; mediaType: string; data: string };

export type GenerationContentBlockMeta = Record<string, unknown>;

export type GenerationContentBlock =
  | { type: "text"; text: string; meta?: GenerationContentBlockMeta }
  | { type: "image"; source: GenerationSource; meta?: GenerationContentBlockMeta }
  | { type: "video"; source: GenerationSource; meta?: GenerationContentBlockMeta }
  | { type: "audio"; source: GenerationSource; meta?: GenerationContentBlockMeta };

export type GenerationResult = {
  content: GenerationContentBlock[];
  requestId?: string;
  cost?: number;
};

export type GenerationContentSpec = {
  type: "text" | "image" | "video" | "audio";
  required?: boolean;
  min?: number;
  max?: number;
  sources?: Array<GenerationSource["type"]>;
  roles?: string[];
  roleRequired?: boolean;
  merge?: "newline" | "space" | "concat";
  meta?: Record<string, unknown>;
  description?: string;
};

export type GenerationDimensionsSpec = {
  separator?: "x" | "*";
  min?: number;
  max?: number;
  multipleOf?: number;
};

export type GenerationParameterSpec =
  | {
      type: "string";
      optional?: boolean;
      default?: string;
      enum?: string[];
      dimensions?: GenerationDimensionsSpec;
      description?: string;
      examples?: string[];
    }
  | {
      type: "number";
      optional?: boolean;
      default?: number;
      min?: number;
      max?: number;
      description?: string;
      examples?: number[];
    }
  | {
      type: "integer";
      optional?: boolean;
      default?: number;
      min?: number;
      max?: number;
      description?: string;
      examples?: number[];
    }
  | {
      type: "boolean";
      optional?: boolean;
      default?: boolean;
      description?: string;
      examples?: boolean[];
    };

export type GenerationMetaFieldSpec =
  | GenerationParameterSpec
  | { type: "object"; optional?: boolean; description?: string };

export type GenerationMetaTaskVariantSpec = {
  description?: string;
  required?: string[];
  requiredContent?: Array<GenerationContentSpec["type"]>;
  sendTask?: boolean;
};

export type GenerationMetaSpec = {
  fields?: Record<string, GenerationMetaFieldSpec>;
  taskField?: string;
  taskVariants?: Record<string, GenerationMetaTaskVariantSpec>;
};

export type GenerationModelDeclaration = {
  schema: typeof MODEL_SCHEMA;
  model: string;
  title?: string;
  description?: string;
  /** Hide from default discovery while keeping exact-ID lookup and runtime use available. */
  hidden?: boolean;
  allowUnknownParameters?: boolean;
  adapter: {
    type: string;
  } & Record<string, unknown>;
  content: {
    input: GenerationContentSpec[];
  };
  parameters?: Record<string, GenerationParameterSpec>;
  meta?: GenerationMetaSpec;
  examples?: Array<{
    title?: string;
    request: GenerateRequest;
  }>;
};

export type GenerateRequest = {
  model: string;
  content: GenerationContentBlock[];
  parameters?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  /** @deprecated Use meta. */
  metadata?: Record<string, unknown>;
  apiKey?: string;
  baseUrl?: string;
};

export type ResolvedGenerationRequest = {
  declaration: GenerationModelDeclaration;
  request: GenerateRequest;
  parameters: Record<string, unknown>;
  meta: Record<string, unknown>;
};

export type GenerationSourceResolver = (source: GenerationSource) => Promise<string> | string;

export type GenerationDebugEvent =
  | {
      type: "request";
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: unknown;
    }
  | {
      type: "response";
      url: string;
      status: number;
      statusText: string;
      headers: Record<string, string>;
      trace: Record<string, string>;
      elapsedMs: number;
      body?: unknown;
    };

export type GenerationDebugLogger = (event: GenerationDebugEvent) => void;

export type GenerationDebugOptions = {
  enabled?: boolean;
  includeSensitive?: boolean;
  includeResponseBody?: boolean;
  logger?: GenerationDebugLogger;
};

export type GenerationDebugConfig = GenerationDebugOptions & {
  enabled: boolean;
  includeSensitive: boolean;
  includeResponseBody: boolean;
  logger: GenerationDebugLogger;
};

export type GenerationAdapterContext = {
  apiKey: string;
  baseUrl: string;
  fetch: typeof fetch;
  resolveSource: GenerationSourceResolver;
};

export type GenerationAdapterInput = ResolvedGenerationRequest & {
  context: GenerationAdapterContext;
};

export type GenerationAdapter = ((input: GenerationAdapterInput) => Promise<GenerationContentBlock[]>) & {
  validate?: (input: ResolvedGenerationRequest) => void;
};

export type CreateGenerationClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  models?: GenerationModelDeclaration[];
  includeBuiltinModels?: boolean;
  fetch?: typeof fetch;
  sourceResolver?: GenerationSourceResolver;
  adapters?: Record<string, GenerationAdapter>;
  debug?: boolean | GenerationDebugOptions;
};

export type ConnectRealtimeOptions = {
  /** Overrides the client's apiKey for this connection. */
  apiKey?: string;
  /** Overrides the client's baseUrl for this connection. */
  baseUrl?: string;
  /** Extra query parameters appended to the /v1/realtime URL, alongside `model`. */
  query?: Record<string, string>;
  /** Extra WebSocket handshake headers, merged after Authorization. */
  headers?: Record<string, string>;
};

export type GenerationClient = {
  /** Validates the request and sends it to the model adapter. */
  generate(request: GenerateRequest): Promise<GenerationContentBlock[]>;
  /**
   * Opens a raw WebSocket to /v1/realtime for the given model (OpenAI
   * Realtime API compatible). This is a byte-level connection, not a parsed
   * realtime-protocol client: no event validation happens here, matching
   * neta-router's own no-content-inspection scope for this route.
   */
  connectRealtime(model: string, options?: ConnectRealtimeOptions): WebSocket;
  /** Resolves model defaults and all available validation rules without requiring an API key or making a network request. */
  validate(request: GenerateRequest): ResolvedGenerationRequest;
  /** Returns cloned, machine-readable declarations for every available model. */
  listModels(): GenerationModelDeclaration[];
  /** Returns a cloned model declaration, including content constraints and request examples, or null when unavailable. */
  getModel(model: string): GenerationModelDeclaration | null;
  /** Serializes one available model declaration for agents and external tools. */
  stringifyModelConfig(model: string, options?: { format?: "yaml" | "json" }): string;
  /** Writes one available model declaration to a YAML file. */
  exportModelConfig(model: string, filePath: string): Promise<void>;
  /** Writes every available model declaration to a directory as YAML files. */
  exportModelConfigs(directory: string): Promise<void>;
};

export type GenerationClientWithResult = GenerationClient & {
  /** Generates content and returns observed request metadata such as requestId and cost when available. */
  generateResult(request: GenerateRequest): Promise<GenerationResult>;
};
