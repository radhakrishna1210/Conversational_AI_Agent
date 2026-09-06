import test from "node:test";
import assert from "node:assert/strict";
import { LLM_PROVIDERS, ALLOWED_MODELS } from "../../../constants/llmModels.js";
import { getLLMProvider } from "../../llm.factory.js";
import { MODEL_GROUPS } from "../../platform/modelCatalog.js";

test("LLM Providers Suite (Groq, Mistral, Together, OpenRouter, Sarvam)", async (t) => {
  await t.test("LLM_PROVIDERS contains all providers", () => {
    assert.equal(LLM_PROVIDERS.GROQ, "groq");
    assert.equal(LLM_PROVIDERS.MISTRAL, "mistral");
    assert.equal(LLM_PROVIDERS.TOGETHER, "together");
    assert.equal(LLM_PROVIDERS.OPENROUTER, "openrouter");
    assert.equal(LLM_PROVIDERS.SARVAM, "sarvam");
  });

  await t.test("ALLOWED_MODELS defines models for all providers", () => {
    assert.ok(ALLOWED_MODELS.groq.includes("openai/gpt-oss-20b"));
    assert.ok(ALLOWED_MODELS.mistral.includes("mistral-small-latest"));
    assert.ok(ALLOWED_MODELS.together.includes("meta-llama/Llama-3.3-70B-Instruct-Turbo"));
    assert.ok(ALLOWED_MODELS.openrouter.includes("google/gemma-4-31b-it:free"));
  });

  await t.test("getLLMProvider returns correct instances", () => {
    const groq = getLLMProvider("groq");
    assert.ok(typeof groq.generateResponseStream === "function");

    const mistral = getLLMProvider("mistral");
    assert.ok(typeof mistral.generateResponseStream === "function");

    const together = getLLMProvider("together");
    assert.ok(typeof together.generateResponseStream === "function");

    const openrouter = getLLMProvider("openrouter");
    assert.ok(typeof openrouter.generateResponseStream === "function");
  });

  await t.test("MODEL_GROUPS contains Groq, Mistral, and Together options", () => {
    const llmGroup = MODEL_GROUPS.find((g) => g.key === "llm");
    assert.ok(llmGroup);
    const hasGroq = llmGroup.models.some((m) => m.provider === "Groq");
    const hasMistral = llmGroup.models.some((m) => m.provider === "Mistral");
    const hasTogether = llmGroup.models.some((m) => m.provider === "Together");
    const hasOpenRouter = llmGroup.models.some((m) => m.provider === "OpenRouter");

    assert.ok(hasGroq);
    assert.ok(hasMistral);
    assert.ok(hasTogether);
    assert.ok(hasOpenRouter);
  });
});
