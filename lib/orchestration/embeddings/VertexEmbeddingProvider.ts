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

const VERTEX_EMBEDDING_MODEL = "text-embedding-004";
const VERTEX_EMBEDDING_DIM = 768;
const DEFAULT_CONCURRENCY = 8;

export class VertexEmbeddingProvider implements EmbeddingProvider {
  readonly name = "vertex-text-embedding-004";
  readonly dim = VERTEX_EMBEDDING_DIM;
  private readonly model: GenerativeModel;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GEMINI_API_KEY ?? "";
    if (!key) {
      throw new Error(
        "VertexEmbeddingProvider: GEMINI_API_KEY is required (pass via env or constructor).",
      );
    }
    const genai = new GoogleGenerativeAI(key);
    this.model = genai.getGenerativeModel({ model: VERTEX_EMBEDDING_MODEL });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // Preferred: batch call. Some quota accounts reject batch for this model;
    // fall back to per-text fan-out with a small concurrency cap.
    try {
      const batch: BatchEmbedContentsResponse =
        await this.model.batchEmbedContents({
          requests: texts.map((t) => ({
            content: { role: "user", parts: [{ text: t }] },
          })),
        });
      return batch.embeddings.map((e) => e.values ?? []);
    } catch (batchErr) {
      // Fan-out fallback.
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
      try {
        await Promise.all(workers);
        return results;
      } catch (fanErr) {
        const b =
          batchErr instanceof Error ? batchErr.message : String(batchErr);
        const f = fanErr instanceof Error ? fanErr.message : String(fanErr);
        throw new Error(
          `VertexEmbeddingProvider.embed failed (batch:${b} / fan-out:${f})`,
          { cause: fanErr },
        );
      }
    }
  }

  async close(): Promise<void> {
    // The underlying SDK holds no long-lived handles.
  }
}
