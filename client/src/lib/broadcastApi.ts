/**
 * Voice broadcast — the client's view of the API.
 *
 * Types and calls live together here rather than being restated in each
 * component, because three views (the wizard, the list, the detail drawer) read
 * the same objects and a broadcast's numbers are money: `spentCents` drifting
 * out of step with what the server means by it is not a rendering bug.
 */
import { whapi } from './whapi';
import { getAuth } from './authStorage';

export type RecordingSource = 'UPLOAD' | 'TTS';

export type BroadcastRecording = {
  id: string;
  name: string;
  source: RecordingSource;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  scriptText?: string | null;
  voiceId?: string | null;
  status: string;
  createdAt: string;
};

export type BroadcastStatus =
  | 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'FAILED';

export type Broadcast = {
  id: string;
  name: string;
  recordingId: string;
  recording?: Pick<BroadcastRecording, 'id' | 'name' | 'durationSec' | 'source'>;
  clusterIds?: string[] | null;
  fromNumbers?: string[] | null;
  fromNumber?: string | null;
  repeatCount: number;
  status: BroadcastStatus;
  scheduledAt?: string | null;
  launchedAt?: string | null;
  completedAt?: string | null;
  lastError?: string | null;
  progress: number;
  totalRecipients: number;
  answered: number;
  failed: number;
  spentCents: number;
  createdAt: string;
};

export type BroadcastRecipient = {
  id: string;
  phoneNumber: string;
  status: 'pending' | 'calling' | 'answered' | 'no_answer' | 'failed' | 'skipped';
  attempts: number;
  fromNumber?: string | null;
  provider?: string | null;
  durationSec: number;
  billedCents: number;
  failureReason?: string | null;
  startedAt?: string | null;
  answeredAt?: string | null;
  contact?: { name?: string | null } | null;
};

/**
 * The cost answer, as a range.
 *
 * `maximumCents` assumes every dial connects and plays in full — the figure the
 * wallet has to be able to absorb. `typicalCents` applies a pickup rate. Showing
 * only one of them is how a broadcast either looks unaffordable or empties a
 * wallet mid-send.
 */
export type BroadcastEstimate = {
  recipients: number;
  secondsPerCall: number;
  ratePerMinuteCents: number;
  perCallCents: number;
  maximumCents: number;
  typicalCents: number;
  pickupRate: number;
  recordingSec: number;
  repeatCount: number;
};

export type CallerReadiness = {
  ready: boolean;
  numbers: { fromNumber: string; ready: boolean; error?: string; provider?: string }[];
};

export type BroadcastStats = {
  broadcast: Broadcast;
  breakdown: { status: string; _count: { status: number } }[];
  billing: { billedCalls: number; billedCents: number; billedSeconds: number };
};

// ── Recordings ──────────────────────────────────────────────────────────────

export const listRecordings = () =>
  whapi.get<BroadcastRecording[]>('/broadcast-recordings');

export const uploadRecording = (file: File | Blob, name: string, durationSec: number) => {
  const form = new FormData();
  form.append('file', file, file instanceof File ? file.name : `${name || 'recording'}.wav`);
  form.append('name', name);
  // The browser has already decoded this file, so it knows the duration exactly.
  // The server parses the header itself and takes the longer of the two — see
  // audioDuration.js — so this is a cross-check, not a claim it has to trust.
  form.append('durationSec', String(Math.ceil(durationSec)));
  return whapi.postForm<BroadcastRecording>('/broadcast-recordings/upload', form);
};

export const synthesizeRecording = (body: { name?: string; text: string; voiceId: string }) =>
  whapi.post<BroadcastRecording>('/broadcast-recordings/synthesize', body);

export const deleteRecording = (id: string) =>
  whapi.delete<{ deleted: boolean }>(`/broadcast-recordings/${id}`);

/**
 * Playback for the console, as an object URL.
 *
 * An <audio src> issues its own request and cannot carry an Authorization
 * header, so the bytes are fetched here with the session token and handed to the
 * element as a blob: URL. The alternative — a second token on the query string —
 * would mean inventing a public read path for audio the operator is already
 * authenticated to hear. The carrier's path is separate and HMAC-signed.
 *
 * Callers must URL.revokeObjectURL() when the player goes away.
 */
export async function recordingObjectUrl(id: string): Promise<string> {
  const { token, workspaceId } = getAuth();
  const res = await fetch(
    `/api/v1/workspaces/${workspaceId}/broadcast-recordings/${id}/audio`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!res.ok) throw new Error('Could not load that recording');
  return URL.createObjectURL(await res.blob());
}

// ── Broadcasts ──────────────────────────────────────────────────────────────

export const listBroadcasts = () => whapi.get<Broadcast[]>('/broadcasts');

export const getBroadcastStats = (id: string) =>
  whapi.get<BroadcastStats>(`/broadcasts/${id}/stats`);

export const listRecipients = (id: string, status?: string) =>
  whapi.get<BroadcastRecipient[]>(
    `/broadcasts/${id}/recipients${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  );

export const createBroadcast = (body: {
  name: string;
  recordingId: string;
  clusterIds: string[];
  fromNumbers: string[];
  repeatCount: number;
}) => whapi.post<Broadcast>('/broadcasts', body);

export const startBroadcast = (id: string) => whapi.post<Broadcast>(`/broadcasts/${id}/start`, {});
export const launchBroadcast = (id: string, scheduledAt?: string) =>
  whapi.post<Broadcast>(`/broadcasts/${id}/launch`, scheduledAt ? { scheduledAt } : {});
export const pauseBroadcast = (id: string) => whapi.post<Broadcast>(`/broadcasts/${id}/pause`, {});
export const cancelBroadcast = (id: string) => whapi.post<Broadcast>(`/broadcasts/${id}/cancel`, {});
export const syncBroadcastList = (id: string) => whapi.post<Broadcast & { added: number }>(`/broadcasts/${id}/sync-list`, {});
export const deleteBroadcast = (id: string) => whapi.delete<{ deleted: boolean }>(`/broadcasts/${id}`);

export const estimateBroadcast = (params: {
  recordingId: string; clusterIds: string[]; repeatCount: number;
}) => {
  const qs = new URLSearchParams({
    recordingId: params.recordingId,
    clusterIds: JSON.stringify(params.clusterIds),
    repeatCount: String(params.repeatCount),
  });
  return whapi.get<BroadcastEstimate>(`/broadcasts/estimate?${qs.toString()}`);
};

export const checkCallerReadiness = (fromNumbers: string[]) =>
  whapi.get<CallerReadiness>(
    `/broadcasts/caller-readiness?fromNumbers=${encodeURIComponent(JSON.stringify(fromNumbers))}`,
  );

export const getBroadcastRate = () =>
  whapi.get<{ perMinuteInr: number; ratePerMinuteCents: number }>('/broadcasts/rate');

// ── Formatting ──────────────────────────────────────────────────────────────

/** Money arrives as integer paise. Never format it as a float mid-flight. */
export const rupees = (cents: number) =>
  `₹${(cents / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
