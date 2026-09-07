import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';

export default function DevDatabase() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Internal Engineering Documentation</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>4. Database</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        A complete guide to Spandan's Postgres database schemas, ORM specifications, connection pooling configurations, transactional ledger safety structures, and migration pathways.
      </p>

      {/* ── 4.1 DATABASE ARCHITECTURE ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.1 Database Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan utilizes <strong>PostgreSQL</strong>. Database interactions are managed by Prisma ORM. High-throughput connection requirements separate transactional traffic from structural migrations:
      </p>
      
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
  App[Node.js Express App / Workers] -->|API Queries via port 6543| PgBouncer[Supabase PgBouncer Pooler]
  PgBouncer -->|Pooled Connections| Postgres[(PostgreSQL DB)]
  CLI[Prisma Migrate / Dev Scripts] -->|Direct DDL via port 5432| Postgres`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This diagram displays the database connection architecture separating runtime application traffic from structural migrations. Express application processes and background workers execute queries through Supabase PgBouncer connection pooling on port 6543 to maintain high throughput, while Prisma migration scripts bypass the pooler via port 5432 for direct DDL execution.
      </p>

      {/* ── 4.2 CONNECTION & POOLING ARCHITECTURE ────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.2 Connection &amp; Pooling Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan enforces a separation between pooled and direct database access parameters:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>
          <strong>Runtime Connection:</strong> Environment variables inject a pooled connection URL (<code>DATABASE_URL</code>) targeting the database. This leverages PgBouncer in transaction mode to enable high-concurrency connection recycling without hitting database thread ceilings.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong>Direct Migration Connection:</strong> Standard DDL migrations require direct advisory lock controls. Deployments inject <code>DIRECT_URL</code> directly, bypassing PgBouncer to prevent transactional lock failures.
        </li>
      </ul>

      {/* ── 4.3 ENTITY RELATIONSHIP MODEL ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.3 Entity Relationship Model</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The schema maps structural tables representing tenancy, user authorization, campaign recipients, wallet debits, and voice compliance parameters. Multi-tenant isolation is enforced at the query layer via the parent <code>Workspace</code> ID.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>A. Core Entity Relationship Diagram</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Core models handling workspace tenancy, authentication, voice agents, outbound campaigns, call dispatches, and wallet balances:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`erDiagram
  User ||--o{ WorkspaceMember : "userId"
  Workspace ||--o{ WorkspaceMember : "workspaceId"
  Workspace ||--o{ Agent : "workspaceId"
  Workspace ||--o{ Campaign : "workspaceId"
  Campaign ||--o{ CampaignRecipient : "campaignId"
  Workspace ||--o{ Contact : "workspaceId"
  Workspace ||--o{ Wallet : "workspaceId"
  Wallet ||--o{ WalletTransaction : "walletId"
  Workspace ||--o{ CallLog : "workspaceId"`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This core ER diagram maps the primary business entities in `backend/prisma/schema.prisma`. Users possess memberships in Workspaces via `WorkspaceMember`, while Workspaces own Agents, Campaigns, Contacts, CallLogs, and Wallets. Campaigns dial `CampaignRecipient` records, while Wallet debits track individual `WalletTransaction` entries.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>B. Supporting & Integration Entity Relationship Diagram</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Supporting models managing API keys, third-party integrations, knowledge base embeddings, phone numbers, and broadcasts:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`erDiagram
  Workspace ||--o{ ApiKey : "workspaceId"
  Workspace ||--o{ KbFile : "workspaceId"
  KbFile ||--o{ KbChunk : "kbFileId"
  Workspace ||--o{ Integration : "workspaceId"
  Integration ||--o{ IntegrationLog : "integrationId"
  Integration ||--|| IntegrationToken : "integrationId"
  Workspace ||--o{ VoiceNumber : "workspaceId"
  Workspace ||--o{ Broadcast : "workspaceId"
  VoiceProvider ||--o{ Voice : "providerId"
  User ||--o{ RefreshToken : "userId"`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This secondary ER diagram maps supporting infrastructure models. Workspaces own developer `ApiKey` credentials, RAG `KbFile` documents (split into vector `KbChunk` rows), third-party `Integration` settings (with `IntegrationToken` ciphers and `IntegrationLog` records), provisioned `VoiceNumber` lines, and audio `Broadcast` dispatches.
      </p>

      {/* ── 4.3.1 DATABASE OPERATION FLOW ──────────────────────────────────── */}
      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 28, marginBottom: 12 }}>C. Database Operation Flow & Transaction Boundaries</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        How application requests access PostgreSQL through Prisma ORM and enforce atomic transaction boundaries for wallet debits and settlements:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
    Request[HTTP Request / Webhook / Call Hangup] --> Controller[Express Controller e.g. billing.controller.js / callFinalizer.js]
    Controller --> Service[Domain Service e.g. billing.service.js]
    
    subgraph Transaction Boundary [Prisma $transaction Atomic Block]
        Service --> TX[prisma.$transaction]
        TX --> ReadBalance[1. Check Wallet Balance & Idempotency Key]
        TX --> Deduct[2. Update Wallet Balance - amount]
        TX --> Ledger[3. Create WalletTransaction Record]
        TX --> CallLogUpdate[4. Update CallLog status = completed]
    end
    
    Transaction Boundary --> PrismaClient[Prisma Client Singleton config/prisma.js]
    PrismaClient -->|Port 6543 / 5432| Postgres[(PostgreSQL DB)]
    Postgres -->|Commit Result| Response[Controller Returns 200 OK / Finalized Session]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This operation flow diagram depicts how application handlers query PostgreSQL through Prisma ORM. Critical financial operations like call completion billing run inside an explicit `prisma.$transaction` block, ensuring that checking idempotency keys, updating wallet balances, writing ledger entries, and saving call logs succeed or roll back atomically.
      </p>

      {/* ── 4.4 COMPLETE TABLE INVENTORY ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.4 Complete Table Inventory</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Model</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Primary Key</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Workspace Scoped</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Important Relations</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>User</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Platform users, profiles, and credentials.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No (Global entity)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`WorkspaceMember`, `RefreshToken`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Workspace</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Multi-tenant workspace isolation partition.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Self (Root tenancy boundary)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`Agent`, `Campaign`, `Contact`, `Wallet`, `ApiKey`, `KbFile`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>WorkspaceMember</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Join table mapping user authorization role within workspace.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`User`, `Workspace`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Agent</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>AI voice assistants with configured prompts &amp; voice IDs.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`Workspace`, `DltVoiceTemplate`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Voice</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Voice model configuration for speech synthesis engines.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`VoiceProvider`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>VoiceProvider</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Voice provider engine configs (e.g. ElevenLabs, Cartesia).</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`Voice`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Campaign</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Outbound dialing runs, schedule metrics.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`Workspace`, `CampaignRecipient`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>CampaignRecipient</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Call recipient mappings containing dialed logs and statuses.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No (Scoped by Campaign)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`Campaign`, `Contact`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Contact</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>A person this workspace may call. Unique E.164 index.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`Workspace`, `CampaignRecipient`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>KbFile</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Uploaded grounding documents metadata.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`Workspace`, `KbChunk`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>KbChunk</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Sliced document text pieces holding 1536-dim PGVector embeddings.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`KbFile`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Wallet</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Logical balance monitor for workspace billing credits.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes (1:1 with Workspace)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`Workspace`, `WalletTransaction`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>WalletTransaction</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Append-only ledger record of money movement.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No (Scoped by Wallet)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`Wallet`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>AgentCallLog</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Call records log, transcript data JSON, and billing metrics.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>None</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>ApiKey</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Hashed authentication keys issued for external API access.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`Workspace`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Integration</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Holds connection statuses for HubSpot, Salesforce, Slack etc.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`Workspace`, `IntegrationLog`, `IntegrationToken`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>AuditLog</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Append-only admin actions log trace. Keep after user deletion.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (CUID)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No (System level)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>None</td>
          </tr>
        </tbody>
      </table>

      {/* ── 4.5 DETAILED MODEL REFERENCE ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.5 Detailed Model Specifications</h2>

      {/* User */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: User</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Represents platform users, password hashes, Google authentication links, and billing plan hierarchies.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`id`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>cuid()</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Primary Key</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`email`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>User email for login validation</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`passwordHash`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String?</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Bcrypt password hash string</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`googleId`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String?</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Linked Google OAuth profile ID</td>
          </tr>
        </tbody>
      </table>

      {/* Workspace */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: Workspace</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Root tenant record managing logical partitioning boundaries across calling lines, databases, campaigns, and tokens.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`id`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>cuid()</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Primary Key</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`name`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Display workspace name</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`slug`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>URL friendly slug identifier</td>
          </tr>
        </tbody>
      </table>

      {/* WorkspaceMember */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: WorkspaceMember</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Maps User to Workspace with assigned permissions role.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`userId`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Links to User</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`workspaceId`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Links to Workspace</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`role`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>"Member"</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Membership role (e.g. Owner, Member)</td>
          </tr>
        </tbody>
      </table>

      {/* Agent */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: Agent</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Defines the persona rules, welcome messages, AI model choice, dynamic pacing options, and DLT voice template configurations.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`id`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>cuid()</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Primary Key</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`workspaceId`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Workspace foreign key</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`welcomeMessage`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Greeting spoken on call connect</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`aiModel`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>LLM identifier (e.g. gemini-1.5-flash)</td>
          </tr>
        </tbody>
      </table>

      {/* Voice */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: Voice</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Declares individual synthesised voice configurations mapping back to specific providers.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`providerId`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Links to VoiceProvider</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`providerVoiceId`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Voice identifier on host provider API</td>
          </tr>
        </tbody>
      </table>

      {/* VoiceProvider */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: VoiceProvider</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Reference voice engines provider table.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`name`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Provider name key (e.g. elevenlabs, cartesia)</td>
          </tr>
        </tbody>
      </table>

      {/* Campaign */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: Campaign</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Carries parameters for bulk outbound voice campaigns.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`workspaceId`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Links to Workspace tenancy</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`status`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>"DRAFT"</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>DRAFT | SCHEDULED | RUNNING | COMPLETED</td>
          </tr>
        </tbody>
      </table>

      {/* CampaignRecipient */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: CampaignRecipient</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Tracks call attempt counts and dial status for campaigns.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`campaignId`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Campaign parent ID</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`phoneNumber`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String?</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Dialed number string</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`status`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>"pending"</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>pending | calling | answered | failed</td>
          </tr>
        </tbody>
      </table>

      {/* Contact */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: Contact</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Individual workspace contacts database record normalized to E.164 phone formats.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`workspaceId`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Workspace parent ID</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`phoneNumber`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Normalised E.164 phone string</td>
          </tr>
        </tbody>
      </table>

      {/* KbFile */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: KbFile</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Grounding file uploads storage metadata.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`workspaceId`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Workspace parent ID</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`fileName`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Original file name</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`status`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>"ready"</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>ready | pending | processing | failed</td>
          </tr>
        </tbody>
      </table>

      {/* KbChunk */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: KbChunk</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Document segments holding OpenAI text embedding vectors.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`kbFileId`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Parent KbFile reference</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`content`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Extracted plain text chunk</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`embedding`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>Unsupported("vector(1536)")?</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>pgvector 1536 dimension vector</td>
          </tr>
        </tbody>
      </table>

      {/* Wallet */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: Wallet</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Manages billing balance credits for tenants.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`workspaceId`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Owner workspace linkage</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`balanceCents`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>Int</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>0</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Current wallet balance minor units (Paise)</td>
          </tr>
        </tbody>
      </table>

      {/* WalletTransaction */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: WalletTransaction</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Prepaid append-only ledger transaction record.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`walletId`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Parent Wallet reference</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`amountCents`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>Int</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Transaction value (positive credit, negative debit)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`idempotencyKey`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String?</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Idempotency guard key (e.g. call:log_id)</td>
          </tr>
        </tbody>
      </table>

      {/* AgentCallLog */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: AgentCallLog</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Tracks history, JSON conversation text transcripts, and cost breakdowns of every user-agent interaction.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`id`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>cuid()</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Primary Key</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`transcript`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>"[]"</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>JSON string carrying turn history</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`billingStatus`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>"PENDING"</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>PENDING | BILLED | SKIPPED | FAILED</td>
          </tr>
        </tbody>
      </table>

      {/* ApiKey */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: ApiKey</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Stores hashes and prefixes of API authentication tokens generated by workspaces.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`keyHash`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>SHA-256 hashed api token</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`keyPrefix`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Key visual prefix shown to user</td>
          </tr>
        </tbody>
      </table>

      {/* Integration */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: Integration</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Workspace connectors metadata to manage external systems.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`provider`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>CRM/sheets name key (e.g. hubspot)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`status`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>"disconnected"</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>connected | disconnected | error</td>
          </tr>
        </tbody>
      </table>

      {/* AuditLog */}
      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24 }}>Model: AuditLog</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Append-only record logging mutating console actions taken by platform operators.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Unique</th>
            <th style={{ padding: '8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`actorEmail`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String?</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Denormalized email of actor</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>`action`</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>String</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>-</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>Action dotted verb (e.g. user.ban)</td>
          </tr>
        </tbody>
      </table>

      {/* ── 4.6 RELATIONSHIPS & REFERENTIAL INTEGRITY ────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.6 Relationships &amp; Referential Integrity</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Referential integrity is maintained via foreign key mappings declared in the Prisma schema. Cascading deletions are enforced at the database level so that deleting a <code>Workspace</code> removes all child models (e.g. <code>Agent</code>, <code>Campaign</code>, <code>Contact</code>). Links to static entities use <code>onDelete: SetNull</code> to prevent orphaned constraints from breaking logging.
      </p>

      {/* ── 4.7 PRIMARY KEYS, CONSTRAINTS & INDEXES ──────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.7 Primary Keys, Constraints &amp; Indexes</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan creates unique constraints and multi-column composite indexes on fields commonly used in search criteria to avoid sequential table scans. For example:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><code>@@unique([providerId, providerVoiceId])</code> inside model <code>Voice</code> to prevent duplicate provider voice models imports.</li>
        <li style={{ marginBottom: 6 }}><code>@@index([workspaceId, status])</code> inside model <code>Contact</code> to optimize list filtering.</li>
        <li style={{ marginBottom: 6 }}><code>@@index([billingStatus, endedAt])</code> inside model <code>AgentCallLog</code> for fast unpaid log queries.</li>
      </ul>

      {/* ── 4.8 TRANSACTIONS & ATOMICITY ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.8 Transactions &amp; Atomicity</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Atomicity is enforced using Prisma's transactional wrapper (<code>prisma.$transaction</code>). If any nested operation fails, the database rolls back changes to prevent incomplete updates. Key database transaction boundaries include wallet balance modifications and auto-renewals. Workspace onboarding was not verified to run inside a single transaction boundary in the current codebase.
      </p>

      {/* ── 4.9 WALLET & LEDGER INTEGRITY ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.9 Wallet &amp; Ledger Integrity</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        All mutations to <code>Wallet.balanceCents</code> must execute inside a transaction wrapping <code>applyWalletTransaction</code>. To prevent race conditions and lock timeouts during concurrent calls:
      </p>
      
      <DocsCallout type="important" title="LEDGER UPDATE INTEGRITY">
        To prevent double-spend or duplicate charging webhooks, transactions inject a unique `idempotencyKey` inside `WalletTransaction` tables. Prisma transaction rollback is triggered automatically if the computed balance drops below authorized overdraft parameters.
      </DocsCallout>

      <ol style={{ listStyleType: 'decimal', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>The system resolves the wallet record using <code>getOrCreateWallet(workspaceId)</code> outside the transaction.</li>
        <li style={{ marginBottom: 6 }}>Inside <code>prisma.$transaction</code>, the update executes as a single SQL query lock operation:
          <pre style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 6, marginTop: 4 }}>
{`UPDATE "Wallet"
   SET "balanceCents" = "balanceCents" + $2,
       "lowBalanceNotifiedAt" = CASE WHEN $2 > 0 THEN NULL ELSE "lowBalanceNotifiedAt" END,
       "updatedAt" = NOW()
 WHERE "id" = $1
   AND ($3::boolean OR $2 > 0 OR "balanceCents" + $2 >= -"overdraftLimitCents")`}
          </pre>
        </li>
        <li style={{ marginBottom: 6 }}>If the wallet has insufficient funds, the database returns zero updated rows, raising an exception that rolls back all transaction steps.</li>
        <li style={{ marginBottom: 6 }}>A matching ledger entry is created in <code>WalletTransaction</code>. The table enforces a unique constraint on <code>idempotencyKey</code> to prevent double charging from repeated webhooks or call-end retries.</li>
      </ol>

      {/* ── 4.10 KNOWLEDGE BASE & VECTOR STORAGE ─────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.10 Knowledge Base &amp; Vector Storage</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Knowledge base documents are chunked and stored in the <code>KbChunk</code> table. To store embeddings, the database uses the PostgreSQL <code>pgvector</code> extension:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>
          <strong>Vector Dimension:</strong> The <code>embedding</code> column is configured as <code>Unsupported("vector(1536)")</code> in the Prisma schema. This matches Gemini's gemini-embedding-001 with output_dimensionality=1536 and OpenAI text-embedding-3-small's default width.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong>Retrieval Search:</strong> Cosine similarity checks are performed using raw SQL commands:
          <pre style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 6, marginTop: 4 }}>
{`SELECT "id", "content", "embedding" <=> $1::vector AS distance
  FROM "KbChunk"
 WHERE "workspaceId" = $2 AND "agentId" = $3
 ORDER BY distance ASC LIMIT $4`}
          </pre>
        </li>
      </ul>

      {/* ── 4.11 DATABASE MIGRATIONS ─────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.11 Database Migrations</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Migrations are managed using standard Prisma tools. Deployment scripts run <code>prisma migrate deploy</code> in production.
      </p>
      
      <DocsCallout type="warning" title="MIGRATIONS AND ADVISORY LOCKS">
        PgBouncer running in transaction pooling mode blocks PostgreSQL session-level advisory locks. Ensure you set the `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` environment variable when running migrations during production deployment.
      </DocsCallout>

      {/* ── 4.12 DATABASE LIFECYCLE & CLEANUP ────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.12 Database Lifecycle &amp; Cleanup</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Cleanups are managed through background services:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>
          <strong>Recording Retention:</strong> The <code>recordingRetention.service.js</code> script sweeps the database periodically (every 6 hours as defined by `RECORDING_RETENTION_SWEEP_INTERVAL_MS`), unlinking expired audio files from disk and nullifying <code>recordingPath</code> and <code>recordingMime</code> fields in the database while leaving the log rows intact.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong>Knowledge Base Deletions:</strong> Deleting a <code>KbFile</code> triggers a cascading delete that removes all associated <code>KbChunk</code> records.
        </li>
      </ul>

      {/* ── 4.13 FAILURE MODES & RECOVERY ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.13 Failure Modes &amp; Recovery</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Failure Scenario</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Detection Event</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Likely Cause</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Recovery Mechanism</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Unique constraint error</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Prisma client throws P2002</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Double billing webhook or duplicate event</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Catch block detects the duplicate error and returns success without updating the database.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Database connection failure</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>P2021 / P2022 exceptions</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Missing migrations or PgBouncer exhaustion</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Pino logs warning. Reconnect attempts are handled natively by the Prisma engine rather than a custom app-level loop.</td>
          </tr>
        </tbody>
      </table>

      {/* ── 4.14 DATABASE TROUBLESHOOTING ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.14 Database Troubleshooting</h2>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 8 }}>
          <strong>Missing tables error (`P2021` / `500`):</strong> Run <code>npm run db:push</code> or <code>npm run db:migrate</code> to apply missing schemas.
        </li>
        <li style={{ marginBottom: 8 }}>
          <strong>Supabase Advisory Lock Timeout:</strong> Ensure the migration deploy wrapper sets <code>PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1</code>.
        </li>
      </ul>

      {/* ── 4.15 DATABASE ENGINEERING REFERENCE ──────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>4.15 Database Engineering Reference</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Responsibility</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source Location</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Commands / Tools</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Prisma Client Singleton</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>[`backend/src/config/prisma.js`](file:///backend/src/config/prisma.js)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Singleton export imports</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Migration deployer script</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>[`backend/scripts/prisma-migrate-deploy.js`](file:///backend/scripts/prisma-migrate-deploy.js)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`npm run db:migrate:prod`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Billing transactional balance update</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>[`backend/src/services/billing/wallet.service.js`](file:///backend/src/services/billing/wallet.service.js)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>applyWalletTransaction</code></td>
          </tr>
        </tbody>
      </table>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/backend" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Backend
        </Link>
        <Link to="/docs/developer/queues-workers" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Queues &amp; Workers →
        </Link>
      </div>
    </div>
  );
}
