import logger from "../../lib/logger.js";

class MockLLMService {
  constructor() {
    this.apiKey = "mock-key";
  }

  async generateResponse(message, config, options) {
    const msgObj = typeof message === 'object' && message !== null ? message : { message };
    const prompt = (msgObj.message || '').toLowerCase();
    
    logger.info(`Generating mock response for prompt: "${prompt.substring(0, 50)}..."`);
    
    let reply = "";
    
    if (prompt.includes("n8n") || prompt.includes("integrate")) {
      reply = "To integrate your agent with N8N:\n\n1. Navigate to the **Integrations** tab in the agent editor.\n2. Copy the webhook URL displayed under N8N integration.\n3. Open your N8N flow, add a **Webhook** node, set the method to POST, and paste the URL.\n4. Save your workflow. The agent will now forward events to N8N in real time.";
    } else if (prompt.includes("phone") || prompt.includes("number") || prompt.includes("buy")) {
      reply = "You can purchase dedicated phone numbers instantly for your agents! Click the **Buy Number** button at the bottom of the assistant panel or navigate to the **Phone Numbers** page in the sidebar. We support numbers from Twilio, Meta, and custom providers.";
    } else if (prompt.includes("model") || prompt.includes("llm") || prompt.includes("gpt") || prompt.includes("gemini")) {
      reply = "We support multiple state-of-the-art AI Models (LLM) including GPT-4o-Mini, Gemini 2.5 Flash, and custom endpoints. You can select your preferred model in the **Assistant Details** page by clicking on the **AI Model (LLM)** card.";
    } else if (prompt.includes("voice") || prompt.includes("tts") || prompt.includes("speak")) {
      reply = "To change your agent's voice, click on the **Voice (TTS)** card in the **Assistant Details** settings. You can listen to samples and choose from standard Google, ElevenLabs, or Deepgram voices.";
    } else if (prompt.includes("language")) {
      reply = "You can configure your agent to support multiple languages. Click on the **Languages** card in **Assistant Details** and check all languages you want your agent to handle (e.g., English, Spanish, Hindi, French).";
    } else if (prompt.includes("hello") || prompt.includes("hi") || prompt.includes("hey")) {
      reply = "Hello! I am your AI Assistant helper. How can I help you set up or test your agent today?";
    } else if (prompt.includes("help") || prompt.includes("how do i")) {
      reply = "I can guide you on setting up welcome messages, configuring speech-to-text, buying phone numbers, or setting up external integrations. What are you looking to do?";
    } else {
      reply = `I received your message: "${msgObj.message}". Since this environment is running in offline development mode without external AI keys, I am here as your guide. You can ask me about setting up N8N integrations, changing AI models, configuring languages, or purchasing phone numbers!`;
    }

    if (typeof message === 'object') {
      return {
        success: true,
        message: reply,
        model: "mock-model",
        responseTime: 50,
        fromCache: false,
        timestamp: new Date().toISOString()
      };
    }
    return reply;
  }
}

export const mockLLMService = new MockLLMService();
export default mockLLMService;
