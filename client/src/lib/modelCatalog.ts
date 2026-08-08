/**
 * The models this platform currently offers.
 *
 * Super Admin → Models decides what is in here; nothing client-side does. Every
 * model picker in the product (AI Model, Transcription, Voice, Conversational
 * Agent) renders from this rather than from its own hardcoded list, so turning
 * a model off in the admin panel removes it everywhere at once.
 *
 * Hiding a control is not access control — the backend refuses a disabled model
 * on save regardless of what the UI showed. This exists so a client is never
 * offered something they'll be refused.
 */
import { getAuth } from '@/lib/authStorage';

const API_BASE = '/api/v1';

export interface CatalogEntry {
  /** What gets stored on the agent for this entry. */
  value: string;
  /** What the client is shown. */
  label: string;
  provider: string;
}

export interface ModelCatalog {
  conversational: CatalogEntry[];
  llm: CatalogEntry[];
  stt: CatalogEntry[];
  tts: CatalogEntry[];
}

const EMPTY: ModelCatalog = { conversational: [], llm: [], stt: [], tts: [] };

// The catalogue changes only when an admin edits it, and several pickers on one
// screen each want it. Cache the in-flight promise so opening three modals
// issues one request, and re-fetch on the next mount rather than holding state
// that could go stale for the life of the tab.
let inflight: Promise<ModelCatalog> | null = null;

export async function fetchModelCatalog(): Promise<ModelCatalog> {
  if (inflight) return inflight;

  inflight = (async () => {
    const { token, workspaceId } = getAuth();
    const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/model-catalog`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Failed to load available models (${res.status})`);
    const data = await res.json();
    return { ...EMPTY, ...data } as ModelCatalog;
  })();

  try {
    return await inflight;
  } finally {
    // Clear regardless of outcome: a failed load must not be cached as the
    // answer, and a successful one is re-read next time a picker mounts.
    inflight = null;
  }
}

/** Filter a hardcoded option list down to what the platform allows. */
export function allowedOnly<T>(
  options: T[],
  catalog: ModelCatalog | null,
  group: keyof ModelCatalog,
  valueOf: (option: T) => string,
): T[] {
  // Until the catalogue has loaded, show nothing rather than briefly offering
  // models that may be disabled — the pickers render a loading state instead.
  if (!catalog) return [];
  const allowed = new Set(catalog[group].map((m) => m.value.toLowerCase()));
  return options.filter((o) => allowed.has(valueOf(o).toLowerCase()));
}
