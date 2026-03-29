# Google ADK & A2A SDK Integration

> [!NOTE]
> **Architectural Context**
> This is a component-specific technical specification. For the unified master pipeline map and inter-component relationships, please refer to the [V3 Swarming Model Architecture Master Document](../v3-swarming-model-architecture.md).

## Overview

This document tracks the integration of Google's Agent Development Kit (ADK) and the Agent2Agent (A2A) SDK into the HLBW AI Hub. These libraries were added to allow for future multi-agent workflows and more complex AI agent behavior.

## Installation Details

- Packages installed: `@google/adk`, `@a2a-js/sdk`
- Note: `--legacy-peer-deps` was used during installation due to OpenTelemetry peer dependency version conflicts between `@google/adk` and the root project's existing OpenTelemetry configuration (the hub uses newer versions).
