import { env } from '../config/env.js';
import logger from '../lib/logger.js';

const SARVAM_API_KEY = env.SARVAM_API_KEY;
const SARVAM_BASE_URL = env.SARVAM_URL || 'https://api.sarvam.ai';
const DEFAULT_MODEL = env.SARVAM_MODEL || 'sarvam-30b';

/**
 * Detect language from text using simple heuristics
 * In production, use a language detection library like 'franc' or 'langdetect'
 */
export const detectLanguage = (text) => {
  // Simple language detection based on script patterns
  const hindiRegex = /[\u0900-\u097F]/g;
  const gujaratiRegex = /[\u0A80-\u0AFF]/g;
  const tamilRegex = /[\u0B80-\u0BFF]/g;
  const teluguRegex = /[\u0C80-\u0CFF]/g;
  const marathiRegex = /[\u0900-\u097F]/g; // Same as Hindi script
  const spanishRegex = /[áéíóúüñ¿]/gi;
  const frenchRegex = /[àâäèéêëîïôöûüçœæ]/gi;

  if (hindiRegex.test(text)) return 'Hindi';
  if (gujaratiRegex.test(text)) return 'Gujarati';
  if (tamilRegex.test(text)) return 'Tamil';
  if (teluguRegex.test(text)) return 'Telugu';
  if (spanishRegex.test(text)) return 'Spanish';
  if (frenchRegex.test(text)) return 'French';

  return 'English';
};

/**
 * Build a multilingual prompt for the LLM
 */
export const buildMultilingualPrompt = (userMessage, selectedLanguages = ['English'], agentContext = {}) => {
  const detectedLanguage = detectLanguage(userMessage);
  const languageList = selectedLanguages.join(', ');

  const welcomeMessage = agentContext.welcomeMessage || 'You are a helpful assistant.';
  const flowItems = agentContext.flowItems || [];

  let enabledFlowText = '';
  if (Array.isArray(flowItems)) {
    enabledFlowText = flowItems
      .filter(f => f && f.enabled)
      .map(f => `${f.title}\n${f.body || ''}`)
      .join('\n\n');
  }

  let systemPrompt = welcomeMessage;
  if (enabledFlowText) {
    systemPrompt += `\n\nFlow:\n${enabledFlowText}`;
  }

  systemPrompt += `\n\nYou are a conversational AI agent. Speak in a helpful and user-focused tone. Keep your responses brief. Supported languages: ${languageList}. Please respond in the language the user is speaking (detected language: ${detectedLanguage}).`;

  return {
    system: systemPrompt,
    userMessage: userMessage,
    detectedLanguage,
  };
};

/**
 * Call Sarvam AI API to generate a response
 */
export const generateResponse = async (userMessage, selectedLanguages = ['English'], agentContext = {}) => {
  try {
    if (!SARVAM_API_KEY) {
      logger.warn('SARVAM_API_KEY environment variable is not set. Simulating agent chat response.');
      
      const name = agentContext.name || 'AI Assistant';
      const welcome = agentContext.welcomeMessage || 'Hello!';
      const model = agentContext.aiModel || 'sarvam-30b';
      const flows = agentContext.flowItems || [];
      const detectedLanguage = detectLanguage(userMessage);

      let reply = `Thank you for your message! As your AI assistant ("${name}"), I am fully configured and ready to execute your defined conversational flows.`;

      const msg = userMessage.toLowerCase();
      
      // Determine agent's main purpose from name and flows
      const agentPurpose = `${name.toLowerCase()} ${flows.map(f => f.title.toLowerCase()).join(' ')}`;
      const isGrammarAgent = agentPurpose.includes('grammar') || agentPurpose.includes('check');
      const isMoonAgent = agentPurpose.includes('moon');
      const isPizzaAgent = agentPurpose.includes('pizza') || agentPurpose.includes('order');

      // 1. First check against known specific agent types for highly contextual mock responses
      if (isGrammarAgent && (msg.includes('correct') || msg.includes('grammar') || msg.includes('check') || msg.includes('sentence') || msg.includes('spell'))) {
        if (msg.includes('she go') || msg.includes('he go')) {
          reply = `Correction: "She/He goes...". Remember to use singular verbs with third-person subjects!`;
        } else if (msg.includes('i is') || msg.includes('i be')) {
          reply = `Correction: "I am...". Make sure the verb matches the subject pronoun!`;
        } else if (msg.includes('i am is')) {
          reply = `Correction: "I am...". You cannot use two forms of the 'to be' verb right next to each other!`;
        } else if (msg.includes('they was') || msg.includes('we was')) {
          reply = `Correction: "They/We were...". Remember to use plural verbs with plural subjects!`;
        } else if (msg.includes('i am doing the work') || msg.includes('doing the work')) {
          reply = `Yes, "I am doing the work" is grammatically correct! It uses the present continuous tense perfectly.`;
        } else {
          reply = `Your sentence looks grammatically correct! As your custom Grammar Checking Assistant, I think it flows beautifully.`;
        }
      } else if (isMoonAgent && (msg.includes('moon') || msg.includes('lunar') || msg.includes('space') || msg.includes('apollo'))) {
        reply = `The Moon is Earth's only natural satellite. Simulated fact: The Moon is moving approximately 3.8 cm away from Earth every year!`;
      } else if (isPizzaAgent && (msg.includes('pizza') || msg.includes('order') || msg.includes('cheese') || msg.includes('pepperoni'))) {
        reply = `Got it! Simulated order: One large pizza coming right up. Our conversational flow would normally ask for your address and payment details next.`;
      } 
      // 2. Dynamic Flow Matching - Check if user message matches any flow title keywords
      else if (flows.length > 0) {
        // Attempt to find a flow that matches user intent
        const matchedFlow = flows.find(f => {
          const flowKeywords = f.title.toLowerCase().split(' ').filter(w => w.length > 3);
          return flowKeywords.some(kw => msg.includes(kw));
        });

        if (matchedFlow) {
          reply = `[Simulating Flow: "${matchedFlow.title}"] Based on your message, I am executing this specific flow. What else would you like to add?`;
        } else if (/\b(hello|hi|hey|hola)\b/i.test(msg)) {
          reply = `${welcome} (I am "${name}", running on simulated ${model})`;
        } else if (/\b(model|engine|ai|select|gpt)\b/i.test(msg)) {
          reply = `To select or change my AI engine, use the visual dashboard under the "Call Configuration" or "Assistant Details" tabs. I am currently configured with the "${model}" model!`;
        } else if (/\b(voice|speak|tts|sound|accent)\b/i.test(msg)) {
          reply = `My current voice is set to "${agentContext.voice || 'Google'}" using languages: [${(selectedLanguages || ['English']).join(', ')}].`;
        } else if (/\b(help|what can you do|capabilities)\b/i.test(msg)) {
          const flowNames = flows.map(f => `"${f.title}"`).join(', ');
          reply = `As "${name}", I am configured with the following flows: ${flowNames}. Ask me something related to these topics!`;
        } else {
          reply = `As "${name}", I received your message: "${userMessage}". Since I am running in simulation mode, I'm ready to route this to my configured flows once fully deployed.`;
        }
      } 
      // 3. Absolute Fallback
      else {
        if (/\b(hello|hi|hey|hola)\b/i.test(msg)) {
          reply = `${welcome} (I am "${name}", running on simulated ${model})`;
        } else {
           reply = `I am "${name}". You said: "${userMessage}". Configure my Conversational Flows in the dashboard to make me smarter!`;
        }
      }

      return {
        reply,
        detectedLanguage,
        model: `${model} (Simulated)`,
        tokensUsed: Math.floor(userMessage.length / 4) + 12,
      };
    }

    const { system, userMessage: finalUserMessage, detectedLanguage } = buildMultilingualPrompt(
      userMessage,
      selectedLanguages,
      agentContext
    );

    logger.debug(
      { model: DEFAULT_MODEL, detectedLanguage, languages: selectedLanguages },
      'Calling Sarvam AI'
    );

    const response = await fetch(`${SARVAM_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SARVAM_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: 'system',
            content: system,
          },
          {
            role: 'user',
            content: finalUserMessage,
          },
        ],
        temperature: 0.5,
        top_p: 0.8,
        max_tokens: 256,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(
        { status: response.status, error, model: DEFAULT_MODEL },
        'Sarvam AI API error'
      );
      throw new Error(`Sarvam AI error: ${response.status}`);
    }

    const data = await response.json();
    
    // Prefer content field if it has a real answer
    let assistantReply = data.choices?.[0]?.message?.content?.trim() || '';
    
    // If content is null/empty, try to extract from reasoning_content
    if (!assistantReply && data.choices?.[0]?.message?.reasoning_content) {
      const reasoning = data.choices[0].message.reasoning_content.trim();
      
      // Find actual complete answer sentences (often appear after "The most direct...")
      // Look for patterns that indicate actual answers
      const patterns = [
        /The (?:most )?direct(?:est)? (?:and correct )?answer is[:\s]+([^.\n]+[.!?])/i,
        /(?:The )?answer is[:\s]+([^.\n]+[.!?])/i,
        /(?:Therefore,? )?([A-Z][^.\n]*\b(?:is|are|was|were)[^.\n]+[.!?])/,
      ];
      
      for (const pattern of patterns) {
        const match = reasoning.match(pattern);
        if (match) {
          assistantReply = match[1].trim();
          break;
        }
      }
      
      // If no pattern matched, try a simpler approach: get the last complete sentence
      if (!assistantReply) {
        // Remove all the numbered reasoning steps (1. 2. 3. etc)
        const cleanedText = reasoning.replace(/^\d+\.\s+\*\*[^:]+:\*\*\n/gm, '');
        
        // Extract sentences (ending with . ! ?)
        const sentences = cleanedText.match(/[^.!?]*[.!?]/g) || [];
        
        // Get the last few sentences that look like actual answers (not too short, not starting with bullet)
        for (let i = sentences.length - 1; i >= 0; i--) {
          const sentence = sentences[i].trim();
          if (sentence.length > 15 && !sentence.match(/^[-*]/)) {
            assistantReply = sentence;
            break;
          }
        }
      }
    }

    if (!assistantReply) {
      logger.warn({ response: data }, 'Empty response from Sarvam AI');
    }

    return {
      reply: assistantReply,
      detectedLanguage,
      model: DEFAULT_MODEL,
      tokensUsed: data.usage?.completion_tokens || 0,
    };
  } catch (err) {
    logger.error({ error: err.message, url: SARVAM_BASE_URL }, 'Sarvam AI service error');
    throw err;
  }
};

/**
 * Stream response from Sarvam AI (for future SSE implementation)
 */
export const generateResponseStream = async (userMessage, selectedLanguages = ['English'], agentContext = {}) => {
  try {
    if (!SARVAM_API_KEY) {
      throw new Error('SARVAM_API_KEY environment variable is not set');
    }

    const { system, userMessage: finalUserMessage } = buildMultilingualPrompt(
      userMessage,
      selectedLanguages,
      agentContext
    );

    const response = await fetch(`${SARVAM_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SARVAM_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: 'system',
            content: system,
          },
          {
            role: 'user',
            content: finalUserMessage,
          },
        ],
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1024,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Sarvam AI stream error: ${response.status}`);
    }

    return response;
  } catch (err) {
    logger.error({ error: err.message, url: SARVAM_BASE_URL }, 'Sarvam AI stream error');
    throw err;
  }
};

/**
 * Check if Sarvam AI is accessible
 */
export const checkSarvamHealth = async () => {
  try {
    if (!SARVAM_API_KEY) {
      logger.warn('SARVAM_API_KEY not set');
      return false;
    }

    const response = await fetch(`${SARVAM_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SARVAM_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
};
