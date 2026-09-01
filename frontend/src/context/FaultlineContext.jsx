import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

const FaultlineContext = createContext(null);

export function FaultlineProvider({ children }) {
  const [project, setProject] = useState(null);
  const [system, setSystem] = useState(null);
  const [risks, setRisks] = useState(null);
  const [results, setResults] = useState([]);
  const [ranAt, setRanAt] = useState(null);
  const [target, setTarget] = useState(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [run, setRun] = useState({ state: 'idle', log: [], done: 0, total: 0 });
  const poll = useRef(null);

  const loadAnalysis = useCallback(async () => {
    const [systemPayload, riskPayload, resultPayload] = await Promise.all([
      api.system(), api.risks(), api.results(),
    ]);
    setSystem(systemPayload);
    setRisks(riskPayload);
    setResults(resultPayload.results ?? []);
    setRanAt(resultPayload.ran_at ?? null);
    api.targetHealth().then(setTarget).catch(() => setTarget(null));
  }, []);

  const boot = useCallback(async () => {
    setBooting(true);
    setError(null);
    try {
      const current = await api.project();
      setProject(current.loaded ? current : null);
      if (current.loaded) await loadAnalysis();
    } catch (bootError) {
      setError(bootError.message);
    } finally {
      setBooting(false);
    }
  }, [loadAnalysis]);

  useEffect(() => { boot(); }, [boot]);

  const uploadProject = useCallback(async (file) => {
    setBusy(true);
    setError(null);
    try {
      const uploaded = await api.upload(file);
      setProject(uploaded);
      setResults([]);
      setRanAt(null);
      setRun({ state: 'idle', log: [], done: 0, total: 0 });
      await loadAnalysis();
      return true;
    } catch (uploadError) {
      setError(uploadError.message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [loadAnalysis]);

  const unloadProject = useCallback(async () => {
    await api.unload().catch(() => {});
    setProject(null);
    setSystem(null);
    setRisks(null);
    setResults([]);
    setRanAt(null);
    setTarget(null);
    setError(null);
  }, []);

  const updateTarget = useCallback(async (url) => {
    setBusy(true);
    try {
      const health = await api.setTarget(url);
      setTarget(health);
      setProject((current) => ({ ...current, target_url: health.target_url }));
    } catch (targetError) {
      setError(targetError.message);
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshTarget = useCallback(() => {
    api.targetHealth().then(setTarget).catch(() => setTarget(null));
  }, []);

  useEffect(() => {
    if (run.state !== 'running') { clearInterval(poll.current); return undefined; }
    poll.current = setInterval(async () => {
      try {
        const status = await api.runStatus();
        setRun(status);
        if (status.state === 'done') {
          clearInterval(poll.current);
          const payload = await api.results();
          setResults(payload.results ?? []);
          setRanAt(payload.ran_at ?? null);
        }
      } catch { clearInterval(poll.current); }
    }, 1200);
    return () => clearInterval(poll.current);
  }, [run.state]);

  const startRun = useCallback(async (riskId) => {
    setError(null);
    try {
      await (riskId ? api.runOne(riskId) : api.runAll());
      setRun({ state: 'running', log: [], done: 0, total: 0 });
      return true;
    } catch (runError) {
      setError(runError.message);
      refreshTarget();
      return false;
    }
  }, [refreshTarget]);

  const resultFor = useCallback(
    (riskId) => results.find((item) => item.id === riskId) ?? null, [results]);

  return (
    <FaultlineContext.Provider value={{
      project, system, risks, results, ranAt, target, booting, busy, error, run,
      uploadProject, unloadProject, updateTarget, refreshTarget,
      startRun, resultFor, reload: boot, clearError: () => setError(null),
    }}>
      {children}
    </FaultlineContext.Provider>
  );
}

export function useFaultline() {
  const context = useContext(FaultlineContext);
  if (!context) throw new Error('useFaultline must be used inside FaultlineProvider');
  return context;
}
