import React, { useState } from 'react';
import { Download, Terminal } from 'lucide-react';
import { useFaultline } from '../context/FaultlineContext';
import { Loading, ErrorPanel, NoProject, Explainer, VerdictBadge, Card } from '../components/Primitives';

export default function WebHunt() {
  const { project, results, risks, system, booting, error, reload, run } = useFaultline();
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('summary');

  if (booting) return <Loading label="Collecting evidence..." />;
  if (!project) return <NoProject page="The evidence locker" />;
  if (error && !risks) return <ErrorPanel message={error} onRetry={reload} />;

  const item = results.find((entry) => entry.id === selected) ?? results[0] ?? null;

  const download = (name, payload) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex justify-between items-end mb-2">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">WEB HUNT</h1>
          <p className="text-gray-400 font-mono text-sm mt-1 uppercase tracking-widest">
            Raw telemetry behind every verdict
          </p>
        </div>
        <div className="flex gap-3">
          {risks && <DownloadButton label="hypotheses.json" onClick={() => download('hypotheses.json', risks.risks)} />}
          {system && <DownloadButton label="system.json" onClick={() => download('system.json', system)} />}
          {results.length > 0 && <DownloadButton label="results.json" onClick={() => download('results.json', results)} />}
        </div>
      </div>

      <Explainer>
        Every verdict on the Investigation page comes from numbers on this page. Latency here is
        a windowed average, the change in total latency divided by the change in operation count
        between two reads, not the lifetime average the target reports. Counters are per-request
        rates over the same window. Anything more than three standard deviations from its
        baseline is highlighted.
      </Explainer>

      {run.log?.length > 0 && (
        <Card title="EXPERIMENT LOG" subtitle="what the run actually did" className="mb-8 max-w-5xl">
          <div className="flex items-center gap-2 mb-3">
            <Terminal size={12} className="text-gray-600" />
          </div>
          <div className="space-y-1 font-mono text-xs text-gray-400 max-h-56 overflow-y-auto">
            {run.log.map((line, index) => (
              <div key={index}><span className="text-gray-600">{line.t}</span> {line.message}</div>
            ))}
          </div>
        </Card>
      )}

      {!item ? (
        <div className="border border-dashed border-charcoal-700 rounded-lg p-12 text-center max-w-3xl">
          <p className="text-gray-300 mb-2">No telemetry captured yet.</p>
          <p className="text-xs font-mono text-gray-500">
            Run an experiment and the baseline and observed windows appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-6 flex-wrap">
            {results.map((entry) => (
              <button key={entry.id} onClick={() => setSelected(entry.id)}
                className={`px-4 py-2 rounded border text-xs font-mono uppercase tracking-widest transition-colors ${
                  entry.id === item.id ? 'border-fault-red text-fault-red bg-fault-red/10'
                    : 'border-charcoal-700 text-gray-400 hover:border-gray-500'}`}>
                {entry.id} {entry.target}
              </button>
            ))}
          </div>

          <div className="border border-charcoal-800 bg-charcoal-900/60 rounded-lg overflow-hidden max-w-5xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-charcoal-800">
              <div>
                <h3 className="text-sm font-bold text-white">{item.title}</h3>
                <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mt-1">
                  experiment "{item.experiment}" on {item.target}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex gap-1">
                  {['summary', 'samples'].map((mode) => (
                    <button key={mode} onClick={() => setView(mode)}
                      className={`px-3 py-1 rounded text-[10px] font-mono uppercase tracking-widest ${
                        view === mode ? 'bg-charcoal-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}>
                      {mode}
                    </button>
                  ))}
                </div>
                <VerdictBadge verdict={item.verdict} />
              </div>
            </div>

            {!item.baseline ? (
              <div className="p-6 text-sm text-gray-500">
                {item.note || item.error || 'No telemetry was captured for this finding.'}
              </div>
            ) : view === 'summary' ? (
              <SummaryTable item={item} />
            ) : (
              <SamplesTable item={item} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTable({ item }) {
  const keys = Object.keys(item.observed ?? {})
    .filter((key) => !key.endsWith('.completed')).sort();

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
          <th className="text-left px-6 py-3 font-normal">Signal</th>
          <th className="text-right px-6 py-3 font-normal">Baseline mean</th>
          <th className="text-right px-6 py-3 font-normal">Spread</th>
          <th className="text-right px-6 py-3 font-normal">Observed</th>
          <th className="text-right px-6 py-3 font-normal">Change</th>
          <th className="text-right px-6 py-3 font-normal">Sigma</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((key) => {
          const base = item.baseline[key];
          const mean = Array.isArray(base) ? base[0] : base;
          const spread = Array.isArray(base) ? base[1] : null;
          const observed = item.observed[key];
          const delta = typeof mean === 'number' && typeof observed === 'number' ? observed - mean : null;
          const sigma = delta !== null && spread ? Math.abs(delta) / spread : null;
          const notable = sigma !== null && sigma >= 3;

          return (
            <tr key={key} className="border-t border-charcoal-800/60">
              <td className="px-6 py-3 font-mono text-xs text-gray-300">{key}</td>
              <td className="px-6 py-3 text-right font-mono text-xs text-gray-500">{format(mean)}</td>
              <td className="px-6 py-3 text-right font-mono text-xs text-gray-600">{format(spread)}</td>
              <td className={`px-6 py-3 text-right font-mono text-xs ${notable ? 'text-fault-red font-bold' : 'text-gray-300'}`}>
                {format(observed)}
              </td>
              <td className={`px-6 py-3 text-right font-mono text-xs ${notable ? 'text-fault-red' : 'text-gray-600'}`}>
                {delta === null ? '—' : `${delta > 0 ? '+' : ''}${format(delta)}`}
              </td>
              <td className={`px-6 py-3 text-right font-mono text-xs ${notable ? 'text-fault-red' : 'text-gray-600'}`}>
                {sigma === null ? '—' : `${sigma.toFixed(1)}σ`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SamplesTable({ item }) {
  const samples = item.samples ?? [];
  if (!samples.length) {
    return <div className="p-6 text-sm text-gray-500">No per-sample trace stored for this run.</div>;
  }
  const keys = Object.keys(samples[0]).filter((key) => key !== 't' && !key.endsWith('.completed'));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
            <th className="text-left px-6 py-3 font-normal">Time</th>
            {keys.map((key) => (
              <th key={key} className="text-right px-4 py-3 font-normal whitespace-nowrap">{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {samples.map((sample, index) => (
            <tr key={index} className="border-t border-charcoal-800/60">
              <td className="px-6 py-2 font-mono text-xs text-gray-500">{sample.t}</td>
              {keys.map((key) => (
                <td key={key} className="px-4 py-2 text-right font-mono text-xs text-gray-300">
                  {format(sample[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function format(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'number') return String(value);
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
}

function DownloadButton({ label, onClick }) {
  return (
    <button onClick={onClick}
      className="border border-charcoal-700 hover:border-gray-500 text-gray-300 px-4 py-2 rounded text-[11px] font-mono uppercase tracking-widest flex items-center gap-2 transition-colors">
      <Download size={12} /> {label}
    </button>
  );
}
