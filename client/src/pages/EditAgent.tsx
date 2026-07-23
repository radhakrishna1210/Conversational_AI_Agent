import { useParams, useNavigate } from 'react-router-dom';

import { useEffect, useState, useRef } from 'react';
import { AgentConfig, getDefaultFlowItems } from '../lib/agentStore';

import { whapi, getAuth } from '../lib/whapi';
import { integrationsApi } from '../lib/integrationsApi';
import { toast } from 'sonner';
import ChatComponent from '../components/ChatComponent';
import AIAssistantSidebar from '../components/AIAssistantSidebar';
import VoiceConfigModal from '../components/VoiceConfigModal';
import CallerNumberPicker from '../components/CallerNumberPicker';
import { useTheme } from '../hooks/useTheme';
import { xaiCallSocket } from '../services/xaiCallSocket';
import { modularCallSocket, type ModularCallEvent } from '../services/modularCallSocket';


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
  /** webhook URL — required when deliveryMethod === 'Webhook' */
  url: string;
  /** email address — required when deliveryMethod === 'Email' */
  email: string;
  /** Drive file id — required when deliveryMethod === 'Google Sheets' */
  spreadsheetId?: string;
  /** display name, stored so the UI can label it without a Drive round-trip */
  spreadsheetName?: string;
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


const AI_MODELS = ['GPT-4.1-Mini', 'GPT-4-Turbo', 'Claude-3-Opus', 'Gemini-Pro', 'Llama-2-70B'];
const POST_CALL_TRIGGER_OPTIONS = ['Completed', 'Voicemail Detected', 'No Answer', 'Busy', 'Failed'];
const POST_CALL_DELIVERY_OPTIONS = ['Email', 'Webhook', 'CRM', 'Slack', 'WhatsApp'];

const createDefaultPostCallConfig = (): PostCallConfig => ({
  id: Date.now().toString(),
  deliveryMethod: '',
  url: '',
  email: '',
  spreadsheetId: '',
  spreadsheetName: '',
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

// Ambient Sound (Call Configuration): synthesizes a looping background bed for
// the Web Call directly with Web Audio — no audio assets to ship. Each preset
// differs by noise colour (filter) and level. Routed to the speakers (so it's
// audible) and, when given, into the mixed call recording — never into the mic
// path, so it can't pollute what the agent's STT hears. Returns a stop().
const AMBIENT_PRESETS: Record<string, { type: BiquadFilterType; freq: number; gain: number }> = {
  Office: { type: 'lowpass', freq: 700, gain: 0.012 },
  'Call Center': { type: 'bandpass', freq: 1100, gain: 0.02 },
  Static: { type: 'highpass', freq: 2200, gain: 0.02 },
  Cafe: { type: 'lowpass', freq: 1000, gain: 0.018 },
  Street: { type: 'lowpass', freq: 400, gain: 0.022 },
};

const startAmbientSound = (
  audioCtx: AudioContext,
  preset: string,
  mixDest?: MediaStreamAudioDestinationNode | null,
): (() => void) | null => {
  const cfg = AMBIENT_PRESETS[preset];
  if (!cfg) return null; // 'None' or unknown → silence
  const frames = Math.floor(audioCtx.sampleRate * 2);
  const buffer = audioCtx.createBuffer(1, frames, audioCtx.sampleRate);
  const chan = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) chan[i] = Math.random() * 2 - 1; // white noise
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type = cfg.type;
  filter.frequency.value = cfg.freq;
  const gain = audioCtx.createGain();
  gain.gain.value = cfg.gain;
  src.connect(filter).connect(gain);
  gain.connect(audioCtx.destination);
  if (mixDest) gain.connect(mixDest);
  try { src.start(); } catch { /* context may be closing */ }
  return () => {
    try { src.stop(); } catch { /* already stopped */ }
    try { gain.disconnect(); } catch { /* noop */ }
    try { filter.disconnect(); } catch { /* noop */ }
  };
};

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
  // 'xai' / 'elevenlabs' = a bundled speech-to-speech Conversational Agent
  // replaces the modular Languages/Voice/AI Model/Transcription pipeline
  // entirely for this agent's Web Call + Phone Call.
  const [voiceEngine, setVoiceEngine] = useState<'modular' | 'xai' | 'elevenlabs'>('modular');
  const [showXaiModal, setShowXaiModal] = useState(false);

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
  
  const [, setVoiceProvider] = useState('google'); // provider tracked for future UI filtering
  const [agentName, setAgentName] = useState('');
  // INBOUND = customers call the agent; OUTBOUND = the agent calls customers.
  const [callDirection, setCallDirection] = useState('INBOUND');
  const [agentNotFound, setAgentNotFound] = useState(false);
  const [postCallConfigs, setPostCallConfigs] = useState<PostCallConfig[]>([createDefaultPostCallConfig()]);
  const [testingPostCall, setTestingPostCall] = useState<Record<string, 'idle' | 'loading' | 'done' | 'error'>>({});
  const [testPostCallResults, setTestPostCallResults] = useState<Record<string, string>>({});
  // Real connection status for the Integrations tab. The card list itself is
  // static metadata; without this the cards always claimed "Ready to connect"
  // even for providers that were already connected.
  const [integrationStatus, setIntegrationStatus] = useState<Record<string, { connected: boolean; accountLabel?: string | null; status?: string }>>({});
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const loadIntegrationStatus = async () => {
    try {
      const data = await integrationsApi.getDashboard();
      const byProvider: Record<string, { connected: boolean; accountLabel?: string | null; status?: string }> = {};
      for (const item of data?.integrations ?? []) {
        byProvider[item.provider] = { connected: Boolean(item.connected), accountLabel: item.accountLabel, status: item.status };
      }
      setIntegrationStatus(byProvider);
    } catch (err) {
      console.error('Failed to load integration status', err);
    }
  };
  useEffect(() => {
    if (activeTab === 'integrations') loadIntegrationStatus();
  }, [activeTab]);

  // Google Sheets delivery target: spreadsheets from the connected integration.
  const [spreadsheets, setSpreadsheets] = useState<{ id: string; name: string }[]>([]);
  const [spreadsheetsState, setSpreadsheetsState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [spreadsheetsError, setSpreadsheetsError] = useState('');
  const loadSpreadsheets = async () => {
    setSpreadsheetsState('loading');
    setSpreadsheetsError('');
    try {
      const res = await whapi.get<{ spreadsheets: { id: string; name: string }[] }>(
        '/integrations/google_sheets/spreadsheets'
      );
      setSpreadsheets(res?.spreadsheets ?? []);
      setSpreadsheetsState('idle');
    } catch (err) {
      setSpreadsheetsError(err instanceof Error ? err.message : 'Could not load spreadsheets');
      setSpreadsheetsState('error');
    }
  };
  // An agent already configured for Sheets should show real names, not just the
  // one id it saved — fetch once, only for agents that actually use it.
  const usesSheets = postCallConfigs.some((c) => c.deliveryMethod === 'Google Sheets');
  useEffect(() => {
    if (usesSheets && spreadsheets.length === 0 && spreadsheetsState === 'idle') loadSpreadsheets();
  }, [usesSheets]);
  // Inline "create a new spreadsheet" flow, keyed by post-call config id so
  // each config's form is independent.
  const [newSheetName, setNewSheetName] = useState<Record<string, string>>({});
  const [creatingSheet, setCreatingSheet] = useState<string | null>(null);
  // Once a sheet is chosen the picker collapses to a confirmation; this
  // re-opens it for a config the user wants to point somewhere else.
  const [changingSheet, setChangingSheet] = useState<Record<string, boolean>>({});
  const createSpreadsheetFor = async (configId: string) => {
    const title = (newSheetName[configId] ?? '').trim() || `${agentName || 'Agent'} — Call Log`;
    setCreatingSheet(configId);
    try {
      const res = await whapi.post<{ spreadsheet: { id: string; name: string } }>(
        '/integrations/google_sheets/spreadsheets',
        { title }
      );
      const sheet = res?.spreadsheet;
      if (!sheet?.id) throw new Error('The spreadsheet was not created');
      setSpreadsheets((prev) => [{ id: sheet.id, name: sheet.name }, ...prev]);
      setNewSheetName((prev) => ({ ...prev, [configId]: '' }));
      setChangingSheet((prev) => ({ ...prev, [configId]: false }));
      updatePostCallConfig(configId, { spreadsheetId: sheet.id, spreadsheetName: sheet.name });
      toast.success(`Created and selected “${sheet.name}”`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the spreadsheet');
    } finally {
      setCreatingSheet(null);
    }
  };
  // Integrations tab — separate from dynamicEnabled (Details tab)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  // Recent Calls tab — per-agent interaction history (chat tests, web calls,
  // phone test calls) with transcripts and web-call recordings.
  interface CallRecord {
    id: string;
    type: string;
    status: string;
    durationSec: number;
    phoneNumber?: string | null;
    startedAt?: string;
    endedAt?: string | null;
    hasRecording?: boolean;
    transcript?: { role: string; content: string }[];
    extractionStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'SKIPPED' | 'FAILED';
    extractionError?: string | null;
    extractedAt?: string | null;
    extractedData?: {
      variables?: {
        key: string;
        description: string;
        value: unknown;
        evidence?: string | null;
      }[];
      skippedReason?: string;
    };
  }
  const [recentCalls, setRecentCalls] = useState<CallRecord[]>([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);
  const [recordingUrls, setRecordingUrls] = useState<Record<string, string>>({});

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
  // Server-backed KB (unified with the sidebar Files page — issue #14)
  interface KbRecord { id: string; fileName: string; sizeBytes: number; hasText: boolean }
  const [kbFiles, setKbFiles] = useState<KbRecord[]>([]);
  const [kbUploading, setKbUploading] = useState(false);

  // KB text is no longer fetched client-side: the server grounds every
  // conversation (chat + web call) in the knowledge base itself.
  const refreshKb = async () => {
    if (!agentId) return;
    try {
      const res = await whapi.get<{ files: KbRecord[] }>(`/files?agentId=${agentId}`);
      setKbFiles(res?.files ?? []);
    } catch (e) { console.error('KB load failed', e); }
  };
  useEffect(() => { refreshKb(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [agentId]);

  const loadRecentCalls = async () => {
    setCallsLoading(true);
    try {
      const res = await whapi.get<{ calls?: CallRecord[] }>(`/agents/${agentId}/calls?limit=100`);
      setRecentCalls(res?.calls ?? []);
    } catch (e) {
      console.error('Failed to load recent calls', e);
      setRecentCalls([]);
    }
    setCallsLoading(false);
  };

  // Fetch a web-call recording with auth and expose it as a playable blob URL
  const loadRecording = async (callId: string) => {
    if (recordingUrls[callId]) return;
    try {
      const { token, workspaceId } = getAuth();
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/agents/${agentId}/calls/${callId}/recording`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Recording unavailable (${res.status})`);
      const blob = await res.blob();
      setRecordingUrls((prev) => ({ ...prev, [callId]: URL.createObjectURL(blob) }));
    } catch (e) {
      console.error('Failed to load recording', e);
      toast.error('Could not load the call recording.');
    }
  };

  const extractCallData = async (callId: string) => {
    setRecentCalls((prev) => prev.map((call) =>
      call.id === callId ? { ...call, extractionStatus: 'PROCESSING', extractionError: null } : call
    ));
    try {
      const res = await whapi.post<{ call?: CallRecord }>(
        `/agents/${agentId}/calls/${callId}/extract`,
        { force: true }
      );
      if (res?.call) {
        setRecentCalls((prev) => prev.map((call) => call.id === callId ? res.call! : call));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed';
      setRecentCalls((prev) => prev.map((call) =>
        call.id === callId ? { ...call, extractionStatus: 'FAILED', extractionError: message } : call
      ));
      toast.error(message);
    }
  };

  useEffect(() => {
    if (activeTab === 'calls') loadRecentCalls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    e.target.value = '';
    setKbUploading(true);
    for (const f of files) {
      try {
        const form = new FormData();
        form.append('file', f);
        if (agentId) form.append('agentId', agentId);
        const res = await whapi.postForm<{ file: KbRecord; textExtracted: boolean }>('/files', form);
        toast.success(`${f.name} uploaded${res?.textExtracted ? '' : ' (no text could be extracted — it will not ground answers)'}`);
      } catch (err) {
        toast.error(err instanceof Error ? `${f.name}: ${err.message}` : `Failed to upload ${f.name}`);
      }
    }
    setKbUploading(false);
    refreshKb();
  };

  const removeKbFile = async (id: string) => {
    try {
      await whapi.del(`/files/${id}`);
      setKbFiles(prev => prev.filter(f => f.id !== id));
      refreshKb();
    } catch (err) {
      toast.error('Failed to delete file');
    }
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
  const [fromNumber, setFromNumber] = useState('');
  const [deployStatus, setDeployStatus] = useState<'idle' | 'deploying' | 'done'>('idle');
  const [askAIInput, setAskAIInput] = useState('');
  const [askAIResponse, setAskAIResponse] = useState('');
  const [isAskAILoading, setIsAskAILoading] = useState(false);
  const [webCallActive, setWebCallActive] = useState(false);
  const [webCallStatus, setWebCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'ended'>('idle');
  const [webCallActivity, setWebCallActivity] = useState<'listening' | 'processing' | 'speaking'>('listening');
  const [webCallTranscript, setWebCallTranscript] = useState<{ role: string; content: string }[]>([]);
  const [webCallError, setWebCallError] = useState('');
  const [webCallLatency, setWebCallLatency] = useState<{ sttMs: number; llmMs: number } | null>(null);
  // Prefetched on page load: rendered welcome + its TTS audio, so the call
  // starts speaking instantly instead of synthesizing at call time.
  const welcomeAudioRef = useRef<{ welcome: string; audioBase64: string; contentType: string } | null>(null);
  // Bumped whenever the voice/welcome changes so an in-flight prefetch from
  // the previous configuration can't land in the ref after it's stale.
  const welcomePrefetchSeq = useRef(0);
  const prefetchWelcomeAudio = async () => {
    const seq = ++welcomePrefetchSeq.current;
    try {
      const rw = await whapi.get<{ welcome: string }>(`/agents/${agentId}/welcome`);
      if (!rw?.welcome) return;
      const audio = await whapi.post<{ audioBase64: string; contentType: string }>(
        `/agents/${agentId}/speak`, { text: rw.welcome }
      );
      if (audio?.audioBase64 && seq === welcomePrefetchSeq.current) {
        welcomeAudioRef.current = { welcome: rw.welcome, audioBase64: audio.audioBase64, contentType: audio.contentType };
      }
    } catch { /* prefetch is best-effort; call start falls back to fetching */ }
  };

  // B4 streaming reply playback: audio bytes arrive over the socket and are fed
  // into a MediaSource so the agent starts speaking on the first byte. Falls
  // back to a single buffered blob when MediaSource can't play the codec.
  type ModularPlaybackSession = {
    mediaSource: MediaSource | null;
    audioEl: HTMLAudioElement | null;
    url: string | null;
    sourceBuffer: SourceBuffer | null;
    queue: ArrayBuffer[];
    ended: boolean;
    started: boolean;
    epoch: number;
    useMediaSource: boolean;
    contentType: string;
    blobChunks: ArrayBuffer[];
    finish: () => void;
  };

  // Live call machinery — kept in a ref so the VAD/recorder loop never fights React renders
  const callRef = useRef<{
    active: boolean;
    stream: MediaStream | null;
    audioCtx: AudioContext | null;
    analyser: AnalyserNode | null;
    recorder: MediaRecorder | null;
    vadTimer: number | null;
    player: HTMLAudioElement | null;
    history: { role: string; content: string }[];
    // Full-call recording: mic + agent audio mixed into one stream
    mixDest: MediaStreamAudioDestinationNode | null;
    mixRecorder: MediaRecorder | null;
    mixChunks: Blob[];
    logId: string | null;
    // true while this call is running through a bundled Conversational Agent
    // (xAI or ElevenLabs, via xaiCallSocket — engine-agnostic despite the
    // name) instead of the modular record-segment/HTTP flow.
    bundledEngine: boolean;
    // Last time the caller was actually heard speaking — drives the
    // "Max Silence Before Hangup" Call-Configuration setting.
    lastSpeechAt: number;
    // Teardown for the synthesized Ambient Sound bed, null when none.
    ambientStop: (() => void) | null;
    // Set while the agent's audio is playing: calling it cuts the agent off
    // (barge-in) and resolves the playback promise so we start listening.
    stopPlayback: (() => void) | null;
    // Interval that watches the mic for barge-in while the agent speaks.
    bargeTimer: number | null;
    // ── B2 modular WebSocket transport (voiceEngine === 'modular') ──
    // true once the persistent modular Web Call socket is running.
    socketMode: boolean;
    // Worklet that taps mic PCM16 and forwards it to the socket while capturing.
    micWorklet: AudioWorkletNode | null;
    // Gate: the worklet only streams PCM to the server while a turn is capturing.
    capturingPcm: boolean;
    // B4 streaming reply playback: MediaSource session + a promise that resolves
    // when the current reply finishes playing (or is cut off by barge-in).
    modularSession: ModularPlaybackSession | null;
    modularPlaybackDone: Promise<void> | null;
    // Transcript of the caller's current turn, applied to history on 'done'.
    pendingUserText: string;
    // Bumped on each new segment / on barge-in so stale queued audio is skipped.
    turnEpoch: number;
  }>({ active: false, stream: null, audioCtx: null, analyser: null, recorder: null, vadTimer: null, player: null, history: [], mixDest: null, mixRecorder: null, mixChunks: [], logId: null, bundledEngine: false, lastSpeechAt: 0, ambientStop: null, stopPlayback: null, bargeTimer: null, socketMode: false, micWorklet: null, capturingPcm: false, modularSession: null, modularPlaybackDone: null, pendingUserText: '', turnEpoch: 0 });

  // ─── Call history logging (Recent Calls tab) ────────────────────────────────
  // Every test session — chat modal, Chat Test tab, web call, phone call — is
  // stored server-side with its transcript so nothing is lost.
  const chatLogIdRef = useRef<string | null>(null);
  const upsertCallLog = async (
    idRef: { current: string | null },
    type: 'CHAT' | 'WEB_CALL' | 'PHONE_CALL',
    transcript: { role: string; content: string }[],
    patch: Record<string, unknown> = {}
  ) => {
    try {
      if (!idRef.current) {
        const res = await whapi.post<{ call?: { id: string } }>(`/agents/${agentId}/calls`, { type, transcript, ...patch });
        idRef.current = res?.call?.id ?? null;
      } else {
        await whapi.patch(`/agents/${agentId}/calls/${idRef.current}`, { transcript, ...patch });
      }
    } catch (e) {
      console.error('Failed to store call history', e);
    }
  };


  useEffect(() => {
    if (!agentId) return;

    // Warm the welcome message AND its TTS audio in the background so the
    // Chat Test tab opens instantly and the Web Call starts speaking the
    // moment it connects (Sarvam TTS alone costs 4-6s if done at call time).
    prefetchWelcomeAudio();

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
          {
            const savedEngine = (agent as any).voiceEngine;
            setVoiceEngine(savedEngine === 'xai' || savedEngine === 'elevenlabs' ? savedEngine : 'modular');
          }
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
          setPostCallConfigs(savedPostCallConfigs?.length
            ? savedPostCallConfigs.map((config: Partial<PostCallConfig>) => ({
                ...createDefaultPostCallConfig(),
                ...config,
                extractedVariables: Array.isArray(config.extractedVariables) ? config.extractedVariables : [],
              }))
            : [createDefaultPostCallConfig()]);
          // KB URLs saved in agent settings
          setKbUrls((agent as any).kbUrls ?? []);
          // Integrations tab
          setWebSearchEnabled((agent as any).webSearchEnabled ?? false);
          setCallDirection((agent as any).callDirection ?? 'INBOUND');
          // STT settings
          setSttProvider((agent as any).sttProvider ?? 'Sarvam');
          setSttSilenceTimeoutMs((agent as any).sttSilenceTimeoutMs ?? 470);
          setSttNoiseReducer((agent as any).sttNoiseReducer ?? true);
          setSttModel((agent as any).sttModel ?? 'Saaras V3');
          setSttLanguage((agent as any).sttLanguage ?? 'Multi');
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
        console.error('Failed to fetch agent from backend', err);
        setAgentNotFound(true);
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
    };

    fetchAgent();
  }, [agentId]);


  // Save changes to backend and local storage
  // `overrides` lets a caller save a value it *just* set in the same tick —
  // React state updates aren't committed yet, so reading state alone would
  // persist the previous value.
  const handleSave = async (overrides: Record<string, unknown> = {}, { silent = false } = {}) => {
    setIsSaving(true);
    const agentData = {
      name: agentName,
      welcomeMessage,
      aiModel,
      voice,
      transcription,
      voiceEngine,
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
      kbFiles: kbFiles.map(f => f.fileName),
      // STT settings
      sttProvider,
      sttSilenceTimeoutMs,
      sttNoiseReducer,
      sttModel,
      sttLanguage,
      // Integrations
      webSearchEnabled,
      callDirection,
      ...overrides,
    };

    try {
      await whapi.put(`/agents/${agentId}`, agentData);
      // Auto-saves stay quiet; a failure is always surfaced.
      if (!silent) toast.success('Agent saved');
      // The saved config may change what the call opens with (voice, welcome
      // text) — refresh the prefetched welcome audio to match. The server
      // caches TTS per (voice, text), so this is a no-op when nothing changed.
      // Skipped for silent saves: those come from the Post-Call tab, which
      // cannot affect the greeting, and re-synthesizing on every toggle would
      // burn a TTS round-trip for nothing.
      if (!silent) {
        welcomeAudioRef.current = null;
        prefetchWelcomeAudio();
      }
    } catch (err) {
      console.error('Failed to save to backend', err);
      toast.error(err instanceof Error ? `Save failed: ${err.message}` : 'Save failed — changes were NOT stored.');
    }

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

  const handleVoiceSelect = async (v: { id: string; name: string; provider: string | null }) => {
    const displayName = `${v.provider ?? 'Unknown'} - ${v.name}`;
    setVoice(displayName);
    setSelectedVoiceId(v.id);
    setShowVoiceModal(false);
    // The prefetched welcome audio was synthesized with the PREVIOUS voice —
    // drop it now so a call started before the save/re-prefetch finishes falls
    // back to fetching fresh audio instead of speaking in the old voice.
    welcomeAudioRef.current = null;
    welcomePrefetchSeq.current++;
    await handleSave({ voice: displayName }); // persist immediately — refresh must not lose it
  };

  /** Why a config can't be tested/delivered yet, or null when it's ready. */
  const postCallConfigIssue = (config: PostCallConfig): string | null => {
    if (!config.deliveryMethod) return 'Select a delivery method first';
    if (config.deliveryMethod === 'Webhook' && !config.url) return 'Enter a webhook URL first';
    if (config.deliveryMethod === 'Email' && !config.email) return 'Enter an email address first';
    if (config.deliveryMethod === 'Google Sheets' && !config.spreadsheetId) return 'Select a target spreadsheet first';
    return null;
  };

  const addPostCallConfig = () => {
    setPostCallConfigs((prev) => [...prev, createDefaultPostCallConfig()]);
  };

  const removePostCallConfig = (configId: string) => {
    setPostCallConfigs((prev) => prev.filter((config) => config.id !== configId));
  };

  const handleTestPostCall = async (configId: string) => {
    if (!agentId) return;
    // Save first so the backend reads the latest configs
    setIsSaving(true);
    try {
      const agentData = {
        name: agentName, welcomeMessage, aiModel, voice, transcription,
        languages: selectedLanguages, flowItems, maxDuration, silenceTimeout,
        maxSilenceBeforeHangup, endCallMessage, transferNumber, transferCondition,
        fillerWords, speakingRate, ambientSound, dynamicEnabled, interruptibleEnabled,
        postCallConfigs, kbUrls, kbFiles: kbFiles.map(f => f.fileName)
      };
      await whapi.put(`/agents/${agentId}`, agentData);
    } catch {
      toast.error('Save before test failed');
      setIsSaving(false);
      return;
    }
    setIsSaving(false);

    setTestingPostCall(prev => ({ ...prev, [configId]: 'loading' }));
    try {
      const res = await whapi.post<{ executed: number; results: { method: string; target?: string; ok: boolean; error?: string; status?: number }[] }>(
        `/agents/${agentId}/post-call/test`,
        { summary: 'Test delivery triggered from the Edit Agent UI.' }
      );
      const allOk = res?.results?.every(r => r.ok);
      const summary = res?.results?.map(r =>
        `${r.method}${r.target ? ` → ${r.target}` : ''}: ${r.ok ? '✓ delivered' : `✗ ${r.error ?? 'failed'}`}`
      ).join('\n') ?? 'No configs executed.';
      setTestPostCallResults(prev => ({ ...prev, [configId]: summary }));
      setTestingPostCall(prev => ({ ...prev, [configId]: allOk ? 'done' : 'error' }));
      if (allOk) toast.success('Test delivery sent successfully');
      else toast.error('Test delivery completed with errors — see details below');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Test failed';
      setTestPostCallResults(prev => ({ ...prev, [configId]: msg }));
      setTestingPostCall(prev => ({ ...prev, [configId]: 'error' }));
      toast.error(`Test failed: ${msg}`);
    }
  };

  const updatePostCallConfig = (configId: string, updates: Partial<PostCallConfig>) => {
    setPostCallConfigs((prev) =>
      prev.map((config) => (config.id === configId ? { ...config, ...updates } : config))
    );
  };

  /**
   * Update a post-call config. Persistence is handled by the debounced
   * auto-save effect below, so callers never have to remember to save.
   */
  const updatePostCallConfigAndSave = (configId: string, updates: Partial<PostCallConfig>) =>
    updatePostCallConfig(configId, updates);

  // Auto-save the Post-Call tab. Every control here (delivery method, target
  // spreadsheet, trigger statuses, include-toggles, extracted variables)
  // mutates postCallConfigs, so one debounced effect persists them all — a
  // refresh can no longer discard a configuration the user just set up.
  const postCallHydrated = useRef(false);
  useEffect(() => {
    if (isLoading || !agentId) return;
    // The first value after load came FROM the server; saving it back would be
    // a pointless write on every page visit.
    if (!postCallHydrated.current) {
      postCallHydrated.current = true;
      return;
    }
    const timer = setTimeout(() => { handleSave({ postCallConfigs }, { silent: true }); }, 900);
    return () => clearTimeout(timer);
  }, [postCallConfigs, isLoading, agentId]);

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
      // The server builds the full agent prompt (persona, conversational flow,
      // knowledge base grounding) in agentRuntime.service.js — the exact same
      // brain the Web Call uses — and receives the complete history so the
      // conversation is multi-turn and stateful.
      const response = await whapi.post<{ reply: string }>(`/agents/${agentId}/converse`, {
        messages: newMessages,
      });

      const full = [...newMessages, { role: 'assistant', content: response.reply }];
      setChatMessages(full);
      // Store/refresh this chat session in Recent Calls after every exchange,
      // so the history survives even if the user just closes the modal.
      upsertCallLog(chatLogIdRef, 'CHAT', full);
    } catch (err) {
      console.error('Chat failed', err);
      setChatMessages([...newMessages, { role: 'assistant', content: 'Error: Failed to get response from AI.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const closeTestChat = async () => {
    const callId = chatLogIdRef.current;
    const transcript = chatMessages;
    setShowChatModal(false);
    chatLogIdRef.current = null;
    setChatMessages([]);
    if (!callId) return;
    try {
      await whapi.patch(`/agents/${agentId}/calls/${callId}`, {
        transcript,
        status: 'COMPLETED',
        ended: true,
      });
    } catch (err) {
      console.error('Failed to finalize chat extraction', err);
    }
  };

  const handleAskAI = async () => {
    if (!askAIInput.trim()) return;
    setIsAskAILoading(true);
    setAskAIResponse('');
    try {
      // No hardcoded provider/model: the backend resolves the agent's own
      // configured model (mapAgentModel) and falls back to the default
      // provider (Gemini) — previously this forced openai/gpt-4o and failed
      // whenever OPENAI_API_KEY was absent, even though Gemini worked.
      const response = await whapi.post<{ message: string }>('/llm/generate', {
        agentId,
        message: askAIInput,
        systemPrompt: `You are an AI assistant helping configure an AI voice agent. The agent is named "${agentName}" and its welcome message is: "${welcomeMessage}". Provide helpful, concise suggestions for improving or configuring this agent.`,
        useFallback: true,
      });
      setAskAIResponse(response.message);
    } catch (err) {
      setAskAIResponse(err instanceof Error ? `AI request failed: ${err.message}` : 'Failed to get AI response.');
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

  // ─── Real web call: mic → VAD segmentation → /voice-turn (STT→LLM→TTS) ──────
  const connectAgentPlayer = (player: HTMLAudioElement) => {
    const call = callRef.current;
    call.player = player;
    try {
      if (call.audioCtx && call.audioCtx.state !== 'closed') {
        const src = call.audioCtx.createMediaElementSource(player);
        src.connect(call.audioCtx.destination);
        if (call.mixDest) src.connect(call.mixDest);
      }
    } catch { /* recording miss shouldn't break playback */ }
  };

  const playAgentBlob = (blob: Blob) =>
    new Promise<void>((resolve) => {
      // Play via a blob URL routed through the AudioContext so the agent's
      // voice is both audible AND captured into the call recording mix.
      // (data: URLs are cross-origin for MediaElementSource and record silence.)
      const url = URL.createObjectURL(blob);
      const player = new Audio(url);
      const done = () => { callRef.current.stopPlayback = null; URL.revokeObjectURL(url); resolve(); };
      player.onended = done;
      player.onerror = () => { console.error('[web-call] agent audio element failed to play (decode/format?)'); done(); };
      connectAgentPlayer(player);
      // Barge-in hook: pausing then resolving lets the caller interrupt.
      callRef.current.stopPlayback = () => { try { player.pause(); } catch { /* noop */ } done(); };
      // A rejected play() (autoplay policy, decode error) would otherwise be
      // invisible — log it so a silent agent is diagnosable.
      player.play().catch((e) => { console.error('[web-call] agent audio play() rejected:', e?.message || e); done(); });
    });

  const playAgentAudio = (audioBase64: string, contentType: string) => {
    const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    return playAgentBlob(new Blob([bytes], { type: contentType }));
  };

  const playAgentAudioStream = async (text: string) => {
    const { token, workspaceId } = getAuth();
    const response = await fetch(
      `/api/v1/workspaces/${workspaceId}/agents/${agentId}/speak-stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error || `Speech stream failed (${response.status})`);
    }

    const voiceUsed = response.headers.get('x-voice-used');
    if (voiceUsed) console.info('[web-call] reply voice:', decodeURIComponent(voiceUsed));

    const contentType = (response.headers.get('content-type') || 'audio/mpeg').split(';')[0];
    if (!response.body || !window.MediaSource || !MediaSource.isTypeSupported(contentType)) {
      await playAgentBlob(await response.blob());
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const mediaSource = new MediaSource();
      const url = URL.createObjectURL(mediaSource);
      const player = new Audio(url);
      let settled = false;
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      const startupTimer = window.setTimeout(
        () => finish(new Error('Streamed audio did not start in time')),
        5000
      );
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        callRef.current.stopPlayback = null;
        clearTimeout(startupTimer);
        if (error) reader?.cancel().catch(() => {});
        URL.revokeObjectURL(url);
        if (error) reject(error);
        else resolve();
      };

      connectAgentPlayer(player);
      // Barge-in hook: pause and resolve (no error) so the caller can cut in
      // without falling through to the buffered-audio fallback.
      callRef.current.stopPlayback = () => { try { player.pause(); } catch { /* noop */ } finish(); };
      player.onplaying = () => clearTimeout(startupTimer);
      player.onended = () => finish();
      player.onerror = () => finish(new Error('Streamed audio could not be played'));

      mediaSource.addEventListener('sourceopen', async () => {
        try {
          const sourceBuffer = mediaSource.addSourceBuffer(contentType);
          reader = response.body!.getReader();
          let playbackStarted = false;

          while (callRef.current.active) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = new Uint8Array(value.byteLength);
            chunk.set(value);
            await new Promise<void>((appendDone, appendFailed) => {
              const onUpdateEnd = () => {
                sourceBuffer.removeEventListener('error', onError);
                appendDone();
              };
              const onError = () => {
                sourceBuffer.removeEventListener('updateend', onUpdateEnd);
                appendFailed(new Error('Audio stream decode failed'));
              };
              sourceBuffer.addEventListener('updateend', onUpdateEnd, { once: true });
              sourceBuffer.addEventListener('error', onError, { once: true });
              sourceBuffer.appendBuffer(chunk);
            });
            if (!playbackStarted) {
              playbackStarted = true;
              // Do not await play(): Chrome may wait for more MP3 frames before
              // resolving it. Awaiting here would stop us from appending those
              // frames and deadlock the stream with no audible output.
              player.play().catch((error) => finish(error));
            }
          }

          if (!callRef.current.active) {
            await reader.cancel();
            finish();
            return;
          }
          if (mediaSource.readyState === 'open' && !sourceBuffer.updating) {
            mediaSource.endOfStream();
          }
          if (!playbackStarted) finish(new Error('Speech stream returned no audio'));
        } catch (error) {
          finish(error);
        }
      }, { once: true });
    });
  };

  const startListeningSegment = () => {
    const call = callRef.current;
    if (!call.active || !call.stream || !call.analyser) return;
    setWebCallActivity('listening');

    const recorder = new MediaRecorder(call.stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    call.recorder = recorder;

    const data = new Uint8Array(call.analyser.fftSize);
    let speechDetected = false;
    let lastSpeechAt = Date.now();
    const startedAt = Date.now();
    const SPEECH_RMS = 0.025;     // voice activity threshold
    const SILENCE_MS = Math.min(900, Math.max(350, sttSilenceTimeoutMs || 450));
    const MAX_SEGMENT_MS = 20000; // hard cap per turn

    call.vadTimer = window.setInterval(() => {
      if (!call.active || recorder.state !== 'recording') return;
      call.analyser!.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const d = (data[i] - 128) / 128; sum += d * d; }
      const rms = Math.sqrt(sum / data.length);
      if (rms > SPEECH_RMS) { speechDetected = true; lastSpeechAt = Date.now(); }
      const silentFor = Date.now() - lastSpeechAt;
      if ((speechDetected && silentFor > SILENCE_MS) || Date.now() - startedAt > MAX_SEGMENT_MS) {
        recorder.stop();
      }
    }, 100);

    recorder.onstop = async () => {
      if (call.vadTimer) { clearInterval(call.vadTimer); call.vadTimer = null; }
      if (!call.active) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      if (!speechDetected || blob.size < 2000) {
        // Noise-only segment. "Max Silence Before Hangup" (Call Configuration):
        // end the call once the caller has stayed silent for the configured
        // number of seconds. 0 disables the auto-hangup.
        if (maxSilenceBeforeHangup > 0 && Date.now() - call.lastSpeechAt > maxSilenceBeforeHangup * 1000) {
          handleEndWebCall();
          return;
        }
        startListeningSegment();
        return; // noise only — keep listening
      }
      call.lastSpeechAt = Date.now();
      await submitVoiceTurnStreaming(blob);
    };

    recorder.start();
  };

  const submitVoiceTurn = async (blob: Blob) => {
    const call = callRef.current;
    setWebCallActivity('processing');
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'turn.webm');
      fd.append('history', JSON.stringify(call.history));
      fd.append('streamTts', 'true');
      const res = await whapi.postForm<{
        userText: string; reply: string | null; audioBase64: string | null; contentType: string | null;
        timings?: { sttMs: number; llmMs: number; ttsMs: number; totalMs: number };
      }>(`/agents/${agentId}/voice-turn`, fd);
      if (!call.active) return;
      if (res.timings) {
        setWebCallLatency({ sttMs: res.timings.sttMs, llmMs: res.timings.llmMs });
        console.info('Web call latency', res.timings);
      }

      if (res.userText && res.reply) {
        call.history = [...call.history, { role: 'user', content: res.userText }, { role: 'assistant', content: res.reply }];
        setWebCallTranscript([...call.history]);
        // Keep the stored transcript current turn-by-turn
        if (call.logId) {
          whapi.patch(`/agents/${agentId}/calls/${call.logId}`, { transcript: call.history }).catch(() => {});
        }
        setWebCallActivity('speaking');
        try {
          await playAgentAudioStream(res.reply);
        } catch (streamError) {
          console.warn('Streaming TTS failed, using buffered fallback', streamError);
          const speech = await whapi.post<{ audioBase64: string; contentType: string }>(
            `/agents/${agentId}/speak`,
            { text: res.reply }
          );
          if (speech?.audioBase64) await playAgentAudio(speech.audioBase64, speech.contentType);
        }
      }
    } catch (err: any) {
      setWebCallError(err.message || 'Voice turn failed');
    }
    // Measure the silence-hangup window from the end of the agent's reply, not
    // from earlier — the caller isn't expected to talk while the agent speaks.
    call.lastSpeechAt = Date.now();
    if (call.active) startListeningSegment();
  };

  // B1 streaming turn: POST the recorded segment to /voice-turn-stream and read
  // the NDJSON response, playing each sentence's audio the moment it arrives so
  // the agent starts speaking before its full reply is generated. Falls back to
  // the buffered submitVoiceTurn if the request fails before producing output
  // (e.g. a backend without the streaming endpoint).
  const submitVoiceTurnStreaming = async (blob: Blob) => {
    const call = callRef.current;
    setWebCallActivity('processing');
    const { token, workspaceId } = getAuth();

    let userText = '';
    let replyText = '';
    let producedOutput = false;

    // Play queued sentence audio strictly in order. Awaiting playChain at the
    // end guarantees listening only resumes once the agent finishes speaking
    // (same half-duplex model as the buffered path).
    let playChain: Promise<void> = Promise.resolve();
    const enqueueAudio = (audioBase64: string, contentType: string) => {
      playChain = playChain.then(async () => {
        if (!call.active) return;
        setWebCallActivity('speaking');
        await playAgentAudio(audioBase64, contentType);
      });
    };

    try {
      const fd = new FormData();
      fd.append('audio', blob, 'turn.webm');
      fd.append('history', JSON.stringify(call.history));

      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/agents/${agentId}/voice-turn-stream`,
        {
          method: 'POST',
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: fd,
        }
      );
      if (!res.ok || !res.body) throw new Error(`Streaming voice turn failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let evt: {
            type: string; userText?: string; text?: string; reply?: string | null;
            audioBase64?: string | null; contentType?: string | null; message?: string;
            timings?: { sttMs: number; llmMs: number; ttsMs: number; ttfaMs: number; totalMs: number };
          };
          try { evt = JSON.parse(line); } catch { continue; }

          if (evt.type === 'transcript') {
            userText = evt.userText || '';
          } else if (evt.type === 'sentence') {
            producedOutput = true;
            if (evt.text) replyText += (replyText ? ' ' : '') + evt.text;
            if (evt.audioBase64) enqueueAudio(evt.audioBase64, evt.contentType || 'audio/mpeg');
          } else if (evt.type === 'done') {
            if (evt.reply) replyText = evt.reply;
            if (evt.timings) {
              setWebCallLatency({ sttMs: evt.timings.sttMs, llmMs: evt.timings.llmMs });
              console.info('Web call streaming latency', evt.timings);
            }
          } else if (evt.type === 'error') {
            throw new Error(evt.message || 'Streaming voice turn error');
          }
        }
      }

      if (!call.active) return;
      await playChain; // let all queued sentence audio finish playing

      if (userText && replyText) {
        call.history = [...call.history, { role: 'user', content: userText }, { role: 'assistant', content: replyText }];
        setWebCallTranscript([...call.history]);
        if (call.logId) {
          whapi.patch(`/agents/${agentId}/calls/${call.logId}`, { transcript: call.history }).catch(() => {});
        }
      }
    } catch (err: any) {
      // Nothing streamed yet → the endpoint is unavailable/failed early; use the
      // buffered turn, which resumes listening itself.
      if (!producedOutput && call.active) {
        return submitVoiceTurn(blob);
      }
      setWebCallError(err.message || 'Voice turn failed');
    }
    call.lastSpeechAt = Date.now();
    if (call.active) startListeningSegment();
  };

  // ─── B2: modular Web Call over a persistent WebSocket ───────────────────────
  // The client still owns VAD endpointing, history and the call log; the socket
  // just streams caller PCM up and plays the reply's sentence audio as it comes
  // back. playAgentAudio routes through connectAgentPlayer, so the reply is
  // still captured into the full-call recording — nothing regresses.

  // Append the next queued audio chunk to the MediaSource (only one append may
  // be in flight; the rest wait for 'updateend', which re-invokes this).
  const pumpModular = (session: ModularPlaybackSession) => {
    if (!session.sourceBuffer || session.sourceBuffer.updating) return;
    if (session.queue.length > 0) {
      const chunk = session.queue.shift()!;
      try { session.sourceBuffer.appendBuffer(chunk); } catch { session.finish(); return; }
      if (!session.started) {
        session.started = true;
        session.audioEl?.play().catch(() => session.finish());
      }
    } else if (session.ended && session.mediaSource?.readyState === 'open' && !session.sourceBuffer.updating) {
      try { session.mediaSource.endOfStream(); } catch { /* already ended */ }
    }
  };

  // B4: open a streaming playback session for the reply. Audio plays on the
  // first byte via MediaSource; connectAgentPlayer keeps it in the recording.
  const startModularPlayback = (contentType: string | null) => {
    const call = callRef.current;
    const epoch = call.turnEpoch;
    const ct = contentType || 'audio/mpeg';
    const useMS = typeof window.MediaSource !== 'undefined' && MediaSource.isTypeSupported(ct);
    setWebCallActivity('speaking');

    let resolveDone!: () => void;
    call.modularPlaybackDone = new Promise<void>((r) => { resolveDone = r; });

    let finished = false;
    const session: ModularPlaybackSession = {
      mediaSource: null, audioEl: null, url: null, sourceBuffer: null,
      queue: [], ended: false, started: false, epoch, useMediaSource: useMS,
      contentType: ct, blobChunks: [],
      finish: () => {
        if (finished) return; finished = true;
        if (session.url) { try { URL.revokeObjectURL(session.url); } catch { /* noop */ } }
        if (call.stopPlayback && call.modularSession === session) call.stopPlayback = null;
        resolveDone();
      },
    };
    call.modularSession = session;

    if (!useMS) return; // buffered-blob fallback is built at endModularPlayback

    const mediaSource = new MediaSource();
    const url = URL.createObjectURL(mediaSource);
    const audioEl = new Audio(url);
    session.mediaSource = mediaSource;
    session.url = url;
    session.audioEl = audioEl;
    connectAgentPlayer(audioEl); // route into the call recording mix
    call.stopPlayback = () => { try { audioEl.pause(); } catch { /* noop */ } session.finish(); };
    audioEl.onended = () => session.finish();
    audioEl.onerror = () => session.finish();

    mediaSource.addEventListener('sourceopen', () => {
      if (call.turnEpoch !== epoch) { session.finish(); return; }
      try {
        const sb = mediaSource.addSourceBuffer(ct);
        session.sourceBuffer = sb;
        sb.addEventListener('updateend', () => pumpModular(session));
        sb.addEventListener('error', () => session.finish());
        pumpModular(session);
      } catch { session.finish(); }
    }, { once: true });
  };

  const appendModularChunk = (data: ArrayBuffer) => {
    const call = callRef.current;
    const session = call.modularSession;
    if (!session || session.epoch !== call.turnEpoch) return; // stale / barged
    const buf = data.slice(0); // detach a private copy of the frame's bytes
    if (session.useMediaSource) { session.queue.push(buf); pumpModular(session); }
    else session.blobChunks.push(buf);
  };

  const endModularPlayback = () => {
    const call = callRef.current;
    const session = call.modularSession;
    if (!session) return;
    session.ended = true;
    if (session.useMediaSource) { pumpModular(session); return; }
    // Fallback: MediaSource can't play this codec — play the whole thing as one
    // blob once fully received.
    if (!session.blobChunks.length) { session.finish(); return; }
    const blob = new Blob(session.blobChunks as BlobPart[], { type: session.contentType });
    const url = URL.createObjectURL(blob);
    const audioEl = new Audio(url);
    session.audioEl = audioEl;
    session.url = url;
    connectAgentPlayer(audioEl);
    call.stopPlayback = () => { try { audioEl.pause(); } catch { /* noop */ } session.finish(); };
    audioEl.onended = () => session.finish();
    audioEl.onerror = () => session.finish();
    audioEl.play().catch(() => session.finish());
  };

  // A turn finished: commit user + assistant text to history/transcript, then
  // resume listening once all queued sentence audio has drained.
  const finishModularTurn = (event: Extract<ModularCallEvent, { type: 'done' }>) => {
    const call = callRef.current;
    const userText = call.pendingUserText;
    const reply = event.reply || '';
    call.pendingUserText = '';
    if (userText) call.history = [...call.history, { role: 'user', content: userText }];
    if (reply) call.history = [...call.history, { role: 'assistant', content: reply }];
    if (userText || reply) {
      setWebCallTranscript([...call.history]);
      if (call.logId) {
        whapi.patch(`/agents/${agentId}/calls/${call.logId}`, { transcript: call.history }).catch(() => {});
      }
    }
    if (event.timings) {
      setWebCallLatency({ sttMs: event.timings.sttMs, llmMs: event.timings.llmMs });
      console.info('Web call socket latency', event.timings);
    }
    // Resume listening only once the reply audio has finished playing.
    const done = call.modularPlaybackDone || Promise.resolve();
    done.then(() => {
      call.lastSpeechAt = Date.now();
      if (call.active && call.socketMode) startListeningSegmentSocket();
    });
  };

  const onModularEvent = (event: ModularCallEvent) => {
    const call = callRef.current;
    if (!call.active && event.type !== 'error') return;
    switch (event.type) {
      case 'ready':
        break; // resolved by modularCallSocket.start()
      case 'transcript':
        if (event.role === 'user' && event.done) call.pendingUserText = event.text;
        if (event.role === 'assistant') setWebCallActivity('speaking');
        break;
      case 'audio-start':
        startModularPlayback(event.contentType);
        break;
      case 'audio-chunk':
        appendModularChunk(event.data);
        break;
      case 'audio-end':
        endModularPlayback();
        break;
      case 'done':
        finishModularTurn(event);
        break;
      case 'error':
        if (call.active && event.message !== 'Call ended') setWebCallError(event.message);
        break;
    }
  };

  // Socket-mode equivalent of startListeningSegment: same analyser VAD, but the
  // caller's audio is streamed live to the server as PCM (no MediaRecorder /
  // upload) and the turn ends with a tiny `end-turn` control frame.
  const startListeningSegmentSocket = () => {
    const call = callRef.current;
    if (!call.active || !call.analyser || !call.socketMode) return;
    setWebCallActivity('listening');
    call.turnEpoch += 1;
    modularCallSocket.startTurn(call.audioCtx?.sampleRate || 24000);
    call.capturingPcm = true;

    const data = new Uint8Array(call.analyser.fftSize);
    let speechDetected = false;
    let lastSpeechAt = Date.now();
    const startedAt = Date.now();
    const SPEECH_RMS = 0.025;
    const SILENCE_MS = Math.min(900, Math.max(350, sttSilenceTimeoutMs || 450));
    const MAX_SEGMENT_MS = 20000;

    call.vadTimer = window.setInterval(() => {
      if (!call.active || !call.analyser) return;
      call.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const d = (data[i] - 128) / 128; sum += d * d; }
      const rms = Math.sqrt(sum / data.length);
      if (rms > SPEECH_RMS) { speechDetected = true; lastSpeechAt = Date.now(); }
      const silentFor = Date.now() - lastSpeechAt;
      if ((speechDetected && silentFor > SILENCE_MS) || Date.now() - startedAt > MAX_SEGMENT_MS) {
        if (call.vadTimer) { clearInterval(call.vadTimer); call.vadTimer = null; }
        call.capturingPcm = false;
        if (!speechDetected) {
          modularCallSocket.cancelTurn();
          if (maxSilenceBeforeHangup > 0 && Date.now() - call.lastSpeechAt > maxSilenceBeforeHangup * 1000) {
            handleEndWebCall();
            return;
          }
          startListeningSegmentSocket();
          return;
        }
        call.lastSpeechAt = Date.now();
        setWebCallActivity('processing');
        modularCallSocket.endTurn(call.history);
      }
    }, 100);
  };

  // Web Call via a bundled Conversational Agent (xAI or ElevenLabs): a single
  // persistent WebSocket carrying continuous audio both ways (see
  // xaiCallSocket.ts — engine-agnostic despite the name, it just streams PCM
  // to the server, which picks the engine from the agent's saved
  // voiceEngine), replacing the modular record-segment→POST→TTS flow
  // entirely. The server bridge creates and finalizes the Recent Calls log
  // entry itself, so no client-side /calls POST/PATCH is needed here.
  const handleStartRealtimeWebCall = async () => {
    const call = callRef.current;
    setWebCallError('');
    setWebCallLatency(null);
    setWebCallTranscript([]);
    setWebCallStatus('connecting');
    setWebCallActive(true);
    call.bundledEngine = true;
    call.active = true;
    try {
      const { token, workspaceId } = getAuth();
      if (!token || !workspaceId || !agentId) throw new Error('Missing auth/workspace context');
      await xaiCallSocket.start(workspaceId, agentId, token, (event) => {
        if (event.type === 'ready') {
          setWebCallStatus('connected');
          setWebCallActivity('listening');
        } else if (event.type === 'transcript') {
          setWebCallActivity(event.role === 'assistant' ? 'speaking' : 'listening');
          if (event.done) {
            setWebCallTranscript((prev) => [...prev, { role: event.role, content: event.text }]);
          }
        } else if (event.type === 'error') {
          if (call.active) setWebCallError(event.message);
          if (call.active) handleEndWebCall();
        }
      });
    } catch (err: any) {
      setWebCallError(err?.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow the microphone and try again.'
        : err.message || 'Could not start the call.');
      cleanupWebCall('FAILED');
      setWebCallStatus('idle');
      setWebCallActive(false);
    }
  };

  const handleStartWebCall = async () => {
    if (voiceEngine !== 'modular') return handleStartRealtimeWebCall();
    const call = callRef.current;
    call.bundledEngine = false;
    setWebCallError('');
    setWebCallLatency(null);
    setWebCallTranscript([]);
    setWebCallStatus('connecting');
    setWebCallActive(true);
    try {
      // Mic permission + welcome resolution run in PARALLEL. On the happy
      // path (page-load prefetch succeeded) the welcome audio is already in
      // memory and the agent starts speaking the moment the mic is granted.
      const micPromise = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      // The welcome audio is ALWAYS synthesized at call time so the server
      // resolves the agent's CURRENT voice — a blob prefetched earlier could
      // have been made with a previously configured voice, which made the
      // welcome and the replies speak in different voices. The page-load
      // prefetch warmed the server's TTS cache, so this is normally instant.
      let welcome = welcomeAudioRef.current?.welcome ?? welcomeMessage;
      const welcomeSpeech: { current: { audioBase64: string; contentType: string } | null } = { current: null };
      const welcomeFetch = (async () => {
        try {
          const rw = await whapi.get<{ welcome: string }>(`/agents/${agentId}/welcome`);
          if (rw?.welcome) welcome = rw.welcome;
          const w = await whapi.post<{ audioBase64: string; contentType: string; voiceUsed?: string }>(
            `/agents/${agentId}/speak`, { text: welcome }
          );
          if (w?.audioBase64) {
            welcomeSpeech.current = { audioBase64: w.audioBase64, contentType: w.contentType };
            console.info('[web-call] welcome voice:', w.voiceUsed);
          } else {
            console.warn('[web-call] /speak returned no audio for the welcome');
          }
        } catch (e: any) {
          // A TTS failure shouldn't kill the call, but the caller must know WHY
          // the agent is silent — otherwise it looks like a broken agent.
          console.error('[web-call] welcome TTS failed:', e?.message || e);
          setWebCallError(
            `Voice is unavailable — the agent is running text-only. ${e?.message || 'TTS synthesis failed.'} ` +
            `Check that a voice-provider API key (e.g. SARVAM_API_KEY / ELEVENLABS_API_KEY) is set in backend/.env and that voices are synced.`
          );
        }
      })();

      const stream = await micPromise;
      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      const micSource = audioCtx.createMediaStreamSource(stream);
      micSource.connect(analyser);

      // B2: open the persistent modular Web Call socket and tap mic PCM into it.
      // The socket carries every turn; the analyser above still drives VAD.
      const { token: sockToken, workspaceId: sockWs } = getAuth();
      if (!sockToken || !sockWs || !agentId) throw new Error('Missing auth/workspace context');
      await modularCallSocket.start(sockWs, agentId, sockToken, onModularEvent);
      await audioCtx.audioWorklet.addModule('/xai-mic-worklet.js');
      const micWorklet = new AudioWorkletNode(audioCtx, 'xai-mic-capture');
      micSource.connect(micWorklet);
      micWorklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (callRef.current.capturingPcm) modularCallSocket.sendPcm(e.data);
      };

      // Record the whole call (both sides): mic + agent audio are mixed into
      // one stream and uploaded when the call ends.
      const mixDest = audioCtx.createMediaStreamDestination();
      micSource.connect(mixDest);
      const mixChunks: Blob[] = [];
      const mixRecorder = new MediaRecorder(mixDest.stream);
      mixRecorder.ondataavailable = (e) => { if (e.data.size > 0) mixChunks.push(e.data); };
      mixRecorder.start(1000);

      // Ambient Sound (Call Configuration): layer a synthesized background bed
      // for the duration of the call, captured into the recording too.
      const ambientStop = startAmbientSound(audioCtx, ambientSound, mixDest);

      Object.assign(call, { active: true, stream, audioCtx, analyser, history: [], mixDest, mixRecorder, mixChunks, logId: null, lastSpeechAt: Date.now(), ambientStop, socketMode: true, micWorklet, capturingPcm: false, modularPlayChain: null, pendingUserText: '', turnEpoch: 0 });

      // Barge-in: while the agent is speaking (call.stopPlayback set), watch the
      // mic for sustained speech and cut the agent off so the caller can
      // interrupt. Mic echo-cancellation keeps the agent's own voice out of
      // this signal; the threshold + sustain window guard against residual echo.
      let bargeActiveMs = 0;
      call.bargeTimer = window.setInterval(() => {
        if (!call.active || !call.analyser || !call.stopPlayback) { bargeActiveMs = 0; return; }
        const buf = new Uint8Array(call.analyser.fftSize);
        call.analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
        const rms = Math.sqrt(sum / buf.length);
        if (rms > 0.045) {
          bargeActiveMs += 80;
          if (bargeActiveMs >= 240) { // ~0.24s of speech over the agent
            bargeActiveMs = 0;
            const stop = call.stopPlayback;
            call.stopPlayback = null;
            setWebCallActivity('listening');
            if (call.socketMode) {
              // Skip any still-queued sentence audio and tell the server to
              // stop generating the rest of the reply. Its `done` event then
              // drives the resume-listening (via finishModularTurn).
              call.turnEpoch += 1;
              modularCallSocket.barge();
            }
            stop?.(); // cut the agent off; playback promise resolves → we listen
          }
        } else {
          bargeActiveMs = 0;
        }
      }, 80);

      // Open the Recent Calls history entry for this call
      whapi.post<{ call?: { id: string } }>(`/agents/${agentId}/calls`, { type: 'WEB_CALL', transcript: [], status: 'IN_PROGRESS' })
        .then((r) => {
          call.logId = r?.call?.id ?? null;
          if (call.logId && call.history.length) {
            whapi.patch(`/agents/${agentId}/calls/${call.logId}`, { transcript: call.history }).catch(() => {});
          }
        })
        .catch((e) => console.error('Failed to start call history entry', e));

      setWebCallStatus('connected');

      // Agent speaks the welcome message first, like a real call.
      await welcomeFetch;
      call.history = [{ role: 'assistant', content: welcome }];
      setWebCallTranscript([...call.history]);
      if (call.active && welcomeSpeech.current) {
        setWebCallActivity('speaking');
        await playAgentAudio(welcomeSpeech.current.audioBase64, welcomeSpeech.current.contentType);
      }

      if (call.active) startListeningSegmentSocket();
    } catch (err: any) {
      setWebCallError(
        err?.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow the microphone and try again.'
          : err.message || 'Could not start the call.'
      );
      cleanupWebCall('FAILED');
      setWebCallStatus('idle');
      setWebCallActive(false);
    }
  };

  const cleanupWebCall = (finalStatus: 'COMPLETED' | 'FAILED' = 'COMPLETED') => {
    const call = callRef.current;
    call.active = false;
    if (call.bundledEngine) {
      // The server-side bridge (webCallRealtime.handler.js) owns the Recent
      // Calls log for this call and finalizes it when the socket closes.
      call.bundledEngine = false;
      xaiCallSocket.stop();
      return;
    }
    if (call.vadTimer) { clearInterval(call.vadTimer); call.vadTimer = null; }
    if (call.bargeTimer) { clearInterval(call.bargeTimer); call.bargeTimer = null; }
    call.stopPlayback = null;
    // B2 modular socket teardown (recording/ambient below still run as before).
    if (call.socketMode) {
      call.socketMode = false;
      call.capturingPcm = false;
      call.turnEpoch += 1; // drop any queued sentence audio
      try { modularCallSocket.stop(); } catch { /* already closed */ }
    }
    if (call.micWorklet) { try { call.micWorklet.disconnect(); } catch { /* noop */ } call.micWorklet = null; }
    if (call.ambientStop) { call.ambientStop(); call.ambientStop = null; }
    if (call.recorder && call.recorder.state !== 'inactive') { try { call.recorder.stop(); } catch { /* already stopped */ } }
    call.recorder = null;
    if (call.player) { try { call.player.pause(); } catch { /* noop */ } call.player = null; }
    call.stream?.getTracks().forEach((t) => t.stop());
    call.stream = null;

    // Finalize the history entry: flush the mixed recording, upload it, and
    // mark the call ended. The AudioContext closes only after the recorder
    // has flushed, so the tail of the recording isn't lost.
    const { mixRecorder, mixChunks, logId, history, audioCtx } = call;
    call.mixRecorder = null;
    call.mixDest = null;
    call.mixChunks = [];
    call.logId = null;
    call.audioCtx = null;
    call.analyser = null;
    const finalize = async (blob: Blob | null) => {
      audioCtx?.close().catch(() => {});
      if (!logId) return;
      try {
        await whapi.patch(`/agents/${agentId}/calls/${logId}`, { transcript: history, status: finalStatus, ended: true });
        if (blob && blob.size > 0) {
          const fd = new FormData();
          fd.append('recording', blob, 'web-call.webm');
          await whapi.postForm(`/agents/${agentId}/calls/${logId}/recording`, fd);
        }
      } catch (e) {
        console.error('Failed to store call history', e);
      }
    };
    if (mixRecorder && mixRecorder.state !== 'inactive') {
      mixRecorder.onstop = () => finalize(new Blob(mixChunks, { type: mixRecorder.mimeType || 'audio/webm' }));
      try { mixRecorder.stop(); } catch { finalize(null); }
    } else {
      finalize(mixChunks.length ? new Blob(mixChunks, { type: 'audio/webm' }) : null);
    }
  };

  const handleEndWebCall = () => {
    cleanupWebCall();
    setWebCallStatus('ended');
    setTimeout(() => {
      setWebCallActive(false);
      setWebCallStatus('idle');
    }, 1000);
  };

  // Stop mic/audio if the page unmounts mid-call
  useEffect(() => () => cleanupWebCall(), []);

  const handlePhoneCall = async () => {
    if (!phoneTestNumber.trim()) return;
    try {
      const res = await whapi.post<{ message: string }>('/agents/test-call', { agentId, phoneNumber: phoneTestNumber, fromNumber: fromNumber || undefined });
      alert(res.message || `Test call initiated to ${phoneTestNumber}.`);
      setShowPhoneCallModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to initiate test call. Please check your Twilio configuration.');
    }
  };


  if (isLoading) {
    return (
      <div style={{ width: '100%', minHeight: '100vh', background: '#0f0f0f', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
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
    <div style={{ width: '100%', minHeight: '100vh', background: '#0f0f0f', color: 'var(--text-primary)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
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
              <button onClick={() => setShowLanguageModal(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #333', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={() => { setShowLanguageModal(false); handleSave(); }} style={{ padding: '10px 20px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Done</button>
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

      {/* Conversational Agent Modal — 3-way choice: Off / xAI / ElevenLabs */}
      {showXaiModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '30px', maxWidth: '560px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Conversational Agent</h2>
              <button onClick={() => setShowXaiModal(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}>X</button>
            </div>
            <p style={{ fontSize: '13px', color: '#999', lineHeight: 1.6, marginBottom: '20px' }}>
              Routes this agent's Web Call and Phone Call through a single bundled speech-to-speech
              engine that replaces Languages, Voice (TTS), AI Model (LLM) and Transcription (STT).
              Those four settings are disabled while one is active; choose Off to configure them
              individually again.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {([
                { value: 'modular' as const, label: 'Off (modular pipeline)' },
                { value: 'xai' as const, label: 'xAI Grok Voice Agent' },
                { value: 'elevenlabs' as const, label: 'ElevenLabs Conversational AI' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setVoiceEngine(opt.value); setShowXaiModal(false); handleSave({ voiceEngine: opt.value }); }}
                  style={{ padding: '12px', background: voiceEngine === opt.value ? '#00bcd4' : '#0f0f0f', color: voiceEngine === opt.value ? '#000' : '#fff', border: voiceEngine === opt.value ? 'none' : '1px solid #333', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: voiceEngine === opt.value ? 600 : 400, textAlign: 'left' }}
                >
                  {opt.label}
                </button>
              ))}
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
                  onClick={() => { setAiModel(model); setShowModelModal(false); handleSave({ aiModel: model }); }}
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
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '30px', maxWidth: '900px', width: '90%' }}>
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
                      color: 'var(--text-primary)'
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
                            color: 'var(--text-primary)',
                            background: sttProvider === provider ? '#1a1a1a' : 'transparent'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#1a1a1a'}
                          onMouseLeave={(e) => e.currentTarget.style.background = sttProvider === provider ? '#1a1a1a' : 'transparent'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MicIcon />
                            <span>{provider}</span>
                          </div>
                          {sttProvider === provider && <span style={{ color: 'var(--text-primary)', fontSize: '12px' }}>OK</span>}
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
                    <span style={{ color: 'var(--text-primary)' }}>{sttSilenceTimeoutMs}ms</span>
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
                    border: '1px solid var(--border)', 
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
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', background: sttModel === model ? '#1a1a1a' : 'transparent' }}
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
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', background: sttLanguage === lang ? '#1a1a1a' : 'transparent' }}
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
                  handleSave({ transcription: sttProvider });
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
          <div style={{ background: '#1a1a1a', borderRadius: '12px', padding: '32px', maxWidth: '480px', width: '90%', textAlign: 'center', border: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
              <button onClick={() => { cleanupWebCall(); setShowWebCallModal(false); setWebCallActive(false); setWebCallStatus('idle'); }} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '20px' }}>✕</button>
            </div>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: webCallStatus === 'connected' ? 'rgba(76,175,80,0.2)' : webCallStatus === 'connecting' ? 'rgba(255,152,0,0.2)' : 'rgba(0,188,212,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: webCallStatus === 'connected' ? '2px solid #4caf50' : '2px solid #00bcd4', transition: 'all 0.3s', animation: webCallStatus === 'connected' && webCallActivity === 'listening' ? 'pulse 1.6s ease-in-out infinite' : undefined }}>
              <span style={{ fontSize: '36px' }}>{webCallStatus === 'connected' ? (webCallActivity === 'speaking' ? '🔊' : webCallActivity === 'processing' ? '💭' : '🎙️') : webCallStatus === 'connecting' ? '⏳' : '🌐'}</span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 8px', color: 'var(--text-primary)' }}>
              {webCallStatus === 'idle' ? 'Web Call Test' : webCallStatus === 'connecting' ? 'Connecting...' : webCallStatus === 'connected' ? (webCallActivity === 'speaking' ? `${agentName} is speaking…` : webCallActivity === 'processing' ? 'Responding…' : 'Listening…') : 'Call Ended'}
            </h3>
            <p style={{ fontSize: '13px', color: '#999', marginBottom: '16px' }}>
              {webCallStatus === 'idle' ? `Test your agent "${agentName}" with a browser-based voice call.` : webCallStatus === 'connecting' ? 'Requesting microphone & starting the agent...' : webCallStatus === 'connected' ? 'Speak naturally — pause briefly when you finish and the agent will respond.' : 'The test call has ended.'}
            </p>
            {webCallError && (
              <p style={{ fontSize: '13px', color: '#ef4444', marginBottom: '16px' }}>{webCallError}</p>
            )}
            {webCallLatency && webCallStatus === 'connected' && (
              <p style={{ fontSize: '12px', color: '#777', margin: '-8px 0 14px' }}>
                STT {(webCallLatency.sttMs / 1000).toFixed(1)}s | AI {(webCallLatency.llmMs / 1000).toFixed(1)}s
              </p>
            )}
            {webCallTranscript.length > 0 && (
              <div style={{ maxHeight: '220px', overflowY: 'auto', textAlign: 'left', background: '#111', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '12px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {webCallTranscript.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '8px 12px', borderRadius: '10px', fontSize: '13px', lineHeight: 1.45, background: m.role === 'user' ? '#00bcd4' : '#242424', color: m.role === 'user' ? '#000' : 'var(--text-primary)' }}>
                    {m.content}
                  </div>
                ))}
              </div>
            )}
            {!webCallActive ? (
              <button
                onClick={handleStartWebCall}
                style={{ padding: '14px 32px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
              >🎤 Start Web Call</button>
            ) : webCallStatus === 'connected' ? (
              <button
                onClick={handleEndWebCall}
                style={{ padding: '14px 32px', background: '#ef4444', color: 'var(--text-primary)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
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
                style={{ width: '100%', background: '#0f0f0f', border: '1px solid #333', borderRadius: '8px', padding: '12px 14px', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <CallerNumberPicker value={fromNumber} onChange={setFromNumber} />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPhoneCallModal(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #333', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
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
      <div style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid #1a1a1a', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '18px', padding: 0 }}>{'<'}</button>
        
        <input
          type="text"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          style={{
            padding: '8px 12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: '600',
            outline: 'none',
            minWidth: '240px'
          }}
          placeholder="Agent Name"
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', background: callDirection === 'OUTBOUND' ? '#1f150f' : '#0f1f12', border: `1px solid ${callDirection === 'OUTBOUND' ? '#3a2a1a' : '#1a3a22'}`, borderRadius: '12px', fontSize: '11px', color: callDirection === 'OUTBOUND' ? '#ff9800' : '#4caf50', fontWeight: '500' }}>
          <span style={{ fontSize: '8px' }}>o</span> {callDirection === 'OUTBOUND' ? 'Outgoing' : 'Incoming'}
        </div>

        <div style={{ fontSize: '12px', color: '#888' }}>Cost/min: $0.115</div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Ask AI Button */}
          <button
            onClick={() => { setShowAskAIModal(true); setAskAIResponse(''); setAskAIInput(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#ff9800', color: 'var(--text-primary)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', transition: 'opacity 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >✨ Ask AI</button>
          
          {/* Test With Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: '500' }}>Test with</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-elevated)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
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
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: deployStatus === 'done' ? '#2e7d32' : deployStatus === 'deploying' ? '#444' : '#1a1a1a', color: 'var(--text-primary)', border: '1px solid #333', borderRadius: '6px', cursor: deployStatus === 'deploying' ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '500', transition: 'all 0.3s' }}
              disabled={deployStatus === 'deploying'}
            >
              {deployStatus === 'deploying' ? '⏳ Deploying...' : deployStatus === 'done' ? '✅ Deployed!' : '🚀 Deploy'} <span style={{ fontSize: '10px', opacity: 0.7 }}>▼</span>
            </button>
            {showDeployDropdown && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', minWidth: '200px', zIndex: 200, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                <div style={{ padding: '8px 0' }}>
                  <div onClick={handleDeploy} style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', gap: '10px', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.background = '#222'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span>🚀</span> Save & Deploy
                  </div>
                  <div onClick={() => { handleSave(); setShowDeployDropdown(false); }} style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', gap: '10px', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.background = '#222'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
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
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '20px', padding: '2px' }}>
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
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
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
              <div style={{ padding: '40px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', margin: '20px 30px', color: 'var(--text-primary)' }}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>Agent not found</h2>
                <p style={{ color: '#999', marginTop: '10px' }}>The assistant you are trying to edit does not exist or has been removed. Return to the dashboard to select a different assistant.</p>
                <button onClick={() => navigate('/dashboard')} style={{ marginTop: '16px', padding: '10px 18px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Back to Dashboard</button>
              </div>
            )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1a1a1a', background: 'var(--bg-secondary)', padding: '0 24px', gap: '24px', overflowX: 'auto', alignItems: 'center' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', minWidth: '200px' }}>
          <span style={{ color: '#666', marginRight: '8px', fontSize: '14px' }}>S</span>
          <input 
            type="text" 
            placeholder="Search or jump to..." 
            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', width: '100%' }}
          />
          <div style={{ background: '#222', color: '#999', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>Ctrl+K</div>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'code' ? (
        <div style={{ padding: '30px 24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '18px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            style={{ width: '100%', minHeight: '500px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', color: '#00bcd4', fontSize: '13px', fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button
              onClick={() => { navigator.clipboard.writeText(JSON.stringify({ name: agentName, welcomeMessage, aiModel, voice, transcription, languages: selectedLanguages, flowItems, maxDuration, silenceTimeout, dynamicEnabled, interruptibleEnabled, postCallConfigs }, null, 2)); alert('Copied to clipboard!'); }}
              style={{ padding: '10px 20px', background: '#1a1a1a', border: '1px solid #333', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
            >📋 Copy JSON</button>
            <button
              onClick={() => { const blob = new Blob([JSON.stringify({ name: agentName, welcomeMessage, aiModel, voice, transcription, languages: selectedLanguages, flowItems, maxDuration, silenceTimeout, dynamicEnabled, interruptibleEnabled, postCallConfigs }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${agentName.replace(/\s+/g, '_')}_config.json`; a.click(); URL.revokeObjectURL(url); }}
              style={{ padding: '10px 20px', background: '#1a1a1a', border: '1px solid #333', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
            >⬇️ Download JSON</button>
          </div>
        </div>
      ) : (
      <div style={{ padding: '30px 24px' }}>
        {activeTab === 'details' && (
          <>
            {/* Assistant Settings */}
            <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '18px', display: 'flex', alignItems: 'center', color: 'var(--text-primary)' }}>
              Assistant Settings <InfoIcon />
            </div>
            <div style={{ background: '#0c0c0c', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px 30px 20px', marginBottom: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '14px', marginBottom: '0' }}>
              {[
                { icon: 'O', label: 'Languages', value: selectedLanguages.length > 0 ? selectedLanguages.join(', ') : 'No languages selected', onClick: () => setShowLanguageModal(true) },
                { icon: 'V', label: 'Voice (TTS)', value: voice, onClick: () => setShowVoiceModal(true) },
                { icon: '{}', label: 'AI Model (LLM)', value: aiModel, onClick: () => setShowModelModal(true) },
                { icon: '|||', label: 'Transcription (STT)', value: transcription, onClick: () => setShowTranscriptionModal(true) }
              ].map((item, i) => {
                // A bundled Conversational Agent replaces the LLM + STT entirely,
                // but it can still take a Voice and Language — so keep those two
                // tiles configurable and only lock down AI Model (LLM) and
                // Transcription (STT).
                const engineHandled = item.label === 'AI Model (LLM)' || item.label === 'Transcription (STT)';
                const disabled = voiceEngine !== 'modular' && engineHandled;
                const engineLabel = voiceEngine === 'xai' ? 'xAI' : voiceEngine === 'elevenlabs' ? 'ElevenLabs' : '';
                return (
                <div
                  key={i}
                  onClick={() => {
                    if (disabled) { toast.info(`Handled automatically by the ${engineLabel} Conversational Agent. Turn it off to configure this manually.`); return; }
                    item.onClick();
                  }}
                  style={{ background: '#062021', border: '1px solid #0d5154', borderRadius: '14px', padding: '20px 16px', display: 'flex', alignItems: 'center', gap: '14px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, transition: 'background 0.2s, opacity 0.2s' }}
                  onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#08282a'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#062021'; }}
                >
                  <div style={{ width: '34px', height: '34px', borderRadius: '11px', background: '#07393b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: '#11c7cf', fontWeight: '700' }}>
                    <span>{item.icon}</span>
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '700', marginBottom: '4px' }}>{item.label}</div>
                    <div style={{ fontSize: '12px', color: '#b3b3b3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{disabled ? `Handled by ${engineLabel}` : item.value}</div>
                  </div>
                  <InfoIcon />
                </div>
                );
              })}
              {/* Conversational Agent — mutually exclusive master switch for the
                  four tiles above: when xAI or ElevenLabs is active, that bundled
                  speech-to-speech engine replaces the modular pipeline entirely. */}
              <div
                onClick={() => setShowXaiModal(true)}
                style={{ background: voiceEngine !== 'modular' ? '#0d3b2e' : '#062021', border: voiceEngine !== 'modular' ? '1px solid #11c7cf' : '1px solid #0d5154', borderRadius: '14px', padding: '20px 16px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.background = voiceEngine !== 'modular' ? '#0f4636' : '#08282a'}
                onMouseLeave={(e) => e.currentTarget.style.background = voiceEngine !== 'modular' ? '#0d3b2e' : '#062021'}
              >
                <div style={{ width: '34px', height: '34px', borderRadius: '11px', background: '#07393b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', color: '#11c7cf', fontWeight: '700' }}>
                  <span>&#10022;</span>
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '700', marginBottom: '4px' }}>Conversational Agent</div>
                  <div style={{ fontSize: '12px', color: voiceEngine !== 'modular' ? '#4fe0c9' : '#b3b3b3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {voiceEngine === 'xai' ? 'Active — xAI Grok' : voiceEngine === 'elevenlabs' ? 'Active — ElevenLabs' : 'Off'}
                  </div>
                </div>
                <InfoIcon />
              </div>
            </div>
            </div>

            {/* Welcome Message */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '0', marginBottom: '20px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 30px', borderBottom: '1px solid #1c1c1c' }}>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
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
                    border: '1px solid var(--border)',
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
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 30px', borderBottom: '1px solid #1c1c1c' }}>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
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
                <button onClick={addFlowItem} style={{ padding: '10px 18px', background: 'transparent', border: '1px solid #2d2d2d', borderRadius: '10px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>+ Add Section</button>
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
                        <span style={{ fontSize: '14px', fontWeight: '700', width: '22px', color: 'var(--text-primary)' }}>{index + 1}.</span>

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
                            color: 'var(--text-primary)',
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#b3b3b3', fontWeight: '700', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 10px', height: '32px' }}>
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
                              border: '1px solid var(--border)',
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

            <button onClick={() => handleSave()} disabled={isSaving} style={{ marginTop: '20px', padding: '10px 24px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '6px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '13px', opacity: isSaving ? 0.6 : 1 }}>
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
                <div key={section.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                  <div 
                    onClick={() => setExpandedConfigSection(expandedConfigSection === section.id ? null : section.id)}
                    style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#062d2f', color: '#12c8d0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' }}>
                        {i === 0 ? 'o' : i === 1 ? 'X' : i === 2 ? 'R' : i === 3 ? '=' : 'n'}
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '2px' }}>{section.title}</div>
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
                            <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Response Delay (seconds)</label>
                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>How long the assistant waits after the user stops speaking before replying.</div>
                            <input type="range" min="1" max="10" step="1" value={silenceTimeout} onChange={e => setSilenceTimeout(Number(e.target.value))} style={{ width: '100%', accentColor: '#12c8d0' }} />
                            <div style={{ textAlign: 'right', color: '#12c8d0', fontSize: '14px', fontWeight: '700' }}>{silenceTimeout}s</div>
                          </div>
                          <div style={{ height: '1px', background: '#222' }} />
                          <div>
                            <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Max Silence Before Hangup (seconds)</label>
                            <input type="number" value={maxSilenceBeforeHangup} onChange={e => setMaxSilenceBeforeHangup(Number(e.target.value))} style={{ width: '100%', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none' }} />
                          </div>
                        </div>
                      )}
                      
                      {section.id === 'endCall' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div>
                            <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Maximum Call Duration (minutes)</label>
                            <input type="number" min="1" max="120" value={maxDuration} onChange={e => setMaxDuration(Number(e.target.value))} style={{ width: '100%', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>End Call Message</label>
                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>The message the agent will speak right before ending the call intentionally.</div>
                            <input type="text" value={endCallMessage} onChange={e => setEndCallMessage(e.target.value)} style={{ width: '100%', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none' }} />
                          </div>
                        </div>
                      )}

                      {section.id === 'transfer' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div>
                            <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Transfer Phone Number</label>
                            <input type="text" placeholder="+1234567890" value={transferNumber} onChange={e => setTransferNumber(e.target.value)} style={{ width: '100%', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Transfer Condition Prompt</label>
                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>When should the agent initiate a hand-off? e.g., "When the user asks to speak to a human or gets angry"</div>
                            <textarea value={transferCondition} onChange={e => setTransferCondition(e.target.value)} style={{ width: '100%', minHeight: '80px', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none', resize: 'vertical' }} />
                          </div>
                        </div>
                      )}

                      {section.id === 'response' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Use Filler Words</div>
                              <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>Add "umm", "ahh" to make the agent sound more human.</div>
                            </div>
                            <div onClick={() => setFillerWords(!fillerWords)} style={{ width: '42px', height: '24px', background: fillerWords ? '#12c8d0' : '#333', borderRadius: '999px', position: 'relative', cursor: 'pointer' }}>
                              <div style={{ width: '20px', height: '20px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: fillerWords ? '20px' : '2px', transition: 'left 0.2s' }} />
                            </div>
                          </div>
                          <div style={{ height: '1px', background: '#222' }} />
                          <div>
                            <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Speaking Rate (Speed)</label>
                            <input type="range" min="0.5" max="2.0" step="0.1" value={speakingRate} onChange={e => setSpeakingRate(Number(e.target.value))} style={{ width: '100%', accentColor: '#12c8d0' }} />
                            <div style={{ textAlign: 'right', color: '#12c8d0', fontSize: '14px', fontWeight: '700' }}>{speakingRate}x</div>
                          </div>
                        </div>
                      )}

                      {section.id === 'ambient' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>Select Background Noise</label>
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
            <button onClick={() => handleSave()} disabled={isSaving} style={{ marginTop: '18px', alignSelf: 'flex-start', padding: '10px 24px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '8px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '13px', opacity: isSaving ? 0.6 : 1 }}>
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
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '34px 30px 30px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px' }}>Upload PDFs{kbUploading ? ' — uploading…' : ''}</div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Add PDF files to your assistant's knowledge base</div>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    style={{ border: '2px dashed #323232', borderRadius: '14px', minHeight: '168px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '18px', cursor: 'pointer' }}
                  >
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf,.txt,.md,.csv,.json,.docx" multiple style={{ display: 'none' }} />
                    <div style={{ width: '54px', height: '54px', borderRadius: '18px', background: '#062d2f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#12c8d0', fontSize: '20px', marginBottom: '16px' }}>^</div>
                    <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px' }}>Drag and drop a file here, or click to select</div>
                    <div style={{ fontSize: '13px', color: '#b7b7b7' }}>Supported formats: PDF, TXT, MD, CSV, JSON, DOCX (max 10MB)</div>
                  </div>
                  {kbFiles.length > 0 && (
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {kbFiles.map((file) => (
                        <div key={file.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                            {file.fileName}
                            <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 11 }}>
                              {(file.sizeBytes / 1024).toFixed(0)} KB{file.hasText ? '' : ' · no text extracted'}
                            </span>
                          </span>
                          <button onClick={(e) => { e.stopPropagation(); removeKbFile(file.id); }} style={{ background: 'none', border: 'none', color: '#ff6f6f', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '34px 30px 30px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px' }}>Website Knowledge Base</div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Add website content to your assistant's knowledge base</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Website URL</label>
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
                      color: 'var(--text-primary)',
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
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
                          <button onClick={() => removeKbUrl(url)} style={{ background: 'none', border: 'none', color: '#ff6f6f', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {(() => {
              const usedMb = kbFiles.reduce((acc, file) => acc + file.sizeBytes, 0) / (1024 * 1024);
              const remainingMb = Math.max(0, 5.0 - usedMb);
              if (usedMb === 0 || remainingMb > 1.0) return null;
              return (
            <div style={{ background: '#281509', border: '1px solid #b65912', borderRadius: '14px', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#ffd95f', marginBottom: '6px' }}>Low Storage Space Warning</div>
                <div style={{ fontSize: '14px', color: '#ffd066' }}>You only have {remainingMb.toFixed(1)} MB of knowledge base storage remaining. Consider upgrading your account to avoid upload restrictions.</div>
              </div>
              <button onClick={() => window.location.href='/billing'} style={{ padding: '10px 18px', background: '#ff6f6f', border: 'none', borderRadius: '10px', color: '#1f0d0d', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                Upgrade
              </button>
            </div>
              );
            })()}
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
                border: '1px solid var(--border)',
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
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '18px 20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>Web Search</div>
                    <div style={{ fontSize: '13px', color: '#8d8d8d' }}>Allow your bot to search the web for information</div>
                  </div>

                  <div
                    onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                    style={{
                      width: '52px',
                      height: '30px',
                      background: webSearchEnabled ? 'linear-gradient(90deg, #00b894, #00caa1)' : '#232323',
                      border: webSearchEnabled ? '1px solid #00d2a8' : '1px solid #333',
                      borderRadius: '999px',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'all 0.25s ease',
                      boxShadow: webSearchEnabled ? '0 0 0 3px rgba(0, 212, 168, 0.14)' : 'none',
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
                        left: webSearchEnabled ? '26px' : '2px',
                        transition: 'left 0.25s ease'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '18px 20px'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>Integration</div>
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
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '18px 20px'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' }}>Connect New Integrations</div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
                  {integrations.map((integration) => {
                    const isDuringCall = integration.mode === 'During Call';
                    const status = integrationStatus[integration.provider];
                    const isConnected = Boolean(status?.connected);

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
                          border: '1px solid var(--border)',
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
                          {isConnected ? (
                            <span style={{ fontSize: '12px', color: '#4caf50', display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                              <span style={{ fontSize: '9px' }}>●</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {status?.accountLabel ? `Connected · ${status.accountLabel}` : 'Connected'}
                              </span>
                            </span>
                          ) : (
                            <span style={{ fontSize: '12px', color: '#7d7d7d' }}>Ready to connect</span>
                          )}
                          <button
                            onClick={async () => {
                              if (isConnected) {
                                if (!window.confirm(`Disconnect ${integration.name}? Anything configured to deliver there will stop working.`)) return;
                                setDisconnecting(integration.provider);
                                try {
                                  await integrationsApi.disconnect(integration.provider);
                                  toast.success(`${integration.name} disconnected`);
                                  await loadIntegrationStatus();
                                } catch (error) {
                                  toast.error(error instanceof Error ? error.message : 'Failed to disconnect');
                                } finally {
                                  setDisconnecting(null);
                                }
                                return;
                              }
                              try {
                                // The callback URL is derived server-side (it must match
                                // what's registered with the provider), so none is sent.
                                const { authorizationUrl, connected } = await integrationsApi.connect(integration.provider);
                                if (authorizationUrl) {
                                  window.location.href = authorizationUrl;
                                } else if (connected) {
                                  toast.success(`${integration.name ?? integration.provider} connected`);
                                  await loadIntegrationStatus();
                                } else {
                                  toast.error('This integration requires additional configuration.');
                                }
                              } catch (error) {
                                toast.error(error instanceof Error ? error.message : 'Failed to begin OAuth');
                              }
                            }}
                            disabled={disconnecting === integration.provider}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#2b2b2b';
                              e.currentTarget.style.borderColor = isConnected ? '#7a4141' : '#4a4a4a';
                              e.currentTarget.style.color = isConnected ? '#ffabab' : '#fff';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '#1f1f1f';
                              e.currentTarget.style.borderColor = isConnected ? '#4a3232' : '#3a3a3a';
                              e.currentTarget.style.color = isConnected ? '#ff8a8a' : '#f3f3f3';
                            }}
                            style={{
                              padding: '8px 14px',
                              background: '#1f1f1f',
                              border: `1px solid ${isConnected ? '#4a3232' : '#3a3a3a'}`,
                              borderRadius: '10px',
                              color: isConnected ? '#ff8a8a' : '#f3f3f3',
                              fontSize: '12px',
                              fontWeight: '700',
                              letterSpacing: '0.01em',
                              whiteSpace: 'nowrap',
                              cursor: disconnecting === integration.provider ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {disconnecting === integration.provider ? 'Working…' : isConnected ? 'Disconnect' : 'Connect'}
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
                  color: 'var(--text-primary)',
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
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '30px 30px 24px',
                  marginTop: '2px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '24px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '17px', lineHeight: 1.2, fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' }}>Delivery Method</div>
                    <select
                      value={config.deliveryMethod}
                      onChange={(e) => {
                        const deliveryMethod = e.target.value;
                        updatePostCallConfigAndSave(config.id, { deliveryMethod, url: '', email: '', spreadsheetId: '', spreadsheetName: '' });
                        if (deliveryMethod === 'Google Sheets' && spreadsheets.length === 0) loadSpreadsheets();
                      }}
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
                      <option value="Webhook">Webhook</option>
                      <option value="Email">Email</option>
                      <option value="Google Sheets">Google Sheets</option>
                      <option value="CRM" disabled>CRM (coming soon)</option>
                      <option value="Slack" disabled>Slack (coming soon)</option>
                      <option value="WhatsApp" disabled>WhatsApp (coming soon)</option>
                    </select>

                    {/* Webhook URL input */}
                    {config.deliveryMethod === 'Webhook' && (
                      <div style={{ marginTop: '14px' }}>
                        <div style={{ fontSize: '13px', color: '#a0a0a0', marginBottom: '8px' }}>Webhook URL <span style={{ color: '#ff6b6b' }}>*</span></div>
                        <input
                          type="url"
                          value={config.url}
                          onChange={(e) => updatePostCallConfig(config.id, { url: e.target.value })}
                          placeholder="https://your-server.com/webhook"
                          style={{
                            width: '400px',
                            height: '42px',
                            padding: '0 16px',
                            background: '#181818',
                            border: config.url && !/^https?:\/\/.+/.test(config.url) ? '1px solid #ff4d4f' : '1px solid #2d2d2d',
                            borderRadius: '9px',
                            color: '#ffffff',
                            fontSize: '14px',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                        {config.url && !/^https?:\/\/.+/.test(config.url) && (
                          <div style={{ fontSize: '12px', color: '#ff4d4f', marginTop: '4px' }}>Enter a valid URL starting with http:// or https://</div>
                        )}
                      </div>
                    )}

                    {/* Email address input */}
                    {config.deliveryMethod === 'Email' && (
                      <div style={{ marginTop: '14px' }}>
                        <div style={{ fontSize: '13px', color: '#a0a0a0', marginBottom: '8px' }}>Recipient Email <span style={{ color: '#ff6b6b' }}>*</span></div>
                        <input
                          type="email"
                          value={config.email}
                          onChange={(e) => updatePostCallConfig(config.id, { email: e.target.value })}
                          placeholder="recipient@example.com"
                          style={{
                            width: '400px',
                            height: '42px',
                            padding: '0 16px',
                            background: '#181818',
                            border: config.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email) ? '1px solid #ff4d4f' : '1px solid #2d2d2d',
                            borderRadius: '9px',
                            color: '#ffffff',
                            fontSize: '14px',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                        {config.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email) && (
                          <div style={{ fontSize: '12px', color: '#ff4d4f', marginTop: '4px' }}>Enter a valid email address</div>
                        )}
                      </div>
                    )}

                    {/* Google Sheets target — collapses to a confirmation once
                        chosen, so the picker/create controls don't linger and
                        read as work still to be done. */}
                    {config.deliveryMethod === 'Google Sheets' && config.spreadsheetId && !changingSheet[config.id] && (
                      <div style={{ marginTop: '14px' }}>
                        <div style={{ fontSize: '13px', color: '#a0a0a0', marginBottom: '8px' }}>Target Spreadsheet</div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          width: '480px',
                          padding: '14px 16px',
                          background: 'rgba(11,191,203,0.06)',
                          border: '1px solid rgba(11,191,203,0.35)',
                          borderRadius: '9px',
                          boxSizing: 'border-box',
                        }}>
                          <span style={{ color: '#0bbfcb', fontSize: '16px', lineHeight: 1 }}>✓</span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {config.spreadsheetName || config.spreadsheetId}
                            </div>
                            <div style={{ fontSize: '12px', color: '#8fa3a6', marginTop: '3px' }}>
                              Results will be appended to the “Call Log” tab
                            </div>
                          </div>
                          <a
                            href={`https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '13px', color: '#0bbfcb', textDecoration: 'none', whiteSpace: 'nowrap' }}
                          >
                            Open ↗
                          </a>
                          <button
                            type="button"
                            onClick={() => setChangingSheet((prev) => ({ ...prev, [config.id]: true }))}
                            style={{
                              background: 'transparent',
                              border: '1px solid #2d2d2d',
                              borderRadius: '7px',
                              color: '#b3b3b3',
                              fontSize: '13px',
                              padding: '6px 12px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Change
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Google Sheets target picker */}
                    {config.deliveryMethod === 'Google Sheets' && (!config.spreadsheetId || changingSheet[config.id]) && (
                      <div style={{ marginTop: '14px' }}>
                        <div style={{ fontSize: '13px', color: '#a0a0a0', marginBottom: '8px' }}>
                          Target Spreadsheet <span style={{ color: '#ff6b6b' }}>*</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <select
                            value={config.spreadsheetId || ''}
                            onChange={(e) => {
                              const spreadsheetId = e.target.value;
                              updatePostCallConfigAndSave(config.id, {
                                spreadsheetId,
                                spreadsheetName: spreadsheets.find((s) => s.id === spreadsheetId)?.name || '',
                              });
                              // Picking one closes the picker back to the confirmation.
                              if (spreadsheetId) setChangingSheet((prev) => ({ ...prev, [config.id]: false }));
                            }}
                            disabled={spreadsheetsState === 'loading'}
                            style={{
                              width: '400px',
                              height: '42px',
                              padding: '0 16px',
                              background: '#181818',
                              border: '1px solid #2d2d2d',
                              borderRadius: '9px',
                              color: config.spreadsheetId ? '#ffffff' : '#b3b3b3',
                              fontSize: '14px',
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                          >
                            <option value="">
                              {spreadsheetsState === 'loading' ? 'Loading your spreadsheets…' : 'Select a spreadsheet'}
                            </option>
                            {/* Keep a previously saved sheet selectable even if the
                                listing hasn't loaded (or no longer returns it). */}
                            {config.spreadsheetId && !spreadsheets.some((s) => s.id === config.spreadsheetId) && (
                              <option value={config.spreadsheetId}>{config.spreadsheetName || config.spreadsheetId}</option>
                            )}
                            {spreadsheets.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={loadSpreadsheets}
                            disabled={spreadsheetsState === 'loading'}
                            title="Reload the list from Google Drive"
                            style={{
                              height: '42px',
                              padding: '0 14px',
                              background: 'transparent',
                              border: '1px solid #2d2d2d',
                              borderRadius: '9px',
                              color: '#b3b3b3',
                              fontSize: '13px',
                              cursor: spreadsheetsState === 'loading' ? 'not-allowed' : 'pointer',
                            }}
                          >
                            ↻ Refresh
                          </button>
                        </div>
                        {spreadsheetsState === 'error' && (
                          <div style={{ fontSize: '12px', color: '#ff4d4f', marginTop: '6px', maxWidth: '460px', lineHeight: 1.5 }}>
                            {spreadsheetsError}
                          </div>
                        )}
                        {spreadsheetsState === 'idle' && spreadsheets.length === 0 && (
                          <div style={{ fontSize: '12px', color: '#a0a0a0', marginTop: '6px' }}>
                            No spreadsheets found — create one below.
                          </div>
                        )}

                        {/* Separator: the row below is an ALTERNATIVE to the
                            dropdown above, not a second required field. */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '480px', margin: '12px 0 10px' }}>
                          <div style={{ height: '1px', background: '#2d2d2d', flex: 1 }} />
                          <span style={{ fontSize: '11px', color: '#6b6b6b', letterSpacing: '0.06em' }}>OR CREATE A NEW ONE</span>
                          <div style={{ height: '1px', background: '#2d2d2d', flex: 1 }} />
                        </div>

                        {/* Create a new spreadsheet without leaving the app */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={newSheetName[config.id] ?? ''}
                            onChange={(e) => setNewSheetName((prev) => ({ ...prev, [config.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createSpreadsheetFor(config.id); } }}
                            placeholder={`${agentName || 'Agent'} — Call Log`}
                            style={{
                              width: '400px',
                              height: '42px',
                              padding: '0 16px',
                              background: '#181818',
                              border: '1px solid #2d2d2d',
                              borderRadius: '9px',
                              color: '#ffffff',
                              fontSize: '14px',
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => createSpreadsheetFor(config.id)}
                            disabled={creatingSheet === config.id}
                            title="Create a new spreadsheet in your Google Drive and select it"
                            style={{
                              height: '42px',
                              padding: '0 16px',
                              background: 'transparent',
                              border: '1px solid #0bbfcb55',
                              borderRadius: '9px',
                              color: creatingSheet === config.id ? '#555' : '#0bbfcb',
                              fontSize: '13px',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              cursor: creatingSheet === config.id ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {creatingSheet === config.id ? 'Creating…' : '+ Create new'}
                          </button>
                        </div>
                        <div style={{ fontSize: '12px', color: '#7a7a7a', marginTop: '10px', maxWidth: '460px', lineHeight: 1.5 }}>
                          One row is appended per completed call to a “Call Log” tab: call time, agent,
                          type, outcome, duration and phone number, then a column per extracted variable.
                          The header row is created automatically.
                        </div>
                        {changingSheet[config.id] && (
                          <button
                            type="button"
                            onClick={() => setChangingSheet((prev) => ({ ...prev, [config.id]: false }))}
                            style={{
                              marginTop: '10px',
                              background: 'transparent',
                              border: 'none',
                              padding: 0,
                              color: '#8a8a8a',
                              fontSize: '13px',
                              textDecoration: 'underline',
                              cursor: 'pointer',
                            }}
                          >
                            Cancel — keep “{config.spreadsheetName || config.spreadsheetId}”
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
                    <button
                      onClick={() => removePostCallConfig(config.id)}
                      disabled={postCallConfigs.length === 1}
                      style={{
                        padding: '0 20px',
                        height: '44px',
                        background: '#0e0e0e',
                        border: '1px solid var(--border)',
                        borderRadius: '9px',
                        color: postCallConfigs.length === 1 ? '#666666' : '#ff4d4f',
                        cursor: postCallConfigs.length === 1 ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '600'
                      }}
                    >
                      Remove
                    </button>

                    {/* Test Delivery Button */}
                    <button
                      onClick={() => handleTestPostCall(config.id)}
                      disabled={Boolean(postCallConfigIssue(config)) || testingPostCall[config.id] === 'loading'}
                      title={postCallConfigIssue(config) ?? 'Send a test delivery now'}
                      style={{
                        padding: '0 20px',
                        height: '44px',
                        background: testingPostCall[config.id] === 'done' ? '#0bbfcb22' : testingPostCall[config.id] === 'error' ? '#ff4d4f22' : '#0bbfcb18',
                        border: `1px solid ${testingPostCall[config.id] === 'done' ? '#0bbfcb' : testingPostCall[config.id] === 'error' ? '#ff4d4f' : '#0bbfcb55'}`,
                        borderRadius: '9px',
                        color: testingPostCall[config.id] === 'done' ? '#0bbfcb' : testingPostCall[config.id] === 'error' ? '#ff4d4f' : postCallConfigIssue(config) ? '#555' : '#0bbfcb',
                        cursor: (postCallConfigIssue(config) || testingPostCall[config.id] === 'loading') ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: '600',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {testingPostCall[config.id] === 'loading' ? '⏳ Sending...' :
                       testingPostCall[config.id] === 'done' ? '✓ Sent' :
                       testingPostCall[config.id] === 'error' ? '✗ Failed' :
                       '▶ Test Delivery'}
                    </button>
                  </div>
                </div>

                {/* Test result details */}
                {testPostCallResults[config.id] && (
                  <div style={{
                    marginBottom: '20px',
                    padding: '14px 16px',
                    background: testingPostCall[config.id] === 'done' ? '#0bbfcb10' : '#ff4d4f10',
                    border: `1px solid ${testingPostCall[config.id] === 'done' ? '#0bbfcb44' : '#ff4d4f44'}`,
                    borderRadius: '10px',
                    fontSize: '13px',
                    color: testingPostCall[config.id] === 'done' ? '#0bbfcb' : '#ff7b7b',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    lineHeight: 1.6
                  }}>
                    {testPostCallResults[config.id]}
                  </div>
                )}

                <div style={{ marginBottom: '30px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Trigger based on Call Status</div>
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
                  <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '18px' }}>Including</div>
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
                          <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px', lineHeight: 1.2 }}>{item.title}</div>
                          <div style={{ fontSize: '13px', color: '#a9a9a9', lineHeight: 1.45 }}>{item.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>Extracted Variables</div>
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
                            color: 'var(--text-primary)',
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
                            color: 'var(--text-primary)',
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
                            border: '1px solid var(--border)',
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
                marginBottom: '24px',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', paddingLeft: '20px' }}>Recent Calls</div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={loadRecentCalls}
                  disabled={callsLoading}
                  style={{
                    height: '44px',
                    padding: '0 18px',
                    background: '#101010',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: callsLoading ? 'not-allowed' : 'pointer',
                    opacity: callsLoading ? 0.6 : 1
                  }}
                >
                  {callsLoading ? '⏳ Loading...' : '↻ Refresh'}
                </button>
              </div>
            </div>

            {callsLoading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '14px' }}>
                Loading call history...
              </div>
            ) : recentCalls.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentCalls.map((call) => {
                  const typeMeta =
                    call.type === 'WEB_CALL' ? { icon: '🌐', label: 'Web Call', bg: '#0a1f3a', fg: '#7fbfff', bd: '#1a5a9a' }
                    : call.type === 'PHONE_CALL' ? { icon: '📞', label: 'Phone Call', bg: '#2a1a0a', fg: '#ffb066', bd: '#5a3a1a' }
                    : { icon: '💬', label: 'Chat Test', bg: '#0a2e1a', fg: '#78f5ad', bd: '#1a5a3a' };
                  const statusMeta =
                    call.status === 'COMPLETED' ? { bg: '#0a2e1a', fg: '#78f5ad', bd: '#1a5a3a' }
                    : call.status === 'IN_PROGRESS' ? { bg: '#0a1f3a', fg: '#7fbfff', bd: '#1a5a9a' }
                    : call.status === 'FAILED' ? { bg: '#2e0a0a', fg: '#ff8080', bd: '#5a1a1a' }
                    : { bg: '#1a1a0a', fg: '#ffd066', bd: '#5a5a1a' };
                  const mins = Math.floor((call.durationSec ?? 0) / 60);
                  const secs = (call.durationSec ?? 0) % 60;
                  const isExpanded = expandedCallId === call.id;
                  const transcript = call.transcript ?? [];
                  const extractedVariables = call.extractedData?.variables ?? [];
                  return (
                    <div
                      key={call.id}
                      style={{
                        background: '#111',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        onClick={() => {
                          const next = isExpanded ? null : call.id;
                          setExpandedCallId(next);
                          if (next && call.hasRecording) loadRecording(call.id);
                        }}
                        style={{
                          padding: '16px 20px',
                          display: 'grid',
                          gridTemplateColumns: '1fr 110px 110px 90px 150px 28px',
                          alignItems: 'center',
                          gap: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                            {typeMeta.icon} {typeMeta.label}
                          </div>
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                            {call.type === 'PHONE_CALL' && call.phoneNumber
                              ? call.phoneNumber
                              : `${transcript.length} message${transcript.length === 1 ? '' : 's'}${call.hasRecording ? ' · 🔊 recording' : ''}`}
                          </div>
                        </div>
                        <div style={{
                          fontSize: '12px', fontWeight: '600', padding: '4px 10px', borderRadius: '999px', textAlign: 'center',
                          background: typeMeta.bg, color: typeMeta.fg, border: `1px solid ${typeMeta.bd}`
                        }}>
                          {typeMeta.label}
                        </div>
                        <div style={{
                          fontSize: '12px', fontWeight: '600', padding: '4px 10px', borderRadius: '999px', textAlign: 'center',
                          background: statusMeta.bg, color: statusMeta.fg, border: `1px solid ${statusMeta.bd}`
                        }}>
                          {(call.status || 'UNKNOWN').replace('_', ' ').toLowerCase()}
                        </div>
                        <div style={{ fontSize: '12px', color: '#888', textAlign: 'center' }}>
                          {mins}:{String(secs).padStart(2, '0')}
                        </div>
                        <div style={{ fontSize: '12px', color: '#888', textAlign: 'right' }}>
                          {call.startedAt ? new Date(call.startedAt).toLocaleString() : '—'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666', textAlign: 'center' }}>{isExpanded ? '▲' : '▼'}</div>
                      </div>

                      {isExpanded && (
                        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', background: '#0d0d0d' }}>
                          {call.hasRecording && (
                            <div style={{ marginBottom: transcript.length ? '16px' : 0 }}>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: '#888', marginBottom: '8px' }}>Call recording</div>
                              {recordingUrls[call.id] ? (
                                <audio controls src={recordingUrls[call.id]} style={{ width: '100%', height: '36px' }} />
                              ) : (
                                <div style={{ fontSize: '12px', color: '#666' }}>Loading recording…</div>
                              )}
                            </div>
                          )}
                          {transcript.length > 0 && (
                            <div style={{ marginBottom: '16px', padding: '14px', border: '1px solid #28343a', borderRadius: '10px', background: '#10171a' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: extractedVariables.length || call.extractionError || call.extractedData?.skippedReason ? '10px' : 0 }}>
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#8edce2' }}>Extracted conversation data</div>
                                  <div style={{ fontSize: '11px', color: '#708087', marginTop: '3px' }}>
                                    Status: {(call.extractionStatus || 'PENDING').toLowerCase()}
                                  </div>
                                </div>
                                <button
                                  onClick={() => extractCallData(call.id)}
                                  disabled={call.extractionStatus === 'PROCESSING'}
                                  style={{
                                    padding: '6px 11px',
                                    borderRadius: '7px',
                                    border: '1px solid #0bbfcb66',
                                    background: '#0bbfcb14',
                                    color: call.extractionStatus === 'PROCESSING' ? '#60777a' : '#0bbfcb',
                                    cursor: call.extractionStatus === 'PROCESSING' ? 'wait' : 'pointer',
                                    fontSize: '11px',
                                    fontWeight: '600'
                                  }}
                                >
                                  {call.extractionStatus === 'PROCESSING' ? 'Extracting...' : extractedVariables.length ? 'Re-extract' : 'Extract now'}
                                </button>
                              </div>
                              {call.extractionError && (
                                <div style={{ fontSize: '12px', color: '#ff8080' }}>{call.extractionError}</div>
                              )}
                              {call.extractedData?.skippedReason && (
                                <div style={{ fontSize: '12px', color: '#b5a36a' }}>{call.extractedData.skippedReason}</div>
                              )}
                              {extractedVariables.length > 0 && (
                                <div style={{ display: 'grid', gap: '8px' }}>
                                  {extractedVariables.map((variable) => (
                                    <div key={variable.key} style={{ padding: '9px 11px', borderRadius: '8px', background: '#0b1012', border: '1px solid #202b30' }}>
                                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 0.4fr) 1fr', gap: '12px', alignItems: 'start' }}>
                                        <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#8edce2', wordBreak: 'break-word' }}>{variable.key}</div>
                                        <div style={{ fontSize: '12px', color: variable.value == null ? '#667277' : 'var(--text-primary)', wordBreak: 'break-word' }}>
                                          {variable.value == null
                                            ? 'Not found'
                                            : typeof variable.value === 'string'
                                              ? variable.value
                                              : JSON.stringify(variable.value)}
                                        </div>
                                      </div>
                                      {variable.evidence && (
                                        <div style={{ marginTop: '6px', fontSize: '11px', color: '#718087' }}>Evidence: “{variable.evidence}”</div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {transcript.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: '#888' }}>Transcript</div>
                              {transcript.map((m, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                  <div style={{
                                    maxWidth: '75%', padding: '8px 12px', borderRadius: '10px', fontSize: '13px',
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                    background: m.role === 'user' ? '#00bcd4' : '#1a1a1a',
                                    color: m.role === 'user' ? '#000' : 'var(--text-primary)',
                                    border: m.role === 'user' ? 'none' : '1px solid #333'
                                  }}>
                                    {m.content}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: '12px', color: '#666' }}>No transcript was captured for this call.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingBottom: '80px'
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
                    📞
                  </div>
                  <div style={{ fontSize: '18px', lineHeight: 1.2, fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px' }}>No call history</div>
                  <div style={{ fontSize: '15px', lineHeight: 1.6, color: '#a0a0a0' }}>
                    You haven't made any calls with this assistant yet.
                    <br />
                    Start a call to see your history here.
                  </div>
                </div>
              </div>
            )}
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
              <button onClick={closeTestChat} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '20px' }}>X</button>
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
                  style={{ flex: 1, background: '#0f0f0f', border: '1px solid #333', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '13px' }}
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
