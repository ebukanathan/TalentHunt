const pause = ms => new Promise(done => setTimeout(done, ms));
async function waitForRuntime({ fetcher = fetch, timeoutMs = 90000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (const url of ['http://localhost:4000/api/v1/health', 'http://localhost:4000/api/v1/competition',
    'http://localhost:3000/', 'http://localhost:3000/admin/login', 'http://localhost:3000/api/admin/auth/csrf']) {
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Integration readiness timed out.');
      try {
        const response = await fetcher(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(Math.min(remaining, 30000)) });
        // Consume the complete streamed response, not only its early HTTP 200.
        const text = await response.text();
        if (response.ok && (!url.endsWith('/csrf') || Boolean(JSON.parse(text).data?.csrfToken))) break;
      } catch { /* Allow only bounded startup delay; never restart a process. */ }
      await pause(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
    }
  }
}
module.exports = { waitForRuntime };
