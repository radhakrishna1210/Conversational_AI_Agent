/**
 * OpenAI Model Mapping & Constants
 * Maps UI model names to actual OpenAI API models
 */

/**
 * UI to OpenAI API Model Mapping
 */
export const OPENAI_MODEL_MAPPING = {
  "gpt-3.5-turbo": "gpt-3.5-turbo",
  "gpt-4.1-mini": "gpt-4.1-mini",
  "gpt-4.1-nano": "gpt-4.1-nano",
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  "gpt-5.1": "gpt-5.1",
};

/**
 * List of supported UI model names
 */
export const SUPPORTED_OPENAI_MODELS = Object.keys(OPENAI_MODEL_MAPPING);

/**
 * Default model to use if not specified
 */
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

/**
 * OpenAI Configuration Constants
 */
export const OPENAI_CONFIG = {
  // API defaults
  timeout: 30000, // 30 seconds
  maxRetries: 2,
  retryDelay: 1000, // 1 second between retries

  // Rate limiting
  rateLimiting: {
    enabled: true,
    maxRequests: 10, // Max 10 requests (OpenAI often has higher limits than Gemini free)
    windowMs: 1000, // Per 1 second
  },

  // Caching
  caching: {
    enabled: true,
    ttl: 3600, // 1 hour in seconds
    maxSize: 100, // Max 100 cached responses
  },

  // Token limits (approximate defaults)
  tokenLimits: {
    input: 128000,
    output: 4096,
  },

  // Temperature range
  temperature: {
    min: 0,
    max: 2,
    default: 0.7,
  },

  // Top P range
  topP: {
    min: 0,
    max: 1,
    default: 1,
  },
};

/**
 * Validate if a model is supported
 * @param {string} modelName - Model name to validate
 * @returns {boolean} - True if model is supported
 */
export const isValidOpenAIModel = (modelName) => {
  return SUPPORTED_OPENAI_MODELS.includes(modelName);
};

/**
 * Get the actual OpenAI API model name from UI model name
 * @param {string} uiModelName - UI model name
 * @returns {string} - Actual OpenAI API model name
 */
export const getOpenAIAPIModel = (uiModelName) => {
  const apiModel = OPENAI_MODEL_MAPPING[uiModelName];
  if (!apiModel) {
    throw new Error(
      `Invalid OpenAI model: ${uiModelName}. Supported models: ${SUPPORTED_OPENAI_MODELS.join(", ")}`
    );
  }
  return apiModel;
};

/**
 * Validate temperature value
 * @param {number} temperature - Temperature value
 * @returns {boolean} - True if valid
 */
export const isValidTemperature = (temperature) => {
  if (typeof temperature !== "number") return false;
  return temperature >= OPENAI_CONFIG.temperature.min && 
         temperature <= OPENAI_CONFIG.temperature.max;
};

/**
 * Validate topP value
 * @param {number} topP - TopP value
 * @returns {boolean} - True if valid
 */
export const isValidTopP = (topP) => {
  if (typeof topP !== "number") return false;
  return topP >= OPENAI_CONFIG.topP.min && topP <= OPENAI_CONFIG.topP.max;
};

/**
 * Get default generation config
 * @returns {Object} - Default generation config
 */
export const getDefaultGenerationConfig = () => ({
  temperature: OPENAI_CONFIG.temperature.default,
  topP: OPENAI_CONFIG.topP.default,
  max_tokens: OPENAI_CONFIG.tokenLimits.output,
});
