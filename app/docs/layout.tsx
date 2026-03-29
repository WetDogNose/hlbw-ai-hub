import { getDocsTree } from "@/lib/docs";
import Link from "next/link";
import { BookOpen, FolderOpen, FileText } from "lucide-react";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const docsTree = getDocsTree();

  const renderTree = (nodes: any[]) => {
    return (
      <ul
        className="docs-nav-list"
        style={{ listStyle: "none", paddingLeft: "var(--spacing-3)" }}
      >
        {nodes.map((node) => (
          <li key={node.slug} style={{ margin: "var(--spacing-1) 0" }}>
            {node.isDir ? (
              <div style={{ marginBottom: "var(--spacing-2)" }}>
                <div
                  className="flex items-center gap-2 text-secondary"
                  style={{
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    padding: "var(--spacing-1) 0",
                  }}
                >
                  <FolderOpen size={14} />
                  {node.title}
                </div>
                {node.children && renderTree(node.children)}
              </div>
            ) : (
              <Link
                href={`/docs/${node.slug}`}
                className="docs-nav-link"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-2)",
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                  padding: "var(--spacing-1) 0",
                  textDecoration: "none",
                  transition: "color 0.2s",
                }}
              >
                <FileText size={14} />
                {node.title}
              </Link>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div
      className="container"
      style={{ display: "flex", gap: "var(--spacing-8)", minHeight: "80vh" }}
    >
      <aside
        className="docs-sidebar border-color"
        style={{
          width: "250px",
          flexShrink: 0,
          borderRight: "1px solid var(--border-color)",
          paddingRight: "var(--spacing-6)",
          paddingTop: "var(--spacing-4)",
        }}
      >
        <Link
          href="/docs"
          className="flex items-center gap-2 mb-6"
          style={{
            fontWeight: 700,
            fontSize: "1.1rem",
            color: "var(--text-primary)",
          }}
        >
          <BookOpen />
          Documentation
        </Link>
        <nav>
          <div style={{ marginLeft: "-var(--spacing-3)" }}>
            {renderTree(docsTree)}
          </div>
        </nav>
      </aside>
      <main
        className="docs-content"
        style={{ flex: 1, padding: "var(--spacing-4) 0", maxWidth: "800px" }}
      >
        {children}
      </main>
    </div>
  );
}
