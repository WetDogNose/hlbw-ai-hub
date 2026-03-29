import { getDocContent } from "@/lib/docs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { notFound } from "next/navigation";

// Optional: You can provide static paths here to optimize build times,
// but leaving it dynamic ensures additions are picked up live (in dev/server mode).

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const resolvedParams = await params;
  const doc = getDocContent(resolvedParams.slug);

  if (!doc) {
    notFound();
  }

  return (
    <article
      className="markdown-body"
      style={{ animation: "fadeIn 0.5s ease-out" }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h1
              className="page-title text-gradient"
              style={{
                fontSize: "2.5rem",
                marginBottom: "var(--spacing-6)",
                marginTop: "var(--spacing-2)",
              }}
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2
              className="section-header"
              style={{
                fontSize: "1.75rem",
                marginTop: "var(--spacing-8)",
                marginBottom: "var(--spacing-4)",
              }}
              {...props}
            />
          ),
          h3: ({ node, ...props }) => (
            <h3
              style={{
                fontSize: "1.35rem",
                marginTop: "var(--spacing-6)",
                marginBottom: "var(--spacing-3)",
                fontWeight: 600,
              }}
              {...props}
            />
          ),
          p: ({ node, ...props }) => (
            <p
              style={{
                marginBottom: "var(--spacing-4)",
                lineHeight: "1.7",
                color: "var(--text-secondary)",
              }}
              {...props}
            />
          ),
          ul: ({ node, ...props }) => (
            <ul
              style={{
                paddingLeft: "var(--spacing-6)",
                marginBottom: "var(--spacing-5)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--spacing-2)",
                color: "var(--text-secondary)",
              }}
              {...props}
            />
          ),
          ol: ({ node, ...props }) => (
            <ol
              style={{
                paddingLeft: "var(--spacing-6)",
                marginBottom: "var(--spacing-5)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--spacing-2)",
                color: "var(--text-secondary)",
              }}
              {...props}
            />
          ),
          li: ({ node, ...props }) => (
            <li style={{ lineHeight: "1.6" }} {...props} />
          ),
          a: ({ node, ...props }) => (
            <a
              style={{
                color: "var(--accent-color)",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
              {...props}
            />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              style={{
                borderLeft: "4px solid var(--accent-color)",
                paddingLeft: "var(--spacing-4)",
                margin: "var(--spacing-6) 0",
                backgroundColor: "var(--bg-accent-subtle)",
                padding: "var(--spacing-4)",
                borderRadius: "var(--border-radius-md)",
              }}
              {...props}
            />
          ),
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            return !inline ? (
              <div
                style={{
                  margin: "var(--spacing-6) 0",
                  borderRadius: "var(--border-radius-md)",
                  overflow: "hidden",
                }}
              >
                <pre
                  style={{
                    padding: "var(--spacing-4)",
                    backgroundColor: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    overflowX: "auto",
                  }}
                >
                  <code
                    className={className}
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.9rem",
                      color: "var(--text-primary)",
                    }}
                    {...props}
                  >
                    {children}
                  </code>
                </pre>
              </div>
            ) : (
              <code
                style={{
                  padding: "0.2em 0.4em",
                  backgroundColor: "var(--bg-tertiary)",
                  borderRadius: "var(--border-radius-sm)",
                  fontFamily: "monospace",
                  fontSize: "0.9em",
                  color: "initial",
                }}
                {...props}
              >
                {children}
              </code>
            );
          },
          table: ({ node, ...props }) => (
            <div
              className="table-container"
              style={{ margin: "var(--spacing-6) 0" }}
            >
              <table className="admin-table" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th
              style={{
                padding: "var(--spacing-3) var(--spacing-4)",
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
                fontWeight: 600,
                borderBottom: "1px solid var(--border-color)",
                textAlign: "left",
              }}
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td
              style={{
                padding: "var(--spacing-3) var(--spacing-4)",
                borderBottom: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
              {...props}
            />
          ),
        }}
      >
        {doc.content}
      </ReactMarkdown>
    </article>
  );
}
