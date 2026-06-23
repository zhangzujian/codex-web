type FetchTarget = {
  fetch?: typeof fetch;
  Response?: typeof Response;
};

function fetchInputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string" || input instanceof URL) {
    return String(input);
  }

  return typeof input.url === "string" ? input.url : "";
}

export function installSentryIpcFetchNoop(target: FetchTarget = globalThis): void {
  const fetch = target.fetch?.bind(target);
  const ResponseCtor = target.Response;

  if (typeof fetch !== "function" || typeof ResponseCtor !== "function") {
    return;
  }

  target.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    fetchInputUrl(input).startsWith("sentry-ipc:")
      ? Promise.resolve(new ResponseCtor(null, { status: 204 }))
      : fetch(input, init)) as typeof fetch;
}
