
import React, { useState, useEffect } from 'react';
import { Layout, Users, Settings, Sun, Moon, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import AdminDashboard from './components/AdminDashboard';
import ParticipantView from './components/ParticipantView';
import QuizEditor from './components/QuizEditor';
import { ThreeBackground } from './components/ThreeBackground';
import { Quiz } from './types';

const App: React.FC = () => {
  const [view, setView] = useState<'landing' | 'admin' | 'participant' | 'editor'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.has('room') ? 'participant' : 'landing';
    }
    return 'landing';
  });
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const ThemeToggle = () => (
    <button 
      onClick={() => setIsDark(!isDark)}
      className="p-3 bg-white/10 dark:bg-slate-800/50 rounded-full backdrop-blur-md border border-white/20 text-white transition-all hover:scale-110"
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );

  const renderView = () => {
    switch (view) {
      case 'landing':
        return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-700 via-blue-600 to-indigo-900 dark:from-slate-950 dark:via-indigo-950 dark:to-slate-950 text-white p-6 relative overflow-hidden">
            {/* Interactive 3D WebGL Three.js Animation on opening and scrolling */}
            <ThreeBackground variant="cosmic" className="absolute inset-0 z-0 pointer-events-none opacity-50 dark:opacity-75" />

            <div className="absolute top-6 right-6 z-20">
              <ThemeToggle />
            </div>
            
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
              <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white rounded-full blur-[120px]" />
              <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-400 rounded-full blur-[120px]" />
            </div>

            <div className="max-w-4xl w-full text-center space-y-8 relative z-10">
              <div className="flex justify-center mb-6">
                <div className="p-1 bg-white rounded-full shadow-2xl overflow-hidden border-4 border-white/20">
                   <img src="https://i.ibb.co/VYFjgzQL/icon.png" alt="Ethicraft Logo" className="w-32 h-32 md:w-40 md:h-40 object-contain" onError={(e) => {
                     e.currentTarget.style.display = 'none';
                     const parent = e.currentTarget.parentElement;
                     if(parent) parent.innerHTML = '<div class="w-32 h-32 flex items-center justify-center bg-indigo-600 text-white text-4xl font-bold">EC</div>';
                   }} />
                </div>
              </div>
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">
                Bhagavad Gita quiz <span className="text-indigo-200 dark:text-indigo-400">Live</span>
              </h1>
              
              <p className="text-xl md:text-2xl italic text-white/90 font-medium tracking-wide">
                Lord Says - Karmanye vadhikaraste ma phaleshu kadachana
              </p>
              
              <div className="grid md:grid-cols-2 gap-6 mt-12">
                <button 
                  onClick={() => setView('admin')}
                  className="group relative flex flex-col items-center p-8 bg-white dark:bg-slate-800 text-indigo-900 dark:text-white rounded-3xl shadow-2xl transition-all hover:scale-105 border border-transparent hover:border-indigo-400"
                >
                  <div className="p-4 bg-indigo-100 dark:bg-indigo-900/50 rounded-full mb-4 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800 transition-colors">
                    <Settings className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h2 className="text-2xl font-bold">Host a Quiz</h2>
                  <p className="mt-2 text-indigo-600/70 dark:text-indigo-300/60 text-sm">Create, manage and run live sessions</p>
                </button>

                <button 
                  onClick={() => setView('participant')}
                  className="group relative flex flex-col items-center p-8 bg-indigo-900 dark:bg-indigo-600 text-white rounded-3xl shadow-2xl transition-all hover:scale-105 border border-indigo-400/30"
                >
                  <div className="p-4 bg-white/10 rounded-full mb-4 group-hover:bg-white/20 transition-colors">
                    <Users className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-bold">Join a Quiz</h2>
                  <p className="mt-2 text-indigo-200/70 text-sm">Enter a room code to participate</p>
                </button>
              </div>
            </div>
          </div>
        );
      case 'admin':
        return <AdminDashboard onEditQuiz={(id) => { setActiveQuizId(id); setView('editor'); }} onExit={() => setView('landing')} themeToggle={<ThemeToggle />} />;
      case 'editor':
        return <QuizEditor quizId={activeQuizId} onBack={() => { setActiveQuizId(null); setView('admin'); }} />;
      case 'participant':
        return <ParticipantView onExit={() => {
          window.history.replaceState({}, '', window.location.pathname);
          setView('landing');
        }} themeToggle={<ThemeToggle />} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      {renderView()}
    </div>
  );
};

export default App;
