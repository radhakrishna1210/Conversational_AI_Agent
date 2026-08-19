/**
 * Gemini Model Mapping & Constants
 * Maps UI model names to actual Gemini API models
 */

/**
 * UI to Gemini API Model Mapping
 * Maps user-facing model names to actual Gemini API model identifiers
 */
export const GEMINI_MODEL_MAPPING = {
  "gemini-3.5-flash-lite": "gemini-3.5-flash-lite",
  "gemini-3.5-flash": "gemini-3.5-flash",
  'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
  "gemini-2.5-flash": "gemini-2.5-flash",
  // Retired by Google ("no longer available to new users" — a 404 on every
  // call, not a deprecation warning). Kept as a KEY so agents whose stored
  // model is this one keep working, remapped onto its named successor.
  "gemini-2.5-flash-lite": "gemini-3.5-flash-lite",
};

/**
 * How each model wants to be told "do not spend time on a reasoning pass".
 *
 * Gemini changed the spelling of this between generations and did NOT keep the
 * old one working: `thinkingBudget: 0` is a hard HTTP 400 INVALID_ARGUMENT on
 * 3.5-flash-lite / 3.6-flash, while `thinkingLevel` is a 400 on 2.5-flash.
 * Sending the wrong one does not degrade to a slower reply — it fails the turn,
 * which on a live call is dead air. Measured against the live API, 2026-08-19:
 *
 *   model                  thinkingBudget:0   thinkingLevel:'low'   omitted
 *   gemini-2.5-flash       ok, 0 thoughts     HTTP 400              190 thoughts
 *   gemini-3.1-flash-lite  ok, 0 thoughts     ok, 152 thoughts      0 thoughts
 *   gemini-3.5-flash-lite  HTTP 400           ok, 0 thoughts        0 thoughts
 *   gemini-3.5-flash       ok, 0 thoughts     ok, 179 thoughts      188 thoughts
 *   gemini-3.6-flash       HTTP 400           ok, 191 thoughts      193 thoughts
 *
 * The "omitted" column is why 'none' is a real answer rather than a cop-out:
 * the -lite models already default to no reasoning pass, and asking for
 * thinkingLevel:'low' anyway measured SLOWER than saying nothing
 * (2.0s vs 1.05s time-to-first-token on gemini-3.5-flash-lite).
 */
const THINKING_OFF_STYLE = {
  "gemini-2.5-flash": "budget",
  "gemini-3.1-flash-lite": "budget",
  "gemini-3.5-flash": "budget",
  "gemini-3.5-flash-lite": "none",
  "gemini-3.6-flash": "level",
};

/**
 * Translate the runtime's provider-neutral `thinkingBudget` into the
 * thinkingConfig THIS model accepts. Returns null when nothing should be sent.
 *
 * Only the "off" case (budget 0) is translated, because that is the only one
 * the voice pipeline asks for. A non-zero budget is passed through as-is on
 * models that take a budget, and dropped on models that do not — a request for
 * MORE thinking is not worth failing a call over.
 *
 * @param {string} apiModel - the resolved Gemini API model name
 * @param {number|undefined} thinkingBudget
 * @returns {{ thinkingBudget: number } | { thinkingLevel: string } | null}
 */
export const thinkingConfigFor = (apiModel, thinkingBudget) => {
  if (thinkingBudget === undefined) return null;
  // Unknown model (a new one added to the mapping without updating the table):
  // omitting is the only universally safe choice — every model accepts silence.
  const style = THINKING_OFF_STYLE[apiModel] ?? "none";
  if (thinkingBudget === 0) {
    if (style === "budget") return { thinkingBudget: 0 };
    if (style === "level") return { thinkingLevel: "low" };
    return null;
  }
  return style === "budget" ? { thinkingBudget } : null;
};

/**
 * List of supported UI model names
 */
export const SUPPORTED_GEMINI_MODELS = Object.keys(GEMINI_MODEL_MAPPING);

/**
 * Default model to use if not specified
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

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
