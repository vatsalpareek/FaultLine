import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Loader2, Upload, FileArchive, X, Plug, CheckCircle2, XCircle } from 'lucide-react';
import { useFaultline } from '../context/FaultlineContext';
import { Loading, ErrorPanel, SeverityBadge, VerdictBadge, RunLog, Card } from '../components/Primitives';

export default function Overview() {
  const {
    project, system, risks, results, ranAt, target, booting, busy, error, run,
    uploadProject, unloadProject, updateTarget, refreshTarget, startRun, reload, clearError,
  } = useFaultline();

  if (booting) return <Loading label="Connecting to FaultLine..." />;
  if (error && !project) return <ErrorPanel message={error} onRetry={reload} />;
  if (!project) return <UploadView onUpload={uploadProject} busy={busy} error={error} clearError={clearError} />;

  return (
    <Dashboard
      project={project} system={system} risks={risks} results={results} ranAt={ranAt}
      target={target} run={run} error={error} busy={busy}
      onUnload={unloadProject} onTarget={updateTarget} onRefreshTarget={refreshTarget}
      onRun={startRun}
    />
  );
}

/* ---------------------------------------------------------------- upload */

function UploadView({ onUpload, busy, error, clearError }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handle = (file) => {
    if (!file) return;
    clearError();
    onUpload(file);
  };

  return (
    <div className="h-full overflow-y-auto flex flex-col items-center justify-center p-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full text-center">
        <h1 className="text-4xl font-bold text-white mb-3 tracking-tight leading-tight">
          Find the failure before <span className="text-fault-red">production does.</span>
        </h1>
        <p className="text-gray-400 mb-10 leading-relaxed">
          Upload your system's configuration. FaultLine reads how the services depend on each
          other, works out where it should break under load, then breaks it on purpose to find
          out whether it was right.
        </p>

        <div
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            handle(event.dataTransfer.files?.[0]);
          }}
          onClick={() => input.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-14 transition-colors ${
            dragging ? 'border-fault-red bg-fault-red/5' : 'border-charcoal-700 hover:border-gray-500'
          }`}
        >
          <input ref={input} type="file" accept=".zip" className="hidden"
            onChange={(event) => handle(event.target.files?.[0])} />
          {busy ? (
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <Loader2 size={26} className="animate-spin text-fault-red" />
              <span className="font-mono text-xs uppercase tracking-widest">Parsing project...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload size={26} className="text-gray-500" />
              <span className="text-gray-200 font-semibold">Drop a .zip here, or click to choose</span>
              <span className="text-xs font-mono text-gray-500">
                must contain a Compose file and an env file
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-5 border border-fault-red/40 bg-fault-red/5 rounded-lg p-4 text-left flex gap-3">
            <X size={14} className="text-fault-red mt-0.5 shrink-0" />
            <p className="text-sm text-gray-300">{error}</p>
          </div>
        )}

        <div className="mt-10 text-left border border-charcoal-800 rounded-lg p-6">
          <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-4">
            what the zip needs to contain
          </p>
          <pre className="font-mono text-xs text-gray-400 leading-relaxed">{`your-project.zip
├── docker-compose.yml     services and depends_on
└── .env.example           timeouts, pool sizes, retry counts`}</pre>
          <p className="text-xs text-gray-500 mt-4 leading-relaxed">
            Nested folders are fine, FaultLine will find the files. Everything on the other
            pages stays empty until a project is loaded. A sample project,{' '}
            <span className="text-gray-300 font-mono">orderflow-sample.zip</span>, ships with
            the repository if you want to try it without wiring up your own.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------- dashboard */

function Dashboard({ project, system, risks, results, ranAt, target, run, error, busy,
                     onUnload, onTarget, onRefreshTarget, onRun }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState(project.target_url ?? '');
  const running = run.state === 'running';
  const canRun = target?.reachable && target?.fault_injection;

  const tested = results.filter((item) =>
    ['REPRODUCED', 'PARTIAL', 'NOT_REPRODUCED'].includes(item.verdict)).length;
  const reproduced = results.filter((item) => item.verdict === 'REPRODUCED').length;

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-5xl">
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <FileArchive size={16} className="text-fault-red" />
              <h1 className="text-2xl font-bold text-white tracking-tight">{project.name}</h1>
            </div>
            <p className="text-xs font-mono text-gray-500">
              {project.compose_file} + {project.env_file} · {system?.nodes.length} components ·
              uploaded {new Date(project.uploaded_at).toLocaleTimeString()}
            </p>
          </div>
          <button onClick={onUnload}
            className="border border-charcoal-700 hover:border-fault-red text-gray-400 hover:text-fault-red px-4 py-2 rounded text-[11px] font-mono uppercase tracking-widest transition-colors">
            Upload different project
          </button>
        </div>

        <div className="grid grid-cols-4 gap-6 mb-8">
          <Stat value={risks?.system_risk_score ?? 0} label="System risk score" highlight
            hint="highest scoring hypothesis" />
          <Stat value={system?.nodes.length ?? 0} label="Components" hint="from the Compose file" />
          <Stat value={risks?.risks.length ?? 0} label="Hypotheses" hint="predicted failure modes" />
          <Stat value={tested ? `${reproduced}/${tested}` : '0/0'} label="Reproduced"
            hint="confirmed by experiment" />
        </div>

        {/* stage 2: connect a running instance */}
        <Card title="STAGE 2 · CONNECT THE RUNNING SYSTEM"
          subtitle="hypotheses need no instance, experiments do"
          className="mb-6">
          <p className="text-xs text-gray-400 leading-relaxed mb-4">
            FaultLine has already read your configuration, so the hypotheses below are ready.
            To test them it needs to reach a running copy of the system that exposes a
            <span className="font-mono text-gray-300"> /metrics</span> endpoint and
            <span className="font-mono text-gray-300"> /internal/fault/*</span> injection routes.
          </p>
          <div className="flex gap-3 items-center">
            <input value={url} onChange={(event) => setUrl(event.target.value)}
              placeholder="http://127.0.0.1:8000"
              className="flex-1 bg-charcoal-800 border border-charcoal-700 focus:border-gray-500 rounded px-4 py-2 text-sm font-mono text-gray-200 outline-none" />
            <button onClick={() => onTarget(url)} disabled={busy}
              className="border border-charcoal-700 hover:border-gray-500 text-gray-300 px-4 py-2 rounded text-[11px] font-mono uppercase tracking-widest flex items-center gap-2">
              <Plug size={12} /> Connect
            </button>
            <button onClick={onRefreshTarget}
              className="text-[11px] font-mono uppercase tracking-widest text-gray-500 hover:text-gray-300">
              Recheck
            </button>
          </div>
          <div className="mt-4 flex items-start gap-2 text-xs">
            {target?.reachable ? (
              <>
                <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
                <span className="text-gray-400">
                  Reachable. Telemetry for {target.components?.join(', ')}.
                  {!target.fault_injection && (
                    <span className="text-orange-400"> {target.note}</span>
                  )}
                </span>
              </>
            ) : (
              <>
                <XCircle size={14} className="text-gray-500 mt-0.5 shrink-0" />
                <span className="text-gray-500">
                  Not reachable at {target?.target_url ?? url}. You can still read every
                  hypothesis; only the experiments are blocked.
                </span>
              </>
            )}
          </div>
        </Card>

        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => onRun()} disabled={running || !canRun}
            className="bg-fault-red hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-[#fff] font-bold py-4 px-8 rounded flex items-center gap-3 uppercase tracking-widest text-sm border border-red-400 shadow-[0_0_20px_rgba(255,51,51,0.3)]">
            {running
              ? <><Loader2 size={16} className="animate-spin" /> Running {run.done}/{run.total}</>
              : <><Play size={16} /> Run all experiments</>}
          </button>
          <button onClick={() => navigate('/spider-sense')}
            className="border border-charcoal-700 hover:border-gray-500 text-gray-300 py-4 px-6 rounded uppercase tracking-widest text-sm transition-colors">
            Read the hypotheses
          </button>
          {!canRun && (
            <span className="text-[11px] font-mono text-gray-500">
              connect a running instance to enable experiments
            </span>
          )}
        </div>

        {error && (
          <div className="mb-8 border border-fault-red/40 bg-fault-red/5 rounded-lg p-4 text-sm text-gray-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-6 mb-8">
          <Card title="PREDICTED FAILURES" subtitle="ranked by severity score" className="col-span-2">
            <div className="space-y-3">
              {(risks?.risks ?? []).map((risk, index) => {
                const outcome = results.find((item) => item.id === risk.id);
                return (
                  <motion.button key={risk.id}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.06 }}
                    onClick={() => navigate(outcome ? '/investigation' : '/spider-sense')}
                    className="w-full text-left flex items-center gap-4 p-4 rounded border border-charcoal-800 hover:border-gray-600 transition-colors">
                    <span className="font-mono text-xs text-gray-500 w-16">{risk.id}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-100 truncate">{risk.title}</p>
                      <p className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">
                        target {risk.target}
                      </p>
                    </div>
                    <SeverityBadge severity={risk.severity} score={risk.score} />
                    <div className="w-28 text-right"><VerdictBadge verdict={outcome?.verdict} /></div>
                  </motion.button>
                );
              })}
            </div>
          </Card>

          <Card title="SYSTEM STATUS" subtitle="from open hypotheses">
            <div className="flex flex-col items-center justify-center py-6">
              <div className={`w-3 h-3 rounded-full mb-3 ${
                risks?.status === 'STABLE' ? 'bg-green-500' : 'bg-fault-red animate-pulse'}`} />
              <span className={`text-2xl font-bold tracking-wide ${
                risks?.status === 'STABLE' ? 'text-green-400' : 'text-fault-red'}`}>
                {risks?.status}
              </span>
              <span className="text-[10px] font-mono text-gray-500 mt-2">
                {ranAt ? `last run ${new Date(ranAt).toLocaleTimeString()}` : 'no experiments run'}
              </span>
            </div>
            <div className="space-y-2 pt-4 border-t border-charcoal-800">
              {Object.entries(risks?.counts ?? {}).map(([severity, count]) => (
                <div key={severity} className="flex justify-between text-xs font-mono">
                  <span className="text-gray-500">{severity}</span>
                  <span className={count ? 'text-gray-200' : 'text-gray-600'}>{count}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {running && <RunLog log={run.log} />}
      </div>
    </div>
  );
}

function Stat({ value, label, hint, highlight }) {
  return (
    <motion.div whileHover={{ y: -4 }}
      className={`p-6 rounded-lg border ${highlight ? 'border-fault-red/50 bg-fault-red/5' : 'border-charcoal-800 bg-charcoal-900'} flex flex-col relative overflow-hidden`}>
      <span className={`text-4xl font-bold mb-2 ${highlight ? 'text-fault-red' : 'text-white'}`}>
        {value}
      </span>
      <span className="text-xs text-gray-500 font-mono tracking-wider uppercase">{label}</span>
      {hint && <span className="text-[10px] text-gray-600 mt-1">{hint}</span>}
      {highlight && <div className="absolute top-0 right-0 w-16 h-16 bg-fault-red/20 blur-2xl rounded-full" />}
    </motion.div>
  );
}
