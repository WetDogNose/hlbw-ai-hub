# Google ADK & A2A SDK Integration

## Overview
This document tracks the integration of Google's Agent Development Kit (ADK) and the Agent2Agent (A2A) SDK into the HLBW AI Hub. These libraries were added to allow for future multi-agent workflows and more complex AI agent behavior.

## Installation Details
- Packages installed: `@google/adk`, `@a2a-js/sdk`
- Note: `--legacy-peer-deps` was used during installation due to OpenTelemetry peer dependency version conflicts between `@google/adk` and the root project's existing OpenTelemetry configuration (the hub uses newer versions).
