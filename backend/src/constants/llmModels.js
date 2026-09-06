/**
 * LLM Models and Provider Configuration
 * Defines allowed models for each provider with validation
 */

export const LLM_PROVIDERS = {
  OPENAI: "openai",
  AZURE: "azure",
  GEMINI: "gemini",
  CUSTOM: "custom",
  SARVAM: "sarvam",
  GROQ: "groq",
  OPENROUTER: "openrouter",
  MISTRAL: "mistral",
  TOGETHER: "together",
};

export const ALLOWED_MODELS = {
  openai: [
    "gpt-3.5-turbo",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-5.1",
  ],
  azure: [
    "azure-gpt-4.1-mini",
    "azure-gpt-4.1-nano",
    "azure-gpt-4o",
    "azure-gpt-4o-mini",
  ],
  // "gemini-2.5-flash-lite" stays listed so agents already configured with it
  // keep validating; GEMINI_MODEL_MAPPING remaps it onto 3.5-flash-lite at call
  // time, since Google now 404s the 2.5 lite endpoint.
  gemini: [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ],
  custom: ["llama-3.3-70b-versatile"],
  sarvam: [
    "sarvam-105b-conversations",
    "sarvam-105b",
  ],
  groq: [
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b",
    "groq/compound-mini",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
  ],
  mistral: [
    "mistral-small-latest",
    "open-mistral-nemo",
    "mistral-large-latest",
    "open-mistral-7b",
    "open-mixtral-8x7b",
    "codestral-latest",
  ],
  together: [
    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    "mistralai/Mistral-7B-Instruct-v0.3",
    "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "Qwen/Qwen2.5-72B-Instruct-Turbo",
    "deepseek-ai/DeepSeek-V3",
  ],
  openrouter: [
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "inclusionai/ling-3.0-flash-fin:free",
    "inclusionai/ling-3.0-flash-sante:free",
    "poolside/laguna-s-2.1:free",
    "dots-studio/dots-3-note-preview:free",
    "minimax/minimax-m2.7:free",
    "liquid/lfm-2.5-2.6b:free",
    "google/gemma-3-27b-it:free",
    "google/gemma-3-12b-it:free",
    "google/gemma-3-4b-it:free",
    "google/gemma-3-1b-it:free",
    "google/gemma-2-9b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "qwen/qwen-2.5-72b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
    "pipecat-ai/phonellm-alpha-1",
    "pipecat-ai/phonellm-alpha-1:free",
    "mistralai/mistral-7b-instruct:free",
    "deepseek/deepseek-chat:free",
    "openai/gpt-4o-mini",
    "anthropic/claude-3.5-haiku",
    "anthropic/claude-3.5-sonnet",
    "meta-llama/llama-3.3-70b-instruct",
  ],
};

export const PROVIDER_CONFIGS = {
  openai: {
    apiKeyEnv: "OPENAI_API_KEY",
    timeout: 30000,
    maxRetries: 3,
  },
  azure: {
    endpointEnv: "AZURE_OPENAI_ENDPOINT",
    apiKeyEnv: "AZURE_OPENAI_KEY",
    timeout: 30000,
    maxRetries: 3,
  },
  gemini: {
    apiKeyEnv: "GEMINI_API_KEY",
    timeout: 30000,
    maxRetries: 3,
  },
  custom: {
    baseUrlEnv: "CUSTOM_LLM_BASE_URL",
    timeout: 30000,
    maxRetries: 2,
  },
  sarvam: {
    apiKeyEnv: "SARVAM_API_KEY",
    timeout: 30000,
    maxRetries: 3,
  },
  groq: {
    apiKeyEnv: "GROQ_API_KEY",
    baseUrlEnv: "GROQ_BASE_URL",
    timeout: 30000,
    maxRetries: 3,
  },
  openrouter: {
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseUrlEnv: "OPENROUTER_BASE_URL",
    timeout: 30000,
    maxRetries: 3,
  },
};

export const DEFAULT_TEMPERATURE = 0.7;
export const MIN_TEMPERATURE = 0;
export const MAX_TEMPERATURE = 1;

/**
 * Validates if a model is allowed for a given provider
 * @param {string} provider - The LLM provider
 * @param {string} model - The model name
 * @returns {boolean} - True if valid, false otherwise
 */
export const isValidModel = (provider, model) => {
  if (provider === "openrouter") {
    const allowed = ALLOWED_MODELS.openrouter;
    return Boolean(
      allowed &&
      (allowed.includes(model) || (typeof model === "string" && model.includes("/")))
    );
  }
  const allowedModels = ALLOWED_MODELS[provider];
  return allowedModels && allowedModels.includes(model);
};

/**
 * Gets the default model for a provider
 * @param {string} provider - The LLM provider
 * @returns {string} - The default model
 */
export const getDefaultModel = (provider) => {
  const models = ALLOWED_MODELS[provider];
  return models ? models[0] : null;
};

/**
 * Validates temperature range
 * @param {number} temperature - The temperature value
 * @returns {boolean} - True if valid, false otherwise
 */
export const isValidTemperature = (temperature) => {
  return (
    typeof temperature === "number" &&
    temperature >= MIN_TEMPERATURE &&
    temperature <= MAX_TEMPERATURE
  );
};
