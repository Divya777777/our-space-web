/** Set by lib/online.ts so requests can report connectivity without importing it. */
export const networkHooks = { failure: () => {}, success: () => {} };
// Retry reads only by default. Mutations must explicitly establish replay safety.
export type RequestOptions = { retry?: boolean; timeoutMs?: number; attempts?: number; retryDelayMs?: number };
export function isTransient(error: unknown) {
  const status = (error as { status?: number })?.status;
  return status === undefined || [408, 502, 503, 504].includes(status);
}
function cancelled() { return Object.assign(new Error('Request cancelled'), { name: 'AbortError' }); }
function pause(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const abort = () => { clearTimeout(timer); reject(cancelled()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export async function jsonRequest<T>(url: string, body?: unknown, token?: string, method?: string, signal?: AbortSignal, options: RequestOptions = {}): Promise<T> {
  const verb = method || (body !== undefined ? 'POST' : 'GET');
  const retry = options.retry ?? (verb === 'GET');
  const attempts = retry ? options.attempts ?? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal?.aborted) throw cancelled();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 25000);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    let failure: unknown;
    try {
      const response = await fetch(url, {
        method: verb, headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined, signal: controller.signal,
      });
      networkHooks.success();
      const data = await response.json().catch(() => null);
      if (!response.ok) throw Object.assign(new Error(data?.error || (response.status === 429 ? 'Too many requests. Please wait a moment.' : `Request failed (${response.status})`)), { status: response.status, code: data?.code, limit: data?.limit });
      if (data === null) throw Object.assign(new Error('The server returned an incomplete response.'), { status: 502 });
      return data;
    } catch (error) { failure = error; }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    if (signal?.aborted) throw cancelled();
    if ((failure as { status?: number })?.status === undefined) networkHooks.failure();
    if (!isTransient(failure)) throw failure;
    if (attempt + 1 < attempts) { await pause((options.retryDelayMs ?? 400) * (attempt + 1), signal); continue; }
    throw Object.assign(new Error('Could not reach Our Space. Check your connection and try again.'), { status: (failure as { status?: number })?.status, cause: failure });
  }
  throw new Error('Could not complete the request.');
}
