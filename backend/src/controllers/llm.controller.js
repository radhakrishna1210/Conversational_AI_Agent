/**
 * LLM Controller
 * Handles LLM-related API endpoints
 */

import logger from "../lib/logger.js";
import { getLLMProvider, getLLMProviderWithFallback } from "../services/llm.factory.js";
import {
  isValidModel,
  isValidTemperature,
  DEFAULT_TEMPERATURE,
  ALLOWED_MODELS,
} from "../constants/llmModels.js";
import prisma from "../config/prisma.js";

/**
 * Agents store a human-friendly model label (e.g. "GPT-4.1-Mini",
 * "Gemini 2.5 Flash"). Normalize it into a { provider, model } pair that the
 * LLM factory understands. Returns {} when the label is unknown so callers
 * can fall back to defaults.
 */
export const mapAgentModel = (label) => {
  if (!label || typeof label !== "string") return {};
  const norm = label.trim().toLowerCase().replace(/\s+/g, "-");

  // Exact match against known model IDs first
  for (const [provider, models] of Object.entries(ALLOWED_MODELS)) {
    if (models.includes(norm)) return { provider, model: norm };
  }

  // Heuristic mapping for label variants
  if (norm.includes("gemini")) {
    return { provider: "gemini", model: norm.includes("lite") ? "gemini-2.5-flash-lite" : "gemini-2.5-flash" };
  }
  if (norm.startsWith("azure")) {
    const m = ALLOWED_MODELS.azure.find((x) => norm.includes(x.replace("azure-", ""))) || "azure-gpt-4o-mini";
    return { provider: "azure", model: m };
  }
  if (norm.includes("llama")) {
    return { provider: "custom", model: "llama-3.3-70b-versatile" };
  }
  if (norm.includes("gpt")) {
    const m = ALLOWED_MODELS.openai.find((x) => norm.includes(x)) ||
      (norm.includes("4.1-nano") ? "gpt-4.1-nano"
        : norm.includes("4.1") ? "gpt-4.1-mini"
        : norm.includes("4o-mini") ? "gpt-4o-mini"
        : norm.includes("4o") ? "gpt-4o"
        : norm.includes("5.1") ? "gpt-5.1"
        : "gpt-4o-mini");
    return { provider: "openai", model: m };
  }
  return {};
};

/**
 * Generate LLM response
 * POST /api/llm/generate
 *
 * Request body:
 * {
 *   agentId: string,
 *   message: string,
 *   provider?: string (optional, uses agent config by default),
 *   model?: string (optional, uses agent config by default),
 *   temperature?: number (optional, uses agent config by default),
 *   systemPrompt?: string (optional),
 *   useFallback?: boolean (optional, default: true)
 * }
 */
export const generateResponse = async (req, res) => {
  const requestId = req.id || Math.random().toString(36).substr(2, 9);
  const startTime = Date.now();

  try {
    const { agentId, message, provider, model, temperature, systemPrompt, useFallback = true } =
      req.body;

    // Validate required fields
    if (!agentId || !message) {
      logger.warn(`[${requestId}] Missing required fields: agentId or message`);
      return res.status(400).json({
        error: "Missing required fields: agentId and message",
      });
    }

    if (typeof message !== "string" || message.trim().length === 0) {
      logger.warn(`[${requestId}] Invalid message: empty or not a string`);
      return res.status(400).json({
        error: "Message must be a non-empty string",
      });
    }

    logger.info(`[${requestId}] Processing LLM request for agent: ${agentId}`);

    // Load the agent's stored configuration so agentId actually drives behavior.
    // Request-body overrides still win (useful for testing), then agent config,
    // then environment defaults.
    let agentRecord = null;
    try {
      const workspaceId = req.params?.workspaceId;
      agentRecord = await prisma.agent.findFirst({
        where: workspaceId ? { id: agentId, workspaceId } : { id: agentId },
      });
    } catch (dbErr) {
      logger.warn(`[${requestId}] Could not load agent config from DB: ${dbErr.message}`);
    }

    if (req.params?.workspaceId && !agentRecord) {
      return res.status(404).json({ error: 'Agent not found in this workspace' });
    }

    const fromAgent = mapAgentModel(agentRecord?.aiModel);

    const agentConfig = {
      provider:
        provider ||
        fromAgent.provider ||
        process.env.DEFAULT_LLM_PROVIDER ||
        "gemini",

      model:
        model ||
        fromAgent.model ||
        process.env.DEFAULT_LLM_MODEL ||
        "gemini-2.5-flash",

      temperature:
        temperature ??
        (process.env.DEFAULT_LLM_TEMPERATURE ? parseFloat(process.env.DEFAULT_LLM_TEMPERATURE) : DEFAULT_TEMPERATURE),
    };


    // Validate provider and model configuration
    const { provider: configProvider, model: configModel, temperature: configTemp } = agentConfig;

    if (!isValidModel(configProvider, configModel)) {
      logger.error(
        `[${requestId}] Invalid model configuration: ${configProvider}/${configModel}`
      );
      return res.status(400).json({
        error: `Invalid model '${configModel}' for provider '${configProvider}'. Allowed models: ${ALLOWED_MODELS[configProvider]?.join(", ") || "none"}`,
      });
    }

    if (!isValidTemperature(configTemp)) {
      logger.error(`[${requestId}] Invalid temperature: ${configTemp}`);
      return res.status(400).json({
        error: "Temperature must be a number between 0 and 1",
      });
    }

    logger.debug(
      `[${requestId}] Agent config:`,
      { provider: configProvider, model: configModel, temperature: configTemp }
    );

    // Get LLM provider instance
    let llmProvider;
    try {
      llmProvider = useFallback
        ? getLLMProviderWithFallback(configProvider)
        : getLLMProvider(configProvider);
    } catch (error) {
      logger.error(`[${requestId}] Failed to initialize LLM provider`, error);
      return res.status(500).json({
        error: error.message,
      });
    }

    // Generate response
    let response;
    try {
      response = await llmProvider.generateResponse(
        message,
        {
          model: configModel,
          temperature: configTemp,
          deploymentName: agentConfig.deploymentName, // For Azure
        },
        {
          systemPrompt: systemPrompt || "You are a helpful AI assistant.",
          maxTokens: req.body.maxTokens || 2000,
        }
      );
    } catch (error) {
      logger.error(`[${requestId}] LLM generation failed`, error);
      return res.status(500).json({
        error: error.message || "Failed to generate response from LLM",
      });
    }

    const duration = Date.now() - startTime;
    logger.info(
      `[${requestId}] Successfully generated LLM response (${duration}ms)`,
      {
        agentId,
        provider: configProvider,
        model: configModel,
      }
    );

    res.json({
      success: true,
      agentId,
      message: response,
      provider: configProvider,
      model: configModel,
      timestamp: new Date().toISOString(),
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[${requestId}] Unexpected error in LLM generation (${duration}ms)`, error);
    res.status(500).json({
      error: "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get supported models for a provider
 * GET /api/llm/models/:provider
 */
export const getModelsForProvider = (req, res) => {
  try {
    const { provider } = req.params;

    if (!provider) {
      return res.status(400).json({
        error: "Provider is required",
      });
    }

    const models = ALLOWED_MODELS[provider.toLowerCase()];

    if (!models) {
      return res.status(404).json({
        error: `Unknown provider: ${provider}`,
        supportedProviders: Object.keys(ALLOWED_MODELS),
      });
    }

    res.json({
      provider: provider.toLowerCase(),
      models,
    });
  } catch (error) {
    logger.error("Error fetching models for provider", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

/**
 * Get all supported providers
 * GET /api/llm/providers
 */
export const getSupportedProviders = (req, res) => {
  try {
    const providers = Object.keys(ALLOWED_MODELS).map((provider) => ({
      name: provider,
      models: ALLOWED_MODELS[provider],
      modelCount: ALLOWED_MODELS[provider].length,
    }));

    res.json({
      providers,
      totalProviders: providers.length,
      totalModels: providers.reduce((sum, p) => sum + p.modelCount, 0),
    });
  } catch (error) {
    logger.error("Error fetching supported providers", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

/**
 * Validate LLM configuration
 * POST /api/llm/validate
 *
 * Request body:
 * {
 *   provider: string,
 *   model: string,
 *   temperature?: number
 * }
 */
export const validateLLMConfig = (req, res) => {
  try {
    const { provider, model, temperature } = req.body;

    const errors = [];

    // Validate provider
    if (!provider) {
      errors.push("Provider is required");
    } else if (!ALLOWED_MODELS[provider.toLowerCase()]) {
      errors.push(
        `Unknown provider: ${provider}. Supported: ${Object.keys(ALLOWED_MODELS).join(", ")}`
      );
    }

    // Validate model
    if (!model) {
      errors.push("Model is required");
    } else if (provider && !isValidModel(provider.toLowerCase(), model)) {
      errors.push(
        `Invalid model for provider ${provider}. Allowed: ${ALLOWED_MODELS[provider.toLowerCase()]?.join(", ") || "none"}`
      );
    }

    // Validate temperature
    if (temperature !== undefined && !isValidTemperature(temperature)) {
      errors.push("Temperature must be a number between 0 and 1");
    }

    if (errors.length > 0) {
      return res.status(400).json({
        valid: false,
        errors,
      });
    }

    res.json({
      valid: true,
      config: {
        provider: provider.toLowerCase(),
        model,
        temperature: temperature ?? DEFAULT_TEMPERATURE,
      },
    });
  } catch (error) {
    logger.error("Error validating LLM config", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

export const generateAgentFlow = async (req, res) => {
  const { name, prompt: userPrompt, category, provider: reqProvider, model: reqModel } = req.body;
  if (!name || typeof name !== "string") {
    logger.warn("Missing required field 'name' for generateAgentFlow");
    return res.status(400).json({
      error: "Missing required field: name",
    });
  }

  // Request override → env default → gemini. (Flow generation happens before
  // the agent exists, so there is no agent record to read a model from yet.)
  const provider = reqProvider || process.env.DEFAULT_LLM_PROVIDER || "gemini";
  const model = reqModel || process.env.DEFAULT_LLM_MODEL || "gemini-2.5-flash";
  const temperature = 0.2;

  logger.info(`Generating personalized flow for agent: ${name} via ${provider}/${model}`);

  let llmProvider;
  try {
    llmProvider = getLLMProviderWithFallback(provider);
  } catch (error) {
    logger.error("Failed to initialize LLM provider for flow generation", error);
    return res.status(500).json({
      error: `Failed to initialize LLM provider "${provider}" — is its API key (e.g. GEMINI_API_KEY / OPENAI_API_KEY) set in backend/.env? Detail: ${error.message}`,
    });
  }

  // ── Options the generated configuration may choose from ─────────────────────
  // These mirror what the Edit Agent UI offers, so everything the LLM picks is
  // directly editable there afterwards.
  const LANGUAGE_OPTIONS = [
    'English (American)', 'English (British)', 'English (Indian)', 'English (Australian)',
    'Hindi', 'Bengali', 'Gujarati', 'Tamil', 'Spanish', 'French', 'German', 'Mandarin',
    'Japanese', 'Korean', 'Portuguese', 'Russian', 'Arabic', 'Italian',
  ];
  const AI_MODEL_OPTIONS = ['GPT-4.1-Mini', 'GPT-4-Turbo', 'Claude-3-Opus', 'Gemini-Pro', 'Llama-2-70B'];
  const STT_OPTIONS = ['Sarvam', 'ElevenLabs'];

  // Real voices from the DB, restricted to providers whose API keys are
  // actually configured — the LLM must never pick a voice that can't speak.
  const hasVoiceCreds = (p) =>
    p === 'Google' ? Boolean(process.env.GOOGLE_TTS_CREDENTIALS_JSON || process.env.GOOGLE_TTS_KEY_FILE)
    : p === 'ElevenLabs' ? Boolean(process.env.ELEVENLABS_API_KEY)
    : p === 'Sarvam' ? Boolean(process.env.SARVAM_API_KEY)
    : p === 'Cartesia' ? Boolean(process.env.CARTESIA_API_KEY)
    : false;
  let voiceOptions = [];
  try {
    const voices = await prisma.voice.findMany({
      include: { provider: { select: { name: true } } },
      take: 300,
    });
    const byProvider = {};
    for (const v of voices) {
      const p = v.provider?.name;
      if (!p || !hasVoiceCreds(p)) continue;
      (byProvider[p] ||= []).push(v);
    }
    voiceOptions = Object.values(byProvider)
      .flatMap((list) => list.slice(0, 12))
      .map((v) => ({
        label: `${v.provider.name} - ${v.name}`,
        gender: v.gender || undefined,
        language: v.language || undefined,
      }));
  } catch (e) {
    logger.warn(`Voice options unavailable for agent generation: ${e.message}`);
  }

  const systemPrompt = "You are an expert AI architect. Generate highly personalized voice assistant configurations in clean, valid JSON format.";
  const prompt = `Generate a complete personalized configuration for a voice assistant.
Assistant Name: "${name}"
${category ? `Use-case category: "${category}"\n` : ''}${userPrompt ? `The user's full description of this assistant's purpose, personality, and behavior (BASE THE ENTIRE CONFIGURATION ON THIS — every setting, stage, question, and rule must be tailored to it):\n\"\"\"${String(userPrompt).slice(0, 4000)}\"\"\"\n` : ''}

Keep your chain of thought/reasoning extremely brief (under 5 sentences), then immediately output the raw JSON object inside a \`\`\`json markdown block. Do not waste tokens explaining.

The JSON must have this exact structure:
{
  "name": "<short professional display name for this assistant, 2-5 words (e.g. 'Plumbing Appointment Agent'). If the user's description explicitly gives the agent a name, use EXACTLY that name. NEVER use the description text itself as the name.>",
  "welcomeMessage": "A natural, warm vocal opening line tailored to this assistant AND its call direction, written in the PRIMARY conversation language.",
  "callDirection": "<INBOUND or OUTBOUND>",
  "languages": ["<primary conversation language first>"],
  "aiModel": "<one of: ${AI_MODEL_OPTIONS.join(', ')}>",
  "transcription": "<one of: ${STT_OPTIONS.join(', ')}>",
${voiceOptions.length ? `  "voice": "<one voice label copied EXACTLY from AVAILABLE VOICES below>",\n` : ''}  "postCallVariables": [
    { "key": "snake_case_variable_name", "description": "what to extract from each call transcript" }
  ],
  "flowItems": [
    {
      "id": "1",
      "title": "Agent Identity & Purpose",
      "enabled": true,
      "body": "AGENT GLOBAL INSTRUCTIONS\\n# PERSONA\\n- Guidelines..."
    },
    {
      "id": "2",
      "title": "...",
      "enabled": true,
      "body": "..."
    }
  ]
}

Configuration rules:
- "callDirection": "OUTBOUND" when this agent CALLS customers (cold calling, lead generation, collections, appointment reminders, surveys, outreach); "INBOUND" when customers call the agent (support line, reception, booking hotline, helpdesk). The welcomeMessage MUST match this direction: an INBOUND greeting thanks the caller for calling (e.g. "Thank you for calling <company>, how can I help?"); an OUTBOUND greeting introduces the agent, the company, and the reason for the call, and must NEVER say "thank you for calling".
- "languages": 1-3 entries, each copied EXACTLY from this list: ${LANGUAGE_OPTIONS.join(', ')}. The FIRST entry is the language the assistant speaks in — infer it from the user's description (e.g. an agent for Indian customers speaking Hindi → ["Hindi"]). Default to "English (Indian)" only when the description gives no language hint.
- "transcription": pick "Sarvam" when the primary language is Indian (Hindi, Bengali, Gujarati, Tamil, English (Indian)); otherwise "ElevenLabs".
- "aiModel": pick the model best suited to the use case; "Gemini-Pro" is a good general default.
- "postCallVariables": 3-8 data points this business would need captured from EVERY call, tailored to the use case in the description — e.g. an appointment-booking agent needs appointment_date, appointment_time, service_type; a lead-gen agent needs company_name, decision_maker, interest_level; a support agent needs issue_type, resolution_status. Include customer identity fields (customer_name, phone/email) when the flow collects them. Keys are snake_case; each description says exactly what to extract.
${voiceOptions.length ? `- "voice": choose from AVAILABLE VOICES a voice whose language matches the primary conversation language and whose gender fits the described persona (default female if unspecified). Copy the label EXACTLY.

AVAILABLE VOICES:
${voiceOptions.map((v) => `- ${v.label}${v.gender ? ` (${v.gender}` : ''}${v.language ? `${v.gender ? ', ' : ' ('}${v.language}` : ''}${v.gender || v.language ? ')' : ''}`).join('\n')}
` : ''}
Provide 4 to 8 logical, structured conversational steps (flow items) that cover the stages of the assistant's workflow (e.g. Identity & Purpose, Understand User Request, Primary Actions, Out of Scope Handling, next steps, FAQ Examples, Context). Each flow item must be detailed and highly specific to "${name}". Do not use bullet points or formatted text in any sample vocal responses/examples.`;

  let responseText;
  let rawResponse = null;
  try {
    const response = await llmProvider.generateResponse(
      prompt,
      { model, temperature },
      // thinkingBudget: 0 — Gemini 2.5's internal reasoning tokens count
      // against maxTokens; with thinking left on, a long config JSON gets
      // truncated mid-block and fails to parse. The JSON schema in the
      // prompt is prescriptive enough that no reasoning pass is needed.
      { systemPrompt, maxTokens: 6000, thinkingBudget: 0 }
    );
    responseText = response;
  } catch (error) {
    logger.warn(`Primary LLM provider failed for agent flow generation, trying Sarvam AI fallback: ${error.message}`);
    if (process.env.SARVAM_API_KEY) {
      const sarvamUrl = process.env.SARVAM_URL || "https://api.sarvam.ai";
      const sarvamModel = process.env.SARVAM_MODEL || "sarvam-30b";
      try {
        const res = await fetch(`${sarvamUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.SARVAM_API_KEY}`,
          },
          body: JSON.stringify({
            model: sarvamModel,
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            temperature: 0.2,
            max_tokens: 4000,
          }),
        });

        if (!res.ok) {
          throw new Error(`Sarvam API HTTP ${res.status}`);
        }

        const data = await res.json();
        responseText = data.choices?.[0]?.message?.content?.trim() || "";
        rawResponse = data;
      } catch (sarvamError) {
        logger.error("Sarvam AI fallback flow generation failed", sarvamError);
        throw error;
      }
    } else {
      throw error;
    }
  }

  const hasPlaceholders = (parsed) => {
    if (!parsed || !Array.isArray(parsed.flowItems)) return true;
    return parsed.flowItems.some(item => {
      const title = item.title || "";
      const body = item.body || "";
      if (title.trim() === '...') return true;
      if (body.trim() === '...') return true;
      if (/^-\s*Guidelines\.\.\./m.test(body)) return true;
      return false;
    });
  };

  // Strip placeholder bullet lines from bodies as a last resort
  const stripPlaceholders = (parsed) => {
    if (!parsed || !Array.isArray(parsed.flowItems)) return parsed;
    return {
      ...parsed,
      flowItems: parsed.flowItems.map(item => ({
        ...item,
        body: (item.body || '').replace(/^-\s*Guidelines\.\.\.\s*\n?/gm, '').trim(),
      })),
    };
  };

  // Score a candidate by total body text length (more = more detailed)
  const scoreCandidate = (parsed) => {
    if (!parsed || !Array.isArray(parsed.flowItems)) return 0;
    return parsed.flowItems.reduce((sum, item) => sum + (item.body || '').length, 0);
  };

  const extractJson = (text) => {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text.trim();

    // Collect ALL parseable JSON blocks from markdown fences
    const allCandidates = [];
    const matches = [...cleaned.matchAll(/```json\s*([\s\S]*?)\s*```/gi)];
    for (const match of matches) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed && (parsed.welcomeMessage || parsed.flowItems)) {
          allCandidates.push(parsed);
        }
      } catch (e) { /* skip malformed */ }
    }

    // Also try brace-matching for any JSON not in a code fence
    let openBraces = [];
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') {
        openBraces.push(i);
      } else if (cleaned[i] === '}') {
        if (openBraces.length > 0) {
          const start = openBraces.pop();
          if (openBraces.length === 0) {
            try {
              const parsed = JSON.parse(cleaned.slice(start, i + 1));
              if (parsed && (parsed.welcomeMessage || parsed.flowItems)) {
                allCandidates.push(parsed);
              }
            } catch (e) { /* skip */ }
          }
        }
      }
    }

    if (allCandidates.length === 0) return null;

    // Prefer candidates with NO placeholders, scored by body length (most detailed wins)
    const cleanCandidates = allCandidates.filter(c => !hasPlaceholders(c));
    if (cleanCandidates.length > 0) {
      return cleanCandidates.reduce((best, cur) =>
        scoreCandidate(cur) > scoreCandidate(best) ? cur : best
      );
    }

    // Last resort: pick most detailed block overall and strip placeholder lines
    const mostDetailed = allCandidates.reduce((best, cur) =>
      scoreCandidate(cur) > scoreCandidate(best) ? cur : best
    );
    return stripPlaceholders(mostDetailed);
  };

  try {
    let parsed = extractJson(responseText);

    // If parsing content failed and we have Sarvam's rawResponse, check reasoning_content
    if (!parsed && rawResponse && rawResponse.choices?.[0]?.message?.reasoning_content) {
      parsed = extractJson(rawResponse.choices[0].message.reasoning_content);
    }

    if (!parsed) {
      logger.error("Failed to parse LLM JSON response for agent flow from content and reasoning", { responseText, reasoning: rawResponse?.choices?.[0]?.message?.reasoning_content });
      return res.status(500).json({
        error: "Failed to generate valid JSON configuration from LLM",
        responseText,
        reasoning: rawResponse?.choices?.[0]?.message?.reasoning_content
      });
    }

    // Whitelist-validate the settings the LLM chose — anything invalid is
    // dropped so the client falls back to its defaults instead of persisting
    // a value the rest of the system can't use.
    const sanitized = { ...parsed };
    // A usable display name is short — a name that is basically the prompt
    // pasted back (or empty) is dropped so the client falls back.
    if (typeof sanitized.name === 'string') {
      sanitized.name = sanitized.name.trim().replace(/^["']|["']$/g, '');
      if (!sanitized.name || sanitized.name.length > 60) delete sanitized.name;
    } else {
      delete sanitized.name;
    }
    sanitized.languages = (Array.isArray(sanitized.languages) ? sanitized.languages : [])
      .filter((l) => LANGUAGE_OPTIONS.includes(l))
      .slice(0, 3);
    if (!sanitized.languages.length) delete sanitized.languages;
    if (sanitized.callDirection !== 'INBOUND' && sanitized.callDirection !== 'OUTBOUND') delete sanitized.callDirection;
    if (!AI_MODEL_OPTIONS.includes(sanitized.aiModel)) delete sanitized.aiModel;
    if (!STT_OPTIONS.includes(sanitized.transcription)) delete sanitized.transcription;
    if (Array.isArray(sanitized.postCallVariables)) {
      sanitized.postCallVariables = sanitized.postCallVariables
        .filter((v) => v && typeof v.key === 'string' && v.key.trim())
        .slice(0, 10)
        .map((v) => ({
          key: v.key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40),
          description: typeof v.description === 'string' ? v.description.trim().slice(0, 200) : '',
        }))
        .filter((v) => v.key);
      if (!sanitized.postCallVariables.length) delete sanitized.postCallVariables;
    } else {
      delete sanitized.postCallVariables;
    }
    const validVoices = new Set(voiceOptions.map((v) => v.label));
    if (typeof sanitized.voice === 'string') {
      // Models often copy the whole listing line ("Sarvam - roopa (female,
      // hi-IN)") — strip the trailing annotation before validating.
      const label = sanitized.voice.replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (validVoices.has(label)) sanitized.voice = label;
      else delete sanitized.voice;
    } else {
      delete sanitized.voice;
    }

    res.json(sanitized);
  } catch (error) {
    logger.error("Error generating agent flow", error);
    const keyHint = /api.?key/i.test(error.message || '')
      ? ' — check that the provider\'s API key is set in backend/.env'
      : '';
    res.status(502).json({
      error: `Flow generation via ${provider}/${model} failed: ${error.message || 'unknown error'}${keyHint}`,
    });
  }
};

export const enhancePrompt = async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({
      error: "Prompt is required",
    });
  }

  const provider = process.env.DEFAULT_LLM_PROVIDER || "gemini";
  const model = process.env.DEFAULT_LLM_MODEL || "gemini-2.5-flash";

  let llmProvider;

  try {
    llmProvider = getLLMProviderWithFallback(provider);

    const systemPrompt = `
You are an expert Voice AI Agent Designer.

Convert short user ideas into professional voice AI agent descriptions.

Rules:
- Expand the user's prompt professionally.
- Write 1-2 concise paragraphs.
- Describe the role of the voice AI agent.
- Explain what calls it handles.
- Mention common responsibilities.
- Start with "Inbound Voice AI Agent:".
- Do not use markdown.
- Do not use bullet points.
- Output only the enhanced prompt.
`;

    const aiPrompt = `
User Prompt:
${prompt}

Generate a professional voice AI agent description.
`;

 const response = await llmProvider.generateResponse(
  aiPrompt,
  {
    model,
    temperature: 0.3,
  },
  {
    systemPrompt,
    maxTokens: 1000,
  }
);

console.log("GEMINI RESPONSE:", response);
res.json({
  enhancedPrompt:
    typeof response === "string"
      ? response
      : response.message,
});

//     const enhancedPrompt = `Inbound Voice AI Agent:

// You are a virtual assistant for ${prompt}. Your primary role is to receive incoming phone calls, answer customer questions, provide accurate information, assist users with their requests, and guide callers to the appropriate resources when necessary. Be prepared to handle common inquiries, solve problems efficiently, and ensure a professional and helpful experience throughout every interaction.`;

//     res.json({
//       enhancedPrompt,
//     });
  } catch (error) {
    logger.error("Error enhancing prompt", error);

    res.status(500).json({
      error: "Failed to enhance prompt",
    });
  }
};

export default {
  generateResponse,
  getModelsForProvider,
  getSupportedProviders,
  validateLLMConfig,
  generateAgentFlow,
    enhancePrompt,
};
