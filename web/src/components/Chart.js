'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const GRID = '#e8ebf1';
const AXIS = '#8591ab';
const PALETTE = ['#3b66f6', '#d0a445', '#10b981', '#8b5cf6', '#f43f5e', '#06b6d4', '#f59e0b', '#ec4899'];

function CTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-ink-100 bg-white/95 px-3 py-2 text-[12.5px] shadow-card backdrop-blur">
      {label !== undefined && <p className="mb-1 font-semibold text-ink-700">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-ink-600">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="font-medium">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold text-ink-900">
            {formatter ? formatter(p.value) : typeof p.value === 'number' ? p.value.toLocaleString('en-IN') : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

export function TrendArea({ data, xKey, series, height = 260, money = false, yFmt }) {
  const fmt = yFmt || (money ? (v) => `₹${Number(v).toLocaleString('en-IN')}` : (v) => v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color || PALETTE[i % PALETTE.length]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color || PALETTE[i % PALETTE.length]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fill: AXIS, fontSize: 11.5 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: AXIS, fontSize: 11.5 }} axisLine={false} tickLine={false} tickFormatter={fmt} width={64} />
        <Tooltip content={<CTooltip formatter={fmt} />} />
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label || s.key}
            stroke={s.color || PALETTE[i % PALETTE.length]}
            strokeWidth={2.4}
            fill={`url(#grad-${s.key})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, xKey, series, height = 260, money = false, stacked = false, horizontal = false }) {
  const fmt = money ? (v) => (Math.abs(v) >= 100000 ? `${(v / 100000).toFixed(1)}L` : v.toLocaleString('en-IN')) : (v) => v;
  return (
    <ResponsiveContainer width="100%" height={height}>
      {horizontal ? (
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={{ fill: AXIS, fontSize: 11.5 }} axisLine={false} tickLine={false} tickFormatter={fmt} />
          <YAxis type="category" dataKey={xKey} tick={{ fill: AXIS, fontSize: 11.5 }} axisLine={false} tickLine={false} width={100} />
          <Tooltip content={<CTooltip formatter={fmt} />} cursor={{ fill: 'rgba(59,102,246,.06)' }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label || s.key} fill={s.color || PALETTE[i % PALETTE.length]} radius={[0, 7, 7, 0]} barSize={16} stackId={stacked ? 'a' : undefined} />
          ))}
        </BarChart>
      ) : (
        <BarChart data={data} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: AXIS, fontSize: 11.5 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: AXIS, fontSize: 11.5 }} axisLine={false} tickLine={false} tickFormatter={fmt} width={64} />
          <Tooltip content={<CTooltip formatter={fmt} />} cursor={{ fill: 'rgba(59,102,246,.06)' }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label || s.key} fill={s.color || PALETTE[i % PALETTE.length]} radius={[7, 7, 0, 0]} barSize={26} stackId={stacked ? 'a' : undefined} />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

export function Lines({ data, xKey, series, height = 260, money = false, area = false }) {
  const fmt = money ? (v) => `₹${Number(v).toLocaleString('en-IN')}` : (v) => v;
  const Cmp = area ? Area : Line;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fill: AXIS, fontSize: 11.5 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: AXIS, fontSize: 11.5 }} axisLine={false} tickLine={false} tickFormatter={fmt} width={64} />
        <Tooltip content={<CTooltip formatter={fmt} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Cmp
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label || s.key}
            stroke={s.color || PALETTE[i % PALETTE.length]}
            strokeWidth={2.4}
            dot={false}
            fill={area ? `${s.color || PALETTE[i % PALETTE.length]}22` : undefined}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 220, formatter }) {
  const total = data.reduce((s, d) => s + Number(d.value || 0), 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-around">
      <div className="relative" style={{ width: height, height }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="66%"
              outerRadius="92%"
              paddingAngle={3}
              stroke="none"
            >
              {data.map((d, i) => (
                <Cell key={d.name} fill={d.color || PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={<CTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wider text-ink-400">Total</span>
          <span className="text-lg font-bold text-ink-900">{total.toLocaleString('en-IN')}</span>
        </div>
      </div>
      <ul className="grid w-full grid-cols-2 gap-2 sm:max-w-[240px]">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-[12.5px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color || PALETTE[i % PALETTE.length] }} />
            <span className="truncate text-ink-600">{d.name}</span>
            <span className="ml-auto font-semibold text-ink-900">{formatter ? formatter(d.value) : d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { PALETTE };
