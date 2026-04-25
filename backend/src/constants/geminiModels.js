/**
 * Gemini Model Mapping & Constants
 * Maps UI model names to actual Gemini API models
 */

/**
 * UI to Gemini API Model Mapping
 * Maps user-facing model names to actual Gemini API model identifiers
 */
export const GEMINI_MODEL_MAPPING = {
  "gemini-2.5-flash": "gemini-2.5-flash",
  "gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
};

/**
 * List of supported UI model names
 */
export const SUPPORTED_GEMINI_MODELS = Object.keys(GEMINI_MODEL_MAPPING);

/**
 * Default model to use if not specified
 */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/**
 * Gemini Configuration Constants
 */
export const GEMINI_CONFIG = {
  // API defaults
  timeout: 30000, // 30 seconds
  maxRetries: 2,
  retryDelay: 1000, // 1 second between retries

  // Rate limiting
  rateLimiting: {
    enabled: true,
    maxRequests: 5, // Max 5 requests
    windowMs: 1000, // Per 1 second
  },

  // Caching
  caching: {
    enabled: true,
    ttl: 3600, // 1 hour in seconds
    maxSize: 100, // Max 100 cached responses
  },

  // Token limits
  tokenLimits: {
    input: 32000,
    output: 8000,
  },

  // Temperature range
  temperature: {
    min: 0,
    max: 2,
    default: 1,
  },

  // Top P range
  topP: {
    min: 0,
    max: 1,
    default: 0.95,
  },

  // Top K range
  topK: {
    min: 0,
    max: 100,
    default: 40,
  },
};

/**
 * Validate if a model is supported
 * @param {string} modelName - Model name to validate
 * @returns {boolean} - True if model is supported
 */
export const isValidGeminiModel = (modelName) => {
  return SUPPORTED_GEMINI_MODELS.includes(modelName);
};

/**
 * Get the actual Gemini API model name from UI model name
 * @param {string} uiModelName - UI model name
 * @returns {string} - Actual Gemini API model name
 * @throws {Error} - If model is not valid
 */
export const getGeminiAPIModel = (uiModelName) => {
  const apiModel = GEMINI_MODEL_MAPPING[uiModelName];
  if (!apiModel) {
    throw new Error(
      `Invalid Gemini model: ${uiModelName}. Supported models: ${SUPPORTED_GEMINI_MODELS.join(", ")}`
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
  return temperature >= GEMINI_CONFIG.temperature.min && 
         temperature <= GEMINI_CONFIG.temperature.max;
};

/**
 * Validate topP value
 * @param {number} topP - TopP value
 * @returns {boolean} - True if valid
 */
export const isValidTopP = (topP) => {
  if (typeof topP !== "number") return false;
  return topP >= GEMINI_CONFIG.topP.min && topP <= GEMINI_CONFIG.topP.max;
};

/**
 * Validate topK value
 * @param {number} topK - TopK value
 * @returns {boolean} - True if valid
 */
export const isValidTopK = (topK) => {
  if (typeof topK !== "number") return false;
  return topK >= GEMINI_CONFIG.topK.min && topK <= GEMINI_CONFIG.topK.max;
};

/**
 * Get default generation config
 * @returns {Object} - Default generation config
 */
export const getDefaultGenerationConfig = () => ({
  temperature: GEMINI_CONFIG.temperature.default,
  topP: GEMINI_CONFIG.topP.default,
  topK: GEMINI_CONFIG.topK.default,
  maxOutputTokens: GEMINI_CONFIG.tokenLimits.output,
});
