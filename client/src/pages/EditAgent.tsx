import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AgentConfig, getAgent, saveAgent } from '../lib/agentStore';
import { whapi } from '../lib/whapi';


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
const TRANSCRIPTION_OPTIONS = ['Azure', 'Google Cloud Speech', 'AssemblyAI', 'Deepgram'];

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

      {/* Transcription Configuration Modal */}
      {showTranscriptionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '30px', maxWidth: '500px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Transcription Configuration</h2>
              <button onClick={() => setShowTranscriptionModal(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
              {TRANSCRIPTION_OPTIONS.map(option => (
                <button
                  key={option}
                  onClick={() => { setTranscription(option); setShowTranscriptionModal(false); }}
                  style={{
                    padding: '12px',
                    background: transcription === option ? '#00bcd4' : '#0f0f0f',
                    color: transcription === option ? '#000' : '#fff',
                    border: transcription === option ? 'none' : '1px solid #333',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    textAlign: 'left',
                    fontWeight: transcription === option ? '600' : '400'
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div style={{ background: '#1a1a1a', borderBottom: '1px solid #333', padding: '12px 30px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '20px', padding: 0 }}>←</button>
        <h1 style={{ margin: 0, fontSize: '16px', fontWeight: '600', marginRight: 'auto' }}>{agentName || 'Agent Configuration'}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#999' }}>
          <span style={{ color: '#4caf50' }}>●</span> Incoming
        </div>
        <div style={{ fontSize: '12px', color: '#999' }}>Cost/min: $0.115</div>
        <button onClick={() => alert('Ask AI functionality coming soon')} style={{ padding: '6px 14px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>✨ Ask AI</button>
        <button onClick={() => alert('Test functionality coming soon')} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid #333', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Test with</button>
        <button onClick={() => { setChatMessages([]); setShowChatModal(true); }} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid #333', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>💬 Chat</button>

        <button onClick={() => alert('Web Call functionality coming soon')} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid #333', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>📞 Web Call</button>
        <button onClick={() => alert('Phone Call functionality coming soon')} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid #333', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>☎️ Phone Call</button>
        <button onClick={handleSave} disabled={isSaving} style={{ padding: '6px 14px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '6px', cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '700', opacity: isSaving ? 0.6 : 1 }}>Deploy ↓</button>
        {saveMessage && <span style={{ fontSize: '12px', color: saveMessage.includes('✅') ? '#4caf50' : '#f44336' }}>{saveMessage}</span>}
      </div>

      {agentNotFound && (
        <div style={{ padding: '40px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', margin: '20px 30px', color: '#fff' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Agent not found</h2>
          <p style={{ color: '#999', marginTop: '10px' }}>The assistant you are trying to edit does not exist or has been removed. Return to the dashboard to select a different assistant.</p>
          <button onClick={() => navigate('/dashboard')} style={{ marginTop: '16px', padding: '10px 18px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Back to Dashboard</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #333', background: '#1a1a1a', padding: '0 30px', gap: '30px', overflowX: 'auto' }}>
        {[
          { id: 'details', label: '🤖 Assistant Details' },
          { id: 'config', label: '📞 Call Configuration' },
          { id: 'kb', label: '📚 Knowledge Base' },
          { id: 'integrations', label: '🔗 Integrations' },
          { id: 'postcall', label: '📤 Post-Call' },
          { id: 'calls', label: '📞 Recent Calls' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === tab.id ? '#00bcd4' : '#999',
              padding: '14px 0',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              borderBottom: activeTab === tab.id ? '3px solid #00bcd4' : 'none',
              marginBottom: '-1px',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '30px', maxWidth: '1400px' }}>
        {activeTab === 'details' && (
          <>
            {/* Assistant Settings */}
            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>⚙️ Assistant Settings</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '30px' }}>
              {[
                { icon: '🌐', label: 'Languages', value: selectedLanguages.length > 0 ? selectedLanguages.join(', ') : 'No languages selected', onClick: () => setShowLanguageModal(true) },
                { icon: '🔊', label: 'Voice (TTS)', value: voice, onClick: () => setShowVoiceModal(true) },
                { icon: '🤖', label: 'AI Model (LLM)', value: aiModel, onClick: () => setShowModelModal(true) },
                { icon: '🎙️', label: 'Transcription (STT)', value: transcription, onClick: () => setShowTranscriptionModal(true) }
              ].map((item, i) => (
                <div key={i} style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>{item.icon}</div>
                  <div style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase', marginBottom: '4px', fontWeight: '600' }}>{item.label}</div>
                  <div style={{ fontSize: '12px', marginBottom: '12px', maxHeight: '40px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.value}</div>
                  <button onClick={item.onClick} style={{ width: '100%', padding: '8px 12px', background: 'transparent', border: '1px solid #333', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Configure</button>
                </div>
              ))}
            </div>

            {/* Welcome Message */}
            <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '20px', marginBottom: '30px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', fontSize: '13px', fontWeight: '600' }}>
                <span>💬 Welcome Message</span>
                <div style={{ display: 'flex', gap: '20px', fontSize: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#999' }}>
                    <input type="checkbox" checked={dynamicEnabled} onChange={(e) => setDynamicEnabled(e.target.checked)} style={{ accentColor: '#00bcd4' }} />
                    <span>Dynamic</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#999' }}>
                    <input type="checkbox" checked={interruptibleEnabled} onChange={(e) => setInterruptibleEnabled(e.target.checked)} style={{ accentColor: '#00bcd4' }} />
                    <span>Interruptible</span>
                  </label>
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>Agent Name</label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
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
              <textarea
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '120px',
                  background: '#0f0f0f',
                  border: '1px solid #333',
                  borderRadius: '6px',
                  color: '#fff',
                  padding: '12px',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  marginBottom: '8px',
                  resize: 'vertical'
                }}
              />
              <div style={{ fontSize: '11px', color: '#999', textAlign: 'right' }}>{welcomeMessage.length}/600</div>
            </div>

            {/* Conversational Flow */}
            <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', fontSize: '13px', fontWeight: '600' }}>
                <span>🌳 Conversational Flow</span>
                <button onClick={addFlowItem} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #333', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>+ Add Section</button>
              </div>
              {flowItems.map((item, index) => (
                <div key={item.id} style={{ background: '#0f0f0f', border: '1px solid #333', borderRadius: '6px', padding: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    <span style={{ color: '#999', fontSize: '18px' }}>⋮⋮</span>
                    <span>{index + 1}.</span>
                    <span>{item.title}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#999' }}>
                      <span>{item.enabled ? 'ON' : 'OFF'}</span>
                      <button
                        onClick={() => toggleFlowItem(item.id)}
                        style={{
                          width: '40px',
                          height: '24px',
                          background: item.enabled ? '#00bcd4' : '#333',
                          border: 'none',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          transition: 'background 0.3s'
                        }}
                      />
                    </div>
                    <button onClick={() => deleteFlowItem(item.id)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '16px', padding: 0 }}>🗑️</button>
                  </div>
                </div>
              ))}
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

