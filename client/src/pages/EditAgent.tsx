import { useParams, useNavigate } from 'react-router-dom';

import { useEffect, useState, useRef, useMemo } from 'react';
import { AgentConfig, getDefaultFlowItems } from '../lib/agentStore';

import { whapi, getAuth } from '../lib/whapi';
import { integrationsApi } from '../lib/integrationsApi';
import { toast } from 'sonner';
import ChatComponent from '../components/ChatComponent';
import AIAssistantSidebar from '../components/AIAssistantSidebar';
import VoiceConfigModal from '../components/VoiceConfigModal';
import CallerNumberPicker from '../components/CallerNumberPicker';
import { xaiCallSocket } from '../services/xaiCallSocket';
import { AMBIENT_OPTIONS, startAmbientSound } from '../services/ambientSound';
import { modularCallSocket, type ModularCallEvent } from '../services/modularCallSocket';
import { fetchModelCatalog, type ModelCatalog } from '../lib/modelCatalog';
import {
  ArrowLeft, Sparkles, Rocket, Save, Link2, MessageSquare, Globe, Phone,
  PhoneIncoming, PhoneOutgoing, Languages as LanguagesIcon, AudioLines, Cpu,
  Volume2, MessageSquareText, ChevronDown, Loader2, Check, X
} from 'lucide-react';


/**
 * Retry the two requests that close a web call out.
 *
 * Both run in the same instant the call ends, and both were single-shot. A
 * momentary backend failure there is not a momentary inconvenience: the upload
 * carries the only copy of the recording that exists, and the PATCH is what
 * ends and bills the call, so one failed request left a call stuck IN_PROGRESS
 * with its audio stranded on the server. Retrying spans a restart or a blip,
 * which is the difference between losing a call and pausing for a few seconds.
 *
 * 4xx is not retried — a rejected request does not become valid by repeating
 * it — except for the two that explicitly mean "later": 408 and 429.
 */
/**
 * One entry of the Reply Timing control.
 *
 * The real list comes from the server (GET .../response-profile) so the
 * milliseconds shown in the UI are the ones the pipeline will actually wait —
 * the two used to be maintained as separate constants in separate files, and
 * they drifted, which meant the browser's own turn-end backstop kept firing
 * before the server's and quietly cancelling it.
 */
type TurnEndOption = {
  id: string;
  label: string;
  description: string;
  endpointingMs: number;
  graceMs: number;
  unfinishedGraceMs: number;
};

// Rendered only when the server has not answered yet (or could not). Kept in
// step with services/voice/turnEndProfile.js; the server's copy is canonical.
const TURN_END_FALLBACK: TurnEndOption[] = [
  { id: 'fast', label: 'Fast', description: 'Replies as soon as the caller pauses. Best for short answers.', endpointingMs: 250, graceMs: 250, unfinishedGraceMs: 800 },
  { id: 'balanced', label: 'Balanced', description: 'Waits long enough for a natural mid-sentence pause. The default.', endpointingMs: 300, graceMs: 400, unfinishedGraceMs: 1100 },
  { id: 'patient', label: 'Patient', description: 'Room to hesitate, spell a name, or read out a number. Slower to answer.', endpointingMs: 400, graceMs: 700, unfinishedGraceMs: 1600 },
];

/**
 * How this agent's reply audio is produced.
 *
 * Deliberately expresses INTENT rather than naming a provider: what "Streaming"
 * actually does depends on the voice the workspace picked, and the note under
 * the control reports what that voice can really do. Choosing a provider stays
 * the user's decision in the Voice tab, not something the code decides for them.
 */
const TTS_DELIVERY_OPTIONS = [
  {
    id: 'auto',
    label: 'Auto',
    hint: 'Fastest available',
    description: 'Stream the reply when the selected voice supports it, otherwise synthesize sentence by sentence.',
  },
  {
    id: 'socket',
    label: 'Streaming',
    hint: 'Lowest latency',
    description: 'Always prefer streaming. Falls back to sentence-by-sentence when the selected voice cannot stream.',
  },
  {
    id: 'http',
    label: 'Sentence',
    hint: 'Steadiest voice',
    description: 'Synthesize each sentence as its own request. Slower to start, but some voices are more consistent this way.',
  },
];

/**
 * Speculative replies: start the model on what the caller has said BEFORE the
 * turn is confirmed over, and keep the answer only if the final transcript
 * matches. More aggressive = faster first word, more discarded (paid-for)
 * requests. Kept in step with services/voice/speculativeTurn.js.
 */
const SPECULATION_OPTIONS = [
  { id: 'off', label: 'Off', hint: 'One request per turn', description: 'Ask the model only once the caller has definitely finished. Slowest, cheapest.' },
  { id: 'candidate', label: 'On pause', hint: 'Recommended', description: 'Start the model the moment the caller pauses; the confirmation wait overlaps the model instead of preceding it. Roughly one extra request for every five turns.' },
  { id: 'interim', label: 'While speaking', hint: 'Fastest, costs more', description: 'Also restart the model as the transcript grows during speech, so the answer may be ready before the caller stops. Up to two extra requests per turn.' },
];

const TRANSFER_MODE_OPTIONS = [
  { id: 'announce', label: 'Announce, then connect', description: 'The agent says it is connecting the caller, then the call rings the number. If nobody answers, the agent comes back and says so.' },
  { id: 'immediate', label: 'Connect immediately', description: 'Ring the number as soon as the caller asks, without an announcement sentence.' },
];
const TRANSFER_OOH_OPTIONS = [
  { id: 'callback', label: 'Offer a callback', description: 'Outside these hours the agent says nobody is available and offers to take a message or a callback.' },
  { id: 'attempt', label: 'Try anyway', description: 'Ring the number regardless of the hours; the agent comes back if nobody answers.' },
  { id: 'decline', label: 'Decline', description: 'Outside these hours the agent explains a human is not available and continues helping itself.' },
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FINALIZE_RETRY_DELAYS_MS = [800, 2500, 6000];

async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (e) {
      const status = (e as { status?: number })?.status;
      const worthRetrying = status === undefined || status >= 500 || status === 408 || status === 429;
      if (!worthRetrying || attempt >= FINALIZE_RETRY_DELAYS_MS.length) throw e;
      console.warn(`${label} failed (attempt ${attempt + 1}), retrying`, e);
      await new Promise((r) => setTimeout(r, FINALIZE_RETRY_DELAYS_MS[attempt]));
    }
  }
}

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
  /** extracted-variable key holding the appointment start — deliveryMethod === 'Google Calendar' */
  dateVariable?: string;
  /** event length in minutes when only a start time is extracted (default 30) */
  durationMin?: number;
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


/*
 * The AI Model, Transcription and Conversational Agent choices used to be
 * hardcoded here. They now come from GET /workspaces/:id/model-catalog, which
 * Super Admin → Models controls: a model that is switched off is not offered
 * here and is refused by the backend if saved anyway.
 *
 * That also ends a real bug — this list offered "Claude-3-Opus", "GPT-4-Turbo"
 * and "Llama-2-70B", none of which the backend can route (mapAgentModel matched
 * nothing and the agent silently fell back to Gemini).
 */
const POST_CALL_TRIGGER_OPTIONS = ['Completed', 'Voicemail Detected', 'No Answer', 'Busy', 'Failed'];

const createDefaultPostCallConfig = (): PostCallConfig => ({
  id: Date.now().toString(),
  deliveryMethod: '',
  url: '',
  email: '',
  spreadsheetId: '',
  spreadsheetName: '',
  dateVariable: '',
  durationMin: 30,
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

// An inbound-style "thank you for calling" opener — wrong for an OUTBOUND agent,
// which dials the customer itself. Used to warn when the welcome message and the
// call direction disagree. Kept in sync with the backend guard in
// agentRuntime.service.js (THANKS_FOR_CALLING_RE / stripInboundThanks).
const THANKS_FOR_CALLING_RE = /\bthank(?:s|\s*you)?\b[^.!?]*\bfor\s+calling\b/i;

// The mirror of the above: outbound phrasing sitting in the INCOMING greeting.
//
// "I'm calling to ask..." is exactly right when the agent placed the call and
// nonsense when the customer rang in — they know they called, and being told
// they are being called reads as a broken bot. The inbound half of this pair
// had no check at all until an operator hit it: a greeting written for outbound
// was seeded into the incoming field and then faithfully TRANSLATED, so the
// wrong direction survived in a new language.
//
// Hindi is matched too, because the greeting is written in whatever language
// the agent speaks and an English-only check would miss every Indian-language
// agent — which is most of them. "kar rahi/raha hoon" after "call"/"phone" is
// the natural rendering of "I am calling"; the spelling of both loanwords
// varies by writer, hence the alternations.
//
// Deliberately narrow: "Thank you for calling" contains the word "calling" and
// must NOT match. Only first-person "I am calling" / "calling from" forms do.
const OUTBOUND_PHRASING_RE = new RegExp(
  [
    String.raw`\b(?:i\s*['\u2019]?m|i\s+am|this\s+is\s+\w+)\s+calling\b`,
    String.raw`\bcalling\s+(?:from|you|to)\b`,
    String.raw`(?:कॉल|फ़ोन|फोन)\s*कर\s*रह[ीा]\s*हू[ँं]`,
  ].join('|'),
  'i',
);


const MicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" y1="19" x2="12" y2="23"></line>
    <line x1="8" y1="23" x2="16" y2="23"></line>
  </svg>
);

const InfoIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tx-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '6px', cursor: 'pointer' }}>
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
  // Theme is owned by the DashboardLayout topbar; this page no longer renders
  // its own toggle, so it has nothing to read from the theme context.


  const [isLoading, setIsLoading] = useState(true);

  // Form state
  // One greeting cannot serve both directions: "Thank you for calling Sunrise
  // Hospital" is right when they rang us and absurd when we rang them. Until
  // these existed the gap was papered over by asking an LLM to rewrite one into
  // the other on every call, which is how the operator's words stopped being
  // the words that were actually spoken. Both are now spoken verbatim by TTS.
  const [welcomeInbound, setWelcomeInbound] = useState('');
  const [welcomeOutbound, setWelcomeOutbound] = useState('');
  // Which greeting is on screen. Both must stay editable — a campaign routinely
  // dials OUT through an agent saved as INBOUND, which is the case that produced
  // "thank you for calling" on calls the platform itself placed — but showing
  // both full-size boxes at once next to a direction toggle reads as though the
  // toggle should be filtering them, and it does not: the toggle sets what the
  // agent is FOR. One at a time, behind its own tabs, keeps the two controls
  // from looking like one control.
  const [welcomeTab, setWelcomeTab] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const [maxDuration, setMaxDuration] = useState(30);
  const [silenceTimeout, setSilenceTimeout] = useState(5);
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

  // What this platform currently offers. Super Admin → Models owns this list;
  // every picker below renders from it instead of a hardcoded array.
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null);
  useEffect(() => { fetchModelCatalog().then(setModelCatalog).catch(() => setModelCatalog(null)); }, []);

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
  // ── Human handover ────────────────────────────────────────────────────
  // A real carrier-level transfer (Twilio / Plivo) with an honest failure
  // path. Everything here is persisted in the agent's settings JSON and
  // validated by the API (validators/agentSettings.validator.js).
  const [transferLabel, setTransferLabel] = useState('');
  const [transferMode, setTransferMode] = useState('announce');
  const [transferTimeoutSec, setTransferTimeoutSec] = useState(25);
  const [transferOutOfHours, setTransferOutOfHours] = useState('callback');
  const [transferHours, setTransferHours] = useState<{ enabled: boolean; start: string; end: string; days: number[]; timezone: string }>({
    enabled: false, start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5], timezone: 'Asia/Kolkata',
  });
  // Speculative replies — see SPECULATION_OPTIONS.
  const [speculation, setSpeculation] = useState('candidate');
  const [fillerWords, setFillerWords] = useState(false);
  const [speakingRate, setSpeakingRate] = useState(1.0);
  // ── Response speed (per agent) ────────────────────────────────────────
  // How long to wait after the caller stops before answering, and how the
  // reply audio is delivered. Both are genuine per-conversation choices — a
  // support line reading out order numbers wants a different wait than a
  // yes/no qualifier — so they live on the agent, not in a deploy config.
  // Defaults reproduce today's behaviour exactly.
  const [turnEndSensitivity, setTurnEndSensitivity] = useState('balanced');
  const [ttsDelivery, setTtsDelivery] = useState('auto');
  // What the server says these controls can actually do for THIS agent, given
  // the voice it is on. Fetched rather than assumed: whether a reply can stream
  // while it is being written depends on the selected voice provider, and
  // guessing that in the browser is how the setting ends up lying.
  const [responseProfile, setResponseProfile] = useState<any>(null);
  const [ambientSound, setAmbientSound] = useState('None');
  // Background sound switch: 'off' | 'manual' (pre-rendered bed, continuous,
  // free per turn) | 'native' (Fish Audio generates it with the speech; stops
  // between turns; Fish voices only). New agents default to off; an existing
  // agent with a preset keeps behaving as before (see resolveAmbientMode).
  const [ambientMode, setAmbientMode] = useState('off');
  const [showModelModal, setShowModelModal] = useState(false);
  // Filter text for the model picker. Lives here rather than inside the modal
  // so opening it can reset the box — a stale query from last time reads as an
  // empty catalogue.
  const [modelQuery, setModelQuery] = useState('');
  const [showTranscriptionModal, setShowTranscriptionModal] = useState(false);
  const [sttProvider, setSttProvider] = useState('Sarvam');
  const [sttSilenceTimeoutMs, setSttSilenceTimeoutMs] = useState(470);
  const [sttLanguage, setSttLanguage] = useState('Multi');
  const [isSttProviderDropdownOpen, setIsSttProviderDropdownOpen] = useState(false);
  const [sttAdvancedSettingsOpen, setSttAdvancedSettingsOpen] = useState(false);
  const [isSttLanguageDropdownOpen, setIsSttLanguageDropdownOpen] = useState(false);
  
  const [, setVoiceProvider] = useState('google'); // provider tracked for future UI filtering
  const [agentName, setAgentName] = useState('');
  // INBOUND = customers call the agent; OUTBOUND = the agent calls customers.
  const [callDirection, setCallDirection] = useState('INBOUND');

  // The greeting this agent leads with, derived rather than stored: the two
  // per-direction fields are the source of truth and `welcomeMessage` is only
  // the legacy mirror of whichever one matches the agent's configured
  // direction. Derived so a preview, an export or the web-call greeting can
  // never show the value from before the operator's last keystroke.
  // Falls through to the other direction when the configured one has not been
  // written yet. Only the direction a greeting was actually authored for is
  // seeded now, so the other field is legitimately empty — and `welcomeMessage`
  // is what every older reader and the server-side fallback chain still use.
  // Letting it save as '' would delete the agent's only greeting the first time
  // someone flipped the direction toggle.
  const activeWelcome = (callDirection === 'OUTBOUND'
    ? (welcomeOutbound.trim() || welcomeInbound)
    : (welcomeInbound.trim() || welcomeOutbound));
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
  // Integrations tab toggle. (There used to be a note here distinguishing
  // this from a "Dynamic" switch on the Details tab; that switch is gone.)
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
  // Recent Calls pagination — 10 rows per page so the list never grows tall
  // enough to need its own scrollbar on top of the page scrollbar.
  const CALLS_PER_PAGE = 10;
  const [callsPage, setCallsPage] = useState(1);
  const callsPageCount = Math.max(1, Math.ceil(recentCalls.length / CALLS_PER_PAGE));
  // Keep the page in range when the list shrinks (refresh, deletions).
  useEffect(() => {
    setCallsPage((p) => Math.min(p, callsPageCount));
  }, [callsPageCount]);
  const visibleCalls = recentCalls.slice((callsPage - 1) * CALLS_PER_PAGE, callsPage * CALLS_PER_PAGE);

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

  // Escape closes the model picker. It matters more here than on a typical
  // modal: the panel can outgrow a short viewport, and the close button is the
  // first thing to leave the screen when it does.
  useEffect(() => {
    if (!showModelModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowModelModal(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showModelModal]);

  // Opening the picker starts from a clean search box.
  useEffect(() => { if (showModelModal) setModelQuery(''); }, [showModelModal]);

  // Models grouped by the provider that serves them, filtered by the search
  // box. Catalogue order is preserved inside each group, and a group only
  // appears when it still has a match — so an empty result is one clear message
  // rather than five empty headings.
  const visibleModelGroups = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    const groups = new Map<string, ModelCatalog['llm']>();
    for (const m of modelCatalog?.llm ?? []) {
      if (q && !`${m.label} ${m.provider}`.toLowerCase().includes(q)) continue;
      const key = m.provider || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    return [...groups.entries()];
  }, [modelCatalog, modelQuery]);

  // What the response-speed controls can actually deliver for this agent.
  //
  // Re-runs when the selected VOICE changes, and asks about that voice rather
  // than the saved one, so the note under the control tells the truth while
  // someone is still browsing voices. A failure leaves `responseProfile` null,
  // which renders the controls without their capability note — degraded, not
  // broken.
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    const query = voice ? `?voice=${encodeURIComponent(voice)}` : '';
    whapi.get<any>(`/agents/${agentId}/response-profile${query}`)
      .then((data) => { if (!cancelled) setResponseProfile(data); })
      .catch(() => { if (!cancelled) setResponseProfile(null); });
    return () => { cancelled = true; };
  }, [agentId, voice]);

  const loadRecentCalls = async () => {
    setCallsLoading(true);
    setCallsPage(1);
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

  // Save the already-loaded recording blob to the user's device
  const downloadRecording = (call: CallRecord) => {
    const url = recordingUrls[call.id];
    if (!url) return;
    const stamp = call.startedAt
      ? new Date(call.startedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')
      : call.id;
    const label = (agentName || 'agent').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'agent';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${label}-call-${stamp}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
  // One SEGMENT of reply audio. The server now sends each independently-encoded
  // synthesis (filler ack, first sentence, remainder) as its own
  // audio-start…audio-end segment — separate MP3s must never share one
  // MediaSource (frame-alignment corruption), so each gets its own session and
  // the client plays them back-to-back from a queue.
  type ModularPlaybackSession = {
    mediaSource: MediaSource | null;
    audioEl: HTMLAudioElement | null;
    url: string | null;
    sourceBuffer: SourceBuffer | null;
    queue: ArrayBuffer[];
    ended: boolean;
    started: boolean;
    // Playback may begin (it's this segment's turn in the queue). Bytes are
    // buffered into the MediaSource regardless; only play() waits for this.
    activated: boolean;
    anyAppended: boolean;
    // The cached acknowledgement clip, not the reply (see noteFirstAudible).
    filler: boolean;
    epoch: number;
    useMediaSource: boolean;
    contentType: string;
    blobChunks: ArrayBuffer[];
    // Blob fallback: set once all bytes have arrived; called on activation.
    playBlob: (() => void) | null;
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
    // Playback volume for the agent's voice, 0..1. Below 1 while the agent is
    // DUCKED — the first stage of barge-in, see the barge timer. Stored on the
    // call (not just applied to the element that happens to be playing) because
    // reply audio arrives as a queue of segments, and a segment that starts
    // mid-duck has to start quiet too.
    duckLevel: number;
    // Interval driving the short fade between two duck levels. A step change in
    // element.volume is audible as a click, and a reply that steps up and down
    // sounds broken rather than responsive.
    duckRamp: number | null;
    // Latched for the REST OF THE CALL once ducking has proven to be firing on
    // the agent's own echo rather than on the caller (see MAX_DUCK_MS). Only
    // gates stage 1 (duck); the stage-2 cut is untouched, so real barge-in keeps
    // working — this trades a nicety for a stable playback level.
    duckDisabled: boolean;
    // ── B2 modular WebSocket transport (voiceEngine === 'modular') ──
    // true once the persistent modular Web Call socket is running.
    socketMode: boolean;
    // Worklet that taps mic PCM16 and forwards it to the socket while capturing.
    micWorklet: AudioWorkletNode | null;
    // Gate: the worklet only streams PCM to the server while a turn is capturing.
    capturingPcm: boolean;
    // B4 streaming reply playback. modularSession = the segment currently
    // RECEIVING bytes; segments queue up and play sequentially.
    modularSession: ModularPlaybackSession | null;
    modularQueue: ModularPlaybackSession[];
    modularPlaying: ModularPlaybackSession | null;
    // Segments opened but not yet finished this turn; resolvers wake when 0.
    modularOutstanding: number;
    modularDoneResolvers: (() => void)[];
    // Transcript of the caller's current turn, applied to history on 'done'.
    pendingUserText: string;
    // Bumped on each new segment / on barge-in so stale queued audio is skipped.
    turnEpoch: number;
    // Ends the in-progress listening turn immediately (set per segment). Called
    // by Deepgram's semantic endpoint signal to beat the RMS VAD fallback.
    endTurnEarly: (() => void) | null;
    // Per-turn clocks for the audible-latency report (all performance.now()).
    turnTiming: { turnId: string | null; lastSpeechAtPerf: number; endTurnAtPerf: number; firstAudibleAtPerf: number | null; ackAudibleAtPerf: number | null } | null;
    // Running estimate of the room's noise floor (RMS, 0..1), tracked across
    // turns so the VAD threshold adapts to the caller's environment instead of
    // assuming one. See NOISE_FLOOR_* in startListeningSegmentSocket (BUG-001).
    noiseFloor: number;
    // Re-prompts for a caller who has gone quiet, in the agent's language, and
    // how many have been used since the caller was last heard.
    noInputPrompts: string[];
    noInputDelaysMs: number[];
    noInputAttempt: number;
    noInputTimer: number | null;
    // Server has model-based (Deepgram) endpointing, so the RMS VAD below is a
    // backstop and uses a longer silence timeout. Set from the `ready` frame.
    sttEndpointing: boolean;
    // Worst-case ms of silence before the SERVER ends a turn itself, reported in
    // the `ready` frame. The backstop is derived from this rather than guessed,
    // so a change to the server's grace windows cannot silently be overridden by
    // a client constant that still fires first.
    endpointCommitMs: number;
  }>({ active: false, stream: null, audioCtx: null, analyser: null, recorder: null, vadTimer: null, player: null, history: [], mixDest: null, mixRecorder: null, mixChunks: [], logId: null, bundledEngine: false, lastSpeechAt: 0, ambientStop: null, stopPlayback: null, bargeTimer: null, duckLevel: 1, duckRamp: null, duckDisabled: false, socketMode: false, micWorklet: null, capturingPcm: false, modularSession: null, modularQueue: [], modularPlaying: null, modularOutstanding: 0, modularDoneResolvers: [], pendingUserText: '', turnEpoch: 0, endTurnEarly: null, turnTiming: null, noiseFloor: 0, sttEndpointing: false, endpointCommitMs: 0, noInputPrompts: [], noInputDelaysMs: [], noInputAttempt: 0, noInputTimer: null });

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
          // Seeded from the legacy field ONLY into the direction that greeting
          // was actually written for.
          //
          // Seeding both was a real bug, reported from a live agent: the stored
          // greeting was outbound-phrased ("I'm calling to check how you're
          // doing"), it was copied into the INCOMING box too, and the translate
          // step then faithfully rendered "I am calling you" in Hindi as this
          // agent's greeting for people who had rung IN. A faithful translation
          // of wrong-direction text is still the wrong direction — the
          // translator worked correctly and the seed was wrong.
          //
          // The other box is left EMPTY on purpose. An empty field is not a gap:
          // welcomeTextFor() falls back to welcomeMessage for it, so behaviour is
          // exactly what it was before these fields existed, and the operator
          // writes the second greeting when they have one rather than inheriting
          // a fabricated one that reads as a mistake.
          const legacyWelcome = agent.welcomeMessage ?? '';
          const legacyDirection = (agent as any).callDirection === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND';
          setWelcomeInbound(
            (agent as any).welcomeInbound ?? (legacyDirection === 'INBOUND' ? legacyWelcome : ''),
          );
          setWelcomeOutbound(
            (agent as any).welcomeOutbound ?? (legacyDirection === 'OUTBOUND' ? legacyWelcome : ''),
          );
          const loadedLanguages = ((agent as any).languages ?? agent.selectedLanguages) || ['English (Indian)'];
          setSelectedLanguages(loadedLanguages);
          // Arms the auto-translate effect above: from here on, a change of
          // primary language is the operator's doing and worth acting on.
          languageActedOn.current = loadedLanguages[0] || '';
          // Open the tab the agent actually is, not a hardcoded side.
          setWelcomeTab((agent as any).callDirection === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND');
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
          setTransferLabel((agent as any).transferLabel ?? '');
          setTransferMode((agent as any).transferMode ?? 'announce');
          setTransferTimeoutSec(Number((agent as any).transferTimeoutSec) || 25);
          setTransferOutOfHours((agent as any).transferOutOfHours ?? 'callback');
          {
            const h = (agent as any).transferHours;
            if (h && typeof h === 'object') {
              setTransferHours({
                enabled: Boolean(h.enabled), start: h.start || '09:00', end: h.end || '18:00',
                days: Array.isArray(h.days) && h.days.length ? h.days.map(Number) : [1, 2, 3, 4, 5],
                timezone: h.timezone || 'Asia/Kolkata',
              });
            }
          }
          setSpeculation((agent as any).speculation ?? 'candidate');
          setFillerWords((agent as any).fillerWords ?? false);
          setSpeakingRate((agent as any).speakingRate ?? 1.0);
          setTurnEndSensitivity((agent as any).turnEndSensitivity ?? 'balanced');
          setTtsDelivery((agent as any).ttsDelivery ?? 'auto');
          setAmbientSound((agent as any).ambientSound ?? 'None');
          {
            const { ambientMode: m, ambientSound: preset } = agent as { ambientMode?: string; ambientSound?: string };
            setAmbientMode(m && ['off', 'manual', 'native'].includes(m) ? m : (preset && preset !== 'None' ? 'manual' : 'off'));
          }
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
          setCallDirection((agent as any).callDirection ?? 'INBOUND');
          // STT settings
          setSttProvider((agent as any).sttProvider ?? 'Sarvam');
          setSttSilenceTimeoutMs((agent as any).sttSilenceTimeoutMs ?? 470);
          setSttLanguage((agent as any).sttLanguage ?? 'Multi');
          if (agent.voice?.toLowerCase().startsWith('google')) {
            setVoiceProvider('google');
          } else if (agent.voice?.toLowerCase().startsWith('eleven')) {
            setVoiceProvider('elevenlabs');
          } else if (agent.voice?.toLowerCase().startsWith('cartesia')) {
            setVoiceProvider('cartesia');
          } else if (agent.voice?.toLowerCase().startsWith('fish')) {
            setVoiceProvider('fishaudio');
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
      // The legacy single field tracks whichever direction this agent is FOR,
      // so exports, the Recent-calls preview and any older reader keep seeing
      // the agent's primary greeting rather than a stale copy.
      welcomeMessage: activeWelcome,
      welcomeInbound,
      welcomeOutbound,
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
      transferLabel,
      transferMode,
      transferTimeoutSec,
      transferOutOfHours,
      transferHours,
      speculation,
      fillerWords,
      speakingRate,
      turnEndSensitivity,
      ttsDelivery,
      ambientSound,
      ambientMode,
      interruptibleEnabled,
      postCallConfigs,
      kbUrls,
      kbFiles: kbFiles.map(f => f.fileName),
      // STT settings
      sttProvider,
      sttSilenceTimeoutMs,
      sttLanguage,
      // Integrations
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

  // ── Is the greeting written in the language this agent speaks? ──────────
  //
  // The greeting is spoken by TTS EXACTLY as stored — nothing translates it on
  // the call any more, because the thing that used to (an LLM rewrite told to
  // "keep the original intent") paraphrased the operator's words instead of
  // translating them, on a live line, while the callee listened to silence.
  //
  // Translation therefore belongs HERE, in the editor, where the operator can
  // read the result and fix it before a single customer hears it. All this has
  // to do is notice a mismatch and offer to fix it.
  //
  // Detection is by SCRIPT, not by a model. A Hindi TTS voice handed Latin text
  // either spells it out or reads it with an English phoneme set; the failure is
  // "wrong script", and the script is something we can simply look at. Languages
  // that share the Latin alphabet are deliberately not checked — there is no
  // reliable, cheap way to tell French from English by codepoint, and a wrong
  // warning on correct text is worse than no warning.
  const SCRIPT_RANGES: Record<string, RegExp> = {
    hindi: /[\u0900-\u097F]/, marathi: /[\u0900-\u097F]/, nepali: /[\u0900-\u097F]/,
    bengali: /[\u0980-\u09FF]/, punjabi: /[\u0A00-\u0A7F]/, gujarati: /[\u0A80-\u0AFF]/,
    tamil: /[\u0B80-\u0BFF]/, telugu: /[\u0C00-\u0C7F]/, kannada: /[\u0C80-\u0CFF]/,
    malayalam: /[\u0D00-\u0D7F]/, odia: /[\u0B00-\u0B7F]/, urdu: /[\u0600-\u06FF]/,
    arabic: /[\u0600-\u06FF]/, russian: /[\u0400-\u04FF]/, japanese: /[\u3040-\u30FF]/,
    korean: /[\uAC00-\uD7AF]/, chinese: /[\u4E00-\u9FFF]/, thai: /[\u0E00-\u0E7F]/,
  };

  // The agent's primary language — the one the runtime tells the model to
  // default to, including on the very first turn. The greeting has to match it.
  const primaryLanguage = selectedLanguages[0] || '';
  const primaryScript = SCRIPT_RANGES[primaryLanguage.toLowerCase().split(/[\s(]/)[0]] ?? null;

  /** True when this text plainly is not in the agent's primary language. */
  const isOffLanguage = (text: string) =>
    Boolean(primaryScript) && text.trim().length > 0 && !primaryScript!.test(text);

  const [translating, setTranslating] = useState<'INBOUND' | 'OUTBOUND' | null>(null);

  /**
   * Translate one greeting into the agent's primary language, in place.
   *
   * Strictly a translation, not a rewrite: the prompt forbids adding, dropping
   * or reordering anything. That constraint is the whole point — the clause an
   * old paraphrase kept losing was the two-minute consent question, which is
   * the part that makes an outbound call polite and, in some places, legal.
   *
   * The result lands in the textarea rather than being saved, so the operator
   * reads it first. Nothing here touches a live call.
   */
  const translateWelcome = async (dir: 'INBOUND' | 'OUTBOUND') => {
    const text = dir === 'OUTBOUND' ? welcomeOutbound : welcomeInbound;
    if (!text.trim() || !primaryLanguage || translating) return;
    setTranslating(dir);
    try {
      const response = await whapi.post<{ message: string }>('/llm/generate', {
        agentId,
        message: text,
        systemPrompt:
          `Translate the following call greeting into ${primaryLanguage}, in its native script. ` +
          'It is spoken aloud by a text-to-speech voice, so write it the way a person would say it. ' +
          'Translate EXACTLY: do not add, remove, reorder or soften anything, keep every question ' +
          'and every clause, and keep proper nouns (people, companies, places) as they are. ' +
          'Output ONLY the translated greeting — no quotes, no notes, no alternatives.',
        useFallback: true,
      });
      const out = (response.message || '').trim().replace(/^["']|["']$/g, '');
      if (!out) return;
      if (dir === 'OUTBOUND') setWelcomeOutbound(out); else setWelcomeInbound(out);
    } catch {
      // Non-fatal by design: a failed translation leaves the operator's own text
      // in the box, which is a greeting that works — just not in their language.
    } finally {
      setTranslating(null);
    }
  };

  /**
   * The language selection is the operator SAYING what this agent speaks, so
   * acting on it is not a surprise — leaving the greeting in the old language
   * would be. Both greetings are translated in place; the operator sees the
   * result in the boxes and saves (or edits) from there, and nothing has
   * reached a customer yet.
   *
   * Sequential, not parallel: `translating` names one field at a time, and two
   * in flight would let the second overwrite the first field's spinner state.
   */
  const translateOffLanguageWelcomes = async () => {
    if (isOffLanguage(welcomeInbound)) await translateWelcome('INBOUND');
    if (isOffLanguage(welcomeOutbound)) await translateWelcome('OUTBOUND');
  };

  // Set once the agent has hydrated, so loading an agent whose greeting is
  // already off-language does not rewrite it behind the operator's back on
  // sight. Only a DELIBERATE change of language triggers a translation.
  const languageActedOn = useRef<string | null>(null);
  useEffect(() => {
    if (languageActedOn.current === null || languageActedOn.current === primaryLanguage) return;
    languageActedOn.current = primaryLanguage;
    translateOffLanguageWelcomes();
    /* eslint-disable-line react-hooks/exhaustive-deps */
  }, [primaryLanguage]);

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
    if (config.deliveryMethod === 'Google Calendar' && !config.dateVariable) return 'Choose which extracted variable holds the appointment date/time first';
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
        name: agentName,
        welcomeMessage: activeWelcome,
        welcomeInbound, welcomeOutbound,
        aiModel, voice, transcription,
        languages: selectedLanguages, flowItems, maxDuration, silenceTimeout,
        maxSilenceBeforeHangup, endCallMessage, transferNumber, transferCondition,
        transferLabel, transferMode, transferTimeoutSec, transferOutOfHours, transferHours, speculation,
        fillerWords, speakingRate, ambientSound, ambientMode, interruptibleEnabled,
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
        systemPrompt: `You are an AI assistant helping configure an AI voice agent. The agent is named "${agentName}" and its welcome message is: "${activeWelcome}". Provide helpful, concise suggestions for improving or configuring this agent.`,
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
  // Bytes are buffered even before the segment is activated; playback itself
  // starts only when the segment reaches the front of the queue.
  const pumpModular = (session: ModularPlaybackSession) => {
    if (!session.sourceBuffer || session.sourceBuffer.updating) return;
    if (session.queue.length > 0) {
      const chunk = session.queue.shift()!;
      try { session.sourceBuffer.appendBuffer(chunk); } catch { session.finish(); return; }
      session.anyAppended = true;
      if (!session.started && session.activated) {
        session.started = true;
        session.audioEl?.play().catch(() => session.finish());
      }
    } else if (session.ended && session.mediaSource?.readyState === 'open' && !session.sourceBuffer.updating) {
      try { session.mediaSource.endOfStream(); } catch { /* already ended */ }
    }
  };

  // Wait for every segment of the current turn to finish playing (or be cut
  // off). Fresh promise each call, so a momentary all-quiet BETWEEN segments
  // can never satisfy a wait that starts later, at 'done' time — by then every
  // audio-start has arrived (WS ordering) and the count is final.
  const modularPlaybackSettled = () => {
    const call = callRef.current;
    if (call.modularOutstanding === 0) return Promise.resolve();
    return new Promise<void>((r) => { call.modularDoneResolvers.push(r); });
  };

  const modularSegmentsIdle = () => {
    const call = callRef.current;
    if (call.modularOutstanding === 0) {
      const resolvers = call.modularDoneResolvers;
      call.modularDoneResolvers = [];
      call.stopPlayback = null;
      resolvers.forEach((r) => r());
    }
  };

  /**
   * Set the agent's playback volume across every element that could be making
   * sound right now — the segment playing, the ones queued behind it, and the
   * non-socket player. Used by barge-in stage 1 to DUCK rather than cut.
   *
   * The move is FADED over ~VOLUME_RAMP_MS rather than assigned in one step.
   * `element.volume = x` is a discontinuity in the waveform: mid-word it is an
   * audible click, and a reply that ducks and restores a few times sounds like
   * the audio is breaking up rather than like the agent lowering its voice.
   * `call.duckLevel` is updated to the TARGET immediately, so a segment created
   * part-way through a fade still starts at the level we are heading for.
   */
  // Echo-rejecting speech bar, shared by barge-in and by the listening segment
  // while the agent is still audible. 5x the tracked room floor (vs 3x for
  // ordinary listening) is the margin that separates a real interrupting voice
  // from the agent's own TTS leaking back past echo cancellation. Defined ONCE:
  // continuous capture relies on it being the same number the ducker validated
  // in the field, and two copies would drift the moment one was tuned.
  const BARGE_SNR = 5.0;
  const BARGE_RMS_FLOOR = 0.03;

  const VOLUME_RAMP_MS = 120;
  const VOLUME_RAMP_STEPS = 6;
  const setAgentVolume = (level: number) => {
    const call = callRef.current;
    const from = call.duckLevel;
    call.duckLevel = level;
    const apply = (v: number) => {
      const set = (el: HTMLAudioElement | null | undefined) => {
        if (el) { try { el.volume = v; } catch { /* element already torn down */ } }
      };
      set(call.player);
      set(call.modularPlaying?.audioEl);
      set(call.modularSession?.audioEl);
      call.modularQueue.forEach((s) => set(s.audioEl));
    };
    // A new move supersedes a fade still in progress; without this the old
    // interval keeps writing toward the level we just changed our mind about.
    if (call.duckRamp !== null) { clearInterval(call.duckRamp); call.duckRamp = null; }
    if (from === level) { apply(level); return; }
    let step = 0;
    call.duckRamp = window.setInterval(() => {
      step += 1;
      if (step >= VOLUME_RAMP_STEPS) {
        if (call.duckRamp !== null) { clearInterval(call.duckRamp); call.duckRamp = null; }
        apply(level);
        return;
      }
      apply(from + (level - from) * (step / VOLUME_RAMP_STEPS));
    }, VOLUME_RAMP_MS / VOLUME_RAMP_STEPS);
  };

  // Give a queued segment its turn: start MediaSource playback, or fire the
  // prepared blob fallback.
  const activateModular = (session: ModularPlaybackSession) => {
    const call = callRef.current;
    call.modularPlaying = session;
    session.activated = true;
    if (session.useMediaSource) {
      if (session.ended && !session.anyAppended && session.queue.length === 0) { session.finish(); return; }
      if (!session.started && session.anyAppended) {
        session.started = true;
        session.audioEl?.play().catch(() => session.finish());
      } else {
        pumpModular(session); // first append will start playback (activated)
      }
      return;
    }
    if (session.playBlob) session.playBlob();
    // else: blob still buffering — endModularPlayback plays it (activated set)
  };

  // B4: open one streaming playback SEGMENT. Segments play sequentially; the
  // first one starts immediately.
  // Latency instrumentation: the ONLY place "the caller can hear the reply" is
  // knowable is this element's 'playing' event. Every server-side number stops
  // at its socket. Reported once per turn; the server files it next to its
  // own record under the same turnId (backend/scripts/latency-report.mjs).
  // The ack clip is kept separate: it moves PERCEIVED latency, not actual.
  const noteFirstAudible = (filler: boolean) => {
    const call = callRef.current;
    const t = call.turnTiming;
    if (!t) return;
    const now = performance.now();
    if (filler) { if (t.ackAudibleAtPerf == null) t.ackAudibleAtPerf = now; return; }
    if (t.firstAudibleAtPerf != null) return;
    t.firstAudibleAtPerf = now;
    const timing = {
      speechEndToAudibleMs: Math.round(now - t.lastSpeechAtPerf),
      endTurnToAudibleMs: Math.round(now - t.endTurnAtPerf),
      clientEndpointMs: Math.round(t.endTurnAtPerf - t.lastSpeechAtPerf),
      perceivedMs: t.ackAudibleAtPerf != null ? Math.round(t.ackAudibleAtPerf - t.lastSpeechAtPerf) : null,
    };
    console.info('[latency] first audible', { turnId: t.turnId, ...timing });
    if (t.turnId) modularCallSocket.reportTurnTiming({ turnId: t.turnId, ...timing });
  };

  const startModularPlayback = (contentType: string | null, filler = false) => {
    const call = callRef.current;
    const epoch = call.turnEpoch;
    const ct = contentType || 'audio/mpeg';
    const useMS = typeof window.MediaSource !== 'undefined' && MediaSource.isTypeSupported(ct);
    setWebCallActivity('speaking');

    let finished = false;
    const session: ModularPlaybackSession = {
      mediaSource: null, audioEl: null, url: null, sourceBuffer: null,
      queue: [], ended: false, started: false, activated: false, anyAppended: false, filler,
      epoch, useMediaSource: useMS, contentType: ct, blobChunks: [], playBlob: null,
      finish: () => {
        if (finished) return; finished = true;
        if (session.url) { try { URL.revokeObjectURL(session.url); } catch { /* noop */ } }
        call.modularOutstanding = Math.max(0, call.modularOutstanding - 1);
        if (call.modularPlaying === session) {
          call.modularPlaying = null;
          const next = call.modularQueue.shift();
          if (next) activateModular(next);
        }
        modularSegmentsIdle();
      },
    };
    call.modularSession = session;
    call.modularOutstanding += 1;

    // One turn-level stopper covers every segment: cut whatever is playing and
    // drop the rest of the queue (barge-in).
    if (!call.stopPlayback) {
      call.stopPlayback = () => {
        const playing = call.modularPlaying;
        const queued = [...call.modularQueue, ...(call.modularSession && !call.modularSession.activated ? [call.modularSession] : [])];
        call.modularQueue = [];
        try { playing?.audioEl?.pause(); } catch { /* noop */ }
        playing?.finish();
        queued.forEach((s) => s.finish());
      };
    }

    if (useMS) {
      const mediaSource = new MediaSource();
      const url = URL.createObjectURL(mediaSource);
      const audioEl = new Audio(url);
      audioEl.volume = call.duckLevel; // a segment starting mid-duck starts quiet
      session.mediaSource = mediaSource;
      session.url = url;
      session.audioEl = audioEl;
      connectAgentPlayer(audioEl); // route into the call recording mix
      audioEl.onended = () => session.finish();
      audioEl.onerror = () => session.finish();
      audioEl.addEventListener('playing', () => noteFirstAudible(session.filler), { once: true });

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
    }

    if (call.modularPlaying) call.modularQueue.push(session);
    else activateModular(session);
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
    call.modularSession = null; // next audio-start opens a fresh segment
    session.ended = true;
    if (session.useMediaSource) {
      // A stream opened but no bytes ever arrived → nothing will ever 'play'/
      // 'end', so finish now instead of hanging on an empty MediaSource.
      if (!session.anyAppended && session.queue.length === 0) { session.finish(); return; }
      pumpModular(session);
      return;
    }
    // Fallback: MediaSource can't play this codec — play the segment as one
    // blob once fully received (immediately if it's already this segment's
    // turn, otherwise when the queue reaches it).
    if (!session.blobChunks.length) { session.finish(); return; }
    session.playBlob = () => {
      const blob = new Blob(session.blobChunks as BlobPart[], { type: session.contentType });
      const url = URL.createObjectURL(blob);
      const audioEl = new Audio(url);
      audioEl.volume = call.duckLevel; // a segment starting mid-duck starts quiet
      session.audioEl = audioEl;
      session.url = url;
      connectAgentPlayer(audioEl);
      audioEl.onended = () => session.finish();
      audioEl.onerror = () => session.finish();
      audioEl.addEventListener('playing', () => noteFirstAudible(session.filler), { once: true });
      audioEl.play().catch(() => session.finish());
    };
    if (session.activated) session.playBlob();
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
    // Start listening NOW, while the reply is still playing out.
    //
    // This used to wait for modularPlaybackSettled(), i.e. for the last audio
    // segment to drain, which left the microphone entirely closed for the
    // length of every reply. A caller who cut in lost the opening of their
    // sentence — barge-in stopped the agent but never captured words, because
    // it watches volume, not speech — and a caller who answered early had to
    // repeat themselves. The segment itself knows the agent is still audible
    // and holds the caller's clocks and the echo-rejecting threshold until it
    // is not, so opening early costs nothing and captures everything.
    //
    // ...unless this caller has already been PROVEN echo-prone. duckDisabled is
    // set after barge-in watched mic energy sit above the ducked threshold for
    // 2.4 continuous seconds without ever becoming an interruption — the
    // signature of the agent's own voice coming back through speakers. For that
    // caller, streaming during playback is how the agent ends up transcribing
    // and answering itself, so they keep the old behaviour. It is the one
    // signal already available that distinguishes headphones from a speaker.
    const resume = () => {
      call.lastSpeechAt = Date.now();
      if (call.active && call.socketMode) startListeningSegmentSocket();
    };
    if (call.duckDisabled) modularPlaybackSettled().then(resume);
    else resume();
  };

  const onModularEvent = (event: ModularCallEvent) => {
    const call = callRef.current;
    // 'ready' is exempt from the active guard, and must stay exempt.
    //
    // modularCallSocket.start() resolves ON the ready frame, and it dispatches
    // the frame to this handler BEFORE resolving — while `call.active` is still
    // false, because active is not set until ~30 lines after that await
    // returns. So every ready frame this call ever received was dropped here,
    // and every field the frame carries silently kept its initial value:
    //
    //   sttEndpointing   stayed false, so the client treated itself as the SOLE
    //                    endpointer and ended turns on ~800ms of RMS silence,
    //                    pre-empting Deepgram's semantic endpoint on every turn.
    //                    That is the mid-sentence cut-off where half a caller's
    //                    words arrive in one turn and the rest in the next.
    //   endpointCommitMs stayed 0, so the backstop the server publishes
    //                    precisely so the two cannot race was never read.
    //   noInputPrompts   stayed empty, so the no-input re-prompt never armed.
    //
    // The handler for 'ready' only writes fields onto `call`; it starts nothing
    // and touches no audio, so running it before the call is marked active is
    // safe — which is exactly why the guard could hide this for so long.
    if (!call.active && event.type !== 'error' && event.type !== 'ready') return;
    switch (event.type) {
      case 'ready':
        // Whether the server can endpoint semantically decides how long the
        // client's RMS VAD waits before ending a turn (backstop vs sole judge).
        call.sttEndpointing = event.sttEndpointing === true;
        call.endpointCommitMs = Number(event.endpointCommitMs) || 0;
        call.noInputPrompts = Array.isArray(event.noInputPrompts)
          ? event.noInputPrompts.filter((p): p is string => typeof p === 'string' && !!p.trim())
          : [];
        call.noInputDelaysMs = Array.isArray(event.noInputDelaysMs) ? event.noInputDelaysMs : [];
        // One line that answers "is the feature even running on this call?".
        // Both silences look identical from the outside — an agent that never
        // re-prompts because the timer is broken and one that never re-prompts
        // because this call is on the bundled engine and never reached this
        // code are indistinguishable to the caller, and were to us.
        console.info('[voice] modular call ready', {
          sttEndpointing: call.sttEndpointing,
          endpointCommitMs: call.endpointCommitMs,
          noInputPrompts: call.noInputPrompts.length,
          firstPrompt: call.noInputPrompts[0] ?? null,
        });
        break; // the promise itself is resolved by modularCallSocket.start()
      case 'transcript':
        if (event.role === 'user' && event.done) call.pendingUserText = event.text;
        if (event.role === 'assistant') setWebCallActivity('speaking');
        break;
      case 'audio-start':
        if (call.turnTiming && !call.turnTiming.turnId && event.turnId) call.turnTiming.turnId = event.turnId;
        startModularPlayback(event.contentType, event.filler === true);
        break;
      case 'audio-chunk':
        appendModularChunk(event.data);
        break;
      case 'audio-end':
        endModularPlayback();
        break;
      case 'endpoint':
        // The server's speech recogniser says the caller finished.
        //
        // This is now a NOTIFICATION, not a request. The server has already
        // started the turn off the same signal (it has our history from
        // start-turn), so what is left here is the half only the browser can
        // do: stop capturing, drop the no-input timers, and move the indicator
        // to "processing". endTurnEarly still sends end-turn, which the server
        // treats as a confirmation of the turn it is already running.
        call.endTurnEarly?.();
        break;
      case 'done':
        finishModularTurn(event);
        break;
      case 'error':
        if (call.active && event.message !== 'Call ended') setWebCallError(event.message);
        // The SERVER hung up — the wallet ran out mid-call, or the socket
        // dropped. Tear the call down on this side too. Leaving it "active"
        // held the mic open against a dead socket and, worse, never sent the
        // terminal PATCH, so the minutes just served were never billed and the
        // call sat in Recent Calls as permanently in progress.
        if (call.active && (event.code === 'INSUFFICIENT_BALANCE' || event.message === 'Call ended')) {
          handleEndWebCall();
        }
        break;
    }
  };

  // Socket-mode equivalent of startListeningSegment: same analyser VAD, but the
  // caller's audio is streamed live to the server as PCM (no MediaRecorder /
  // upload) and the turn ends with a tiny `end-turn` control frame.
  const startListeningSegmentSocket = () => {
    const call = callRef.current;
    if (!call.active || !call.analyser || !call.socketMode) return;
    // ── Continuous capture ───────────────────────────────────────────────────
    //
    // This segment may be armed while the agent is STILL SPEAKING. It used to
    // start only once every reply segment had drained, which meant the mic was
    // not streaming at all for the length of a reply: a caller who cut in had
    // the first second of their sentence discarded before Deepgram received
    // anything, and a caller who answered early ("yes") had to say it twice.
    // Barge-in could stop the agent but never heard WORDS — it watches volume.
    //
    // So capture opens now and the audio flows throughout. What playback gates
    // is not the microphone but the JUDGEMENT: while the agent is audible,
    // speech must clear the echo-rejecting barge bar rather than the ordinary
    // listening bar, the room floor is not re-learned (it would train on our
    // own voice), and silence cannot end the turn. Echo may therefore reach
    // Deepgram's buffer, but it cannot manufacture a turn on its own.
    const playbackActive = () => call.modularOutstanding > 0;
    const armedDuringPlayback = playbackActive();
    if (!armedDuringPlayback) setWebCallActivity('listening');
    call.turnEpoch += 1;
    // History goes with the segment START so the server can run the turn the
    // instant its recogniser commits, instead of telling us and waiting for our
    // end-turn to come back. See modularCallSocket.startTurn.
    modularCallSocket.startTurn(call.audioCtx?.sampleRate || 24000, call.history);
    call.capturingPcm = true;

    const data = new Uint8Array(call.analyser.fftSize);
    let speechDetected = false;
    let lastSpeechAt = Date.now();
    // Monotonic twin of lastSpeechAt, for the audible-latency report only.
    let lastSpeechAtPerf = performance.now();
    // When the caller actually got the floor. Time spent listening under the
    // agent does not count toward MAX_SEGMENT_MS or the silence timeout — both
    // measure how long the CALLER has had to speak, and starting their clock
    // during our own reply would retire the segment before their turn began.
    let listeningSince = armedDuringPlayback ? 0 : Date.now();
    let lastVadLogAt = 0;
    const startedAt = Date.now();

    // ── Adaptive VAD threshold (BUG-001) ─────────────────────────────────────
    // This was a fixed `SPEECH_RMS = 0.025`, and no constant can work here.
    // Room noise is routinely LOUDER than a soft talker, so a threshold low
    // enough to hear a quiet caller also fires on an air conditioner, a fan, or
    // the residual echo of the agent's own TTS — which is how "the UI flips to
    // responding during genuine silence" happened. Raising the constant instead
    // just stops hearing quiet callers.
    //
    // autoGainControl (enabled on the mic stream) makes it strictly worse: AGC
    // RAISES gain when nobody is speaking, so a quiet room's noise floor gets
    // pushed up toward the very threshold meant to exclude it.
    //
    // So track the floor and require an SNR margin above it. The estimate lives
    // on callRef so it persists across turns — it is a property of the caller's
    // room, not of one segment — and it is only updated while we are listening,
    // never while the agent is speaking (that would train it on echo).
    const NOISE_FLOOR_MIN = 0.004;   // never trust a floor below this
    const NOISE_FLOOR_SNR = 3.0;     // ~9.5dB over the floor to count as voice
    const SPEECH_RMS_FLOOR = 0.015;  // absolute floor: below this is never speech
    // Adaptation rate, applied only on ticks judged NOT to be speech (see the
    // VAD loop). Fast enough to settle on the room within a few hundred ms.
    const FLOOR_DOWN = 0.25;
    const speechThreshold = () => (playbackActive()
      // Agent audible: the same bar barge-in uses, which is tuned to reject our
      // own leakage. Anything quieter than this is not treated as the caller.
      ? Math.max(BARGE_RMS_FLOOR, call.noiseFloor * BARGE_SNR)
      : Math.max(SPEECH_RMS_FLOOR, call.noiseFloor * NOISE_FLOOR_SNR));

    // A single frame over the threshold is not speech — a key press, a chair
    // creak, a breath or the tail of the agent's own audio all spike for one
    // tick. Treating that as "the caller spoke" ended the turn on noise and the
    // server then replied to whatever STT invented, so the agent talked while
    // the caller was silent. Require voice sustained across several ticks (the
    // VAD samples every 100ms, so this is ~300ms) before a turn counts as real.
    const VOICED_TICKS_REQUIRED = 3;
    let voicedTicks = 0;
    // Endpointing timeout. Two very different jobs depending on whether the
    // server has model-based endpointing:
    //
    //  - BACKSTOP (sttEndpointing true). The server's confirmed end-of-turn
    //    signal commits after its own grace window. A backstop that fires first
    //    pre-empts it on EVERY turn and reintroduces exactly the mid-sentence
    //    cutoff the grace window exists to prevent — the RMS path has no notion
    //    of "the caller resumed, cancel". So it has to sit clear ABOVE the
    //    server's worst-case commit point.
    //
    //    That point is now READ FROM THE SERVER (`endpointCommitMs` in the
    //    ready frame) instead of being restated here as a constant. It was a
    //    constant, and when the server's grace was extended so a caller could
    //    pause mid-thought, this backstop still fired 100ms earlier and the
    //    extension did nothing at all. Deriving it removes that failure mode.
    //
    //  - SOLE ENDPOINTER (no Deepgram). Nothing else will end the turn, so stay
    //    responsive and accept the occasional early cut.
    //
    // A configured sttSilenceTimeoutMs still raises the floor, but can no
    // longer lower the backstop below the server's commit point.
    const BACKSTOP_MARGIN_MS = 300;
    const serverFloor = call.endpointCommitMs > 0
      ? call.endpointCommitMs + BACKSTOP_MARGIN_MS
      : 1600;
    const SILENCE_MS = call.sttEndpointing
      ? Math.min(3200, Math.max(serverFloor, sttSilenceTimeoutMs || 0))
      : Math.min(1600, Math.max(700, sttSilenceTimeoutMs || 800));
    const MAX_SEGMENT_MS = 20000;

    // Single guarded end-of-turn, called by EITHER the RMS-VAD timeout below OR
    // Deepgram's semantic endpoint signal (call.endTurnEarly) — whichever fires
    // first wins; `ended` stops the other from double-firing.
    let ended = false;
    const clearNoInput = () => {
      if (call.noInputTimer) { window.clearTimeout(call.noInputTimer); call.noInputTimer = null; }
    };

    /**
     * May we hang up on this silence yet?
     *
     * Only once the agent has actually ASKED. maxSilenceBeforeHangup counts from
     * the caller's last utterance and defaults to 15s, while the re-prompt
     * ladder runs to 18s — so the call was being cut after the first prompt and
     * the caller never heard the other two. Worse, hanging up is precisely the
     * wrong response to the case the prompts exist for: someone we could not
     * hear is not someone who left, and dropping the call denies them the one
     * chance to say "hello? can you hear me?".
     *
     * So the deadline still applies, but not before the ladder is exhausted.
     * A caller who has been asked three times and answered none of them has
     * genuinely gone, and the call ends as it did before.
     */
    const silenceHangupAllowed = () => {
      if (!(maxSilenceBeforeHangup > 0)) return false;
      if (Date.now() - call.lastSpeechAt <= maxSilenceBeforeHangup * 1000) return false;
      return call.noInputAttempt >= call.noInputPrompts.length;
    };
    const finishSegment = () => {
      if (ended || !call.active) return;
      ended = true;
      clearNoInput();
      if (call.vadTimer) { clearInterval(call.vadTimer); call.vadTimer = null; }
      call.capturingPcm = false;
      call.endTurnEarly = null;
      console.info('[vad] segment ended', {
        speechDetected,
        heldFloorMs: listeningSince ? Date.now() - listeningSince : null,
        noiseFloor: call.noiseFloor.toFixed(4),
      });
      if (!speechDetected) {
        modularCallSocket.cancelTurn(call.history);
        if (silenceHangupAllowed()) {
          handleEndWebCall();
          return;
        }
        startListeningSegmentSocket();
        return;
      }
      call.lastSpeechAt = Date.now();
      // The caller was heard, so the escalation starts over. Without this the
      // ladder would keep climbing across a whole call and the third, closing
      // line ("feel free to call back") would eventually fire at someone who
      // has been talking the entire time.
      call.noInputAttempt = 0;
      setWebCallActivity('processing');
      // Clocks for this turn's audible-latency report. lastSpeechAtPerf is the
      // last tick the caller's voice cleared the VAD bar - the closest thing
      // the browser has to "the caller stopped talking".
      call.turnTiming = { turnId: null, lastSpeechAtPerf, endTurnAtPerf: performance.now(), firstAudibleAtPerf: null, ackAudibleAtPerf: null };
      modularCallSocket.endTurn(call.history);
    };

    // Deepgram says the caller finished — end now, but only once we actually
    // heard speech this segment (ignore an endpoint on a noise-only segment).
    // Deepgram says the caller finished. That is AUTHORITATIVE — it has words.
    //
    // This used to read `if (speechDetected) finishSegment()`, which let a
    // crude amplitude heuristic veto a real speech recogniser. When the RMS
    // gate disagreed, the segment ran on to its timeout and then took the
    // `!speechDetected` path, which calls cancelTurn() and THROWS THE
    // TRANSCRIPT AWAY. The caller had spoken, Deepgram had understood them, and
    // the client discarded it — which is why the same sentence had to be
    // repeated two or three times before one attempt happened to clear the bar.
    //
    // The RMS gate is a timing hint for when nothing else can tell us the turn
    // ended. It is not evidence about whether speech occurred, and it must
    // never outvote something that actually heard words. So this ends the turn
    // unconditionally and marks the segment as speech, which routes
    // finishSegment down the endTurn path instead of the cancel path.
    call.endTurnEarly = () => {
      if (ended || !call.active) return;
      speechDetected = true;
      finishSegment();
    };

    // ── No-input re-prompt ───────────────────────────────────────────────────
    //
    // A caller who is not heard otherwise gets nothing back until this segment
    // hits MAX_SEGMENT_MS — twenty seconds of dead air, which is how "the agent
    // says nothing and it keeps blank" was reported. Whether they said
    // something we missed or said nothing at all is indistinguishable from
    // here, and the answer is the same either way: say so, and invite them to
    // try again.
    //
    // Deliberately NOT an LLM turn. The line has to land on a deadline, and a
    // model whose p90 time-to-first-token is seconds would make the dead air
    // part of its own cost — worst of all when the line is quiet BECAUSE the
    // model is being rate limited. The wording arrives with the ready frame,
    // already in the agent's language.
    // Armed only once the caller actually HAS the floor. Counting the agent's
    // own reply toward "you have gone quiet" would prompt someone who was
    // politely waiting for us to finish speaking.
    const armNoInput = () => {
      const promptIndex = call.noInputAttempt;
      const nextPrompt = call.noInputPrompts[promptIndex];
      if (!nextPrompt) return;
      const waitMs = call.noInputDelaysMs[promptIndex] || 7000;
      console.info('[voice] no-input timer armed', { attempt: promptIndex + 1, waitMs });
      call.noInputTimer = window.setTimeout(() => {
        call.noInputTimer = null;
        console.info('[voice] no-input timer fired', {
          attempt: promptIndex + 1, ended, speechDetected,
        });
        // speechDetected races us: the caller may have started talking in the
        // final tick before this fired, and cutting in on them would be worse
        // than the silence.
        if (ended || !call.active || speechDetected) return;
        ended = true;
        if (call.vadTimer) { clearInterval(call.vadTimer); call.vadTimer = null; }
        call.capturingPcm = false;
        call.endTurnEarly = null;
        modularCallSocket.cancelTurn(call.history);
        call.noInputAttempt = promptIndex + 1;
        setWebCallActivity('speaking');
        call.history = [...call.history, { role: 'assistant', content: nextPrompt }];
        setWebCallTranscript([...call.history]);
        playAgentAudioStream(nextPrompt)
          .catch(() => { /* a failed re-prompt must not end the call */ })
          .finally(() => { if (call.active) startListeningSegmentSocket(); });
      }, waitMs);
    };
    if (!armedDuringPlayback) armNoInput();

    call.vadTimer = window.setInterval(() => {
      if (!call.active || !call.analyser) return;
      // The agent has just stopped being audible: the caller now has the floor,
      // so start THEIR clocks, show it, and only now begin counting silence
      // against them.
      if (!listeningSince && !playbackActive()) {
        listeningSince = Date.now();
        lastSpeechAt = Date.now();
        lastSpeechAtPerf = performance.now();
        setWebCallActivity('listening');
        armNoInput();
      }
      call.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const d = (data[i] - 128) / 128; sum += d * d; }
      const rms = Math.sqrt(sum / data.length);
      const threshold = speechThreshold();
      // ── VAD trace ────────────────────────────────────────────────────────
      // "The agent isn't hearing me" has four different causes that look
      // identical from the outside: the mic is delivering nothing (rms ~0), the
      // caller is real but under the bar (rms below threshold), the bar itself
      // has drifted up (noiseFloor climbed), or detection worked and the turn
      // ended somewhere later. Only the numbers separate them, and they exist
      // for one tick each. Throttled to ~1/s so a whole call is readable.
      if (Date.now() - lastVadLogAt >= 1000) {
        lastVadLogAt = Date.now();
        console.info('[vad]', {
          rms: rms.toFixed(4),
          threshold: threshold.toFixed(4),
          noiseFloor: call.noiseFloor.toFixed(4),
          over: rms > threshold,
          voicedTicks,
          speechDetected,
          playing: playbackActive(),
        });
      }
      if (rms > threshold) {
        voicedTicks += 1;
        lastSpeechAt = Date.now();
        lastSpeechAtPerf = performance.now();
        if (voicedTicks >= VOICED_TICKS_REQUIRED) speechDetected = true;
        // NOTE: the floor is deliberately NOT adapted here. Letting speech pull
        // it upward meant that on a long turn the floor crept toward the
        // caller's own voice, raising the threshold under them until their
        // speech fell below it — a self-inflicted mid-sentence cutoff that got
        // worse the longer someone talked. Rising room noise is still tracked,
        // just from the non-speech ticks in the branch below, which is the only
        // place we have a trustworthy sample of the room anyway.
      } else {
        // Decay rather than reset: a real word dips below the threshold between
        // syllables, and resetting there would never reach the sustain bar.
        voicedTicks = Math.max(0, voicedTicks - 1);
        // This tick is (as far as we can tell) not speech, so it is the best
        // available sample of the room. Track it quickly.
        // NEVER while the agent is audible: that sample is our own voice, and
        // training the floor on it raises the bar until the caller cannot clear it.
        if (!playbackActive()) {
          call.noiseFloor = Math.max(NOISE_FLOOR_MIN, call.noiseFloor * (1 - FLOOR_DOWN) + rms * FLOOR_DOWN);
        }
      }
      // Nothing below may retire this segment while the agent is still audible:
      // the caller has not had their turn yet, so silence under our own reply is
      // not their silence.
      if (playbackActive()) return;
      const silentFor = Date.now() - lastSpeechAt;
      // A noise-only segment now runs to MAX_SEGMENT_MS instead of ending on the
      // first blip, so check the hang-up deadline here too — otherwise "end the
      // call after N seconds of silence" would only be evaluated every 20s.
      const silenceHangupDue = !speechDetected && silenceHangupAllowed();
      if ((speechDetected && silentFor > SILENCE_MS) || silenceHangupDue
        || Date.now() - (listeningSince || startedAt) > MAX_SEGMENT_MS) {
        finishSegment();
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
      }, { ambientSound });
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
    // Which pipeline this call actually uses. Everything below — continuous
    // capture, the no-input re-prompt, the client-side VAD — belongs to the
    // MODULAR path only; a bundled engine hands the whole conversation to the
    // provider's own realtime socket and none of it applies. Logged because
    // that distinction is invisible from the call UI, and "the feature isn't
    // working" and "this agent never runs that code" look the same.
    console.info('[voice] starting web call', {
      voiceEngine,
      path: voiceEngine === 'modular' ? 'modular (STT→LLM→TTS)' : 'bundled realtime',
    });
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
      let welcome = welcomeAudioRef.current?.welcome ?? activeWelcome;
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
      await modularCallSocket.start(sockWs, agentId, sockToken, onModularEvent, audioCtx.sampleRate);
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
      // A SUSPENDED AudioContext runs no graph, so mixDest emits nothing and the
      // recorder captures an empty file while the call itself sounds fine.
      // Browsers create contexts suspended and also suspend them for background
      // tabs, which is why recordings were going missing intermittently rather
      // than always.
      if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});
      const mixChunks: Blob[] = [];
      const mixRecorder = new MediaRecorder(mixDest.stream);
      mixRecorder.ondataavailable = (e) => { if (e.data.size > 0) mixChunks.push(e.data); };
      mixRecorder.onerror = (e) => console.error('Call recorder error', e);
      mixRecorder.start(1000);

      // Ambient Sound (Call Configuration): layer a synthesized background bed
      // for the duration of the call, captured into the recording too.
      const ambientStop = startAmbientSound(audioCtx, ambientSound, mixDest);

      // noiseFloor starts at 0 so the first listening ticks adapt straight to
      // the real room (FLOOR_DOWN converges in a few hundred ms); until then
      // the absolute SPEECH_RMS_FLOOR governs, which is the conservative end.
      Object.assign(call, { active: true, stream, audioCtx, analyser, history: [], mixDest, mixRecorder, mixChunks, logId: null, lastSpeechAt: Date.now(), ambientStop, socketMode: true, micWorklet, capturingPcm: false, modularPlayChain: null, pendingUserText: '', turnEpoch: 0, noiseFloor: 0, duckLevel: 1, duckDisabled: false });

      // Barge-in, in TWO STAGES: duck first, cut only if they keep going.
      //
      // WHY. A single threshold cannot tell an interruption from a backchannel,
      // and they are not the same event. "Mm-hmm", "right", "okay" are how a
      // listener signals they are still there — a human speaker does not stop
      // talking for those, they carry on. Cutting the agent off at the first
      // 240ms of sound meant every acknowledgement killed the reply mid-
      // sentence, which is both the most robotic thing in the call and a
      // correctness problem: the rest of the answer is simply never said.
      //
      // Stage 1 (DUCK) is what a person does when someone starts talking — get
      // quieter and keep going. It is free and fully reversible, so it can fire
      // on weak evidence. Stage 2 (CUT) is destructive and irreversible, so it
      // waits for evidence a backchannel cannot produce: continuous speech well
      // past the length of one. If they stop before that, volume comes back and
      // neither side ever noticed.
      //
      // Duration is the discriminator rather than content, deliberately: it
      // needs no transcript, so it costs nothing and works identically when
      // Deepgram is not configured. Mic echo-cancellation plus the adaptive
      // threshold below keep the agent's own voice out of the signal.
      // TIMING IS ASYMMETRIC: duck fast, restore slowly. This is not a detail,
      // it is what makes ducking usable at all.
      //
      // The mic hears the agent's own voice (echo cancellation is best-effort,
      // and we have direct evidence it leaks — it produced a phantom user
      // transcript). Echo energy RISES AND FALLS WITH EVERY WORD the agent
      // speaks, because speech is modulated. With a symmetric threshold that
      // means: word crosses the threshold → duck to 25%; the gap before the next
      // word falls below it → restore to 100%; next word → duck again. The
      // result is the agent's own volume pumping in time with its own speech,
      // which sounds exactly like a pause after every word. That was the
      // reported symptom, and it was caused by ducking, not by TTS.
      //
      // Requiring a SUSTAINED quiet period before restoring fixes it: the gaps
      // between words are ~100-200ms, far below RESTORE_HOLD_MS, so a talking
      // agent can no longer pump its own volume. A caller who genuinely stops
      // talking is silent for much longer than that, so the duck still lifts
      // promptly for them. (Classic compressor attack/release, same reason.)
      const DUCK_MS = 240;           // sound over the agent → lower the volume
      const CUT_MS = 800;            // sustained speech → a real interruption
      const RESTORE_HOLD_MS = 600;   // continuous quiet required to come back up
      // A duck that never escalates to a cut was not an interruption.
      //
      // Hysteresis alone stops the pumping, but it has its own failure mode: if
      // echo keeps crossing the threshold, the agent stays ducked for the WHOLE
      // reply and just sounds inexplicably quiet — choppy traded for muffled.
      // A real interrupting caller reaches CUT_MS within a second; echo never
      // does, because the gaps between the agent's own words keep resetting the
      // sustain counter. So a duck this long is self-evidently a false positive:
      // undo it, and stop ducking (see FALSE_DUCKS_BEFORE_DISABLE).
      const MAX_DUCK_MS = 2400;
      // -7dB. Was 0.25 (-12dB), which is not "quieter", it is GONE — on laptop
      // speakers a ducked reply was reported as inaudible. The point of stage 1
      // is to signal "I heard you" while STILL BEING UNDERSTOOD, so a duck has
      // to stay comfortably above the room.
      const DUCK_LEVEL = 0.45;
      // Ducking is a feedback loop, and this is what closes it: lowering the
      // agent's volume lowers the ECHO OF THE AGENT that the mic hears, which is
      // the very signal the duck was triggered by. So while ducked, judge
      // "is it quiet now?" against a threshold scaled by the same factor.
      //
      // Without this the ducker oscillates on its own output, which is the
      // "volume keeps going up and down, sometimes inaudible" symptom:
      //   duck to 25% → echo drops 12dB, now below the threshold → the gap reads
      //   as the caller stopping → RESTORE_HOLD_MS elapses → back to 100% → echo
      //   returns → DUCK_MS elapses → duck again … a ~1s loud/quiet cycle for
      //   the whole reply.
      // A real caller does not get quieter because we ducked, so their speech
      // still clears the scaled threshold and stage 2 cuts as designed; echo
      // does not, so it holds the duck until MAX_DUCK_MS retires it below.
      const duckedQuietThreshold = (t: number) => t * DUCK_LEVEL;
      // ONE false duck is enough to conclude this caller is on speakers, not
      // headphones, and ducking then stays off for the REST OF THE CALL. Stage 2
      // (cut) is deliberately NOT gated by this, so barge-in still works.
      //
      // Was 2, which allowed the level to dip twice before settling and was
      // still reported as the voice dropping away. There is no ambiguity worth
      // a retry here: reaching MAX_DUCK_MS means the mic held energy above the
      // ducked threshold for 2.4 continuous seconds WITHOUT ever sustaining
      // enough to cut. A real interrupting caller passes CUT_MS at 800ms, three
      // times sooner — so this signature is echo, and one sample of it is proof.
      const FALSE_DUCKS_BEFORE_DISABLE = 1;
      let bargeActiveMs = 0;
      let quietMs = 0;
      let duckedMs = 0;
      let falseDucks = 0;
      call.bargeTimer = window.setInterval(() => {
        if (!call.active || !call.analyser || !call.stopPlayback) {
          if (call.duckLevel !== 1) setAgentVolume(1);
          bargeActiveMs = 0;
          quietMs = 0;
          duckedMs = 0;
          return;
        }
        if (call.duckLevel !== 1) duckedMs += 80;
        // Checked EVERY tick, not only on loud ones. This lived inside the
        // `rms > threshold` branch, and so never ran in the one case it was
        // written for: a duck sustained by echo spends its ticks in the quiet
        // branch (the duck itself pushed the echo down), so duckedMs climbed
        // forever and the escape hatch was unreachable dead code.
        if (call.duckLevel !== 1 && duckedMs >= MAX_DUCK_MS) {
          falseDucks += 1;
          if (falseDucks >= FALSE_DUCKS_BEFORE_DISABLE) call.duckDisabled = true;
          setAgentVolume(1);
          duckedMs = 0;
          quietMs = 0;
          console.warn('[barge] duck released — sustained mic energy that never became an '
            + 'interruption (likely echo of the agent).'
            + (call.duckDisabled
              ? ' Ducking is now OFF for this call; barge-in still cuts. Headphones remove this entirely.'
              : ''));
        }
        const buf = new Uint8Array(call.analyser.fftSize);
        call.analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
        const rms = Math.sqrt(sum / buf.length);
        // Adaptive, like the listening VAD, but with a wider margin (5x vs 3x
        // over the tracked noise floor). Barge-in has to clear not just the
        // room but whatever the agent's own TTS leaks back past echo
        // cancellation, and a false trigger here is worse than a missed one —
        // it cuts the agent off mid-sentence for no reason. The floor itself is
        // only ever learned while LISTENING, never during agent speech, so echo
        // cannot train it. Still gated by the ~240ms sustain below.
        const threshold = Math.max(BARGE_RMS_FLOOR, call.noiseFloor * BARGE_SNR);
        // Two thresholds, and the difference is the whole fix. `threshold` is
        // what counts as SPEECH (unscaled — echo attenuated by the duck must not
        // accumulate toward a cut, or the agent would cut itself off). The
        // restore test below uses the duck-scaled one, so a duck cannot
        // manufacture the quiet that ends it.
        if (rms > threshold) {
          bargeActiveMs += 80;
          quietMs = 0;
          // Stage 1: someone started talking. Drop back, keep speaking.
          if (bargeActiveMs >= DUCK_MS && call.duckLevel === 1 && !call.duckDisabled) {
            setAgentVolume(DUCK_LEVEL);
            duckedMs = 0;
            console.info('[barge] ducked', { rms: rms.toFixed(4), noiseFloor: call.noiseFloor.toFixed(4) });
          }
          // Stage 2: still talking — this is a real interruption, not an
          // acknowledgement. Cut the reply and hand the floor over.
          if (bargeActiveMs >= CUT_MS) {
            bargeActiveMs = 0;
            const stop = call.stopPlayback;
            call.stopPlayback = null;
            // Restore the level BEFORE tearing down, so the next reply's
            // segments are not created holding a stale ducked volume.
            setAgentVolume(1);
            quietMs = 0;
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
          // Below the speech threshold, so nothing is accumulating toward a cut.
          bargeActiveMs = 0;
          // Restoring is judged separately and more strictly. An inter-word gap
          // in the agent's OWN echo looks identical to the caller stopping, and
          // once ducked, so does the echo itself (we made it quieter). Requiring
          // BOTH a genuinely low level (duck-scaled) and that it hold for
          // RESTORE_HOLD_MS is what stops the level from oscillating; a caller
          // who really stopped clears both easily.
          if (call.duckLevel !== 1) {
            if (rms > duckedQuietThreshold(threshold)) quietMs = 0;
            else quietMs += 80;
            if (quietMs >= RESTORE_HOLD_MS) {
              setAgentVolume(1);
              duckedMs = 0;
            }
          } else {
            quietMs += 80;
          }
        }
      }, 80);

      // Open the Recent Calls history entry for this call
      whapi.post<{ call?: { id: string }; limit?: { code: string; message: string } }>(
        `/agents/${agentId}/calls`, { type: 'WEB_CALL', transcript: [], status: 'IN_PROGRESS' },
      )
        .then((r) => {
          call.logId = r?.call?.id ?? null;
          // The call IS recorded either way; this only reports that it went past
          // a plan limit, so the user learns about it without losing history.
          if (r?.limit) toast.warning(r.limit.message);
          // Tell the socket which row this call belongs to, so the server can
          // close the call out and bill it if this tab is closed mid-call. See
          // attachCallLog.
          if (call.logId && call.socketMode) modularCallSocket.attachCallLog(call.logId);
          if (call.logId && call.history.length) {
            whapi.patch(`/agents/${agentId}/calls/${call.logId}`, { transcript: call.history }).catch(() => {});
          }
        })
        .catch((e) => {
          // MUST be visible. This failing means the call is not recorded in
          // Recent Calls and not billed, while the call itself carries on
          // normally — so swallowing it into console.error made the platform
          // look like it was silently dropping calls.
          console.error('Failed to start call history entry', e);
          const msg = e instanceof Error ? e.message : 'Unknown error';
          toast.error(`This call will not appear in Recent Calls: ${msg}`);
        });

      setWebCallStatus('connected');

      // Agent speaks the welcome message first, like a real call.
      await welcomeFetch;
      call.history = [{ role: 'assistant', content: welcome }];
      setWebCallTranscript([...call.history]);
      if (call.active && welcomeSpeech.current) {
        setWebCallActivity('speaking');
        await playAgentAudio(welcomeSpeech.current.audioBase64, welcomeSpeech.current.contentType);
      }

      // `lastSpeechAt` was stamped when the call object was created, before
      // mic permission, welcome TTS fetch and playback all ran. On a long
      // greeting or a slow TTS round trip that alone can exceed
      // `maxSilenceBeforeHangup`, so the very first VAD tick below saw a
      // silence window that started before the caller could possibly have
      // spoken and hung up the call the instant the greeting finished.
      // Listening starts now, so the silence clock has to start now too.
      call.lastSpeechAt = Date.now();
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
    // An armed re-prompt must not fire into a call that has already ended.
    if (call.noInputTimer) { window.clearTimeout(call.noInputTimer); call.noInputTimer = null; }
    call.noInputAttempt = 0;
    // A fade still in flight would keep firing against torn-down elements, and
    // leave duckLevel stranded below 1 for the NEXT call's first segment.
    if (call.duckRamp !== null) { clearInterval(call.duckRamp); call.duckRamp = null; }
    call.duckLevel = 1;
    call.stopPlayback = null;
    // B2 modular socket teardown (recording/ambient below still run as before).
    if (call.socketMode) {
      call.socketMode = false;
      call.capturingPcm = false;
      call.endTurnEarly = null;
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
      // The recording is uploaded BEFORE the terminal PATCH, and in its own
      // try/catch. `ended: true` makes the server settle billing, run LLM
      // variable extraction and fire every Post-Call destination
      // (webhook/email/Sheets) before it responds — seconds of work. Uploading
      // after it meant anything that ended the page in that window (navigating
      // off the tab, closing it, a slow webhook) took the recording with it,
      // and a throw from the PATCH skipped the upload entirely. That is why
      // recordings survived some calls and vanished from others.
      try {
        if (blob && blob.size > 0) {
          await withRetry('Call recording upload', () => {
            // Rebuilt per attempt. A FormData that has already been handed to
            // fetch is not guaranteed to be re-readable, and silently uploading
            // an empty body on the retry would be worse than the first failure.
            const fd = new FormData();
            fd.append('recording', blob, 'web-call.webm');
            return whapi.postForm(`/agents/${agentId}/calls/${logId}/recording`, fd);
          });
        } else {
          // Silent before: the call appeared in Recent Calls with no "recording"
          // link and no explanation, so a missing recording looked like the
          // feature had been removed rather than like one call having failed.
          console.warn('Call recording was empty — nothing uploaded', { chunks: mixChunks.length });
          toast.warning('This call was saved, but its audio recording could not be captured.');
        }
      } catch (e) {
        // Not necessarily lost any more. The server stores the file under a name
        // that identifies this call before it writes the row, so an upload that
        // arrived and then failed to attach is picked up by the backend's
        // reattach sweep. Only an upload that never arrived is gone, and from
        // here the two are indistinguishable — so the message promises the
        // recovery without claiming it already happened.
        console.error('Failed to upload call recording', e);
        toast.error('Could not attach the call recording. If it reached the server it will be linked to this call automatically.');
      }
      try {
        await withRetry('Call log finalize', () => whapi.patch(
          `/agents/${agentId}/calls/${logId}`,
          { transcript: history, status: finalStatus, ended: true },
        ));
      } catch (e) {
        console.error('Failed to finalize call history', e);
        toast.error(`Could not finalize the call log: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    };
    if (mixRecorder && mixRecorder.state !== 'inactive') {
      mixRecorder.onstop = () => finalize(new Blob(mixChunks, { type: mixRecorder.mimeType || 'audio/webm' }));
      try {
        // Flush the partial timeslice still buffered, or the last <1s is lost —
        // and on a short call that can be the ENTIRE recording.
        mixRecorder.requestData();
        mixRecorder.stop();
      } catch { finalize(null); }
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
      <div style={{ width: '100%', minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--tx)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--ff-b)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid var(--s1)', borderTopColor: 'var(--cyan)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '14px', color: 'var(--tx-2)' }}>Loading agent configuration...</span>
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
    <div className="agent-builder" style={{ width: '100%', minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--tx)', fontFamily: 'var(--ff-b)' }}>
      {/*
        Typography for the whole builder lives here rather than on the hundreds
        of inline style objects below. The page sets almost no fontFamily of its
        own, so these scoped rules win by default and the Spandan type roles —
        Space Grotesk to lead, Inter to carry, JetBrains Mono to instrument —
        land without touching every element.

        Before this the root container declared the OS system stack, so the
        builder rendered in Segoe UI while the rest of the app used Inter.
      */}
      <style>{`
        .agent-builder h1,
        .agent-builder h2,
        .agent-builder h3,
        .agent-builder h4 {
          font-family: var(--ff-d);
          letter-spacing: -0.01em;
        }
        /* Instrument readings: latency, token counts, ids, keys, timings. */
        .agent-builder .ab-mono,
        .agent-builder code,
        .agent-builder pre {
          font-family: var(--ff-m);
        }
        .agent-builder input,
        .agent-builder textarea,
        .agent-builder select {
          font-family: var(--ff-b);
        }
        /* Focus ring matches the rest of the app instead of the UA default. */
        .agent-builder :focus-visible {
          outline: 2px solid var(--focus);
          outline-offset: 2px;
          border-radius: 4px;
        }
      `}</style>

      {/* Language Configuration Modal */}
      {showLanguageModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--s1)', borderRadius: '8px', padding: '30px', maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Language Configuration</h2>
              <button onClick={() => setShowLanguageModal(false)} style={{ background: 'none', border: 'none', color: 'var(--tx-2)', cursor: 'pointer', fontSize: '24px' }}>X</button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--tx-2)', marginBottom: '20px' }}>Choose multiple languages for your agent to support</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              {LANGUAGES_LIST.map(lang => (
                <label key={lang} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg-primary)', border: selectedLanguages.includes(lang) ? '1px solid var(--cyan)' : '1px solid var(--line-2)', borderRadius: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedLanguages.includes(lang)}
                    onChange={() => toggleLanguage(lang)}
                    style={{ accentColor: 'var(--cyan)', width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '13px' }}>{lang}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLanguageModal(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--tx)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={() => { setShowLanguageModal(false); handleSave(); }} style={{ padding: '10px 20px', background: 'var(--cyan)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Done</button>
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
          <div style={{ background: 'var(--s1)', borderRadius: '8px', padding: '30px', maxWidth: '560px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Conversational Agent</h2>
              <button onClick={() => setShowXaiModal(false)} style={{ background: 'none', border: 'none', color: 'var(--tx-2)', cursor: 'pointer', fontSize: '24px' }}>X</button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--tx-2)', lineHeight: 1.6, marginBottom: '20px' }}>
              Routes this agent's Web Call and Phone Call through a single bundled speech-to-speech
              engine that replaces Languages, Voice (TTS), AI Model (LLM) and Transcription (STT).
              Those four settings are disabled while one is active; choose Off to configure them
              individually again.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* "Off" is always offered — it is the absence of an engine, not a
                  model an admin can withdraw. The engines themselves come from
                  the platform catalogue. */}
              {([
                { value: 'modular' as const, label: 'Off (modular pipeline)' },
                ...(modelCatalog?.conversational ?? []).map((m) => ({
                  value: m.value as 'xai' | 'elevenlabs',
                  label: m.label,
                })),
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setVoiceEngine(opt.value); setShowXaiModal(false); handleSave({ voiceEngine: opt.value }); }}
                  style={{ padding: '12px', background: voiceEngine === opt.value ? 'var(--cyan)' : 'var(--bg-primary)', color: voiceEngine === opt.value ? '#000' : 'var(--tx)', border: voiceEngine === opt.value ? 'none' : '1px solid var(--line-2)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: voiceEngine === opt.value ? 600 : 400, textAlign: 'left' }}
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
        // Backdrop closes the picker. It has to, because the panel can be taller
        // than the viewport on a short window and the close button is then the
        // first thing to go off-screen — which is how this became a trap rather
        // than just an ugly list.
        <div
          onClick={() => setShowModelModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--s1)',
              borderRadius: '8px',
              maxWidth: '520px',
              width: '100%',
              // THE BUG. Without a ceiling the panel grew to fit every model in
              // the catalogue, and a flex container centring an over-tall child
              // pushes half the overflow ABOVE the top of the screen, where it
              // cannot be scrolled to. The title and the close button were up
              // there. Cap the panel and scroll the LIST instead, so the header
              // stays put no matter how many models the platform enables.
              maxHeight: 'min(85vh, 680px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ flex: 'none', padding: '24px 24px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '4px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>AI Model</h2>
                <button
                  onClick={() => setShowModelModal(false)}
                  aria-label="Close"
                  style={{ background: 'none', border: 'none', color: 'var(--tx-2)', cursor: 'pointer', padding: '2px', display: 'flex', lineHeight: 0 }}
                >
                  <X size={20} />
                </button>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--tx-2)', margin: '0 0 16px' }}>
                The model that writes this agent&apos;s replies. Currently <span style={{ color: 'var(--tx)', fontWeight: 600 }}>{aiModel || 'not set'}</span>.
              </p>
              {/* Worth its place at seventeen models across five providers — the
                  flat alphabetical-ish list meant hunting for a known name. */}
              {(modelCatalog?.llm.length ?? 0) > 8 && (
                <input
                  autoFocus
                  value={modelQuery}
                  onChange={e => setModelQuery(e.target.value)}
                  placeholder="Search models"
                  style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--line-2)', borderRadius: '6px', color: 'var(--tx)', outline: 'none', fontSize: '13px', marginBottom: '16px' }}
                />
              )}
            </div>

            <div style={{ overflowY: 'auto', padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {!modelCatalog && <p style={{ fontSize: '13px', color: 'var(--tx-2)', margin: 0 }}>Loading available models…</p>}
              {modelCatalog?.llm.length === 0 && (
                <p style={{ fontSize: '13px', color: 'var(--tx-2)', margin: 0, lineHeight: 1.6 }}>
                  No AI models are available on this platform right now. Contact your administrator.
                </p>
              )}
              {modelCatalog && modelCatalog.llm.length > 0 && visibleModelGroups.length === 0 && (
                <p style={{ fontSize: '13px', color: 'var(--tx-2)', margin: 0 }}>
                  No models match “{modelQuery}”.
                </p>
              )}
              {visibleModelGroups.map(([provider, models]) => (
                <div key={provider}>
                  {/* Grouping is the information, not decoration: which provider
                      serves a model decides its cost, its latency and which API
                      key has to be configured for it to work at all. */}
                  <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--tx-2)', marginBottom: '8px' }}>
                    {provider}
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {models.map(model => {
                      const selected = aiModel.toLowerCase() === model.value.toLowerCase();
                      return (
                        <button
                          key={model.value}
                          onClick={() => { setAiModel(model.value); setShowModelModal(false); handleSave({ aiModel: model.value }); }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            padding: '11px 13px',
                            background: selected ? '#0a2e30' : 'var(--bg-primary)',
                            color: 'var(--tx)',
                            border: `1px solid ${selected ? 'var(--cyan)' : 'var(--line-2)'}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            textAlign: 'left',
                            fontWeight: selected ? 600 : 400,
                            width: '100%',
                          }}
                        >
                          <span>{model.label}</span>
                          {/* Colour alone carried the selected state before. A
                              check reads at a glance and survives a colourblind
                              viewer. */}
                          {selected && <Check size={16} style={{ color: 'var(--cyan)', flex: 'none' }} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Transcription Configuration Modal (Speech-to-Text) */}
      {showTranscriptionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--s1)', borderRadius: '8px', padding: '30px', maxWidth: '900px', width: '90%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Speech-to-Text Configuration</h2>
              <button onClick={() => setShowTranscriptionModal(false)} style={{ background: 'none', border: 'none', color: 'var(--tx-2)', cursor: 'pointer', fontSize: '24px' }}>X</button>
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
                      background: 'var(--bg-primary)', 
                      border: '1px solid var(--line-2)', 
                      borderRadius: '6px', 
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: 'var(--tx)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MicIcon />
                      <span>{sttProvider}</span>
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--tx-2)', transform: isSttProviderDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>v</span>
                  </div>
                  {isSttProviderDropdownOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-primary)', border: '1px solid var(--line-2)', borderRadius: '6px', marginTop: '4px', zIndex: 10 }}>
                      {!modelCatalog && (
                        <div style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--tx-2)' }}>Loading providers…</div>
                      )}
                      {modelCatalog?.stt.length === 0 && (
                        <div style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--tx-2)' }}>
                          No transcription providers are available. Contact your administrator.
                        </div>
                      )}
                      {modelCatalog?.stt.map(({ value: provider, label }) => (
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
                            color: 'var(--tx)',
                            background: sttProvider === provider ? 'var(--s1)' : 'transparent'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--s1)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = sttProvider === provider ? 'var(--s1)' : 'transparent'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MicIcon />
                            <span>{label}</span>
                          </div>
                          {sttProvider === provider && <span style={{ color: 'var(--tx)', fontSize: '12px' }}>OK</span>}
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
                        accentColor: 'var(--cyan)', 
                        height: '4px', 
                        background: 'var(--s2)',
                        borderRadius: '2px',
                        appearance: 'none',
                        cursor: 'pointer'
                      }} 
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: 'var(--tx-2)' }}>
                    <span>0ms</span>
                    <span style={{ color: 'var(--tx)' }}>{sttSilenceTimeoutMs}ms</span>
                    <span>1500ms</span>
                  </div>
                </div>

                {/* "Apply Noise Reducer" lived here. Nothing read
                    sttNoiseReducer on either channel. */}
                <div 
                  onClick={() => setSttAdvancedSettingsOpen(!sttAdvancedSettingsOpen)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '14px', 
                    background: 'var(--bg-primary)', 
                    border: '1px solid var(--line)', 
                    borderRadius: '6px', 
                    cursor: 'pointer' 
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: '500' }}>Advanced Settings</span>
                  <span style={{ fontSize: '10px', color: 'var(--tx-2)', transform: sttAdvancedSettingsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>v</span>
                </div>
              </div>

              {/* Right Column */}
              <div style={{ paddingLeft: '30px', borderLeft: '1px solid var(--s1)' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '20px' }}>
                  {sttProvider === 'Sarvam' ? 'Sarvam AI Configuration' : `${sttProvider} Configuration`}
                </div>
                
                {/* An STT "Model" picker lived here. Nothing read sttModel:
                    the model is chosen by deepgramStream.service.js from the
                    language and encoding. Removed rather than left misleading. */}

                <div style={{ marginBottom: '16px', position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '8px' }}>Language</label>
                  <div 
                    onClick={() => setIsSttLanguageDropdownOpen(!isSttLanguageDropdownOpen)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--line-2)', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                  >
                    <span>{sttLanguage}</span>
                    <span style={{ fontSize: '10px', color: 'var(--tx-2)' }}>v</span>
                  </div>
                  {isSttLanguageDropdownOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-primary)', border: '1px solid var(--line-2)', borderRadius: '6px', marginTop: '4px', zIndex: 10 }}>
                      {['Multi', 'English', 'Hindi', 'Tamil'].map(lang => (
                        <div 
                          key={lang} 
                          onClick={() => { setSttLanguage(lang); setIsSttLanguageDropdownOpen(false); }}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: 'var(--tx)', background: sttLanguage === lang ? 'var(--s1)' : 'transparent' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--s1)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = sttLanguage === lang ? 'var(--s1)' : 'transparent'}
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
                style={{ padding: '10px 24px', background: 'var(--cyan)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
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
          <div style={{ background: 'var(--s1)', borderRadius: '12px', padding: '32px', maxWidth: '480px', width: '90%', textAlign: 'center', border: '1px solid var(--line-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
              <button onClick={() => { cleanupWebCall(); setShowWebCallModal(false); setWebCallActive(false); setWebCallStatus('idle'); }} style={{ background: 'none', border: 'none', color: 'var(--tx-2)', cursor: 'pointer', fontSize: '20px' }}>✕</button>
            </div>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: webCallStatus === 'connected' ? 'rgba(76,175,80,0.2)' : webCallStatus === 'connecting' ? 'rgba(255,152,0,0.2)' : 'rgba(0,188,212,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: webCallStatus === 'connected' ? '2px solid var(--lime)' : '2px solid var(--cyan)', transition: 'all 0.3s', animation: webCallStatus === 'connected' && webCallActivity === 'listening' ? 'pulse 1.6s ease-in-out infinite' : undefined }}>
              {/* Call state as icons rather than emoji — emoji render at
                  different sizes and weights per platform, so the 80px dial
                  jumped around between states. */}
              <span style={{ display: 'flex', color: webCallStatus === 'connected' ? 'var(--lime)' : webCallStatus === 'connecting' ? 'var(--orange)' : 'var(--cyan-fg)' }}>
                {webCallStatus === 'connected'
                  ? (webCallActivity === 'speaking' ? <Volume2 size={34} /> : webCallActivity === 'processing' ? <Loader2 size={34} className="animate-spin" /> : <AudioLines size={34} />)
                  : webCallStatus === 'connecting' ? <Loader2 size={34} className="animate-spin" /> : <Globe size={34} />}
              </span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 8px', color: 'var(--tx)' }}>
              {webCallStatus === 'idle' ? 'Web Call Test' : webCallStatus === 'connecting' ? 'Connecting...' : webCallStatus === 'connected' ? (webCallActivity === 'speaking' ? `${agentName} is speaking…` : webCallActivity === 'processing' ? 'Responding…' : 'Listening…') : 'Call Ended'}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--tx-2)', marginBottom: '16px' }}>
              {webCallStatus === 'idle' ? `Test your agent "${agentName}" with a browser-based voice call.` : webCallStatus === 'connecting' ? 'Requesting microphone & starting the agent...' : webCallStatus === 'connected' ? 'Speak naturally — pause briefly when you finish and the agent will respond.' : 'The test call has ended.'}
            </p>
            {webCallError && (
              <p style={{ fontSize: '13px', color: 'var(--err)', marginBottom: '16px' }}>{webCallError}</p>
            )}
            {webCallLatency && webCallStatus === 'connected' && (
              <p style={{ fontSize: '12px', color: 'var(--tx-3)', margin: '-8px 0 14px' }}>
                STT {(webCallLatency.sttMs / 1000).toFixed(1)}s | AI {(webCallLatency.llmMs / 1000).toFixed(1)}s
              </p>
            )}
            {webCallTranscript.length > 0 && (
              <div style={{ maxHeight: '220px', overflowY: 'auto', textAlign: 'left', background: 'var(--s1)', border: '1px solid var(--s2)', borderRadius: '8px', padding: '12px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {webCallTranscript.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '8px 12px', borderRadius: '10px', fontSize: '13px', lineHeight: 1.45, background: m.role === 'user' ? 'var(--cyan)' : '#242424', color: m.role === 'user' ? '#000' : 'var(--tx)' }}>
                    {m.content}
                  </div>
                ))}
              </div>
            )}
            {!webCallActive ? (
              <button
                onClick={handleStartWebCall}
                style={{ padding: '14px 32px', background: 'var(--cyan)', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
              >🎤 Start Web Call</button>
            ) : webCallStatus === 'connected' ? (
              <button
                onClick={handleEndWebCall}
                style={{ padding: '14px 32px', background: 'var(--err)', color: 'var(--tx)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
              >📞 End Call</button>
            ) : null}
          </div>
        </div>
      )}

      {/* Phone Call Modal */}
      {showPhoneCallModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--s1)', borderRadius: '12px', padding: '30px', maxWidth: '440px', width: '90%', border: '1px solid var(--line-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>📞 Test Phone Call</h2>
              <button onClick={() => setShowPhoneCallModal(false)} style={{ background: 'none', border: 'none', color: 'var(--tx-2)', cursor: 'pointer', fontSize: '24px' }}>✕</button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--tx-2)', marginBottom: '16px' }}>Enter a phone number to receive a test call from your agent "{agentName}". Make sure your Twilio account is configured.</p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '8px' }}>Phone Number</label>
              <input
                type="tel"
                value={phoneTestNumber}
                onChange={e => setPhoneTestNumber(e.target.value)}
                placeholder="+1 (555) 123-4567"
                style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--line-2)', borderRadius: '8px', padding: '12px 14px', color: 'var(--tx)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <CallerNumberPicker value={fromNumber} onChange={setFromNumber} />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPhoneCallModal(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--tx)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button
                onClick={handlePhoneCall}
                disabled={!phoneTestNumber.trim()}
                style={{ padding: '10px 20px', background: 'var(--cyan)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', opacity: !phoneTestNumber.trim() ? 0.6 : 1 }}
              >📞 Call Now</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--s1)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate('/dashboard')}
          aria-label="Back to dashboard"
          title="Back to dashboard"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', background: 'none', border: 'none', borderRadius: '8px', color: 'var(--tx-2)', cursor: 'pointer', padding: 0 }}
        >
          <ArrowLeft size={18} />
        </button>

        <input
          type="text"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          style={{
            padding: '8px 12px',
            background: 'var(--s2)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            color: 'var(--tx)',
            fontSize: '14px',
            fontWeight: '600',
            outline: 'none',
            minWidth: '240px'
          }}
          placeholder="Agent Name"
        />

        <div
          onClick={() => setCallDirection(callDirection === 'OUTBOUND' ? 'INBOUND' : 'OUTBOUND')}
          title="Call direction — click to switch. Incoming: customers call your agent (thanking them for calling is fine). Outgoing: your agent dials the customer (never say 'thank you for calling')."
          style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 12px', background: callDirection === 'OUTBOUND' ? 'rgba(249,115,22,0.12)' : 'var(--teal-light)', border: `1px solid ${callDirection === 'OUTBOUND' ? 'rgba(249,115,22,0.35)' : 'rgba(14,179,158,0.35)'}`, borderRadius: 'var(--radius-full)', fontSize: '12px', color: callDirection === 'OUTBOUND' ? 'var(--orange)' : 'var(--cyan-fg)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
          {callDirection === 'OUTBOUND' ? <PhoneOutgoing size={13} /> : <PhoneIncoming size={13} />}
          {callDirection === 'OUTBOUND' ? 'Outgoing' : 'Incoming'}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/*
            Ask AI steps back to a ghost button. It was solid orange while
            Deploy — the actual primary action — was grey, so the header read
            with its hierarchy inverted.
          */}
          <button
            onClick={() => { setShowAskAIModal(true); setAskAIResponse(''); setAskAIInput(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 14px', background: 'transparent', color: 'var(--tx-2)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--tx)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--tx-2)'; }}
          >
            <Sparkles size={15} /> Ask AI
          </button>

          {/*
            One segmented control in a single accent, rather than three
            separately outlined buttons in three different colours.
          */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: 'var(--tx-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>Test with</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'var(--s2)', padding: '3px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
              {[
                { Icon: MessageSquare, label: 'Chat', active: activeTab === 'chat', onClick: () => setActiveTab('chat') },
                { Icon: Globe, label: 'Web call', active: false, onClick: () => setShowWebCallModal(true) },
                { Icon: Phone, label: 'Phone call', active: false, onClick: () => setShowPhoneCallModal(true) },
              ].map(({ Icon, label, active, onClick }) => (
                <button
                  key={label}
                  onClick={onClick}
                  aria-pressed={active}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                    background: active ? 'var(--cyan)' : 'transparent',
                    color: active ? '#060c17' : 'var(--tx-2)',
                    border: 'none', borderRadius: '5px', cursor: 'pointer',
                    fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--tx)'; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--tx-2)'; } }}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Deploy Button with Dropdown */}
          <div style={{ position: 'relative' }}>
            {/* The primary action, and now styled like it. */}
            <button
              onClick={() => setShowDeployDropdown(prev => !prev)}
              aria-expanded={showDeployDropdown}
              aria-haspopup="menu"
              style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', background: deployStatus === 'done' ? 'var(--lime)' : 'var(--cyan)', color: '#060c17', border: 'none', borderRadius: 'var(--radius-sm)', cursor: deployStatus === 'deploying' ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700, opacity: deployStatus === 'deploying' ? 0.7 : 1, transition: 'background 0.2s ease, opacity 0.2s ease' }}
              disabled={deployStatus === 'deploying'}
            >
              {deployStatus === 'deploying' ? (
                <><Loader2 size={15} className="animate-spin" /> Deploying…</>
              ) : deployStatus === 'done' ? (
                <><Check size={15} /> Deployed</>
              ) : (
                <><Rocket size={15} /> Deploy</>
              )}
              <ChevronDown size={13} style={{ opacity: 0.75 }} />
            </button>
            {showDeployDropdown && (
              <div role="menu" style={{ position: 'absolute', top: '110%', right: 0, background: 'var(--dropdown-bg)', border: '1px solid var(--dropdown-border)', borderRadius: 'var(--radius-sm)', minWidth: '210px', zIndex: 200, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
                <div style={{ padding: '6px 0' }}>
                  <button role="menuitem" onClick={handleDeploy} style={{ width: '100%', background: 'transparent', border: 'none', padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: 'var(--dropdown-text)', display: 'flex', gap: '10px', alignItems: 'center', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--dropdown-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Rocket size={15} /> Save and deploy
                  </button>
                  <button role="menuitem" onClick={() => { handleSave(); setShowDeployDropdown(false); }} style={{ width: '100%', background: 'transparent', border: 'none', padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: 'var(--dropdown-text)', display: 'flex', gap: '10px', alignItems: 'center', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--dropdown-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Save size={15} /> Save draft
                  </button>
                  <div style={{ height: '1px', background: 'var(--dropdown-border)', margin: '6px 0' }} />
                  <button role="menuitem" onClick={() => { navigator.clipboard.writeText(window.location.href); setShowDeployDropdown(false); toast.success('Agent link copied'); }} style={{ width: '100%', background: 'transparent', border: 'none', padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: 'var(--tx-2)', display: 'flex', gap: '10px', alignItems: 'center', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--dropdown-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Link2 size={15} /> Copy agent link
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* UI / Code Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: '20px', padding: '2px' }}>
            <div
              onClick={() => setViewMode('ui')}
              style={{ padding: '4px 12px', background: viewMode === 'ui' ? 'var(--s2)' : 'transparent', color: viewMode === 'ui' ? 'var(--tx)' : 'var(--tx-3)', borderRadius: '18px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' }}
            >UI</div>
            <div
              onClick={() => setViewMode('code')}
              style={{ padding: '4px 12px', background: viewMode === 'code' ? 'var(--s2)' : 'transparent', color: viewMode === 'code' ? 'var(--tx)' : 'var(--tx-3)', borderRadius: '18px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' }}
            >Code</div>
          </div>

          {/* The theme toggle lives in the DashboardLayout topbar, which wraps
              this page — a second one here was the same control twice. */}
        </div>

      </div>

      <div style={{ display: 'flex', flex: 1, height: 'calc(100vh - 73px)' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {agentNotFound && (
              <div style={{ padding: '40px', background: 'var(--s1)', border: '1px solid var(--line-2)', borderRadius: '12px', margin: '20px 30px', color: 'var(--tx)' }}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>Agent not found</h2>
                <p style={{ color: 'var(--tx-2)', marginTop: '10px' }}>The assistant you are trying to edit does not exist or has been removed. Return to the dashboard to select a different assistant.</p>
                <button onClick={() => navigate('/dashboard')} style={{ marginTop: '16px', padding: '10px 18px', background: 'var(--cyan)', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Back to Dashboard</button>
              </div>
            )}

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'var(--bg-2)', padding: '0 24px', overflowX: 'auto', alignItems: 'center' }}>
        {/* .rz-utabs is the shared underline tab group — same shape, same
            active accent and same hairline as every other in-panel switcher. */}
        <div className="rz-utabs" style={{ flex: 1, gap: '4px' }} role="tablist">
          {[
            { id: 'details', label: 'Assistant details' },
            { id: 'config', label: 'Call configuration' },
            { id: 'kb', label: 'Knowledge base' },
            { id: 'integrations', label: 'Integrations' },
            { id: 'postcall', label: 'Post-call' },
            { id: 'chat', label: 'Chat test' },
            { id: 'calls', label: 'Recent calls' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`rz-utab${activeTab === tab.id ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* A second "Search or jump to… Ctrl+K" field used to sit here. It had
            no value, no onChange and no handler — dead markup duplicating the
            working ⌘K search in the topbar directly above it. */}
      </div>

      {/* Content */}
      {viewMode === 'code' ? (
        <div style={{ padding: '30px 24px' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '18px', color: 'var(--tx)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>{'{ }'}</span> Agent Configuration (JSON)
          </div>
          <textarea
            readOnly
            value={JSON.stringify({
              name: agentName,
              welcomeMessage: activeWelcome,
              aiModel,
              voice,
              transcription,
              languages: selectedLanguages,
              flowItems,
              maxDuration,
              silenceTimeout,
              interruptibleEnabled,
              postCallConfigs
            }, null, 2)}
            style={{ width: '100%', minHeight: '500px', background: 'var(--bg-secondary)', border: '1px solid var(--line)', borderRadius: '8px', padding: '20px', color: 'var(--cyan-fg)', fontSize: '13px', fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button
              onClick={() => { navigator.clipboard.writeText(JSON.stringify({ name: agentName, welcomeMessage: activeWelcome, welcomeInbound, welcomeOutbound, aiModel, voice, transcription, languages: selectedLanguages, flowItems, maxDuration, silenceTimeout, interruptibleEnabled, postCallConfigs }, null, 2)); alert('Copied to clipboard!'); }}
              style={{ padding: '10px 20px', background: 'var(--s1)', border: '1px solid var(--line-2)', color: 'var(--tx)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
            >📋 Copy JSON</button>
            <button
              onClick={() => { const blob = new Blob([JSON.stringify({ name: agentName, welcomeMessage: activeWelcome, welcomeInbound, welcomeOutbound, aiModel, voice, transcription, languages: selectedLanguages, flowItems, maxDuration, silenceTimeout, interruptibleEnabled, postCallConfigs }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${agentName.replace(/\s+/g, '_')}_config.json`; a.click(); URL.revokeObjectURL(url); }}
              style={{ padding: '10px 20px', background: 'var(--s1)', border: '1px solid var(--line-2)', color: 'var(--tx)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
            >⬇️ Download JSON</button>
          </div>
        </div>
      ) : (
      <div style={{ padding: '30px 24px' }}>
        {activeTab === 'details' && (
          <>
            {/* Assistant Settings — rendered as the signal chain it actually is */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '14px' }}>
              <h2 className="font-display" style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--tx)' }}>
                Assistant settings
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--tx-3)' }}>
                How a call flows through your agent, left to right
              </span>
            </div>

            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--line)', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
              <div className="pipeline">
                {/*
                  Ordered by how audio actually moves: the caller speaks a
                  language, it is transcribed, a model reasons over it, and a
                  voice speaks the reply. The previous order put TTS second,
                  which made the row look arbitrary.
                */}
                {[
                  { Icon: LanguagesIcon, label: 'Language', value: selectedLanguages.length > 0 ? selectedLanguages.join(', ') : 'Not set', onClick: () => setShowLanguageModal(true), key: 'lang' },
                  { Icon: AudioLines, label: 'Transcription', value: transcription, onClick: () => setShowTranscriptionModal(true), key: 'stt' },
                  { Icon: Cpu, label: 'Model', value: aiModel, onClick: () => setShowModelModal(true), key: 'llm' },
                  { Icon: Volume2, label: 'Voice', value: voice, onClick: () => setShowVoiceModal(true), key: 'tts' },
                ].map(({ Icon, label, value, onClick, key }) => {
                  // A bundled Conversational Agent replaces STT + LLM entirely,
                  // but still takes a Language and a Voice — so only those two
                  // stages lock.
                  const superseded = voiceEngine !== 'modular' && (key === 'llm' || key === 'stt');
                  const engineLabel = voiceEngine === 'xai' ? 'xAI' : voiceEngine === 'elevenlabs' ? 'ElevenLabs' : '';
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`pipeline-stage${superseded ? ' is-superseded' : ''}`}
                      aria-disabled={superseded}
                      title={superseded ? `Handled by the ${engineLabel} Conversational Agent` : `Change ${label.toLowerCase()}`}
                      onClick={() => {
                        if (superseded) {
                          toast.info(`Handled automatically by the ${engineLabel} Conversational Agent. Turn it off to configure this manually.`);
                          return;
                        }
                        onClick();
                      }}
                    >
                      <span className="pipeline-stage-icon"><Icon size={16} /></span>
                      <span className="pipeline-stage-label">{label}</span>
                      <span className="pipeline-stage-value" title={superseded ? `Handled by ${engineLabel}` : value}>
                        {superseded ? `Handled by ${engineLabel}` : value}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* The override rail: one bundled speech-to-speech engine standing
                  in for the transcription and model stages above. */}
              <button
                type="button"
                className={`pipeline-override${voiceEngine !== 'modular' ? ' is-active' : ''}`}
                onClick={() => setShowXaiModal(true)}
                aria-pressed={voiceEngine !== 'modular'}
              >
                <span className="pipeline-stage-icon"><Sparkles size={16} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--tx)' }}>
                    Conversational agent
                  </span>
                  <span style={{ display: 'block', fontSize: '12px', color: 'var(--tx-2)' }}>
                    {voiceEngine === 'xai'
                      ? 'xAI Grok is handling transcription and reasoning'
                      : voiceEngine === 'elevenlabs'
                        ? 'ElevenLabs is handling transcription and reasoning'
                        : 'Off — the four stages above run separately'}
                  </span>
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: voiceEngine !== 'modular' ? 'var(--cyan-fg)' : 'var(--tx-3)', whiteSpace: 'nowrap' }}>
                  {voiceEngine !== 'modular' ? 'On' : 'Off'}
                </span>
              </button>
            </div>

            {/* Welcome Message */}
            <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: '16px', padding: '0', marginBottom: '20px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 30px', borderBottom: '1px solid var(--s1)' }}>
                <h3 className="font-display" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--tx)' }}>
                  <MessageSquareText size={17} style={{ color: 'var(--cyan-fg)' }} />
                  Welcome message
                </h3>
                {/* "Dynamic" used to sit beside this. It was a switch nothing
                    anywhere read — not the browser, not the server — so it is
                    gone rather than left on screen implying an effect.
                    "Interruptible" is enforced on both channels now. */}
                <div style={{ display: 'flex', gap: '20px', fontSize: '12px' }}>
                  {[
                    { label: 'Interruptible', on: interruptibleEnabled, toggle: () => setInterruptibleEnabled(!interruptibleEnabled) },
                  ].map(({ label, on, toggle }) => (
                    <button
                      key={label}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={toggle}
                      style={{ display: 'flex', alignItems: 'center', gap: '9px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: on ? 'var(--tx)' : 'var(--tx-3)' }}
                    >
                      {label}
                      <span style={{ width: '38px', height: '22px', background: on ? 'var(--cyan)' : 'var(--s2)', border: `1px solid ${on ? 'var(--cyan)' : 'var(--line)'}`, borderRadius: 'var(--radius-full)', position: 'relative', transition: 'background 0.2s ease, border-color 0.2s ease', flexShrink: 0 }}>
                        <span style={{ width: '16px', height: '16px', background: on ? '#060c17' : 'var(--tx-3)', borderRadius: '50%', position: 'absolute', top: '2px', left: on ? '18px' : '2px', transition: 'left 0.2s ease, background 0.2s ease' }} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ padding: '18px 30px 20px' }}>
                {/* Call direction — an inbound greeting may thank the caller for
                    calling; an outbound one must introduce the agent instead. */}
                {/* A "Call direction" segmented toggle used to sit here. It set
                    the same callDirection as the pill beside the agent name in
                    the header — two controls for one value — and with the
                    greeting tabs below it there were THREE Incoming/Outgoing
                    switchers stacked in one card. The header pill is the one
                    that stays; the tabs below choose which greeting you are
                    EDITING, which is a different question and now looks like
                    one. */}
                {/* Two greetings, one per direction, each spoken by TTS
                    EXACTLY as typed. Nothing rewrites or translates them on the
                    way to the call, so what is in these boxes is what the
                    customer hears — write them in the language the agent
                    speaks. The direction selector above decides which one is
                    used when a call cannot tell us its own direction. */}
                {/* A greeting with a problem must not be able to hide behind an
                    unselected tab — that is the whole risk of collapsing these
                    from two boxes to one. Each tab carries a dot when ITS
                    greeting has something wrong with it, so the warning is
                    visible from the tab strip whichever side you are editing. */}
                {(() => {
                  const problem = (dir: 'INBOUND' | 'OUTBOUND') => {
                    const v = dir === 'OUTBOUND' ? welcomeOutbound : welcomeInbound;
                    if (!v.trim()) return null;                      // empty is a choice, not a fault
                    if (isOffLanguage(v)) return 'language';
                    if (dir === 'OUTBOUND' && THANKS_FOR_CALLING_RE.test(v)) return 'direction';
                    if (dir === 'INBOUND' && OUTBOUND_PHRASING_RE.test(v)) return 'direction';
                    return null;
                  };
                  return (
                    <div style={{ display: 'inline-flex', background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: '8px', padding: '3px', marginBottom: '14px' }}>
                      {(['INBOUND', 'OUTBOUND'] as const).map((dir) => {
                        const on = welcomeTab === dir;
                        const flag = problem(dir);
                        return (
                          <button
                            key={dir}
                            type="button"
                            onClick={() => setWelcomeTab(dir)}
                            title={flag === 'language' ? 'Not written in this agent’s language'
                              : flag === 'direction' ? 'Worded for the other direction' : undefined}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '7px',
                              padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                              fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
                              background: on ? 'var(--s2)' : 'transparent',
                              color: on ? 'var(--tx)' : 'var(--tx-3)',
                              transition: 'all 0.15s',
                            }}
                          >
                            {dir === 'OUTBOUND' ? 'Outgoing' : 'Incoming'}
                            {callDirection === dir && (
                              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: dir === 'OUTBOUND' ? 'var(--orange)' : 'var(--cyan-fg)' }}>
                                default
                              </span>
                            )}
                            {flag && <span aria-label="needs attention" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ffb74d', flexShrink: 0 }} />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
                {([
                  {
                    dir: 'INBOUND' as const,
                    label: 'Incoming — the customer called you',
                    value: welcomeInbound,
                    set: setWelcomeInbound,
                    hint: 'Thanking them for calling is right here.',
                    placeholder: 'e.g. नमस्ते, सनराइज़ हॉस्पिटल में कॉल करने के लिए धन्यवाद…',
                  },
                  {
                    dir: 'OUTBOUND' as const,
                    label: 'Outgoing — your agent called them',
                    value: welcomeOutbound,
                    set: setWelcomeOutbound,
                    hint: 'Open by naming who is calling and from where, then the reason.',
                    placeholder: 'e.g. नमस्ते, मैं सनराइज़ हॉस्पिटल से अंजलि बोल रही हूँ…',
                  },
                ]).filter(({ dir }) => dir === welcomeTab).map(({ dir, label, value, set, hint, placeholder }) => {
                  const thanksMismatch = dir === 'OUTBOUND' && THANKS_FOR_CALLING_RE.test(value);
                  const callingMismatch = dir === 'INBOUND' && OUTBOUND_PHRASING_RE.test(value);
                  const offLanguage = isOffLanguage(value);
                  return (
                    <div key={dir} style={{ marginBottom: '16px' }}>
                      {/* The "default" badge lives on the tab now, so this is
                          just the label and the one-line rule for this side. */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '7px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx)' }}>{label}</span>
                        <span style={{ fontSize: '11px', color: '#6f6f6f' }}>{hint}</span>
                      </div>
                      <textarea
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: '104px',
                          background: 'var(--s1)',
                          border: '1px solid var(--line)',
                          borderRadius: '10px',
                          padding: '14px 16px',
                          color: 'var(--tx)',
                          fontFamily: 'inherit',
                          fontSize: '15px',
                          lineHeight: '1.5',
                          resize: 'vertical',
                          outline: 'none',
                        }}
                        placeholder={placeholder}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {/* Offered whenever there is a script to translate INTO,
                            not only on a mismatch: an operator revising Hindi
                            text should not have to delete it to get the button
                            back. Disabled while another field is translating so
                            two requests cannot race into one box. */}
                        {primaryScript && value.trim() ? (
                          <button
                            type="button"
                            onClick={() => translateWelcome(dir)}
                            disabled={translating !== null}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              background: offLanguage ? 'var(--cyan)' : 'transparent',
                              color: offLanguage ? '#060c17' : 'var(--tx-2)',
                              border: `1px solid ${offLanguage ? 'var(--cyan)' : 'var(--line)'}`,
                              borderRadius: '6px', padding: '5px 11px',
                              fontSize: '11px', fontWeight: 700, cursor: translating ? 'wait' : 'pointer',
                              opacity: translating !== null && translating !== dir ? 0.5 : 1,
                            }}
                          >
                            {translating === dir ? 'Translating…' : `Translate to ${primaryLanguage}`}
                          </button>
                        ) : <span />}
                        <span style={{ fontSize: '11px', color: 'var(--tx-3)' }}>{value.length}/600</span>
                      </div>
                      {offLanguage && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', padding: '10px 12px', background: '#0a2436', border: '1px solid #17567a', borderRadius: '8px', fontSize: '12px', color: '#7fd3ff', lineHeight: 1.45 }}>
                          <span aria-hidden>🗣️</span>
                          <span>This agent speaks <b>{primaryLanguage}</b>, but this greeting is not written in {primaryLanguage}'s script. It is spoken aloud exactly as typed, so a {primaryLanguage} voice would read these characters instead of the words. Translate it, or rewrite it in {primaryLanguage}.</span>
                        </div>
                      )}
                      {!value.trim() && (
                        <div style={{ marginTop: '8px', padding: '9px 12px', background: 'var(--s1)', border: '1px dashed var(--line)', borderRadius: '8px', fontSize: '11.5px', color: 'var(--tx-3)', lineHeight: 1.45 }}>
                          Empty on purpose — this agent's greeting was written for the other direction, and copying it here would announce the wrong thing. Until you write one, these calls open with the other tab's greeting.
                        </div>
                      )}
                      {callingMismatch && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', padding: '10px 12px', background: '#2a1a0a', border: '1px solid #5a3a12', borderRadius: '8px', fontSize: '12px', color: '#ffb74d', lineHeight: 1.45 }}>
                          <span aria-hidden>⚠️</span>
                          <span>This is the <b>incoming</b> greeting, but it says the agent is calling <i>them</i>. On these calls the customer dialled you — they already know they called, so open by thanking them for calling and naming the company, not by announcing a call.</span>
                        </div>
                      )}
                      {thanksMismatch && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', padding: '10px 12px', background: '#2a1a0a', border: '1px solid #5a3a12', borderRadius: '8px', fontSize: '12px', color: '#ffb74d', lineHeight: 1.45 }}>
                          <span aria-hidden>⚠️</span>
                          <span>This is the <b>outgoing</b> greeting, but it thanks the person “for calling.” Your agent places these calls, so open by naming who is calling and the company — e.g. “Hi, this is [name] calling from [company]” — then the reason.</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div style={{ fontSize: '11px', color: '#6f6f6f', lineHeight: 1.5, marginTop: '-4px' }}>
                  Spoken exactly as written — nothing translates or rewrites these on the call, so write them in the language your agent speaks.
                </div>
              </div>
            </div>

            {/* Conversational Flow */}
            <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: '16px', padding: '0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 30px', borderBottom: '1px solid var(--s1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '16px', fontWeight: '700', color: 'var(--tx)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cyan-fg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px' }}>
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <circle cx="3" cy="6" r="1" fill="var(--cyan-fg)"></circle>
                    <circle cx="3" cy="12" r="1" fill="var(--cyan-fg)"></circle>
                    <circle cx="3" cy="18" r="1" fill="var(--cyan-fg)"></circle>
                  </svg>
                  Conversational Flow <InfoIcon />
                </div>
                <button onClick={addFlowItem} style={{ padding: '10px 18px', background: 'transparent', border: '1px solid var(--line-2)', borderRadius: '10px', color: 'var(--tx)', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>+ Add Section</button>
              </div>
              <div style={{ padding: '16px 30px 20px' }}>
                {flowItems.map((item, index) => {
                  const isExpanded = !!expandedItems[item.id];
                  return (
                    <div key={item.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--s1)', borderRadius: '12px', padding: '12px 16px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {/* Caret Toggle Button */}
                        <button
                          onClick={() => toggleExpand(item.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--tx-2)',
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
                          <svg width="12" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--tx-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="9" cy="5" r="1.5" fill="var(--tx-3)" />
                            <circle cx="9" cy="12" r="1.5" fill="var(--tx-3)" />
                            <circle cx="9" cy="19" r="1.5" fill="var(--tx-3)" />
                            <circle cx="15" cy="5" r="1.5" fill="var(--tx-3)" />
                            <circle cx="15" cy="12" r="1.5" fill="var(--tx-3)" />
                            <circle cx="15" cy="19" r="1.5" fill="var(--tx-3)" />
                          </svg>
                        </div>

                        {/* Number */}
                        <span style={{ fontSize: '14px', fontWeight: '700', width: '22px', color: 'var(--tx)' }}>{index + 1}.</span>

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
                            color: 'var(--tx)',
                            background: 'transparent',
                            outline: 'none',
                            cursor: 'text',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (document.activeElement !== e.currentTarget) {
                              e.currentTarget.style.borderColor = 'var(--s1)';
                              e.currentTarget.style.background = 'var(--bg-primary)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (document.activeElement !== e.currentTarget) {
                              e.currentTarget.style.borderColor = 'transparent';
                              e.currentTarget.style.background = 'transparent';
                            }
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = 'var(--cyan)';
                            e.currentTarget.style.background = 'var(--bg-primary)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'transparent';
                            e.currentTarget.style.background = 'transparent';
                          }}
                        />

                        {/* Right Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginLeft: '12px' }}>
                          {/* Toggle ON/OFF Switch Block */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--tx-2)', fontWeight: '700', background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: '8px', padding: '0 10px', height: '32px' }}>
                            <span style={{ color: item.enabled ? 'var(--tx)' : 'var(--tx-3)', minWidth: '24px' }}>{item.enabled ? 'ON' : 'OFF'}</span>
                            <div
                              onClick={() => toggleFlowItem(item.id)}
                              style={{
                                width: '32px',
                                height: '18px',
                                background: item.enabled ? 'var(--cyan)' : 'var(--s2)',
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
                              color: 'var(--tx-3)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '6px',
                              borderRadius: '6px',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--err)';
                              e.currentTarget.style.background = 'rgba(255, 77, 79, 0.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--tx-3)';
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
                        <div style={{ marginTop: '12px', borderTop: '1px solid var(--s1)', paddingTop: '12px' }}>
                          <textarea
                            value={item.body || ''}
                            onChange={(e) => updateFlowItem(item.id, { body: e.target.value })}
                            style={{
                              width: '100%',
                              minHeight: '120px',
                              background: 'var(--s1)',
                              border: '1px solid var(--line)',
                              borderRadius: '8px',
                              padding: '12px',
                              color: 'var(--tx-2)',
                              fontFamily: 'inherit',
                              fontSize: '13px',
                              lineHeight: '1.5',
                              resize: 'vertical',
                              outline: 'none',
                              transition: 'border-color 0.2s'
                            }}
                            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--cyan)'}
                            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--s1)'}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <button onClick={() => handleSave()} disabled={isSaving} style={{ marginTop: '20px', padding: '10px 24px', background: 'var(--cyan)', color: '#000', border: 'none', borderRadius: '6px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '13px', opacity: isSaving ? 0.6 : 1 }}>
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
                <div key={section.id} style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: '14px', overflow: 'hidden' }}>
                  <div 
                    onClick={() => setExpandedConfigSection(expandedConfigSection === section.id ? null : section.id)}
                    style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'var(--teal-light)', color: 'var(--cyan-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' }}>
                        {i === 0 ? 'o' : i === 1 ? 'X' : i === 2 ? 'R' : i === 3 ? '=' : 'n'}
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--tx)', marginBottom: '2px' }}>{section.title}</div>
                        <div style={{ fontSize: '13px', color: 'var(--tx-2)' }}>{section.subtitle}</div>
                      </div>
                    </div>
                    <div style={{ color: 'var(--tx-2)', fontSize: '14px', transform: expandedConfigSection === section.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</div>
                  </div>
                  
                  {expandedConfigSection === section.id && (
                    <div style={{ padding: '20px', borderTop: '1px solid var(--s1)', background: 'var(--bg-primary)' }}>
                      {section.id === 'silence' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div>
                            <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Response Delay (seconds)</label>
                            <div style={{ fontSize: '12px', color: 'var(--tx-2)', marginBottom: '12px' }}>How long the assistant waits after the user stops speaking before replying.</div>
                            <input type="range" min="1" max="10" step="1" value={silenceTimeout} onChange={e => setSilenceTimeout(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--cyan)' }} />
                            <div style={{ textAlign: 'right', color: 'var(--cyan-fg)', fontSize: '14px', fontWeight: '700' }}>{silenceTimeout}s</div>
                          </div>
                          <div style={{ height: '1px', background: 'var(--s1)' }} />
                          <div>
                            <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Max Silence Before Hangup (seconds)</label>
                            <input type="number" value={maxSilenceBeforeHangup} onChange={e => setMaxSilenceBeforeHangup(Number(e.target.value))} style={{ width: '100%', padding: '10px 14px', background: 'var(--s1)', border: '1px solid var(--line-2)', borderRadius: '8px', color: 'var(--tx)', outline: 'none' }} />
                          </div>
                        </div>
                      )}
                      
                      {section.id === 'endCall' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div>
                            <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Maximum Call Duration (minutes)</label>
                            <input type="number" min="1" max="120" value={maxDuration} onChange={e => setMaxDuration(Number(e.target.value))} style={{ width: '100%', padding: '10px 14px', background: 'var(--s1)', border: '1px solid var(--line-2)', borderRadius: '8px', color: 'var(--tx)', outline: 'none' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>End Call Message</label>
                            <div style={{ fontSize: '12px', color: 'var(--tx-2)', marginBottom: '12px' }}>The message the agent will speak right before ending the call intentionally.</div>
                            <input type="text" value={endCallMessage} onChange={e => setEndCallMessage(e.target.value)} style={{ width: '100%', padding: '10px 14px', background: 'var(--s1)', border: '1px solid var(--line-2)', borderRadius: '8px', color: 'var(--tx)', outline: 'none' }} />
                          </div>
                        </div>
                      )}

                      {section.id === 'transfer' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          {/* What actually happens. Stated up front because the previous
                              version of this feature was prompt text only: the agent
                              announced a transfer and nothing dialled. */}
                          <div style={{ padding: '10px 12px', background: 'var(--s1)', border: '1px solid var(--line-2)', borderRadius: '8px', fontSize: '11.5px', color: 'var(--tx-2)', lineHeight: 1.55 }}>
                            When a caller asks for a person, the agent announces the handover and the live call rings the number
                            below (Twilio and Plivo phone calls). If nobody answers, the line is busy or the number fails, the agent
                            comes back and says so, then offers a message or a callback &mdash; it never claims a transfer happened.
                            {' '}Browser test calls and PIOPIY calls have no line to hand over: the agent says so and offers a callback.
                            {responseProfile?.transfer?.configured === false && transferNumber.trim() === '' && (
                              <> <span style={{ color: '#d6ac46', fontWeight: 700 }}>No number is set, so no call can be transferred.</span></>
                            )}
                          </div>
                          <div>
                            <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Transfer Phone Number</label>
                            <input type="text" placeholder="+1234567890" value={transferNumber} onChange={e => setTransferNumber(e.target.value)} style={{ width: '100%', padding: '10px 14px', background: 'var(--s1)', border: '1px solid var(--line-2)', borderRadius: '8px', color: 'var(--tx)', outline: 'none' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Transfer Condition Prompt</label>
                            <div style={{ fontSize: '12px', color: 'var(--tx-2)', marginBottom: '12px' }}>When should the agent initiate a hand-off? e.g., "When the user asks to speak to a human or gets angry"</div>
                            <textarea value={transferCondition} onChange={e => setTransferCondition(e.target.value)} style={{ width: '100%', minHeight: '80px', padding: '10px 14px', background: 'var(--s1)', border: '1px solid var(--line-2)', borderRadius: '8px', color: 'var(--tx)', outline: 'none', resize: 'vertical' }} />
                          </div>

                          <div>
                            <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Who the caller is told they are being connected to</label>
                            <input type="text" placeholder="a team member" value={transferLabel} onChange={e => setTransferLabel(e.target.value.slice(0, 60))} style={{ width: '100%', padding: '10px 14px', background: 'var(--s1)', border: '1px solid var(--line-2)', borderRadius: '8px', color: 'var(--tx)', outline: 'none' }} />
                          </div>

                          <div>
                            <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>How to hand over</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                              {TRANSFER_MODE_OPTIONS.map(opt => {
                                const active = transferMode === opt.id;
                                return (
                                  <div key={opt.id} onClick={() => setTransferMode(opt.id)} title={opt.description}
                                    style={{ padding: '12px', background: active ? '#0a2e30' : 'var(--s1)', border: `1px solid ${active ? 'var(--cyan)' : 'var(--line-2)'}`, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }}>
                                    <div style={{ color: active ? 'var(--cyan)' : 'var(--tx)', fontWeight: '700', fontSize: '13px' }}>{opt.label}</div>
                                    <div style={{ color: 'var(--tx-2)', fontSize: '11px', marginTop: '4px' }}>{opt.description}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Ring for up to {transferTimeoutSec} seconds</label>
                            <input type="range" min={5} max={60} step={5} value={transferTimeoutSec} onChange={e => setTransferTimeoutSec(Number(e.target.value))} style={{ width: '100%' }} />
                            <div style={{ fontSize: '11.5px', color: 'var(--tx-2)' }}>After this the agent takes the call back and tells the caller nobody could be reached.</div>
                          </div>

                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ color: 'var(--tx)', fontSize: '14px', fontWeight: '600' }}>Only transfer during these hours</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-2)', marginTop: '4px' }}>Outside them the agent follows the choice below instead of ringing an empty desk.</div>
                              </div>
                              <div onClick={() => setTransferHours({ ...transferHours, enabled: !transferHours.enabled })} style={{ width: '42px', height: '24px', background: transferHours.enabled ? 'var(--cyan)' : 'var(--s2)', borderRadius: '999px', position: 'relative', cursor: 'pointer' }}>
                                <div style={{ width: '20px', height: '20px', background: 'var(--s1)', borderRadius: '50%', position: 'absolute', top: '2px', left: transferHours.enabled ? '20px' : '2px', transition: 'left 0.2s' }} />
                              </div>
                            </div>
                            {transferHours.enabled && (
                              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '10px' }}>
                                  <input type="time" value={transferHours.start} onChange={e => setTransferHours({ ...transferHours, start: e.target.value })} style={{ padding: '8px 10px', background: 'var(--s1)', border: '1px solid var(--line-2)', borderRadius: '8px', color: 'var(--tx)' }} />
                                  <input type="time" value={transferHours.end} onChange={e => setTransferHours({ ...transferHours, end: e.target.value })} style={{ padding: '8px 10px', background: 'var(--s1)', border: '1px solid var(--line-2)', borderRadius: '8px', color: 'var(--tx)' }} />
                                  <input type="text" value={transferHours.timezone} onChange={e => setTransferHours({ ...transferHours, timezone: e.target.value })} placeholder="Asia/Kolkata" style={{ padding: '8px 10px', background: 'var(--s1)', border: '1px solid var(--line-2)', borderRadius: '8px', color: 'var(--tx)' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  {WEEKDAYS.map((d, i) => {
                                    const on = transferHours.days.includes(i);
                                    return (
                                      <div key={d} onClick={() => setTransferHours({ ...transferHours, days: on ? transferHours.days.filter(x => x !== i) : [...transferHours.days, i].sort() })}
                                        style={{ padding: '6px 10px', borderRadius: '999px', fontSize: '12px', cursor: 'pointer', background: on ? '#0a2e30' : 'var(--s1)', border: `1px solid ${on ? 'var(--cyan)' : 'var(--line-2)'}`, color: on ? 'var(--cyan)' : 'var(--tx-2)' }}>{d}</div>
                                    );
                                  })}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                                  {TRANSFER_OOH_OPTIONS.map(opt => {
                                    const active = transferOutOfHours === opt.id;
                                    return (
                                      <div key={opt.id} onClick={() => setTransferOutOfHours(opt.id)} title={opt.description}
                                        style={{ padding: '10px', background: active ? '#0a2e30' : 'var(--s1)', border: `1px solid ${active ? 'var(--cyan)' : 'var(--line-2)'}`, borderRadius: '8px', cursor: 'pointer' }}>
                                        <div style={{ color: active ? 'var(--cyan)' : 'var(--tx)', fontWeight: '700', fontSize: '12.5px' }}>{opt.label}</div>
                                        <div style={{ color: 'var(--tx-2)', fontSize: '11px', marginTop: '4px' }}>{opt.description}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {section.id === 'response' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ color: 'var(--tx)', fontSize: '14px', fontWeight: '600' }}>Use Filler Words</div>
                              <div style={{ fontSize: '12px', color: 'var(--tx-2)', marginTop: '4px' }}>Add "umm", "ahh" to make the agent sound more human.</div>
                            </div>
                            <div onClick={() => setFillerWords(!fillerWords)} style={{ width: '42px', height: '24px', background: fillerWords ? 'var(--cyan)' : 'var(--s2)', borderRadius: '999px', position: 'relative', cursor: 'pointer' }}>
                              <div style={{ width: '20px', height: '20px', background: 'var(--s1)', borderRadius: '50%', position: 'absolute', top: '2px', left: fillerWords ? '20px' : '2px', transition: 'left 0.2s' }} />
                            </div>
                          </div>
                          <div style={{ height: '1px', background: 'var(--s1)' }} />
                          <div>
                            <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Speaking Rate (Speed)</label>
                            <input type="range" min="0.5" max="2.0" step="0.1" value={speakingRate} onChange={e => setSpeakingRate(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--cyan)' }} />
                            <div style={{ textAlign: 'right', color: 'var(--cyan-fg)', fontSize: '14px', fontWeight: '700' }}>{speakingRate}x</div>
                          </div>

                          <div style={{ height: '1px', background: 'var(--s1)' }} />

                          {/* How long to wait after the caller stops before answering.
                              This is pure dead air on every single turn, and the right
                              amount of it depends on the conversation, so it belongs to
                              the agent rather than to a server config. */}
                          <div>
                            <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Reply Timing</label>
                            <div style={{ fontSize: '12px', color: 'var(--tx-2)', marginBottom: '12px' }}>
                              How long the agent waits after the caller stops speaking before it answers.
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                              {(responseProfile?.turnEnd?.profiles ?? TURN_END_FALLBACK).map((p: TurnEndOption) => {
                                const active = turnEndSensitivity === p.id;
                                // The wait a caller feels on an ordinary turn: the
                                // recogniser's silence timeout plus the confirmation
                                // window. Shown because "Fast" means nothing on its own.
                                const typicalMs = p.endpointingMs + p.graceMs;
                                return (
                                  <div
                                    key={p.id}
                                    onClick={() => setTurnEndSensitivity(p.id)}
                                    title={p.description}
                                    style={{
                                      padding: '12px',
                                      background: active ? '#0a2e30' : 'var(--s1)',
                                      border: `1px solid ${active ? 'var(--cyan)' : 'var(--line-2)'}`,
                                      borderRadius: '8px',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s',
                                    }}
                                  >
                                    <div style={{ color: active ? 'var(--cyan)' : 'var(--tx)', fontWeight: '700', fontSize: '13px' }}>{p.label}</div>
                                    <div style={{ color: 'var(--tx-2)', fontSize: '11px', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                                      waits {(typicalMs / 1000).toFixed(2)}s
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--tx-2)', marginTop: '10px', lineHeight: 1.5 }}>
                              {(responseProfile?.turnEnd?.profiles ?? TURN_END_FALLBACK)
                                .find((p: TurnEndOption) => p.id === turnEndSensitivity)?.description}
                            </div>
                          </div>

                          <div style={{ height: '1px', background: 'var(--s1)' }} />

                          {/* Whether the reply is spoken as it is written, or
                              synthesized a sentence at a time. Which of those is even
                              possible depends on the voice provider this agent uses, so
                              the server is asked rather than the browser assuming. */}
                          <div>
                            <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Reply Delivery</label>
                            <div style={{ fontSize: '12px', color: 'var(--tx-2)', marginBottom: '12px' }}>
                              Streaming starts speaking while the reply is still being written. Sentence-by-sentence
                              waits for each full sentence &mdash; slower to start, but some voices sound steadier that way.
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                              {TTS_DELIVERY_OPTIONS.map(opt => {
                                const active = ttsDelivery === opt.id;
                                return (
                                  <div
                                    key={opt.id}
                                    onClick={() => setTtsDelivery(opt.id)}
                                    title={opt.description}
                                    style={{
                                      padding: '12px',
                                      background: active ? '#0a2e30' : 'var(--s1)',
                                      border: `1px solid ${active ? 'var(--cyan)' : 'var(--line-2)'}`,
                                      borderRadius: '8px',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s',
                                    }}
                                  >
                                    <div style={{ color: active ? 'var(--cyan)' : 'var(--tx)', fontWeight: '700', fontSize: '13px' }}>{opt.label}</div>
                                    <div style={{ color: 'var(--tx-2)', fontSize: '11px', marginTop: '4px' }}>{opt.hint}</div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* The honest part. Without this, an agent can sit on
                                "Auto" for months while its voice provider quietly has
                                no streaming tier, with nothing in the product saying so. */}
                            {responseProfile?.ttsDelivery && (
                              <div style={{
                                marginTop: '12px',
                                padding: '10px 12px',
                                background: 'var(--s1)',
                                border: `1px solid ${responseProfile.ttsDelivery.voice?.tokenStreaming ? 'var(--line-2)' : '#5a4a1e'}`,
                                borderRadius: '8px',
                                fontSize: '11.5px',
                                color: 'var(--tx-2)',
                                lineHeight: 1.55,
                              }}>
                                {responseProfile.ttsDelivery.available === false ? (
                                  <>Streaming replies are switched off for this platform, so every agent is using
                                  sentence-by-sentence delivery. Contact your administrator.</>
                                ) : responseProfile.ttsDelivery.voice?.tokenStreaming ? (
                                  <>
                                    <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>
                                      {responseProfile.ttsDelivery.voice.providerName} can stream.
                                    </span>{' '}
                                    {ttsDelivery === 'http'
                                      ? 'This agent is set to sentence-by-sentence, so it is not using it.'
                                      : 'This agent starts speaking as the reply is written.'}
                                  </>
                                ) : (
                                  <>
                                    <span style={{ color: '#d6ac46', fontWeight: 700 }}>
                                      This voice cannot stream.
                                    </span>{' '}
                                    {responseProfile.ttsDelivery.voice?.reason}
                                    {ttsDelivery !== 'http' && ' Replies fall back to sentence-by-sentence until then.'}
                                  </>
                                )}
                              </div>
                            )}
                          </div>

                          <div style={{ height: '1px', background: 'var(--s1)' }} />

                          {/* Speculative replies. The trade is latency against
                              discarded model requests, and it is the owner's to
                              make per agent, so the cost is stated on the control. */}
                          <div>
                            <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Think Ahead</label>
                            <div style={{ fontSize: '12px', color: 'var(--tx-2)', marginBottom: '12px' }}>
                              Start the model on what the caller has said before the turn is confirmed over. The answer is
                              only used when the final words match; nothing is ever spoken early. Faster settings discard
                              more requests, and every discarded request is still billed by the model provider.
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                              {SPECULATION_OPTIONS.map(opt => {
                                const active = speculation === opt.id;
                                return (
                                  <div
                                    key={opt.id}
                                    onClick={() => setSpeculation(opt.id)}
                                    title={opt.description}
                                    style={{
                                      padding: '12px',
                                      background: active ? '#0a2e30' : 'var(--s1)',
                                      border: `1px solid ${active ? 'var(--cyan)' : 'var(--line-2)'}`,
                                      borderRadius: '8px',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s',
                                    }}
                                  >
                                    <div style={{ color: active ? 'var(--cyan)' : 'var(--tx)', fontWeight: '700', fontSize: '13px' }}>{opt.label}</div>
                                    <div style={{ color: 'var(--tx-2)', fontSize: '11px', marginTop: '4px' }}>{opt.hint}</div>
                                  </div>
                                );
                              })}
                            </div>
                            {responseProfile?.speculation?.available === false && (
                              <div style={{ marginTop: '10px', fontSize: '11.5px', color: '#d6ac46' }}>
                                Think Ahead is switched off for this platform by the administrator; every agent asks the model once per turn.
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {section.id === 'ambient' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          {/* The three-state switch. Native ambience is generated by Fish
                              Audio with the speech, so it stops whenever the agent is
                              not talking; the manual bed is a pre-rendered loop that runs
                              through silence and costs nothing per turn. */}
                          <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600' }}>Background Sound</label>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                            {[
                              { id: 'off', label: 'Off', hint: 'No background at all.' },
                              { id: 'manual', label: 'Manual bed', hint: 'A pre-rendered loop, continuous, free per turn.' },
                              { id: 'native', label: 'Fish Audio native', hint: 'Generated with the speech; stops between turns.' },
                            ].map(opt => {
                              const nativeBlocked = opt.id === 'native' && responseProfile?.ambience && responseProfile.ambience.nativeAvailable === false;
                              const active = ambientMode === opt.id;
                              return (
                                <div key={opt.id} onClick={() => { if (!nativeBlocked) setAmbientMode(opt.id); }}
                                  title={nativeBlocked ? responseProfile.ambience.nativeReason : opt.hint}
                                  style={{ padding: '12px', background: active ? '#0a2e30' : 'var(--s1)', border: `1px solid ${active ? 'var(--cyan)' : 'var(--line-2)'}`, borderRadius: '8px', cursor: nativeBlocked ? 'not-allowed' : 'pointer', opacity: nativeBlocked ? 0.5 : 1, transition: 'all 0.2s' }}>
                                  <div style={{ color: active ? 'var(--cyan)' : 'var(--tx)', fontWeight: '700', fontSize: '13px' }}>{opt.label}</div>
                                  <div style={{ color: 'var(--tx-2)', fontSize: '11px', marginTop: '4px' }}>{nativeBlocked ? responseProfile.ambience.nativeReason : opt.hint}</div>
                                </div>
                              );
                            })}
                          </div>
                          {ambientMode !== 'off' && (
                          <label style={{ display: 'block', color: 'var(--tx)', fontSize: '14px', fontWeight: '600' }}>
                            {ambientMode === 'native' ? 'Room to ask Fish Audio for' : 'Select Background Sound'}
                          </label>
                          )}
                          {ambientMode !== 'off' && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                            {AMBIENT_OPTIONS.filter(s => s !== 'None' && (ambientMode !== 'native' || ['Office', 'Call Center', 'Office Chatter', 'Call Center Chatter'].includes(s))).map(sound => (
                              <div 
                                key={sound}
                                onClick={() => setAmbientSound(sound)}
                                style={{
                                  padding: '14px', 
                                  background: ambientSound === sound ? '#0a2e30' : 'var(--s1)', 
                                  border: `1px solid ${ambientSound === sound ? 'var(--cyan)' : 'var(--line-2)'}`, 
                                  borderRadius: '8px', 
                                  color: ambientSound === sound ? 'var(--cyan)' : 'var(--tx)',
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
                          )}
                          {ambientMode !== 'off' && (
                            <div style={{ fontSize: '11.5px', color: 'var(--tx-2)', lineHeight: 1.55 }}>
                              {ambientMode === 'native'
                                ? 'Fish Audio generates the room with each reply. It only exists while the agent is speaking, and its level cannot be controlled. Use the manual bed for a continuous room.'
                                : 'The bed is mixed under the agent at about 42 dB below speech, runs through silence and caller speech, and costs nothing per turn. "Office Chatter" and "Call Center Chatter" are pre-rendered voices, unintelligible by construction.'}
                              {' '}Not available on PIOPIY phone calls.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => handleSave()} disabled={isSaving} style={{ marginTop: '18px', alignSelf: 'flex-start', padding: '10px 24px', background: 'var(--cyan)', color: '#000', border: 'none', borderRadius: '8px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '13px', opacity: isSaving ? 0.6 : 1 }}>
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
                <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: '16px', padding: '34px 30px 30px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--tx)', marginBottom: '10px' }}>Upload PDFs{kbUploading ? ' — uploading…' : ''}</div>
                  <div style={{ fontSize: '14px', color: 'var(--tx-2)', marginBottom: '16px' }}>Add PDF files to your assistant's knowledge base</div>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    style={{ border: '2px dashed #323232', borderRadius: '14px', minHeight: '168px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '18px', cursor: 'pointer' }}
                  >
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf,.txt,.md,.csv,.json,.docx" multiple style={{ display: 'none' }} />
                    <div style={{ width: '54px', height: '54px', borderRadius: '18px', background: 'var(--teal-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cyan-fg)', fontSize: '20px', marginBottom: '16px' }}>^</div>
                    <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--tx)', marginBottom: '10px' }}>Drag and drop a file here, or click to select</div>
                    <div style={{ fontSize: '13px', color: 'var(--tx-2)' }}>Supported formats: PDF, TXT, MD, CSV, JSON, DOCX (max 10MB)</div>
                  </div>
                  {kbFiles.length > 0 && (
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {kbFiles.map((file) => (
                        <div key={file.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--s2)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                          <span style={{ fontSize: '13px', color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                            {file.fileName}
                            <span style={{ color: 'var(--tx-3)', marginLeft: 8, fontSize: 11 }}>
                              {(file.sizeBytes / 1024).toFixed(0)} KB{file.hasText ? '' : ' · no text extracted'}
                            </span>
                          </span>
                          <button onClick={(e) => { e.stopPropagation(); removeKbFile(file.id); }} style={{ background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: '16px', padding: '34px 30px 30px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--tx)', marginBottom: '10px' }}>Website Knowledge Base</div>
                  <div style={{ fontSize: '14px', color: 'var(--tx-2)', marginBottom: '12px' }}>Add website content to your assistant's knowledge base</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: 'var(--tx)' }}>Website URL</label>
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
                      background: 'var(--s1)',
                      border: '1px solid #2e2e2e',
                      borderRadius: '8px',
                      color: 'var(--tx)',
                      fontSize: '14px',
                      outline: 'none',
                      marginBottom: '20px'
                    }}
                  />
                  <button onClick={handleAddKbUrl} style={{ width: '100%', height: '46px', background: 'var(--cyan)', border: 'none', borderRadius: '10px', color: 'var(--on-cyan)', fontFamily: 'var(--ff-d)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginBottom: kbUrls.length > 0 ? '16px' : '0' }}>
                    Add to Knowledge Base
                  </button>
                  {kbUrls.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {kbUrls.map((url, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--s2)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                          <span style={{ fontSize: '13px', color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
                          <button onClick={() => removeKbUrl(url)} style={{ background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
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
                <div style={{ fontSize: '14px', color: 'var(--warn)' }}>You only have {remainingMb.toFixed(1)} MB of knowledge base storage remaining. Consider upgrading your account to avoid upload restrictions.</div>
              </div>
              <button onClick={() => window.location.href='/billing'} style={{ padding: '10px 18px', background: 'var(--err)', border: 'none', borderRadius: '10px', color: '#1f0d0d', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
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
                background: 'linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-primary) 100%)',
                border: '1px solid var(--line)',
                borderRadius: '14px',
                padding: '22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px'
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '0.02em', color: 'var(--tx)' }}>Integrations</div>

              {/* "Web Search" lived here. Nothing on either channel ever
                  read webSearchEnabled — the agent has no web-search tool — so the
                  switch is gone rather than left on screen implying one. */}

              <div
                style={{
                  background: 'var(--s2)',
                  border: '1px solid var(--line)',
                  borderRadius: '12px',
                  padding: '18px 20px'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--tx)', marginBottom: '12px' }}>Integration</div>
                <div
                  style={{
                    border: '1px dashed var(--line-2)',
                    borderRadius: '12px',
                    minHeight: '120px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg-primary)',
                    color: 'var(--tx-3)',
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
                  background: 'var(--s2)',
                  border: '1px solid var(--line)',
                  borderRadius: '12px',
                  padding: '18px 20px'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--tx)', marginBottom: '14px' }}>Connect New Integrations</div>

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
                          e.currentTarget.style.boxShadow = '0 0 0 1px var(--s2), 0 10px 26px rgba(0,0,0,0.28)';
                          e.currentTarget.style.background = 'var(--s1)';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--s2)';
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.background = '#171717';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                        style={{
                          background: 'var(--s1)',
                          border: '1px solid var(--line)',
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
                            <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--tx)' }}>{integration.name}</div>
                            {integration.external && <span style={{ fontSize: '12px', color: 'var(--tx-2)' }}>-&gt;</span>}
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
                                color: isDuringCall ? 'var(--lime)' : 'var(--violet)',
                                background: isDuringCall ? 'rgba(33, 111, 67, 0.3)' : 'rgba(36, 91, 155, 0.3)'
                              }}
                            >
                              {integration.mode}
                            </span>
                          </div>

                          <div style={{ color: 'var(--tx-3)', fontSize: '13px', lineHeight: 1.5 }}>{integration.description}</div>
                        </div>

                        <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #252525', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                          {isConnected ? (
                            <span style={{ fontSize: '12px', color: 'var(--lime)', display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
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
                              e.currentTarget.style.background = 'var(--s2)';
                              e.currentTarget.style.borderColor = isConnected ? '#7a4141' : '#4a4a4a';
                              e.currentTarget.style.color = isConnected ? '#ffabab' : 'var(--tx)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'var(--s1)';
                              e.currentTarget.style.borderColor = isConnected ? '#4a3232' : 'var(--line-2)';
                              e.currentTarget.style.color = isConnected ? 'var(--err)' : 'var(--tx)';
                            }}
                            style={{
                              padding: '8px 14px',
                              background: 'var(--s1)',
                              border: `1px solid ${isConnected ? '#4a3232' : 'var(--line-2)'}`,
                              borderRadius: '10px',
                              color: isConnected ? 'var(--err)' : 'var(--tx)',
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
                  color: 'var(--tx)',
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
                  background: 'var(--s1)',
                  border: '1px solid var(--line)',
                  borderRadius: '14px',
                  padding: '30px 30px 24px',
                  marginTop: '2px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '24px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '17px', lineHeight: 1.2, fontWeight: '700', color: 'var(--tx)', marginBottom: '14px' }}>Delivery Method</div>
                    <select
                      value={config.deliveryMethod}
                      onChange={(e) => {
                        const deliveryMethod = e.target.value;
                        updatePostCallConfigAndSave(config.id, { deliveryMethod, url: '', email: '', spreadsheetId: '', spreadsheetName: '', dateVariable: '' });
                        if (deliveryMethod === 'Google Sheets' && spreadsheets.length === 0) loadSpreadsheets();
                      }}
                      style={{
                        width: '310px',
                        height: '42px',
                        padding: '0 18px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--line-2)',
                        borderRadius: '9px',
                        color: config.deliveryMethod ? 'var(--tx)' : 'var(--tx-2)',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    >
                      <option value="">Select delivery method</option>
                      <option value="Webhook">Webhook</option>
                      <option value="Email">Email</option>
                      <option value="Google Sheets">Google Sheets</option>
                      <option value="Google Calendar">Google Calendar</option>
                      <option value="CRM" disabled>CRM (coming soon)</option>
                      <option value="Slack" disabled>Slack (coming soon)</option>
                      <option value="WhatsApp" disabled>WhatsApp (coming soon)</option>
                    </select>

                    {/* Webhook URL input */}
                    {config.deliveryMethod === 'Webhook' && (
                      <div style={{ marginTop: '14px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--tx-2)', marginBottom: '8px' }}>Webhook URL <span style={{ color: 'var(--err)' }}>*</span></div>
                        <input
                          type="url"
                          value={config.url}
                          onChange={(e) => updatePostCallConfig(config.id, { url: e.target.value })}
                          placeholder="https://your-server.com/webhook"
                          style={{
                            width: '400px',
                            height: '42px',
                            padding: '0 16px',
                            background: 'var(--bg-secondary)',
                            border: config.url && !/^https?:\/\/.+/.test(config.url) ? '1px solid var(--err)' : '1px solid var(--line-2)',
                            borderRadius: '9px',
                            color: 'var(--tx)',
                            fontSize: '14px',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                        {config.url && !/^https?:\/\/.+/.test(config.url) && (
                          <div style={{ fontSize: '12px', color: 'var(--err)', marginTop: '4px' }}>Enter a valid URL starting with http:// or https://</div>
                        )}
                      </div>
                    )}

                    {/* Email address input */}
                    {config.deliveryMethod === 'Email' && (
                      <div style={{ marginTop: '14px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--tx-2)', marginBottom: '8px' }}>Recipient Email <span style={{ color: 'var(--err)' }}>*</span></div>
                        <input
                          type="email"
                          value={config.email}
                          onChange={(e) => updatePostCallConfig(config.id, { email: e.target.value })}
                          placeholder="recipient@example.com"
                          style={{
                            width: '400px',
                            height: '42px',
                            padding: '0 16px',
                            background: 'var(--bg-secondary)',
                            border: config.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email) ? '1px solid var(--err)' : '1px solid var(--line-2)',
                            borderRadius: '9px',
                            color: 'var(--tx)',
                            fontSize: '14px',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                        {config.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email) && (
                          <div style={{ fontSize: '12px', color: 'var(--err)', marginTop: '4px' }}>Enter a valid email address</div>
                        )}
                      </div>
                    )}

                    {/* Google Calendar — book an event from an extracted date/time.
                        The date variable must resolve to an ISO 8601 datetime;
                        extraction is prompted to output that, resolving relatives
                        ("tomorrow at 3pm") against the call time. */}
                    {config.deliveryMethod === 'Google Calendar' && (
                      <div style={{ marginTop: '14px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--tx-2)', marginBottom: '8px' }}>Appointment date/time variable <span style={{ color: 'var(--err)' }}>*</span></div>
                        <select
                          value={config.dateVariable || ''}
                          onChange={(e) => updatePostCallConfigAndSave(config.id, { dateVariable: e.target.value })}
                          style={{
                            width: '400px',
                            height: '42px',
                            padding: '0 16px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--line-2)',
                            borderRadius: '9px',
                            color: config.dateVariable ? 'var(--tx)' : 'var(--tx-2)',
                            fontSize: '14px',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        >
                          <option value="">Select an extracted variable</option>
                          {config.extractedVariables.map((v) => (
                            <option key={v.id} value={v.key}>{v.key}</option>
                          ))}
                        </select>
                        <div style={{ fontSize: '12px', color: '#808080', marginTop: '6px', maxWidth: '400px' }}>
                          The event is booked on your primary Google Calendar at this variable's value.
                          Make sure the variable's description tells the agent to capture the appointment date and time.
                        </div>

                        <div style={{ fontSize: '13px', color: 'var(--tx-2)', margin: '14px 0 8px' }}>Duration (minutes)</div>
                        <input
                          type="number"
                          min={5}
                          step={5}
                          value={config.durationMin ?? 30}
                          onChange={(e) => updatePostCallConfig(config.id, { durationMin: Math.max(5, Number(e.target.value) || 30) })}
                          style={{
                            width: '140px',
                            height: '42px',
                            padding: '0 16px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--line-2)',
                            borderRadius: '9px',
                            color: 'var(--tx)',
                            fontSize: '14px',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    )}

                    {/* Google Sheets target — collapses to a confirmation once
                        chosen, so the picker/create controls don't linger and
                        read as work still to be done. */}
                    {config.deliveryMethod === 'Google Sheets' && config.spreadsheetId && !changingSheet[config.id] && (
                      <div style={{ marginTop: '14px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--tx-2)', marginBottom: '8px' }}>Target Spreadsheet</div>
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
                          <span style={{ color: 'var(--cyan-fg)', fontSize: '16px', lineHeight: 1 }}>✓</span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '14px', color: 'var(--tx)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                            style={{ fontSize: '13px', color: 'var(--cyan-fg)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                          >
                            Open ↗
                          </a>
                          <button
                            type="button"
                            onClick={() => setChangingSheet((prev) => ({ ...prev, [config.id]: true }))}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--line-2)',
                              borderRadius: '7px',
                              color: 'var(--tx-2)',
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
                        <div style={{ fontSize: '13px', color: 'var(--tx-2)', marginBottom: '8px' }}>
                          Target Spreadsheet <span style={{ color: 'var(--err)' }}>*</span>
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
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--line-2)',
                              borderRadius: '9px',
                              color: config.spreadsheetId ? 'var(--tx)' : 'var(--tx-2)',
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
                              border: '1px solid var(--line-2)',
                              borderRadius: '9px',
                              color: 'var(--tx-2)',
                              fontSize: '13px',
                              cursor: spreadsheetsState === 'loading' ? 'not-allowed' : 'pointer',
                            }}
                          >
                            ↻ Refresh
                          </button>
                        </div>
                        {spreadsheetsState === 'error' && (
                          <div style={{ fontSize: '12px', color: 'var(--err)', marginTop: '6px', maxWidth: '460px', lineHeight: 1.5 }}>
                            {spreadsheetsError}
                          </div>
                        )}
                        {spreadsheetsState === 'idle' && spreadsheets.length === 0 && (
                          <div style={{ fontSize: '12px', color: 'var(--tx-2)', marginTop: '6px' }}>
                            No spreadsheets found — create one below.
                          </div>
                        )}

                        {/* Separator: the row below is an ALTERNATIVE to the
                            dropdown above, not a second required field. */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '480px', margin: '12px 0 10px' }}>
                          <div style={{ height: '1px', background: 'var(--s2)', flex: 1 }} />
                          <span style={{ fontSize: '11px', color: '#6b6b6b', letterSpacing: '0.06em' }}>OR CREATE A NEW ONE</span>
                          <div style={{ height: '1px', background: 'var(--s2)', flex: 1 }} />
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
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--line-2)',
                              borderRadius: '9px',
                              color: 'var(--tx)',
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
                              border: '1px solid rgba(14,179,158,0.33)',
                              borderRadius: '9px',
                              color: creatingSheet === config.id ? 'var(--tx-3)' : 'var(--cyan-fg)',
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
                              color: 'var(--tx-3)',
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
                        border: '1px solid var(--line)',
                        borderRadius: '9px',
                        color: postCallConfigs.length === 1 ? '#666666' : 'var(--err)',
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
                        background: testingPostCall[config.id] === 'done' ? 'rgba(14,179,158,0.13)' : testingPostCall[config.id] === 'error' ? 'rgba(248,113,113,0.13)' : 'rgba(14,179,158,0.09)',
                        border: `1px solid ${testingPostCall[config.id] === 'done' ? 'var(--cyan-fg)' : testingPostCall[config.id] === 'error' ? 'var(--err)' : 'rgba(14,179,158,0.33)'}`,
                        borderRadius: '9px',
                        color: testingPostCall[config.id] === 'done' ? 'var(--cyan-fg)' : testingPostCall[config.id] === 'error' ? 'var(--err)' : postCallConfigIssue(config) ? 'var(--tx-3)' : 'var(--cyan-fg)',
                        cursor: (postCallConfigIssue(config) || testingPostCall[config.id] === 'loading') ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: '600',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {testingPostCall[config.id] === 'loading' ? 'Sending…' :
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
                    background: testingPostCall[config.id] === 'done' ? 'rgba(14,179,158,0.06)' : 'rgba(248,113,113,0.06)',
                    border: `1px solid ${testingPostCall[config.id] === 'done' ? 'rgba(14,179,158,0.27)' : 'rgba(248,113,113,0.27)'}`,
                    borderRadius: '10px',
                    fontSize: '13px',
                    color: testingPostCall[config.id] === 'done' ? 'var(--cyan-fg)' : 'var(--err)',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    lineHeight: 1.6
                  }}>
                    {testPostCallResults[config.id]}
                  </div>
                )}

                <div style={{ marginBottom: '30px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--tx)' }}>Trigger based on Call Status</div>
                    <div style={{ width: '18px', height: '18px', borderRadius: '999px', border: '1px solid #585858', color: 'var(--tx-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600' }}>i</div>
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
                            border: active ? '1px solid var(--cyan-fg)' : '1px solid var(--line-2)',
                            background: active ? 'var(--cyan)' : 'transparent',
                            color: active ? '#071316' : 'var(--tx-2)',
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
                  <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--tx)', marginBottom: '18px' }}>Including</div>
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
                            border: checked ? '1px solid #087f88' : '1px solid var(--line-2)',
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
                              background: checked ? 'var(--cyan)' : 'var(--bg-primary)',
                              border: checked ? '1px solid var(--cyan-fg)' : '1px solid var(--line-2)',
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
                          <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--tx)', marginBottom: '6px', lineHeight: 1.2 }}>{item.title}</div>
                          <div style={{ fontSize: '13px', color: 'var(--tx-2)', lineHeight: 1.45 }}>{item.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--tx)', marginBottom: '6px' }}>Extracted Variables</div>
                  <div style={{ fontSize: '13px', color: 'var(--tx-3)', marginBottom: '20px', lineHeight: 1.45 }}>
                    Specify what variables you want to extract from the conversation. For each variable, provide a name and a description of how to extract it.
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {config.extractedVariables.map((variable) => (
                      <div
                        key={variable.id}
                        style={{
                          background: 'var(--s1)',
                          border: '1px solid var(--s2)',
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
                            background: 'var(--s1)',
                            border: '1px solid var(--line-2)',
                            borderRadius: '8px',
                            color: 'var(--tx)',
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
                            background: 'var(--s1)',
                            border: '1px solid var(--line-2)',
                            borderRadius: '8px',
                            color: 'var(--tx)',
                            fontSize: '14px',
                            outline: 'none'
                          }}
                        />
                        <button
                          onClick={() => removeExtractedVariable(config.id, variable.id)}
                          style={{
                            width: '60px',
                            height: '44px',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--line)',
                            borderRadius: '9px',
                            color: 'var(--err)',
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
                      border: '1px solid var(--cyan-fg)',
                      borderRadius: '9px',
                      color: 'var(--cyan-fg)',
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
              welcomeMessage={activeWelcome}
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
              <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--tx)', paddingLeft: '20px' }}>Recent Calls</div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={loadRecentCalls}
                  disabled={callsLoading}
                  style={{
                    height: '44px',
                    padding: '0 18px',
                    background: 'var(--s1)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    color: 'var(--tx)',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: callsLoading ? 'not-allowed' : 'pointer',
                    opacity: callsLoading ? 0.6 : 1
                  }}
                >
                  {callsLoading ? 'Loading…' : 'Refresh'}
                </button>
              </div>
            </div>

            {callsLoading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-3)', fontSize: '14px' }}>
                Loading call history...
              </div>
            ) : recentCalls.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {visibleCalls.map((call) => {
                  const typeMeta =
                    call.type === 'WEB_CALL' ? { icon: '🌐', label: 'Web Call', bg: '#0a1f3a', fg: 'var(--violet)', bd: '#1a5a9a' }
                    : call.type === 'PHONE_CALL' ? { icon: '📞', label: 'Phone Call', bg: '#2a1a0a', fg: '#ffb066', bd: '#5a3a1a' }
                    : { icon: '💬', label: 'Chat Test', bg: '#0a2e1a', fg: 'var(--lime)', bd: '#1a5a3a' };
                  const statusMeta =
                    call.status === 'COMPLETED' ? { bg: '#0a2e1a', fg: 'var(--lime)', bd: '#1a5a3a' }
                    : call.status === 'IN_PROGRESS' ? { bg: '#0a1f3a', fg: 'var(--violet)', bd: '#1a5a9a' }
                    : call.status === 'FAILED' ? { bg: '#2e0a0a', fg: 'var(--err)', bd: '#5a1a1a' }
                    : { bg: '#1a1a0a', fg: 'var(--warn)', bd: '#5a5a1a' };
                  const mins = Math.floor((call.durationSec ?? 0) / 60);
                  const secs = (call.durationSec ?? 0) % 60;
                  const isExpanded = expandedCallId === call.id;
                  const transcript = call.transcript ?? [];
                  const extractedVariables = call.extractedData?.variables ?? [];
                  return (
                    <div
                      key={call.id}
                      style={{
                        background: 'var(--s1)',
                        border: '1px solid var(--line)',
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
                          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--tx)' }}>
                            {typeMeta.icon} {typeMeta.label}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--tx-3)', marginTop: '2px' }}>
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
                        <div style={{ fontSize: '12px', color: 'var(--tx-2)', textAlign: 'center' }}>
                          {mins}:{String(secs).padStart(2, '0')}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--tx-2)', textAlign: 'right' }}>
                          {call.startedAt ? new Date(call.startedAt).toLocaleString() : '—'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--tx-3)', textAlign: 'center' }}>{isExpanded ? '▲' : '▼'}</div>
                      </div>

                      {isExpanded && (
                        <div style={{ borderTop: '1px solid var(--line)', padding: '16px 20px', background: 'var(--bg-primary)' }}>
                          {call.hasRecording && (
                            <div style={{ marginBottom: transcript.length ? '16px' : 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                                <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--tx-2)' }}>Call recording</div>
                                {recordingUrls[call.id] && (
                                  <button
                                    type="button"
                                    onClick={() => downloadRecording(call)}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                                      fontSize: '12px', fontWeight: '600', color: 'var(--cyan-fg)',
                                      background: 'transparent', border: '1px solid #28343a',
                                      borderRadius: '8px', padding: '5px 10px', cursor: 'pointer',
                                    }}
                                    title="Download recording to your device"
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                      <polyline points="7 10 12 15 17 10" />
                                      <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                    Download
                                  </button>
                                )}
                              </div>
                              {recordingUrls[call.id] ? (
                                <audio controls src={recordingUrls[call.id]} style={{ width: '100%', height: '36px' }} />
                              ) : (
                                <div style={{ fontSize: '12px', color: 'var(--tx-3)' }}>Loading recording…</div>
                              )}
                            </div>
                          )}
                          {transcript.length > 0 && (
                            <div style={{ marginBottom: '16px', padding: '14px', border: '1px solid #28343a', borderRadius: '10px', background: '#10171a' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: extractedVariables.length || call.extractionError || call.extractedData?.skippedReason ? '10px' : 0 }}>
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--cyan-fg)' }}>Extracted conversation data</div>
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
                                    border: '1px solid var(--cyan-fg)66',
                                    background: 'var(--cyan)14',
                                    color: call.extractionStatus === 'PROCESSING' ? '#60777a' : 'var(--cyan-fg)',
                                    cursor: call.extractionStatus === 'PROCESSING' ? 'wait' : 'pointer',
                                    fontSize: '11px',
                                    fontWeight: '600'
                                  }}
                                >
                                  {call.extractionStatus === 'PROCESSING' ? 'Extracting...' : extractedVariables.length ? 'Re-extract' : 'Extract now'}
                                </button>
                              </div>
                              {call.extractionError && (
                                <div style={{ fontSize: '12px', color: 'var(--err)' }}>{call.extractionError}</div>
                              )}
                              {call.extractedData?.skippedReason && (
                                <div style={{ fontSize: '12px', color: '#b5a36a' }}>{call.extractedData.skippedReason}</div>
                              )}
                              {extractedVariables.length > 0 && (
                                <div style={{ display: 'grid', gap: '8px' }}>
                                  {extractedVariables.map((variable) => (
                                    <div key={variable.key} style={{ padding: '9px 11px', borderRadius: '8px', background: '#0b1012', border: '1px solid #202b30' }}>
                                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 0.4fr) 1fr', gap: '12px', alignItems: 'start' }}>
                                        <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--cyan-fg)', wordBreak: 'break-word' }}>{variable.key}</div>
                                        <div style={{ fontSize: '12px', color: variable.value == null ? '#667277' : 'var(--tx)', wordBreak: 'break-word' }}>
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
                              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--tx-2)' }}>Transcript</div>
                              {transcript.map((m, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                  <div style={{
                                    maxWidth: '75%', padding: '8px 12px', borderRadius: '10px', fontSize: '13px',
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                    background: m.role === 'user' ? 'var(--cyan)' : 'var(--s1)',
                                    color: m.role === 'user' ? '#000' : 'var(--tx)',
                                    border: m.role === 'user' ? 'none' : '1px solid var(--line-2)'
                                  }}>
                                    {m.content}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: '12px', color: 'var(--tx-3)' }}>No transcript was captured for this call.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {recentCalls.length > CALLS_PER_PAGE && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      flexWrap: 'wrap',
                      marginTop: '8px',
                      padding: '4px 4px 0'
                    }}
                  >
                    <div style={{ fontSize: '13px', color: 'var(--tx-3)' }}>
                      Showing {(callsPage - 1) * CALLS_PER_PAGE + 1}–{Math.min(callsPage * CALLS_PER_PAGE, recentCalls.length)} of {recentCalls.length} calls
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => { setExpandedCallId(null); setCallsPage((p) => Math.max(1, p - 1)); }}
                        disabled={callsPage <= 1}
                        style={{
                          height: '36px',
                          padding: '0 14px',
                          background: 'var(--s1)',
                          border: '1px solid var(--line)',
                          borderRadius: '9px',
                          color: 'var(--tx)',
                          fontSize: '13px',
                          fontWeight: '600',
                          cursor: callsPage <= 1 ? 'not-allowed' : 'pointer',
                          opacity: callsPage <= 1 ? 0.45 : 1
                        }}
                      >
                        ← Previous
                      </button>
                      <div style={{ fontSize: '13px', color: 'var(--tx-2)', minWidth: '84px', textAlign: 'center' }}>
                        Page {callsPage} of {callsPageCount}
                      </div>
                      <button
                        onClick={() => { setExpandedCallId(null); setCallsPage((p) => Math.min(callsPageCount, p + 1)); }}
                        disabled={callsPage >= callsPageCount}
                        style={{
                          height: '36px',
                          padding: '0 14px',
                          background: 'var(--s1)',
                          border: '1px solid var(--line)',
                          borderRadius: '9px',
                          color: 'var(--tx)',
                          fontSize: '13px',
                          fontWeight: '600',
                          cursor: callsPage >= callsPageCount ? 'not-allowed' : 'pointer',
                          opacity: callsPage >= callsPageCount ? 0.45 : 1
                        }}
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
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
                  <div style={{ fontSize: '18px', lineHeight: 1.2, fontWeight: '700', color: 'var(--tx)', marginBottom: '10px' }}>No call history</div>
                  <div style={{ fontSize: '15px', lineHeight: 1.6, color: 'var(--tx-2)' }}>
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
          <div style={{ background: 'var(--s1)', borderRadius: '12px', padding: 0, maxWidth: '500px', width: '90%', height: '600px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: 'var(--s1)', borderBottom: '1px solid var(--line-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 'bold' }}>{agentName.charAt(0)}</div>
                <span style={{ fontWeight: '600', fontSize: '14px' }}>Test Chat: {agentName}</span>
              </div>
              <button onClick={closeTestChat} style={{ background: 'none', border: 'none', color: 'var(--tx-2)', cursor: 'pointer', fontSize: '20px' }}>X</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ alignSelf: 'flex-start', background: 'var(--s2)', padding: '10px 14px', borderRadius: '12px 12px 12px 0', fontSize: '13px', maxWidth: '85%' }}>
                {activeWelcome}
              </div>
              {chatMessages.map((msg, i) => (
                <div key={i} style={{ 
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', 
                  background: msg.role === 'user' ? 'var(--cyan)' : 'var(--s2)', 
                  color: msg.role === 'user' ? '#000' : 'var(--tx)',
                  padding: '10px 14px', 
                  borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0', 
                  fontSize: '13px', 
                  maxWidth: '85%' 
                }}>
                  {msg.content}
                </div>
              ))}
              {isTyping && (
                <div style={{ alignSelf: 'flex-start', background: 'var(--s2)', padding: '10px 14px', borderRadius: '12px 12px 12px 0', fontSize: '13px' }}>
                  Typing...
                </div>
              )}
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid var(--line-2)', background: 'var(--s1)' }}>
              <form onSubmit={(e) => { e.preventDefault(); handleTestChat(); }} style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  value={userMessage} 
                  onChange={(e) => setUserMessage(e.target.value)} 
                  placeholder="Type your message..." 
                  style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--line-2)', borderRadius: '8px', padding: '10px 14px', color: 'var(--tx)', fontSize: '13px' }}
                />
                <button type="submit" disabled={isTyping || !userMessage.trim()} style={{ background: 'var(--cyan)', color: '#000', border: 'none', borderRadius: '8px', padding: '0 16px', fontWeight: 'bold', cursor: 'pointer', opacity: (isTyping || !userMessage.trim()) ? 0.6 : 1 }}>Send</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
