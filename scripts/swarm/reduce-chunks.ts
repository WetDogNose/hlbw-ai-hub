import * as fs from "fs/promises";
import * as path from "path";

/**
 * Utility to process raw swarm output and extract chronologically ordered [CHUNK_N] responses.
 *
 * Usage:
 * npx tsx scripts/swarm/reduce-chunks.ts <path-to-raw-output-file>
 */

export async function processChunks(rawContent: string): Promise<string> {
  const chunks = new Map<number, string>();

  // Regex to match chunks: [CHUNK_N] followed by the content until the next [CHUNK_] or end of string
  // Using [\s\S]*? for lazy matching until the next boundary
  const chunkRegex = /\[CHUNK_(\d+)\]\n([\s\S]*?)(?=\n\[CHUNK_\d+\]|$)/g;

  let match;
  while ((match = chunkRegex.exec(rawContent)) !== null) {
    const chunkIndex = parseInt(match[1], 10);
    const chunkContent = match[2].trim();
    chunks.set(chunkIndex, chunkContent);
  }

  // If no chunks were found, return the raw content
  if (chunks.size === 0) {
    return rawContent;
  }

  // Sort by index
  const sortedIndices = Array.from(chunks.keys()).sort((a, b) => a - b);

  // Merge
  const mergedContent = sortedIndices
    .map((index) => chunks.get(index))
    .join("\n\n");
  return mergedContent;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx reduce-chunks.ts <path-to-raw-output>");
    process.exit(1);
  }

  (async () => {
    try {
      const fullPath = path.resolve(process.cwd(), filePath);
      const rawContent = await fs.readFile(fullPath, "utf8");
      const result = await processChunks(rawContent);
      console.log(result);
    } catch (err) {
      console.error("Error processing chunks:", err);
      process.exit(1);
    }
  })();
}
