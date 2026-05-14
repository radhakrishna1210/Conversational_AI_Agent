import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { type AgentConfig, getAgent, saveAgent } from '../lib/agentStore';
import { whapi } from '../lib/whapi';
import ChatComponent from '../components/ChatComponent';

interface FlowItem {
  id: string;
  title: string;
  enabled: boolean;
}

interface CallConfigProps {
  maxDuration: number;
  silenceTimeout: number;
  onMaxDurationChange: (val: number) => void;
  onSilenceTimeoutChange: (val: number) => void;
  onSave: () => void;
  isSaving: boolean;
}

interface KBFile {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  status: 'ready' | 'processing' | 'error';
}

interface KnowledgeBaseProps {
  agentId: string;
}

interface WebEntry {
  id: string;
  url: string;
  status: 'indexed' | 'indexing' | 'error';
}

const defaultFlowItems: FlowItem[] = [
  { id: '1', title: 'Agent Identity & Purpose', enabled: true },
  { id: '2', title: 'General Moon Facts Flow', enabled: true },
];

const LANGUAGES_LIST = [
  'English (American)',
  'English (British)',
  'English (Indian)',
  'English (Australian)',
  'Hindi',
  'Bengali',
  'Gujarati',
  'Tamil',
  'Spanish',
  'French',
  'German',
  'Mandarin',
  'Japanese',
  'Korean',
  'Portuguese',
  'Russian',
  'Arabic',
  'Italian',
];

const VOICES_BY_PROVIDER = {
  google: [
    { id: 'aoede', name: 'Aoede', gender: 'female', accents: ['feminine', 'premium', 'chirp3'] },
    { id: 'achernar', name: 'Achernar', gender: 'female', accents: ['feminine', 'premium', 'chirp3'] },
    { id: 'algenib', name: 'Algenib', gender: 'male', accents: ['masculine', 'premium', 'chirp3'] },
    { id: 'algieba', name: 'Algieba', gender: 'male', accents: ['masculine', 'premium', 'chirp3'] },
    { id: 'alnilam', name: 'Alnilam', gender: 'male', accents: ['masculine', 'premium', 'chirp3'] },
  ],
  elevenlabs: [
    { id: 'bella', name: 'Bella', gender: 'female', accents: ['professional', 'narration'] },
    { id: 'matilda', name: 'Matilda', gender: 'female', accents: ['professional', 'narration'] },
    { id: 'adam', name: 'Adam', gender: 'male', accents: ['professional', 'narration'] },
  ],
  cartesia: [
    { id: 'dante', name: 'Dante', gender: 'male', accents: ['smooth', 'natural'] },
    { id: 'ivy', name: 'Ivy', gender: 'female', accents: ['smooth', 'natural'] },
  ],
} as const;

const AI_MODELS = ['GPT-4.1-Mini', 'GPT-4-Turbo', 'Claude-3-Opus', 'Gemini-Pro', 'Llama-2-70B'];

const MicIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#4caf50"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const InfoIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#999"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ marginLeft: '6px', cursor: 'pointer' }}
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
  <div
    onClick={onChange}
    style={{
      width: '40px',
      height: '22px',
      background: value ? '#00bcd4' : '#333',
      borderRadius: '11px',
      position: 'relative',
      cursor: 'pointer',
      transition: 'background 0.2s',
      flexShrink: 0,
    }}
  >
    <div
      style={{
        width: '16px',
        height: '16px',
        background: '#fff',
        borderRadius: '50%',
        position: 'absolute',
        top: '3px',
        left: value ? '21px' : '3px',
        transition: 'left 0.2s',
      }}
    />
  </div>
);

const ConfigSelect = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '6px' }}>{label}</label>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '9px 12px',
          background: '#111',
          border: '1px solid #2a2a2a',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px',
          color: '#fff',
        }}
      >
        <span>{value}</span>
        <span
          style={{
            fontSize: '9px',
            color: '#666',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        >
          ▼
        </span>
      </div>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#111',
            border: '1px solid #2a2a2a',
            borderRadius: '6px',
            zIndex: 20,
          }}
        >
          {options.map((opt) => (
            <div
              key={opt}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              style={{
                padding: '9px 12px',
                fontSize: '13px',
                cursor: 'pointer',
                color: value === opt ? '#00bcd4' : '#fff',
                background: value === opt ? '#0a1f1f' : 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#1a1a1a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = value === opt ? '#0a1f1f' : 'transparent';
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const NumberInput = ({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  unit = '',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}) => (
  <div>
    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '6px' }}>{label}</label>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
        style={{
          width: '80px',
          padding: '9px 12px',
          background: '#111',
          border: '1px solid #2a2a2a',
          borderRadius: '6px',
          color: '#fff',
          fontSize: '13px',
          outline: 'none',
        }}
      />
      {unit && <span style={{ fontSize: '12px', color: '#666' }}>{unit}</span>}
    </div>
  </div>
);

const SilenceHandlingPanel = ({
  silenceTimeout,
  onSilenceTimeoutChange,
}: {
  silenceTimeout: number;
  onSilenceTimeoutChange: (v: number) => void;
}) => {
  const [action, setAction] = useState('End Call');
  const [prompt, setPrompt] = useState('Are you still there? If you need more time, please let me know.');
  const [retries, setRetries] = useState(2);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <NumberInput
          label="Silence Timeout (seconds)"
          value={silenceTimeout}
          onChange={onSilenceTimeoutChange}
          min={1}
          max={60}
          unit="sec"
        />
        <ConfigSelect
          label="On Silence Action"
          value={action}
          options={['End Call', 'Prompt User', 'Transfer']}
          onChange={setAction}
        />
        <NumberInput label="Max Retries" value={retries} onChange={setRetries} min={0} max={10} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '6px' }}>
          Silence Prompt Message
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: '#111',
            border: '1px solid #2a2a2a',
            borderRadius: '6px',
            color: '#ddd',
            fontSize: '13px',
            resize: 'none',
            outline: 'none',
            lineHeight: '1.5',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );
};

const EndCallRulesPanel = () => {
  const [rules, setRules] = useState([
    { id: '1', condition: 'User says goodbye', enabled: true },
    { id: '2', condition: 'Max duration reached', enabled: true },
    { id: '3', condition: 'User requests transfer', enabled: false },
  ]);

  const toggleRule = (id: string) => {
    setRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, enabled: !rule.enabled } : rule)));
  };

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {rules.map((rule) => (
          <div
            key={rule.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: '#111',
              border: '1px solid #2a2a2a',
              borderRadius: '8px',
            }}
          >
            <span style={{ fontSize: '13px', color: '#ddd' }}>{rule.condition}</span>
            <Toggle value={rule.enabled} onChange={() => toggleRule(rule.id)} />
          </div>
        ))}
      </div>
      <button
        onClick={() =>
          setRules((prev) => [...prev, { id: Date.now().toString(), condition: 'New condition', enabled: true }])
        }
        style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px dashed #333',
          color: '#888',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '12px',
        }}
      >
        + Add Rule
      </button>
    </div>
  );
};

const TransferRoutingPanel = () => {
  const [routes, setRoutes] = useState([
    { id: '1', condition: 'User requests sales', number: '+1 (800) 555-0100', enabled: true },
  ]);

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {routes.map((route) => (
          <div
            key={route.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              alignItems: 'center',
              padding: '12px 16px',
              background: '#111',
              border: '1px solid #2a2a2a',
              borderRadius: '8px',
            }}
          >
            <div>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }}>Condition</label>
              <input
                value={route.condition}
                onChange={(e) =>
                  setRoutes((prev) => prev.map((x) => (x.id === route.id ? { ...x, condition: e.target.value } : x)))
                }
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: '#0a0a0a',
                  border: '1px solid #2a2a2a',
                  borderRadius: '5px',
                  color: '#ddd',
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }}>Phone Number</label>
              <input
                value={route.number}
                onChange={(e) =>
                  setRoutes((prev) => prev.map((x) => (x.id === route.id ? { ...x, number: e.target.value } : x)))
                }
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: '#0a0a0a',
                  border: '1px solid #2a2a2a',
                  borderRadius: '5px',
                  color: '#ddd',
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              onClick={() => setRoutes((prev) => prev.filter((x) => x.id !== route.id))}
              style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '16px' }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => setRoutes((prev) => [...prev, { id: Date.now().toString(), condition: '', number: '', enabled: true }])}
        style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px dashed #333',
          color: '#888',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '12px',
        }}
      >
        + Add Route
      </button>
    </div>
  );
};

const ResponseBehaviorPanel = () => {
  const [fillerPhrases, setFillerPhrases] = useState(true);
  const [style, setStyle] = useState('Professional');
  const [speed, setSpeed] = useState('Normal');
  const [customFillers, setCustomFillers] = useState('Let me check that for you, One moment please, Sure thing');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', color: '#ddd', fontWeight: '500' }}>Enable Filler Phrases</div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>Natural bridging phrases while processing</div>
          </div>
          <Toggle value={fillerPhrases} onChange={() => setFillerPhrases(!fillerPhrases)} />
        </div>
        <ConfigSelect
          label="Personality Style"
          value={style}
          options={['Professional', 'Friendly', 'Empathetic', 'Direct', 'Formal']}
          onChange={setStyle}
        />
        <ConfigSelect label="Response Speed" value={speed} options={['Slow', 'Normal', 'Fast']} onChange={setSpeed} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '6px' }}>
          Custom Filler Phrases (comma-separated)
        </label>
        <textarea
          value={customFillers}
          onChange={(e) => setCustomFillers(e.target.value)}
          rows={5}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: '#111',
            border: '1px solid #2a2a2a',
            borderRadius: '6px',
            color: '#ddd',
            fontSize: '12px',
            resize: 'none',
            outline: 'none',
            lineHeight: '1.6',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );
};

const AmbientSoundPanel = () => {
  const [enabled, setEnabled] = useState(false);
  const [sound, setSound] = useState('Office Ambience');
  const [volume, setVolume] = useState(30);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '20px',
        alignItems: 'start',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', color: '#ddd', fontWeight: '500' }}>Enable Ambient Sound</div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>Play background audio during calls</div>
          </div>
          <Toggle value={enabled} onChange={() => setEnabled(!enabled)} />
        </div>
        <ConfigSelect
          label="Sound Profile"
          value={sound}
          options={['Office Ambience', 'Soft Music', 'White Noise', 'Nature Sounds', 'Call Center']}
          onChange={setSound}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '6px' }}>
          Volume: <span style={{ color: '#00bcd4' }}>{volume}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#00bcd4', cursor: 'pointer', marginTop: '8px' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#555', marginTop: '4px' }}>
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
};

const AccordionItem = ({
  icon,
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        background: '#0d0d0d',
        border: '1px solid #1e1e1e',
        borderRadius: '10px',
        marginBottom: '10px',
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!open) {
          e.currentTarget.style.borderColor = '#2a2a2a';
        }
      }}
      onMouseLeave={(e) => {
        if (!open) {
          e.currentTarget.style.borderColor = '#1e1e1e';
        }
      }}
    >
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '18px 24px',
          cursor: 'pointer',
          gap: '16px',
          borderBottom: open ? '1px solid #1e1e1e' : 'none',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: '#0a1f1f',
            border: '1px solid #143333',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '2px' }}>{title}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{subtitle}</div>
        </div>
        <div
          style={{
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#555',
            fontSize: '11px',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.25s',
          }}
        >
          ▼
        </div>
      </div>

      {open && <div style={{ padding: '24px', animation: 'fadeIn 0.2s ease' }}>{children}</div>}
    </div>
  );
};

const callConfigIcons = {
  silence: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#00bcd4"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  endCall: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#00bcd4"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.43 9.88a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.34 3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.3 10.9a16 16 0 0 0 3.38 2.41z" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  ),
  transfer: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#00bcd4"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  response: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#00bcd4"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  ambient: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#00bcd4"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  ),
};

function CallConfiguration({
  maxDuration,
  silenceTimeout,
  onMaxDurationChange,
  onSilenceTimeoutChange,
  onSave,
  isSaving,
}: CallConfigProps) {
  return (
    <div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      <AccordionItem
        icon={callConfigIcons.silence}
        title="Silence Handling"
        subtitle="What happens when a caller goes quiet or stops responding"
      >
        <SilenceHandlingPanel silenceTimeout={silenceTimeout} onSilenceTimeoutChange={onSilenceTimeoutChange} />
      </AccordionItem>

      <AccordionItem
        icon={callConfigIcons.endCall}
        title="End Call Rules"
        subtitle="Set conditions for when the assistant should hang up"
      >
        <EndCallRulesPanel />
      </AccordionItem>

      <AccordionItem
        icon={callConfigIcons.transfer}
        title="Transfer & Routing"
        subtitle="Route callers to phone numbers based on conditions"
      >
        <TransferRoutingPanel />
      </AccordionItem>

      <AccordionItem
        icon={callConfigIcons.response}
        title="Response Behavior"
        subtitle="Filler phrases and personality style"
      >
        <ResponseBehaviorPanel />
      </AccordionItem>

      <AccordionItem icon={callConfigIcons.ambient} title="Ambient Sound" subtitle="Add background music or noise to calls">
        <AmbientSoundPanel />
      </AccordionItem>

      <div
        style={{
          background: '#0d0d0d',
          border: '1px solid #1e1e1e',
          borderRadius: '10px',
          padding: '20px 24px',
          marginBottom: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          flexWrap: 'wrap',
        }}
      >
        <NumberInput label="Max Call Duration" value={maxDuration} onChange={onMaxDurationChange} min={1} max={120} unit="min" />
        <div style={{ fontSize: '12px', color: '#555', maxWidth: '300px' }}>
          The call will automatically end after this duration regardless of conversation state.
        </div>
      </div>

      <button
        onClick={onSave}
        disabled={isSaving}
        style={{
          marginTop: '8px',
          padding: '11px 28px',
          background: isSaving ? '#005f6a' : '#00bcd4',
          color: '#000',
          border: 'none',
          borderRadius: '7px',
          cursor: isSaving ? 'not-allowed' : 'pointer',
          fontWeight: '700',
          fontSize: '13px',
          transition: 'background 0.2s',
        }}
      >
        {isSaving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const TOTAL_STORAGE_MB = 10;
const USED_STORAGE_MB = 5.0;

const UploadIcon = ({ color = '#00bcd4', size = 42 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const PDFIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#e53935" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="12" y2="17" />
    <line x1="9" y1="9" x2="10" y2="9" />
  </svg>
);

const GlobeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

const WarningIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const StorageBar = ({ usedMB, totalMB }: { usedMB: number; totalMB: number }) => {
  const pct = Math.min((usedMB / totalMB) * 100, 100);
  const low = pct >= 50;
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', marginBottom: '6px' }}>
        <span>{usedMB.toFixed(1)} MB used</span>
        <span>{totalMB} MB total</span>
      </div>
      <div style={{ height: '4px', background: '#1e1e1e', borderRadius: '2px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: low ? '#f59e0b' : '#00bcd4',
            borderRadius: '2px',
            transition: 'width 0.4s',
          }}
        />
      </div>
    </div>
  );
};

const FileRow = ({ file, onDelete }: { file: KBFile; onDelete: (id: string) => void }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      padding: '12px 16px',
      background: '#0d0d0d',
      border: '1px solid #1e1e1e',
      borderRadius: '8px',
    }}
  >
    <PDFIcon />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: '13px',
          color: '#ddd',
          fontWeight: '500',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {file.name}
      </div>
      <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
        {formatBytes(file.size)} · {file.uploadedAt}
      </div>
    </div>
    <span
      style={{
        fontSize: '10px',
        fontWeight: '600',
        padding: '3px 8px',
        borderRadius: '4px',
        background: file.status === 'ready' ? '#0a1f1f' : file.status === 'processing' ? '#1a1400' : '#1f0a0a',
        color: file.status === 'ready' ? '#00bcd4' : file.status === 'processing' ? '#f59e0b' : '#e53935',
        letterSpacing: '0.5px',
      }}
    >
      {file.status.toUpperCase()}
    </span>
    <button
      onClick={() => onDelete(file.id)}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: '#444',
        padding: '4px',
        borderRadius: '4px',
        transition: 'color 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = '#e53935';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = '#444';
      }}
    >
      <TrashIcon />
    </button>
  </div>
);

const WebRow = ({ entry, onDelete }: { entry: WebEntry; onDelete: (id: string) => void }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      padding: '12px 16px',
      background: '#0d0d0d',
      border: '1px solid #1e1e1e',
      borderRadius: '8px',
    }}
  >
    <div
      style={{
        width: '32px',
        height: '32px',
        borderRadius: '6px',
        background: '#0a1f1f',
        border: '1px solid #143333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <GlobeIcon />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: '13px',
          color: '#ddd',
          fontWeight: '500',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {entry.url}
      </div>
    </div>
    <span
      style={{
        fontSize: '10px',
        fontWeight: '600',
        padding: '3px 8px',
        borderRadius: '4px',
        background: entry.status === 'indexed' ? '#0a1f1f' : entry.status === 'indexing' ? '#1a1400' : '#1f0a0a',
        color: entry.status === 'indexed' ? '#00bcd4' : entry.status === 'indexing' ? '#f59e0b' : '#e53935',
      }}
    >
      {entry.status.toUpperCase()}
    </span>
    <button
      onClick={() => onDelete(entry.id)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: '4px', borderRadius: '4px', transition: 'color 0.2s' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = '#e53935';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = '#444';
      }}
    >
      <TrashIcon />
    </button>
  </div>
);

function KnowledgeBase({ agentId }: KnowledgeBaseProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<KBFile[]>([]);
  const [webEntries, setWebEntries] = useState<WebEntry[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [showWarning, setShowWarning] = useState(true);

  const usedMB = USED_STORAGE_MB + files.reduce((sum, file) => sum + file.size / 1024 / 1024, 0);

  const handleFiles = (fileList: FileList) => {
    const newFiles: KBFile[] = Array.from(fileList)
      .filter((file) => file.type === 'application/pdf')
      .map((file) => ({
        id: Date.now().toString() + Math.random(),
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        status: 'processing' as const,
      }));

    setFiles((prev) => [...prev, ...newFiles]);

    setTimeout(() => {
      setFiles((prev) => prev.map((file) => (newFiles.find((nf) => nf.id === file.id) ? { ...file, status: 'ready' } : file)));
    }, 2000);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleAddUrl = () => {
    if (!websiteUrl.trim()) {
      return;
    }

    const entry: WebEntry = { id: Date.now().toString(), url: websiteUrl.trim(), status: 'indexing' };
    setIsAddingUrl(true);
    setWebEntries((prev) => [...prev, entry]);
    setWebsiteUrl('');

    setTimeout(() => {
      setWebEntries((prev) => prev.map((item) => (item.id === entry.id ? { ...item, status: 'indexed' } : item)));
      setIsAddingUrl(false);
    }, 2500);
  };

  const hasContent = files.length > 0 || webEntries.length > 0;

  return (
    <div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div
          style={{
            background: '#0d0d0d',
            border: '1px solid #1e1e1e',
            borderRadius: '12px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UploadIcon size={20} />
            <span style={{ fontSize: '15px', fontWeight: '600', color: '#fff' }}>Upload PDFs</span>
          </div>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>Add PDF files to your assistant knowledge base</p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? '#00bcd4' : '#2a2a2a'}`,
              borderRadius: '10px',
              padding: '40px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              cursor: 'pointer',
              transition: 'border-color 0.2s, background 0.2s',
              background: isDragging ? '#071515' : 'transparent',
            }}
          >
            <div style={{ opacity: isDragging ? 1 : 0.7 }}>
              <UploadIcon color="#00bcd4" size={40} />
            </div>
            <div style={{ fontSize: '13px', fontWeight: '500', color: '#ddd', textAlign: 'center' }}>
              Drag and drop a file here, or click to select
            </div>
            <div style={{ fontSize: '11px', color: '#555' }}>Supported formats: PDF (max 10MB)</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files) {
                handleFiles(e.target.files);
              }
            }}
          />

          <StorageBar usedMB={usedMB} totalMB={TOTAL_STORAGE_MB} />
        </div>

        <div
          style={{
            background: '#0d0d0d',
            border: '1px solid #1e1e1e',
            borderRadius: '12px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <GlobeIcon />
            <span style={{ fontSize: '15px', fontWeight: '600', color: '#fff' }}>Website Knowledge Base</span>
          </div>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
            Add website content to your assistant knowledge base ({agentId})
          </p>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500', color: '#ccc' }}>Website URL</label>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com/"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddUrl();
                }
              }}
              style={{
                width: '100%',
                padding: '11px 14px',
                background: '#111',
                border: '1px solid #2a2a2a',
                borderRadius: '7px',
                color: '#ddd',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#00bcd4';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#2a2a2a';
              }}
            />
          </div>

          <button
            onClick={handleAddUrl}
            disabled={!websiteUrl.trim() || isAddingUrl}
            style={{
              width: '100%',
              padding: '12px',
              background: '#00bcd4',
              color: '#000',
              border: 'none',
              borderRadius: '7px',
              cursor: !websiteUrl.trim() || isAddingUrl ? 'not-allowed' : 'pointer',
              fontWeight: '700',
              fontSize: '13px',
              opacity: !websiteUrl.trim() || isAddingUrl ? 0.6 : 1,
              transition: 'opacity 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isAddingUrl ? (
              <>
                <span
                  style={{
                    display: 'inline-block',
                    width: '14px',
                    height: '14px',
                    border: '2px solid #000',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }}
                />
                Indexing...
              </>
            ) : (
              'Add to Knowledge Base'
            )}
          </button>

          <div style={{ background: '#071515', border: '1px solid #0d2929', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: '#888', lineHeight: '1.6' }}>
              <span style={{ color: '#00bcd4', fontWeight: '600' }}>Tip:</span> Use your company help center, FAQ page, or product
              documentation URL for best results. The crawler will automatically index linked pages.
            </div>
          </div>
        </div>
      </div>

      {showWarning && usedMB / TOTAL_STORAGE_MB >= 0.5 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            background: '#1a1000',
            border: '1px solid #3d2800',
            borderRadius: '10px',
            padding: '14px 18px',
            marginBottom: '20px',
            animation: 'fadeIn 0.3s ease',
          }}
        >
          <WarningIcon />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#f59e0b' }}>Low Storage Space Warning</span>
            <span style={{ fontSize: '13px', color: '#999', marginLeft: '8px' }}>
              You only have {(TOTAL_STORAGE_MB - usedMB).toFixed(1)} MB of knowledge base storage remaining.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              style={{
                padding: '8px 18px',
                background: '#f472b6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              Upgrade
            </button>
            <button
              onClick={() => setShowWarning(false)}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {hasContent ? (
        <div style={{ background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '16px' }}>
            Uploaded Files & Websites
            <span style={{ marginLeft: '8px', fontSize: '12px', color: '#555', fontWeight: '400' }}>
              ({files.length + webEntries.length} item{files.length + webEntries.length !== 1 ? 's' : ''})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {files.map((file) => (
              <FileRow key={file.id} file={file} onDelete={(id) => setFiles((prev) => prev.filter((x) => x.id !== id))} />
            ))}
            {webEntries.map((entry) => (
              <WebRow key={entry.id} entry={entry} onDelete={(id) => setWebEntries((prev) => prev.filter((x) => x.id !== id))} />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '14px' }}>
          <div style={{ opacity: 0.5 }}>
            <UploadIcon color="#00bcd4" size={48} />
          </div>
          <div style={{ fontSize: '16px', fontWeight: '500', color: '#666' }}>No files uploaded yet</div>
          <div style={{ fontSize: '13px', color: '#444' }}>Upload files to get started</div>
        </div>
      )}
    </div>
  );
}

export default function EditAgent() {
  const { agentId } = useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('details');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const [welcomeMessage, setWelcomeMessage] = useState(
    'Hello, I am Luna, your Moon Information Assistant. What would you like to know about the Moon?',
  );
  const [maxDuration, setMaxDuration] = useState(30);
  const [silenceTimeout, setSilenceTimeout] = useState(5);
  const [dynamicEnabled, setDynamicEnabled] = useState(true);
  const [interruptibleEnabled, setInterruptibleEnabled] = useState(true);
  const [flowItems, setFlowItems] = useState<FlowItem[]>(defaultFlowItems);

  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [voice, setVoice] = useState('Google - Aoede (female)');
  const [aiModel, setAiModel] = useState('GPT-4.1-Mini');
  const [transcription, setTranscription] = useState('Azure');

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

  const [voiceProvider, setVoiceProvider] = useState<keyof typeof VOICES_BY_PROVIDER>('google');
  const [agentName, setAgentName] = useState('Moon Information Agent');
  const [agentNotFound, setAgentNotFound] = useState(false);

  useEffect(() => {
    if (!agentId) {
      return;
    }

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
          setFlowItems(Array.isArray(agent.flowItems) ? (agent.flowItems as FlowItem[]) : defaultFlowItems);

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

      const localAgent = getAgent(agentId);
      if (!localAgent) {
        setAgentNotFound(true);
        return;
      }

      setAgentName(localAgent.name);
      setWelcomeMessage(localAgent.welcomeMessage);
      setSelectedLanguages(localAgent.languages || localAgent.selectedLanguages || ['English (Indian)']);
      setVoice(localAgent.voice || 'Google - Aoede (female)');
      setAiModel(localAgent.aiModel || 'GPT-4.1-Mini');
      setTranscription(localAgent.transcription || 'Azure');
      setMaxDuration(localAgent.maxDuration ?? 30);
      setSilenceTimeout(localAgent.silenceTimeout ?? 5);
      setDynamicEnabled(localAgent.dynamicEnabled ?? true);
      setInterruptibleEnabled(localAgent.interruptibleEnabled ?? true);
      setFlowItems(Array.isArray(localAgent.flowItems) ? (localAgent.flowItems as FlowItem[]) : defaultFlowItems);
    };

    void fetchAgent();
  }, [agentId]);

  const handleSave = async () => {
    const resolvedAgentId = agentId ?? 'local-agent';

    setIsSaving(true);
    const agentData = {
      id: resolvedAgentId,
      name: agentName,
      welcomeMessage,
      aiModel,
      voice,
      transcription,
      languages: selectedLanguages,
      selectedLanguages,
      flowItems,
      maxDuration,
      silenceTimeout,
      dynamicEnabled,
      interruptibleEnabled,
    };

    let savedRemotely = false;
    if (agentId) {
      try {
        await whapi.put(`/agents/${agentId}`, agentData);
        savedRemotely = true;
      } catch (err) {
        console.error('Failed to save to backend', err);
      }
    }

    saveAgent(agentData as any);

    setSaveMessage(savedRemotely ? 'Saved successfully!' : 'Saved locally');
    setTimeout(() => setSaveMessage(''), 3000);
    setIsSaving(false);
  };

  const toggleFlowItem = (id: string) => {
    setFlowItems((prev) => prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)));
  };

  const deleteFlowItem = (id: string) => {
    setFlowItems((prev) => prev.filter((item) => item.id !== id));
  };

  const addFlowItem = () => {
    const newItem: FlowItem = {
      id: Date.now().toString(),
      title: 'New Flow Item',
      enabled: true,
    };
    setFlowItems((prev) => [...prev, newItem]);
  };

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
  };

  const handleVoiceSelect = (voiceName: string) => {
    const provider = voiceProvider.charAt(0).toUpperCase() + voiceProvider.slice(1);
    setVoice(`${provider} - ${voiceName}`);
    setShowVoiceModal(false);
  };

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        background: '#0f0f0f',
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {showLanguageModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#1a1a1a',
              borderRadius: '8px',
              padding: '30px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Language Configuration</h2>
              <button
                onClick={() => setShowLanguageModal(false)}
                style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '13px', color: '#999', marginBottom: '20px' }}>
              Choose multiple languages for your agent to support
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              {LANGUAGES_LIST.map((lang) => (
                <label
                  key={lang}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    background: '#0f0f0f',
                    border: selectedLanguages.includes(lang) ? '1px solid #00bcd4' : '1px solid #333',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
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
              <button
                onClick={() => setShowLanguageModal(false)}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: '1px solid #333',
                  color: '#fff',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => setShowLanguageModal(false)}
                style={{
                  padding: '10px 20px',
                  background: '#00bcd4',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showVoiceModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#1a1a1a',
              borderRadius: '8px',
              padding: '30px',
              maxWidth: '900px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Voice Configuration</h2>
              <button
                onClick={() => setShowVoiceModal(false)}
                style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '8px' }}>
              {Object.keys(VOICES_BY_PROVIDER).map((provider) => (
                <button
                  key={provider}
                  onClick={() => setVoiceProvider(provider as keyof typeof VOICES_BY_PROVIDER)}
                  style={{
                    padding: '8px 16px',
                    background: voiceProvider === provider ? '#00bcd4' : '#0f0f0f',
                    color: voiceProvider === provider ? '#000' : '#fff',
                    border: voiceProvider === provider ? 'none' : '1px solid #333',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {provider.charAt(0).toUpperCase() + provider.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              {VOICES_BY_PROVIDER[voiceProvider].map((v) => (
                <div
                  key={v.id}
                  onClick={() => handleVoiceSelect(v.name)}
                  style={{
                    background: '#0f0f0f',
                    border: voice.includes(v.name) ? '2px solid #00bcd4' : '1px solid #333',
                    borderRadius: '8px',
                    padding: '16px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '500' }}>{v.name}</div>
                      <div style={{ fontSize: '11px', color: '#999' }}>{voiceProvider.charAt(0).toUpperCase() + voiceProvider.slice(1)}</div>
                    </div>
                    <button style={{ background: 'none', border: 'none', color: '#00bcd4', cursor: 'pointer', fontSize: '18px' }}>▶</button>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {v.accents.map((accent) => (
                      <span
                        key={accent}
                        style={{ fontSize: '11px', background: '#1a1a1a', padding: '4px 8px', borderRadius: '4px', color: '#999' }}
                      >
                        {accent}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowVoiceModal(false)}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: '1px solid #333',
                  color: '#fff',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => setShowVoiceModal(false)}
                style={{
                  padding: '10px 20px',
                  background: '#00bcd4',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showModelModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '30px', maxWidth: '500px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>AI Model Configuration</h2>
              <button
                onClick={() => setShowModelModal(false)}
                style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
              {AI_MODELS.map((model) => (
                <button
                  key={model}
                  onClick={() => {
                    setAiModel(model);
                    setShowModelModal(false);
                  }}
                  style={{
                    padding: '12px',
                    background: aiModel === model ? '#00bcd4' : '#0f0f0f',
                    color: aiModel === model ? '#000' : '#fff',
                    border: aiModel === model ? 'none' : '1px solid #333',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    textAlign: 'left',
                    fontWeight: aiModel === model ? '600' : '400',
                  }}
                >
                  {model}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showTranscriptionModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: '8px',
              padding: '30px',
              maxWidth: '900px',
              width: '90%',
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Speech-to-Text Configuration</h2>
              <button
                onClick={() => setShowTranscriptionModal(false)}
                style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '24px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '30px', marginBottom: '30px' }}>
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
                      color: '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MicIcon />
                      <span>{sttProvider}</span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#999', transform: isSttProviderDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      ▼
                    </span>
                  </div>
                  {isSttProviderDropdownOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#0f0f0f', border: '1px solid #333', borderRadius: '6px', marginTop: '4px', zIndex: 10 }}>
                      {['Standard Providers', 'deepgram_stream', 'Azure', 'Sarvam', 'Soniox'].map((provider) => (
                        <div
                          key={provider}
                          onClick={() => {
                            setSttProvider(provider);
                            setIsSttProviderDropdownOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: '#fff',
                            background: sttProvider === provider ? '#1a1a1a' : 'transparent',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#1a1a1a';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = sttProvider === provider ? '#1a1a1a' : 'transparent';
                          }}
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
                        cursor: 'pointer',
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
                      cursor: 'pointer',
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
                        transition: 'left 0.2s, background 0.2s',
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
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: '500' }}>Advanced Settings</span>
                  <span style={{ fontSize: '10px', color: '#999', transform: sttAdvancedSettingsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    ▼
                  </span>
                </div>
              </div>

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
                      {['Saaras V3', 'Standard V2'].map((model) => (
                        <div
                          key={model}
                          onClick={() => {
                            setSttModel(model);
                            setIsSttModelDropdownOpen(false);
                          }}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: '#fff', background: sttModel === model ? '#1a1a1a' : 'transparent' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#1a1a1a';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = sttModel === model ? '#1a1a1a' : 'transparent';
                          }}
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
                      {['Multi', 'English', 'Hindi', 'Tamil'].map((lang) => (
                        <div
                          key={lang}
                          onClick={() => {
                            setSttLanguage(lang);
                            setIsSttLanguageDropdownOpen(false);
                          }}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: '#fff', background: sttLanguage === lang ? '#1a1a1a' : 'transparent' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#1a1a1a';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = sttLanguage === lang ? '#1a1a1a' : 'transparent';
                          }}
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
                style={{
                  padding: '10px 24px',
                  background: '#00bcd4',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          background: '#0a0a0a',
          borderBottom: '1px solid #1a1a1a',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '18px', padding: 0 }}>
          ←
        </button>

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
            minWidth: '240px',
          }}
          placeholder="Agent Name"
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', background: '#0f1f12', border: '1px solid #1a3a22', borderRadius: '12px', fontSize: '11px', color: '#4caf50', fontWeight: '500' }}>
          <span style={{ fontSize: '8px' }}>●</span> Incoming
        </div>

        <div style={{ fontSize: '12px', color: '#888' }}>Cost/min: $0.115</div>

        {saveMessage && <div style={{ fontSize: '12px', color: '#4caf50', fontWeight: 600 }}>{saveMessage}</div>}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => alert('Ask AI')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
            ✨ Ask AI
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#fff', fontWeight: '500' }}>Test with</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#111', padding: '4px', borderRadius: '8px', border: '1px solid #222' }}>
              <button
                onClick={() => setActiveTab('chat')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
              >
                💬 Chat
              </button>
              <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#0f0f0f', color: '#00bcd4', border: '1px solid #00bcd4', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                📞 Web Call
              </button>
              <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#0f0f0f', color: '#00bcd4', border: '1px solid #00bcd4', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                ☎️ Phone Call
              </button>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: '6px', cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '500', opacity: isSaving ? 0.6 : 1 }}
          >
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
          <p style={{ color: '#999', marginTop: '10px' }}>
            The assistant you are trying to edit does not exist or has been removed. Return to the dashboard to select a different assistant.
          </p>
          <button onClick={() => navigate('/dashboard')} style={{ marginTop: '16px', padding: '10px 18px', background: '#00bcd4', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
            Back to Dashboard
          </button>
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: '1px solid #1a1a1a', background: '#0a0a0a', padding: '0 24px', gap: '24px', overflowX: 'auto', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '24px', flex: 1 }}>
          {[
            { id: 'details', label: '🤖 Assistant Details' },
            { id: 'config', label: '📞 Call Configuration' },
            { id: 'kb', label: '📚 Knowledge Base' },
            { id: 'integrations', label: '🔗 Integrations' },
            { id: 'postcall', label: '📤 Post-Call' },
            { id: 'chat', label: '💬 Chat Test' },
            { id: 'calls', label: '📞 Recent Calls' },
          ].map((tab) => (
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
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', background: '#111', border: '1px solid #222', borderRadius: '6px', padding: '6px 12px', minWidth: '200px' }}>
          <span style={{ color: '#666', marginRight: '8px', fontSize: '14px' }}>🔍</span>
          <input type="text" placeholder="Search or jump to..." style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', outline: 'none', width: '100%' }} />
          <div style={{ background: '#222', color: '#999', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>⌘K</div>
        </div>
      </div>

      <div style={{ padding: '30px 24px' }}>
        {activeTab === 'details' && (
          <>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
              Assistant Settings <InfoIcon />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px', marginBottom: '30px' }}>
              {[
                {
                  icon: '🌐',
                  label: 'Languages',
                  value:
                    selectedLanguages.length > 0
                      ? selectedLanguages[0] + (selectedLanguages.length > 1 ? ` +${selectedLanguages.length - 1}` : '')
                      : 'No languages selected',
                  onClick: () => setShowLanguageModal(true),
                },
                { icon: '🎙️', label: 'Voice (TTS)', value: voice, onClick: () => setShowVoiceModal(true) },
                { icon: '🧠', label: 'AI Model (LLM)', value: aiModel, onClick: () => setShowModelModal(true) },
                { icon: '🎧', label: 'Transcription (STT)', value: transcription, onClick: () => setShowTranscriptionModal(true) },
              ].map((item, i) => (
                <div
                  key={i}
                  onClick={item.onClick}
                  style={{ background: '#0a1414', border: '1px solid #142828', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#0d1a1a';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#0a1414';
                  }}
                >
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
                    outline: 'none',
                  }}
                  placeholder="Type your welcome message here..."
                />
                <div style={{ fontSize: '11px', color: '#666', textAlign: 'right', marginTop: '8px' }}>{welcomeMessage.length}/600</div>
              </div>
            </div>

            <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #111' }}>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '14px', fontWeight: '600' }}>
                  <span style={{ color: '#00bcd4', marginRight: '8px' }}>☷</span> Conversational Flow <InfoIcon />
                </div>
                <button onClick={addFlowItem} style={{ padding: '6px 12px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                  + Add Section
                </button>
              </div>
              <div style={{ padding: '20px' }}>
                {flowItems.map((item, index) => (
                  <div key={item.id} style={{ background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '16px 20px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
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
                      <button onClick={() => deleteFlowItem(item.id)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '16px', padding: 0 }}>
                        🗑
                      </button>
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
          <CallConfiguration
            maxDuration={maxDuration}
            silenceTimeout={silenceTimeout}
            onMaxDurationChange={setMaxDuration}
            onSilenceTimeoutChange={setSilenceTimeout}
            onSave={handleSave}
            isSaving={isSaving}
          />
        )}

        {activeTab === 'kb' && <KnowledgeBase agentId={agentId ?? 'demo'} />}

        {activeTab === 'integrations' && (
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '20px' }}>🔗 Integrations</div>
            <p style={{ color: '#999', marginBottom: '20px', fontSize: '13px' }}>No integrations configured yet.</p>
            <button onClick={() => alert('Add integration feature coming soon')} style={{ padding: '10px 20px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
              + Add Integration
            </button>
          </div>
        )}

        {activeTab === 'postcall' && (
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '20px' }}>📤 Post-Call Actions</div>
            <p style={{ color: '#999', marginBottom: '20px', fontSize: '13px' }}>Configure what happens after the call ends.</p>
            <button onClick={() => alert('Post-call actions feature coming soon')} style={{ padding: '10px 20px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
              + Add Action
            </button>
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
    </div>
  );
}
