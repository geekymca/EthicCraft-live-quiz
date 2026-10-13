
import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, ArrowRight, Users, Trophy, Timer, Zap, ZapOff, Wifi, Clock, Medal, CheckCircle2, StopCircle, ShieldCheck } from 'lucide-react';
import { LiveSession, Quiz, SessionStatus, Participant } from '../types';
import { syncSession, syncParticipants, updateRoomState } from '../services/syncService';
import { sortLeaderboard, getCorrectAnswerCount, formatScoreSummary } from '../services/scoringService';
import ThreeLeaderboardEffect from './ThreeLeaderboardEffect';
import { getBaseUrl, getDisplayDomain, getRoomJoinUrl } from '../utils/urlHelper';

interface LiveAdminSessionProps {
  session: LiveSession;
  quiz: Quiz;
  onClose: () => void;
}

const LiveAdminSession: React.FC<LiveAdminSessionProps> = ({ session: initialSession, quiz, onClose }) => {
  const [session, setSession] = useState<LiveSession>(initialSession);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [autoAdvanceTimeLeft, setAutoAdvanceTimeLeft] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const timerIntervalRef = useRef<any>(null);
  const autoAdvanceTimerRef = useRef<any>(null);

  const BASE_URL = getBaseUrl();
  const displayDomain = getDisplayDomain();

  useEffect(() => {
    const unsubscribe = syncSession(session.roomCode, (data) => {
      setSession(prev => ({ ...prev, ...data }));
      setIsConnected(true);
    });
    return () => unsubscribe();
  }, [session.roomCode]);

  useEffect(() => {
    const unsubscribe = syncParticipants(session.roomCode, (list) => {
      const mapped = list.map(p => ({
        ...p,
        phoneNumber: p.phone_number || p.roll_number,
        rollNumber: p.phone_number || p.roll_number,
        totalTimeTaken: p.total_time_taken,
        lastTimeTaken: p.last_time_taken,
        lastAnsweredCorrectly: p.last_answered_correctly,
        answeredQuestionIndex: p.answered_question_index
      }));
      setParticipants(mapped);
    });
    return () => unsubscribe();
  }, [session.roomCode]);

  useEffect(() => {
    if (session.status === SessionStatus.ACTIVE && timeLeft > 0) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && session.status === SessionStatus.ACTIVE) {
      updateRoomState(session.roomCode, { status: SessionStatus.REVEAL });
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [timeLeft, session.status]);

  useEffect(() => {
    if ((session.status === SessionStatus.REVEAL || session.status === SessionStatus.INTERMISSION) && autoAdvance) {
      setAutoAdvanceTimeLeft(5);
      autoAdvanceTimerRef.current = setInterval(() => {
        setAutoAdvanceTimeLeft(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(autoAdvanceTimerRef.current);
            if (session.status === SessionStatus.REVEAL) {
              showLeaderboard();
            } else {
              startNextQuestion();
            }
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (autoAdvanceTimerRef.current) clearInterval(autoAdvanceTimerRef.current);
      setAutoAdvanceTimeLeft(null);
    }
    return () => clearInterval(autoAdvanceTimerRef.current);
  }, [session.status, autoAdvance]);

  const showLeaderboard = async () => {
    const isLast = session.currentQuestionIndex === quiz.questions.length - 1;
    if (isLast) {
      await updateRoomState(session.roomCode, { status: SessionStatus.FINISHED });
    } else {
      await updateRoomState(session.roomCode, { status: SessionStatus.INTERMISSION });
    }
  };

  const startNextQuestion = async () => {
    let nextIdx = session.status === SessionStatus.WAITING ? 0 : session.currentQuestionIndex + 1;
    if (nextIdx >= quiz.questions.length) {
      await updateRoomState(session.roomCode, { status: SessionStatus.FINISHED });
    } else {
      const question = quiz.questions[nextIdx];
      setTimeLeft(question.timeLimit);
      await updateRoomState(session.roomCode, { 
        status: SessionStatus.ACTIVE, 
        currentQuestionIndex: nextIdx,
        startTime: Date.now() 
      });
    }
  };

  const currentQuestion = quiz.questions[session.currentQuestionIndex];
  const sortedParticipants = sortLeaderboard(participants);
  const isLastQuestion = session.currentQuestionIndex === quiz.questions.length - 1;

  return (
    <div className="fixed inset-0 bg-slate-950 text-white z-50 flex flex-col overflow-hidden">
      <header className="p-6 flex items-center justify-between border-b border-white/5 bg-slate-900/40 backdrop-blur-xl z-[70] shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center overflow-hidden p-1 shadow-lg shadow-indigo-600/20">
               <img src="https://i.ibb.co/VYFjgzQL/icon.png" className="w-full h-full object-contain" />
             </div>
             <div>
              <h1 className="text-xl font-black tracking-tight">{quiz.title}</h1>
              <div className="flex items-center gap-3 text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">
                <span className="flex items-center gap-1"><Users size={12} /> {participants.length} Players</span>
                <span className={`flex items-center gap-1 ${isConnected ? 'text-emerald-400' : 'text-amber-500'}`}>
                  <Wifi size={12} /> {isConnected ? 'Live Sync' : 'Reconnecting...'}
                </span>
              </div>
            </div>
          </div>
          {!quiz.isSpecial && (
            <div className="hidden md:flex items-center gap-4 bg-white/5 px-6 py-2.5 rounded-[20px] border border-white/10">
              <span className="text-slate-500 uppercase text-[9px] font-black tracking-[0.2em]">Access Code:</span>
              <span className="text-3xl font-black text-indigo-400 tracking-wider font-mono">{session.roomCode}</span>
            </div>
          )}
        </div>
        <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-full transition-colors"><X size={28} /></button>
      </header>

      <main className="flex-grow flex items-start justify-center p-8 overflow-y-auto relative bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/10 via-slate-950 to-slate-950 scrollbar-hide">
        <div className="w-full flex flex-col items-center pt-12 md:pt-20 pb-24">
        {session.status === SessionStatus.WAITING && (
          <div className="max-w-6xl w-full flex flex-col items-center gap-12 animate-in fade-in slide-in-from-bottom-12 duration-1000">
            {quiz.isSpecial ? (
              <>
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center gap-3 px-6 py-2 bg-indigo-600/20 text-indigo-400 rounded-full border border-indigo-600/30 text-[10px] font-black uppercase tracking-[0.4em]">
                    <ShieldCheck size={16} />
                    Arena Locked • Join via Portal
                  </div>
                  <h2 className="text-6xl md:text-8xl font-black tracking-tighter leading-none bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent italic">Entering the Arena</h2>
                  <p className="text-xl text-slate-500 font-medium">Check the Command Center for your entry code</p>
                </div>
                
                <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {participants.map((p) => (
                    <div key={p.id} className="p-8 bg-white/5 border border-white/10 rounded-[40px] animate-in zoom-in flex flex-col items-center gap-3 group hover:bg-white/10 transition-all hover:scale-105 shadow-xl">
                      <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-600/30 group-hover:rotate-6 transition-transform">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-black text-white uppercase tracking-tight line-clamp-1">{p.name}</div>
                        <div className="text-[10px] font-bold text-indigo-400/70 uppercase tracking-widest mt-1"># {p.rollNumber}</div>
                      </div>
                    </div>
                  ))}
                  {participants.length === 0 && (
                    <div className="col-span-full py-20 text-center space-y-6">
                      <div className="w-24 h-24 bg-slate-900 rounded-[32px] flex items-center justify-center mx-auto text-slate-700 animate-pulse border-2 border-slate-800">
                        <Users size={48} />
                      </div>
                      <p className="text-slate-600 italic text-2xl font-medium">The gates are open... waiting for the first soul to enter.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="max-w-4xl w-full grid md:grid-cols-2 gap-16 items-center">
                <div className="text-center md:text-left space-y-10">
                  <h2 className="text-6xl md:text-8xl font-black tracking-tighter leading-none bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">Ready to play?</h2>
                  <div className="space-y-4">
                    <p className="text-2xl text-slate-400 font-medium">Join at <span className="text-indigo-400 font-black">{displayDomain || 'this site'}</span></p>
                    <div className="inline-block px-12 py-8 bg-indigo-600 rounded-[40px] text-8xl font-black shadow-2xl shadow-indigo-600/40 tracking-tight">
                      {session.roomCode}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-center md:justify-start gap-3">
                    {participants.map((p) => (
                      <div key={p.id} className="px-5 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm font-black flex items-center gap-2">
                        <Users size={14} className="text-indigo-400" />
                        {p.name}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-8">
                  <div className="p-10 bg-white rounded-[60px] shadow-2xl border-[16px] border-indigo-600/10">
                    <QRCodeSVG value={getRoomJoinUrl(session.roomCode)} size={320} fgColor="#020617" />
                  </div>
                  <p className="text-slate-500 font-black uppercase tracking-widest text-xs">Scan to Join Arena</p>
                </div>
              </div>
            )}
          </div>
        )}

        {(session.status === SessionStatus.ACTIVE || session.status === SessionStatus.REVEAL) && currentQuestion && (
          <div className="max-w-5xl w-full space-y-16 animate-in zoom-in">
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-10">
              <div className="space-y-8 flex-grow">
                <div className="flex items-center gap-4">
                  <span className="px-6 py-2 bg-indigo-500/20 text-indigo-400 rounded-full font-black uppercase tracking-widest text-xs border border-indigo-500/30">
                    Question {session.currentQuestionIndex + 1} of {quiz.questions.length}
                  </span>
                </div>
                <h2 className="text-5xl md:text-7xl font-black leading-[1.1] tracking-tight text-white max-w-4xl">
                  {currentQuestion.text}
                </h2>
              </div>
              <div className="flex flex-col items-center md:items-end flex-shrink-0">
                <div className={`text-[120px] font-black leading-none tabular-nums ${timeLeft <= 5 && session.status === SessionStatus.ACTIVE ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                  {session.status === SessionStatus.REVEAL ? '✓' : timeLeft}
                </div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              {currentQuestion.options.map((opt, i) => {
                const isCorrect = i === currentQuestion.correctAnswer;
                return (
                  <div key={i} className={`p-10 rounded-[48px] border-4 flex items-center gap-8 transition-all ${
                    session.status === SessionStatus.REVEAL && isCorrect 
                    ? 'border-emerald-500 bg-emerald-500/20 scale-105 z-10' 
                    : session.status === SessionStatus.REVEAL 
                    ? 'border-white/5 bg-white/5 opacity-40'
                    : 'border-white/5 bg-white/5 hover:bg-white/10'
                  }`}>
                    <span className={`w-16 h-16 rounded-[24px] flex items-center justify-center text-xl font-black ${
                      session.status === SessionStatus.REVEAL && isCorrect ? 'bg-emerald-500 text-white' : 'bg-white/10 text-indigo-400'
                    }`}>
                      {String.fromCharCode(65+i)}
                    </span>
                    <span className={`text-3xl font-black ${session.status === SessionStatus.REVEAL && isCorrect ? 'text-white' : ''}`}>{opt}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {session.status === SessionStatus.INTERMISSION && (
          <div className="max-w-4xl w-full space-y-8 animate-in slide-in-from-bottom-12">
             <ThreeLeaderboardEffect className="w-full h-44" />
             <div className="text-center">
                <h2 className="text-4xl md:text-5xl font-black tracking-tight flex items-center justify-center gap-4 uppercase italic">
                  <Medal className="text-amber-500" size={44} />
                  Top Standings
                </h2>
                <p className="text-xs text-indigo-400 font-bold uppercase tracking-widest mt-1">
                  Ranked by Maximum Correct Answers First • Speed Tie-Breaker
                </p>
             </div>
             <div className="grid gap-3 w-full">
                {sortedParticipants.slice(0, 10).map((p, i) => {
                  const correctCount = getCorrectAnswerCount(p.score);
                  return (
                    <div key={p.id} className={`flex items-center gap-6 p-5 rounded-[28px] border ${i === 0 ? 'bg-indigo-600 border-indigo-400 shadow-2xl scale-[1.02]' : 'bg-white/5 border-white/5'}`}>
                      <div className="text-3xl font-black w-14 text-center">#{i+1}</div>
                      <div className="flex-grow">
                        <div className="text-xl font-black uppercase tracking-tight">{p.name}</div>
                        <div className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">
                          ID: #{p.rollNumber} • {p.totalTimeTaken > 0 ? `${p.totalTimeTaken.toFixed(1)}s speed` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black tabular-nums text-amber-400">{correctCount} Correct</div>
                        <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">{p.totalTimeTaken.toFixed(1)}s total</div>
                      </div>
                    </div>
                  );
                })}
             </div>
          </div>
        )}

        {session.status === SessionStatus.FINISHED && (
          <div className="max-w-5xl w-full text-center space-y-12 animate-in zoom-in">
            <ThreeLeaderboardEffect isGrandFinale={true} className="w-full h-64" />
            <div className="space-y-3">
              <h2 className="text-6xl md:text-8xl font-black uppercase tracking-tighter text-indigo-400 italic">Hall of Fame</h2>
              <p className="text-slate-400 font-bold uppercase tracking-[0.4em] text-xs">Behold the Wisdom Masters</p>
            </div>
            <div className="grid gap-4 w-full">
              {sortedParticipants.slice(0, 10).map((p, i) => {
                const correctCount = getCorrectAnswerCount(p.score);
                const accuracy = quiz.questions.length > 0 ? ((correctCount / quiz.questions.length) * 100).toFixed(0) : '0';

                return (
                  <div key={p.id} className="p-1 bg-white/5 rounded-[40px] border border-white/10 transition-all hover:bg-white/10 group">
                    <div className="flex flex-col md:flex-row items-center w-full p-6 md:p-8 gap-4 md:gap-8">
                      <div className="text-5xl font-black text-amber-500 w-20 text-center">#{i+1}</div>
                      <div className="flex flex-col items-center md:items-start flex-grow">
                        <div className="text-3xl font-black text-white mb-1 uppercase tracking-tight group-hover:text-indigo-400 transition-colors">{p.name}</div>
                        <div className="text-slate-400 font-bold uppercase tracking-widest text-[11px]">
                          PHONE: {p.phoneNumber || p.rollNumber} • ACCURACY: {accuracy}% • TIME: {p.totalTimeTaken.toFixed(1)}s
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-4xl font-black text-amber-400 tabular-nums">{correctCount} / {quiz.questions.length}</div>
                        <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">Correct Answers</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </main>

      <footer className="p-8 bg-slate-900/80 backdrop-blur-3xl border-t border-white/5 flex flex-col sm:flex-row gap-8 justify-between items-center z-[80] shrink-0">
        <div className="flex items-center gap-10">
          <div className="flex flex-col items-start gap-1">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Status</span>
            <div className="flex items-center gap-2">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>
              <span className="text-sm font-black text-white uppercase tracking-tight">{participants.length} PLAYERS ONLINE</span>
            </div>
          </div>
          <button 
            onClick={() => setAutoAdvance(!autoAdvance)} 
            className={`flex items-center gap-3 px-8 py-4 rounded-2xl border-2 transition-all font-black text-xs uppercase tracking-widest ${autoAdvance ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-slate-500'}`}
          >
            {autoAdvance ? <Zap size={18} /> : <ZapOff size={18} />}
            Auto-Flow: {autoAdvance ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="flex gap-4 w-full sm:w-auto">
          {(session.status === SessionStatus.WAITING || session.status === SessionStatus.INTERMISSION) && (
            <button onClick={startNextQuestion} className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-4 bg-white text-slate-950 px-16 py-6 rounded-[32px] font-black text-xl hover:bg-slate-100 transition-all shadow-xl">
              {session.status === SessionStatus.WAITING ? 'START ARENA' : 'NEXT ROUND'}
              <ArrowRight size={28} />
            </button>
          )}
          {session.status === SessionStatus.REVEAL && (
            <button onClick={showLeaderboard} className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-4 bg-emerald-500 text-white px-16 py-6 rounded-[32px] font-black text-xl hover:bg-emerald-600 transition-all shadow-xl">
              {isLastQuestion ? 'FINAL STANDINGS' : 'SHOW STANDINGS'}
              <ArrowRight size={28} />
            </button>
          )}
          {session.status === SessionStatus.FINISHED && (
            <button onClick={onClose} className="w-full sm:w-auto bg-slate-800 text-white px-16 py-6 rounded-[32px] font-black uppercase tracking-widest text-sm hover:bg-slate-700 shadow-xl transition-all">TERMINATE SESSION</button>
          )}
        </div>
      </footer>
    </div>
  );
};

export default LiveAdminSession;
