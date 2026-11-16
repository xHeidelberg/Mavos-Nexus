import { useState } from 'react';
import BarChart from '../components/Chart';
import { Badge, Card, ErrorNote, Input, PageHeader, Segmented, Select, Spinner, Stat, Table, Td, Th } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTime, peso, today } from '../lib/format';

const PERIODS = [{ value: 'daily', label: 'Day' }, { value: 'weekly', label: 'Week' }, { value: 'monthly', label: 'Month' }, { value: 'yearly', label: 'Year' }];

// Turn per-day totals into bars: fill empty days for short ranges, group by month for a whole year.
function toBars(series) {
  if (!series?.days) return [];
  const byDay = new Map(series.days.map((d) => [String(d.day).slice(0, 10), Number(d.revenue)]));
  const start = new Date(`${series.from}T00:00:00`);
  const end = new Date(`${series.to_exclusive}T00:00:00`);
  const span = Math.round((end - start) / 86400000);
  if (span > 62) {
    const months = new Map();
    byDay.forEach((v, k) => months.set(k.slice(0, 7), (months.get(k.slice(0, 7)) || 0) + v));
    return [...months].map(([k, v]) => ({ label: new Date(`${k}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' }), value: v }));
  }
  const bars = [];
  for (let i = 0; i < span; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const key = d.toLocaleDateString('en-CA');
    bars.push({ label: d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' }), value: byDay.get(key) || 0 });
  }
  return bars;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('weekly');
  const [date, setDate] = useState(today());
  const [branch, setBranch] = useState('');
  const q = { period, date, branch_id: branch };
  const key = JSON.stringify(q);
  const POLL = { pollMs: 15000 }; // refreshes by itself so the owner sees sales as they happen
  const { data: branches } = useAsync(() => (user.role === 'admin' ? api.get('/branches') : Promise.resolve([])), []);
  const eod = useAsync(() => api.get('/reports/eod', q), [key], POLL);
  const series = useAsync(() => api.get('/reports/eod/series', q), [key], POLL);
  const perf = useAsync(() => api.get('/reports/performance', q), [key], POLL);
  const low = useAsync(() => api.get('/stock/low', { branch_id: branch }), [branch], POLL);
  const review = useAsync(() => api.get('/sales', { needs_review: 'true', per_page: 5 }), [], POLL);
  const recent = useAsync(() => api.get('/sales', { per_page: 8, branch_id: branch }), [branch], POLL);
  const e = eod.data;
  const bars = toBars(series.data);

  return (
    <div>
      <PageHeader title="Dashboard" sub="Updates every 15 seconds." actions={
        <>
          {user.role === 'admin' && <Select value={branch} onChange={(x) => setBranch(x.target.value)} aria-label="Branch" className="w-44"><option value="">All branches</option>{(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>}
          <Input type="date" value={date} onChange={(x) => setDate(x.target.value)} className="w-40" aria-label="Date" />
        </>
      } />
      <Segmented label="Period" options={PERIODS} value={period} onChange={setPeriod} className="mb-4 w-full sm:w-auto" />
      <ErrorNote error={eod.error} className="mb-3" />

      {eod.loading && !e ? <Spinner /> : e && (
        <>
          <p className="mb-2 text-sm text-muted">{e.from} to {new Date(new Date(e.to_exclusive).getTime() - 86400000).toLocaleDateString('en-CA')}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <Stat label="Sales" value={peso(e.revenue)} />
            <Stat label="Puhunan (cost)" value={peso(e.puhunan)} />
            <Stat label="Expenses" value={peso(e.expenses)} />
            <Stat label="Tubo (profit)" value={peso(e.tubo)} tone={e.tubo < 0 ? 'bad' : 'good'} hint={e.discounts > 0 ? `After ${peso(e.discounts)} discounts` : undefined} />
            <Stat label="Transactions" value={e.transactions} />
          </div>
        </>
      )}

      {period !== 'daily' && (
        <Card className="mt-5 p-4"><h2 className="mb-1 font-semibold">Sales {period === 'yearly' ? 'by month' : 'by day'}</h2>
          {series.loading && !series.data ? <Spinner /> : <BarChart data={bars} format={peso} />}
        </Card>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-4"><h2 className="mb-3 font-semibold">Top branches</h2>
          {!perf.data?.by_branch?.length ? <p className="text-sm text-muted">No sales in this period.</p> : (
            <Table><thead><tr><Th>Branch</Th><Th className="text-right">Sales</Th><Th className="text-right">Orders</Th></tr></thead>
              <tbody>{perf.data.by_branch.map((b) => <tr key={b.branch_id}><Td className="font-semibold">{b.name}</Td><Td className="text-right">{peso(b.total_sales)}</Td><Td className="text-right">{b.transactions}</Td></tr>)}</tbody></Table>)}
        </Card>
        <Card className="p-4"><h2 className="mb-3 font-semibold">Top sellers</h2>
          {!perf.data?.by_user?.length ? <p className="text-sm text-muted">No sales in this period.</p> : (
            <Table><thead><tr><Th>Name</Th><Th>Branch</Th><Th className="text-right">Sales</Th></tr></thead>
              <tbody>{perf.data.by_user.slice(0, 8).map((u) => <tr key={u.user_id}><Td className="font-semibold">{u.full_name}</Td><Td>{u.branch}</Td><Td className="text-right">{peso(u.total_sales)}</Td></tr>)}</tbody></Table>)}
        </Card>
        <Card className="p-4"><h2 className="mb-3 font-semibold">Latest sales</h2>
          {!recent.data?.data?.length ? <p className="text-sm text-muted">Nothing yet.</p> : (
            <ul className="divide-y divide-line text-sm">{recent.data.data.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0"><b>{s.receipt_no}</b><span className="block truncate text-muted">{s.cashier?.full_name} · {dateTime(s.sold_at)}</span></span><span className="font-semibold">{peso(s.total)}</span></li>))}</ul>)}
        </Card>
        <div className="space-y-5">
          <Card className="p-4"><h2 className="mb-3 font-semibold">Running low</h2>
            {!low.data?.length ? <p className="text-sm text-muted">Nothing is below its alert level.</p> : (
              <ul className="divide-y divide-line text-sm">{low.data.slice(0, 8).map((r) => <li key={r.variant_id} className="flex items-center justify-between gap-3 py-2.5"><span>{r.product_name}{r.label ? ` (${r.label})` : ''}</span><Badge tone={r.on_hand <= 0 ? 'bad' : 'warn'}>{r.on_hand} left</Badge></li>)}</ul>)}
          </Card>
          <Card className="p-4"><h2 className="mb-3 font-semibold">Sales to review</h2>
            {!review.data?.data?.length ? <p className="text-sm text-muted">No flagged sales.</p> : (
              <ul className="divide-y divide-line text-sm">{review.data.data.map((s) => <li key={s.id} className="py-2.5"><b>{s.receipt_no}</b> <span className="text-muted">{s.review_reason}</span></li>)}</ul>)}
          </Card>
        </div>
      </div>
    </div>
  );
}
