import { useParams, useNavigate } from 'react-router-dom';

import { useEffect, useState, useRef } from 'react';
import { AgentConfig, getAgent, saveAgent, getDefaultFlowItems } from '../lib/agentStore';

import { whapi } from '../lib/whapi';
import { integrationsApi } from '../lib/integrationsApi';
import { toast } from 'sonner';
import ChatComponent from '../components/ChatComponent';
import AIAssistantSidebar from '../components/AIAssistantSidebar';
import VoiceConfigModal from '../components/VoiceConfigModal';
import { useTheme } from '../hooks/useTheme';


interface FlowItem {
  id: string;
  title: string;
  enabled: boolean;
  body?: string;
}

interface ExtractedVariable {
  id: string;
  key: string;
  description: string;
}

interface PostCallConfig {
  id: string;
  deliveryMethod: string;
  triggerStatuses: string[];
  includeCallSummary: boolean;
  includeFullConversation: boolean;
  includeSentimentAnalysis: boolean;
  includeExtractedInformation: boolean;
  extractedVariables: ExtractedVariable[];
}

const LANGUAGES_LIST = [
  'English (American)', 'English (British)', 'English (Indian)', 'English (Australian)',
  'Hindi', 'Bengali', 'Gujarati', 'Tamil', 'Spanish', 'French', 'German', 'Mandarin',
  'Japanese', 'Korean', 'Portuguese', 'Russian', 'Arabic', 'Italian'
];

const VOICES_BY_PROVIDER = {
  google: [
    { id: 'aoede', name: 'Aoede', gender: 'female', accents: ['feminine', 'premium', 'chirp3'] },
    { id: 'achernar', name: 'Achernar', gender: 'female', accents: ['feminine', 'premium', 'chirp3'] },
    { id: 'algenib', name: 'Algenib', gender: 'male', accents: ['masculine', 'premium', 'chirp3'] },
    { id: 'algieba', name: 'Algieba', gender: 'male', accents: ['masculine', 'premium', 'chirp3'] },
    { id: 'alnilam', name: 'Alnilam', gender: 'male', accents: ['masculine', 'premium', 'chirp3'] }
  ],
  elevenlabs: [
    { id: 'bella', name: 'Bella', gender: 'female', accents: ['professional', 'narration'] },
    { id: 'matilda', name: 'Matilda', gender: 'female', accents: ['professional', 'narration'] },
    { id: 'adam', name: 'Adam', gender: 'male', accents: ['professional', 'narration'] }
  ],
  cartesia: [
    { id: 'dante', name: 'Dante', gender: 'male', accents: ['smooth', 'natural'] },
    { id: 'ivy', name: 'Ivy', gender: 'female', accents: ['smooth', 'natural'] }
  ]
};

const AI_MODELS = ['GPT-4.1-Mini', 'GPT-4-Turbo', 'Claude-3-Opus', 'Gemini-Pro', 'Llama-2-70B'];
const POST_CALL_TRIGGER_OPTIONS = ['Completed', 'Voicemail Detected', 'No Answer', 'Busy', 'Failed'];
const POST_CALL_DELIVERY_OPTIONS = ['Email', 'Webhook', 'CRM', 'Slack', 'WhatsApp'];

const createDefaultPostCallConfig = (): PostCallConfig => ({
  id: Date.now().toString(),
  deliveryMethod: '',
  triggerStatuses: ['Completed', 'Voicemail Detected'],
  includeCallSummary: true,
  includeFullConversation: true,
  includeSentimentAnalysis: true,
  includeExtractedInformation: true,
  extractedVariables: [
    { id: 'user_name', key: 'user_name', description: 'Name of the customer being called' },
    { id: 'company_name', key: 'company_name', description: 'Name of the financial institution making the call' },
    { id: 'agent_name', key: 'agent_name', description: 'Name of the virtual agent' },
    { id: 'loan_amount', key: 'loan_amount', description: 'Amount due for the loan repayment' },
    { id: 'due_date', key: 'due_date', description: 'Due date for the loan repayment' }
  ]
});

const MicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" y1="19" x2="12" y2="23"></line>
    <line x1="8" y1="23" x2="16" y2="23"></line>
  </svg>
);

const InfoIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '6px', cursor: 'pointer' }}>
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="16" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12.01" y2="8"></line>
  </svg>
);

export default function EditAgent() {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('details');
  const [isSaving, setIsSaving] = useState(false);
  const { darkMode, toggleDarkMode } = useTheme();


  const [isLoading, setIsLoading] = useState(true);

  // Form state
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [maxDuration, setMaxDuration] = useState(30);
  const [silenceTimeout, setSilenceTimeout] = useState(5);
  const [dynamicEnabled, setDynamicEnabled] = useState(true);
  const [interruptibleEnabled, setInterruptibleEnabled] = useState(true);
  const [flowItems, setFlowItems] = useState<FlowItem[]>([]);

  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [voice, setVoice] = useState('Google - Aoede (female)');
  const [aiModel, setAiModel] = useState('GPT-4.1-Mini');
  const [transcription, setTranscription] = useState('Azure');

  // Modal states
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  
  // Call Configuration states
  const [expandedConfigSection, setExpandedConfigSection] = useState<string | null>(null);
  const [maxSilenceBeforeHangup, setMaxSilenceBeforeHangup] = useState(15);
  const [endCallMessage, setEndCallMessage] = useState('Goodbye and thank you for calling.');
  const [transferNumber, setTransferNumber] = useState('');
  const [transferCondition, setTransferCondition] = useState('');
  const [fillerWords, setFillerWords] = useState(false);
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [ambientSound, setAmbientSound] = useState('None');
  const [showModelModal, setShowModelModal] = useState(false);
  const [showTranscriptionModal, setShowTranscriptionModal] = useState(false);
  const [sttProvider, setSttProvider] = useState('Sarvam');
  const [sttSilenceTimeoutMs, setSttSilenceTimeoutMs] = useState(470);
  const [sttNoiseReducer, setSttNoiseReducer] = useState(true);
  const [sttModel, setSttModel] = useState('Saaras V3');
  const [sttLanguage, setSttLanguage] = useState('Multi');
  const [isSttProviderDropdownOpen, setIsSttProviderDropdownOpen] = useState(false);
  const [sttAdvancedSettingsOpen, setSttAdvancedSettingsOpen] = useState(false);
  const [isSttModelDropdownOpen, setIsSttModelDropdownOpen] = useState(false);
  const [isSttLanguageDropdownOpen, setIsSttLanguageDropdownOpen] = useState(false);
  
  const [voiceProvider, setVoiceProvider] = useState('google');
  const [agentName, setAgentName] = useState('');
  const [agentNotFound, setAgentNotFound] = useState(false);
  const [postCallConfigs, setPostCallConfigs] = useState<PostCallConfig[]>([createDefaultPostCallConfig()]);

  // Collapse/Expand state for conversational flow items (first item expanded by default)
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
    '1': true
  });

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };
  
  // KB state
  const [kbUrls, setKbUrls] = useState<string[]>([]);
  const [kbUrlInput, setKbUrlInput] = useState('');
  const [kbFiles, setKbFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddKbUrl = () => {
    if (kbUrlInput.trim() && !kbUrls.includes(kbUrlInput.trim())) {
      setKbUrls([...kbUrls, kbUrlInput.trim()]);
      setKbUrlInput('');
    }
  };

  const removeKbUrl = (url: string) => {
    setKbUrls(kbUrls.filter(u => u !== url));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setKbFiles([...kbFiles, ...newFiles]);
    }
  };

  const removeKbFile = (index: number) => {
    setKbFiles(kbFiles.filter((_, i) => i !== index));
  };
  
  // Chat test state
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: string, content: string }[]>([]);
  const [userMessage, setUserMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Top-bar button states
  const [showWebCallModal, setShowWebCallModal] = useState(false);
  const [showPhoneCallModal, setShowPhoneCallModal] = useState(false);
  const [showAskAIModal, setShowAskAIModal] = useState(false);
  const [showDeployDropdown, setShowDeployDropdown] = useState(false);
  const [viewMode, setViewMode] = useState<'ui' | 'code'>('ui');
  const [phoneTestNumber, setPhoneTestNumber] = useState('');
  const [deployStatus, setDeployStatus] = useState<'idle' | 'deploying' | 'done'>('idle');
  const [askAIInput, setAskAIInput] = useState('');
  const [askAIResponse, setAskAIResponse] = useState('');
  const [isAskAILoading, setIsAskAILoading] = useState(false);
  const [webCallActive, setWebCallActive] = useState(false);
  const [webCallStatus, setWebCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'ended'>('idle');


  useEffect(() => {
    if (!agentId) return;
    
    const fetchAgent = async () => {
      try {
        const agent = await whapi.get<AgentConfig>(`/agents/${agentId}`);
        if (agent) {
          const savedPostCallConfigs = (agent as any).postCallConfigs;
          setAgentName(agent.name);
          setWelcomeMessage(agent.welcomeMessage);
          setSelectedLanguages(((agent as any).languages ?? agent.selectedLanguages) || ['English (Indian)']);
          setVoice(agent.voice || 'Google - Aoede (female)');
          setAiModel(agent.aiModel || 'GPT-4.1-Mini');
          setTranscription(agent.transcription || 'Azure');
          setMaxDuration(agent.maxDuration ?? 30);
          setSilenceTimeout(agent.silenceTimeout ?? 5);
          setMaxSilenceBeforeHangup((agent as any).maxSilenceBeforeHangup ?? 15);
          setEndCallMessage((agent as any).endCallMessage ?? 'Goodbye and thank you for calling.');
          setTransferNumber((agent as any).transferNumber ?? '');
          setTransferCondition((agent as any).transferCondition ?? '');
          setFillerWords((agent as any).fillerWords ?? false);
          setSpeakingRate((agent as any).speakingRate ?? 1.0);
          setAmbientSound((agent as any).ambientSound ?? 'None');
          setDynamicEnabled(agent.dynamicEnabled ?? true);
          setInterruptibleEnabled(agent.interruptibleEnabled ?? true);
          setFlowItems((agent.flowItems as any) || getDefaultFlowItems(agent.name || ''));
          setPostCallConfigs(savedPostCallConfigs?.length ? savedPostCallConfigs : [createDefaultPostCallConfig()]);
          if (agent.voice?.toLowerCase().startsWith('google')) {
            setVoiceProvider('google');
          } else if (agent.voice?.toLowerCase().startsWith('eleven')) {
            setVoiceProvider('elevenlabs');
          } else if (agent.voice?.toLowerCase().startsWith('cartesia')) {
            setVoiceProvider('cartesia');
          }
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.error('Failed to fetch from backend, trying local storage', err);
      }

      // Fallback to local storage
      const localAgent = getAgent(agentId);
      if (!localAgent) {
        setAgentNotFound(true);
        setIsLoading(false);
        return;
      }
      setAgentName(localAgent.name);
      setWelcomeMessage(localAgent.welcomeMessage);
      setSelectedLanguages(localAgent.selectedLanguages || ['English (Indian)']);
      setVoice(localAgent.voice || 'Google - Aoede (female)');
      setAiModel(localAgent.aiModel || 'GPT-4.1-Mini');
      setTranscription(localAgent.transcription || 'Azure');
      setMaxSilenceBeforeHangup((localAgent as any).maxSilenceBeforeHangup ?? 15);
      setEndCallMessage((localAgent as any).endCallMessage ?? 'Goodbye and thank you for calling.');
      setTransferNumber((localAgent as any).transferNumber ?? '');
      setTransferCondition((localAgent as any).transferCondition ?? '');
      setFillerWords((localAgent as any).fillerWords ?? false);
      setSpeakingRate((localAgent as any).speakingRate ?? 1.0);
      setAmbientSound((localAgent as any).ambientSound ?? 'None');
      setPostCallConfigs((localAgent as any).postCallConfigs?.length ? (localAgent as any).postCallConfigs : [createDefaultPostCallConfig()]);
      setFlowItems((localAgent as any).flowItems || getDefaultFlowItems(localAgent.name || ''));
      setIsLoading(false);
    };

    fetchAgent();
  }, [agentId]);


  // Save changes to backend and local storage
  const handleSave = async () => {
    setIsSaving(true);
    const agentData = {
      name: agentName,
      welcomeMessage,
      aiModel,
      voice,
      transcription,
      languages: selectedLanguages,
      flowItems,
      maxDuration,
      silenceTimeout,
      maxSilenceBeforeHangup,
      endCallMessage,
      transferNumber,
      transferCondition,
      fillerWords,
      speakingRate,
      ambientSound,
      dynamicEnabled,
      interruptibleEnabled,
      postCallConfigs,
      kbUrls,
      kbFiles: kbFiles.map(f => f.name)
    };

    try {
      await whapi.put(`/agents/${agentId}`, agentData);
    } catch (err) {
      console.error('Failed to save to backend', err);
    }

    // Still save to local storage as backup/sync
    saveAgent({ ...agentData, id: agentId!, selectedLanguages } as any);
    
    setIsSaving(false);
  };


  const toggleFlowItem = (id: string) => {
    setFlowItems(flowItems.map(item =>
      item.id === id ? { ...item, enabled: !item.enabled } : item
    ));
  };

  const deleteFlowItem = (id: string) => {
    setFlowItems(flowItems.filter(item => item.id !== id));
  };
  const addFlowItem = () => {
    const newItemId = Date.now().toString();
    const newItem = {
      id: newItemId,
      title: 'New Flow Item',
      enabled: true,
      body: ''
    };
    setFlowItems([...flowItems, newItem]);
    setExpandedItems(prev => ({
      ...prev,
      [newItemId]: true
    }));
  };

  const updateFlowItem = (id: string, updates: Partial<FlowItem>) => {
    setFlowItems(flowItems.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages(prev =>
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  const handleVoiceSelect = (v: { id: string; name: string; provider: string | null }) => {
    const displayName = `${v.provider ?? 'Unknown'} - ${v.name}`;
    setVoice(displayName);
    setSelectedVoiceId(v.id);
    setShowVoiceModal(false);
  };

  const addPostCallConfig = () => {
    setPostCallConfigs((prev) => [...prev, createDefaultPostCallConfig()]);
  };

  const removePostCallConfig = (configId: string) => {
    setPostCallConfigs((prev) => prev.filter((config) => config.id !== configId));
  };

  const updatePostCallConfig = (configId: string, updates: Partial<PostCallConfig>) => {
    setPostCallConfigs((prev) =>
      prev.map((config) => (config.id === configId ? { ...config, ...updates } : config))
    );
  };

  const togglePostCallStatus = (configId: string, status: string) => {
    setPostCallConfigs((prev) =>
      prev.map((config) => {
        if (config.id !== configId) return config;
        const exists = config.triggerStatuses.includes(status);
        return {
          ...config,
          triggerStatuses: exists
            ? config.triggerStatuses.filter((item) => item !== status)
            : [...config.triggerStatuses, status]
        };
      })
    );
  };

  const addExtractedVariable = (configId: string) => {
    setPostCallConfigs((prev) =>
      prev.map((config) =>
        config.id === configId
          ? {
              ...config,
              extractedVariables: [
                ...config.extractedVariables,
                {
                  id: `variable_${Date.now()}`,
                  key: '',
                  description: ''
                }
              ]
            }
          : config
      )
    );
  };

  const updateExtractedVariable = (
    configId: string,
    variableId: string,
    field: keyof ExtractedVariable,
    value: string
  ) => {
    setPostCallConfigs((prev) =>
      prev.map((config) =>
        config.id === configId
          ? {
              ...config,
              extractedVariables: config.extractedVariables.map((variable) =>
                variable.id === variableId ? { ...variable, [field]: value } : variable
              )
            }
          : config
      )
    );
  };

  const removeExtractedVariable = (configId: string, variableId: string) => {
    setPostCallConfigs((prev) =>
      prev.map((config) =>
        config.id === configId
          ? {
              ...config,
              extractedVariables: config.extractedVariables.filter((variable) => variable.id !== variableId)
            }
          : config
      )
    );
  };

  const handleTestChat = async () => {
    if (!userMessage.trim()) return;
    
    const newMessages = [...chatMessages, { role: 'user', content: userMessage }];
    setChatMessages(newMessages);
    setUserMessage('');
    setIsTyping(true);

    try {
      const isGemini = aiModel.toLowerCase().includes('gemini');
      const chatTestInstructions = `# Chat Test Assistant Instructions

You are the Chat Test Environment for this AI Agent.

Your responsibility is to simulate the exact behavior of the deployed agent and validate that the agent follows its configured instructions, conversation flow, knowledge base, variables, business rules, and integrations.

## Primary Objective

Act exactly as the configured agent would act in production.

The purpose of this chat is to test the agent's behavior before deployment.

Never bypass configured instructions.

Never ignore defined conversation flows.

Never invent information not present in the knowledge base.

Never assume tool execution if no tool is available.

---

## Agent Configuration Priority

Always follow this order:

1. Agent Instructions
2. Conversation Flow
3. Knowledge Base
4. Variables & Memory
5. Business Rules
6. Integrations & Tools
7. User Message

If conflicts occur, higher-priority instructions take precedence.

---

## Conversation Flow Enforcement

For every user message:

1. Identify current flow stage.
2. Determine expected next action.
3. Check required information.
4. Continue only according to flow rules.

Examples:

* Greeting Flow
* Qualification Flow
* FAQ Flow
* Product Inquiry Flow
* Appointment Booking Flow
* Support Flow
* Escalation Flow
* Feedback Collection Flow
* Closing Flow

Do not skip mandatory stages.

Do not jump ahead in the workflow.

Do not collect unnecessary information.

---

## Knowledge Base Rules

When answering questions:

* Search available knowledge first.
* Use only information present in the configured knowledge base.
* Keep responses accurate and grounded.

If information cannot be found:

Respond with:

"I couldn't find that information in the configured knowledge base."

Do not hallucinate.

Do not generate unsupported facts.

---

## Variable Tracking

Maintain conversation state throughout the session.

Track:

* Name
* Email
* Phone
* Company
* Product Interest
* Booking Preferences
* Support Details
* Any custom variables defined for the agent

Reuse previously collected information.

Never ask for information that has already been collected unless verification is required.

---

## Lead Qualification Testing

If the flow requires qualification:

Collect required fields.

Validate:

* Completeness
* Format
* Eligibility Criteria

Only mark a lead as qualified when all required conditions are satisfied.

If information is missing, request only the missing fields.

---

## Appointment Booking Testing

Before booking:

Collect:

* Date
* Time
* Time Zone
* Contact Details

Generate a confirmation summary.

Require explicit user confirmation before proceeding.

Never assume confirmation.

---

## Tool & Integration Validation

When a workflow requires a tool:

1. Verify prerequisites.
2. Validate collected inputs.
3. Execute configured action.
4. Return actual results.

If the tool is unavailable:

State that the requested action cannot be completed due to unavailable integration.

Never fabricate successful execution.

Never generate fake booking IDs, order IDs, confirmations, or API responses.

---

## Error Handling

For ambiguous requests:

Ask for clarification.

For unsupported requests:

State that the request is outside the agent's configured capabilities.

For missing required data:

Request only the specific missing information.

---

## Escalation Rules

Escalate when:

* User requests a human agent.
* User repeatedly expresses frustration.
* Request falls outside available knowledge.
* Business rules require human review.

When escalation occurs:

Inform the user that the conversation should be transferred to a human representative.

---

## Memory & Context

Maintain awareness of:

* Previous user responses
* Current flow stage
* Collected variables
* Pending actions
* Completed actions

Use context throughout the conversation.

Avoid repetitive questions.

---

## Response Quality Standards

Responses must be:

* Accurate
* Professional
* Context-aware
* Flow-compliant
* Knowledge-grounded
* Concise
* Action-oriented

Avoid:

* Hallucinations
* Guessing
* Contradictory responses
* Flow violations
* Unverified claims

---

## Internal Validation Checklist

Before every response verify:

✓ Agent instructions followed

✓ Flow followed correctly

✓ Knowledge base checked

✓ Required variables collected

✓ Business rules satisfied

✓ Tool requirements validated

✓ Memory updated

✓ Response aligned with current stage

Only then generate the response.

---

## Final Rule

The Chat Test environment must behave exactly like the live agent.

Every response must reflect:

* Agent Instructions
* Flow Logic
* Knowledge Base Content
* Variables
* Integrations
* Business Rules

The goal is to accurately test real-world agent behavior before deployment.

---

# Current Agent Configuration

Welcome Message: ${welcomeMessage}

Flow:
${flowItems.filter(f => f.enabled).map(f => f.title).join('\n')}`;

      const response = await whapi.post<{ message: string }>('/llm/generate', {
        agentId,
        message: userMessage,
        systemPrompt: chatTestInstructions,
        provider: isGemini ? 'gemini' : 'openai',
        model: isGemini ? 'gemini-2.5-flash' : 'gpt-4o'
      });

      setChatMessages([...newMessages, { role: 'assistant', content: response.message }]);
    } catch (err) {
      console.error('Chat failed', err);
      setChatMessages([...newMessages, { role: 'assistant', content: 'Error: Failed to get response from AI.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleAskAI = async () => {
    if (!askAIInput.trim()) return;
    setIsAskAILoading(true);
    setAskAIResponse('');
    try {
      const response = await whapi.post<{ message: string }>('/llm/generate', {
        agentId,
        message: askAIInput,
        systemPrompt: `You are an AI assistant helping configure an AI voice agent. The agent is named "${agentName}" and its welcome message is: "${welcomeMessage}". Provide helpful, concise suggestions for improving or configuring this agent.`,
        provider: 'openai',
        model: 'gpt-4o'
      });
      setAskAIResponse(response.message);
    } catch (err) {
      setAskAIResponse('Failed to get AI response. Please check your backend connection.');
    } finally {
      setIsAskAILoading(false);
    }
  };

  const handleDeploy = async () => {
    setDeployStatus('deploying');
    setShowDeployDropdown(false);
    try {
      await handleSave();
      await new Promise(resolve => setTimeout(resolve, 1200));
      setDeployStatus('done');
      setTimeout(() => setDeployStatus('idle'), 3000);
    } catch {
      setDeployStatus('idle');
    }
  };

  const handleStartWebCall = () => {
    setWebCallStatus('connecting');
    setWebCallActive(true);
    setTimeout(() => setWebCallStatus('connected'), 1500);
  };

  const handleEndWebCall = () => {
    setWebCallStatus('ended');
    setTimeout(() => {
      setWebCallActive(false);
      setWebCallStatus('idle');
    }, 1000);
  };

  const handlePhoneCall = async () => {
    if (!phoneTestNumber.trim()) return;
    try {
      const res = await whapi.post<{ message: string }>('/agents/test-call', { agentId, phoneNumber: phoneTestNumber });
      alert(res.message || `Test call initiated to ${phoneTestNumber}.`);
      setShowPhoneCallModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to initiate test call. Please check your Twilio configuration.');
    }
  };


  if (isLoading) {
    return (
      <div style={{ width: '100%', minHeight: '100vh', background: '#0f0f0f', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid #1a1a1a', borderTopColor: '#00bcd4', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '14px', color: '#999' }}>Loading agent configuration...</span>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: '#0f0f0f', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Language Configuration Modal */}
      {showLanguageModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '30px', maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Language Configuration</h2>
              <button onClick={() => setShowLanguageModal(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}>X</button>
            </div>
            <p style={{ fontSize: '13px', color: '#999', marginBottom: '20px' }}>Choose multiple languages for your agent to support</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              {LANGUAGES_LIST.map(lang => (
                <label key={lang} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#0f0f0f', border: selectedLanguages.includes(lang) ? '1px solid #00bcd4' : '1px solid #333', borderRadius: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedLanguages.includes(lang)}
                    onChange={() => toggleLanguage(lang)}
                    style={{ accentColor: '#00bcd4', width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '13px' }}>{lang}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLanguageModal(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #333', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={() => setShowLanguageModal(false)} style={{ padding: '10px 20px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Configuration Modal – real data from backend API */}
      {showVoiceModal && agentId && (
        <VoiceConfigModal
          agentId={agentId}
          currentVoiceId={selectedVoiceId}
          onClose={() => setShowVoiceModal(false)}
          onSaved={handleVoiceSelect}
        />
      )}

      {/* AI Model Configuration Modal */}
      {showModelModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '30px', maxWidth: '500px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>AI Model Configuration</h2>
              <button onClick={() => setShowModelModal(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}>X</button>
            </div>
            <div style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
              {AI_MODELS.map(model => (
                <button
                  key={model}
                  onClick={() => { setAiModel(model); setShowModelModal(false); }}
                  style={{
                    padding: '12px',
                    background: aiModel === model ? '#00bcd4' : '#0f0f0f',
                    color: aiModel === model ? '#000' : '#fff',
                    border: aiModel === model ? 'none' : '1px solid #333',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    textAlign: 'left',
                    fontWeight: aiModel === model ? '600' : '400'
                  }}
                >
                  {model}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Transcription Configuration Modal (Speech-to-Text) */}
      {showTranscriptionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '30px', maxWidth: '900px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Speech-to-Text Configuration</h2>
              <button onClick={() => setShowTranscriptionModal(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}>X</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
              {/* Left Column */}
              <div>
                <div style={{ marginBottom: '24px', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500' }}>Provider</label>
                    <InfoIcon />
                  </div>
                  <div 
                    onClick={() => setIsSttProviderDropdownOpen(!isSttProviderDropdownOpen)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      padding: '10px 14px', 
                      background: '#0f0f0f', 
                      border: '1px solid #333', 
                      borderRadius: '6px', 
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#fff'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MicIcon />
                      <span>{sttProvider}</span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#999', transform: isSttProviderDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>v</span>
                  </div>
                  {isSttProviderDropdownOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#0f0f0f', border: '1px solid #333', borderRadius: '6px', marginTop: '4px', zIndex: 10 }}>
                      {['Standard Providers', 'deepgram_stream', 'Azure', 'Sarvam', 'Soniox'].map(provider => (
                        <div 
                          key={provider} 
                          onClick={() => { setSttProvider(provider); setIsSttProviderDropdownOpen(false); }}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            padding: '10px 14px', 
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: '#fff',
                            background: sttProvider === provider ? '#1a1a1a' : 'transparent'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#1a1a1a'}
                          onMouseLeave={(e) => e.currentTarget.style.background = sttProvider === provider ? '#1a1a1a' : 'transparent'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MicIcon />
                            <span>{provider}</span>
                          </div>
                          {sttProvider === provider && <span style={{ color: '#fff', fontSize: '12px' }}>OK</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500' }}>Silence Timeout</label>
                    <InfoIcon />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
                    <input 
                      type="range" 
                      min="0" 
                      max="1500" 
                      value={sttSilenceTimeoutMs} 
                      onChange={(e) => setSttSilenceTimeoutMs(Number(e.target.value))}
                      style={{ 
                        flex: 1, 
                        accentColor: '#00bcd4', 
                        height: '4px', 
                        background: '#333',
                        borderRadius: '2px',
                        appearance: 'none',
                        cursor: 'pointer'
                      }} 
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: '#999' }}>
                    <span>0ms</span>
                    <span style={{ color: '#fff' }}>{sttSilenceTimeoutMs}ms</span>
                    <span>1500ms</span>
                  </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500' }}>Apply Noise Reducer</label>
                    <InfoIcon />
                  </div>
                  <div 
                    style={{ 
                      width: '40px', 
                      height: '20px', 
                      background: '#0f0f0f', 
                      border: sttNoiseReducer ? '2px solid #00bcd4' : '2px solid #333', 
                      borderRadius: '10px', 
                      position: 'relative', 
                      cursor: 'pointer' 
                    }} 
                    onClick={() => setSttNoiseReducer(!sttNoiseReducer)}
                  >
                    <div 
                      style={{ 
                        width: '12px', 
                        height: '12px', 
                        background: sttNoiseReducer ? '#00bcd4' : '#666', 
                        borderRadius: '50%', 
                        position: 'absolute', 
                        top: '2px', 
                        left: sttNoiseReducer ? '22px' : '2px', 
                        transition: 'left 0.2s, background 0.2s' 
                      }} 
                    />
                  </div>
                </div>

                <div 
                  onClick={() => setSttAdvancedSettingsOpen(!sttAdvancedSettingsOpen)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '14px', 
                    background: '#0f0f0f', 
                    border: '1px solid #222', 
                    borderRadius: '6px', 
                    cursor: 'pointer' 
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: '500' }}>Advanced Settings</span>
                  <span style={{ fontSize: '10px', color: '#999', transform: sttAdvancedSettingsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>v</span>
                </div>
              </div>

              {/* Right Column */}
              <div style={{ paddingLeft: '30px', borderLeft: '1px solid #222' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '20px' }}>
                  {sttProvider === 'Sarvam' ? 'Sarvam AI Configuration' : `${sttProvider} Configuration`}
                </div>
                
                <div style={{ marginBottom: '16px', position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '8px' }}>Model</label>
                  <div 
                    onClick={() => setIsSttModelDropdownOpen(!isSttModelDropdownOpen)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#0f0f0f', border: '1px solid #333', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                  >
                    <span>{sttModel}</span>
                    <span style={{ fontSize: '10px', color: '#999' }}>v</span>
                  </div>
                  {isSttModelDropdownOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#0f0f0f', border: '1px solid #333', borderRadius: '6px', marginTop: '4px', zIndex: 10 }}>
                      {['Saaras V3', 'Standard V2'].map(model => (
                        <div 
                          key={model} 
                          onClick={() => { setSttModel(model); setIsSttModelDropdownOpen(false); }}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: '#fff', background: sttModel === model ? '#1a1a1a' : 'transparent' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#1a1a1a'}
                          onMouseLeave={(e) => e.currentTarget.style.background = sttModel === model ? '#1a1a1a' : 'transparent'}
                        >
                          {model}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: '16px', position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '8px' }}>Language</label>
                  <div 
                    onClick={() => setIsSttLanguageDropdownOpen(!isSttLanguageDropdownOpen)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#0f0f0f', border: '1px solid #333', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                  >
                    <span>{sttLanguage}</span>
                    <span style={{ fontSize: '10px', color: '#999' }}>v</span>
                  </div>
                  {isSttLanguageDropdownOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#0f0f0f', border: '1px solid #333', borderRadius: '6px', marginTop: '4px', zIndex: 10 }}>
                      {['Multi', 'English', 'Hindi', 'Tamil'].map(lang => (
                        <div 
                          key={lang} 
                          onClick={() => { setSttLanguage(lang); setIsSttLanguageDropdownOpen(false); }}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: '#fff', background: sttLanguage === lang ? '#1a1a1a' : 'transparent' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#1a1a1a'}
                          onMouseLeave={(e) => e.currentTarget.style.background = sttLanguage === lang ? '#1a1a1a' : 'transparent'}
                        >
                          {lang}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button 
                onClick={() => {
                  setTranscription(sttProvider);
                  setShowTranscriptionModal(false);
                }} 
                style={{ padding: '10px 24px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Web Call Modal */}
      {showWebCallModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1a1a1a', borderRadius: '12px', padding: '40px', maxWidth: '420px', width: '90%', textAlign: 'center', border: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
              <button onClick={() => { setShowWebCallModal(false); setWebCallActive(false); setWebCallStatus('idle'); }} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '20px' }}>✕</button>
            </div>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: webCallStatus === 'connected' ? 'rgba(76,175,80,0.2)' : webCallStatus === 'connecting' ? 'rgba(255,152,0,0.2)' : 'rgba(0,188,212,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', border: webCallStatus === 'connected' ? '2px solid #4caf50' : '2px solid #00bcd4', transition: 'all 0.3s' }}>
              <span style={{ fontSize: '36px' }}>{webCallStatus === 'connected' ? '🎙️' : webCallStatus === 'connecting' ? '⏳' : '🌐'}</span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 8px', color: '#fff' }}>
              {webCallStatus === 'idle' ? 'Web Call Test' : webCallStatus === 'connecting' ? 'Connecting...' : webCallStatus === 'connected' ? 'Call Connected' : 'Call Ended'}
            </h3>
            <p style={{ fontSize: '13px', color: '#999', marginBottom: '24px' }}>
              {webCallStatus === 'idle' ? `Test your agent "${agentName}" with a browser-based voice call.` : webCallStatus === 'connecting' ? 'Setting up audio connection...' : webCallStatus === 'connected' ? 'Speak into your microphone to interact with the agent.' : 'The test call has ended.'}
            </p>
            {!webCallActive ? (
              <button
                onClick={handleStartWebCall}
                style={{ padding: '14px 32px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
              >🎤 Start Web Call</button>
            ) : webCallStatus === 'connected' ? (
              <button
                onClick={handleEndWebCall}
                style={{ padding: '14px 32px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
              >📞 End Call</button>
            ) : null}
          </div>
        </div>
      )}

      {/* Phone Call Modal */}
      {showPhoneCallModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1a1a1a', borderRadius: '12px', padding: '30px', maxWidth: '440px', width: '90%', border: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>📞 Test Phone Call</h2>
              <button onClick={() => setShowPhoneCallModal(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}>✕</button>
            </div>
            <p style={{ fontSize: '13px', color: '#999', marginBottom: '16px' }}>Enter a phone number to receive a test call from your agent "{agentName}". Make sure your Twilio account is configured.</p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '8px' }}>Phone Number</label>
              <input
                type="tel"
                value={phoneTestNumber}
                onChange={e => setPhoneTestNumber(e.target.value)}
                placeholder="+1 (555) 123-4567"
                style={{ width: '100%', background: '#0f0f0f', border: '1px solid #333', borderRadius: '8px', padding: '12px 14px', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPhoneCallModal(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #333', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button
                onClick={handlePhoneCall}
                disabled={!phoneTestNumber.trim()}
                style={{ padding: '10px 20px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', opacity: !phoneTestNumber.trim() ? 0.6 : 1 }}
              >📞 Call Now</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: '#0a0a0a', borderBottom: '1px solid #1a1a1a', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '18px', padding: 0 }}>{'<'}</button>
        
        <input
          type="text"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          style={{
            padding: '8px 12px',
            background: '#111',
            border: '1px solid #222',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '600',
            outline: 'none',
            minWidth: '240px'
          }}
          placeholder="Agent Name"
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', background: '#0f1f12', border: '1px solid #1a3a22', borderRadius: '12px', fontSize: '11px', color: '#4caf50', fontWeight: '500' }}>
          <span style={{ fontSize: '8px' }}>o</span> Incoming
        </div>

        <div style={{ fontSize: '12px', color: '#888' }}>Cost/min: $0.115</div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Ask AI Button */}
          <button
            onClick={() => { setShowAskAIModal(true); setAskAIResponse(''); setAskAIInput(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', transition: 'opacity 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >✨ Ask AI</button>
          
          {/* Test With Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#fff', fontWeight: '500' }}>Test with</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#111', padding: '4px', borderRadius: '8px', border: '1px solid #222' }}>
              <button
                onClick={() => setActiveTab('chat')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: activeTab === 'chat' ? '#00bcd4' : '#0f0f0f', color: activeTab === 'chat' ? '#000' : '#00bcd4', border: activeTab === 'chat' ? 'none' : '1px solid #00bcd4', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', transition: 'all 0.2s' }}
              >💬 Chat</button>
              <button
                onClick={() => setShowWebCallModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#0f0f0f', color: '#00bcd4', border: '1px solid #00bcd4', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500', transition: 'all 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#00bcd420')}
                onMouseLeave={e => (e.currentTarget.style.background = '#0f0f0f')}
              >🌐 Web Call</button>
              <button
                onClick={() => setShowPhoneCallModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#0f0f0f', color: '#00bcd4', border: '1px solid #00bcd4', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500', transition: 'all 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#00bcd420')}
                onMouseLeave={e => (e.currentTarget.style.background = '#0f0f0f')}
              >📞 Phone Call</button>
            </div>
          </div>

          {/* Deploy Button with Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowDeployDropdown(prev => !prev)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: deployStatus === 'done' ? '#2e7d32' : deployStatus === 'deploying' ? '#444' : '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '6px', cursor: deployStatus === 'deploying' ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '500', transition: 'all 0.3s' }}
              disabled={deployStatus === 'deploying'}
            >
              {deployStatus === 'deploying' ? '⏳ Deploying...' : deployStatus === 'done' ? '✅ Deployed!' : '🚀 Deploy'} <span style={{ fontSize: '10px', opacity: 0.7 }}>▼</span>
            </button>
            {showDeployDropdown && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', minWidth: '200px', zIndex: 200, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                <div style={{ padding: '8px 0' }}>
                  <div onClick={handleDeploy} style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: '#fff', display: 'flex', gap: '10px', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.background = '#222'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span>🚀</span> Save & Deploy
                  </div>
                  <div onClick={() => { handleSave(); setShowDeployDropdown(false); }} style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: '#fff', display: 'flex', gap: '10px', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.background = '#222'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span>💾</span> Save Draft
                  </div>
                  <div style={{ height: '1px', background: '#333', margin: '4px 0' }} />
                  <div onClick={() => { navigator.clipboard.writeText(window.location.href); setShowDeployDropdown(false); }} style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: '#aaa', display: 'flex', gap: '10px', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.background = '#222'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span>🔗</span> Copy Agent Link
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* UI / Code Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', background: '#111', border: '1px solid #222', borderRadius: '20px', padding: '2px' }}>
            <div
              onClick={() => setViewMode('ui')}
              style={{ padding: '4px 12px', background: viewMode === 'ui' ? '#333' : 'transparent', color: viewMode === 'ui' ? '#fff' : '#666', borderRadius: '18px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' }}
            >UI</div>
            <div
              onClick={() => setViewMode('code')}
              style={{ padding: '4px 12px', background: viewMode === 'code' ? '#333' : 'transparent', color: viewMode === 'code' ? '#fff' : '#666', borderRadius: '18px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' }}
            >Code</div>
          </div>

          <button
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: '#111',
              border: '1px solid #222',
              color: '#999',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              borderRadius: '50%',
              width: '30px',
              height: '30px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.borderColor = '#444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#999';
              e.currentTarget.style.borderColor = '#222';
            }}
          >
            {darkMode ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            )}
          </button>
        </div>

      </div>

      <div style={{ display: 'flex', flex: 1, height: 'calc(100vh - 73px)' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {agentNotFound && (
              <div style={{ padding: '40px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', margin: '20px 30px', color: '#fff' }}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>Agent not found</h2>
                <p style={{ color: '#999', marginTop: '10px' }}>The assistant you are trying to edit does not exist or has been removed. Return to the dashboard to select a different assistant.</p>
                <button onClick={() => navigate('/dashboard')} style={{ marginTop: '16px', padding: '10px 18px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Back to Dashboard</button>
              </div>
            )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1a1a1a', background: '#0a0a0a', padding: '0 24px', gap: '24px', overflowX: 'auto', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '24px', flex: 1 }}>
          {[
            { id: 'details', label: 'Assistant Details' },
            { id: 'config', label: 'Call Configuration' },
            { id: 'kb', label: 'Knowledge Base' },
            { id: 'integrations', label: 'Integrations' },
            { id: 'postcall', label: 'Post-Call' },
            { id: 'chat', label: 'Chat Test' },
            { id: 'calls', label: 'Recent Calls' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                color: activeTab === tab.id ? '#fff' : '#666',
                padding: '16px 0',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: activeTab === tab.id ? '600' : '500',
                borderBottom: activeTab === tab.id ? '2px solid #fff' : '2px solid transparent',
                marginBottom: '-1px',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* Search Bar */}
        <div style={{ display: 'flex', alignItems: 'center', background: '#111', border: '1px solid #222', borderRadius: '6px', padding: '6px 12px', minWidth: '200px' }}>
          <span style={{ color: '#666', marginRight: '8px', fontSize: '14px' }}>S</span>
          <input 
            type="text" 
            placeholder="Search or jump to..." 
            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', outline: 'none', width: '100%' }}
          />
          <div style={{ background: '#222', color: '#999', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>Ctrl+K</div>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'code' ? (
        <div style={{ padding: '30px 24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '18px', color: '#f5f5f5', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>{'{ }'}</span> Agent Configuration (JSON)
          </div>
          <textarea
            readOnly
            value={JSON.stringify({
              name: agentName,
              welcomeMessage,
              aiModel,
              voice,
              transcription,
              languages: selectedLanguages,
              flowItems,
              maxDuration,
              silenceTimeout,
              dynamicEnabled,
              interruptibleEnabled,
              postCallConfigs
            }, null, 2)}
            style={{ width: '100%', minHeight: '500px', background: '#0a0a0a', border: '1px solid #222', borderRadius: '8px', padding: '20px', color: '#00bcd4', fontSize: '13px', fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button
              onClick={() => { navigator.clipboard.writeText(JSON.stringify({ name: agentName, welcomeMessage, aiModel, voice, transcription, languages: selectedLanguages, flowItems, maxDuration, silenceTimeout, dynamicEnabled, interruptibleEnabled, postCallConfigs }, null, 2)); alert('Copied to clipboard!'); }}
              style={{ padding: '10px 20px', background: '#1a1a1a', border: '1px solid #333', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
            >📋 Copy JSON</button>
            <button
              onClick={() => { const blob = new Blob([JSON.stringify({ name: agentName, welcomeMessage, aiModel, voice, transcription, languages: selectedLanguages, flowItems, maxDuration, silenceTimeout, dynamicEnabled, interruptibleEnabled, postCallConfigs }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${agentName.replace(/\s+/g, '_')}_config.json`; a.click(); URL.revokeObjectURL(url); }}
              style={{ padding: '10px 20px', background: '#1a1a1a', border: '1px solid #333', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
            >⬇️ Download JSON</button>
          </div>
        </div>
      ) : (
      <div style={{ padding: '30px 24px' }}>
        {activeTab === 'details' && (
          <>
            {/* Assistant Settings */}
            <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '18px', display: 'flex', alignItems: 'center', color: '#f5f5f5' }}>
              Assistant Settings <InfoIcon />
            </div>
            <div style={{ background: '#0c0c0c', border: '1px solid #222', borderRadius: '16px', padding: '24px 30px 20px', marginBottom: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px', marginBottom: '0' }}>
              {[
                { icon: 'O', label: 'Languages', value: selectedLanguages.length > 0 ? selectedLanguages.join(', ') : 'No languages selected', onClick: () => setShowLanguageModal(true) },
                { icon: 'V', label: 'Voice (TTS)', value: voice, onClick: () => setShowVoiceModal(true) },
                { icon: '{}', label: 'AI Model (LLM)', value: aiModel, onClick: () => setShowModelModal(true) },
                { icon: '|||', label: 'Transcription (STT)', value: transcription, onClick: () => setShowTranscriptionModal(true) }
              ].map((item, i) => (
                <div key={i} onClick={item.onClick} style={{ background: '#062021', border: '1px solid #0d5154', borderRadius: '14px', padding: '20px 16px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#08282a'} onMouseLeave={(e) => e.currentTarget.style.background = '#062021'}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '11px', background: '#07393b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: '#11c7cf', fontWeight: '700' }}>
                    <span>{item.icon}</span>
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '14px', color: '#fff', fontWeight: '700', marginBottom: '4px' }}>{item.label}</div>
                    <div style={{ fontSize: '12px', color: '#b3b3b3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.value}</div>
                  </div>
                  <InfoIcon />
                </div>
              ))}
            </div>
            </div>

            {/* Welcome Message */}
            <div style={{ background: '#0b0b0b', border: '1px solid #222', borderRadius: '16px', padding: '0', marginBottom: '20px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 30px', borderBottom: '1px solid #1c1c1c' }}>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '16px', fontWeight: '700', color: '#fff' }}>
                  <span style={{ color: '#11c7cf', marginRight: '10px', fontWeight: '700' }}>[]</span> Welcome Message <InfoIcon />
                </div>
                <div style={{ display: 'flex', gap: '24px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#b7b7b7' }}>
                    <span>Dynamic</span>
                    <div onClick={() => setDynamicEnabled(!dynamicEnabled)} style={{ width: '42px', height: '24px', background: dynamicEnabled ? '#12c8d0' : '#232323', borderRadius: '999px', position: 'relative', cursor: 'pointer' }}>
                      <div style={{ width: '20px', height: '20px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: dynamicEnabled ? '20px' : '2px', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#b7b7b7' }}>
                    <span>Interruptible</span>
                    <div onClick={() => setInterruptibleEnabled(!interruptibleEnabled)} style={{ width: '42px', height: '24px', background: interruptibleEnabled ? '#12c8d0' : '#232323', borderRadius: '999px', position: 'relative', cursor: 'pointer' }}>
                      <div style={{ width: '20px', height: '20px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: interruptibleEnabled ? '20px' : '2px', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding: '18px 30px 20px' }}>
                <textarea
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '142px',
                    background: '#1a1a1a',
                    border: '1px solid #2a2a2a',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    color: '#f1f1f1',
                    fontFamily: 'inherit',
                    fontSize: '15px',
                    lineHeight: '1.5',
                    resize: 'none',
                    outline: 'none'
                  }}
                  placeholder="Type your welcome message here..."
                />
                <div style={{ fontSize: '11px', color: '#8d8d8d', textAlign: 'right', marginTop: '10px' }}>{welcomeMessage.length}/600</div>
              </div>
            </div>

            {/* Conversational Flow */}
            <div style={{ background: '#0b0b0b', border: '1px solid #222', borderRadius: '16px', padding: '0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 30px', borderBottom: '1px solid #1c1c1c' }}>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '16px', fontWeight: '700', color: '#fff' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#11c7cf" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px' }}>
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <circle cx="3" cy="6" r="1" fill="#11c7cf"></circle>
                    <circle cx="3" cy="12" r="1" fill="#11c7cf"></circle>
                    <circle cx="3" cy="18" r="1" fill="#11c7cf"></circle>
                  </svg>
                  Conversational Flow <InfoIcon />
                </div>
                <button onClick={addFlowItem} style={{ padding: '10px 18px', background: 'transparent', border: '1px solid #2d2d2d', borderRadius: '10px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>+ Add Section</button>
              </div>
              <div style={{ padding: '16px 30px 20px' }}>
                {flowItems.map((item, index) => {
                  const isExpanded = !!expandedItems[item.id];
                  return (
                    <div key={item.id} style={{ background: '#0d0d0d', border: '1px solid #1c1c1c', borderRadius: '12px', padding: '12px 16px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {/* Caret Toggle Button */}
                        <button
                          onClick={() => toggleExpand(item.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#999',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '4px',
                            transition: 'transform 0.2s',
                          }}
                        >
                          {isExpanded ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="18 15 12 9 6 15"></polyline>
                            </svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                          )}
                        </button>

                        {/* Grip Vertical Handle */}
                        <div style={{ display: 'flex', alignItems: 'center', cursor: 'grab', padding: '0 2px' }}>
                          <svg width="12" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="9" cy="5" r="1.5" fill="#555" />
                            <circle cx="9" cy="12" r="1.5" fill="#555" />
                            <circle cx="9" cy="19" r="1.5" fill="#555" />
                            <circle cx="15" cy="5" r="1.5" fill="#555" />
                            <circle cx="15" cy="12" r="1.5" fill="#555" />
                            <circle cx="15" cy="19" r="1.5" fill="#555" />
                          </svg>
                        </div>

                        {/* Number */}
                        <span style={{ fontSize: '14px', fontWeight: '700', width: '22px', color: '#fff' }}>{index + 1}.</span>

                        {/* Editable Title Input Styled Cleanly */}
                        <input
                          value={item.title}
                          onChange={(e) => updateFlowItem(item.id, { title: e.target.value })}
                          style={{
                            flex: 1,
                            border: '1px solid transparent',
                            borderRadius: '6px',
                            padding: '6px 8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            color: '#fff',
                            background: 'transparent',
                            outline: 'none',
                            cursor: 'text',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (document.activeElement !== e.currentTarget) {
                              e.currentTarget.style.borderColor = '#222';
                              e.currentTarget.style.background = '#111';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (document.activeElement !== e.currentTarget) {
                              e.currentTarget.style.borderColor = 'transparent';
                              e.currentTarget.style.background = 'transparent';
                            }
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#11c7cf';
                            e.currentTarget.style.background = '#0f0f0f';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'transparent';
                            e.currentTarget.style.background = 'transparent';
                          }}
                        />

                        {/* Right Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginLeft: '12px' }}>
                          {/* Toggle ON/OFF Switch Block */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#b3b3b3', fontWeight: '700', background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '0 10px', height: '32px' }}>
                            <span style={{ color: item.enabled ? '#fff' : '#666', minWidth: '24px' }}>{item.enabled ? 'ON' : 'OFF'}</span>
                            <div
                              onClick={() => toggleFlowItem(item.id)}
                              style={{
                                width: '32px',
                                height: '18px',
                                background: item.enabled ? '#12c8d0' : '#333',
                                borderRadius: '999px',
                                position: 'relative',
                                cursor: 'pointer',
                                transition: 'background 0.2s'
                              }}
                            >
                              <div
                                style={{
                                  width: '14px',
                                  height: '14px',
                                  background: '#000',
                                  borderRadius: '50%',
                                  position: 'absolute',
                                  top: '2px',
                                  left: item.enabled ? '16px' : '2px',
                                  transition: 'left 0.2s'
                                }}
                              />
                            </div>
                          </div>

                          {/* Delete Button (Trash can icon) */}
                          <button
                            onClick={() => deleteFlowItem(item.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#666',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '6px',
                              borderRadius: '6px',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#ff4d4f';
                              e.currentTarget.style.background = 'rgba(255, 77, 79, 0.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#666';
                              e.currentTarget.style.background = 'none';
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Expandable Textarea Body */}
                      {isExpanded && (
                        <div style={{ marginTop: '12px', borderTop: '1px solid #1c1c1c', paddingTop: '12px' }}>
                          <textarea
                            value={item.body || ''}
                            onChange={(e) => updateFlowItem(item.id, { body: e.target.value })}
                            style={{
                              width: '100%',
                              minHeight: '120px',
                              background: '#141414',
                              border: '1px solid #222',
                              borderRadius: '8px',
                              padding: '12px',
                              color: '#e5e5e5',
                              fontFamily: 'inherit',
                              fontSize: '13px',
                              lineHeight: '1.5',
                              resize: 'vertical',
                              outline: 'none',
                              transition: 'border-color 0.2s'
                            }}
                            onFocus={(e) => e.currentTarget.style.borderColor = '#11c7cf'}
                            onBlur={(e) => e.currentTarget.style.borderColor = '#222'}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <button onClick={handleSave} disabled={isSaving} style={{ marginTop: '20px', padding: '10px 24px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '6px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '13px', opacity: isSaving ? 0.6 : 1 }}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </>
        )}

        {activeTab === 'config' && (
          <div
            style={{
              minHeight: '620px',
              padding: '8px 0 0',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { id: 'silence', title: 'Silence Handling', subtitle: 'What happens when a caller goes quiet or stops responding' },
                { id: 'endCall', title: 'End Call Rules', subtitle: 'Set conditions for when the assistant should hang up' },
                { id: 'transfer', title: 'Transfer & Routing', subtitle: 'Route callers to phone numbers based on conditions' },
                { id: 'response', title: 'Response Behavior', subtitle: 'Filler phrases and personality style' },
                { id: 'ambient', title: 'Ambient Sound', subtitle: 'Add background music or noise to calls' }
              ].map((section, i) => (
                <div key={section.id} style={{ background: '#0b0b0b', border: '1px solid #222', borderRadius: '14px', overflow: 'hidden' }}>
                  <div 
                    onClick={() => setExpandedConfigSection(expandedConfigSection === section.id ? null : section.id)}
                    style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#062d2f', color: '#12c8d0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' }}>
                        {i === 0 ? 'o' : i === 1 ? 'X' : i === 2 ? 'R' : i === 3 ? '=' : 'n'}
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '2px' }}>{section.title}</div>
                        <div style={{ fontSize: '13px', color: '#b7b7b7' }}>{section.subtitle}</div>
                      </div>
                    </div>
                    <div style={{ color: '#b3b3b3', fontSize: '14px', transform: expandedConfigSection === section.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</div>
                  </div>
                  
                  {expandedConfigSection === section.id && (
                    <div style={{ padding: '20px', borderTop: '1px solid #222', background: '#0f0f0f' }}>
                      {section.id === 'silence' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div>
                            <label style={{ display: 'block', color: '#fff', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Response Delay (seconds)</label>
                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>How long the assistant waits after the user stops speaking before replying.</div>
                            <input type="range" min="1" max="10" step="1" value={silenceTimeout} onChange={e => setSilenceTimeout(Number(e.target.value))} style={{ width: '100%', accentColor: '#12c8d0' }} />
                            <div style={{ textAlign: 'right', color: '#12c8d0', fontSize: '14px', fontWeight: '700' }}>{silenceTimeout}s</div>
                          </div>
                          <div style={{ height: '1px', background: '#222' }} />
                          <div>
                            <label style={{ display: 'block', color: '#fff', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Max Silence Before Hangup (seconds)</label>
                            <input type="number" value={maxSilenceBeforeHangup} onChange={e => setMaxSilenceBeforeHangup(Number(e.target.value))} style={{ width: '100%', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none' }} />
                          </div>
                        </div>
                      )}
                      
                      {section.id === 'endCall' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div>
                            <label style={{ display: 'block', color: '#fff', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Maximum Call Duration (minutes)</label>
                            <input type="number" min="1" max="120" value={maxDuration} onChange={e => setMaxDuration(Number(e.target.value))} style={{ width: '100%', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', color: '#fff', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>End Call Message</label>
                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>The message the agent will speak right before ending the call intentionally.</div>
                            <input type="text" value={endCallMessage} onChange={e => setEndCallMessage(e.target.value)} style={{ width: '100%', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none' }} />
                          </div>
                        </div>
                      )}

                      {section.id === 'transfer' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div>
                            <label style={{ display: 'block', color: '#fff', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Transfer Phone Number</label>
                            <input type="text" placeholder="+1234567890" value={transferNumber} onChange={e => setTransferNumber(e.target.value)} style={{ width: '100%', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', color: '#fff', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Transfer Condition Prompt</label>
                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>When should the agent initiate a hand-off? e.g., "When the user asks to speak to a human or gets angry"</div>
                            <textarea value={transferCondition} onChange={e => setTransferCondition(e.target.value)} style={{ width: '100%', minHeight: '80px', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', resize: 'vertical' }} />
                          </div>
                        </div>
                      )}

                      {section.id === 'response' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>Use Filler Words</div>
                              <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>Add "umm", "ahh" to make the agent sound more human.</div>
                            </div>
                            <div onClick={() => setFillerWords(!fillerWords)} style={{ width: '42px', height: '24px', background: fillerWords ? '#12c8d0' : '#333', borderRadius: '999px', position: 'relative', cursor: 'pointer' }}>
                              <div style={{ width: '20px', height: '20px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: fillerWords ? '20px' : '2px', transition: 'left 0.2s' }} />
                            </div>
                          </div>
                          <div style={{ height: '1px', background: '#222' }} />
                          <div>
                            <label style={{ display: 'block', color: '#fff', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Speaking Rate (Speed)</label>
                            <input type="range" min="0.5" max="2.0" step="0.1" value={speakingRate} onChange={e => setSpeakingRate(Number(e.target.value))} style={{ width: '100%', accentColor: '#12c8d0' }} />
                            <div style={{ textAlign: 'right', color: '#12c8d0', fontSize: '14px', fontWeight: '700' }}>{speakingRate}x</div>
                          </div>
                        </div>
                      )}

                      {section.id === 'ambient' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <label style={{ display: 'block', color: '#fff', fontSize: '14px', fontWeight: '600' }}>Select Background Noise</label>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                            {['None', 'Office', 'Call Center', 'Static', 'Cafe', 'Street'].map(sound => (
                              <div 
                                key={sound}
                                onClick={() => setAmbientSound(sound)}
                                style={{
                                  padding: '14px', 
                                  background: ambientSound === sound ? '#0a2e30' : '#1a1a1a', 
                                  border: `1px solid ${ambientSound === sound ? '#12c8d0' : '#333'}`, 
                                  borderRadius: '8px', 
                                  color: ambientSound === sound ? '#12c8d0' : '#fff',
                                  cursor: 'pointer',
                                  fontWeight: '600',
                                  textAlign: 'center',
                                  transition: 'all 0.2s'
                                }}
                              >
                                {sound}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={handleSave} disabled={isSaving} style={{ marginTop: '18px', alignSelf: 'flex-start', padding: '10px 24px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '8px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '13px', opacity: isSaving ? 0.6 : 1 }}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}

        {activeTab === 'kb' && (
          <div
            style={{
              minHeight: '620px',
              padding: '8px 0 0',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ background: '#072122', border: '1px solid #113638', borderRadius: '16px', padding: '28px 28px 36px', marginBottom: '22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: '#0b0b0b', border: '1px solid #2a2a2a', borderRadius: '16px', padding: '34px 30px 30px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '10px' }}>Upload PDFs</div>
                  <div style={{ fontSize: '14px', color: '#c5c5c5', marginBottom: '16px' }}>Add PDF files to your assistant's knowledge base</div>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    style={{ border: '2px dashed #323232', borderRadius: '14px', minHeight: '168px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '18px', cursor: 'pointer' }}
                  >
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf" multiple style={{ display: 'none' }} />
                    <div style={{ width: '54px', height: '54px', borderRadius: '18px', background: '#062d2f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#12c8d0', fontSize: '20px', marginBottom: '16px' }}>^</div>
                    <div style={{ fontSize: '17px', fontWeight: '700', color: '#fff', marginBottom: '10px' }}>Drag and drop a file here, or click to select</div>
                    <div style={{ fontSize: '13px', color: '#b7b7b7' }}>Supported formats: PDF (max 10MB)</div>
                  </div>
                  {kbFiles.length > 0 && (
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {kbFiles.map((file, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: '#111', padding: '8px 12px', borderRadius: '8px', border: '1px solid #222' }}>
                          <span style={{ fontSize: '13px', color: '#fff' }}>{file.name}</span>
                          <button onClick={(e) => { e.stopPropagation(); removeKbFile(i); }} style={{ background: 'none', border: 'none', color: '#ff6f6f', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ background: '#0b0b0b', border: '1px solid #2a2a2a', borderRadius: '16px', padding: '34px 30px 30px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '10px' }}>Website Knowledge Base</div>
                  <div style={{ fontSize: '14px', color: '#c5c5c5', marginBottom: '12px' }}>Add website content to your assistant's knowledge base</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: '#fff' }}>Website URL</label>
                    <InfoIcon />
                  </div>
                  <input
                    type="text"
                    value={kbUrlInput}
                    onChange={(e) => setKbUrlInput(e.target.value)}
                    placeholder="https://example.com/"
                    style={{
                      width: '100%',
                      height: '44px',
                      padding: '0 14px',
                      background: '#171717',
                      border: '1px solid #2e2e2e',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '14px',
                      outline: 'none',
                      marginBottom: '20px'
                    }}
                  />
                  <button onClick={handleAddKbUrl} style={{ width: '100%', height: '46px', background: '#0f6f73', border: 'none', borderRadius: '10px', color: '#071416', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginBottom: kbUrls.length > 0 ? '16px' : '0' }}>
                    Add to Knowledge Base
                  </button>
                  {kbUrls.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {kbUrls.map((url, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: '#111', padding: '8px 12px', borderRadius: '8px', border: '1px solid #222' }}>
                          <span style={{ fontSize: '13px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
                          <button onClick={() => removeKbUrl(url)} style={{ background: 'none', border: 'none', color: '#ff6f6f', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ background: '#281509', border: '1px solid #b65912', borderRadius: '14px', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#ffd95f', marginBottom: '6px' }}>Low Storage Space Warning</div>
                <div style={{ fontSize: '14px', color: '#ffd066' }}>You only have {Math.max(0, 5.0 - kbFiles.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024)).toFixed(1)} MB of knowledge base storage remaining. Consider upgrading your account to avoid upload restrictions.</div>
              </div>
              <button style={{ padding: '10px 18px', background: '#ff6f6f', border: 'none', borderRadius: '10px', color: '#1f0d0d', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                Upgrade
              </button>
            </div>
          </div>
        )}

        {activeTab === 'integrations' && (() => {
          const integrations = [
            {
              provider: 'google_calendar',
              name: 'Google Calendar',
              mode: 'During Call',
              description: 'Read calendars, create events, and automate scheduling reminders.',
              external: true
            },
            {
              provider: 'google_meet',
              name: 'Google Meet',
              mode: 'During Call',
              description: 'Automatically generate and share Google Meet links for scheduled meetings.',
              external: true
            },
            {
              provider: 'google_sheets',
              name: 'Google Sheets',
              mode: 'Post Call',
              description: 'Append AI call logs and reporting rows into spreadsheets in real time.',
              external: true
            },
            {
              provider: 'twilio',
              name: 'Twilio',
              mode: 'During Call',
              description: 'Connect Twilio numbers and SMS capabilities for seamless voice and text interactions.',
              external: true
            },
            {
              provider: 'cal',
              name: 'Cal.com',
              mode: 'During Call',
              description: 'Allow your bot to schedule meetings and sync booking events.',
              external: true
            },
            {
              provider: 'salesforce',
              name: 'Salesforce',
              mode: 'Post Call',
              description: 'Push transcripts, notes, leads, and opportunities back to your CRM.',
              external: true
            },
            {
              provider: 'hubspot',
              name: 'HubSpot',
              mode: 'Post Call',
              description: 'Sync contacts, notes, tickets, and follow-up workflows automatically.',
              external: true
            }
          ];

          return (
            <div
              style={{
                background: 'linear-gradient(180deg, #111 0%, #0f0f0f 100%)',
                border: '1px solid #222',
                borderRadius: '14px',
                padding: '22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px'
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '0.02em', color: '#f1f1f1' }}>Integrations</div>

              <div
                style={{
                  background: '#111',
                  border: '1px solid #222',
                  borderRadius: '12px',
                  padding: '18px 20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#f5f5f5', marginBottom: '4px' }}>Web Search</div>
                    <div style={{ fontSize: '13px', color: '#8d8d8d' }}>Allow your bot to search the web for information</div>
                  </div>

                  <div
                    onClick={() => setDynamicEnabled(!dynamicEnabled)}
                    style={{
                      width: '52px',
                      height: '30px',
                      background: dynamicEnabled ? 'linear-gradient(90deg, #00b894, #00caa1)' : '#232323',
                      border: dynamicEnabled ? '1px solid #00d2a8' : '1px solid #333',
                      borderRadius: '999px',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'all 0.25s ease',
                      boxShadow: dynamicEnabled ? '0 0 0 3px rgba(0, 212, 168, 0.14)' : 'none',
                      flexShrink: 0
                    }}
                  >
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        background: '#fff',
                        borderRadius: '50%',
                        position: 'absolute',
                        top: '2px',
                        left: dynamicEnabled ? '26px' : '2px',
                        transition: 'left 0.25s ease'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: '#111',
                  border: '1px solid #222',
                  borderRadius: '12px',
                  padding: '18px 20px'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#f5f5f5', marginBottom: '12px' }}>Integration</div>
                <div
                  style={{
                    border: '1px dashed #333',
                    borderRadius: '12px',
                    minHeight: '120px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#0f0f0f',
                    color: '#8f8f8f',
                    fontSize: '13px',
                    textAlign: 'center',
                    padding: '18px'
                  }}
                >
                  All available integrations are already attached.
                </div>
              </div>

              <div
                style={{
                  background: '#111',
                  border: '1px solid #222',
                  borderRadius: '12px',
                  padding: '18px 20px'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#f5f5f5', marginBottom: '14px' }}>Connect New Integrations</div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
                  {integrations.map((integration) => {
                    const isDuringCall = integration.mode === 'During Call';

                    return (
                      <div
                        key={integration.name}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#3c3c3c';
                          e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.05), 0 10px 26px rgba(0,0,0,0.28)';
                          e.currentTarget.style.background = '#1b1b1b';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#2a2a2a';
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.background = '#171717';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                        style={{
                          background: '#171717',
                          border: '1px solid #2a2a2a',
                          borderRadius: '12px',
                          minHeight: '220px',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          transition: 'all 0.25s ease'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                            <div style={{ fontSize: '15px', fontWeight: '700', color: '#fafafa' }}>{integration.name}</div>
                            {integration.external && <span style={{ fontSize: '12px', color: '#8e8e8e' }}>-&gt;</span>}
                          </div>

                          <div style={{ marginBottom: '12px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '4px 10px',
                                borderRadius: '999px',
                                fontSize: '11px',
                                fontWeight: '700',
                                letterSpacing: '0.02em',
                                border: isDuringCall ? '1px solid #1f7a49' : '1px solid #215f9c',
                                color: isDuringCall ? '#78f5ad' : '#7fbfff',
                                background: isDuringCall ? 'rgba(33, 111, 67, 0.3)' : 'rgba(36, 91, 155, 0.3)'
                              }}
                            >
                              {integration.mode}
                            </span>
                          </div>

                          <div style={{ color: '#9b9b9b', fontSize: '13px', lineHeight: 1.5 }}>{integration.description}</div>
                        </div>

                        <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #252525', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '12px', color: '#7d7d7d' }}>Ready to connect</span>
                          <button
                            onClick={async () => {
                              try {
                                const callbackUrl = `${window.location.origin}/api/v1/integrations/${integration.provider}/callback`;
                                const { authorizationUrl } = await integrationsApi.connect(integration.provider, callbackUrl);
                                window.location.href = authorizationUrl;
                              } catch (error) {
                                toast.error(error instanceof Error ? error.message : 'Failed to begin OAuth');
                              }
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#2b2b2b';
                              e.currentTarget.style.borderColor = '#4a4a4a';
                              e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '#1f1f1f';
                              e.currentTarget.style.borderColor = '#3a3a3a';
                              e.currentTarget.style.color = '#f3f3f3';
                            }}
                            style={{
                              padding: '8px 14px',
                              background: '#1f1f1f',
                              border: '1px solid #3a3a3a',
                              borderRadius: '10px',
                              color: '#f3f3f3',
                              fontSize: '12px',
                              fontWeight: '700',
                              letterSpacing: '0.01em',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            Connect
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {activeTab === 'postcall' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>

              <button
                onClick={addPostCallConfig}
                style={{
                  padding: '0 18px',
                  height: '38px',
                  background: 'transparent',
                  border: '1px solid #333333',
                  borderRadius: '10px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600'
                }}
              >
                + Add Configuration
              </button>
            </div>

            {postCallConfigs.map((config) => (
              <div
                key={config.id}
                style={{
                  background: '#171717',
                  border: '1px solid #2a2a2a',
                  borderRadius: '14px',
                  padding: '30px 30px 24px',
                  marginTop: '2px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '32px' }}>
                  <div>
                    <div style={{ fontSize: '17px', lineHeight: 1.2, fontWeight: '700', color: '#ffffff', marginBottom: '24px' }}>Delivery Method</div>
                    <select
                      value={config.deliveryMethod}
                      onChange={(e) => updatePostCallConfig(config.id, { deliveryMethod: e.target.value })}
                      style={{
                        width: '310px',
                        height: '42px',
                        padding: '0 18px',
                        background: '#181818',
                        border: '1px solid #2d2d2d',
                        borderRadius: '9px',
                        color: config.deliveryMethod ? '#ffffff' : '#b3b3b3',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    >
                      <option value="">Select delivery method</option>
                      {POST_CALL_DELIVERY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => removePostCallConfig(config.id)}
                    disabled={postCallConfigs.length === 1}
                    style={{
                      padding: '0 20px',
                      height: '44px',
                      background: '#0e0e0e',
                      border: '1px solid #2a2a2a',
                      borderRadius: '9px',
                      color: postCallConfigs.length === 1 ? '#666666' : '#ff4d4f',
                      cursor: postCallConfigs.length === 1 ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    Remove
                  </button>
                </div>

                <div style={{ marginBottom: '30px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>Trigger based on Call Status</div>
                    <div style={{ width: '18px', height: '18px', borderRadius: '999px', border: '1px solid #585858', color: '#a6a6a6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600' }}>i</div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {POST_CALL_TRIGGER_OPTIONS.map((status) => {
                      const active = config.triggerStatuses.includes(status);
                      return (
                        <button
                          key={status}
                          onClick={() => togglePostCallStatus(config.id, status)}
                          style={{
                            height: '32px',
                            padding: '0 14px',
                            borderRadius: '999px',
                            border: active ? '1px solid #0bbfcb' : '1px solid #434343',
                            background: active ? '#0bbfcb' : 'transparent',
                            color: active ? '#071316' : '#b5b5b5',
                            fontSize: '13px',
                            fontWeight: '500',
                            cursor: 'pointer'
                          }}
                        >
                          {status}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: '30px' }}>
                  <div style={{ fontSize: '17px', fontWeight: '700', color: '#ffffff', marginBottom: '18px' }}>Including</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 14px' }}>
                    {[
                      {
                        key: 'includeCallSummary',
                        title: 'Call Summary',
                        description: 'A brief overview of the conversation including key points and outcomes'
                      },
                      {
                        key: 'includeFullConversation',
                        title: 'Full Conversation',
                        description: 'Complete transcript of the entire conversation with timestamps'
                      },
                      {
                        key: 'includeSentimentAnalysis',
                        title: 'Sentiment Analysis',
                        description: 'Analysis of customer mood and emotional responses throughout the call'
                      },
                      {
                        key: 'includeExtractedInformation',
                        title: 'Extracted Information',
                        description: 'Key data points extracted from the conversation'
                      }
                    ].map((item) => {
                      const checked = config[item.key as keyof PostCallConfig] as boolean;
                      return (
                        <button
                          key={item.key}
                          onClick={() => updatePostCallConfig(config.id, { [item.key]: !checked } as Partial<PostCallConfig>)}
                          style={{
                            textAlign: 'left',
                            minHeight: '86px',
                            padding: '18px 20px 18px 52px',
                            background: '#1d1d1d',
                            border: checked ? '1px solid #087f88' : '1px solid #2d2d2d',
                            borderRadius: '14px',
                            position: 'relative',
                            cursor: 'pointer',
                            boxShadow: checked ? 'inset 0 0 0 1px rgba(11, 191, 203, 0.45)' : 'none'
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              left: '16px',
                              top: '18px',
                              width: '22px',
                              height: '22px',
                              borderRadius: '7px',
                              background: checked ? '#0bbfcb' : '#111111',
                              border: checked ? '1px solid #0bbfcb' : '1px solid #404040',
                              color: checked ? '#041012' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '13px',
                              fontWeight: '700'
                            }}
                          >
                            ON
                          </div>
                          <div style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', marginBottom: '6px', lineHeight: 1.2 }}>{item.title}</div>
                          <div style={{ fontSize: '13px', color: '#a9a9a9', lineHeight: 1.45 }}>{item.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '17px', fontWeight: '700', color: '#ffffff', marginBottom: '6px' }}>Extracted Variables</div>
                  <div style={{ fontSize: '13px', color: '#9a9a9a', marginBottom: '20px', lineHeight: 1.45 }}>
                    Specify what variables you want to extract from the conversation. For each variable, provide a name and a description of how to extract it.
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {config.extractedVariables.map((variable) => (
                      <div
                        key={variable.id}
                        style={{
                          background: '#1b1b1b',
                          border: '1px solid #2b2b2b',
                          borderRadius: '13px',
                          padding: '20px',
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 64px',
                          gap: '14px',
                          alignItems: 'center'
                        }}
                      >
                        <input
                          type="text"
                          value={variable.key}
                          onChange={(e) => updateExtractedVariable(config.id, variable.id, 'key', e.target.value)}
                          placeholder="variable_name"
                          style={{
                            width: '100%',
                            height: '44px',
                            padding: '0 16px',
                            background: '#202020',
                            border: '1px solid #2d2d2d',
                            borderRadius: '8px',
                            color: '#ffffff',
                            fontSize: '14px',
                            outline: 'none'
                          }}
                        />
                        <input
                          type="text"
                          value={variable.description}
                          onChange={(e) => updateExtractedVariable(config.id, variable.id, 'description', e.target.value)}
                          placeholder="Description of how the value should be extracted"
                          style={{
                            width: '100%',
                            height: '44px',
                            padding: '0 16px',
                            background: '#202020',
                            border: '1px solid #2d2d2d',
                            borderRadius: '8px',
                            color: '#ffffff',
                            fontSize: '14px',
                            outline: 'none'
                          }}
                        />
                        <button
                          onClick={() => removeExtractedVariable(config.id, variable.id)}
                          style={{
                            width: '60px',
                            height: '44px',
                            background: '#0f0f0f',
                            border: '1px solid #2a2a2a',
                            borderRadius: '9px',
                            color: '#ff4d4f',
                            fontSize: '18px',
                            cursor: 'pointer'
                          }}
                        >
                          X
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => addExtractedVariable(config.id)}
                    style={{
                      marginTop: '14px',
                      padding: '0 16px',
                      height: '40px',
                      background: 'transparent',
                      border: '1px solid #0bbfcb',
                      borderRadius: '9px',
                      color: '#0bbfcb',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    + Add Variable
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'chat' && (
          <div style={{ height: '600px', marginBottom: '20px' }}>
            <ChatComponent 
              agentId={agentId ?? 'demo'}
              selectedLanguages={selectedLanguages.length > 0 ? selectedLanguages : ['English (Indian)']}
              welcomeMessage={welcomeMessage}
            />
          </div>
        )}

        {activeTab === 'calls' && (
          <div
            style={{
              minHeight: '620px',
              padding: '8px 0 0',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '18px',
                marginBottom: '54px',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#ffffff', paddingLeft: '20px' }}>Recent Calls</div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#cbcbcb', fontSize: '13px', paddingRight: '2px' }}>
                  <span>Filters</span>
                  <span
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '999px',
                      border: '1px solid #565656',
                      color: '#9c9c9c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}
                  >
                    ?
                  </span>
                </div>

                {['All directions', 'All statuses', 'All durations'].map((label) => (
                  <select
                    key={label}
                    defaultValue={label}
                    style={{
                      width: '216px',
                      height: '44px',
                      padding: '0 16px',
                      background: '#111111',
                      border: '1px solid #2a2a2a',
                      borderRadius: '10px',
                      color: '#ffffff',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  >
                    <option>{label}</option>
                  </select>
                ))}

                <button
                  style={{
                    height: '44px',
                    padding: '0 18px',
                    background: '#101010',
                    border: '1px solid #2a2a2a',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Refresh
                </button>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                paddingBottom: '140px'
              }}
            >
              <div style={{ textAlign: 'center', maxWidth: '420px' }}>
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    margin: '0 auto 22px',
                    borderRadius: '999px',
                    border: '1px solid #303030',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#8c8c8c',
                    fontSize: '28px'
                  }}
                >
                  Call
                </div>
                <div style={{ fontSize: '18px', lineHeight: 1.2, fontWeight: '700', color: '#ffffff', marginBottom: '10px' }}>No call history</div>
                <div style={{ fontSize: '15px', lineHeight: 1.6, color: '#a0a0a0' }}>
                  You haven't made any calls with this assistant yet.
                  <br />
                  Start a call to see your history here.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
          </div>
        </div>

        {/* Right Sidebar (AI Assistant) */}
        {showAskAIModal && (
          <AIAssistantSidebar 
            onClose={() => setShowAskAIModal(false)} 
            input={askAIInput}
            setInput={setAskAIInput}
            response={askAIResponse}
            isLoading={isAskAILoading}
            onSubmit={handleAskAI}
          />
        )}
      </div>

      {/* Chat Modal */}
      {showChatModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1a1a1a', borderRadius: '12px', padding: 0, maxWidth: '500px', width: '90%', height: '600px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: '#222', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#00bcd4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 'bold' }}>{agentName.charAt(0)}</div>
                <span style={{ fontWeight: '600', fontSize: '14px' }}>Test Chat: {agentName}</span>
              </div>
              <button onClick={() => setShowChatModal(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '20px' }}>X</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ alignSelf: 'flex-start', background: '#333', padding: '10px 14px', borderRadius: '12px 12px 12px 0', fontSize: '13px', maxWidth: '85%' }}>
                {welcomeMessage}
              </div>
              {chatMessages.map((msg, i) => (
                <div key={i} style={{ 
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', 
                  background: msg.role === 'user' ? '#00bcd4' : '#333', 
                  color: msg.role === 'user' ? '#000' : '#fff',
                  padding: '10px 14px', 
                  borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0', 
                  fontSize: '13px', 
                  maxWidth: '85%' 
                }}>
                  {msg.content}
                </div>
              ))}
              {isTyping && (
                <div style={{ alignSelf: 'flex-start', background: '#333', padding: '10px 14px', borderRadius: '12px 12px 12px 0', fontSize: '13px' }}>
                  Typing...
                </div>
              )}
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid #333', background: '#1a1a1a' }}>
              <form onSubmit={(e) => { e.preventDefault(); handleTestChat(); }} style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  value={userMessage} 
                  onChange={(e) => setUserMessage(e.target.value)} 
                  placeholder="Type your message..." 
                  style={{ flex: 1, background: '#0f0f0f', border: '1px solid #333', borderRadius: '8px', padding: '10px 14px', color: '#fff', fontSize: '13px' }}
                />
                <button type="submit" disabled={isTyping || !userMessage.trim()} style={{ background: '#00bcd4', color: '#000', border: 'none', borderRadius: '8px', padding: '0 16px', fontWeight: 'bold', cursor: 'pointer', opacity: (isTyping || !userMessage.trim()) ? 0.6 : 1 }}>Send</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
