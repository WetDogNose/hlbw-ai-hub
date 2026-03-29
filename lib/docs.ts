import fs from "fs";
import path from "path";

const DOCS_DIR = path.join(process.cwd(), "docs");

export interface DocItem {
  title: string;
  slug: string;
  isDir: boolean;
  children?: DocItem[];
}

export function getDocsTree(
  dir: string = DOCS_DIR,
  basePath: string = "",
): DocItem[] {
  if (!fs.existsSync(dir)) return [];

  const items = fs.readdirSync(dir, { withFileTypes: true });
  const tree: DocItem[] = [];

  for (const item of items) {
    if (item.name.startsWith(".")) continue;

    const fullPath = path.join(dir, item.name);
    const relativePath = path.join(basePath, item.name);

    // Convert e.g., "my-file.md" into "my-file"
    const parsed = path.parse(item.name);
    const slug = path.join(basePath, parsed.name).replace(/\\/g, "/");

    // Nice friendly title for the sidebar: "agent-directive" -> "Agent Directive"
    const title = parsed.name
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    if (item.isDirectory()) {
      tree.push({
        title,
        slug,
        isDir: true,
        children: getDocsTree(fullPath, relativePath),
      });
    } else if (item.isFile() && item.name.endsWith(".md")) {
      tree.push({
        title,
        slug,
        isDir: false,
      });
    }
  }

  // Optional: sort so directories are first or alphabetical, etc.
  return tree.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.title.localeCompare(b.title);
  });
}

export function getDocContent(
  slugArray: string[],
): { content: string; title: string } | null {
  const relPath = slugArray.join("/") + ".md";
  const fullPath = path.join(DOCS_DIR, relPath);

  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, "utf-8");
    const title = slugArray[slugArray.length - 1]
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    return { content, title };
  }
  return null;
}
