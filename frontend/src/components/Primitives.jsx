import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AlertTriangle, Info, Loader2, Upload } from 'lucide-react';
import { severityStyle, verdictStyle } from '../lib/api';

export function Loading({ label = 'Working...' }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
      <Loader2 size={28} className="animate-spin text-fault-red" />
      <span className="font-mono text-xs tracking-widest uppercase">{label}</span>
    </div>
  );
}

export function ErrorPanel({ message, onRetry }) {
  return (
    <div className="h-full flex flex-col items-center justify-center space-y-4 px-8 text-center">
      <AlertTriangle size={28} className="text-fault-red" />
      <p className="text-gray-300 max-w-lg">{message}</p>
      <p className="text-xs font-mono text-gray-500 max-w-lg">
        If the API is not running, start it with{' '}
        <span className="text-gray-300">uvicorn api:app --port 5050</span>
      </p>
      {onRetry && (
        <button onClick={onRetry}
          className="mt-2 border border-charcoal-700 hover:border-fault-red px-5 py-2 rounded text-xs font-mono uppercase tracking-widest text-gray-300 transition-colors">
          Retry
        </button>
      )}
    </div>
  );
}

/** Shown on every page when nothing has been uploaded yet. */
export function NoProject({ page }) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-8 text-center">
      <div className="w-14 h-14 rounded-full border border-charcoal-700 flex items-center justify-center mb-6">
        <Upload size={22} className="text-gray-500" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Data not available</h2>
      <p className="text-gray-400 max-w-md mb-1">
        {page} needs a project to analyse.
      </p>
      <p className="text-xs font-mono text-gray-500 max-w-md mb-6">
        Upload a zip containing a Compose file and an env file on the Overview page.
      </p>
      <Link to="/overview"
        className="bg-fault-red hover:bg-red-600 text-[#fff] font-bold py-3 px-6 rounded uppercase tracking-widest text-xs border border-red-400">
        Go to Overview
      </Link>
    </div>
  );
}

/** One-paragraph plain-English description of what a page is showing. */
export function Explainer({ children }) {
  return (
    <div className="flex gap-3 border border-charcoal-800 bg-charcoal-900/40 rounded-lg p-4 mb-8 max-w-4xl">
      <Info size={14} className="text-gray-500 mt-0.5 shrink-0" />
      <p className="text-xs text-gray-400 leading-relaxed">{children}</p>
    </div>
  );
}

export function SeverityBadge({ severity, score }) {
  const style = severityStyle(severity);
  return (
    <span className={`px-2 py-1 rounded text-[10px] font-mono tracking-widest border ${style.text} ${style.bg} ${style.border}`}>
      {severity}{score !== undefined ? ` ${score}` : ''}
    </span>
  );
}

export function VerdictBadge({ verdict, withMeaning }) {
  const style = verdictStyle(verdict);
  return (
    <span className="inline-flex flex-col items-end">
      <span className={`font-mono text-[11px] tracking-widest ${style.text}`}>{style.label}</span>
      {withMeaning && <span className="text-[10px] text-gray-500 mt-1">{style.meaning}</span>}
    </span>
  );
}

export function Card({ title, subtitle, children, className = '', action }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={`border border-charcoal-800 bg-charcoal-900/60 rounded-lg p-6 ${className}`}>
      {title && (
        <header className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">{title}</h3>
            {subtitle && (
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mt-1">
                {subtitle}
              </p>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </motion.section>
  );
}

export function RunLog({ log }) {
  if (!log?.length) return null;
  return (
    <div className="border border-fault-red/30 bg-fault-red/5 rounded-lg p-5">
      <p className="text-[11px] font-mono text-fault-red uppercase tracking-widest mb-3">
        live experiment log
      </p>
      <div className="space-y-1 font-mono text-xs text-gray-400 max-h-48 overflow-y-auto">
        {log.map((line, index) => (
          <div key={index}><span className="text-gray-600">{line.t}</span> {line.message}</div>
        ))}
      </div>
    </div>
  );
}
