import { useState } from 'react';
import { cx } from './ui';

/**
 * Simple responsive bar chart. Hover, tap or focus a bar to read its value.
 * data: [{ label, value }]
 */
export default function BarChart({ data, format = (v) => v, height = 'h-44' }) {
  const [active, setActive] = useState(null);
  if (!data.length) return <p className="py-8 text-center text-sm text-muted">No sales in this period yet.</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const shown = active !== null ? data[active] : null;
  const dense = data.length > 20;
  return (
    <div>
      <p className="mb-3 min-h-6 text-sm" aria-live="polite">
        {shown ? <><span className="text-muted">{shown.label}</span> <b className="ml-1 font-display text-lg">{format(shown.value)}</b></> : <span className="text-muted">Tap a bar to see the amount.</span>}
      </p>
      <div className={cx('flex items-end', dense ? 'gap-0.5' : 'gap-1.5', height)} onMouseLeave={() => setActive(null)}>
        {data.map((d, i) => (
          <button key={d.label + i} type="button" aria-label={`${d.label}: ${format(d.value)}`}
            onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)}
            className="group flex h-full min-w-0 flex-1 items-end outline-none">
            <span style={{ height: `${d.value > 0 ? Math.max((d.value / max) * 100, 3) : 0}%` }}
              className={cx('block w-full rounded-t-md transition-colors', active === i ? 'bg-ledger' : 'bg-ledger/45 group-hover:bg-ledger/70 group-focus-visible:bg-ledger')} />
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted"><span>{data[0].label}</span><span>{data[data.length - 1].label}</span></div>
    </div>
  );
}
