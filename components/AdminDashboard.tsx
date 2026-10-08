
import React, { useState, useEffect } from 'react';
import { Plus, Play, Edit2, Trash2, Users, ArrowLeft, Lock, ShieldCheck, ExternalLink, Activity, LogOut, StopCircle, QrCode, Download, Eye, EyeOff, X, Zap } from 'lucide-react';
import { Quiz, LiveSession, SessionStatus } from '../types';
import LiveAdminSession from './LiveAdminSession';
import { createRoom, fetchQuizzesFromFirebase, deleteQuizFromFirebase, syncAllRooms, deleteRoom } from '../services/syncService';
import { QRCodeSVG } from 'qrcode.react';

interface AdminDashboardProps {
  onEditQuiz: (id: string) => void;
  onExit: () => void;
  themeToggle: React.ReactNode;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onEditQuiz, onExit, themeToggle }) => {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<LiveSession | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem('adminAuth') === 'true');
  const [passcode, setPasscode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [portalQuiz, setPortalQuiz] = useState<{quiz: Quiz, roomCode: string} | null>(null);
  const [showCode, setShowCode] = useState(false);

  const ADMIN_PASSCODE = "0108"; 
  const BASE_URL = 'https://sankalp-3.web.app';

  useEffect(() => {
    const loadQuizzes = async () => {
      try {
        const data = await fetchQuizzesFromFirebase();
        setQuizzes(data as Quiz[]);
      } catch (err) {
        console.error("Failed to load quizzes:", err);
      } finally {
        setIsLoading(false);
      }
    };
    if (isAuthenticated) loadQuizzes();
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      const unsub = syncAllRooms((rooms) => {
        setActiveRooms(rooms);
      });
      return () => unsub();
    }
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === ADMIN_PASSCODE) {
      setIsAuthenticated(true);
      localStorage.setItem('adminAuth', 'true');
    } else {
      alert("Invalid Passcode!");
    }
  };

  const handleLogout = () => {
    if (confirm("Logout from Command Center?")) {
      setIsAuthenticated(false);
      localStorage.removeItem('adminAuth');
    }
  };

  const deleteQuiz = async (id: string) => {
    if (!confirm('Are you sure you want to delete this quiz globally?')) return;
    try {
      await deleteQuizFromFirebase(id);
      setQuizzes(quizzes.filter(q => q.id !== id));
    } catch (err) {
      alert("Failed to delete quiz.");
    }
  };

  const stopSession = async (roomCode: string) => {
    if (confirm(`Stop live session ${roomCode}? This will disconnect all players.`)) {
      try {
        await deleteRoom(roomCode);
      } catch (err) {
        alert("Failed to stop session.");
      }
    }
  };

  const resumeSession = (room: any) => {
    const session: LiveSession = {
      ...room,
      participants: [] 
    };
    setActiveSession(session);
  };

  const startQuiz = async (quiz: Quiz) => {
    setIsLaunching(true);
    try {
      const existingRoom = activeRooms.find(r => r.quizId === quiz.id && r.status !== SessionStatus.FINISHED);
      const roomCode = existingRoom ? existingRoom.roomCode : Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const session: LiveSession = {
        roomCode,
        quizId: quiz.id,
        status: SessionStatus.WAITING,
        currentQuestionIndex: 0,
        startTime: null,
        participants: []
      };
      
      if (!existingRoom) {
        await createRoom(session);
      }
      setActiveSession(session);
    } catch (error) {
      console.error("Failed to launch room:", error);
      alert("Could not launch live session.");
    } finally {
      setIsLaunching(false);
    }
  };

  const downloadQR = () => {
    const svg = document.getElementById('portal-qr');
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width + 40;
        canvas.height = img.height + 40;
        if(ctx) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0,0,canvas.width, canvas.height);
          ctx.drawImage(img, 20, 20);
          const pngFile = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.download = `QR_${portalQuiz?.roomCode}.png`;
          downloadLink.href = pngFile;
          downloadLink.click();
        }
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <form onSubmit={handleLogin} className="max-w-md w-full bg-white dark:bg-slate-900 p-8 rounded-[40px] shadow-2xl border border-slate-200 dark:border-slate-800 space-y-8 animate-in zoom-in duration-300">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock size={32} />
            </div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Admin Access</h2>
            <p className="text-slate-500 text-sm">Enter passcode to manage quizzes</p>
          </div>
          <input 
            type="password" 
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Passcode"
            className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:border-indigo-500 outline-none text-center text-xl font-black tracking-widest"
            autoFocus
          />
          <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20">
            UNSEAL DASHBOARD
          </button>
          <button type="button" onClick={onExit} className="w-full text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-indigo-500 transition-colors">
            Exit to Home
          </button>
        </form>
      </div>
    );
  }

  if (activeSession) {
    const quiz = quizzes.find(q => q.id === activeSession.quizId);
    if (!quiz) return null;
    return (
      <LiveAdminSession 
        session={activeSession} 
        quiz={quiz} 
        onClose={() => setActiveSession(null)} 
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div className="flex items-center gap-4">
          <button onClick={onExit} className="p-3 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-2xl transition-colors text-slate-600 dark:text-slate-400">
            <ArrowLeft />
          </button>
          <div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Command Center</h1>
            <div className="flex items-center gap-2 text-indigo-500 text-xs font-bold uppercase tracking-widest mt-1">
              <ShieldCheck size={14} />
              <span>Authentication Persistent</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="scale-90">{themeToggle}</div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-2xl hover:bg-red-100 transition-all font-black text-xs uppercase tracking-widest"
            title="Logout"
          >
            <LogOut size={18} />
            LOGOUT
          </button>
          <button 
            onClick={() => onEditQuiz('')}
            className="flex items-center gap-3 bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20"
          >
            <Plus size={20} />
            CREATE QUIZ
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 font-black text-xs uppercase tracking-widest">Fetching Data...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {quizzes.map((quiz) => {
            const liveRoom = activeRooms.find(r => r.quizId === quiz.id && r.status !== SessionStatus.FINISHED);
            return (
              <div key={quiz.id} className="bg-white dark:bg-slate-800 rounded-[40px] p-8 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all group flex flex-col relative overflow-hidden">
                {liveRoom && (
                  <div className="absolute top-0 right-0 p-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-500 rounded-full border border-red-500/20">
                      <Activity size={12} className="animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Launched</span>
                    </div>
                  </div>
                )}

                {quiz.isSpecial && (
                  <div className="absolute top-0 left-0 p-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 text-indigo-600 rounded-full border border-indigo-500/20">
                      <Zap size={12} fill="currentColor" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Special</span>
                    </div>
                  </div>
                )}
                
                <div className="flex justify-between items-start mb-6">
                  <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-[24px]">
                    <Users size={28} />
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => onEditQuiz(quiz.id)}
                      className="p-3 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-colors"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={() => deleteQuiz(quiz.id)}
                      className="p-3 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 leading-tight">{quiz.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 line-clamp-2 flex-grow">{quiz.description}</p>
                
                <div className="flex flex-col gap-4 border-t border-slate-100 dark:border-slate-700 pt-6">
                  <button 
                    onClick={() => {
                      const existingRoom = activeRooms.find(r => r.quizId === quiz.id && r.status !== SessionStatus.FINISHED);
                      const code = existingRoom ? existingRoom.roomCode : Math.random().toString(36).substring(2, 8).toUpperCase();
                      setPortalQuiz({quiz, roomCode: code});
                      setShowCode(false);
                    }}
                    className="flex items-center justify-center gap-2 w-full py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all"
                  >
                    <QrCode size={16} />
                    Join Portal
                  </button>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Questions</span>
                      <span className="text-lg font-black text-indigo-600">{quiz.questions.length}</span>
                    </div>
                    {liveRoom ? (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => resumeSession(liveRoom)}
                          className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-2xl text-sm font-black hover:bg-indigo-700 transition-all shadow-lg"
                        >
                          <ExternalLink size={16} />
                          JOIN
                        </button>
                        <button 
                          onClick={() => stopSession(liveRoom.roomCode)}
                          className="flex items-center gap-2 bg-red-600 text-white px-5 py-3 rounded-2xl text-sm font-black hover:bg-red-700 transition-all shadow-lg"
                        >
                          <StopCircle size={16} />
                          STOP
                        </button>
                      </div>
                    ) : (
                      <button 
                        disabled={isLaunching}
                        onClick={() => startQuiz(quiz)}
                        className="flex items-center gap-2 bg-slate-900 dark:bg-slate-700 text-white px-6 py-3 rounded-2xl text-sm font-black hover:bg-indigo-600 transition-all disabled:opacity-50"
                      >
                        <Play size={16} fill="currentColor" />
                        {isLaunching ? 'Launching...' : 'LAUNCH'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* JOIN PORTAL MODAL */}
      {portalQuiz && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 max-w-lg w-full rounded-[48px] shadow-2xl p-10 relative space-y-8 animate-in zoom-in slide-in-from-bottom-8">
            <button onClick={() => setPortalQuiz(null)} className="absolute top-6 right-6 p-3 bg-slate-100 dark:bg-slate-800 rounded-full hover:bg-red-100 dark:hover:bg-red-900/40 text-slate-500 hover:text-red-500 transition-all">
              <X size={24} />
            </button>
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{portalQuiz.quiz.title}</h2>
              <div className="flex items-center justify-center gap-2">
                 <span className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em]">Entry Point Information</span>
                 {portalQuiz.quiz.isSpecial && (
                   <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-600 rounded-full text-[8px] font-black uppercase tracking-widest border border-indigo-500/20">Special Mode</span>
                 )}
              </div>
            </div>

            <div className="flex flex-col items-center gap-8 py-4">
              <div className="p-8 bg-slate-50 dark:bg-white rounded-[40px] shadow-xl border-8 border-indigo-600/10">
                <QRCodeSVG 
                  id="portal-qr"
                  value={`${BASE_URL}?room=${portalQuiz.roomCode}`} 
                  size={240} 
                  fgColor="#020617" 
                />
              </div>
              <div className="space-y-4 w-full text-center">
                <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-3xl border-2 border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="text-left">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Access Code</span>
                    <span className="text-3xl font-black text-indigo-600 tracking-widest font-mono">
                      {showCode ? portalQuiz.roomCode : '••••••'}
                    </span>
                  </div>
                  <button 
                    onClick={() => setShowCode(!showCode)}
                    className="p-4 bg-white dark:bg-slate-700 text-slate-400 dark:text-white rounded-2xl hover:bg-indigo-50 dark:hover:bg-indigo-600 transition-all"
                  >
                    {showCode ? <EyeOff size={24} /> : <Eye size={24} />}
                  </button>
                </div>
                <button 
                  onClick={downloadQR}
                  className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-3"
                >
                  <Download size={20} />
                  Download Entry QR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
