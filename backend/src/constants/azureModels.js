/**
 * Azure OpenAI Model Mapping & Constants
 * Maps UI model names to actual Azure OpenAI deployment models
 */

/**
 * UI to Azure API Model Mapping
 */
export const AZURE_MODEL_MAPPING = {
  "azure-gpt-4.1-mini": "gpt-4.1-mini",
  "azure-gpt-4.1-nano": "gpt-4.1-nano",
  "azure-gpt-4o": "gpt-4o",
  "azure-gpt-4o-mini": "gpt-4o-mini",
};

/**
 * List of supported UI model names
 */
export const SUPPORTED_AZURE_MODELS = Object.keys(AZURE_MODEL_MAPPING);

/**
 * Default model to use if not specified
 */
export const DEFAULT_AZURE_MODEL = "azure-gpt-4o-mini";

/**
 * Azure Configuration Constants
 */
export const AZURE_CONFIG = {
  // API defaults
  timeout: 30000, // 30 seconds
  maxRetries: 2,
  retryDelay: 1000, // 1 second between retries

  // Rate limiting
  rateLimiting: {
    enabled: true,
    maxRequests: 10,
    windowMs: 1000,
  },

  // Caching
  caching: {
    enabled: true,
    ttl: 3600,
    maxSize: 100,
  },

  // Token limits
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
export const isValidAzureModel = (modelName) => {
  return SUPPORTED_AZURE_MODELS.includes(modelName);
};

/**
 * Get the actual Azure API model name from UI model name
 * @param {string} uiModelName - UI model name
 * @returns {string} - Actual Azure API model name
 */
export const getAzureAPIModel = (uiModelName) => {
  const apiModel = AZURE_MODEL_MAPPING[uiModelName];
  if (!apiModel) {
    throw new Error(
      `Invalid Azure model: ${uiModelName}. Supported models: ${SUPPORTED_AZURE_MODELS.join(", ")}`
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
  return temperature >= AZURE_CONFIG.temperature.min && 
         temperature <= AZURE_CONFIG.temperature.max;
};

/**
 * Validate topP value
 * @param {number} topP - TopP value
 * @returns {boolean} - True if valid
 */
export const isValidTopP = (topP) => {
  if (typeof topP !== "number") return false;
  return topP >= AZURE_CONFIG.topP.min && topP <= AZURE_CONFIG.topP.max;
};

/**
 * Get default generation config
 * @returns {Object} - Default generation config
 */
export const getDefaultGenerationConfig = () => ({
  temperature: AZURE_CONFIG.temperature.default,
  topP: AZURE_CONFIG.topP.default,
  maxTokens: AZURE_CONFIG.tokenLimits.output,
});
