import React, { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Network, Bug, Search, FileSearch, Settings, User, Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useFaultline } from '../context/FaultlineContext';

export default function AppShell({ isIntroActive }) {
  const [isMask, setIsMask] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { project, risks, ranAt, run } = useFaultline();

  useEffect(() => {
    // Don't start any background animations until the intro sequence is completely finished
    if (isIntroActive) return;

    const interval = setInterval(() => {
      setIsMask(true);
      setTimeout(() => setIsMask(false), 3800); // 3.8s for the full crawl
    }, 8000); // Trigger every 8 seconds
    return () => clearInterval(interval);
  }, [isIntroActive]);

  const letters = 'FAULTLINE'.split('');

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-charcoal-900 text-gray-200">
      {/* Sidebar */}
      <div className="w-64 border-r border-charcoal-800 bg-charcoal-900/50 flex flex-col justify-between">
        <div>
          <div className="p-6 relative h-28 flex flex-col justify-center">
            <div className="relative z-20 flex items-center h-10 w-full">
              
              {/* The Text */}
              <div className="flex relative z-20">
                {letters.map((char, i) => {
                  const dx = (i - 4) * 15;
                  const dy = i % 2 === 0 ? -25 : 25;
                  const rot = (i - 4) * 45;
                  
                  return (
                    <motion.span
                      key={`text-${i}`}
                      animate={{
                        x: isMask ? dx : 0,
                        y: isMask ? dy : 0,
                        rotateZ: isMask ? rot : 0,
                        scale: isMask ? 0 : 1,
                        opacity: isMask ? 0 : 1,
                      }}
                      transition={{ duration: 0.6, ease: "backInOut", delay: !isMask ? 0.2 : 0 }}
                      className="text-2xl font-bold tracking-wider text-white origin-center"
                      style={{ textShadow: '0 0 10px rgba(255,255,255,0.4)' }}
                    >
                      {char}
                    </motion.span>
                  );
                })}
              </div>

              {/* The Literal Spider SVG */}
              <motion.div
                animate={{
                  opacity: isMask ? [0, 1, 1, 1, 1] : 0,
                  scale: isMask ? [0, 1.2, 1.2, 1.2, 1.2] : 0,
                  x: isMask ? [0, 0, 140, -140, 0] : 0,
                  y: isMask ? [0, 0, 40, 45, 0] : 0,
                  rotateZ: isMask ? [90, 90, 160, 270, 405] : 405
                }}
                transition={{ 
                  duration: isMask ? 3.5 : 0.6,
                  times: isMask ? [0, 0.1, 0.4, 0.75, 1] : undefined,
                  ease: "easeInOut"
                }}
                className="absolute pointer-events-none left-8 -top-3 z-10"
              >
                <svg viewBox="0 0 100 100" className="w-16 h-16 text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.8)]">
                  {/* Body */}
                  <path d="M50,25 C65,25 65,55 50,75 C35,55 35,25 50,25 Z" fill="currentColor" />
                  {/* Mandibles */}
                  <path d="M47,25 Q45,20 48,22 M53,25 Q55,20 52,22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  {/* Left Legs */}
                  <path d="M45,35 Q20,10 38,40 M43,45 Q10,45 33,60 M45,55 Q25,75 38,85 M48,65 Q35,85 45,95" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  {/* Right Legs */}
                  <path d="M55,35 Q80,10 62,40 M57,45 Q90,45 67,60 M55,55 Q75,75 62,85 M52,65 Q65,85 55,95" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </motion.div>
              
            </div>
            <motion.p 
              animate={{
                opacity: isMask ? [1, 1, 0.2, 1, 0.1, 0.9, 0.3, 1, 1] : 1,
                x: isMask ? [0, 0, -2, 2, -1, 3, 0, 0, 0] : 0,
              }}
              transition={{
                duration: isMask ? 3.5 : 0.6,
                times: isMask ? [0, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.75, 1] : undefined,
                ease: "linear"
              }}
              className="text-[10px] text-fault-red mt-2 font-mono tracking-widest uppercase font-bold relative z-20"
            >
              Failure Intelligence System
            </motion.p>
          </div>
          
          <nav className="px-4 space-y-1 mt-4">
            <NavItem to="/" icon={<LayoutDashboard size={18} />} label="Overview" />
            <NavItem to="/architecture" icon={<Network size={18} />} label="Architecture" />
            <NavItem to="/spider-sense" icon={<Bug size={18} />} label="Spider-Sense" />
            <NavItem to="/web-hunt" icon={<Search size={18} />} label="Web Hunt" />
            <NavItem to="/investigation" icon={<FileSearch size={18} />} label="Investigation" />
          </nav>
        </div>
        
        <div className="p-6 border-t border-charcoal-800">
          <p className="text-[10px] font-mono text-gray-500 mb-2 tracking-wider">SYSTEM STATUS</p>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              !project ? 'bg-gray-600'
                : risks?.status === 'STABLE' ? 'bg-green-500' : 'bg-fault-red animate-pulse'}`}></div>
            <span className="text-xs font-mono text-gray-400">
              {project ? (risks?.status ?? 'ANALYSING') : 'NO PROJECT'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative">
        <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none"></div>
        
        {/* Top Bar */}
        <header className="h-16 border-b border-charcoal-800 bg-charcoal-900/80 backdrop-blur flex items-center justify-between px-6 z-10">
          <div className="text-xs font-mono text-gray-400">
            FAULTLINE / <span className="text-fault-red">
              {project ? project.name.toUpperCase() : 'NO PROJECT LOADED'}
            </span>
          </div>
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono text-gray-500">EXPERIMENTS:</span>
              <span className={`text-xs font-mono ${run?.state === 'running' ? 'text-fault-red' : 'text-green-400'}`}>
                {run?.state === 'running' ? `RUNNING ${run.done}/${run.total}` : 'IDLE'}
              </span>
            </div>
            <div className="text-xs font-mono text-gray-500">
              LAST RUN: {ranAt ? new Date(ranAt).toLocaleTimeString() : 'never'}
            </div>
            <div className="flex space-x-3 text-gray-400 items-center">
              <button onClick={toggleTheme} className="hover:text-white transition-colors focus:outline-none">
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <Settings size={18} className="cursor-pointer hover:text-white transition-colors" />
              <User size={18} className="cursor-pointer hover:text-white transition-colors" />
            </div>
          </div>
        </header>

        {/* Main View Area */}
        <main className="flex-1 overflow-hidden relative z-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(0,0,0,0.9)] hover:z-10 relative ${
          isActive 
            ? 'bg-fault-red/10 text-fault-red border border-fault-red/20 text-glow' 
            : 'text-gray-400 hover:bg-charcoal-800 hover:text-gray-200'
        }`
      }
    >
      <span className="group-hover:animate-icon-pop">
        {icon}
      </span>
      <span className="text-sm font-medium tracking-wide">{label}</span>
    </NavLink>
  );
}
