// backend/src/services/voice/slidingWindowContext.js
/**
 * Smart Sliding Window Context Truncation
 *
 * Keeps only the last N turns (default: 5) in active verbatim LLM prompt context
 * to prevent token ballooning and TTFT degradation on long calls.
 * Older turns are compressed into a compact 2-line memory summary.
 */

export function createSlidingWindowContext(options = {}) {
  const maxRecentTurns = options.maxRecentTurns || 5;
  const turns = [];
  let summary = '';

  function addTurn(role, content) {
    if (!content) return;
    turns.push({
      role: role === 'agent' || role === 'assistant' ? 'assistant' : 'user',
      content: String(content).trim(),
      timestamp: Date.now(),
    });

    // If turn count exceeds window, compress the oldest turns into memory
    if (turns.length > maxRecentTurns) {
      const excessCount = turns.length - maxRecentTurns;
      const oldestTurns = turns.splice(0, excessCount);
      updateSummary(oldestTurns);
    }
  }

  function updateSummary(evictedTurns) {
    const lines = evictedTurns.map(t => `${t.role === 'assistant' ? 'Agent' : 'User'}: ${t.content}`);
    const newContext = lines.join('; ');
    if (!summary) {
      summary = `Earlier conversation points: ${newContext}`;
    } else {
      summary = `${summary} | ${newContext}`;
    }
    // Keep summary bounded under 250 chars
    if (summary.length > 250) {
      summary = summary.slice(summary.length - 250);
      const firstSpace = summary.indexOf(' ');
      if (firstSpace > 0) summary = summary.slice(firstSpace + 1);
      summary = `Earlier context: ...${summary}`;
    }
  }

  function getPromptMessages(systemPrompt = '') {
    const messages = [];
    let effectiveSystemPrompt = systemPrompt;

    if (summary) {
      effectiveSystemPrompt = `${systemPrompt}\n\n[Background Memory: ${summary}]`.trim();
    }

    if (effectiveSystemPrompt) {
      messages.push({ role: 'system', content: effectiveSystemPrompt });
    }

    for (const turn of turns) {
      messages.push({ role: turn.role, content: turn.content });
    }

    return messages;
  }

  return {
    addTurn,
    getPromptMessages,
    getRecentTurns: () => turns.slice(),
    getSummary: () => summary,
    clear: () => {
      turns.length = 0;
      summary = '';
    },
  };
}
