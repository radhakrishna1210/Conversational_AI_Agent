export const buildAssistantRequestPayload = ({ message, history = [], systemPrompt = 'You are a helpful AI assistant.' }) => {
  const safeHistory = Array.isArray(history) ? history.filter((entry) => entry && typeof entry === 'object' && typeof entry.content === 'string') : [];
  const trimmedHistory = safeHistory.slice(-10);

  return {
    message: typeof message === 'string' ? message.trim() : '',
    chatHistory: trimmedHistory,
    systemPrompt,
  };
};
