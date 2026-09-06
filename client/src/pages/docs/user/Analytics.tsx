import { Link } from 'react-router-dom';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { BarChart3, TrendingUp, DollarSign, PieChart, Activity, ArrowUpRight } from 'lucide-react';

export default function UserAnalytics() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Monitoring & Insights</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>Analytics & Cost Tracking</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Monitor conversational call volumes, talk-time duration, outcome distributions, agent performance metrics, and spend analytics in real time.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="Analytics Telemetry & Aggregation Pipeline"
        description="How granular per-call telemetry is aggregated into operational insights and financial reports."
        steps={[
          {
            badge: 'METRICS',
            title: 'Call Telemetry',
            description: 'Captures duration, carrier latency, LLM token counts, and final outcome status.',
            icon: <Activity size={16} />
          },
          {
            badge: 'FINANCIALS',
            title: 'Cost Settlement',
            description: 'Derives exact talk-time spend from wallet ledger and tracks underlying provider COGS.',
            icon: <DollarSign size={16} />
          },
          {
            badge: 'ANALYSIS',
            title: 'Trend Aggregation',
            description: 'Aggregates time-series volumes over 7-day, 30-day, and 90-day reporting windows.',
            icon: <TrendingUp size={16} />
          },
          {
            badge: 'INSIGHTS',
            title: 'Executive Dashboards',
            description: 'Renders agent performance comparisons, sentiment breakdowns, and exportable CSVs.',
            icon: <BarChart3 size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. Key Performance Indicators (KPIs)</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        The top hero section of the <strong>Analytics</strong> dashboard (<code style={{ color: 'var(--teal-fg)' }}>/analytics</code>) displays core operational metrics:
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '28px' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Calls</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: '6px 0' }}>14,820</div>
          <div style={{ fontSize: '12px', color: 'var(--lime)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowUpRight size={14} /> +18.4% vs last period
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Talk-Time Minutes</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--teal-fg)', margin: '6px 0' }}>42,150 min</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Billed connected time</div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Avg Call Duration</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--violet)', margin: '6px 0' }}>02:51</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Per answered conversation</div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Spend</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--coral)', margin: '6px 0' }}>₹1,26,450</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>INR minor units settled</div>
        </div>
      </div>

      <DocsImage
        src="/screenshots/analytics.png"
        alt="Analytics Performance & Cost Console"
        caption="Analytics dashboard: inspect call volumes, connected duration, talk-time trends, and spend metrics"
      />

      <DocsScreenshotPlaceholder
        title="Analytics Visualizations Hub"
        description="Comprehensive analytics dashboard showing call volume time-series charts, outcome donuts, sentiment distribution, and agent comparison tables."
        routePath="/analytics"
        elements={[
          { label: 'Time Window', value: '7 Days | 30 Days | 90 Days', type: 'button' },
          { label: 'Volume Chart', value: 'Daily call volume and talk-time distribution', type: 'text' },
          { label: 'Outcome Donut', value: 'Completed (72%), No Answer (18%), Busy (7%), Failed (3%)', type: 'badge' },
          { label: 'Agent Performance', value: 'Comparative ranking by call count and conversion', type: 'text' }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. Call Outcome & Sentiment Distributions</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Analyze the efficiency of your calling operations through visual categorical breakdowns:
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PieChart size={16} style={{ color: 'var(--teal)' }} />
            <span>Call Outcome Distribution</span>
          </div>
          <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '18px', margin: 0, lineHeight: 1.6 }}>
            <li><strong>Completed:</strong> Call connected, conversation executed successfully.</li>
            <li><strong>No Answer:</strong> Recipient phone rang out without answering.</li>
            <li><strong>Busy / Rejected:</strong> User declined call or line was occupied.</li>
            <li><strong>Failed:</strong> Telecom carrier routing or network failure.</li>
          </ul>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={16} style={{ color: 'var(--lime)' }} />
            <span>Sentiment Distribution</span>
          </div>
          <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '18px', margin: 0, lineHeight: 1.6 }}>
            <li><strong>Positive:</strong> High lead interest, appointment booked.</li>
            <li><strong>Neutral:</strong> Standard query resolution.</li>
            <li><strong>Negative:</strong> Caller requested removal or expressed dissatisfaction.</li>
          </ul>
        </div>
      </div>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3. Agent Performance Comparison</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Compare the effectiveness of different Voice AI assistants across your workspace:
      </p>
      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li><strong>Handled Volume:</strong> Number of calls executed per agent.</li>
        <li><strong>Average Handle Time (AHT):</strong> Average talk-time per session to evaluate prompt conciseness.</li>
        <li><strong>Conversion Rate:</strong> Percentage of calls where target variables (e.g. appointment confirmed) were successfully captured.</li>
      </ul>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/calls-logs" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Conversation Transcripts & Variables
        </Link>
        <Link to="/docs/user/whatsapp" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          WhatsApp Omnichannel →
        </Link>
      </div>
    </div>
  );
}
