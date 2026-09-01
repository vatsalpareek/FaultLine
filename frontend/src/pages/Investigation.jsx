import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Crosshair, GitBranch, FlaskConical, Wrench, Check, Minus } from 'lucide-react';
import { useFaultline } from '../context/FaultlineContext';
import { verdictStyle } from '../lib/api';
import { Loading, ErrorPanel, NoProject, Explainer, SeverityBadge, VerdictBadge, Card } from '../components/Primitives';

export default function Investigation() {
  const { project, results, ranAt, booting, error, reload } = useFaultline();
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!selected && results.length) setSelected(results[0].id);
  }, [results, selected]);

  if (booting) return <Loading label="Reconstructing the incident..." />;
  if (!project) return <NoProject page="The investigation report" />;
  if (error && !results.length) return <ErrorPanel message={error} onRetry={reload} />;

  if (!results.length) {
    return (
      <div className="h-full p-8">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">INVESTIGATION</h1>
        <p className="text-gray-400 font-mono text-sm mb-8 uppercase tracking-widest">
          Prediction against measurement
        </p>
        <Explainer>
          This page fills in once experiments have run. It shows, side by side, what FaultLine
          predicted before touching the system and what the telemetry actually recorded while
          the fault was active.
        </Explainer>
        <div className="border border-dashed border-charcoal-700 rounded-lg p-12 text-center max-w-3xl">
          <p className="text-gray-300 mb-2">No experiments have been run for this project yet.</p>
          <p className="text-xs font-mono text-gray-500">
            Connect a running instance on Overview, then run the experiments.
          </p>
        </div>
      </div>
    );
  }

  const item = results.find((entry) => entry.id === selected) ?? results[0];
  const style = verdictStyle(item.verdict);

  return (
    <div className="h-full flex overflow-hidden">
      <aside className="w-72 border-r border-charcoal-800 bg-charcoal-900/50 overflow-y-auto shrink-0">
        <div className="p-6 border-b border-charcoal-800">
          <h2 className="text-sm font-bold text-white tracking-wide">FINDINGS</h2>
          <p className="text-[10px] font-mono text-gray-500 mt-1">
            {ranAt ? new Date(ranAt).toLocaleString() : ''}
          </p>
        </div>
        {results.map((entry) => (
          <button key={entry.id} onClick={() => setSelected(entry.id)}
            className={`w-full text-left px-6 py-4 border-b border-charcoal-800 transition-colors ${
              entry.id === item.id ? 'bg-fault-red/10 border-l-2 border-l-fault-red' : 'hover:bg-charcoal-800/50'}`}>
            <div className="flex justify-between items-center mb-1">
              <span className="font-mono text-[11px] text-gray-500">{entry.id}</span>
              <VerdictBadge verdict={entry.verdict} />
            </div>
            <p className="text-sm text-gray-200 leading-tight">{entry.title}</p>
            <p className="text-[10px] font-mono text-gray-500 uppercase mt-1">{entry.target}</p>
          </button>
        ))}
      </aside>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">{item.title}</h1>
            <p className="text-gray-400 font-mono text-sm mt-1 uppercase tracking-widest">
              {item.id} · target {item.target} · experiment "{item.experiment}"
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SeverityBadge severity={item.severity} score={item.score} />
            <span className={`text-xl font-bold font-mono ${style.text}`}>{style.label}</span>
          </div>
        </div>

        <div className="border-l-2 border-fault-red pl-4 mb-8 max-w-3xl">
          <p className="text-sm text-gray-300">{style.meaning}</p>
          {item.verdict_reason && (
            <p className="text-xs font-mono text-gray-500 mt-2">{item.verdict_reason}</p>
          )}
        </div>

        {(item.note || item.error) && (
          <Card title="WHY NOTHING WAS MEASURED" subtitle="this hypothesis was not disproved"
            className="mb-8 max-w-3xl">
            <p className="text-sm text-gray-300">{item.note || item.error}</p>
          </Card>
        )}

        {/* 1. the prediction */}
        <Card title="1 · THE PREDICTION" subtitle="written before anything was touched" className="mb-6">
          <p className="text-sm text-gray-300 leading-relaxed mb-5">{item.why}</p>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2">
                Configuration it was derived from
              </p>
              <ul className="space-y-1">
                {item.evidence.map((line) => (
                  <li key={line} className="text-xs font-mono text-gray-400">
                    <span className="text-gray-600 mr-2">·</span>{line}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2">
                Blast radius from the graph
              </p>
              <div className="flex flex-wrap gap-2">
                {item.blast_radius.length ? item.blast_radius.map((node) => (
                  <span key={node}
                    className="px-2 py-1 rounded border border-charcoal-700 text-xs font-mono uppercase text-gray-300">
                    <GitBranch size={10} className="inline mr-1" />{node}
                  </span>
                )) : <span className="text-xs text-gray-500 italic">nothing downstream</span>}
              </div>
            </div>
          </div>
        </Card>

        {/* 2. what was actually done */}
        {item.baseline && (
          <Card title="2 · WHAT WAS DONE TO THE SYSTEM" subtitle="method, so the result is reproducible"
            className="mb-6">
            <div className="grid grid-cols-3 gap-6">
              <Method icon={FlaskConical} label="Baseline"
                value={`${item.baseline[`${item.target}.completed`] ?? '—'} operations`}
                detail="steady state captured before the fault, used as the comparison" />
              <Method icon={FlaskConical} label="Fault injected"
                value={item.experiment}
                detail={`latency injected into ${item.target} while traffic ran`} />
              <Method icon={FlaskConical} label="Observation window"
                value={`${item.samples?.length ?? 0} samples`}
                detail="telemetry read repeatedly while load was sustained" />
            </div>
          </Card>
        )}

        {/* 3. predicted vs observed, per check */}
        {item.anomalies && (
          <Card title="3 · PREDICTED AGAINST MEASURED" subtitle="each predicted signal, checked"
            className="mb-6">
            <PredictionTable item={item} />
          </Card>
        )}

        {/* 4. timeline */}
        {item.anomalies?.length > 0 && (
          <Card title="4 · CAUSAL CHAIN" subtitle="ordered by when each signal first breached"
            className="mb-6">
            <div className="space-y-0">
              {item.anomalies.map((anomaly, index) => (
                <motion.div key={`${anomaly.component}-${anomaly.metric}`}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-fault-red mt-2" />
                    {index < item.anomalies.length - 1 && (
                      <div className="w-px flex-1 bg-charcoal-700 min-h-10" />
                    )}
                  </div>
                  <div className="pb-5">
                    <p className="font-mono text-[11px] text-gray-500">
                      {String(anomaly.timestamp).slice(11, 19)}
                    </p>
                    <p className="text-sm text-gray-200">
                      <span className="font-mono">{anomaly.component}.{anomaly.metric}</span>
                      {' '}moved from {anomaly.baseline_value} to{' '}
                      <span className="text-fault-red font-bold">{anomaly.value}</span>
                    </p>
                    <p className="text-xs text-gray-500">{anomaly.reason}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
        )}

        {/* 5. root cause + blast radius */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <Card title="5 · ROOT CAUSE" subtitle="from anomaly timing and the dependency graph">
            {item.root_cause ? (
              <>
                <div className="flex items-baseline gap-3 mb-4">
                  <Crosshair size={16} className="text-fault-red" />
                  <span className="text-xl font-bold text-white uppercase">{item.root_cause}</span>
                  <span className="text-xs font-mono text-gray-500">
                    confidence {Math.round((item.root_cause_confidence ?? 0) * 100)}%
                  </span>
                </div>
                <ul className="space-y-1.5 mb-4">
                  {(item.root_cause_evidence ?? []).map((line) => (
                    <li key={line} className="text-xs text-gray-400 flex gap-2">
                      <span className="text-gray-600">·</span>{line}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-gray-500 leading-relaxed border-t border-charcoal-800 pt-3">
                  Confidence rises when a downstream component also shows anomalies of its own.
                  A single-component anomaly scores lower on purpose: the propagation was
                  predicted but not measured.
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500 italic">No root cause determined.</p>
            )}
          </Card>

          <Card title="BLAST RADIUS" subtitle="predicted against observed">
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2">
                  Predicted from the graph
                </p>
                <div className="flex flex-wrap gap-2">
                  {item.blast_radius.length ? item.blast_radius.map((node) => (
                    <span key={node}
                      className="px-2 py-1 rounded border border-charcoal-700 text-xs font-mono uppercase text-gray-300">
                      {node}
                    </span>
                  )) : <span className="text-xs text-gray-500 italic">nothing downstream</span>}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2">
                  Observed with anomalies of their own
                </p>
                <div className="flex flex-wrap gap-2">
                  {item.affected?.length ? item.affected.map((node) => (
                    <span key={node}
                      className="px-2 py-1 rounded border border-fault-red/40 bg-fault-red/10 text-xs font-mono uppercase text-fault-red">
                      {node}
                    </span>
                  )) : <span className="text-xs text-gray-500 italic">none</span>}
                </div>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed border-t border-charcoal-800 pt-3">
                These two lists are different claims. The first is what the dependency graph
                says could be reached. The second is what telemetry actually caught moving.
              </p>
            </div>
          </Card>
        </div>

        {/* 6. remediation */}
        {item.fix && (
          <Card title="6 · WHAT TO DO ABOUT IT" subtitle="derived from the same configuration"
            className="mb-8">
            <ul className="space-y-2">
              {item.fix.map((line) => (
                <li key={line} className="text-sm text-gray-300 flex gap-3">
                  <Wrench size={13} className="text-gray-600 mt-1 shrink-0" />{line}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

/** Matches each predicted symptom to the signal that was measured for it. */
function PredictionTable({ item }) {
  const anomalies = item.anomalies ?? [];
  const matched = (line) => anomalies.find((anomaly) => {
    const words = line.toLowerCase();
    return words.includes(anomaly.component) && words.includes(anomaly.metric.split('.')[0]);
  });

  return (
    <table className="w-full">
      <thead>
        <tr className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
          <th className="text-left pb-3 font-normal">Predicted</th>
          <th className="text-left pb-3 font-normal">Signal</th>
          <th className="text-right pb-3 font-normal">Baseline</th>
          <th className="text-right pb-3 font-normal">Measured</th>
          <th className="text-right pb-3 font-normal">Result</th>
        </tr>
      </thead>
      <tbody>
        {item.expect.map((line) => {
          const hit = matched(line);
          return (
            <tr key={line} className="border-t border-charcoal-800/60">
              <td className="py-3 pr-4 text-sm text-gray-300">{line}</td>
              <td className="py-3 pr-4 font-mono text-xs text-gray-500">
                {hit ? `${hit.component}.${hit.metric}` : '—'}
              </td>
              <td className="py-3 text-right font-mono text-xs text-gray-500">
                {hit ? hit.baseline_value : '—'}
              </td>
              <td className={`py-3 text-right font-mono text-xs ${hit ? 'text-fault-red font-bold' : 'text-gray-600'}`}>
                {hit ? hit.value : '—'}
              </td>
              <td className="py-3 text-right">
                {hit
                  ? <span className="inline-flex items-center gap-1 text-[10px] font-mono text-fault-red uppercase">
                      <Check size={11} /> confirmed
                    </span>
                  : <span className="inline-flex items-center gap-1 text-[10px] font-mono text-gray-600 uppercase">
                      <Minus size={11} /> not seen
                    </span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Method({ icon: Icon, label, value, detail }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={12} className="text-gray-600" />
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-sm text-gray-200 mb-1">{value}</p>
      <p className="text-[11px] text-gray-500 leading-relaxed">{detail}</p>
    </div>
  );
}

