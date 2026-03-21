---
description: standards for ui buttons and typography
---
// turbo-all

# UI Button and Typography Standards

This workflow defines the standard styling and implementation patterns for buttons and text elements across the Wot-Box application to ensure visual consistency.

## 1. Typography Standards

The application uses the `Outfit` font family.

### Page Headers
All top-level page headers should consistently use the `.header-title` class.
**Do not use inline font-size overrides for headers unless absolutely necessary.**

```tsx
// Correct
<h1 className="header-title" style={{ margin: 0 }}>My Title</h1>

// Correct with Icon
<h1 className="header-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
    <Icon size={32} style={{ color: "var(--accent-color)" }} />
    My Title
</h1>

// Incorrect (Avoid inline font size overrides)
<h1 className="header-title" style={{ fontSize: "1.75rem", margin: 0 }}>My Title</h1>
```

## 2. Button Standards

Buttons should exclusively use global CSS classes rather than inline styles where possible.

### Standard Button Classes
- `.btn`: Base class providing layout, padding, border-radius, font-weight, transition, and hover scaling.
- `.btn-primary`: Uses `--accent-color` background with white text.
- `.btn-outline`: Transparent background with border matching `--border-color`.
- `.btn-sm`: Modifier class for smaller buttons, adjusting padding and font size. Do not use inline `padding` or `fontSize` overrides.

### Implementation Guidelines

**Correct Implementation:**
```tsx
// Standard Primary Button
<button className="btn btn-primary">
    <Icon size={20} />
    <span>Action</span>
</button>

// Standard Outline Button
<button className="btn btn-outline">Cancel</button>

// Small Outline Button
<button className="btn btn-outline btn-sm">Small Action</button>
```

**Incorrect Implementation:**
```tsx
// Incorrect (Avoid inline padding and font size for buttons)
<button className="btn btn-outline" style={{ padding: "0.375rem 0.75rem", fontSize: "0.75rem" }}>
    Small Action
</button>

// Incorrect (Do not apply cursor: pointer as it is already globally applied)
<button className="btn btn-primary" style={{ cursor: "pointer" }}>
    Action
</button>
```

### Destructive Actions
For destructive buttons (e.g. deleting an item), use the base `.btn` class and apply `--danger-color`. Or use `.btn-outline` and override the border/color.
```tsx
// Primary Destructive Button
<button type="button" className="btn" style={{ backgroundColor: "var(--danger-color)", color: "white" }}>
    Permanently Delete
</button>

// Outline Destructive Button
<button className="btn btn-outline" style={{ borderColor: "rgba(239, 68, 68, 0.3)", color: "var(--danger-color)" }}>
    Delete User
</button>
```


> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.
