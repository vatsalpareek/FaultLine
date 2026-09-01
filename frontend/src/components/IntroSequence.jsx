import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function IntroSequence({ onComplete }) {
  const [phase, setPhase] = useState('video'); // 'video' | 'text' | 'morph' | 'slide' | 'fadeout'
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const handleVideoEnded = useCallback(() => {
    if (phase !== 'video') return;
    setPhase('text');
  }, [phase]);

  const handleMorphPhase = useCallback(() => {
    if (phase !== 'text') return;
    setPhase('morph');
  }, [phase]);

  const handleSlidePhase = useCallback(() => {
    if (phase !== 'morph') return;
    setPhase('slide');
  }, [phase]);

  const handleTextSequenceComplete = useCallback(() => {
    if (phase === 'fadeout') return;
    setPhase('fadeout');
    setTimeout(onComplete, 1200); 
  }, [phase, onComplete]);

  // Handle skip logic
  useEffect(() => {
    const handleKeyDown = () => {
      if (phase === 'video') {
        handleVideoEnded();
      } else if (phase === 'text' || phase === 'morph' || phase === 'slide') {
        onComplete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, handleVideoEnded, onComplete]);

  // Video processing logic
  useEffect(() => {
    // Keep processing video during both 'video' and 'text' phases
    if (phase !== 'video' && phase !== 'text') return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let animationFrameId;

    const processFrame = () => {
      if (video.paused || video.ended) return;

      // Trigger text phase 1.5 seconds before the video ends, but let the video keep playing!
      if (phase === 'video' && video.duration && video.currentTime >= video.duration - 1.5) {
        handleVideoEnded();
      }

      if (video.videoWidth > 0 && canvas.width !== video.videoWidth) {
         // Restoring to 100% maximum native resolution!
         canvas.width = video.videoWidth;
         canvas.height = video.videoHeight;
      }

      if (canvas.width > 0) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = frame.data;
        const l = data.length / 4;
        
        // Grab theme string manually from DOM outside the loop for massive performance boost
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const isLight = currentTheme === 'light';

        for (let i = 0; i < l; i++) {
          const idx = i << 2; // bitwise multiply by 4
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          
          const maxRB = r > b ? r : b;
          
          if (g > 60 && g > maxRB * 1.1) {
             // Chroma key: Remove green background
             data[idx + 3] = 0; 
          } else {
             // Despill: remove green tint from edges
             if (g > maxRB) {
                data[idx + 1] = maxRB; 
             }
             
             if (isLight) {
                const brightness = (r + g + b) * 0.3333;
                if (brightness < 30) {
                   data[idx + 3] = 0;
                } else {
                   // Color the spider solid red
                   data[idx] = 255;
                   data[idx + 1] = 51;
                   data[idx + 2] = 51;
                   
                   // Soften dark edges so it blends cleanly into white
                   if (brightness < 120) {
                      data[idx + 3] = (brightness - 30) * 2.833;
                   }
                }
             }
          }
        }
        
        ctx.putImageData(frame, 0, 0);
      }

      animationFrameId = requestAnimationFrame(processFrame);
    };

    const handlePlay = () => processFrame();
    const handlePlaying = () => setIsPlaying(true);

    video.addEventListener('play', handlePlay);
    video.addEventListener('playing', handlePlaying);
    
    // We no longer trigger handleVideoEnded on 'ended' because we do it 1.5s early via currentTime check
    // But we should clean up if it ends naturally.
    const onEnded = () => {
        if (phase === 'video') handleVideoEnded();
    };
    video.addEventListener('ended', onEnded);

    video.play().catch(e => console.warn("Video autoplay blocked:", e));

    const fallbackTimer = setTimeout(() => {
        if (phase === 'video') handleVideoEnded();
    }, 8000);

    return () => {
      // Don't pause the video if we are transitioning to 'text' phase, because we want it to keep playing while it dissolves!
      // The cleanup will run when phase changes to 'morph', at which point we DO want to pause it.
      if (phase !== 'video') {
          if (video) video.pause();
      }
      if (video) video.removeEventListener('play', handlePlay);
      if (video) video.removeEventListener('playing', handlePlaying);
      if (video) video.removeEventListener('ended', onEnded);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      clearTimeout(fallbackTimer);
    };
  }, [phase, handleVideoEnded]);

  const textRef = useRef(null);
  const [textWidth, setTextWidth] = useState(135);

  useEffect(() => {
    if (textRef.current) {
      setTextWidth(textRef.current.offsetWidth);
    }
  }, [phase]);

  const letters = 'FAULTLINE'.split('');

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden cursor-pointer"
      onClick={() => {
        if (phase === 'video') {
          handleVideoEnded();
        } else if (phase === 'text' || phase === 'morph' || phase === 'slide') {
          onComplete();
        }
      }}
    >
       <motion.div
         initial={{ opacity: 1 }}
         animate={{ opacity: phase === 'fadeout' ? 0 : 1 }}
         transition={{ duration: 1.2, ease: "easeInOut" }}
         className="absolute inset-0 bg-charcoal-900 pointer-events-none"
       />
       
       {/* Phase 1: Video (fades and blurs out gracefully) */}
       <div className={`absolute inset-0 pointer-events-none transition-all duration-1000 ease-in-out ${phase === 'video' ? 'opacity-100 blur-[0px] scale-100' : 'opacity-0 blur-[20px] scale-105'}`}>
         <video 
           ref={videoRef}
           src="/spider.mp4" 
           autoPlay 
           muted 
           playsInline
           className="absolute opacity-0 w-1 h-1 pointer-events-none"
         />
         <canvas 
           ref={canvasRef}
           className={`w-full h-full object-cover pointer-events-none drop-shadow-[0_0_15px_rgba(255,51,51,0.6)] transition-opacity duration-500 ${isPlaying ? 'opacity-100' : 'opacity-0'}`}
         />
       </div>

       {/* Phase 2, 3, 4 & 5: Text, Morph, Slide and Fadeout */}
       {phase !== 'video' && (
         <div className="absolute inset-0">
           <AnimatePresence>
             {/* The two lines of text */}
             {phase === 'text' && (
               <motion.div 
                 key="lines"
                 className="absolute inset-0 flex flex-col items-center justify-center text-center tracking-[0.2em] font-bold p-8"
                 exit={{ opacity: 0, scale: 0.5, filter: 'blur(20px)' }}
                 transition={{ duration: 0.6, ease: "easeInOut" }}
               >
                 <motion.h1 
                   initial={{ opacity: 0, filter: 'blur(10px)', y: 10 }}
                   animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                   transition={{ duration: 0.8, ease: 'easeOut' }}
                   className="text-3xl md:text-5xl text-gray-200"
                 >
                   MULTIVERSAL PROBLEMS.
                 </motion.h1>
                 <motion.h2 
                   initial={{ opacity: 0, filter: 'blur(10px)', y: 10 }}
                   animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                   transition={{ duration: 0.8, ease: 'easeOut', delay: 1.0 }}
                   className="text-xl md:text-3xl text-fault-red mt-6"
                   onAnimationComplete={() => {
                     if (phase === 'text') {
                       setTimeout(() => {
                         handleMorphPhase();
                       }, 800);
                     }
                   }}
                 >
                   ONE SOLUTION.
                 </motion.h2>
               </motion.div>
             )}
             
             {/* The glowing FAULTLINE text */}
             {(phase === 'morph' || phase === 'slide' || phase === 'fadeout') && (
               <motion.div
                 key="faultline"
                 ref={textRef}
                 className="absolute flex whitespace-nowrap"
                 style={{ transformOrigin: 'center center' }}
                 initial={{ 
                   top: '50%', left: '50%', x: '-50%', y: '-50%', 
                   scale: 2.5, filter: 'blur(30px)' 
                 }}
                 animate={{ 
                   top: (phase === 'slide' || phase === 'fadeout') ? '45px' : '50%', 
                   left: (phase === 'slide' || phase === 'fadeout') ? `${24 + textWidth / 2}px` : '50%', 
                   x: '-50%', 
                   y: '-50%',
                   scale: (phase === 'slide' || phase === 'fadeout') ? 1 : 2.5, 
                   filter: 'blur(0px)' 
                 }}
                 transition={{ 
                   duration: phase === 'slide' ? 0.8 : 0.6, 
                   ease: phase === 'slide' ? [0.4, 0, 0.2, 1] : "easeOut" 
                 }}
                 onAnimationComplete={() => {
                   if (phase === 'morph') {
                     setTimeout(() => {
                       handleSlidePhase();
                     }, 1200);
                   } else if (phase === 'slide') {
                     handleTextSequenceComplete();
                   }
                 }}
               >
                 {letters.map((char, i) => (
                   <motion.span
                     key={i}
                     className="text-2xl font-bold tracking-wider origin-center"
                     animate={{
                       opacity: phase === 'fadeout' ? 0 : 1,
                       color: phase === 'fadeout' ? 'var(--theme-text-white)' : '#ff3333',
                       textShadow: phase === 'fadeout' 
                         ? 'none' 
                         : '0 0 60px rgba(255,51,51,1), 0 0 30px rgba(255,51,51,0.8), 0 0 10px rgba(255,255,255,0.5)'
                     }}
                     transition={{ duration: 1.0, ease: "easeInOut" }}
                   >
                     {char}
                   </motion.span>
                 ))}
               </motion.div>
             )}
           </AnimatePresence>
         </div>
       )}
    </div>
  );
}
