/**
 * LLM Models and Provider Configuration
 * Defines allowed models for each provider with validation
 */

export const LLM_PROVIDERS = {
  OPENAI: "openai",
  AZURE: "azure",
  GEMINI: "gemini",
  CUSTOM: "custom",
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
  gemini: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
  custom: ["llama-3.3-70b-versatile"],
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
