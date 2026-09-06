import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';

export default function DevQueuesWorkers() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Internal Engineering Documentation</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>5. Queues &amp; Workers</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        This page details Spandan's Redis connection architecture, BullMQ queues, worker processes, Node worker thread pools, and background schedulers.
      </p>

      <DocsCallout type="note" title="EVENT LOOP SAFETY">
        Campaign voice dispatches and Knowledge Base document extraction are delegated to BullMQ and Node worker threads respectively to prevent blocking Spandan's main thread, preserving the low-latency WebSocket call streams.
      </DocsCallout>

      {/* ── 5.1 OVERVIEW ─────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.1 Overview</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan implements asynchronous processing to offload time-consuming tasks from the main HTTP and WebSocket thread boundaries. Paid voice campaign dispatches and large Knowledge Base document parsing/extraction jobs must run asynchronously to prevent event loop delays, audio packet drops, or barge-in latency checks on concurrent live calls.
      </p>


      {/* ── 5.2 ASYNCHRONOUS PROCESSING ARCHITECTURE ─────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.2 Asynchronous Queue &amp; Worker Flow Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan's outbound queue pipeline produces, serializes, polls, and executes asynchronous campaign jobs:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
  Producer[Producer: campaign.queue.js enqueueCampaign] -->|Push Job payload| Queue[BullMQ Queue: campaign-dispatch]
  Queue -->|Serialize JSON metadata| Redis[(Redis Database)]
  Redis -->|Poll pending jobs| Worker[Worker: campaign.worker.js]
  Worker -->|Invoke runner| Runner[Service: campaignRunner.service.js]
  Runner -->|Outbound REST call| Provider[Telephony Provider: Twilio / Plivo]
  Provider -->|Call status update| Result[Result: Save CallLog & Update Campaign Progress]
  Result --> DB[(PostgreSQL Database)]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This flow diagram illustrates the end-to-end processing pipeline for queued campaign jobs. `campaign.queue.js` serializes job payloads into Redis BullMQ queue `campaign-dispatch`. The `campaign.worker.js` thread pops jobs asynchronously, executes dialing batches via `campaignRunner.service.js`, initiates telephony calls, and records execution metrics back to PostgreSQL.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>Retry &amp; Failure Backoff Path</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        When job execution fails (e.g. rate limit or database timeout), BullMQ applies exponential backoff based on configuration:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
    Job[Job Dispatched to Worker] --> Attempt{Execute Attempt 1, 2, or 3}
    Attempt -->|Success| Complete[Mark Job Completed & Update Progress]
    Attempt -->|Error / Exception| CheckRetry{Attempts < 3?}
    CheckRetry -->|Yes| Backoff[Exponential Backoff Delay: 5000ms * 2^attempt]
    Backoff --> Attempt
    CheckRetry -->|No: Max Attempts Exceeded| Failed[Mark Campaign Status = FAILED]
    Failed --> LogError[Save lastError in Campaign Record DB]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This failure handling diagram maps BullMQ's automatic retry logic configured in `campaign.queue.js` (`attempts: 3`, <code>backoff: &#123; type: 'exponential', delay: 5000 &#125;</code>). Failed job attempts trigger exponential backoff delays before re-executing. If all three attempts fail, the worker catches the error, marks the campaign status as `FAILED`, and logs the error in PostgreSQL.
      </p>


      {/* ── 5.3 REDIS ARCHITECTURE ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.3 Redis Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Redis is used as the backing store for BullMQ job metadata and task coordination. It is configured in [`backend/src/config/redis.js`](file:///backend/src/config/redis.js) using the `ioredis` client library. The server reads the connection endpoint from the `REDIS_URL` environment variable.
      </p>

      <DocsCallout type="warning" title="BULLMQ REDIS OPTION CONSTRAINT">
        When initializing the Redis connection for BullMQ queues and workers, you must set `maxRetriesPerRequest: null`. If this is omitted or configured as a non-null integer value, the BullMQ connection manager will throw errors and halt background job polling.
      </DocsCallout>


      {/* ── 5.4 REDIS CONNECTION MANAGEMENT ──────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.4 Redis Connection Management</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The backend establishes two connections: a singleton connection (<code>redis</code>) for standard operations, and a dedicated connection client config (<code>bullConnection</code>) for BullMQ to handle queue interactions:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>
          <strong>Option configuration:</strong> <code>maxRetriesPerRequest: null</code> is explicitly set, as required by BullMQ to prevent request timing errors during backoffs.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong>Fallback handler:</strong> If a connection failure occurs, the retry strategy falls back to memory mode after 3 attempts to prevent thread blockages.
        </li>
      </ul>


      {/* ── 5.5 BULLMQ ARCHITECTURE ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.5 BullMQ Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The system relies on BullMQ's <code>Queue</code> and <code>Worker</code> classes to write, store, and process background tasks in Redis.
      </p>


      {/* ── 5.6 QUEUE PRODUCER ARCHITECTURE ──────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.6 Queue Producer Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Jobs are added to queues by calling enqueue helper functions. The campaign scheduler calls <code>enqueueCampaign</code> to add tasks to the queue:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`export const enqueueCampaign = (campaignId, workspaceId, delay = 0) => {
  if (!campaignQueue) return null;
  return campaignQueue.add('dispatch', { campaignId, workspaceId }, {
    delay,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
};`}
        </code>
      </pre>


      {/* ── 5.7 QUEUE CONSUMER ARCHITECTURE ──────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.7 Queue Consumer Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Workers poll Redis for pending jobs. When a worker retrieves a task, it passes the payload to a processing function (such as <code>processCampaign</code>) and routes errors to logging instances.
      </p>


      {/* ── 5.8 QUEUE INVENTORY ──────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.8 Queue Inventory</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Queue</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Producer Source</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Consumer Worker</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Job Name</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Default Retries</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>`campaign-dispatch`</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`campaign.queue.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`campaign.worker.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`dispatch`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>3 (exponential)</td>
          </tr>
        </tbody>
      </table>


      {/* ── 5.9 CAMPAIGN DISPATCH QUEUE ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.9 Campaign Dispatch Queue</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The campaign dispatch queue processes bulk voice broadcast calls asynchronously. It maps jobs through BullMQ to process batches of recipients without blocking HTTP routing processes.
      </p>


      {/* ── 5.10 CAMPAIGN JOB LIFECYCLE ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.10 Campaign Job Lifecycle</h2>
      <ol style={{ listStyleType: 'decimal', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>Campaign dispatch is triggered via the console API.</li>
        <li style={{ marginBottom: 6 }}>A job payload is enqueued into the <code>campaign-dispatch</code> BullMQ instance.</li>
        <li style={{ marginBottom: 6 }}>The campaign worker retrieves the job and calls the campaign runner service.</li>
        <li style={{ marginBottom: 6 }}>The campaign runner iterates over recipients and initiates outbound telephony calls.</li>
        <li style={{ marginBottom: 6 }}>Call logs are updated in the database when the job completes.</li>
      </ol>


      {/* ── 5.11 JOB PAYLOADS ────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.11 Job Payloads</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The <code>dispatch</code> job payload schema contains the following fields:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><code>campaignId</code>: Unique database UUID of the target campaign.</li>
        <li style={{ marginBottom: 6 }}><code>workspaceId</code>: Workspace owner tenant boundary.</li>
      </ul>


      {/* ── 5.12 WORKER EXECUTION FLOW ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.12 Worker Execution Flow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The campaign worker execution path calls <code>runCampaign</code> inside <code>backend/src/services/campaignRunner.service.js</code>:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`const processCampaign = async (job) => {
  const { campaignId, workspaceId } = job.data;
  logger.info({ campaignId }, 'Campaign worker: processing');
  await runCampaign(campaignId, workspaceId);
};`}
        </code>
      </pre>


      {/* ── 5.13 WORKER CONCURRENCY ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.13 Worker Concurrency</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Worker concurrency is configured using the <code>CAMPAIGN_WORKER_CONCURRENCY</code> environment variable, which defaults to <code>2</code>.
      </p>


      {/* ── 5.14 RETRY & BACKOFF BEHAVIOUR ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.14 Retry &amp; Backoff Behaviour</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        If a job fails, the queue attempts to process it up to 3 times. It uses an exponential backoff strategy with a starting delay of 5000 ms (defined by <code>JOB_BACKOFF_DELAY_MS</code>).
      </p>


      {/* ── 5.15 JOB FAILURE HANDLING ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.15 Job Failure Handling</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Failed jobs are logged by the worker error listener. Jobs that exceed the retry limit are marked as failed in Redis, and their final state is logged for manual troubleshooting.
      </p>


      {/* ── 5.16 JOB COMPLETION & CLEANUP ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.16 Job Completion &amp; Cleanup</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Completed jobs are kept in Redis to allow developers to inspect task metadata. Old job records are cleared periodically to manage Redis memory usage.
      </p>


      {/* ── 5.17 QUEUE IDEMPOTENCY ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.17 Queue Idempotency</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The system does not enforce idempotency keys at the queue layer. Instead, it relies on database-level status checks (such as verifying a campaign is not already active) to prevent duplicate execution.
      </p>


      {/* ── 5.18 WORKER STARTUP & SHUTDOWN ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.18 Worker Startup &amp; Shutdown</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Workers are initialized on server startup using the worker bootstrap script:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`# Startup command inside backend/package.json
"worker": "node --env-file=.env src/workers/workerBootstrap.js"`}
        </code>
      </pre>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        When the server receives a shutdown signal (<code>SIGTERM</code> or <code>SIGINT</code>), the bootstrap handler calls <code>worker.close()</code> to allow active tasks to finish processing before exiting.
      </p>


      {/* ── 5.19 WORKER THREADS ──────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.19 Worker Threads</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The system distinguishes between BullMQ workers and Node.js Worker Threads:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>BullMQ Worker:</strong> A persistent process that polls Redis and executes campaign dispatch tasks.</li>
        <li style={{ marginBottom: 6 }}><strong>Node Worker Thread:</strong> A short-lived thread spawned to offload CPU-heavy work (such as PDF text extraction) from the main Node.js event loop.</li>
      </ul>


      {/* ── 5.20 KNOWLEDGE BASE EXTRACTION WORKER ────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.20 Knowledge Base Extraction Worker</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The Knowledge Base extraction worker is defined in <code>backend/src/workers/kbExtract.worker.js</code>. It parses uploaded files (such as PDF documents) off the main event loop to prevent voice latency spikes on active calls.
      </p>


      {/* ── 5.21 WORKER THREAD COMMUNICATION ─────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.21 Worker Thread Communication</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The main process spawns the worker thread using the <code>worker_threads</code> module:
      </p>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph LR
  Parent[Parent Thread] -->|Spawns with filePath & mimeType| Child[kbExtract.worker.js]
  Child -->|Runs text extraction| Task[extractText]
  Task -->|postMessage ok / error| Parent
`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This diagram depicts inter-thread communication for document extraction. The main Node process spawns `kbExtract.worker.js` as an isolated Node Worker Thread, passing document metadata (`filePath`, `mimeType`). The worker performs PDF/CSV text extraction off the main thread and posts success or error messages back via `parentPort.postMessage()`.
      </p>


      {/* ── 5.22 BACKGROUND SCHEDULERS ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.22 Background Schedulers</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan runs recurring background processes using standard Node.js intervals. The system does not use external cron libraries or distributed scheduling packages.
      </p>


      {/* ── 5.23 RECORDING RETENTION ─────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.23 Recording Retention</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The recording retention sweep is defined in <code>backend/src/services/recordingRetention.service.js</code>. It deletes call recordings older than 7 days, running every 6 hours (configured by <code>RECORDING_RETENTION_SWEEP_INTERVAL_MS</code>). It also runs an initial sweep 60 seconds after server boot to process pending tasks.
      </p>


      {/* ── 5.24 STUCK JOB RECOVERY ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.24 Stuck Job Recovery</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The startup recovery sweep is defined in <code>backend/src/services/kbChunking.service.js</code>. The <code>resumeStuckKbJobs</code> function runs on server boot, identifying KB files stuck in a processing state for longer than 30 minutes (defined by <code>STUCK_JOB_AGE_MS</code>) and re-triggering them.
      </p>


      {/* ── 5.25 BROADCAST SCHEDULING ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.25 Broadcast Scheduling</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        <em>Not verified in the current repository.</em> Broadcast runs are triggered on-demand via the REST API and executed dynamically using concurrency-slot pooling.
      </p>


      {/* ── 5.26 SUBSCRIPTION / BILLING SCHEDULERS ────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.26 Subscription / Billing Schedulers</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The subscription renewal scheduler runs in the main Express process. It executes <code>runRenewals()</code> hourly, which calls <code>renewDueSubscriptions()</code> to process pending billing cycles. It also runs a catch-up sweep 30 seconds after server boot.
      </p>


      {/* ── 5.27 SCHEDULER STARTUP BEHAVIOUR ─────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.27 Scheduler Startup Behaviour</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The system uses startup timeouts (such as 30-second delays for subscription checks and 60-second delays for recording cleanups) to stagger initialization tasks during server boot.
      </p>


      {/* ── 5.28 REDIS FAILURE BEHAVIOUR ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.28 Redis Failure Behaviour</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        If Redis is unreachable on startup, the system logs a warning and disables background worker initialization. If a disconnect occurs during active execution, the worker attempts to reconnect based on the configured backoff limits.
      </p>


      {/* ── 5.29 QUEUE FAILURE MODES ─────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.29 Queue Failure Modes</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Queue processing failures (such as missing campaign records or database timeouts) trigger job retries. Tasks that exceed the retry limit are marked as failed in Redis.
      </p>


      {/* ── 5.30 WORKER FAILURE MODES ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.30 Worker Failure Modes</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        If a worker process crashes, BullMQ detects the failure and marks active tasks as stalled, re-adding them to the queue based on configured parameters.
      </p>


      {/* ── 5.31 MONITORING & DEBUGGING ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.31 Monitoring &amp; Debugging</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The system writes queue events and execution details to the standard log files:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><code>Job completed</code>: Logs successful task completions with the job ID and queue name.</li>
        <li style={{ marginBottom: 6 }}><code>Job failed</code>: Logs execution errors along with stack traces.</li>
      </ul>


      {/* ── 5.32 QUEUE INSPECTION ────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.32 Queue Inspection</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Developers can inspect queue state by using Prisma Studio to check database records or by querying Redis keys directly using CLI commands.
      </p>


      {/* ── 5.33 ADDING A NEW QUEUE ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.33 Adding a New Queue</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To add a queue: Define the queue name, configure a producer in <code>backend/src/queues/</code>, and export the queue instance using the shared Redis configuration.
      </p>


      {/* ── 5.34 ADDING A NEW WORKER ─────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.34 Adding a New Worker</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To add a worker: Create a worker file in <code>backend/src/workers/</code>, define the job processor function, and register the worker instance in the bootstrap script.
      </p>


      {/* ── 5.35 ADDING A SCHEDULED JOB ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.35 Adding a Scheduled Job</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To add a scheduled task: Define the task handler, create a recurring timer using <code>setInterval</code> in the target service, and update the shutdown handler to clear the interval cleanly.
      </p>


      {/* ── 5.36 TESTING QUEUES & WORKERS ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.36 Testing Queues &amp; Workers</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Queue and worker behavior can be verified using Node's built-in test runner. Tests mock external service APIs to isolate and test job execution paths.
      </p>


      {/* ── 5.37 DEVELOPMENT WORKFLOW ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.37 Development Workflow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        During local development, developers run Redis in a local instance, trigger tasks via the UI or API endpoints, and inspect logs to verify worker execution and database updates.
      </p>


      {/* ── 5.38 PRODUCTION CONSIDERATIONS ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.38 Production Considerations</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        In production, the Redis connection strategy uses backoffs to prevent connection loops. The workers close connection handles gracefully on shutdown to avoid data loss.
      </p>


      {/* ── 5.39 TROUBLESHOOTING MATRIX ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.39 Troubleshooting Matrix</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Symptom</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Likely Cause</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Diagnostic Action</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Resolution</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Workers fail to initialize</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Redis connection error</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Check Redis logs and verify host port mapping.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Ensure the Redis service is active and the URL is configured.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>KB extraction stuck</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Main thread process crashed during extraction</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Query `KbFile` table status fields.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Restart the server to trigger the startup recovery sweep.</td>
          </tr>
        </tbody>
      </table>


      {/* ── 5.40 ENGINEERING REFERENCE ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>5.40 Engineering Reference</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Queue / Worker</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source File</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Key Event / Task</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Campaign Queue</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/queues/campaign.queue.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`enqueueCampaign`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Campaign Worker</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/workers/campaign.worker.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`createCampaignWorker`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>PDF Extraction Thread</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/workers/kbExtract.worker.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`workerData` (extracts text off the main event loop)</td>
          </tr>
        </tbody>
      </table>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/database" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Database
        </Link>
        <Link to="/docs/developer/websockets" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          WebSockets →
        </Link>
      </div>
    </div>
  );
}
