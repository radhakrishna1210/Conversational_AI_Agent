/**
 * Mock LLM Service
 * Provides mock responses for development and testing when no real LLM API is configured
 */

import logger from "../../lib/logger.js";

class MockLLMService {
  constructor() {
    this.provider = "mock";
    this.mockResponses = [
      "This is a mock response from the LLM service. Configure a real LLM provider (OpenAI, Gemini, Azure) for production use.",
      "Mock LLM is active. Please configure OPENAI_API_KEY, GEMINI_API_KEY, or AZURE_OPENAI_API_KEY in your .env file.",
      "Hello! I'm a mock AI assistant. For real AI capabilities, please set up one of the supported LLM providers.",
      "This is a demonstration response. The mock service is being used as a fallback.",
    ];
  }

  /**
   * Generate mock response
   * Supports both single argument (full request object) and multiple argument formats
   */
  async generateResponse(arg1, arg2, arg3) {
    let request;

    // Support both calling conventions
    if (typeof arg1 === "object" && arg1 !== null && !arg2) {
      request = arg1;
    } else {
      request = {
        message: arg1,
        model: arg2?.model || "mock-model",
        temperature: arg2?.temperature,
        systemPrompt: arg3?.systemPrompt,
        maxOutputTokens: arg3?.maxTokens,
        chatHistory: arg3?.chatHistory || [],
        userId: arg3?.userId,
        agentId: arg3?.agentId || "mock-agent",
      };
    }

    const result = await this._generateResponseInternal(request);

    // If called with string arguments, return just the message or throw
    if (typeof arg1 === "string") {
      if (!result.success) throw new Error(result.error);
      return result.message;
    }

    return result;
  }

  /**
   * Internal generation logic
   */
  async _generateResponseInternal(request) {
    const {
      userId,
      agentId,
      message,
      model = "mock-model",
      chatHistory = [],
      systemPrompt,
      temperature,
      maxOutputTokens,
    } = request;

    const startTime = Date.now();

    try {
      logger.info(`[Mock LLM] Generating response`, {
        agentId,
        model,
        messageLength: message.length,
      });

      // Get a mock response (rotate through the list based on message length)
      const responseIndex = message.length % this.mockResponses.length;
      const mockMessage = this.mockResponses[responseIndex];

      const responseTime = Date.now() - startTime;

      // If system prompt is provided, acknowledge it
      let enhancedMessage = mockMessage;
      if (systemPrompt) {
        enhancedMessage = `[System: ${systemPrompt.substring(0, 50)}...]\n\n${mockMessage}`;
      }

      const response = {
        success: true,
        message: enhancedMessage,
        model,
        responseTime,
        fromCache: false,
        timestamp: new Date().toISOString(),
        usage: {
          promptTokens: Math.ceil(message.length / 4),
          completionTokens: Math.ceil(enhancedMessage.length / 4),
          totalTokens: Math.ceil((message.length + enhancedMessage.length) / 4),
        },
      };

      logger.info(`[Mock LLM] ✅ Response generated`, { responseTime });
      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error(`[Mock LLM] ❌ Error generating response`, {
        error: error.message,
        responseTime,
      });

      return {
        success: false,
        error: `Mock LLM error: ${error.message}`,
        model,
        responseTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get health status
   */
  async getHealth() {
    return {
      status: "healthy",
      provider: "mock",
      message: "Mock LLM service is running",
    };
  }

  /**
   * Get metrics
   */
  async getMetrics() {
    return {
      provider: "mock",
      status: "active",
      note: "Using mock LLM service. Configure a real provider for production.",
    };
  }
}

// Export singleton instance
export const mockLLMService = new MockLLMService();

export default mockLLMService;
