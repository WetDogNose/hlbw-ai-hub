import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const getScionPath = (): string => {
  // Allow Cloud Run / containerised deploys to point at a mounted dir.
  // Local dev assumes hlbw-ai-hub and ai-organisation-engine are siblings.
  return (
    process.env.SCION_TEMPLATES_DIR ??
    path.join(process.cwd(), "../ai-organisation-engine/.scion/templates")
  );
};

function isNodeErrnoException(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && "code" in e;
}

export async function GET() {
  const templatesPath = getScionPath();
  try {
    const files = await fs.readdir(templatesPath);
    const templates = await Promise.all(
      files
        .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
        .map(async (fileName) => {
          const content = await fs.readFile(
            path.join(templatesPath, fileName),
            "utf-8",
          );
          return { name: fileName, content };
        }),
    );
    return NextResponse.json({ templates });
  } catch (error: unknown) {
    if (isNodeErrnoException(error) && error.code === "ENOENT") {
      // Directory isn't mounted in this environment (e.g. Cloud Run). Treat
      // as "no templates available" instead of surfacing a 500.
      return NextResponse.json({ templates: [] });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const templatesPath = getScionPath();
  try {
    const { name, content } = (await request.json()) as {
      name?: string;
      content?: string;
    };
    if (!name || typeof content !== "string") {
      return NextResponse.json(
        { error: "Missing name or content" },
        { status: 400 },
      );
    }

    const filePath = path.join(templatesPath, name);
    if (!filePath.startsWith(templatesPath)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 403 });
    }

    try {
      await fs.writeFile(filePath, content, "utf-8");
    } catch (error: unknown) {
      if (isNodeErrnoException(error) && error.code === "ENOENT") {
        return NextResponse.json(
          { error: "Templates directory is not available in this environment" },
          { status: 503 },
        );
      }
      throw error;
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
