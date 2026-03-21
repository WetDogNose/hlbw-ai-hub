import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Project, Node, SyntaxKind } from "ts-morph";
import * as path from "path";
import * as fs from "fs";

const server = new Server(
  {
    name: "ast-analyzer",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// We keep a singleton Project instance to cache the AST for performance
let project: Project | null = null;

function getProject(filePath: string): Project {
  if (project) return project;

  // Try to find the closest tsconfig.json
  let dir = path.dirname(filePath);
  let tsConfigPath: string | undefined;

  while (dir.length > 3) {
    const maybeTsConfig = path.join(dir, "tsconfig.json");
    if (fs.existsSync(maybeTsConfig)) {
      tsConfigPath = maybeTsConfig;
      break;
    }
    dir = path.dirname(dir);
  }

  if (tsConfigPath) {
    project = new Project({ tsConfigFilePath: tsConfigPath });
  } else {
    project = new Project();
  }
  return project;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_file_exports",
        description: "Returns a list of all exported symbols (functions, classes, interfaces, types, variables) from a given TypeScript/TSX file.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string" },
          },
          required: ["filePath"],
        },
      },
      {
        name: "get_symbol_definition",
        description: "Returns the precise full text definition (including JSDoc, parameters, types) of a specific symbol inside a file without returning the entire file.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            symbolName: { type: "string" },
          },
          required: ["filePath", "symbolName"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "get_file_exports") {
    const filePath = String(args?.filePath);
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const proj = getProject(filePath);
    proj.addSourceFileAtPath(filePath);
    const sourceFile = proj.getSourceFileOrThrow(filePath);
    sourceFile.refreshFromFileSystemSync();
    
    const exportsMap = sourceFile.getExportedDeclarations();
    const result: string[] = [];

    for (const [key, declarations] of exportsMap.entries()) {
      declarations.forEach(decl => {
          let kindName = decl.getKindName();
          result.push(`${key} (${kindName})`);
      });
    }

    return {
      content: [
        {
          type: "text",
          text: result.length > 0 ? `Exports in ${filePath}:\n- ` + result.join('\n- ') : "No exports found.",
        },
      ],
    };
  }

  if (name === "get_symbol_definition") {
    const filePath = String(args?.filePath);
    const symbolName = String(args?.symbolName);

    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const proj = getProject(filePath);
    proj.addSourceFileAtPath(filePath);
    const sourceFile = proj.getSourceFileOrThrow(filePath);
    sourceFile.refreshFromFileSystemSync();

    let nodeFound: Node | undefined;
    
    // First try exports mapping
    const exportsMap = sourceFile.getExportedDeclarations();
    const decls = exportsMap.get(symbolName);
    if (decls && decls.length > 0) {
        nodeFound = decls[0];
    }

    // If not exported, search all top level declarations
    if (!nodeFound) {
      sourceFile.forEachChild(child => {
          if (Node.hasName(child) && child.getName() === symbolName) {
              nodeFound = child;
          } else if (Node.isVariableStatement(child)) {
              for (const decl of child.getDeclarations()) {
                  if (decl.getName() === symbolName) {
                      nodeFound = child; // return the whole statement
                  }
              }
          }
      });
    }

    if (!nodeFound) {
      return {
        content: [{ type: "text", text: `Symbol '${symbolName}' not found in ${filePath}` }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: nodeFound.getText(),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AST Analyzer MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
