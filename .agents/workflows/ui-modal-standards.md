---
description: How to style modals consistently across the application
---
// turbo-all

# UI Modal Standards

When creating or modifying modals in this application, you MUST follow these formatting and styling standards to ensure a consistent, premium user experience.

## 1. The Backdrop (Overlay)
The modal backdrop MUST use a semi-transparent dark background with a frosted glass effect (blur).

```tsx
<div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={handleClose}>
    {/* Modal Content Here */}
</div>
```

## 2. The Card Container
The main modal container MUST use the global `.card` class and manage its own internal scrolling if necessary.

```tsx
<div className="card" style={{ width: "100%", maxWidth: "450px", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
    {/* Header, Body, Footer */}
</div>
```

## 3. The Header
The header MUST have a bottom border, consistent padding, and standard typography with an icon if appropriate.

```tsx
<div style={{ padding: "1.5rem", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--text-primary)" }}>
    <Icon size={24} />
    <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", margin: 0 }}>Modal Title</h2>
</div>
```
*Note: For destructive actions (like Delete), use `color: "var(--danger-color)"` on the icon/header text.*

## 4. The Body
The body MUST have padding matching the header and utilize standard typography variables.

```tsx
<div style={{ padding: "1.5rem" }}>
    <p style={{ margin: "0 0 1.5rem 0", lineHeight: "1.5", color: "var(--text-secondary)" }}>
        Modal description or form content goes here.
    </p>
    {/* Form inputs, etc. */}
</div>
```

## 5. The Footer (Actions)
The footer MUST have a top border, right-aligned buttons, and use the tertiary background color for visual separation.

```tsx
<div style={{ borderTop: "1px solid var(--border-color)", padding: "1.5rem", display: "flex", justifyContent: "flex-end", gap: "0.75rem", backgroundColor: "var(--bg-tertiary)" }}>
    <button className="btn btn-outline" style={{ backgroundColor: "var(--bg-secondary)" }} onClick={handleClose}>
        Cancel
    </button>
    <button className="btn btn-primary" onClick={handleAction}>
        Confirm Action
    </button>
</div>
```
*Note: For destructive actions, the primary button should use `style={{ backgroundColor: "var(--danger-color)", color: "white" }}`.*


> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.
