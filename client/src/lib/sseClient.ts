/**
 * sseClient — Server-Sent Events over fetch().
 *
 * Native EventSource cannot send an Authorization header, which forced the app
 * to put bearer tokens in query strings (leaking through logs, proxies, and
 * browser history). This helper streams the same text/event-stream protocol via
 * fetch with proper headers, dispatches named events, and reconnects with
 * exponential backoff.
 */

export interface SseHandle {
  close: () => void;
}

interface Options {
  headers?: Record<string, string>;
  onEvent: (event: string, data: string) => void;
  onOpen?: () => void;
  onError?: (err: unknown) => void;
  /** max reconnect delay in ms (default 30s) */
  maxBackoffMs?: number;
}

export function openSseStream(url: string, opts: Options): SseHandle {
  let closed = false;
  let attempt = 0;
  let controller: AbortController | null = null;

  const connect = async () => {
    while (!closed) {
      controller = new AbortController();
      try {
        const res = await fetch(url, {
          headers: { Accept: 'text/event-stream', ...(opts.headers ?? {}) },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);

        attempt = 0;
        opts.onOpen?.();

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE messages are separated by a blank line
          let sep: number;
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const raw = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);

            let event = 'message';
            const dataLines: string[] = [];
            for (const line of raw.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
              // ignore comments (:) and id/retry fields
            }
            if (dataLines.length > 0 || event !== 'message') {
              opts.onEvent(event, dataLines.join('\n'));
            }
          }
        }
        // Stream ended normally — treat as disconnect and retry
        throw new Error('SSE stream ended');
      } catch (err) {
        if (closed) return;
        opts.onError?.(err);
        attempt += 1;
        const delay = Math.min(1000 * 2 ** attempt, opts.maxBackoffMs ?? 30_000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  };

  void connect();

  return {
    close: () => {
      closed = true;
      controller?.abort();
    },
  };
}
