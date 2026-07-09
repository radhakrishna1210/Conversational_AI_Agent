/* ─── shared types used across all playground components ──────────────── */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface PlaygroundConfig {
  agentName: string;
  templateId: string;
  voice: string;
  language: string;
  welcomeMessage: string;
  accentColor: string;
}
