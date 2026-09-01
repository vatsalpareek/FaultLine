import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './layouts/AppShell';
import Overview from './pages/Overview';
import Architecture from './pages/Architecture';
import SpiderSense from './pages/SpiderSense';
import WebHunt from './pages/WebHunt';
import Investigation from './pages/Investigation';
import IntroSequence from './components/IntroSequence';
import FAQModal from './components/FAQModal';
import { ThemeProvider } from './context/ThemeContext';
import { FaultlineProvider } from './context/FaultlineContext';

function App() {
  const [showIntro, setShowIntro] = useState(true);

  return (
    <ThemeProvider>
      <FaultlineProvider>
      <Router>
        {showIntro && <IntroSequence onComplete={() => setShowIntro(false)} />}
        <FAQModal isIntroActive={showIntro} />
        <div className="animate-app-reveal">
          <Routes>
            <Route path="/" element={<AppShell isIntroActive={showIntro} />}>
              <Route index element={<Navigate to="/overview" replace />} />
              <Route path="overview" element={<Overview />} />
              <Route path="architecture" element={<Architecture />} />
              <Route path="spider-sense" element={<SpiderSense />} />
              <Route path="web-hunt" element={<WebHunt />} />
              <Route path="investigation" element={<Investigation />} />
            </Route>
          </Routes>
        </div>
      </Router>
      </FaultlineProvider>
    </ThemeProvider>
  );
}

export default App;
