import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Play, Loader2, FlaskConical, Wrench, ListChecks, Quote } from 'lucide-react';
import { useFaultline } from '../context/FaultlineContext';
import { Loading, ErrorPanel, NoProject, Explainer, SeverityBadge, VerdictBadge, RunLog } from '../components/Primitives';

export default function SpiderSense() {
  const { project, risks, target, booting, error, reload, run, startRun, resultFor } = useFaultline();
  const [open, setOpen] = useState(null);

  if (booting) return <Loading label="Sensing trouble..." />;
  if (!project) return <NoProject page="The hypothesis list" />;
  if (error && !risks) return <ErrorPanel message={error} onRetry={reload} />;
  if (!risks) return <Loading label="Generating hypotheses..." />;

  const running = run.state === 'running';
  const canRun = target?.reachable && target?.fault_injection;

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex justify-between items-end mb-2">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">SPIDER-SENSE</h1>
          <p className="text-gray-400 font-mono text-sm mt-1 uppercase tracking-widest">
            Predicted failure modes, derived from configuration
          </p>
        </div>
        <button onClick={() => startRun()} disabled={running || !canRun}
          className="bg-fault-red hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-[#fff] font-bold py-3 px-6 rounded flex items-center gap-2 uppercase tracking-widest text-xs border border-red-400">
          {running
            ? <><Loader2 size={14} className="animate-spin" /> {run.done}/{run.total}</>
            : <><Play size={14} /> Run all</>}
        </button>
      </div>

      <Explainer>
        Nothing on this page has been observed yet. Each entry is a prediction made purely by
        reading pool sizes, timeouts and retry counts out of your env file and combining them
        with the dependency graph. The score blends how dangerous the failure class is, how far
        the configuration sits past a safe limit, and how much of the system is downstream.
        Open one to see the arithmetic, the exact evidence it came from, and what measurement
        would prove or disprove it.
      </Explainer>

      <div className="space-y-4 max-w-5xl">
        {risks.risks.map((risk, index) => {
          const outcome = resultFor(risk.id);
          const expanded = open === risk.id;
          return (
            <motion.div key={risk.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.07 }}
              className="border border-charcoal-800 bg-charcoal-900/60 rounded-lg overflow-hidden">
              <button onClick={() => setOpen(expanded ? null : risk.id)}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-charcoal-800/40 transition-colors">
                <span className="font-mono text-xs text-gray-500 w-16">{risk.id}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-base text-white font-semibold">{risk.title}</p>
                  <p className="text-[11px] font-mono text-gray-500 uppercase tracking-wider mt-1">
                    target {risk.target} · experiment "{risk.experiment}"
                  </p>
                </div>
                <SeverityBadge severity={risk.severity} score={risk.score} />
                <div className="w-28 text-right"><VerdictBadge verdict={outcome?.verdict} /></div>
                <ChevronDown size={18}
                  className={`text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {expanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} className="border-t border-charcoal-800">
                    <div className="p-6 space-y-6">
                      <Block icon={Quote} label="What FaultLine thinks will happen">
                        <p className="text-sm text-gray-300 leading-relaxed">{risk.why}</p>
                      </Block>

                      <div className="grid grid-cols-2 gap-6">
                        <Block icon={ListChecks} label="Evidence it was derived from">
                          <ul className="space-y-1.5">
                            {risk.evidence.map((line) => (
                              <li key={line} className="text-xs font-mono text-gray-400">
                                <span className="text-gray-600 mr-2">·</span>{line}
                              </li>
                            ))}
                          </ul>
                        </Block>
                        <Block icon={FlaskConical} label="What would prove it">
                          <ul className="space-y-1.5">
                            {risk.expect.map((line) => (
                              <li key={line} className="text-xs font-mono text-gray-400">
                                <span className="text-gray-600 mr-2">·</span>{line}
                              </li>
                            ))}
                          </ul>
                        </Block>
                      </div>

                      {risk.fix && (
                        <Block icon={Wrench} label="How to reduce this risk">
                          <ul className="space-y-1.5">
                            {risk.fix.map((line) => (
                              <li key={line} className="text-sm text-gray-300 flex gap-2">
                                <span className="text-gray-600">·</span>{line}
                              </li>
                            ))}
                          </ul>
                        </Block>
                      )}

                      <div className="flex items-center justify-between pt-4 border-t border-charcoal-800">
                        <p className="text-[11px] font-mono text-gray-500">
                          if {risk.target} fails, this reaches:{' '}
                          {risk.blast_radius.join(', ') || 'nothing downstream'}
                        </p>
                        <button onClick={() => startRun(risk.id)} disabled={running || !canRun}
                          className="border border-fault-red/40 hover:bg-fault-red/10 disabled:opacity-40 disabled:cursor-not-allowed text-fault-red px-4 py-2 rounded text-[11px] font-mono uppercase tracking-widest flex items-center gap-2">
                          <Play size={12} /> Test this one
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {!canRun && (
        <p className="mt-6 text-[11px] font-mono text-gray-500 max-w-5xl">
          Experiments are disabled because no running instance is connected. Set one on the
          Overview page.
        </p>
      )}

      {running && <div className="mt-8 max-w-5xl"><RunLog log={run.log} /></div>}
    </div>
  );
}

function Block({ icon: Icon, label, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={12} className="text-gray-600" />
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{label}</span>
      </div>
      {children}
    </div>
  );
}
