const BASE = import.meta.env.VITE_API_BASE ?? '';

async function request(path, options = {}) {
  const response = await fetch(`${BASE}/api${path}`, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.detail || `${path} failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export const api = {
  health: () => request('/health'),
  project: () => request('/project'),
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/project/upload', { method: 'POST', body: form });
  },
  unload: () => request('/project', { method: 'DELETE' }),
  setTarget: (url) => request('/target', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }),
  targetHealth: () => request('/target/health'),
  system: () => request('/system'),
  risks: () => request('/risks'),
  results: () => request('/results'),
  runAll: () => request('/run', { method: 'POST' }),
  runOne: (riskId) => request(`/run?risk_id=${encodeURIComponent(riskId)}`, { method: 'POST' }),
  runStatus: () => request('/run/status'),
};

const SEVERITY = {
  CRITICAL: { text: 'text-fault-red', bg: 'bg-fault-red/10', border: 'border-fault-red/40' },
  HIGH: { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/40' },
  MEDIUM: { text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/40' },
  LOW: { text: 'text-gray-400', bg: 'bg-charcoal-800', border: 'border-charcoal-700' },
};

const VERDICT = {
  REPRODUCED: { text: 'text-fault-red', label: 'REPRODUCED',
    meaning: 'The predicted mechanism itself was measured, not just a side effect.' },
  PARTIAL: { text: 'text-orange-400', label: 'PARTIAL',
    meaning: 'The injected fault landed, but the signal that would prove the mechanism never breached.' },
  NOT_REPRODUCED: { text: 'text-green-400', label: 'NOT REPRODUCED',
    meaning: 'Nothing that was predicted crossed its threshold. The system held up.' },
  NOT_EXERCISED: { text: 'text-gray-400', label: 'NOT EXERCISED',
    meaning: 'The load never reached this component, so the hypothesis was not actually tested.' },
  NOT_TESTED: { text: 'text-gray-500', label: 'NOT TESTED',
    meaning: 'No experiment exists for this rule yet.' },
  ERROR: { text: 'text-yellow-400', label: 'ERROR',
    meaning: 'The experiment could not complete.' },
};

export const severityStyle = (severity) => SEVERITY[severity] ?? SEVERITY.LOW;
export const verdictStyle = (verdict) =>
  VERDICT[verdict] ?? { text: 'text-gray-500', label: verdict ?? 'NOT RUN',
                        meaning: 'This hypothesis has not been tested yet.' };
