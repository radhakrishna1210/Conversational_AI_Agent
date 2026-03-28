import { useState, useEffect } from 'react';

type Conv = { id: string; name: string; phone: string; lastMsg: string; time: string; unread: number; agent: string | null; label: string | null; sessionLeft: string };
type Msg = { from: string; text: string; time: string };

const labelColors: Record<string, string> = {
  urgent: '#fee2e2',
  resolved: '#dcfce7',
  billing: '#e0f2fe',
};
const labelText: Record<string, string> = {
  urgent: '#b91c1c',
  resolved: '#15803d',
  billing: '#0369a1',
};

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const sessionLeft = (expiresAt: string | null) => {
  if (!expiresAt) return '—';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function WHInbox() {
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [msgHistory, setMsgHistory] = useState<Msg[]>([]);
  const [activeConv, setActiveConv] = useState<Conv | null>(null);
  const [message, setMessage] = useState('');
  const [botEnabled, setBotEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'notes'>('chat');

  const workspaceId = localStorage.getItem('workspaceId') ?? '';
  const token = localStorage.getItem('token') ?? '';
  const authHeaders: HeadersInit = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch(`/api/v1/workspaces/${workspaceId}/conversations`, { headers: authHeaders })
      .then(r => r.json())
      .then((data: any) => {
        const list = Array.isArray(data) ? data : (data.conversations ?? data.data ?? []);
        setConversations(list.map((c: any) => ({
          id: c.id,
          name: c.contact?.name ?? c.contact?.phoneNumber ?? 'Unknown',
          phone: c.contact?.phoneNumber ?? '',
          lastMsg: c.lastMessage?.body ?? c.messages?.[0]?.body ?? '',
          time: c.lastMessageAt ? fmtTime(c.lastMessageAt) : '',
          unread: c.unreadCount ?? 0,
          agent: c.assignedAgent?.name ?? null,
          label: c.label ?? null,
          sessionLeft: sessionLeft(c.sessionExpiresAt),
        })));
      })
      .catch(() => {});
  }, []);

  const openConv = (c: Conv) => {
    setActiveConv(c);
    setMsgHistory([]);
    fetch(`/api/v1/workspaces/${workspaceId}/conversations/${c.id}/messages`, { headers: authHeaders })
      .then(r => r.json())
      .then((data: any) => {
        const list = Array.isArray(data) ? data : (data.messages ?? []);
        setMsgHistory(list.map((m: any) => ({
          from: m.direction === 'INBOUND' ? 'user' : m.senderUserId ? 'agent' : 'bot',
          text: m.body ?? '',
          time: fmtTime(m.sentAt),
        })));
      })
      .catch(() => {});
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 112px)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', backgroundColor: '#f8fafc' }}>
      
      {/* Left — Conversation List */}
      <div style={{ width: '300px', flexShrink: 0, backgroundColor: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginBottom: '10px' }}>💬 Live Inbox</div>
          <input style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box' as const }} placeholder="🔍 Search conversations…" />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {conversations.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No conversations yet.</div>
          )}
          {conversations.map(c => (
            <div key={c.id} onClick={() => openConv(c)} style={{ padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', backgroundColor: activeConv?.id === c.id ? '#f0fdf4' : 'transparent', borderLeft: activeConv?.id === c.id ? '3px solid #10b981' : '3px solid transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{c.name}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{c.time}</div>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.lastMsg}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {c.label && <span style={{ backgroundColor: labelColors[c.label], color: labelText[c.label], padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>{c.label}</span>}
                {c.unread > 0 && <span style={{ backgroundColor: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, marginLeft: 'auto' }}>{c.unread}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right — Active Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!activeConv ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px' }}>
            Select a conversation to start chatting
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: '#1e4034', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px' }}>{activeConv.name[0]}</div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{activeConv.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{activeConv.phone}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', color: '#15803d', fontWeight: 600 }}>⏱ {activeConv.sessionLeft} left</div>
                <select style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', color: '#374151', backgroundColor: '#f8fafc', outline: 'none' }} defaultValue={activeConv.agent || ''}>
                  <option value="">Unassigned</option>
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b' }}>
                  <span>{botEnabled ? '🤖 Bot' : '👤 Human'}</span>
                  <div onClick={() => setBotEnabled(!botEnabled)} style={{ width: '36px', height: '20px', borderRadius: '10px', backgroundColor: botEnabled ? '#10b981' : '#e2e8f0', cursor: 'pointer', position: 'relative', transition: 'background-color 0.2s' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#fff', position: 'absolute', top: '2px', left: botEnabled ? '18px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '24px', padding: '0 20px' }}>
              {(['chat', 'notes'] as const).map(t => (
                <button key={t} onClick={() => setActiveTab(t)} style={{ background: 'none', border: 'none', padding: '12px 0', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: activeTab === t ? '#1e4034' : '#64748b', borderBottom: activeTab === t ? '2px solid #1e4034' : '2px solid transparent', textTransform: 'capitalize' }}>{t === 'chat' ? '💬 Chat' : '📝 Internal Notes'}</button>
              ))}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', backgroundColor: '#f8fafc' }}>
              {activeTab === 'chat' && msgHistory.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.from === 'user' ? 'flex-start' : 'flex-end', marginBottom: '12px' }}>
                  <div style={{ maxWidth: '65%' }}>
                    {m.from === 'user' && <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>{activeConv.name}</div>}
                    {m.from === 'agent' && <div style={{ fontSize: '11px', color: '#10b981', marginBottom: '4px' }}>Agent</div>}
                    {m.from === 'bot' && <div style={{ fontSize: '11px', color: '#8b5cf6', marginBottom: '4px' }}>🤖 Bot</div>}
                    <div style={{ backgroundColor: m.from === 'user' ? '#fff' : m.from === 'bot' ? '#f3e8ff' : '#d1fae5', border: '1px solid', borderColor: m.from === 'user' ? '#e2e8f0' : m.from === 'bot' ? '#e9d5ff' : '#a7f3d0', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#1e293b' }}>
                      {m.text}
                    </div>
                    <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '3px', textAlign: m.from === 'user' ? 'left' : 'right' }}>{m.time}</div>
                  </div>
                </div>
              ))}
              {activeTab === 'notes' && (
                <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', fontSize: '14px', color: '#64748b' }}>
                  No internal notes yet. Add a note below to collaborate with your team.
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div style={{ backgroundColor: '#fff', borderTop: '1px solid #e2e8f0', padding: '12px 20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer', color: '#64748b' }}>⚡ Quick Reply</button>
              <input value={message} onChange={e => setMessage(e.target.value)} placeholder={activeTab === 'chat' ? 'Type a message…' : 'Add internal note…'} style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 14px', fontSize: '14px', outline: 'none', backgroundColor: '#f8fafc', color: '#1e293b' }} />
              <button style={{ backgroundColor: '#1e4034', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Send</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
