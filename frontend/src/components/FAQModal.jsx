import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export default function FAQModal({ isIntroActive }) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  useEffect(() => {
    if (hasShown) return;

    // Only show after intro sequence completes
    if (!isIntroActive && !hasShown) {
      // Add a slight delay after the app reveals before popping the modal
      const timer = setTimeout(() => {
        setIsOpen(true);
        setHasShown(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isIntroActive, hasShown]);

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-charcoal-900/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-charcoal-800 border border-charcoal-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="flex justify-between items-center p-6 border-b border-charcoal-700 bg-charcoal-900/50">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-wide">WELCOME TO FAULTLINE</h2>
                  <p className="text-xs font-mono text-gray-400 mt-1 uppercase tracking-widest">Failure Intelligence System</p>
                </div>
                <button 
                  onClick={handleClose}
                  className="p-2 text-gray-400 hover:text-white hover:bg-charcoal-700 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8 text-gray-300">
                
                <section>
                  <h3 className="text-lg font-bold text-fault-red mb-3 flex items-center">
                    <span className="text-sm font-mono mr-3 text-gray-500">01</span>
                    What is FaultLine?
                  </h3>
                  <p className="leading-relaxed">
                    FaultLine is basically your infrastructure's Spidey-sense. It's an intelligent, automated diagnostics and visualization platform designed to untangle the chaos of modern microservices. Instead of staring at endless logs when things break, FaultLine gives you a living map of your system and points right to the cracks before they shatter.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-fault-red mb-3 flex items-center">
                    <span className="text-sm font-mono mr-3 text-gray-500">02</span>
                    Why FaultLine?
                  </h3>
                  <p className="leading-relaxed">
                    Because debugging distributed systems shouldn't feel like a multiversal crisis. We built FaultLine because standard monitoring tools tell you <em>that</em> you're bleeding, but they don't tell you <em>why</em>. By combining real-time dependency tracking with automated root-cause analysis, we turn hours of frantic forensic hunting into a calm, guided investigation.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-fault-red mb-3 flex items-center">
                    <span className="text-sm font-mono mr-3 text-gray-500">03</span>
                    How does it function?
                  </h3>
                  <p className="leading-relaxed mb-3">
                    It spins a web over your architecture. FaultLine continuously crawls your service mesh, analyzing traffic patterns and health metrics.
                  </p>
                  <ul className="list-disc pl-5 space-y-2 text-gray-400">
                    <li><strong>Spider-Sense:</strong> Actively monitors anomalous spikes and stealth failures.</li>
                    <li><strong>Web Hunt:</strong> Traces distributed transactions across every boundary.</li>
                    <li><strong>Investigation:</strong> Aggregates the evidence into an actionable dashboard so you can squash the bug.</li>
                  </ul>
                </section>

              </div>

              {/* Footer */}
              <div className="p-6 border-t border-charcoal-700 bg-charcoal-900/50 flex items-center justify-end">

                <button 
                  onClick={handleClose}
                  className="px-6 py-2 bg-fault-red hover:bg-red-600 text-[#fff] font-bold rounded-lg transition-all shadow-[0_0_15px_rgba(255,51,51,0.3)] hover:shadow-[0_0_20px_rgba(255,51,51,0.6)]"
                >
                  ENTER SYSTEM
                </button>
              </div>

            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
