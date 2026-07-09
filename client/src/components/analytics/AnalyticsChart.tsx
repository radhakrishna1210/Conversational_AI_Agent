import { memo } from 'react';
import {
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

/* ── Shared tooltip style ─────────────────────────────────────────── */
const tooltipStyle = {
  contentStyle: {
    background: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    fontSize: 12,
    color: '#e8e8e8',
  },
  itemStyle: { color: '#e8e8e8' },
  labelStyle: { color: '#888', marginBottom: 4 },
};

/* ── Calls Over Time (Line) ─────────────────────────────────────── */
interface CallsOverTimeProps {
  data: { date: string; calls: number }[];
  accentColor: string;
}

export const CallsOverTimeChart = memo(function CallsOverTimeChart({ data, accentColor }: CallsOverTimeProps) {
  return (
    <div style={{ background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 20 }}>Calls Over Time</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#555' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#555' }} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} />
          <Line
            type="monotone"
            dataKey="calls"
            stroke={accentColor}
            strokeWidth={2.5}
            dot={{ r: 4, fill: accentColor, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: accentColor }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

/* ── Outcome Pie ─────────────────────────────────────────────────── */
const PIE_COLORS = ['#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#a855f7'];

interface PieProps {
  data: { name: string; value: number }[];
}

export const OutcomePieChart = memo(function OutcomePieChart({ data }: PieProps) {
  return (
    <div style={{ background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 20 }}>Call Outcomes</div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((_, index) => (
              <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} strokeWidth={0} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: '#888' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
});

/* ── Duration Bar Chart ─────────────────────────────────────────── */
interface DurationProps {
  data: { range: string; calls: number }[];
  accentColor: string;
}

export const DurationBarChart = memo(function DurationBarChart({ data, accentColor }: DurationProps) {
  return (
    <div style={{ background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 20 }}>Conversation Duration</div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" vertical={false} />
          <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#555' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#555' }} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} />
          <Bar dataKey="calls" fill={accentColor} radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

/* ── Top Intents Horizontal Bar ─────────────────────────────────── */
interface IntentsProps {
  data: { intent: string; count: number }[];
  accentColor: string;
}

export const TopIntentsChart = memo(function TopIntentsChart({ data, accentColor }: IntentsProps) {
  const max = Math.max(...data.map(d => d.count));
  return (
    <div style={{ background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 20 }}>Top User Intents</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {data.map((item, i) => (
          <div key={item.intent} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: '#666', width: 130, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.intent}
            </span>
            <div style={{ flex: 1, height: 8, background: '#1a1a1a', borderRadius: 4, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 4,
                  width: `${(item.count / max) * 100}%`,
                  background: `${accentColor}${Math.round(55 + i * 25).toString(16).padStart(2, '0')}`,
                  transition: 'width 0.6s ease',
                }}
              />
            </div>
            <span style={{ fontSize: 12, color: '#888', fontWeight: 600, width: 24, textAlign: 'right' }}>
              {item.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
