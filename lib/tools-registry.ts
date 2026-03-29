import fs from "fs";
import path from "path";

export type RegistryItemType = "skill" | "workflow" | "tool" | "mcp";

export interface RegistryItem {
  id: string;
  name: string;
  description: string;
  type: RegistryItemType;
  path?: string;
}

/**
 * Extracts YAML frontmatter without relying on external libraries like gray-matter.
 */
function parseFrontmatter(content: string): {
  name: string;
  description: string;
} {
  let name = "";
  let description = "";

  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (match && match[1]) {
    const frontmatter = match[1];

    const nameMatch = frontmatter.match(/^name:\s*(.*)/m);
    if (nameMatch) name = nameMatch[1].trim();

    const descMatch = frontmatter.match(/^description:\s*(.*)/m);
    if (descMatch) description = descMatch[1].trim();
  }

  return { name, description };
}

export function getSkills(): RegistryItem[] {
  const items: RegistryItem[] = [];
  const skillsDir = path.join(process.cwd(), ".agents", "skills");

  if (fs.existsSync(skillsDir)) {
    const folders = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const folder of folders) {
      const skillPath = path.join(skillsDir, folder, "SKILL.md");
      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, "utf-8");
        const { name, description } = parseFrontmatter(content);

        items.push({
          id: `skill-${folder}`,
          name: name || folder.replace(/-/g, " "),
          description: description || "No description provided",
          type: "skill",
          path: `/.agents/skills/${folder}/SKILL.md`,
        });
      }
    }
  }
  return items;
}

export function getWorkflows(): RegistryItem[] {
  const items: RegistryItem[] = [];
  const workflowsDir = path.join(process.cwd(), ".agents", "workflows");

  if (fs.existsSync(workflowsDir)) {
    const files = fs
      .readdirSync(workflowsDir)
      .filter((file) => file.endsWith(".md"));

    for (const file of files) {
      const workflowPath = path.join(workflowsDir, file);
      const content = fs.readFileSync(workflowPath, "utf-8");

      // Workflows might only have description in frontmatter, name is usually filename or first header
      const { description } = parseFrontmatter(content);

      // Try to find the first H1 if no name in frontmatter
      const h1Match = content.match(/^#\s+(.*)/m);
      let name = file.replace(".md", "").replace(/-/g, " ");
      if (h1Match) name = h1Match[1].trim();

      items.push({
        id: `workflow-${file}`,
        name: name,
        description: description || "Workflow documentation",
        type: "workflow",
        path: `/.agents/workflows/${file}`,
      });
    }
  }
  return items;
}

export function getTools(): RegistryItem[] {
  const items: RegistryItem[] = [];
  const toolsDir = path.join(process.cwd(), "tools");

  if (fs.existsSync(toolsDir)) {
    const folders = fs
      .readdirSync(toolsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const folder of folders) {
      // Basic fallback since tools don't have standard frontmatter yet
      const name = folder.replace(/-/g, " ");
      let description = "Core command-line tool or script.";

      // Look for package.json to get metadata
      const pkgPath = path.join(toolsDir, folder, "package.json");
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
          if (pkg.description) description = pkg.description;
        } catch (e) {
          // ignore JSON parse errors
        }
      }

      items.push({
        id: `tool-${folder}`,
        name,
        description,
        type: "tool",
        path: `/tools/${folder}`,
      });
    }
  }
  return items;
}

export function getAllRegistryItems(): RegistryItem[] {
  return [...getSkills(), ...getWorkflows(), ...getTools()];
}
