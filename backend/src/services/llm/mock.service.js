// src/services/llm/mock.service.js
// Mock LLM service used as a fallback when real LLM providers are not configured.
// Provides a simple generateResponse method compatible with the real services.

/**
 * MockLLMService class
 */
class MockLLMService {
  /**
   * Simulate generating a response.
   * @param {string} userMessage - The user input message.
   * @param {object} modelOptions - Model configuration (ignored).
   * @param {object} additionalOptions - Additional options (ignored).
   * @returns {Promise<object>} A promise that resolves to a mock response object.
   */
  async generateResponse(userMessage, modelOptions = {}, additionalOptions = {}) {
    // Simple echo response; could be enhanced later.
    return {
      message: `Mock response to: ${userMessage}`,
      // Include dummy fields to mimic real providers if needed.
      usage: {
        tokens: userMessage.length,
        model: modelOptions.model || 'mock-model',
      },
    };
  }
}

// Export a singleton instance to match the usage pattern in the codebase.
export const mockLLMService = new MockLLMService();
