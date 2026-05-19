import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AgentConfig, getAgent, saveAgent } from '../lib/agentStore';
import { whapi } from '../lib/whapi';
import ChatComponent from '../components/ChatComponent';

interface FlowItem {
  id: string;
  title: string;
  enabled: boolean;
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

  // Form state
  const [welcomeMessage, setWelcomeMessage] = useState('Hello, I am Luna, your Moon Information Assistant. What would you like to know about the Moon?');
  const [maxDuration, setMaxDuration] = useState(30);
  const [silenceTimeout, setSilenceTimeout] = useState(5);
  const [dynamicEnabled, setDynamicEnabled] = useState(true);
  const [interruptibleEnabled, setInterruptibleEnabled] = useState(true);
  const [flowItems, setFlowItems] = useState<FlowItem[]>([
    { id: '1', title: 'Agent Identity & Purpose', enabled: true },
    { id: '2', title: 'General Moon Facts Flow', enabled: true }
  ]);

  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [voice, setVoice] = useState('Google - Aoede (female)');
  const [aiModel, setAiModel] = useState('GPT-4.1-Mini');
  const [transcription, setTranscription] = useState('Azure');

  // Modal states
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
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
  const [agentName, setAgentName] = useState('Moon Information Agent');
  const [agentNotFound, setAgentNotFound] = useState(false);
  const [postCallConfigs, setPostCallConfigs] = useState<PostCallConfig[]>([createDefaultPostCallConfig()]);
  
  // Chat test state
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: string, content: string }[]>([]);
  const [userMessage, setUserMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);


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
          setDynamicEnabled(agent.dynamicEnabled ?? true);
          setInterruptibleEnabled(agent.interruptibleEnabled ?? true);
          setFlowItems((agent.flowItems as any) || [
            { id: '1', title: 'Agent Identity & Purpose', enabled: true },
            { id: '2', title: 'General Moon Facts Flow', enabled: true }
          ]);
          setPostCallConfigs(savedPostCallConfigs?.length ? savedPostCallConfigs : [createDefaultPostCallConfig()]);
          if (agent.voice?.toLowerCase().startsWith('google')) {
            setVoiceProvider('google');
          } else if (agent.voice?.toLowerCase().startsWith('eleven')) {
            setVoiceProvider('elevenlabs');
          } else if (agent.voice?.toLowerCase().startsWith('cartesia')) {
            setVoiceProvider('cartesia');
          }
          return;
        }
      } catch (err) {
        console.error('Failed to fetch from backend, trying local storage', err);
      }

      // Fallback to local storage
      const localAgent = getAgent(agentId);
      if (!localAgent) {
        setAgentNotFound(true);
        return;
      }
      // ... (existing set state logic)
      setAgentName(localAgent.name);
      setWelcomeMessage(localAgent.welcomeMessage);
      setSelectedLanguages(localAgent.selectedLanguages || ['English (Indian)']);
      setVoice(localAgent.voice || 'Google - Aoede (female)');
      setAiModel(localAgent.aiModel || 'GPT-4.1-Mini');
      setTranscription(localAgent.transcription || 'Azure');
      setPostCallConfigs((localAgent as any).postCallConfigs?.length ? (localAgent as any).postCallConfigs : [createDefaultPostCallConfig()]);
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
      dynamicEnabled,
      interruptibleEnabled,
      postCallConfigs
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
    const newItem: FlowItem = {
      id: Date.now().toString(),
      title: 'New Flow Item',
      enabled: true
    };
    setFlowItems([...flowItems, newItem]);
  };

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages(prev =>
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  const handleVoiceSelect = (voiceName: string) => {
    const provider = voiceProvider.charAt(0).toUpperCase() + voiceProvider.slice(1);
    setVoice(`${provider} - ${voiceName}`);
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
      const response = await whapi.post<{ message: string }>('/llm/generate', {
        agentId,
        message: userMessage,
        systemPrompt: `${welcomeMessage}\n\nFlow:\n${flowItems.filter(f => f.enabled).map(f => f.title).join('\n')}`,
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

      {/* Voice Configuration Modal */}
      {showVoiceModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '30px', maxWidth: '900px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Voice Configuration</h2>
              <button onClick={() => setShowVoiceModal(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}>X</button>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '8px' }}>
              {Object.keys(VOICES_BY_PROVIDER).map(provider => (
                <button
                  key={provider}
                  onClick={() => setVoiceProvider(provider)}
                  style={{
                    padding: '8px 16px',
                    background: voiceProvider === provider ? '#00bcd4' : '#0f0f0f',
                    color: voiceProvider === provider ? '#000' : '#fff',
                    border: voiceProvider === provider ? 'none' : '1px solid #333',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {provider.charAt(0).toUpperCase() + provider.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '20px' }}>
              {VOICES_BY_PROVIDER[voiceProvider as keyof typeof VOICES_BY_PROVIDER].map(v => (
                <div key={v.id} onClick={() => handleVoiceSelect(v.name)} style={{ background: '#0f0f0f', border: voice.includes(v.name) ? '2px solid #00bcd4' : '1px solid #333', borderRadius: '8px', padding: '16px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '500' }}>{v.name}</div>
                      <div style={{ fontSize: '11px', color: '#999' }}>{voiceProvider.charAt(0).toUpperCase() + voiceProvider.slice(1)}</div>
                    </div>
                    <button style={{ background: 'none', border: 'none', color: '#00bcd4', cursor: 'pointer', fontSize: '18px' }}>{'>'}</button>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {v.accents.map(accent => (
                      <span key={accent} style={{ fontSize: '11px', background: '#1a1a1a', padding: '4px 8px', borderRadius: '4px', color: '#999' }}>{accent}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowVoiceModal(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #333', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={() => setShowVoiceModal(false)} style={{ padding: '10px 20px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Done</button>
            </div>
          </div>
        </div>
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
          <button onClick={() => alert('Ask AI')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Ask AI</button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#fff', fontWeight: '500' }}>Test with</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#111', padding: '4px', borderRadius: '8px', border: '1px solid #222' }}>
              <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Chat</button>
              <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#0f0f0f', color: '#00bcd4', border: '1px solid #00bcd4', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Web Call</button>
              <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#0f0f0f', color: '#00bcd4', border: '1px solid #00bcd4', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Phone Call</button>
            </div>
          </div>

          <button onClick={handleSave} disabled={isSaving} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '6px', cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '500', opacity: isSaving ? 0.6 : 1 }}>
            Deploy <span>v</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', background: '#111', border: '1px solid #222', borderRadius: '20px', padding: '2px' }}>
            <div style={{ padding: '4px 12px', background: '#333', color: '#fff', borderRadius: '18px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>UI</div>
            <div style={{ padding: '4px 12px', color: '#666', fontSize: '11px', fontWeight: '500', cursor: 'pointer' }}>Code</div>
          </div>
        </div>

      </div>

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
                  <span style={{ color: '#11c7cf', marginRight: '10px', fontWeight: '700' }}>=</span> Conversational Flow <InfoIcon />
                </div>
                <button onClick={addFlowItem} style={{ padding: '10px 18px', background: 'transparent', border: '1px solid #2d2d2d', borderRadius: '10px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>+ Add Section</button>
              </div>
              <div style={{ padding: '16px 30px 20px' }}>
                {flowItems.map((item, index) => (
                  <div key={item.id} style={{ background: '#101010', border: '1px solid #262626', borderRadius: '12px', padding: '12px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                      <span style={{ color: '#fff', fontSize: '14px', cursor: 'pointer' }}>v</span>
                      <span style={{ color: '#666', fontSize: '16px', letterSpacing: '-2px', cursor: 'grab' }}>::</span>
                      <span style={{ fontSize: '16px', fontWeight: '700', width: '22px', color: '#fff' }}>{index + 1}.</span>
                      <div style={{ flex: 1, minHeight: '42px', border: '1px solid #2f2f2f', borderRadius: '10px', display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: '14px', fontWeight: '700', color: '#fff' }}>{item.title}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginLeft: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#fff', fontWeight: '700', background: '#171717', border: '1px solid #2c2c2c', borderRadius: '10px', padding: '0 10px', height: '36px' }}>
                        <span>{item.enabled ? 'ON' : 'OFF'}</span>
                        <div onClick={() => toggleFlowItem(item.id)} style={{ width: '34px', height: '20px', background: item.enabled ? '#12c8d0' : '#333', borderRadius: '999px', position: 'relative', cursor: 'pointer' }}>
                          <div style={{ width: '16px', height: '16px', background: '#000', borderRadius: '50%', position: 'absolute', top: '2px', left: item.enabled ? '16px' : '2px', transition: 'left 0.2s' }} />
                        </div>
                      </div>
                      <button onClick={() => deleteFlowItem(item.id)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '16px', padding: 0 }}>X</button>
                    </div>
                  </div>
                ))}
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
                { title: 'Silence Handling', subtitle: 'What happens when a caller goes quiet or stops responding' },
                { title: 'End Call Rules', subtitle: 'Set conditions for when the assistant should hang up' },
                { title: 'Transfer & Routing', subtitle: 'Route callers to phone numbers based on conditions' },
                { title: 'Response Behavior', subtitle: 'Filler phrases and personality style' },
                { title: 'Ambient Sound', subtitle: 'Add background music or noise to calls' }
              ].map((section, i) => (
                <div key={section.title} style={{ background: '#0b0b0b', border: '1px solid #222', borderRadius: '14px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#062d2f', color: '#12c8d0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' }}>
                      {i === 0 ? 'o' : i === 1 ? 'X' : i === 2 ? 'R' : i === 3 ? '=' : 'n'}
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '2px' }}>{section.title}</div>
                      <div style={{ fontSize: '13px', color: '#b7b7b7' }}>{section.subtitle}</div>
                    </div>
                  </div>
                  <div style={{ color: '#b3b3b3', fontSize: '16px' }}>v</div>
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
                  <div style={{ border: '2px dashed #323232', borderRadius: '14px', minHeight: '168px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '18px' }}>
                    <div style={{ width: '54px', height: '54px', borderRadius: '18px', background: '#062d2f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#12c8d0', fontSize: '20px', marginBottom: '16px' }}>^</div>
                    <div style={{ fontSize: '17px', fontWeight: '700', color: '#fff', marginBottom: '10px' }}>Drag and drop a file here, or click to select</div>
                    <div style={{ fontSize: '13px', color: '#b7b7b7' }}>Supported formats: PDF (max 10MB)</div>
                  </div>
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
                  <button style={{ width: '100%', height: '46px', background: '#0f6f73', border: 'none', borderRadius: '10px', color: '#071416', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
                    Add to Knowledge Base
                  </button>
                </div>
              </div>
            </div>

            <div style={{ background: '#281509', border: '1px solid #b65912', borderRadius: '14px', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#ffd95f', marginBottom: '6px' }}>Low Storage Space Warning</div>
                <div style={{ fontSize: '14px', color: '#ffd066' }}>You only have 5.0 MB of knowledge base storage remaining. Consider upgrading your account to avoid upload restrictions.</div>
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
              name: 'Cal.com',
              mode: 'Post Call',
              description: 'Auto-book meetings and sync call outcomes with your Cal.com scheduling workflows.',
              external: true
            },
            {
              name: 'Calendly',
              mode: 'Post Call',
              description: 'Create follow-up booking links and route prospects to the right calendar flow instantly.',
              external: true
            },
            {
              name: 'Custom API',
              mode: 'During Call',
              description: 'Connect your private endpoints to fetch records, validate users, and trigger actions live.',
              external: false
            },
            {
              name: 'Salesforce',
              mode: 'Post Call',
              description: 'Push transcripts, tags, and qualification notes to Salesforce with mapped field sync.',
              external: false
            },
            {
              name: 'Google Calendar',
              mode: 'Post Call',
              description: 'Create events automatically from qualified calls and attach meeting metadata.',
              external: true
            },
            {
              name: 'Google Sheets',
              mode: 'Post Call',
              description: 'Append structured call records to Sheets for reporting, QA, and team operations.',
              external: true
            },
            {
              name: 'Slack',
              mode: 'During Call',
              description: 'Notify channels about active calls and surface escalations to your sales or support teams.',
              external: false
            },
            {
              name: 'HubSpot',
              mode: 'Post Call',
              description: 'Update contacts, timeline notes, and lifecycle stages directly after every conversation.',
              external: false
            },
            {
              name: 'Genesys',
              mode: 'During Call',
              description: 'Route live call context into Genesys workflows for smarter agent assist and escalation.',
              external: true
            },
            {
              name: 'WhatsApp Cloud',
              mode: 'Post Call',
              description: 'Send follow-up messages, summaries, and next steps through WhatsApp Cloud API.',
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
                            onClick={() => alert(`${integration.name} integration coming soon`) }
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
