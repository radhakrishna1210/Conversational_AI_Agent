/**
 * RAG — Strict Prompt Builder
 * ============================
 * Constructs the system prompt that grounds Kevin's answers
 * exclusively in the retrieved documentation chunks.
 *
 * Design principles:
 *   - Kevin is explicitly forbidden from using outside knowledge.
 *   - If no relevant context is found, Kevin returns the REFUSAL_PHRASE
 *     verbatim — callers check for this string and short-circuit the LLM call.
 *   - Each chunk is annotated with its source so Kevin can cite it.
 *   - Temperature is intentionally kept low (see rag.service.js) to reduce
 *     creative deviation from the supplied context.
 */

/**
 * Exact phrase Kevin must respond with when the documentation
 * does not contain an answer.  Exported so callers can detect it
 * without hard-coding the string in two places.
 */
export const REFUSAL_PHRASE =
  "That's outside my area of expertise. I'm here to help with OmniDimension and its " +
  "features, integrations, pricing, documentation, and troubleshooting. " +
  "If you have a question about OmniDimension, I'd be happy to help.";

/**
 * Build the strict RAG system prompt from a set of retrieved chunks.
 *
 * @param {import('./retriever.js').RelevantChunk[]} relevantChunks
 * @returns {string} - Complete system prompt to inject into the LLM call
 */
export function buildSystemPrompt(relevantChunks) {
  const contextBlock = relevantChunks
    .map(({ chunk, score }) => {
      const header =
        `[SOURCE: ${chunk.relativePath} | ${chunk.source} | score: ${score.toFixed(3)}]`;
      return `${header}\n${chunk.text}`;
    })
    .join('\n\n---\n\n');

  return `You are Kevin, the OmniDimension AI assistant.

Your role is to help users understand and use the OmniDimension Conversational Voice AI platform.

STRICT RULES — you MUST follow these at all times:
1. Answer ONLY using the documentation excerpts provided below.
2. Never use your training knowledge about topics outside the provided excerpts.
3. Never invent features, steps, prices, API endpoints, or configuration options that are not explicitly stated in the excerpts.
4. If the provided excerpts do not contain enough information to answer the question, respond with EXACTLY this phrase and nothing else:
   "${REFUSAL_PHRASE}"
5. Do not mention Gemini, Google, or any underlying AI model.
6. Be concise, helpful, and professional.
7. You may quote or paraphrase the documentation, but always stay within what is stated.

--- Documentation Context ---

${contextBlock}

--- End of Context ---

Answer the user's question based solely on the above documentation.`;
}

/**
 * Build a minimal prompt used when no relevant chunks were found.
 * The rag.service short-circuits before calling the LLM in this case,
 * but this is exported for use in edge cases or testing.
 *
 * @returns {string}
 */
export function buildRefusalPrompt() {
  return `You are Kevin, the OmniDimension AI assistant.
The user asked a question that is outside the available documentation.
Respond with EXACTLY this phrase and nothing else:
"${REFUSAL_PHRASE}"`;
}
