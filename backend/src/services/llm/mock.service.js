import logger from '../../lib/logger.js';

class MockLLMService {
  constructor() {
    this.provider = 'mock';
  }

  async generateResponse(message, config = {}, options = {}) {
    const safeMessage = typeof message === 'string' ? message : '';
    const history = Array.isArray(options?.chatHistory) ? options.chatHistory : [];
    const systemPrompt = options?.systemPrompt || config?.systemPrompt || 'You are a helpful assistant.';

    logger.info('Using mock LLM service for assistant response');

    return `Mock assistant reply to: ${safeMessage}\n\nSystem: ${systemPrompt}\nHistory messages: ${history.length}`;
  }
}

export const mockLLMService = new MockLLMService();
export default mockLLMService;
