import {
  Activity,
  Server,
  Cpu,
  Layers,
  Wrench,
  GitMerge,
  FileCode2,
  Command,
} from "lucide-react";
import Link from "next/link";
import { getSkills, getWorkflows, getTools } from "@/lib/tools-registry";

export default async function Home() {
  const skills = getSkills();
  const workflows = getWorkflows();
  const tools = getTools();

  return (
    <main className="container-admin">
      {/* Hero Section */}
      <section
        className="hero-section"
        style={{
          marginBottom: "var(--spacing-8)",
          padding: "var(--spacing-8) 0",
        }}
      >
        <div className="ambient-glow"></div>
        <h1
          className="page-title text-gradient"
          style={{
            justifyContent: "center",
            fontSize: "4rem",
            marginBottom: "var(--spacing-4)",
            textAlign: "center",
          }}
        >
          HLBW.org
        </h1>
        <p
          className="page-description text-center"
          style={{ fontSize: "1.35rem", maxWidth: "600px", margin: "0 auto" }}
        >
          AI Hub Toolchain Registry &amp; Orchestration Control Plane
        </p>
      </section>

      {/* Admin Stats Compact */}
      <div
        className="admin-stats-grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          marginBottom: "var(--spacing-12)",
        }}
      >
        <div className="stat-box" style={{ padding: "var(--spacing-4)" }}>
          <div className="stat-box-title">
            <Cpu size={16} style={{ color: "var(--info-color)" }} /> Active
            Nodes
          </div>
          <div
            className="stat-box-value"
            style={{ fontSize: "1.75rem", marginTop: "0" }}
          >
            14
          </div>
        </div>
        <div className="stat-box" style={{ padding: "var(--spacing-4)" }}>
          <div className="stat-box-title">
            <Server size={16} style={{ color: "var(--purple-color)" }} />{" "}
            Connected MCPs
          </div>
          <div
            className="stat-box-value"
            style={{ fontSize: "1.75rem", marginTop: "0" }}
          >
            8
          </div>
        </div>
        <div className="stat-box" style={{ padding: "var(--spacing-4)" }}>
          <div className="stat-box-title">
            <Layers size={16} style={{ color: "var(--success-color)" }} />{" "}
            Swarms
          </div>
          <div
            className="stat-box-value"
            style={{ fontSize: "1.75rem", marginTop: "0" }}
          >
            1,204
          </div>
        </div>
        <div
          className="stat-box flex flex-col justify-center items-center gap-2"
          style={{
            padding: "var(--spacing-4)",
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "transparent",
          }}
        >
          <Link
            href="/scion"
            className="btn w-full"
            style={{
              padding: "var(--spacing-2)",
              background:
                "linear-gradient(to right, var(--scion-accent-1), var(--scion-accent-2))",
              color: "white",
              border: "none",
              fontWeight: "bold",
            }}
          >
            Scion Command Center
          </Link>
          <Link
            href="/admin/stats"
            className="btn btn-outline w-full"
            style={{ padding: "var(--spacing-2)" }}
          >
            Admin Dashboard
          </Link>
          <Link
            href="/docs"
            className="btn btn-outline w-full"
            style={{ padding: "var(--spacing-2)" }}
          >
            Documentation Hub
          </Link>
        </div>
      </div>

      <div className="section-header mt-8 mb-6 flex items-center gap-3">
        <Wrench
          className="text-accent"
          size={24}
          style={{ color: "var(--accent-color)" }}
        />
        <h2 style={{ fontSize: "1.5rem" }}>Core Skills ({skills.length})</h2>
      </div>
      <div className="card-grid mb-12">
        {skills.map((skill) => (
          <div
            key={skill.id}
            className="card"
            style={{ transition: "all 0.3s ease" }}
          >
            <div
              className="card-header"
              style={{
                padding: "var(--spacing-4)",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <h3
                className="card-header-title text-primary"
                style={{
                  fontSize: "1.05rem",
                  display: "flex",
                  gap: "var(--spacing-2)",
                  alignItems: "center",
                }}
              >
                <FileCode2 size={16} style={{ color: "var(--info-color)" }} />
                {skill.name}
              </h3>
            </div>
            <div className="card-body" style={{ padding: "var(--spacing-4)" }}>
              <p
                className="text-secondary"
                style={{ fontSize: "0.9rem", lineHeight: "1.6" }}
              >
                {skill.description}
              </p>
            </div>
            <div
              className="card-footer"
              style={{
                padding: "var(--spacing-3) var(--spacing-4)",
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                fontFamily: "monospace",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{skill.path}</span>
              <span className="badge badge-info">Skill</span>
            </div>
          </div>
        ))}
      </div>

      <div className="section-header mt-8 mb-6 flex items-center gap-3">
        <GitMerge
          className="text-success"
          size={24}
          style={{ color: "var(--success-color)" }}
        />
        <h2 style={{ fontSize: "1.5rem" }}>
          Agent Workflows ({workflows.length})
        </h2>
      </div>
      <div className="card-grid mb-12">
        {workflows.map((workflow) => (
          <div
            key={workflow.id}
            className="card"
            style={{ transition: "all 0.3s ease" }}
          >
            <div
              className="card-header"
              style={{
                padding: "var(--spacing-4)",
                borderBottom: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-success-subtle)",
              }}
            >
              <h3
                className="card-header-title text-primary"
                style={{
                  fontSize: "1.05rem",
                  display: "flex",
                  gap: "var(--spacing-2)",
                  alignItems: "center",
                }}
              >
                <GitMerge size={16} style={{ color: "var(--success-color)" }} />
                {workflow.name}
              </h3>
            </div>
            <div className="card-body" style={{ padding: "var(--spacing-4)" }}>
              <p
                className="text-secondary"
                style={{ fontSize: "0.9rem", lineHeight: "1.6" }}
              >
                {workflow.description}
              </p>
            </div>
            <div
              className="card-footer"
              style={{
                padding: "var(--spacing-3) var(--spacing-4)",
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                fontFamily: "monospace",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{workflow.path}</span>
              <span className="badge badge-success">Workflow</span>
            </div>
          </div>
        ))}
      </div>

      {tools.length > 0 && (
        <>
          <div className="section-header mt-8 mb-6 flex items-center gap-3">
            <Command
              className="text-warning"
              size={24}
              style={{ color: "var(--warning-color)" }}
            />
            <h2 style={{ fontSize: "1.5rem" }}>Tools Hub ({tools.length})</h2>
          </div>
          <div className="card-grid mb-12">
            {tools.map((tool) => (
              <div
                key={tool.id}
                className="card"
                style={{ transition: "all 0.3s ease" }}
              >
                <div
                  className="card-header"
                  style={{
                    padding: "var(--spacing-4)",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  <h3
                    className="card-header-title text-primary"
                    style={{
                      fontSize: "1.05rem",
                      display: "flex",
                      gap: "var(--spacing-2)",
                      alignItems: "center",
                    }}
                  >
                    <Command
                      size={16}
                      style={{ color: "var(--warning-color)" }}
                    />
                    {tool.name}
                  </h3>
                </div>
                <div
                  className="card-body"
                  style={{ padding: "var(--spacing-4)" }}
                >
                  <p
                    className="text-secondary"
                    style={{ fontSize: "0.9rem", lineHeight: "1.6" }}
                  >
                    {tool.description}
                  </p>
                </div>
                <div
                  className="card-footer"
                  style={{
                    padding: "var(--spacing-3) var(--spacing-4)",
                    fontSize: "0.8rem",
                    color: "var(--text-muted)",
                    fontFamily: "monospace",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>{tool.path}</span>
                  <span className="badge badge-warning">Tool</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
