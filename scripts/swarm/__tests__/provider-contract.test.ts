// Provider Adapter Contract Tests
// Validates that any LLMProviderAdapter implementation satisfies the blueprint contract.
// Run: npx tsx scripts/swarm/__tests__/provider-contract.test.ts

import {
  LLMProviderAdapter,
  GenerationRequest,
  GenerationResponse,
  GeminiAdapter,
  registerProvider,
  getProvider,
  listProviders,
} from "../providers";

// --- Test Helpers ---

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function assertRejects(fn: () => Promise<any>, message: string) {
  try {
    await fn();
    failed++;
    console.error(`  ❌ FAIL: ${message} (expected rejection, got success)`);
  } catch {
    passed++;
    console.log(`  ✅ ${message}`);
  }
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

// --- Contract Test Suite ---
// These tests validate that ANY adapter conforming to LLMProviderAdapter meets the contract.

async function runContractTests(adapter: LLMProviderAdapter) {
  section(`Contract Tests: ${adapter.name}`);

  // 1. Name is a non-empty string
  assert(typeof adapter.name === "string" && adapter.name.length > 0, "adapter.name is a non-empty string");

  // 2. generate() returns a GenerationResponse with required fields
  const request: GenerationRequest = {
    systemPrompt: "You are a test agent.",
    userPrompt: "Say hello.",
    modelId: "test-model",
    maxTokens: 100,
    temperature: 0.5,
  };

  const response = await adapter.generate(request);

  assert(typeof response.text === "string", "response.text is a string");
  assert(response.text.length > 0, "response.text is non-empty");
  assert(typeof response.provider === "string", "response.provider is a string");
  assert(response.provider === adapter.name, `response.provider matches adapter.name ("${response.provider}" === "${adapter.name}")`);
  assert(typeof response.modelId === "string", "response.modelId is a string");
  assert(response.modelId.length > 0, "response.modelId is non-empty");

  // 3. Optional fields are correct types when present
  if (response.finishReason !== undefined) {
    assert(typeof response.finishReason === "string", "response.finishReason is a string when present");
  }
  if (response.inputTokens !== undefined) {
    assert(typeof response.inputTokens === "number", "response.inputTokens is a number when present");
  }
  if (response.outputTokens !== undefined) {
    assert(typeof response.outputTokens === "number", "response.outputTokens is a number when present");
  }
  if (response.totalTokens !== undefined) {
    assert(typeof response.totalTokens === "number", "response.totalTokens is a number when present");
  }

  // 4. healthcheck() returns a boolean
  const health = await adapter.healthcheck();
  assert(typeof health === "boolean", "healthcheck() returns a boolean");

  // 5. generate() handles empty prompts gracefully (should not crash)
  const emptyRequest: GenerationRequest = {
    systemPrompt: "",
    userPrompt: "",
    modelId: "test-model",
  };
  try {
    const emptyResponse = await adapter.generate(emptyRequest);
    assert(typeof emptyResponse.text === "string", "generate() handles empty prompts without throwing");
  } catch (err) {
    // It's acceptable to throw on empty prompts, but it should be a clean error
    assert(err instanceof Error, "generate() throws a proper Error on empty prompts");
  }

  // 6. generate() respects modelId passthrough
  const customModelReq: GenerationRequest = {
    systemPrompt: "System",
    userPrompt: "User",
    modelId: "custom-model-xyz",
  };
  const customResp = await adapter.generate(customModelReq);
  assert(customResp.modelId === "custom-model-xyz", "generate() passes through the requested modelId");

  // 7. Idempotent healthcheck (calling twice gives consistent results)
  const health2 = await adapter.healthcheck();
  assert(health === health2, "healthcheck() is idempotent (consistent results)");
}

// --- Registry Contract Tests ---

async function runRegistryTests() {
  section("Registry Contract Tests");

  // 1. Built-in adapter is registered
  const providers = listProviders();
  assert(providers.includes("gemini"), "Gemini adapter is auto-registered");

  // 2. getProvider returns a valid adapter
  const adapter = getProvider("gemini");
  assert(adapter instanceof GeminiAdapter, "getProvider('gemini') returns a GeminiAdapter instance");

  // 3. getProvider throws for unknown provider
  await assertRejects(
    async () => getProvider("nonexistent-provider-xyz"),
    "getProvider throws for unknown provider"
  );

  // 4. registerProvider + getProvider roundtrip
  const mockAdapter: LLMProviderAdapter = {
    name: "test-mock",
    async generate(req: GenerationRequest): Promise<GenerationResponse> {
      return { text: "mock response", provider: "test-mock", modelId: req.modelId };
    },
    async healthcheck(): Promise<boolean> {
      return true;
    },
  };

  registerProvider(mockAdapter);
  assert(listProviders().includes("test-mock"), "registerProvider adds adapter to registry");

  const retrieved = getProvider("test-mock");
  assert(retrieved.name === "test-mock", "getProvider retrieves the registered mock adapter");

  // 5. Mock adapter also passes full contract tests
  await runContractTests(mockAdapter);
}

// --- Run All ---

async function main() {
  console.log("🧪 Provider Adapter Contract Test Suite\n");

  // Test the built-in GeminiAdapter
  const gemini = new GeminiAdapter();
  await runContractTests(gemini);

  // Test the registry
  await runRegistryTests();

  console.log(`\n━━━ Results ━━━`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
