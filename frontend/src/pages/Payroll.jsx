import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, Stat, Table, Tabs, Td, Th, cx, useSubmit } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { dateOnly, peso } from '../lib/format';
import { confirm, toast } from '../lib/toast';

const FREQ = { weekly: 'Weekly', semi_monthly: 'Twice a month', monthly: 'Monthly' };
const METHOD = { cash: 'Cash', gcash: 'GCash', maya: 'Maya' };
const methodLabel = (m, num) => (m === 'cash' ? 'Cash' : `${METHOD[m]} · ${num || ''}`);

export default function Payroll() {
  const [tab, setTab] = useState('employees');
  const [runId, setRunId] = useState(null);
  if (runId) return <RunDetail id={runId} onBack={() => setRunId(null)} />;
  return (
    <div>
      <PageHeader title="Payroll" sub="Employees, pay runs and payslips. Only admins can see this." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'employees', label: 'Employees' }, { id: 'runs', label: 'Payroll runs' }, { id: 'rates', label: 'Contribution rates' }]} />
      {tab === 'employees' && <Employees />}
      {tab === 'runs' && <Runs onOpen={setRunId} />}
      {tab === 'rates' && <Rates />}
    </div>
  );
}

/* ------------------------------------------------------------------ Employees */

function Employees() {
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('');
  const { data: branches } = useAsync(() => api.get('/branches'), []);
  const { data, loading, error, reload } = useAsync(() => api.get('/payroll/employees', { search, branch_id: branch }), [search, branch]);
  const [edit, setEdit] = useState(null); // { employee, step }

  const deductionLabel = (e) => {
    if (e.deductions_status !== 'configured') return null;
    const on = [e.sss_enabled && 'SSS', e.philhealth_enabled && 'PhilHealth', e.pagibig_enabled && 'Pag-IBIG'].filter(Boolean);
    return on.length ? on.join(' · ') : 'None';
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs flex-1" placeholder="Search name or position" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select className="w-48" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch"><option value="">All branches</option>{(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        <Button onClick={() => setEdit({ employee: null, step: 1 })}>Add employee</Button>
      </div>
      <ErrorNote error={error} className="mb-3" />
      {loading ? <Spinner /> : !data?.length ? <Empty title="No employees yet" hint="Add the people you pay. You can set up their SSS, PhilHealth and Pag-IBIG now or later." action={<Button onClick={() => setEdit({ employee: null, step: 1 })}>Add employee</Button>} /> : (
        <Table>
          <thead><tr><Th>Employee</Th><Th>Branch</Th><Th>Pay</Th><Th>Paid by</Th><Th>Government deductions</Th><Th /></tr></thead>
          <tbody>{data.map((e) => (
            <tr key={e.id} className={e.is_active ? '' : 'opacity-50'}>
              <Td className="font-semibold">{e.full_name}<span className="block text-xs font-normal text-muted">{e.position || '—'}</span></Td>
              <Td>{e.branch?.name}</Td>
              <Td>{peso(e.rate)} <span className="text-muted">{e.pay_basis === 'daily' ? 'per day' : 'per month'} · {FREQ[e.pay_frequency]}</span></Td>
              <Td>{methodLabel(e.payment_method, e.ewallet_number)}</Td>
              <Td>{deductionLabel(e) === null
                ? <button className="text-left" onClick={() => setEdit({ employee: e, step: 3 })}><Badge tone="warn">Set up later</Badge> <span className="ml-1 text-sm font-semibold text-ledger underline">Set up now</span></button>
                : deductionLabel(e)}</Td>
              <Td><Button size="sm" variant="ghost" onClick={() => setEdit({ employee: e, step: 1 })}>Edit</Button></Td>
            </tr>))}</tbody>
        </Table>
      )}
      {edit && <EmployeeWizard employee={edit.employee} startStep={edit.step} branches={branches || []} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </>
  );
}

const blankEmployee = {
  branch_id: '', full_name: '', position: '', contact_number: '', address: '', date_hired: '', tin: '',
  pay_basis: 'monthly', rate: '', pay_frequency: 'semi_monthly', payment_method: 'cash', ewallet_number: '', ewallet_account_name: '',
  deductions_status: 'pending', is_active: true,
  sss_enabled: false, sss_number: '', sss_fixed_amount: '', philhealth_enabled: false, philhealth_number: '', philhealth_fixed_amount: '',
  pagibig_enabled: false, pagibig_number: '', pagibig_fixed_amount: '',
};
const DEDUCTIONS = [
  { key: 'sss', label: 'SSS', digits: 10, hint: '10-digit SSS number' },
  { key: 'philhealth', label: 'PhilHealth', digits: 12, hint: '12-digit PhilHealth number' },
  { key: 'pagibig', label: 'Pag-IBIG', digits: 12, hint: '12-digit Pag-IBIG MID number' },
];
const phone = /^(09|\+639)\d{9}$/;
const digitsOnly = (s) => String(s || '').replace(/\D/g, '');

function EmployeeWizard({ employee, startStep, branches, onClose, onDone }) {
  const [step, setStep] = useState(startStep);
  const [f, setF] = useState(() => {
    if (!employee) return blankEmployee;
    const o = { ...blankEmployee };
    Object.keys(blankEmployee).forEach((k) => { if (employee[k] !== null && employee[k] !== undefined) o[k] = employee[k]; });
    o.branch_id = String(employee.branch_id);
    return o;
  });
  // Step 3 starts with the question; an already-configured employee goes straight to the details.
  const [choice, setChoice] = useState(employee?.deductions_status === 'configured' ? 'now' : null);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  const ewallet = f.payment_method !== 'cash';
  const step1ok = f.branch_id && f.full_name.trim();
  const step2ok = Number(f.rate) > 0 && (!ewallet || (phone.test(f.ewallet_number) && f.ewallet_account_name.trim()));
  const step3ok = choice === 'later' || (choice === 'now' && DEDUCTIONS.every((d) => !f[`${d.key}_enabled`] || digitsOnly(f[`${d.key}_number`]).length === d.digits));

  const { busy, error, submit } = useSubmit(async () => {
    const body = {
      branch_id: Number(f.branch_id), full_name: f.full_name.trim(), position: f.position || null, contact_number: f.contact_number || null,
      address: f.address || null, date_hired: f.date_hired || null, tin: f.tin || null,
      pay_basis: f.pay_basis, rate: Number(f.rate), pay_frequency: f.pay_frequency, payment_method: f.payment_method,
      ewallet_number: ewallet ? f.ewallet_number : null, ewallet_account_name: ewallet ? f.ewallet_account_name.trim() : null,
      deductions_status: choice === 'now' ? 'configured' : 'pending', is_active: f.is_active,
    };
    DEDUCTIONS.forEach((d) => {
      body[`${d.key}_enabled`] = choice === 'now' && !!f[`${d.key}_enabled`];
      body[`${d.key}_number`] = body[`${d.key}_enabled`] ? digitsOnly(f[`${d.key}_number`]) : null;
      body[`${d.key}_fixed_amount`] = body[`${d.key}_enabled`] && f[`${d.key}_fixed_amount`] !== '' ? Number(f[`${d.key}_fixed_amount`]) : null;
    });
    if (employee) await api.patch(`/payroll/employees/${employee.id}`, body); else await api.post('/payroll/employees', body);
    onDone();
  }, employee ? 'Employee updated' : 'Employee added', {
    title: employee ? 'Save changes to this employee?' : 'Add this employee?',
    message: `${f.full_name} · ${peso(f.rate || 0)} ${f.pay_basis === 'daily' ? 'per day' : 'per month'} · paid by ${METHOD[f.payment_method]} · deductions ${choice === 'now' ? 'set up' : 'to be set up later'}.`,
    confirmLabel: employee ? 'Save changes' : 'Add employee',
  });

  const STEPS = ['Details', 'Pay', 'Deductions'];
  return (
    <Modal title={employee ? `Edit ${employee.full_name}` : 'Add employee'} onClose={onClose} wide
      footer={<>
        {step > 1 ? <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button> : <Button variant="secondary" onClick={onClose}>Cancel</Button>}
        {step < 3 ? <Button onClick={() => setStep(step + 1)} disabled={step === 1 ? !step1ok : !step2ok}>Next</Button>
          : <Button onClick={submit} disabled={busy || !step3ok || !step1ok || !step2ok}>{busy ? 'Saving…' : 'Save employee'}</Button>}
      </>}>
      <ol className="mb-5 flex gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className={cx('flex flex-1 items-center gap-2 border-b-2 pb-2 text-sm font-semibold', step === i + 1 ? 'border-ledger text-ledger' : step > i + 1 ? 'border-ledger/40 text-muted' : 'border-line text-muted')}>
            <span className={cx('grid size-6 place-items-center rounded-full text-xs', step > i + 1 ? 'bg-ledger text-on-ledger' : 'bg-line/70')}>{step > i + 1 ? <Icon name="check" className="size-3.5" strokeWidth={3} /> : i + 1}</span>{s}
          </li>))}
      </ol>

      {step === 1 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name"><Input value={f.full_name} onChange={(e) => set({ full_name: e.target.value })} /></Field>
          <Field label="Branch"><Select value={f.branch_id} onChange={(e) => set({ branch_id: e.target.value })}><option value="">Choose…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          <Field label="Position"><Input value={f.position} onChange={(e) => set({ position: e.target.value })} /></Field>
          <Field label="Mobile number"><Input inputMode="tel" value={f.contact_number} onChange={(e) => set({ contact_number: e.target.value })} /></Field>
          <Field label="Date hired"><Input type="date" value={f.date_hired} onChange={(e) => set({ date_hired: e.target.value })} /></Field>
          <Field label="TIN (optional)"><Input value={f.tin} onChange={(e) => set({ tin: e.target.value })} /></Field>
          <Field label="Address (optional)" className="sm:col-span-2"><Input value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
          {employee && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.is_active} onChange={(e) => set({ is_active: e.target.checked })} /> Currently employed (included in payroll)</label>}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Paid"><Select value={f.pay_basis} onChange={(e) => set({ pay_basis: e.target.value })}><option value="monthly">A monthly salary</option><option value="daily">A daily rate</option></Select></Field>
            <Field label={f.pay_basis === 'daily' ? 'Daily rate (₱)' : 'Monthly salary (₱)'}><Input type="number" min={0} step="0.01" inputMode="decimal" value={f.rate} onChange={(e) => set({ rate: e.target.value })} /></Field>
            <Field label="How often"><Select value={f.pay_frequency} onChange={(e) => set({ pay_frequency: e.target.value })}>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold">How is this employee paid?</p>
            <Segmented label="Payment method" className="w-full sm:w-auto" value={f.payment_method} onChange={(v) => set({ payment_method: v })}
              options={[{ value: 'cash', label: 'Cash' }, { value: 'gcash', label: 'GCash' }, { value: 'maya', label: 'Maya' }]} />
          </div>
          {ewallet && (
            <div className="grid gap-3 rounded-lg border border-line bg-paper p-3 sm:grid-cols-2">
              <Field label={`${METHOD[f.payment_method]} mobile number`} hint="Starts with 09, 11 digits."><Input inputMode="tel" value={f.ewallet_number} onChange={(e) => set({ ewallet_number: e.target.value.replace(/[^\d+]/g, '') })} /></Field>
              <Field label="Name on the account" hint="Exactly as shown in the app, to avoid sending to the wrong person."><Input value={f.ewallet_account_name} onChange={(e) => set({ ewallet_account_name: e.target.value })} /></Field>
              {f.ewallet_number && !phone.test(f.ewallet_number) && <p className="text-sm text-danger sm:col-span-2">Enter a valid mobile number, like 09171234567.</p>}
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          {choice === null ? (
            <div>
              <h3 className="text-lg font-semibold">Does {f.full_name || 'this employee'} have government deductions?</h3>
              <p className="mt-1 text-sm text-muted">SSS, PhilHealth and Pag-IBIG contributions are taken from pay. You can set them up now, or add them later; until then nothing is deducted and the payslip is marked “deductions not set up”.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button onClick={() => { setChoice('now'); set({ deductions_status: 'configured' }); }} className="rounded-xl border border-line p-4 text-left hover:border-ledger hover:bg-ledger-soft">
                  <p className="font-semibold">Set up now</p><p className="mt-1 text-sm text-muted">Choose which ones apply and enter the ID numbers.</p></button>
                <button onClick={() => setChoice('later')} className="rounded-xl border border-line p-4 text-left hover:border-ledger hover:bg-ledger-soft">
                  <p className="font-semibold">Set up later</p><p className="mt-1 text-sm text-muted">Save the employee now. You’ll see a reminder until it’s done.</p></button>
              </div>
            </div>
          ) : choice === 'later' ? (
            <div className="rounded-lg bg-caution-soft p-4 text-sm text-caution">
              <p className="font-semibold">Deductions will be set up later.</p>
              <p className="mt-1">No SSS, PhilHealth or Pag-IBIG will be deducted until you set them up from the employee list.</p>
              <button className="mt-2 font-semibold underline" onClick={() => setChoice(null)}>Change my answer</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted">Turn on the ones that apply. Leave the amount empty to have it computed from the current rates (see “Contribution rates”). Switch all off if this employee has none.</p>
              {DEDUCTIONS.map((d) => {
                const on = !!f[`${d.key}_enabled`];
                return (
                  <div key={d.key} className={cx('rounded-lg border p-3', on ? 'border-ledger/50 bg-ledger-soft/40' : 'border-line')}>
                    <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="size-4" checked={on} onChange={(e) => set({ [`${d.key}_enabled`]: e.target.checked })} /> Deduct {d.label}</label>
                    {on && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Field label={`${d.label} number`} hint={d.hint}><Input inputMode="numeric" value={f[`${d.key}_number`]} onChange={(e) => set({ [`${d.key}_number`]: e.target.value })} /></Field>
                        <Field label="Fixed amount per pay (optional)" hint="Only if you want a set amount."><Input type="number" min={0} step="0.01" value={f[`${d.key}_fixed_amount`]} onChange={(e) => set({ [`${d.key}_fixed_amount`]: e.target.value })} /></Field>
                        {digitsOnly(f[`${d.key}_number`]).length !== d.digits && <p className="text-sm text-danger sm:col-span-2">{d.hint} is required.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
              <button className="text-sm font-semibold underline" onClick={() => setChoice(null)}>Back to the question</button>
            </>
          )}
        </div>
      )}
      <ErrorNote error={error} className="mt-4" />
    </Modal>
  );
}

/* ------------------------------------------------------------------ Runs */

const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
function suggestPeriod(freq) {
  const t = new Date(); const y = t.getFullYear(); const m = t.getMonth(); const d = t.getDate();
  if (freq === 'monthly') return [iso(y, m, 1), iso(y, m, lastDay(y, m))];
  if (freq === 'weekly') { const dow = (t.getDay() + 6) % 7; const s = new Date(t); s.setDate(d - dow); const e = new Date(s); e.setDate(s.getDate() + 6); return [s.toLocaleDateString('en-CA'), e.toLocaleDateString('en-CA')]; }
  return d <= 15 ? [iso(y, m, 1), iso(y, m, 15)] : [iso(y, m, 16), iso(y, m, lastDay(y, m))];
}

function Runs({ onOpen }) {
  const { data, loading, error, reload } = useAsync(() => api.get('/payroll/runs'), []);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="mb-4"><Button onClick={() => setCreating(true)}>New payroll run</Button></div>
      <ErrorNote error={error} className="mb-3" />
      {loading ? <Spinner /> : !data?.length ? <Empty title="No payroll runs yet" hint="Add employees first, then create a run for a pay period." /> : (
        <Table>
          <thead><tr><Th>Period</Th><Th>Branch</Th><Th>Pay date</Th><Th>Frequency</Th><Th className="text-right">Employees</Th><Th className="text-right">Net pay</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>{data.map((r) => (
            <tr key={r.id}>
              <Td className="font-semibold">{dateOnly(r.period_start)} – {dateOnly(r.period_end)}</Td><Td>{r.branch?.name || 'All branches'}</Td><Td>{dateOnly(r.pay_date)}</Td><Td>{FREQ[r.pay_frequency]}</Td>
              <Td className="text-right">{r.payslips_count}</Td><Td className="text-right font-semibold">{peso(r.total_net)}</Td>
              <Td>{r.status === 'draft' ? <Badge tone="warn">Draft</Badge> : r.paid_count === r.payslips_count ? <Badge tone="good">All paid</Badge> : <Badge tone="good">Finalized · {r.paid_count}/{r.payslips_count} paid</Badge>}</Td>
              <Td><Button size="sm" variant="ghost" onClick={() => onOpen(r.id)}>Open</Button></Td>
            </tr>))}</tbody>
        </Table>
      )}
      {creating && <NewRun onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); reload(); onOpen(id); }} />}
    </>
  );
}

function NewRun({ onClose, onDone }) {
  const { data: branches } = useAsync(() => api.get('/branches'), []);
  const [f, setF] = useState(() => { const [s, e] = suggestPeriod('semi_monthly'); return { branch_id: '', pay_frequency: 'semi_monthly', period_start: s, period_end: e, pay_date: e }; });
  const setFreq = (pay_frequency) => { const [s, e] = suggestPeriod(pay_frequency); setF({ ...f, pay_frequency, period_start: s, period_end: e, pay_date: e }); };
  const { busy, error, submit } = useSubmit(async () => {
    const run = await api.post('/payroll/runs', { ...f, branch_id: f.branch_id ? Number(f.branch_id) : null });
    onDone(run.run.id);
  }, 'Payroll run created', {
    title: 'Create this payroll run?',
    message: `${FREQ[f.pay_frequency]} payroll for ${dateOnly(f.period_start)} – ${dateOnly(f.period_end)}. A draft payslip is made for every active employee paid this way. You can review and edit before finalizing.`,
    confirmLabel: 'Create run',
  });
  return (
    <Modal title="New payroll run" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Who is paid"><Select value={f.pay_frequency} onChange={(e) => setFreq(e.target.value)}>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>Employees paid: {v.toLowerCase()}</option>)}</Select></Field>
        <Field label="Branch"><Select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}><option value="">All branches</option>{(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Period start"><Input type="date" value={f.period_start} onChange={(e) => setF({ ...f, period_start: e.target.value })} /></Field>
          <Field label="Period end"><Input type="date" value={f.period_end} onChange={(e) => setF({ ...f, period_end: e.target.value })} /></Field>
        </div>
        <Field label="Pay date"><Input type="date" value={f.pay_date} onChange={(e) => setF({ ...f, pay_date: e.target.value })} /></Field>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !f.period_start || !f.period_end || !f.pay_date}>{busy ? 'Creating…' : 'Create run'}</Button></div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Run detail */

function RunDetail({ id, onBack }) {
  const { data, loading, error, reload } = useAsync(() => api.get(`/payroll/runs/${id}`), [id]);
  const [editSlip, setEditSlip] = useState(null);
  const [paySlip, setPaySlip] = useState(null);
  const [viewSlip, setViewSlip] = useState(null);
  const [actErr, setActErr] = useState(null);

  const act = async (opts, call, doneText, after) => {
    if (!(await confirm(opts))) return;
    setActErr(null);
    try { await call(); toast.success(doneText); if (after) after(); else reload(); } catch (e) { setActErr(e); }
  };

  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote error={error} />;
  const { run, summary } = data;
  const draft = run.status === 'draft';

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><Icon name="back" className="size-4" /> All payroll runs</button>
      <PageHeader title={`${dateOnly(run.period_start)} – ${dateOnly(run.period_end)}`}
        sub={`${run.branch?.name || 'All branches'} · ${FREQ[run.pay_frequency]} · pay date ${dateOnly(run.pay_date)}`}
        actions={draft ? (
          <>
            <Button variant="secondary" onClick={() => act({ title: 'Recalculate this run?', message: 'Every payslip is recalculated from each employee’s current pay, deduction and payment settings. Your days, allowances and other deductions are kept.', confirmLabel: 'Recalculate' }, () => api.post(`/payroll/runs/${id}/recalculate`), 'Payroll recalculated')}>Recalculate</Button>
            <Button variant="secondary" onClick={() => act({ title: 'Delete this draft?', message: 'The draft run and all its payslips will be deleted. Finalized runs can’t be deleted.', confirmLabel: 'Delete draft', danger: true }, () => api.delete(`/payroll/runs/${id}`), 'Draft deleted', onBack)}>Delete draft</Button>
            <Button onClick={() => act({ title: 'Finalize this payroll?', message: `${data.run.payslips.length} payslips will be locked and ready to pay.${summary.pending_deductions ? ` ${summary.pending_deductions} employee(s) still have government deductions set up later, so nothing is deducted for them.` : ''} You can’t edit them afterwards.`, confirmLabel: 'Finalize payroll' }, () => api.post(`/payroll/runs/${id}/finalize`), 'Payroll finalized')}>Finalize</Button>
          </>
        ) : <Badge tone="good">Finalized</Badge>} />
      <ErrorNote error={error || actErr} className="mb-3" />

      {draft && summary.pending_deductions > 0 && (
        <p className="mb-4 rounded-lg bg-caution-soft px-4 py-3 text-sm text-caution">
          <b>{summary.pending_deductions} employee(s)</b> have government deductions marked “set up later”, so nothing is deducted for them. Set them up in Employees, then press Recalculate.
        </p>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Gross pay" value={peso(summary.gross)} />
        <Stat label="Deductions" value={peso(summary.deductions)} />
        <Stat label="Net pay" value={peso(summary.net)} tone="good" />
        <Stat label="Still to pay" value={summary.unpaid} hint={draft ? 'after finalizing' : undefined} />
      </div>
      <Card className="mb-5 p-4">
        <p className="mb-2 font-semibold">Net pay by payment method</p>
        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
          {['cash', 'gcash', 'maya'].map((m) => <span key={m}><span className="text-muted">{METHOD[m]}</span> <b>{peso(summary.by_method[m] || 0)}</b></span>)}
        </div>
      </Card>

      <Table>
        <thead><tr><Th>Employee</Th><Th className="text-right">Basic</Th><Th className="text-right">Allowances</Th><Th className="text-right">SSS</Th><Th className="text-right">PhilHealth</Th><Th className="text-right">Pag-IBIG</Th><Th className="text-right">Other</Th><Th className="text-right">Net pay</Th><Th>Pay by</Th><Th /></tr></thead>
        <tbody>{run.payslips.map((p) => (
          <tr key={p.id}>
            <Td className="font-semibold">{p.employee.full_name}{p.deductions_pending && <span className="mt-0.5 block"><Badge tone="warn">Deductions not set up</Badge></span>}
              {p.days_worked !== null && <span className="block text-xs font-normal text-muted">{p.days_worked} days</span>}</Td>
            <Td className="text-right">{peso(p.basic_pay)}</Td><Td className="text-right">{peso(p.allowances)}</Td>
            <Td className="text-right">{peso(p.sss)}</Td><Td className="text-right">{peso(p.philhealth)}</Td><Td className="text-right">{peso(p.pagibig)}</Td>
            <Td className="text-right">{peso(p.other_deductions)}</Td><Td className="text-right font-bold">{peso(p.net_pay)}</Td>
            <Td>{methodLabel(p.payment_method, p.ewallet_number)}</Td>
            <Td><span className="flex flex-wrap justify-end gap-1">
              {draft && <Button size="sm" variant="secondary" onClick={() => setEditSlip(p)}>Edit</Button>}
              {!draft && !p.paid_at && <Button size="sm" onClick={() => setPaySlip(p)}>Mark paid</Button>}
              {p.paid_at && <Badge tone="good">Paid{p.payment_reference ? ` · ${p.payment_reference}` : ''}</Badge>}
              <Button size="sm" variant="ghost" onClick={() => setViewSlip(p)}>Payslip</Button>
            </span></Td>
          </tr>))}</tbody>
      </Table>

      {editSlip && <EditPayslip slip={editSlip} onClose={() => setEditSlip(null)} onDone={() => { setEditSlip(null); reload(); }} />}
      {paySlip && <PayPayslip slip={paySlip} onClose={() => setPaySlip(null)} onDone={() => { setPaySlip(null); reload(); }} />}
      {viewSlip && <PayslipView slip={viewSlip} run={run} onClose={() => setViewSlip(null)} />}
    </div>
  );
}

function EditPayslip({ slip, onClose, onDone }) {
  const [f, setF] = useState({ days_worked: slip.days_worked ?? '', allowances: slip.allowances || '', other_deductions: slip.other_deductions || '', other_deductions_note: slip.other_deductions_note || '' });
  const daily = slip.days_worked !== null;
  const { busy, error, submit } = useSubmit(async () => {
    await api.patch(`/payroll/payslips/${slip.id}`, {
      ...(daily ? { days_worked: Number(f.days_worked || 0) } : {}), allowances: Number(f.allowances || 0),
      other_deductions: Number(f.other_deductions || 0), other_deductions_note: f.other_deductions_note || null,
    });
    onDone();
  }, 'Payslip updated', { title: 'Save this payslip?', message: `${slip.employee.full_name}’s pay will be recalculated.`, confirmLabel: 'Save payslip' });
  return (
    <Modal title={`Edit payslip · ${slip.employee.full_name}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {daily && <Field label="Days worked"><Input type="number" min={0} max={31} step="0.5" value={f.days_worked} onChange={(e) => setF({ ...f, days_worked: e.target.value })} /></Field>}
        <Field label="Allowances / overtime / bonus (₱)"><Input type="number" min={0} step="0.01" value={f.allowances} onChange={(e) => setF({ ...f, allowances: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Other deductions (₱)" hint="Cash advance, lates…"><Input type="number" min={0} step="0.01" value={f.other_deductions} onChange={(e) => setF({ ...f, other_deductions: e.target.value })} /></Field>
          <Field label="Reason"><Input value={f.other_deductions_note} onChange={(e) => setF({ ...f, other_deductions_note: e.target.value })} /></Field>
        </div>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save payslip'}</Button></div>
      </form>
    </Modal>
  );
}

function PayPayslip({ slip, onClose, onDone }) {
  const [ref, setRef] = useState('');
  const cash = slip.payment_method === 'cash';
  const { busy, error, submit } = useSubmit(async () => { await api.post(`/payroll/payslips/${slip.id}/pay`, { payment_reference: cash ? undefined : ref }); onDone(); },
    'Marked as paid', { title: 'Mark as paid?', message: `${peso(slip.net_pay)} to ${slip.employee.full_name} by ${cash ? 'cash' : `${METHOD[slip.payment_method]} (${slip.ewallet_number})`}. This is recorded and can’t be undone.`, confirmLabel: 'Mark paid' });
  return (
    <Modal title="Mark salary as paid" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="rounded-lg bg-paper p-3 text-sm">
          <p className="font-semibold">{slip.employee.full_name}</p>
          <p className="font-display text-2xl font-bold">{peso(slip.net_pay)}</p>
          {cash ? <p className="text-muted">Hand over in cash.</p> : <p className="text-muted">Send by {METHOD[slip.payment_method]} to <b className="text-ink">{slip.ewallet_number}</b> ({slip.ewallet_account_name})</p>}
        </div>
        {!cash && <Field label={`${METHOD[slip.payment_method]} reference number`} hint="From the confirmation after you send it."><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>}
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || (!cash && ref.trim().length < 4)}>{busy ? 'Saving…' : 'Mark paid'}</Button></div>
      </form>
    </Modal>
  );
}

function PayslipView({ slip, run, onClose }) {
  const row = (label, value, strong) => <div className={cx('flex justify-between py-1', strong && 'border-t border-line pt-2 text-base font-bold')}><span>{label}</span><span>{value}</span></div>;
  return (
    <Modal title="Payslip" onClose={onClose} footer={<><Button variant="secondary" onClick={() => window.print()}>Print</Button><Button onClick={onClose}>Close</Button></>}>
      <div id="payslip" className="text-sm">
        <p className="font-display text-xl font-bold">Mavos</p>
        <p className="text-muted">Payslip · {dateOnly(run.period_start)} – {dateOnly(run.period_end)}</p>
        <p className="mt-3 font-semibold">{slip.employee.full_name}</p>
        <p className="text-muted">{slip.employee.position || ''} {slip.employee.branch?.name ? `· ${slip.employee.branch.name}` : ''}</p>
        <div className="rule my-3" />
        {row(slip.days_worked !== null ? `Basic pay (${slip.days_worked} days)` : 'Basic pay', peso(slip.basic_pay))}
        {slip.allowances > 0 && row('Allowances / overtime', peso(slip.allowances))}
        {row('Gross pay', peso(slip.gross_pay), true)}
        <p className="mt-3 text-muted">Deductions</p>
        {slip.sss > 0 && row('SSS', `−${peso(slip.sss)}`)}
        {slip.philhealth > 0 && row('PhilHealth', `−${peso(slip.philhealth)}`)}
        {slip.pagibig > 0 && row('Pag-IBIG', `−${peso(slip.pagibig)}`)}
        {slip.other_deductions > 0 && row(slip.other_deductions_note || 'Other deductions', `−${peso(slip.other_deductions)}`)}
        {slip.total_deductions === 0 && <p className="py-1 text-muted">None{slip.deductions_pending ? ' (government deductions not set up yet)' : ''}</p>}
        {row('Net pay', peso(slip.net_pay), true)}
        <p className="mt-3 text-muted">Paid by {methodLabel(slip.payment_method, slip.ewallet_number)}{slip.paid_at ? ` on ${dateOnly(slip.paid_at)}` : ' (not yet paid)'}{slip.payment_reference ? ` · ref ${slip.payment_reference}` : ''}</p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Rates */

const RATE_FIELDS = [
  ['sss_rate', 'SSS employee share', '%', true], ['sss_min_msc', 'SSS lowest salary credit', '₱'], ['sss_max_msc', 'SSS highest salary credit', '₱'],
  ['philhealth_rate', 'PhilHealth employee share', '%', true], ['philhealth_floor', 'PhilHealth salary floor', '₱'], ['philhealth_ceiling', 'PhilHealth salary ceiling', '₱'],
  ['pagibig_rate', 'Pag-IBIG employee share', '%', true], ['pagibig_low_rate', 'Pag-IBIG share for low salaries', '%', true],
  ['pagibig_low_threshold', '“Low salary” means up to', '₱'], ['pagibig_max_salary', 'Pag-IBIG maximum fund salary', '₱'],
  ['days_per_month', 'Working days per month (daily-paid staff)', 'days'],
];

function Rates() {
  const { data, loading, error, reload } = useAsync(() => api.get('/payroll/rates'), []);
  const [vals, setVals] = useState(null);
  useEffect(() => {
    if (!data) return;
    setVals(Object.fromEntries(RATE_FIELDS.map(([k, , , pct]) => [k, pct ? +(data.rates[k] * 100).toFixed(3) : data.rates[k]])));
  }, [data]);
  const { busy, error: err, submit } = useSubmit(async () => {
    await api.put('/payroll/rates', Object.fromEntries(RATE_FIELDS.map(([k, , , pct]) => [k, pct ? Number(vals[k]) / 100 : Number(vals[k])])));
    reload();
  }, 'Rates saved', { title: 'Save these contribution rates?', message: 'New payslips and recalculated drafts will use these numbers. Finalized payslips are not changed.', confirmLabel: 'Save rates', danger: true });
  if (loading || !vals) return <Spinner />;
  const resetDefaults = () => setVals(Object.fromEntries(RATE_FIELDS.map(([k, , , pct]) => [k, pct ? +(data.defaults[k] * 100).toFixed(3) : data.defaults[k]])));
  return (
    <form className="max-w-2xl" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <ErrorNote error={error} className="mb-3" />
      <p className="mb-4 rounded-lg bg-paper p-3 text-sm text-muted">These are the <b>employee</b> shares taken from pay. The starting values follow the published 2025–2026 schedules. Government rates change, so check the SSS, PhilHealth and Pag-IBIG websites and update them here when they do. Withholding tax and the employer’s share are not included.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {RATE_FIELDS.map(([k, label, unit]) => (
          <Field key={k} label={`${label} (${unit})`}><Input type="number" step="any" min={0} value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /></Field>))}
      </div>
      <ErrorNote error={err} className="mt-3" />
      <div className="mt-4 flex gap-2"><Button variant="secondary" onClick={resetDefaults}>Use the starting values</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save rates'}</Button></div>
    </form>
  );
}
