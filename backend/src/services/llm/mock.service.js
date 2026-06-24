import logger from "../../lib/logger.js";

/**
 * Mock LLM Service
 * Used as a fallback when no real LLM API keys are configured.
 * Supports both object-based and legacy string-based signatures.
 */
class MockLLMService {
  constructor() {
    this.name = "mock";
    logger.info("MockLLMService initialized (no real LLM API keys detected)");
  }

  /**
   * Generate a mock response.
   * Supports both signature types:
   * 1. generateResponse(messageObject)
   * 2. generateResponse(userMessage, modelOptions, additionalOptions)
   */
  async generateResponse(arg1, arg2 = {}, arg3 = {}) {
    let message;
    let model = "mock-model";
    let isObjectCall = false;

    if (typeof arg1 === "object" && arg1 !== null && !arg2) {
      message = arg1.message;
      model = arg1.model || "mock-model";
      isObjectCall = true;
    } else {
      message = arg1;
      model = arg2?.model || "mock-model";
    }

    logger.debug(`MockLLMService.generateResponse called with message: "${message?.substring(0, 80)}..."`);

    // Simulate a short network delay so callers don't notice it's instant
    await new Promise((resolve) => setTimeout(resolve, 200));

    const reply =
      "I'm currently running in demo mode because no LLM API keys (OpenAI / Gemini) are configured. " +
      "Please add your API keys to the .env file and restart the server to enable real AI responses.";

    if (isObjectCall) {
      return {
        success: true,
        message: reply,
        model,
        responseTime: 200,
        fromCache: false,
        timestamp: new Date().toISOString(),
        usage: {
          promptTokens: message?.length || 0,
          completionTokens: reply.length,
          totalTokens: (message?.length || 0) + reply.length,
        },
      };
    }

    return reply;
  }

  /**
   * Stream a mock response (yields a single chunk then closes)
   */
  async *streamResponse(message, options = {}, context = {}) {
    yield "I'm running in demo mode. Please configure your LLM API keys to enable real AI responses.";
  }

  /**
   * Health check — always healthy for the mock service
   */
  async checkHealth() {
    return { status: "ok", provider: "mock", message: "Mock LLM service is always available" };
  }

  /**
   * Usage metrics — no real usage in mock
   */
  getMetrics() {
    return { provider: "mock", requestCount: 0, tokenCount: 0 };
  }
}

export const mockLLMService = new MockLLMService();
export default MockLLMService;
