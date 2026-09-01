import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Database, Server, Box, ArrowDown, ShieldAlert } from 'lucide-react';
import { useFaultline } from '../context/FaultlineContext';
import { Loading, ErrorPanel, NoProject, Explainer, SeverityBadge } from '../components/Primitives';

const ICON = { DATABASE: Database, CACHE: Box, SERVICE: Server };
const iconFor = (type) => ICON[type] ?? Server;

export default function Architecture() {
  const { project, system, risks, booting, error, reload } = useFaultline();
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);

  if (booting) return <Loading label="Mapping the web..." />;
  if (!project) return <NoProject page="The architecture map" />;
  if (error) return <ErrorPanel message={error} onRetry={reload} />;
  if (!system) return <Loading label="Building the graph..." />;

  const byId = Object.fromEntries(system.nodes.map((node) => [node.id, node]));
  const riskById = Object.fromEntries((risks?.risks ?? []).map((risk) => [risk.id, risk]));
  const node = selected ? byId[selected] : null;

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      <div className="p-8 pb-2 z-10 relative">
        <h1 className="text-3xl font-bold text-white tracking-tight">THE WEB</h1>
        <p className="text-gray-400 font-mono text-sm mt-1 uppercase tracking-widest">
          {system.project} dependency map
        </p>
      </div>
      <div className="px-8 relative z-10">
        <Explainer>
          Every box is a service from your Compose file. An arrow means the service above
          <em> depends on </em> the one below, so a failure travels upward against the arrows.
          Red boxes have at least one open hypothesis against them. Click any box to see the
          configuration FaultLine parsed and what it concluded from it.
        </Explainer>
      </div>

      <div className="flex-1 relative flex">
        <div className="flex-1 relative">
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3"
                orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L7,3 z" fill="#555" />
              </marker>
            </defs>
            {system.edges.map((edge, index) => {
              const source = byId[edge.source];
              const target = byId[edge.target];
              if (!source || !target) return null;
              const risky = target.risks.length > 0;
              const lit = hovered === source.id || hovered === target.id;
              return (
                <g key={`${edge.source}-${edge.target}`}>
                  <motion.line
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: index * 0.12, duration: 0.9 }}
                    x1={source.x} y1={source.y + 52} x2={target.x} y2={target.y - 56}
                    stroke={risky ? 'var(--color-fault-red)' : '#444'}
                    strokeWidth={lit || risky ? 2 : 1}
                    markerEnd="url(#arrow)" />
                  <text x={(source.x + target.x) / 2 + 14} y={(source.y + target.y) / 2}
                    fill={risky ? 'var(--color-fault-red)' : '#666'} fontSize="10"
                    className="font-mono uppercase tracking-widest">
                    {risky ? `${target.risks.length} risk${target.risks.length > 1 ? 's' : ''}` : 'depends on'}
                  </text>
                </g>
              );
            })}
          </svg>

          {system.nodes.map((item, index) => {
            const NodeIcon = iconFor(item.type);
            const atRisk = item.risks.length > 0;
            return (
              <motion.button key={item.id}
                initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.1 + 0.3, type: 'spring' }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 p-4 rounded-xl border flex flex-col items-center justify-center backdrop-blur transition-all duration-300
                  ${selected === item.id ? 'bg-charcoal-700/80 border-gray-400'
                    : atRisk ? 'bg-charcoal-800/80 border-fault-red/40 hover:border-fault-red'
                      : 'bg-charcoal-800/80 border-charcoal-700 hover:border-gray-500'}`}
                style={{ left: item.x, top: item.y, width: 140, height: 108 }}
                onClick={() => setSelected(item.id)}
                onMouseEnter={() => setHovered(item.id)}
                onMouseLeave={() => setHovered(null)}>
                <div className={atRisk ? 'text-fault-red mb-2' : 'text-gray-300 mb-2'}>
                  <NodeIcon size={20} />
                </div>
                <span className="text-xs font-semibold uppercase">{item.name}</span>
                <span className="text-[9px] font-mono text-gray-500 uppercase">{item.type}</span>
                <div className="flex items-center gap-1 mt-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${atRisk ? 'bg-fault-red' : 'bg-green-500'}`} />
                  <span className="text-[9px] font-mono text-gray-400 uppercase">{item.status}</span>
                </div>
              </motion.button>
            );
          })}

          {system.indirect.length > 0 && (
            <div className="absolute bottom-6 left-8 text-[11px] font-mono text-gray-500">
              indirect paths: {system.indirect.map((edge) => edge.path.join(' → ')).join('   ')}
            </div>
          )}
        </div>

        <motion.div initial={{ x: 420 }} animate={{ x: node ? 0 : 420 }}
          className="w-96 bg-charcoal-900/95 border-l border-charcoal-800 p-6 absolute right-0 top-0 bottom-0 backdrop-blur overflow-y-auto">
          {node && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 pb-5 border-b border-charcoal-800">
                <div className="p-3 bg-charcoal-800 rounded-lg text-gray-300">
                  {React.createElement(iconFor(node.type), { size: 20 })}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white uppercase">{node.name}</h3>
                  <p className="text-xs font-mono text-gray-400">{node.type}</p>
                </div>
              </div>

              <Section label="Configuration read from the env file">
                {Object.keys(node.config).length ? (
                  <div className="space-y-2">
                    {Object.entries(node.config).map(([key, value]) => (
                      <div key={key} className="flex justify-between items-center text-sm">
                        <span className="font-mono text-xs text-gray-500">{key}</span>
                        <span className="text-gray-200">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 leading-relaxed">
                    No configuration matched this service. FaultLine can see it in the Compose
                    file but has no timeouts or pool sizes for it, so no hypothesis can be
                    raised against it.
                  </p>
                )}
              </Section>

              <Section label="Depends on">
                {node.dependencies.length ? node.dependencies.map((dependency) => (
                  <div key={dependency} className="text-sm text-gray-300 flex items-center gap-2">
                    <ArrowDown size={13} className="text-gray-500" />
                    <span className="uppercase">{dependency}</span>
                  </div>
                )) : <p className="text-sm text-gray-500 italic">Nothing. This is a leaf.</p>}
              </Section>

              <Section label="Would be affected if this fails">
                {node.dependents.length ? node.dependents.map((dependent) => (
                  <span key={dependent}
                    className="inline-block mr-2 mb-2 px-2 py-1 rounded border border-charcoal-700 text-xs font-mono uppercase text-gray-300">
                    {dependent}
                  </span>
                )) : <p className="text-sm text-gray-500 italic">Nothing depends on this.</p>}
              </Section>

              <Section label="Open hypotheses">
                {node.risks.length ? node.risks.map((riskId) => {
                  const risk = riskById[riskId];
                  if (!risk) return null;
                  return (
                    <div key={riskId} className="border border-charcoal-800 rounded p-3 mb-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-[11px] text-gray-500">{riskId}</span>
                        <SeverityBadge severity={risk.severity} score={risk.score} />
                      </div>
                      <p className="text-sm text-gray-200 flex items-start gap-2">
                        <ShieldAlert size={14} className="text-fault-red mt-0.5 shrink-0" />
                        {risk.title}
                      </p>
                    </div>
                  );
                }) : (
                  <p className="text-sm text-gray-500 italic">
                    No hypothesis targets this component.
                  </p>
                )}
              </Section>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div className="pt-5 border-t border-charcoal-800 first:border-0 first:pt-0">
      <p className="text-[10px] font-mono text-gray-500 mb-3 tracking-widest uppercase">{label}</p>
      {children}
    </div>
  );
}
