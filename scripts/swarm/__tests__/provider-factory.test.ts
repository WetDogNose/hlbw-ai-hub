// Pass 17 — createProviderAdapter factory tests.
//
// Exercises the env-driven gating logic in `providers.ts::createProviderAdapter`.
// Does not touch the network or the real registry singleton.

import { describe, expect, it, beforeEach, afterEach } from "@jest/globals";
import {
  createProviderAdapter,
  GeminiAdapter,
  PaperclipAdapter,
} from "../providers";

describe("createProviderAdapter", () => {
  const savedProxy = process.env.PAPERCLIP_PROXY_URL;
  const savedModel = process.env.PAPERCLIP_MODEL;

  beforeEach(() => {
    delete process.env.PAPERCLIP_PROXY_URL;
    delete process.env.PAPERCLIP_MODEL;
  });

  afterEach(() => {
    if (savedProxy === undefined) delete process.env.PAPERCLIP_PROXY_URL;
    else process.env.PAPERCLIP_PROXY_URL = savedProxy;
    if (savedModel === undefined) delete process.env.PAPERCLIP_MODEL;
    else process.env.PAPERCLIP_MODEL = savedModel;
  });

  it('returns a GeminiAdapter for "gemini"', () => {
    const a = createProviderAdapter("gemini");
    expect(a).toBeInstanceOf(GeminiAdapter);
    expect(a.name).toBe("gemini");
  });

  it('throws for "paperclip" when PAPERCLIP_PROXY_URL is unset', () => {
    process.env.PAPERCLIP_MODEL = "ollama_chat/qwen2.5-coder:32b";
    expect(() => createProviderAdapter("paperclip")).toThrow(
      /PAPERCLIP_PROXY_URL and PAPERCLIP_MODEL/,
    );
  });

  it('throws for "paperclip" when PAPERCLIP_MODEL is unset', () => {
    process.env.PAPERCLIP_PROXY_URL = "http://127.0.0.1:4000";
    expect(() => createProviderAdapter("paperclip")).toThrow(
      /PAPERCLIP_PROXY_URL and PAPERCLIP_MODEL/,
    );
  });

  it("returns a PaperclipAdapter when both env vars are set", () => {
    process.env.PAPERCLIP_PROXY_URL = "http://127.0.0.1:4000";
    process.env.PAPERCLIP_MODEL = "ollama_chat/qwen2.5-coder:32b";
    const a = createProviderAdapter("paperclip");
    expect(a).toBeInstanceOf(PaperclipAdapter);
    expect(a.name).toBe("paperclip");
  });

  it("throws for an unknown provider name", () => {
    expect(() => createProviderAdapter("made-up-provider-xyz")).toThrow(
      /Unknown provider/,
    );
  });
});
