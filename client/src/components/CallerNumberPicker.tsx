import { useEffect, useRef, useState } from 'react';
import { whapi } from '../lib/whapi';

// FEATURE: caller-number picker for outbound calls.
// Option 1: pick from the list (Twilio-owned + already-verified own numbers).
// Option 2: add YOUR OWN number — Twilio calls it, you enter the 6-digit code
// shown on screen; once verified it becomes the call's From number.
// "Learn more" opens the Airtel verified-business-calling guide (anti-spam).

interface NumberOpt { phoneNumber: string; label: string; source: 'twilio' | 'own' }

export default function CallerNumberPicker({ value, onChange }: { value: string; onChange: (from: string) => void }) {
  const [mode, setMode] = useState<'list' | 'own'>('list');
  const [owned, setOwned] = useState<NumberOpt[]>([]);
  const [verified, setVerified] = useState<NumberOpt[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // add-own state
  const [ownNumber, setOwnNumber] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'calling' | 'verified' | 'failed'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = () =>
    whapi.get<{ owned: NumberOpt[]; verified: NumberOpt[] }>('/caller-numbers')
      .then((r) => { setOwned(r.owned ?? []); setVerified(r.verified ?? []); setLoadErr(null); })
      .catch((e) => setLoadErr(e instanceof Error ? e.message : 'Failed to load numbers'));

  useEffect(() => { load(); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const startVerify = async () => {
    setErr(null); setCode(null);
    const num = ownNumber.trim();
    if (!/^\+\d{8,15}$/.test(num)) { setErr('Use E.164 format, e.g. +919876543210'); return; }
    try {
      const r = await whapi.post<{ validationCode: string }>('/caller-numbers/verify', { phoneNumber: num, label: 'My number' });
      setCode(r.validationCode);
      setPhase('calling');
      let tries = 0;
      pollRef.current = setInterval(async () => {
        tries++;
        try {
          const s = await whapi.get<{ verified: boolean }>(`/caller-numbers/verify/status?phoneNumber=${encodeURIComponent(num)}`);
          if (s.verified) {
            clearInterval(pollRef.current!);
            setPhase('verified');
            onChange(num);
            load();
          } else if (tries > 24) { // ~2 min
            clearInterval(pollRef.current!);
            setPhase('failed');
          }
        } catch { /* keep polling */ }
      }, 5000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Verification failed to start');
    }
  };

  const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10 };
  const radio = (m: 'list' | 'own', title: string, sub: string) => (
    <label style={{ ...box, display: 'flex', gap: 10, cursor: 'pointer', borderColor: mode === m ? 'var(--teal)' : 'var(--border)' }}>
      <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
      <span>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>
      </span>
    </label>
  );

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Call from</div>
      {radio('list', 'Select a number from the list', 'Platform numbers and your already-verified numbers')}
      {radio('own', 'Add your own number', 'Verify once via an automated call, then calls show YOUR number')}

      {loadErr && <div style={{ color: '#fca5a5', fontSize: 12.5, marginBottom: 8 }}>{loadErr}</div>}

      {mode === 'list' && (
        <select value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }}>
          <option value="">Default platform number</option>
          {owned.map((n) => <option key={n.phoneNumber} value={n.phoneNumber}>{n.phoneNumber} — {n.label} (platform)</option>)}
          {verified.map((n) => <option key={n.phoneNumber} value={n.phoneNumber}>{n.phoneNumber} — {n.label} (your number ✓)</option>)}
        </select>
      )}

      {mode === 'own' && (
        <div style={box}>
          {phase !== 'verified' && (
            <>
              <input value={ownNumber} onChange={(e) => setOwnNumber(e.target.value)} placeholder="+919876543210"
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, marginBottom: 8 }} />
              <button onClick={startVerify} disabled={phase === 'calling'}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--teal)', background: 'transparent', color: 'var(--teal)', cursor: 'pointer', fontSize: 13 }}>
                {phase === 'calling' ? 'Waiting for you to answer…' : 'Verify this number'}
              </button>
            </>
          )}
          {code && phase === 'calling' && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              📞 We're calling <b>{ownNumber}</b> now. Answer and type this code on your keypad:
              <div style={{ fontSize: 26, letterSpacing: 8, fontWeight: 800, color: 'var(--teal)', margin: '6px 0' }}>{code}</div>
              This screen updates automatically once verified.
            </div>
          )}
          {phase === 'verified' && <div style={{ color: '#4ade80', fontSize: 13.5 }}>✅ {ownNumber} verified — it's now selected as your caller ID.</div>}
          {phase === 'failed' && <div style={{ color: '#fca5a5', fontSize: 13 }}>Verification timed out. Try again — answer the call and enter the code promptly.</div>}
          {err && <div style={{ color: '#fca5a5', fontSize: 12.5, marginTop: 6 }}>{err}</div>}

          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            ⚠️ <b>Avoid being marked spam on Airtel/Indian networks:</b> verification lets calls show your number, but carriers may
            still flag high-volume AI calls. Get your number <b>Airtel-authorised</b> (DLT registration + Business Name Display) so
            recipients see your <b>company name with a verified badge</b> instead of "Spam likely".{' '}
            <a href="/airtel-verified-calling" target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>Step-by-step guide →</a>
          </div>
        </div>
      )}
    </div>
  );
}
