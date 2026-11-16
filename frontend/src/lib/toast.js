// Tiny event bus so any file can show a toast or ask for confirmation without prop drilling.
const bus = new EventTarget();
const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

export const toast = {
  success: (message) => emit('toast', { type: 'success', message, id: Math.random() }),
  error: (message) => emit('toast', { type: 'error', message, id: Math.random() }),
  info: (message) => emit('toast', { type: 'info', message, id: Math.random() }),
};

/** await confirm({ title, message, confirmLabel, danger }) -> true | false */
export const confirm = (opts) => new Promise((resolve) => emit('confirm', { ...opts, resolve }));

export const listen = (name, fn) => {
  const h = (e) => fn(e.detail);
  bus.addEventListener(name, h);
  return () => bus.removeEventListener(name, h);
};
