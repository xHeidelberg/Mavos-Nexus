const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
export const peso = (n) => money.format(Number(n || 0));
export const dateTime = (d) => (d ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
export const dateOnly = (d) => (d ? new Date(d).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '');
export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
export const variantName = (v, p) => `${p?.name ?? v.product ?? ''}${v.label ? ` (${v.label})` : ''}`;
export const uuid = () =>
  crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });
