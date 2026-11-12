import { useState } from 'react';
import { Badge, Card, Empty, ErrorNote, Field, Input, PageHeader, Select, Spinner, Stat, Table, Td, Th } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTime, peso, today } from '../lib/format';

export default function Dashboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('daily');
  const [date, setDate] = useState(today());
  const [branch, setBranch] = useState('');
  const q = { period, date, branch_id: branch };
  const key = JSON.stringify(q);
  const POLL = { pollMs: 15000 }; // refreshes by itself so the owner sees sales as they happen
  const { data: branches } = useAsync(() => (user.role === 'admin' ? api.get('/branches') : Promise.resolve([])), []);
  const eod = useAsync(() => api.get('/reports/eod', q), [key], POLL);
  const perf = useAsync(() => api.get('/reports/performance', q), [key], POLL);
  const low = useAsync(() => api.get('/stock/low', { branch_id: branch }), [branch], POLL);
  const review = useAsync(() => api.get('/sales', { needs_review: 'true', per_page: 5 }), [], POLL);
  const recent = useAsync(() => api.get('/sales', { per_page: 8, branch_id: branch }), [branch], POLL);
  const e = eod.data;

  return (
    <div>
      <PageHeader title="Dashboard" sub="Updates every 15 seconds." actions={<>
        <Select value={period} onChange={(x) => setPeriod(x.target.value)} aria-label="Period" className="w-32"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></Select>
        <Input type="date" value={date} onChange={(x) => setDate(x.target.value)} className="w-40" aria-label="Date" />
        {user.role === 'admin' && <Select value={branch} onChange={(x) => setBranch(x.target.value)} aria-label="Branch" className="w-48"><option value="">All branches</option>{(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>}
      </>} />
      <ErrorNote error={eod.error} className="mb-3" />
      {eod.loading && !e ? <Spinner /> : e && (
        <>
          <p className="mb-2 text-sm text-muted">{e.from} to {new Date(new Date(e.to_exclusive).getTime() - 86400000).toLocaleDateString('en-CA')}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Sales" value={peso(e.revenue)} />
            <Stat label="Puhunan (cost)" value={peso(e.puhunan)} />
            <Stat label="Expenses" value={peso(e.expenses)} />
            <Stat label="Tubo (profit)" value={peso(e.tubo)} tone={e.tubo < 0 ? 'bad' : 'good'} />
            <Stat label="Transactions" value={e.transactions} />
          </div>
          {e.discounts > 0 && <p className="mt-2 text-sm text-muted">Discounts given: {peso(e.discounts)}</p>}
        </>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
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
              <li key={s.id} className="flex justify-between py-2"><span><b>{s.receipt_no}</b> <span className="text-muted">{s.cashier?.full_name} · {dateTime(s.sold_at)}</span></span><span className="font-semibold">{peso(s.total)}</span></li>))}</ul>)}
        </Card>
        <div className="space-y-5">
          <Card className="p-4"><h2 className="mb-3 font-semibold">Running low</h2>
            {!low.data?.length ? <p className="text-sm text-muted">Nothing is below its alert level.</p> : (
              <ul className="divide-y divide-line text-sm">{low.data.slice(0, 8).map((r) => <li key={r.variant_id} className="flex justify-between py-2"><span>{r.product_name}{r.label ? ` (${r.label})` : ''}</span><Badge tone={r.on_hand <= 0 ? 'bad' : 'warn'}>{r.on_hand} left</Badge></li>)}</ul>)}
          </Card>
          <Card className="p-4"><h2 className="mb-3 font-semibold">Sales to review</h2>
            {!review.data?.data?.length ? <p className="text-sm text-muted">No flagged sales.</p> : (
              <ul className="divide-y divide-line text-sm">{review.data.data.map((s) => <li key={s.id} className="py-2"><b>{s.receipt_no}</b> <span className="text-muted">{s.review_reason}</span></li>)}</ul>)}
          </Card>
        </div>
      </div>
    </div>
  );
}
