"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import {
  Save,
  RotateCcw,
  Box as BoxIcon,
  Info,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

// Types
type AppearanceSetting = {
  id: string;
  isActive: boolean;
  createdAt: string;
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  fontFamily: string;
  titleGradientStart: string;
  titleGradientEnd: string;
  accentColor: string;
  accentHover: string;
  dangerColor: string;
  successColor: string;
  warningColor: string;
  infoColor: string;
  purpleColor: string;
  borderColor: string;
  borderRadiusSm: string;
  borderRadiusMd: string;
  borderRadiusLg: string;
  borderRadiusFull: string;
  customHtmlBackground: string;
  customHtmlBackgroundEnabled: boolean;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function AppearanceAdminPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/appearance", fetcher);

  const [formValues, setFormValues] =
    useState<Partial<AppearanceSetting> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const sandboxBgRef = useRef<HTMLDivElement>(null);
  const [previewHtmlBackground, setPreviewHtmlBackground] =
    useState<string>("");
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  const [isValidated, setIsValidated] = useState<boolean>(true); // True by default unless changed

  // Initialize form when data loads
  useEffect(() => {
    if (data?.active && !formValues) {
      setFormValues(data.active);
      setPreviewHtmlBackground(data.active.customHtmlBackground || "");
    }
  }, [data, formValues]);

  // Listen for iframe sandbox errors via postMessage
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "SANDBOX_ERROR") {
        setSandboxError(e.data.message);
        setIsValidated(false);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Reset validation state when a new preview is triggered
  useEffect(() => {
    if (previewHtmlBackground) {
      setSandboxError(null);
      setIsValidated(true);
    }
  }, [previewHtmlBackground]);

  // Handle changes to the text area to invalidate the save button until previewed
  const handleCustomHtmlChange = (value: string) => {
    handleChange("customHtmlBackground", value);
    if (value !== previewHtmlBackground) {
      setIsValidated(false);
    }
  };

  const handleChange = (
    field: keyof AppearanceSetting,
    value: string | boolean,
  ) => {
    if (!formValues) return;
    setFormValues({ ...formValues, [field]: value as never });
  };

  const handleSave = async (
    settingToSave: Partial<AppearanceSetting> = formValues as Partial<AppearanceSetting>,
  ) => {
    if (!settingToSave) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/appearance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingToSave),
      });

      if (response.ok) {
        // Also mutate the global theme injector endpoint so the whole app updates immediately
        mutate();
        fetch("/api/appearance/active");

        // Let's force a reload so the global ThemeInjector picks it up and we get a clean slate
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to save appearance settings", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestore = (historicalSetting: AppearanceSetting) => {
    if (confirm("Restore this historical visual configuration globally?")) {
      handleSave(historicalSetting);
    }
  };

  if (isLoading || !formValues) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin spinner"></div>
      </div>
    );
  }

  // Helper for generating the massive style object for the sandbox
  const sandboxStyle = {
    "--bg-primary": formValues.bgPrimary,
    "--bg-secondary": formValues.bgSecondary,
    "--bg-tertiary": formValues.bgTertiary,
    "--text-primary": formValues.textPrimary,
    "--text-secondary": formValues.textSecondary,
    "--text-muted": formValues.textMuted,
    "--accent-color": formValues.accentColor,
    "--accent-hover": formValues.accentHover,
    "--danger-color": formValues.dangerColor,
    "--success-color": formValues.successColor,
    "--warning-color": formValues.warningColor,
    "--info-color": formValues.infoColor,
    "--purple-color": formValues.purpleColor,
    "--border-color": formValues.borderColor,
    "--border-radius-sm": formValues.borderRadiusSm,
    "--border-radius-md": formValues.borderRadiusMd,
    "--border-radius-lg": formValues.borderRadiusLg,
    "--border-radius-full": formValues.borderRadiusFull,
    "--title-gradient-start": formValues.titleGradientStart,
    "--title-gradient-end": formValues.titleGradientEnd,
    fontFamily: formValues.fontFamily,
  } as React.CSSProperties;

  return (
    <div className="form-layout">
      <div className="page-header justify-between">
        <div>
          <h2 className="page-title">Global Appearance</h2>
          <p className="page-description">
            Configure branding, colors, border aesthetics, and theme preferences
            for the entire application.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <button
            onClick={() => handleSave()}
            disabled={isSaving || !isValidated}
            className="btn btn-primary"
            title={
              !isValidated
                ? "You must successfully 'Preview in Sandbox' before saving."
                : ""
            }
          >
            {isSaving ? (
              "Applying..."
            ) : (
              <>
                <Save size={18} /> Apply Configuration
              </>
            )}
          </button>
        </div>
      </div>

      <div className="two-col-grid">
        {/* Left Col: Form Configuration */}
        <div className="card">
          <div className="card-body form-layout">
            <section>
              <h3 className="section-header">Backgrounds</h3>
              <div className="two-col-grid gap-4">
                <ColorInput
                  label="Primary Default"
                  value={formValues.bgPrimary!}
                  onChange={(v) => handleChange("bgPrimary", v)}
                />
                <ColorInput
                  label="Secondary (Cards)"
                  value={formValues.bgSecondary!}
                  onChange={(v) => handleChange("bgSecondary", v)}
                />
                <ColorInput
                  label="Tertiary (Hover/Subtle)"
                  value={formValues.bgTertiary!}
                  onChange={(v) => handleChange("bgTertiary", v)}
                />
              </div>
            </section>

            <section>
              <h3 className="section-header">Typography</h3>
              <div className="form-group mb-4">
                <label className="form-label">Font Family Stack</label>
                <input
                  type="text"
                  className="form-input"
                  value={formValues.fontFamily}
                  onChange={(e) => handleChange("fontFamily", e.target.value)}
                />
              </div>
              <div className="two-col-grid gap-4">
                <ColorInput
                  label="Text Primary"
                  value={formValues.textPrimary!}
                  onChange={(v) => handleChange("textPrimary", v)}
                />
                <ColorInput
                  label="Text Secondary"
                  value={formValues.textSecondary!}
                  onChange={(v) => handleChange("textSecondary", v)}
                />
                <ColorInput
                  label="Title Gradient Start"
                  value={formValues.titleGradientStart!}
                  onChange={(v) => handleChange("titleGradientStart", v)}
                />
                <ColorInput
                  label="Title Gradient End"
                  value={formValues.titleGradientEnd!}
                  onChange={(v) => handleChange("titleGradientEnd", v)}
                />
              </div>
            </section>

            <section>
              <h3 className="section-header">Accents & Identity</h3>
              <div className="two-col-grid gap-4">
                <ColorInput
                  label="Accent Primary"
                  value={formValues.accentColor!}
                  onChange={(v) => handleChange("accentColor", v)}
                />
                <ColorInput
                  label="Accent Hover"
                  value={formValues.accentHover!}
                  onChange={(v) => handleChange("accentHover", v)}
                />
                <ColorInput
                  label="Border Color"
                  value={formValues.borderColor!}
                  onChange={(v) => handleChange("borderColor", v)}
                />
              </div>
            </section>

            <section>
              <h3 className="section-header">Status Colors</h3>
              <div className="two-col-grid gap-4">
                <ColorInput
                  label="Danger (Red)"
                  value={formValues.dangerColor!}
                  onChange={(v) => handleChange("dangerColor", v)}
                />
                <ColorInput
                  label="Success (Green)"
                  value={formValues.successColor!}
                  onChange={(v) => handleChange("successColor", v)}
                />
                <ColorInput
                  label="Warning (Yellow)"
                  value={formValues.warningColor!}
                  onChange={(v) => handleChange("warningColor", v)}
                />
                <ColorInput
                  label="Info (Blue)"
                  value={formValues.infoColor!}
                  onChange={(v) => handleChange("infoColor", v)}
                />
              </div>
            </section>

            <section>
              <h3 className="section-header">Border Radii</h3>
              <div className="two-col-grid gap-4">
                <TextInput
                  label="Radius Small"
                  value={formValues.borderRadiusSm!}
                  onChange={(v) => handleChange("borderRadiusSm", v)}
                />
                <TextInput
                  label="Radius Medium"
                  value={formValues.borderRadiusMd!}
                  onChange={(v) => handleChange("borderRadiusMd", v)}
                />
                <TextInput
                  label="Radius Large"
                  value={formValues.borderRadiusLg!}
                  onChange={(v) => handleChange("borderRadiusLg", v)}
                />
              </div>
            </section>

            <section>
              <h3 className="section-header">Advanced Customization</h3>

              <div className="form-group mb-6">
                <label className="form-label flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formValues.customHtmlBackgroundEnabled ?? true}
                    onChange={(e) =>
                      handleChange(
                        "customHtmlBackgroundEnabled",
                        e.target.checked,
                      )
                    }
                    style={{
                      width: "18px",
                      height: "18px",
                      cursor: "pointer",
                      accentColor: "var(--accent-color)",
                    }}
                  />
                  <span>Enable Custom HTML/JS Background</span>
                </label>
              </div>

              <div className="form-group mb-4">
                <label className="form-label flex justify-between items-center">
                  <span>Custom HTML/JS Script</span>
                  <span
                    className="flex items-center gap-1 text-warning"
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--warning-color)",
                    }}
                  >
                    <Info size={14} /> Use with caution
                  </span>
                </label>
                <p
                  className="text-secondary"
                  style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}
                >
                  Inject raw HTML and scripts behind the application UI (e.g.
                  animated canvas, SVG). Rendered globally with{" "}
                  <code>z-index: -10</code> and{" "}
                  <code>pointer-events: none</code>.
                </p>
                <textarea
                  className="form-input"
                  value={formValues.customHtmlBackground || ""}
                  onChange={(e) => handleCustomHtmlChange(e.target.value)}
                  maxLength={100000}
                  style={{
                    minHeight: "240px",
                    fontFamily: "monospace",
                    fontSize: "0.875rem",
                    marginBottom: "0.5rem",
                    borderColor: sandboxError ? "var(--danger-color)" : "",
                  }}
                  placeholder="<!-- Example Canvas Animation -->&#10;<canvas id='bg-canvas'></canvas>&#10;<script>&#10;  // Javascript rendering code&#10;</script>"
                />

                {sandboxError && (
                  <div
                    style={{
                      color: "var(--danger-color)",
                      fontSize: "0.875rem",
                      padding: "0.5rem",
                      borderRadius: "var(--border-radius-sm)",
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      marginBottom: "0.5rem",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.5rem",
                    }}
                  >
                    <AlertCircle
                      size={16}
                      style={{ marginTop: "2px", flexShrink: 0 }}
                    />
                    <span
                      style={{
                        fontFamily: "monospace",
                        wordBreak: "break-all",
                      }}
                    >
                      Error: {sandboxError}
                    </span>
                  </div>
                )}
                {!isValidated &&
                  !sandboxError &&
                  formValues.customHtmlBackground !== previewHtmlBackground && (
                    <div
                      style={{
                        color: "var(--warning-color)",
                        fontSize: "0.875rem",
                        padding: "0.5rem",
                        marginBottom: "0.5rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <Info size={16} /> Please preview your changes to validate
                      them before saving.
                    </div>
                  )}
                <button
                  type="button"
                  onClick={() =>
                    setPreviewHtmlBackground(
                      formValues.customHtmlBackground || "",
                    )
                  }
                  className="btn btn-outline"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  Preview in Sandbox
                </button>
              </div>
            </section>
          </div>
        </div>

        {/* Right Col: Live Preview Sandbox */}
        <div style={{ position: "sticky", top: "2rem", height: "fit-content" }}>
          <h3
            className="section-header flex items-center gap-2"
            style={{ marginBottom: "1rem", borderBottom: "none" }}
          >
            Live Preview Sandbox
          </h3>
          <div
            style={{
              ...sandboxStyle,
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              borderRadius: "16px",
              padding: "2rem",
              boxShadow: "var(--shadow-xl)",
              display: "flex",
              flexDirection: "column",
              gap: "2rem",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {previewHtmlBackground && (
              <iframe
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  zIndex: 0,
                  border: "none",
                  pointerEvents: "none",
                }}
                srcDoc={`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <style>
                        :root {
                          --bg-primary: ${formValues.bgPrimary};
                          --bg-secondary: ${formValues.bgSecondary};
                          --bg-tertiary: ${formValues.bgTertiary};
                          --text-primary: ${formValues.textPrimary};
                          --text-secondary: ${formValues.textSecondary};
                          --text-muted: ${formValues.textMuted};
                          --accent-color: ${formValues.accentColor};
                          --accent-hover: ${formValues.accentHover};
                          --danger-color: ${formValues.dangerColor};
                          --success-color: ${formValues.successColor};
                          --warning-color: ${formValues.warningColor};
                          --info-color: ${formValues.infoColor};
                          --purple-color: ${formValues.purpleColor};
                          --border-color: ${formValues.borderColor};
                        }
                        html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
                      </style>
                      <script>
                        window.onerror = function(msg) {
                          window.parent.postMessage({ type: 'SANDBOX_ERROR', message: msg }, '*');
                        };
                      </script>
                    </head>
                    <body>
                      ${previewHtmlBackground}
                    </body>
                  </html>
                `}
                sandbox="allow-scripts allow-same-origin"
                title="Background Preview Sandbox"
              />
            )}

            <div
              style={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "var(--spacing-8)",
              }}
            >
              {/* Mock Header */}
              <div
                className="flex justify-between items-center"
                style={{
                  borderBottom: "1px solid var(--border-color)",
                  paddingBottom: "var(--spacing-4)",
                }}
              >
                <h1
                  className="text-gradient"
                  style={{ fontSize: "2rem", fontWeight: 700, margin: 0 }}
                >
                  Wot-Box
                </h1>
                <div className="flex gap-4">
                  <button className="btn btn-outline">Sign In</button>
                  <button className="btn btn-primary">Get Started</button>
                </div>
              </div>

              {/* Mock Content */}
              <div className="flex flex-col gap-4">
                <div
                  className="flex items-center gap-2"
                  style={{
                    backgroundColor: "var(--bg-success-subtle)",
                    border: "1px solid var(--success-color)",
                    borderRadius: "var(--border-radius-md)",
                    color: "var(--success-color)",
                    padding: "var(--spacing-4)",
                  }}
                >
                  <Info size={20} /> Successful operation alert example.
                </div>

                <div className="card card-half">
                  <div
                    className="flex items-center justify-center p-12"
                    style={{ backgroundColor: "var(--bg-tertiary)" }}
                  >
                    <BoxIcon size={48} className="text-muted" />
                  </div>
                  <div className="card-body form-layout">
                    <h3
                      style={{
                        fontSize: "1.25rem",
                        fontWeight: 600,
                        marginBottom: "0.5rem",
                      }}
                    >
                      Kitchen Supplies
                    </h3>
                    <p className="text-secondary mb-4">
                      Contains plates, bowls, and silverware from the old
                      apartment.
                    </p>
                    <button className="btn btn-outline w-full">
                      View Box Details
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="card mt-8">
        <div className="card-header">
          <div className="card-header-title">
            Configuration History (Last 10)
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div
            className="table-container"
            style={{ border: "none", borderRadius: 0 }}
          >
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date Modified</th>
                  <th>Status</th>
                  <th>Highlights</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.history?.map((historyRow: AppearanceSetting) => (
                  <tr
                    key={historyRow.id}
                    style={{
                      backgroundColor: historyRow.isActive
                        ? "var(--bg-accent-subtle)"
                        : "transparent",
                    }}
                  >
                    <td
                      className="text-secondary"
                      style={{ fontSize: "0.875rem" }}
                    >
                      {format(
                        new Date(historyRow.createdAt),
                        "MMM d, yyyy HH:mm:ss",
                      )}
                    </td>
                    <td>
                      {historyRow.isActive ? (
                        <span className="badge badge-accent">
                          <CheckCircle2 size={12} /> Active
                        </span>
                      ) : (
                        <span className="badge badge-neutral">Archived</span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <div
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            backgroundColor: historyRow.bgPrimary,
                            border: "1px solid var(--border-color)",
                          }}
                          title={`bg: ${historyRow.bgPrimary}`}
                        ></div>
                        <div
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            backgroundColor: historyRow.accentColor,
                            border: "1px solid var(--border-color)",
                          }}
                          title={`accent: ${historyRow.accentColor}`}
                        ></div>
                        <div
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            background: `linear-gradient(to right, ${historyRow.titleGradientStart}, ${historyRow.titleGradientEnd})`,
                            border: "1px solid var(--border-color)",
                          }}
                          title="gradient"
                        ></div>
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {!historyRow.isActive && (
                        <button
                          onClick={() => handleRestore(historyRow)}
                          className="btn btn-outline"
                          style={{
                            borderColor: "var(--accent-border-subtle)",
                            color: "var(--accent-color)",
                            fontSize: "0.875rem",
                          }}
                        >
                          <RotateCcw
                            size={14}
                            style={{ marginRight: "var(--spacing-1-5)" }}
                          />{" "}
                          Restore
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {(!data?.history || data.history.length === 0) && (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: "2rem",
                        textAlign: "center",
                        color: "var(--text-muted)",
                      }}
                    >
                      No history blocks available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Minimal Input Helper for colors
function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="form-group" style={{ marginBottom: "0" }}>
      <label className="form-label" style={{ fontSize: "0.875rem" }}>
        {label}
      </label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "40px",
            height: "40px",
            padding: "0",
            border: "1px solid var(--border-color)",
            borderRadius: "4px",
            objectFit: "cover",
            cursor: "pointer",
          }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="form-input"
          style={{ flex: 1, padding: "0.5rem" }}
        />
      </div>
    </div>
  );
}

// Minimal Input Helper for text
function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="form-group" style={{ marginBottom: "0" }}>
      <label className="form-label" style={{ fontSize: "0.875rem" }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="form-input"
        style={{ padding: "0.5rem" }}
      />
    </div>
  );
}
