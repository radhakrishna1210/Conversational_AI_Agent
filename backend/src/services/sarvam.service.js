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

  return {
    system: "You are a helpful mathematical assistant.",
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
      throw new Error('SARVAM_API_KEY environment variable is not set');
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
