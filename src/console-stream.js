// Fetch-based SSE keeps the local session token in a header, never in a URL.
export async function readConsoleEvents(body, onEvent, signal) {
  if (!body) throw new Error('Le flux de la console est indisponible.');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) return;
    while (!signal?.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      if (buffer.length > 2 * 1024 * 1024) throw new Error('Le flux de la console est trop volumineux. Reconnecte la console.');
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        let event;
        try { event = JSON.parse(data); } catch { throw new Error('Le serveur local a renvoyé un événement console invalide.'); }
        if (event && typeof event.type === 'string' && !signal?.aborted) onEvent(event);
      }
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
