// Pass 15 — Vertex (Gemini) embedding provider.
//
// SDK signatures verified against:
//   - node_modules/@google/generative-ai/dist/generative-ai.d.ts line 786
//     `embedContent(request: EmbedContentRequest | string | Array<string|Part>)
//        : Promise<EmbedContentResponse>`
//   - node_modules/@google/generative-ai/dist/generative-ai.d.ts line 794
//     `batchEmbedContents(batchEmbedContentRequest: BatchEmbedContentsRequest)
//        : Promise<BatchEmbedContentsResponse>`
//   - `ContentEmbedding.values: number[]` — d.ts line 227.
//
// Model: `text-embedding-004` (768-dim) — matches `prisma/schema.prisma`
// `embedding Unsupported("vector(768)")` on `memory_episode`.
//
// Concurrency: `batchEmbedContents` is the single-call batch. If the SDK call
// rejects (e.g., model doesn't support batch for the account), we fall back
// to `embedContent` per-text with a small concurrency cap.

import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  BatchEmbedContentsResponse,
  EmbedContentResponse,
  GenerativeModel,
} from "@google/generative-ai";
import type { EmbeddingProvider } from "./EmbeddingProvider";

// Candidate models in preference order. The consumer Gemini Developer API
// (`generativelanguage.googleapis.com`) has historically varied in which
// embedding models it serves per project. Try newest first, fall back down.
// Observed at runtime (2026-04-20): `text-embedding-004` returns 404 via the
// @google/generative-ai SDK's v1beta endpoint for this project's GEMINI_API_KEY;
// `embedding-001` works.
const VERTEX_EMBEDDING_MODELS = [
  "text-embedding-004",
  "embedding-001",
] as const;
const VERTEX_EMBEDDING_DIM = 768;
const DEFAULT_CONCURRENCY = 8;

export class VertexEmbeddingProvider implements EmbeddingProvider {
  readonly name = "vertex-embedding";
  readonly dim = VERTEX_EMBEDDING_DIM;
  private readonly genai: GoogleGenerativeAI;
  private modelName: string = VERTEX_EMBEDDING_MODELS[0];
  private model: GenerativeModel;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GEMINI_API_KEY ?? "";
    if (!key) {
      throw new Error(
        "VertexEmbeddingProvider: GEMINI_API_KEY is required (pass via env or constructor).",
      );
    }
    this.genai = new GoogleGenerativeAI(key);
    this.model = this.genai.getGenerativeModel({ model: this.modelName });
  }

  private setModel(name: string): void {
    this.modelName = name;
    this.model = this.genai.getGenerativeModel({ model: name });
  }

  private async tryBatch(texts: string[]): Promise<number[][]> {
    const batch: BatchEmbedContentsResponse =
      await this.model.batchEmbedContents({
        requests: texts.map((t) => ({
          content: { role: "user", parts: [{ text: t }] },
        })),
      });
    return batch.embeddings.map((e) => e.values ?? []);
  }

  private async tryFanOut(texts: string[]): Promise<number[][]> {
    const results: number[][] = new Array(texts.length);
    const concurrency = DEFAULT_CONCURRENCY;
    let cursor = 0;
    const runOne = async (): Promise<void> => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= texts.length) return;
        const res: EmbedContentResponse = await this.model.embedContent(
          texts[idx],
        );
        results[idx] = res.embedding.values ?? [];
      }
    };
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(concurrency, texts.length); i++) {
      workers.push(runOne());
    }
    await Promise.all(workers);
    return results;
  }

  private isModelMissingError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /\b(404|Not Found|not found for API version|is not supported for embedContent)\b/i.test(
      msg,
    );
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const errors: string[] = [];
    for (const candidate of VERTEX_EMBEDDING_MODELS) {
      this.setModel(candidate);
      try {
        return await this.tryBatch(texts);
      } catch (batchErr) {
        try {
          return await this.tryFanOut(texts);
        } catch (fanErr) {
          const b =
            batchErr instanceof Error ? batchErr.message : String(batchErr);
          const f = fanErr instanceof Error ? fanErr.message : String(fanErr);
          errors.push(`${candidate}: batch=${b} / fan=${f}`);
          if (
            this.isModelMissingError(batchErr) ||
            this.isModelMissingError(fanErr)
          ) {
            continue;
          }
          throw new Error(
            `VertexEmbeddingProvider.embed failed on ${candidate}: ${f}`,
            { cause: fanErr },
          );
        }
      }
    }
    throw new Error(
      `VertexEmbeddingProvider.embed: all candidate models failed — ${errors.join(" | ")}`,
    );
  }

  async close(): Promise<void> {
    // The underlying SDK holds no long-lived handles.
  }
}
