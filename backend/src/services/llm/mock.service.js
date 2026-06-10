/**
 * Simple Mock LLM Service
 * Used as a fallback when no real LLM API keys are configured.
 */
const mockLLMService = {
  providerName: 'mock',
  async generateResponse(message, _options = {}, meta = {}) {
    const base = typeof message === 'string' ? message : JSON.stringify(message);
    const reply = `Mock reply: ${base}`;
    // Return object shape compatible with callers that expect { message }
    return { message: reply, meta };
  },

  async getHealth() {
    return { ok: true, provider: 'mock' };
  },
};

export { mockLLMService };
