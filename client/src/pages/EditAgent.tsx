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
  const [saveMessage, setSaveMessage] = useState('');

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
          setAgentName(agent.name);
          setWelcomeMessage(agent.welcomeMessage);
          setSelectedLanguages(agent.languages || agent.selectedLanguages || ['English (Indian)']);
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
    };

    let savedRemotely = false;
    try {
      await whapi.put(`/agents/${agentId}`, agentData);
      savedRemotely = true;
    } catch (err) {
      console.error('Failed to save to backend', err);
      savedRemotely = false;
    }

    // Still save to local storage as backup/sync
    saveAgent({ ...agentData, id: agentId!, selectedLanguages } as any);
    
    setSaveMessage(savedRemotely ? '✅ Saved successfully!' : '✅ Saved locally');
    setTimeout(() => setSaveMessage(''), 3000);
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
      setChatMessages([...newMessages, { role: 'assistant', content: '⚠️ Error: Failed to get response from AI.' }]);
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
              <button onClick={() => setShowLanguageModal(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}>✕</button>
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
              <button onClick={() => setShowVoiceModal(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}>✕</button>
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
                    <button style={{ background: 'none', border: 'none', color: '#00bcd4', cursor: 'pointer', fontSize: '18px' }}>▶</button>
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
              <button onClick={() => setShowModelModal(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}>✕</button>
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
              <button onClick={() => setShowTranscriptionModal(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}>✕</button>
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
                    <span style={{ fontSize: '10px', color: '#999', transform: isSttProviderDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
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
                          {sttProvider === provider && <span style={{ color: '#fff', fontSize: '12px' }}>✓</span>}
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
                  <span style={{ fontSize: '10px', color: '#999', transform: sttAdvancedSettingsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
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
                    <span style={{ fontSize: '10px', color: '#999' }}>▼</span>
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
                    <span style={{ fontSize: '10px', color: '#999' }}>▼</span>
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
        <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '18px', padding: 0 }}>←</button>
        
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
          <span style={{ fontSize: '8px' }}>●</span> Incoming
        </div>

        <div style={{ fontSize: '12px', color: '#888' }}>Cost/min: $0.115</div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => alert('Ask AI')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>✨ Ask AI</button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#fff', fontWeight: '500' }}>Test with</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#111', padding: '4px', borderRadius: '8px', border: '1px solid #222' }}>
              <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>💬 Chat</button>
              <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#0f0f0f', color: '#00bcd4', border: '1px solid #00bcd4', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>📞 Web Call</button>
              <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#0f0f0f', color: '#00bcd4', border: '1px solid #00bcd4', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>☎️ Phone Call</button>
            </div>
          </div>

          <button onClick={handleSave} disabled={isSaving} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '6px', cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '500', opacity: isSaving ? 0.6 : 1 }}>
            🚀 Deploy <span>▼</span>
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
            { id: 'details', label: '🤖 Assistant Details' },
            { id: 'config', label: '📞 Call Configuration' },
            { id: 'kb', label: '📚 Knowledge Base' },
            { id: 'integrations', label: '🔗 Integrations' },
            { id: 'postcall', label: '📤 Post-Call' },
            { id: 'chat', label: '💬 Chat Test' },
            { id: 'calls', label: '📞 Recent Calls' }
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
          <span style={{ color: '#666', marginRight: '8px', fontSize: '14px' }}>🔍</span>
          <input 
            type="text" 
            placeholder="Search or jump to..." 
            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', outline: 'none', width: '100%' }}
          />
          <div style={{ background: '#222', color: '#999', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>⌘K</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '30px 24px' }}>
        {activeTab === 'details' && (
          <>
            {/* Assistant Settings */}
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
              Assistant Settings <InfoIcon />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '30px' }}>
              {[
                { icon: '🌐', label: 'Languages', value: selectedLanguages.length > 0 ? selectedLanguages[0] + (selectedLanguages.length > 1 ? ` +${selectedLanguages.length - 1}` : '') : 'No languages selected', onClick: () => setShowLanguageModal(true) },
                { icon: '🎙️', label: 'Voice (TTS)', value: voice, onClick: () => setShowVoiceModal(true) },
                { icon: '🧠', label: 'AI Model (LLM)', value: aiModel, onClick: () => setShowModelModal(true) },
                { icon: '🎧', label: 'Transcription (STT)', value: transcription, onClick: () => setShowTranscriptionModal(true) }
              ].map((item, i) => (
                <div key={i} onClick={item.onClick} style={{ background: '#0a1414', border: '1px solid #142828', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#0d1a1a'} onMouseLeave={(e) => e.currentTarget.style.background = '#0a1414'}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#0f1f1f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', border: '1px solid #1a3333' }}>
                    <span style={{ filter: 'sepia(1) hue-rotate(140deg) saturate(3) opacity(0.8)' }}>{item.icon}</span>
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '13px', color: '#fff', fontWeight: '500', marginBottom: '2px' }}>{item.label}</div>
                    <div style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.value}</div>
                  </div>
                  <InfoIcon />
                </div>
              ))}
            </div>

            {/* Welcome Message */}
            <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '0', marginBottom: '30px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #111' }}>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '14px', fontWeight: '600' }}>
                  <span style={{ color: '#00bcd4', marginRight: '8px' }}>💬</span> Welcome Message <InfoIcon />
                </div>
                <div style={{ display: 'flex', gap: '20px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#999' }}>
                    <span>Dynamic</span>
                    <div onClick={() => setDynamicEnabled(!dynamicEnabled)} style={{ width: '36px', height: '20px', background: dynamicEnabled ? '#00bcd4' : '#333', borderRadius: '10px', position: 'relative', cursor: 'pointer' }}>
                      <div style={{ width: '16px', height: '16px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: dynamicEnabled ? '18px' : '2px', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#999' }}>
                    <span>Interruptible</span>
                    <div onClick={() => setInterruptibleEnabled(!interruptibleEnabled)} style={{ width: '36px', height: '20px', background: interruptibleEnabled ? '#00bcd4' : '#333', borderRadius: '10px', position: 'relative', cursor: 'pointer' }}>
                      <div style={{ width: '16px', height: '16px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: interruptibleEnabled ? '18px' : '2px', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding: '20px' }}>
                <textarea
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    background: 'transparent',
                    border: 'none',
                    color: '#ddd',
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    resize: 'none',
                    outline: 'none'
                  }}
                  placeholder="Type your welcome message here..."
                />
                <div style={{ fontSize: '11px', color: '#666', textAlign: 'right', marginTop: '8px' }}>{welcomeMessage.length}/600</div>
              </div>
            </div>

            {/* Conversational Flow */}
            <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #111' }}>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '14px', fontWeight: '600' }}>
                  <span style={{ color: '#00bcd4', marginRight: '8px' }}>☷</span> Conversational Flow <InfoIcon />
                </div>
                <button onClick={addFlowItem} style={{ padding: '6px 12px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>+ Add Section</button>
              </div>
              <div style={{ padding: '20px' }}>
                {flowItems.map((item, index) => (
                  <div key={item.id} style={{ background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '16px 20px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                      <span style={{ color: '#fff', fontSize: '10px', cursor: 'pointer' }}>▼</span>
                      <span style={{ color: '#444', fontSize: '16px', letterSpacing: '-2px', cursor: 'grab' }}>⋮⋮</span>
                      <span style={{ fontSize: '14px', fontWeight: '500', width: '20px' }}>{index + 1}.</span>
                      <span style={{ fontSize: '14px', fontWeight: '600' }}>{item.title}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#fff', fontWeight: '600' }}>
                        <span>{item.enabled ? 'ON' : 'OFF'}</span>
                        <div onClick={() => toggleFlowItem(item.id)} style={{ width: '36px', height: '20px', background: item.enabled ? '#00bcd4' : '#333', borderRadius: '10px', position: 'relative', cursor: 'pointer' }}>
                          <div style={{ width: '16px', height: '16px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: item.enabled ? '18px' : '2px', transition: 'left 0.2s' }} />
                        </div>
                      </div>
                      <button onClick={() => deleteFlowItem(item.id)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '16px', padding: 0 }}>🗑</button>
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
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '20px' }}>📞 Call Configuration</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              {[
                { label: 'Max Call Duration (minutes)', value: maxDuration, setter: setMaxDuration },
                { label: 'Silence Timeout (seconds)', value: silenceTimeout, setter: setSilenceTimeout }
              ].map((field, i) => (
                <div key={i}>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', fontWeight: '500' }}>{field.label}</label>
                  <input
                    type="number"
                    value={field.value}
                    onChange={(e) => field.setter(parseInt(e.target.value) || 0)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#0f0f0f',
                      border: '1px solid #333',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '13px'
                    }}
                  />
                </div>
              ))}
            </div>
            <button onClick={handleSave} disabled={isSaving} style={{ padding: '10px 24px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '6px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '13px', opacity: isSaving ? 0.6 : 1 }}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}

        {activeTab === 'kb' && (
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '20px' }}>📚 Knowledge Base</div>
            <div style={{ background: '#0f0f0f', border: '2px dashed #333', borderRadius: '8px', padding: '60px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: '#999', marginBottom: '8px' }}>📁 Drag and drop files or click to browse</p>
              <p style={{ fontSize: '12px', color: '#999', marginBottom: '20px' }}>Supported: PDF, DOC, TXT</p>
              <button onClick={() => alert('File upload feature coming soon')} style={{ padding: '10px 20px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>Browse Files</button>
            </div>
          </div>
        )}

        {activeTab === 'integrations' && (
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '20px' }}>🔗 Integrations</div>
            <p style={{ color: '#999', marginBottom: '20px', fontSize: '13px' }}>No integrations configured yet.</p>
            <button onClick={() => alert('Add integration feature coming soon')} style={{ padding: '10px 20px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>+ Add Integration</button>
          </div>
        )}

        {activeTab === 'postcall' && (
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '20px' }}>📤 Post-Call Actions</div>
            <p style={{ color: '#999', marginBottom: '20px', fontSize: '13px' }}>Configure what happens after the call ends.</p>
            <button onClick={() => alert('Post-call actions feature coming soon')} style={{ padding: '10px 20px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>+ Add Action</button>
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
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '20px' }}>📞 Recent Calls</div>
            <p style={{ color: '#999', fontSize: '13px' }}>No recent calls yet.</p>
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
              <button onClick={() => setShowChatModal(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '20px' }}>✕</button>
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

