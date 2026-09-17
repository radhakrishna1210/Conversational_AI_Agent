// client/src/pages/ModelAssignmentsTab.tsx
/**
 * Super Admin → Models: which AI model and which transcription model calls run on.
 *
 * Clients no longer choose either — they pick a language and a voice. This is
 * where the choice is made instead, in the same shape as pricing:
 *
 *   Platform defaults  what every agent created from now on runs
 *   Client models      a per-client override that beats the default AND any
 *                      model an older agent kept
 *
 * An agent saved before assignment existed keeps the model it was already
 * running until its client gets an override here — that is what made shipping
 * this a no-op for live campaigns. The Agents column says how many there are.
 *
 * Backend: services/platform/modelAssignments.js. Every change is audited.
 */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/adminApi';
import { authFetch } from '@/lib/authFetch';

type Pair = { llm: string | null; stt: string | null };

type ClientRow = Pair & {
  id: string; name: string; slug: string;
  agents: number;
  /** Agents still running a model they had before assignment existed. */
  agentsWithOwnModel: number;
};

type CatalogModel = { id: string; value: string; label: string; provider: string; enabled: boolean; configured: boolean };
type CatalogGroup = { key: string; models: CatalogModel[] };

const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', background: 'var(--s2)',
  border: '1px solid var(--line-2)', borderRadius: 9, color: 'var(--tx)',
  fontFamily: 'var(--ff-b)', fontSize: 13,
};

const fieldLabel: React.CSSProperties = {
  display: 'block', color: 'var(--tx-3)', fontSize: 10,
  textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, marginBottom: 4,
};

const cell: React.CSSProperties = {
  padding: '9px 10px', borderBottom: '1px solid var(--line)', fontSize: 13, color: 'var(--tx-2)',
};
const head: React.CSSProperties = {
  ...cell, color: 'var(--tx-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600,
};

/** What a call runs when nothing is assigned at all. */
const SERVER_DEFAULT: Record<keyof Pair, string> = {
  llm: 'Server default model',
  stt: 'Deepgram — best model per language and line',
};

const optionLabel = (m: CatalogModel) =>
  `${m.label} · ${m.provider}${m.configured ? '' : ' — no API key on this server'}`;

export default function ModelAssignmentsTab() {
  const [defaults, setDefaults] = useState<Pair | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [models, setModels] = useState<Record<keyof Pair, CatalogModel[]>>({ llm: [], stt: [] });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ where: 'defaults' | 'clients'; text: string } | null>(null);
  const [q, setQ] = useState('');

  const load = async () => {
    try {
      const [assignRes, catalogRes] = await Promise.all([
        authFetch(API('/model-assignments')),
        authFetch(API('/model-catalog')),
      ]);
      const assign = await assignRes.json();
      const catalog = await catalogRes.json();
      if (!assignRes.ok) throw new Error(assign.error || `Failed (${assignRes.status})`);
      if (!catalogRes.ok) throw new Error(catalog.error || `Failed (${catalogRes.status})`);
      setDefaults(assign.defaults);
      setWarnings(assign.warnings ?? []);
      setClients(assign.workspaces ?? []);
      const groups: CatalogGroup[] = catalog.groups ?? [];
      setModels({
        llm: groups.find((g) => g.key === 'llm')?.models ?? [],
        stt: groups.find((g) => g.key === 'stt')?.models ?? [],
      });
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load');
    }
  };
  useEffect(() => { void load(); }, []);

  const labelOf = (group: keyof Pair, value: string | null) =>
    models[group].find((m) => m.value.toLowerCase() === String(value ?? '').toLowerCase())?.label ?? value;

  const saveDefault = async (group: keyof Pair, value: string) => {
    setBusy(`defaults:${group}`); setMsg(null);
    try {
      const res = await authFetch(API('/model-assignments/defaults'), {
        method: 'PUT', body: JSON.stringify({ [group]: value || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setDefaults(data.defaults);
      setWarnings(data.warnings ?? []);
      setMsg({
        where: 'defaults',
        text: `New agents now run ${value ? labelOf(group, value) : SERVER_DEFAULT[group]} for ${group === 'llm' ? 'the AI model' : 'transcription'}.`,
      });
    } catch (e) {
      setMsg({ where: 'defaults', text: e instanceof Error ? e.message : 'Save failed' });
    } finally { setBusy(null); }
  };

  const saveClient = async (row: ClientRow, group: keyof Pair, value: string) => {
    setBusy(row.id); setMsg(null);
    try {
      const res = await authFetch(API(`/model-assignments/workspaces/${row.id}`), {
        method: 'PUT', body: JSON.stringify({ [group]: value || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setClients((prev) => prev.map((c) => (c.id === row.id ? { ...c, llm: data.llm, stt: data.stt } : c)));
      const warn = (data.warnings ?? []).join(' ');
      setMsg({
        where: 'clients',
        text: `${row.name}: ${value ? `every agent now runs ${labelOf(group, value)}` : 'back to the platform default'}.${warn ? ` ${warn}` : ''}`,
      });
    } catch (e) {
      setMsg({ where: 'clients', text: e instanceof Error ? e.message : 'Save failed' });
    } finally { setBusy(null); }
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? clients.filter((c) => `${c.name} ${c.slug}`.toLowerCase().includes(term)) : clients;
  }, [clients, q]);

  if (loadError) return <p style={{ color: 'var(--err)' }}>Couldn&apos;t load model assignments: {loadError}</p>;
  if (!defaults) return <p style={{ color: 'var(--tx-3)' }}>Loading model assignments…</p>;

  /** Options for one select: switched-on models, plus the current value even if it has since been switched off. */
  const optionsFor = (group: keyof Pair, current: string | null) =>
    models[group].filter((m) => m.enabled || m.value.toLowerCase() === String(current ?? '').toLowerCase());

  const defaultLabel = (group: keyof Pair) =>
    defaults[group] ? labelOf(group, defaults[group]) : SERVER_DEFAULT[group];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26, maxWidth: 980 }}>
      <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '16px 18px' }}>
        <h3 style={{ fontSize: 14, color: 'var(--tx)', margin: '0 0 4px' }}>Platform defaults</h3>
        <p style={{ color: 'var(--tx-3)', fontSize: 12, lineHeight: 1.6, margin: '0 0 14px' }}>
          Clients choose only a language and a voice. Every agent created from now on runs these models.
          Agents saved before this existed keep the model they already had, unless their client has an
          override below.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {(['llm', 'stt'] as const).map((group) => (
            <label key={group} style={{ display: 'block' }}>
              <span style={fieldLabel}>{group === 'llm' ? 'AI model (LLM)' : 'Transcription (STT)'}</span>
              <select
                value={defaults[group] ?? ''}
                disabled={busy === `defaults:${group}`}
                onChange={(e) => void saveDefault(group, e.target.value)}
                style={input}
              >
                <option value="">Not set · {SERVER_DEFAULT[group]}</option>
                {optionsFor(group, defaults[group]).map((m) => (
                  <option key={m.id} value={m.value}>{optionLabel(m)}{m.enabled ? '' : ' (switched off)'}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {warnings.length > 0 && (
          <p style={{ color: 'var(--warn)', fontSize: 12, margin: '12px 0 0' }}>{warnings.join(' ')}</p>
        )}
        {msg?.where === 'defaults' && (
          <p style={{ color: 'var(--tx-2)', fontSize: 12, margin: '12px 0 0' }}>{msg.text}</p>
        )}
      </div>

      <div>
        <h3 style={{ fontSize: 13, color: 'var(--tx)', margin: '0 0 4px' }}>Client models</h3>
        <p style={{ color: 'var(--tx-3)', fontSize: 12, margin: '0 0 10px', lineHeight: 1.6 }}>
          An override applies to every agent of that client, including ones that kept an older model.
          Choose &ldquo;Platform default&rdquo; to remove it.
        </p>

        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…"
          style={{ ...input, maxWidth: 280, marginBottom: 12 }}
        />

        {msg?.where === 'clients' && (
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--tx-2)' }}>{msg.text}</p>
        )}

        <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ ...head, textAlign: 'left' }}>Client</th>
                <th style={{ ...head, textAlign: 'left' }}>AI model</th>
                <th style={{ ...head, textAlign: 'left' }}>Transcription</th>
                <th style={{ ...head, textAlign: 'right' }}>Agents</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ opacity: busy === c.id ? 0.5 : 1 }}>
                  <td style={cell}>
                    <div style={{ color: 'var(--tx)' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>{c.slug}</div>
                  </td>
                  {(['llm', 'stt'] as const).map((group) => (
                    <td key={group} style={cell}>
                      <select
                        value={c[group] ?? ''}
                        disabled={busy === c.id}
                        onChange={(e) => void saveClient(c, group, e.target.value)}
                        style={{ ...input, maxWidth: 240, padding: '6px 8px' }}
                      >
                        <option value="">Platform default · {defaultLabel(group)}</option>
                        {optionsFor(group, c[group]).map((m) => (
                          <option key={m.id} value={m.value}>{optionLabel(m)}{m.enabled ? '' : ' (switched off)'}</option>
                        ))}
                      </select>
                    </td>
                  ))}
                  <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ color: 'var(--tx)' }}>{c.agents}</div>
                    {c.agentsWithOwnModel > 0 && !c.llm && (
                      <div style={{ fontSize: 11, color: 'var(--tx-3)' }} title="Saved before models were assigned; they ignore the platform default until this client has an override.">
                        {c.agentsWithOwnModel} keep{c.agentsWithOwnModel === 1 ? 's' : ''} own AI model
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td style={{ ...cell, color: 'var(--tx-3)' }} colSpan={4}>
                    {q ? <>No clients match &quot;{q}&quot;.</> : 'No clients yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
