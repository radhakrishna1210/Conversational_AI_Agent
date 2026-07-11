import { createSupportTicket } from '../services/supportTicket.service.js';
import { geminiService } from '../services/gemini.service.js';

// In-memory state store for ticket flows
// Key: sessionId (e.g. req.ip), Value: TicketState object
const ticketSessions = new Map();

/**
 * @typedef {Object} TicketState
 * @property {'CHOOSE_TYPE' | 'GATHER_FIELD' | 'CONFIRM' | 'CUSTOM_FOLLOW_UP' | 'CUSTOM_CONFIRM'} step
 * @property {string|null} category
 * @property {Object} gatheredFields
 * @property {Array<{name: string, prompt: string}>} requiredFields
 * @property {number} currentFieldIndex
 * @property {Object} customTicketData
 */

const PRECONFIGURED_CATEGORIES = [
  'Billing', 'API Keys', 'Voice Agent', 'WhatsApp', 'Phone Numbers', 
  'Call Logs', 'Integrations', 'Campaigns', 'Analytics', 'Notifications', 
  'Bug Report', 'Feature Request'
];

const TEMPLATES = {
  'Billing': [
    { name: 'Invoice ID', prompt: 'Could you please provide the Invoice ID?' },
    { name: 'Description', prompt: 'What seems to be the issue with the billing?' },
    { name: 'Priority', prompt: 'What is the priority of this issue? (e.g., Low, Medium, High)' }
  ],
  'API Keys': [
    { name: 'Workspace', prompt: 'Which workspace is this for?' },
    { name: 'Error Message', prompt: 'What is the exact error message you are seeing?' },
    { name: 'Description', prompt: 'Could you provide a brief description of the issue?' },
    { name: 'Priority', prompt: 'What is the priority of this issue? (e.g., Low, Medium, High)' }
  ],
  'Voice Agent': [
    { name: 'Agent Name', prompt: 'What is the name of the Voice Agent?' },
    { name: 'Problem', prompt: 'Could you describe the problem you are facing?' },
    { name: 'Priority', prompt: 'What is the priority of this issue? (e.g., Low, Medium, High)' }
  ]
};

// Fallback template for any other preconfigured category
const DEFAULT_TEMPLATE = [
  { name: 'Description', prompt: 'Could you describe the issue in detail?' },
  { name: 'Priority', prompt: 'What is the priority of this issue? (e.g., Low, Medium, High)' }
];

export const isTicketFlowActive = (sessionId) => {
  return ticketSessions.has(sessionId);
};

export const startTicketFlow = (sessionId, userMessage) => {
  ticketSessions.set(sessionId, {
    step: 'CHOOSE_TYPE',
    category: null,
    gatheredFields: {},
    requiredFields: [],
    currentFieldIndex: 0,
    customTicketData: null
  });

  return {
    success: true,
    message: `I can help you create a support ticket.\n\nPlease choose one of the following:\n\n` +
             `• Billing\n• API Keys\n• Voice Agent\n• WhatsApp\n• Phone Numbers\n` +
             `• Call Logs\n• Integrations\n• Campaigns\n• Analytics\n• Notifications\n` +
             `• Bug Report\n• Feature Request\n• Other\n\n` +
             `Alternatively, you can just describe your issue directly (Custom Ticket).`
  };
};

const handleChooseType = async (sessionId, state, userMessage) => {
  const msg = userMessage.trim();
  
  // Check if they want to cancel
  if (/^(cancel|stop|quit|exit|nevermind)$/i.test(msg)) {
    ticketSessions.delete(sessionId);
    return { success: true, message: 'Ticket creation cancelled. Let me know if you need anything else!' };
  }

  // Check if it matches a preconfigured category
  const matchedCategory = [...PRECONFIGURED_CATEGORIES, 'Other'].find(
    c => c.toLowerCase() === msg.toLowerCase() || msg.toLowerCase().includes(c.toLowerCase())
  );

  if (matchedCategory && matchedCategory !== 'Other') {
    // Start preconfigured flow
    state.category = matchedCategory;
    state.requiredFields = TEMPLATES[matchedCategory] || DEFAULT_TEMPLATE;
    state.step = 'GATHER_FIELD';
    state.currentFieldIndex = 0;
    
    return {
      success: true,
      message: `Great, let's create a ticket for ${matchedCategory}.\n\n${state.requiredFields[0].prompt}`
    };
  } else {
    // Custom ticket flow
    state.step = 'CUSTOM_CONFIRM';
    
    // Extract heuristics using Gemini
    const systemPrompt = `You are an AI assistant helping to categorize a support ticket.
The user's message is their description of an issue.
Extract or generate the following information based ONLY on their message.
If you don't know, use a sensible default.
Return ONLY a valid JSON object with these keys: title, category, description, priority, summary.
Do not wrap in Markdown.`;

    try {
      const llmResponse = await geminiService.generateResponse(
        msg,
        { model: 'gemini-2.5-flash', temperature: 0.1 },
        { systemPrompt, maxTokens: 500 }
      );
      
      const responseText = typeof llmResponse === 'string' ? llmResponse : (llmResponse?.message || '{}');
      let extracted;
      try {
        extracted = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (e) {
        extracted = {
          title: 'Custom Support Request',
          category: 'Other',
          description: msg,
          priority: 'Medium',
          summary: msg.length > 50 ? msg.substring(0, 50) + '...' : msg
        };
      }
      
      state.customTicketData = {
        title: extracted.title || 'Support Request',
        category: extracted.category || 'Other',
        description: extracted.description || msg,
        priority: extracted.priority || 'Medium',
        summary: extracted.summary || msg
      };

      return {
        success: true,
        message: `I've prepared a ticket for you.\n\nTicket Summary\nCategory: ${state.customTicketData.category}\nPriority: ${state.customTicketData.priority}\nDescription: ${state.customTicketData.description}\n\nWould you like me to create this ticket?`
      };
    } catch (err) {
      // Fallback if LLM fails
      state.customTicketData = {
        title: 'Support Request',
        category: 'Other',
        description: msg,
        priority: 'Medium',
        summary: msg
      };
      return {
        success: true,
        message: `I've prepared a ticket for you.\n\nTicket Summary\nCategory: Other\nPriority: Medium\nDescription: ${msg}\n\nWould you like me to create this ticket?`
      };
    }
  }
};

const handleGatherField = async (sessionId, state, userMessage) => {
  const currentField = state.requiredFields[state.currentFieldIndex];
  
  if (/^(cancel|stop|quit|exit|nevermind)$/i.test(userMessage.trim())) {
    ticketSessions.delete(sessionId);
    return { success: true, message: 'Ticket creation cancelled.' };
  }

  state.gatheredFields[currentField.name] = userMessage.trim();
  state.currentFieldIndex++;

  if (state.currentFieldIndex < state.requiredFields.length) {
    const nextField = state.requiredFields[state.currentFieldIndex];
    return {
      success: true,
      message: nextField.prompt
    };
  } else {
    // Finished gathering
    state.step = 'CONFIRM';
    let descLines = [];
    for (const [k, v] of Object.entries(state.gatheredFields)) {
      if (k !== 'Priority') {
        descLines.push(`${k}: ${v}`);
      }
    }
    
    const priority = state.gatheredFields['Priority'] || 'Medium';
    const desc = descLines.join('\n');

    return {
      success: true,
      message: `Ticket Summary\nCategory: ${state.category}\nPriority: ${priority}\nDescription: ${desc}\n\nWould you like me to create this ticket?`
    };
  }
};

const handleConfirm = async (sessionId, state, userMessage) => {
  const msg = userMessage.trim().toLowerCase();
  
  if (['yes', 'y', 'yeah', 'yep', 'sure', 'create it', 'please', 'do it'].includes(msg)) {
    try {
      if (state.step === 'CONFIRM') {
        let descLines = [];
        for (const [k, v] of Object.entries(state.gatheredFields)) {
          if (k !== 'Priority') descLines.push(`${k}: ${v}`);
        }
        await createSupportTicket({
          title: `${state.category} Support Request`,
          description: descLines.join('\n'),
          category: state.category,
          priority: state.gatheredFields['Priority'] || 'Medium',
          source: 'chatbot',
        });
      } else if (state.step === 'CUSTOM_CONFIRM') {
        await createSupportTicket({
          title: state.customTicketData.title,
          description: state.customTicketData.description,
          category: state.customTicketData.category,
          priority: state.customTicketData.priority,
          source: 'chatbot',
        });
      }
      
      ticketSessions.delete(sessionId);
      return { success: true, message: 'Ticket created successfully! Our support team will get back to you soon.' };
    } catch (err) {
      console.error('[TicketFlow] Error creating ticket:', err);
      ticketSessions.delete(sessionId);
      return { success: false, message: 'Sorry, I encountered an error creating the ticket. Please try again later.' };
    }
  } else if (['no', 'n', 'nope', 'cancel', 'nevermind'].includes(msg)) {
    ticketSessions.delete(sessionId);
    return { success: true, message: 'Ticket creation cancelled. Let me know if you need anything else!' };
  } else {
    return { success: true, message: 'Would you like me to create this ticket? (Yes / No)' };
  }
};

export const handleTicketFlow = async (sessionId, userMessage) => {
  const state = ticketSessions.get(sessionId);
  if (!state) return null; // Should not happen if routed correctly

  switch (state.step) {
    case 'CHOOSE_TYPE':
      return handleChooseType(sessionId, state, userMessage);
    case 'GATHER_FIELD':
      return handleGatherField(sessionId, state, userMessage);
    case 'CONFIRM':
    case 'CUSTOM_CONFIRM':
      return handleConfirm(sessionId, state, userMessage);
    default:
      ticketSessions.delete(sessionId);
      return { success: true, message: 'Ticket flow reset due to unknown state.' };
  }
};
