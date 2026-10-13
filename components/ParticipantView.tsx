import React, { useState, useEffect, useRef } from 'react';
import { Send, Users, Timer, CheckCircle2, XCircle, ArrowLeft, Wifi, UserCheck, CreditCard, Target, Trophy, Medal, Hash, User, RefreshCw, Check, Lock, LogIn } from 'lucide-react';
import { LiveSession, SessionStatus, Participant, Quiz } from '../types';
import { addParticipantToRoom, updateParticipantInRoom, checkRoomExists, fetchQuizzesFromFirebase, getRoomState, getParticipantsOnce } from '../services/syncService';
import { calculateRoundPoints, getCorrectAnswerCount, getSpeedBonusTotal, sortLeaderboard, formatScoreSummary } from '../services/scoringService';
import { signInWithGoogle, signOutUser, subscribeToAuth, getStoredAuthUser, UserProfile } from '../services/authService';
import ThreeAnswerEffect, { ThreeAnswerEffectHandle } from './ThreeAnswerEffect';
import ThreeLeaderboardEffect from './ThreeLeaderboardEffect';

interface ParticipantViewProps {
  onExit: () => void;
  themeToggle: React.ReactNode;
}

const ParticipantView: React.FC<ParticipantViewProps> = ({ onExit, themeToggle }) => {
  const [roomCode, setRoomCode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('room')?.toUpperCase() || localStorage.getItem('active_quiz_room') || '';
    }
    return '';
  });

  const [name, setName] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('participant_profile');
      if (saved) {
        try { return JSON.parse(saved).name || ''; } catch (e) {}
      }
    }
    return '';
  });

  const [rollNumber, setRollNumber] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('participant_profile');
      if (saved) {
        try { return JSON.parse(saved).rollNumber || ''; } catch (e) {}
      }
    }
    return '';
  });

  const [isJoined, setIsJoined] = useState(false);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  
  // Choice selection state (User can freely change selection until timer ends)
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [selectionTimeTaken, setSelectionTimeTaken] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [rejoinNotice, setRejoinNotice] = useState<string | null>(null);

  const [displayScore, setDisplayScore] = useState(0);
  const [firebaseUser, setFirebaseUser] = useState<UserProfile | null>(() => getStoredAuthUser());
  const [isSigningIn, setIsSigningIn] = useState(false);

  const timerRef = useRef<any>(null);
  const pollingRef = useRef<any>(null);
  const answerEffectRef = useRef<ThreeAnswerEffectHandle | null>(null);

  // Auto-resume check if player refreshed or rejoined with existing credentials
  useEffect(() => {
    const savedRoom = localStorage.getItem('active_quiz_room');
    const savedId = localStorage.getItem('myParticipantId');
    if (savedRoom && savedId && !isJoined) {
      // Check if session can be restored
      getRoomState(savedRoom).then(async (state) => {
        if (state) {
          const list = await getParticipantsOnce(savedRoom);
          const found = list.find((p: any) => p.id === savedId);
          if (found) {
            setRoomCode(savedRoom);
            setName(found.name);
            setRollNumber(found.roll_number);
            setDisplayScore(found.score);
            setIsJoined(true);
            setRejoinNotice(`Welcome back, ${found.name}! Session restored.`);
          }
        }
      });
    }
  }, []);

  // Firebase Auth state listener
  useEffect(() => {
    const unsub = subscribeToAuth((user) => {
      setFirebaseUser(user);
      if (user) {
        if (user.displayName) setName(user.displayName);
        if (!rollNumber) {
          const savedProfile = localStorage.getItem('participant_profile');
          let savedRoll = '';
          if (savedProfile) {
            try { savedRoll = JSON.parse(savedProfile).rollNumber; } catch (e) {}
          }
          setRollNumber(savedRoll || user.uid.slice(-4).toUpperCase());
        }
      }
    });
    return () => unsub();
  }, [rollNumber]);

  // Polling room state
  useEffect(() => {
    if (isJoined && roomCode) {
      const poll = async () => {
        try {
          const newState = await getRoomState(roomCode);
          if (newState) {
            setSession(prev => {
              const shouldFetchParticipants = !prev || 
                prev.status !== newState.status || 
                prev.currentQuestionIndex !== newState.currentQuestionIndex;

              if (shouldFetchParticipants) {
                getParticipantsOnce(roomCode).then(list => {
                  const mapped = list.map(p => ({
                    ...p,
                    rollNumber: p.roll_number,
                    totalTimeTaken: p.total_time_taken,
                    lastTimeTaken: p.last_time_taken,
                    lastAnsweredCorrectly: p.last_answered_correctly,
                    answeredQuestionIndex: p.answered_question_index
                  }));
                  setParticipants(mapped);
                });
              }
              return { ...prev, ...newState };
            });
            setIsConnected(true);
          }
        } catch (e) {
          setIsConnected(false);
        }
      };

      poll();
      pollingRef.current = setInterval(poll, 1200);

      return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }
  }, [isJoined, roomCode]);

  // Load quiz details
  useEffect(() => {
    if (session?.quizId && !quiz) {
      fetchQuizzesFromFirebase().then(dbQuizzes => {
        const found = dbQuizzes.find((q: any) => q.id === session.quizId) as Quiz;
        if (found) setQuiz(found);
      });
    }
  }, [session?.quizId, quiz]);

  // Handle score display synchronization and Question Timers
  useEffect(() => {
    const myId = localStorage.getItem('myParticipantId');
    const me = participants.find(p => p.id === myId);

    if (session?.status === SessionStatus.WAITING && me && displayScore === 0) {
      setDisplayScore(me.score);
    }

    if (session?.status === SessionStatus.REVEAL || 
        session?.status === SessionStatus.INTERMISSION || 
        session?.status === SessionStatus.FINISHED) {
      if (me && me.score !== displayScore) {
        setDisplayScore(me.score);
      }
    }

    if (session?.status === SessionStatus.ACTIVE && quiz) {
      const q = quiz.questions[session.currentQuestionIndex];
      if (q && session.startTime) {
        const elapsed = (Date.now() - session.startTime) / 1000;
        const initialTime = Math.max(0, Math.floor(q.timeLimit - elapsed));
        setTimeLeft(initialTime);
        
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(timerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    
    // Auto-reset selection on new question index
    if (session?.status === SessionStatus.ACTIVE) {
      if (me && me.answeredQuestionIndex !== session.currentQuestionIndex && isSubmitted) {
        setSelectedOption(null);
        setSelectionTimeTaken(null);
        setIsSubmitted(false);
      }
    }
  }, [session?.currentQuestionIndex, session?.status, quiz, participants]);

  // AUTO-SUBMIT: When timer hits 0 (or when host reveals result), if an option is selected but not submitted, submit it now!
  useEffect(() => {
    if ((timeLeft === 0 || session?.status === SessionStatus.REVEAL) && 
        selectedOption !== null && 
        !isSubmitted && 
        session?.status === SessionStatus.ACTIVE) {
      finalizeSubmitAnswer(selectedOption, selectionTimeTaken);
    }
  }, [timeLeft, session?.status, selectedOption, isSubmitted]);

  // Real Firebase Google Sign-In with popup
  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const profile = await signInWithGoogle();
      setFirebaseUser(profile);
      if (profile.displayName) setName(profile.displayName);
      if (!rollNumber) {
        setRollNumber(profile.uid.slice(-4).toUpperCase());
      }
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        alert("Google sign-in could not be completed. You can still enter as Guest!");
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await signOutUser();
      setFirebaseUser(null);
    } catch (err) {
      console.warn("Sign out failed", err);
    }
  };

  const joinSession = async () => {
    const code = roomCode.toUpperCase().trim();
    if (!code || !name.trim() || !rollNumber.trim()) {
      return alert("Room Code, Name, and ID Number are required!");
    }
    
    setIsLoading(true);
    try {
      const exists = await checkRoomExists(code);
      if (!exists) {
        alert("Room Code not found! Please verify the code.");
        setIsLoading(false);
        return;
      }

      // Check if this participant already exists in the room (rejoin logic)
      const existingParticipants = await getParticipantsOnce(code);
      const cleanRoll = rollNumber.trim().toUpperCase();
      const storedId = localStorage.getItem('myParticipantId');

      const existingPlayer = existingParticipants.find((p: any) => 
        (storedId && p.id === storedId) || 
        (p.roll_number && p.roll_number.toUpperCase() === cleanRoll)
      );

      let participantId: string;

      if (existingPlayer) {
        // RECONNECT TO EXISTING PROFILE
        participantId = existingPlayer.id;
        setName(existingPlayer.name);
        setRollNumber(existingPlayer.roll_number);
        setDisplayScore(existingPlayer.score);
        setRejoinNotice(`Reconnected! Restored your previous standing.`);
      } else {
        // NEW PARTICIPANT REGISTRATION
        participantId = Math.random().toString(36).substring(2, 9);
        const participant: Participant = {
          id: participantId,
          name: name.trim(),
          rollNumber: cleanRoll,
          score: 0,
          totalTimeTaken: 0,
          lastTimeTaken: 0,
          lastAnsweredCorrectly: false,
          answeredQuestionIndex: -1
        };
        await addParticipantToRoom(code, participant);
      }

      // Save persistent profile & session for future re-entries
      localStorage.setItem('myParticipantId', participantId);
      localStorage.setItem('active_quiz_room', code);
      localStorage.setItem('participant_profile', JSON.stringify({ name: name.trim(), rollNumber: cleanRoll }));

      setIsJoined(true);
    } catch (error) {
      console.error("Join error:", error);
      alert("Could not connect to room. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Option selection handler - User can freely select and change until timer expires
  const handleSelectOption = (idx: number, event?: React.MouseEvent) => {
    if (isSubmitted || !session || session.status !== SessionStatus.ACTIVE || timeLeft === 0) return;

    setSelectedOption(idx);
    const elapsed = session.startTime ? Math.max(0.5, (Date.now() - session.startTime) / 1000) : 1;
    setSelectionTimeTaken(elapsed);

    // Trigger dynamic 3D sparkle effect at click coordinates
    if (event && answerEffectRef.current) {
      answerEffectRef.current.triggerBurst(event.clientX, event.clientY, 0x6366f1);
    }
  };

  // Finalize submission (either manually locked in or auto-submitted when timer hits 0)
  const finalizeSubmitAnswer = async (optionIdx: number, userTimeTaken: number | null) => {
    if (isSubmitted || !session || !session.startTime || !quiz) return;

    setIsSubmitted(true);
    const myId = localStorage.getItem('myParticipantId') || '';
    const question = quiz.questions[session.currentQuestionIndex];
    if (!question) return;

    // Time calculation: if user picked earlier, reward that speed, otherwise time limit
    const finalTimeTaken = userTimeTaken !== null ? Math.min(question.timeLimit, userTimeTaken) : question.timeLimit;
    const isCorrect = optionIdx === question.correctAnswer;
    const points = calculateRoundPoints(isCorrect, finalTimeTaken, question.timeLimit);

    const me = participants.find(p => p.id === myId);
    const currentScore = me ? me.score : 0;
    const currentTotalTime = me ? me.totalTimeTaken : 0;

    const updatedScore = currentScore + points;
    const updatedTotalTime = currentTotalTime + finalTimeTaken;

    try {
      await updateParticipantInRoom(session.roomCode, myId, {
        score: updatedScore,
        totalTimeTaken: updatedTotalTime,
        lastTimeTaken: finalTimeTaken,
        lastAnsweredCorrectly: isCorrect,
        answeredQuestionIndex: session.currentQuestionIndex
      });
    } catch (err) {
      console.error("Failed to submit answer:", err);
    }
  };

  const handleManualLockIn = () => {
    if (selectedOption !== null && !isSubmitted) {
      finalizeSubmitAnswer(selectedOption, selectionTimeTaken);
    }
  };

  // Leave room but allow re-joining
  const handleExitRoom = () => {
    if (confirm("Leave this quiz session? You can rejoin anytime with your ID!")) {
      setIsJoined(false);
      onExit();
    }
  };

  // Render Joined Room View
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-indigo-600 dark:bg-slate-950 p-6 flex flex-col items-center justify-center relative transition-colors duration-500 overflow-hidden">
        <div className="max-w-md w-full space-y-6 relative z-10 animate-in fade-in slide-in-from-bottom-8">
          <div className="text-center text-white space-y-3">
            <div className="w-20 h-20 bg-white rounded-[28px] mx-auto flex items-center justify-center overflow-hidden p-2.5 shadow-2xl border-4 border-white/20">
               <img src="https://i.ibb.co/VYFjgzQL/icon.png" alt="Quiz Icon" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Wisdom Arena</h1>
            <p className="text-indigo-100/80 text-sm font-medium">Join or Reconnect to Live Bhagavad Gita Quiz</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] shadow-2xl space-y-4 border border-white/10">
            {/* Google Authentication (with Guest fallback) */}
            {firebaseUser ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-500/30 rounded-2xl flex items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3">
                  {firebaseUser.photoURL ? (
                    <img 
                      src={firebaseUser.photoURL} 
                      alt={firebaseUser.displayName || 'User'} 
                      className="w-11 h-11 rounded-full border-2 border-emerald-500 object-cover shadow-sm" 
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-emerald-600 text-white font-black flex items-center justify-center text-sm shadow-sm">
                      {(firebaseUser.displayName || 'G').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="leading-tight">
                    <div className="flex items-center gap-1.5 font-black text-xs text-slate-900 dark:text-white">
                      <span>{firebaseUser.displayName}</span>
                      <span className="text-[9px] text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-200 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded-full">
                        ✓ Google Verified
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[180px] mt-0.5">{firebaseUser.email}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGoogleSignOut}
                  className="text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-wider px-2.5 py-1.5 rounded-xl hover:bg-white dark:hover:bg-slate-800 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
                type="button"
                className="w-full py-4 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border-2 border-slate-200 dark:border-slate-700 rounded-2xl flex items-center justify-center gap-3 text-xs font-black text-slate-800 dark:text-white transition-all shadow-sm active:scale-95 disabled:opacity-50"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{isSigningIn ? 'Connecting to Google...' : 'Sign in with Google'}</span>
              </button>
            )}

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-100 dark:border-slate-800"></div>
              <span className="flex-shrink mx-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                {firebaseUser ? 'Participant Room Details' : 'Or Enter Details as Guest'}
              </span>
              <div className="flex-grow border-t border-slate-100 dark:border-slate-800"></div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3">Access Room</label>
              <div className="relative">
                <Hash className="absolute left-5 top-1/2 -translate-y-1/2 text-indigo-400" size={18} />
                <input 
                  type="text" 
                  value={roomCode} 
                  onChange={(e) => setRoomCode(e.target.value)} 
                  placeholder="ROOM CODE" 
                  className="w-full pl-14 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:border-indigo-500 outline-none text-xl font-black text-center tracking-[0.3em] uppercase transition-all dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3">Full Name</label>
              <div className="relative">
                <User className="absolute left-5 top-1/2 -translate-y-1/2 text-indigo-400" size={18} />
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="Enter your name" 
                  className="w-full pl-14 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:border-indigo-500 outline-none font-bold transition-all dark:text-white" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3">ID / Roll Number (Used to Rejoin)</label>
              <div className="relative">
                <CreditCard className="absolute left-5 top-1/2 -translate-y-1/2 text-indigo-400" size={18} />
                <input 
                  type="text" 
                  value={rollNumber} 
                  onChange={(e) => setRollNumber(e.target.value)} 
                  placeholder="e.g. 108 or Roll No" 
                  className="w-full pl-14 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:border-indigo-500 outline-none font-bold transition-all dark:text-white" 
                />
              </div>
            </div>

            <button 
              onClick={joinSession} 
              disabled={isLoading} 
              className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all shadow-xl shadow-indigo-600/30 active:scale-95 disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="animate-spin" size={20} />
                  <span>SYNCING ARENA...</span>
                </>
              ) : (
                <>
                  <span>ENTER / REJOIN ARENA</span>
                  <Send size={20} />
                </>
              )}
            </button>

            <div className="flex justify-between items-center pt-3 border-t border-slate-50 dark:border-slate-800">
              <button 
                onClick={onExit} 
                className="text-slate-400 hover:text-indigo-600 transition-colors text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
              > 
                <ArrowLeft size={14} /> Back to Home
              </button>
              <div className="scale-75">{themeToggle}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session || !quiz) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 gap-6">
        <div className="w-16 h-16 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <span className="font-black text-xs uppercase tracking-[0.4em] text-indigo-500">Connecting to Arena...</span>
      </div>
    );
  }

  const myId = localStorage.getItem('myParticipantId');
  const me = participants.find(p => p.id === myId);
  const sortedParticipants = sortLeaderboard(participants);
  const myRank = sortedParticipants.findIndex(p => p.id === myId) + 1;
  const currentQuestion = quiz.questions[session.currentQuestionIndex];
  const myCorrectCount = me ? getCorrectAnswerCount(displayScore) : 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-300 relative">
      {/* 3D Answer selection particle canvas */}
      <ThreeAnswerEffect ref={answerEffectRef} />

      {/* Header */}
      <header className="p-4 md:p-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExitRoom}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            title="Leave / Exit"
          >
            <ArrowLeft size={18} />
          </button>
          {firebaseUser?.photoURL ? (
            <img 
              src={firebaseUser.photoURL} 
              alt={name} 
              className="w-9 h-9 rounded-xl object-cover border-2 border-indigo-400 shadow-sm" 
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-sm">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="leading-tight">
            <div className="flex items-center gap-1">
              <span className="font-black text-slate-900 dark:text-white block text-sm">{name}</span>
              {firebaseUser && <span className="text-[9px] text-emerald-500 font-bold" title="Google Verified">✓</span>}
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">#{rollNumber}</span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Rank</span>
            <span className="text-lg font-black text-amber-500 tabular-nums">#{myRank || '--'}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Wisdom</span>
            <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
              {myCorrectCount} Correct
            </span>
          </div>
        </div>
      </header>

      {/* Reconnect notice */}
      {rejoinNotice && (
        <div className="bg-emerald-500 text-white text-xs font-black py-2 px-4 text-center flex items-center justify-center gap-2 animate-in slide-in-from-top">
          <Check size={14} />
          <span>{rejoinNotice}</span>
          <button onClick={() => setRejoinNotice(null)} className="ml-3 underline opacity-80 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* Main Body */}
      <main className="flex-grow flex flex-col p-4 md:p-6 max-w-2xl mx-auto w-full relative z-10">
        <div className="flex-grow flex flex-col">
          
          {/* WAITING PHASE */}
          {session.status === SessionStatus.WAITING && (
            <div className="flex-grow flex flex-col items-center justify-center text-center space-y-8 py-12">
              <div className="w-28 h-28 bg-indigo-600 rounded-[36px] flex items-center justify-center text-white shadow-2xl animate-bounce">
                <Users size={56} />
              </div>
              <div className="space-y-3">
                <h2 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Arena Gates Open</h2>
                <p className="text-slate-500 text-sm font-medium">Waiting for Host to begin the questions...</p>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-full font-black text-[10px] uppercase tracking-widest">
                  <Wifi size={14} className="animate-pulse" />
                  Synced with Room {session.roomCode}
                </div>
              </div>
            </div>
          )}

          {/* ACTIVE QUESTION PHASE */}
          {session.status === SessionStatus.ACTIVE && currentQuestion && (
            <div className="space-y-8 animate-in slide-in-from-bottom-8 py-4">
              <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full text-xs font-black uppercase tracking-widest border border-amber-500/20">
                  <Timer size={16} className={timeLeft <= 5 ? 'animate-ping' : 'animate-pulse'} />
                  {timeLeft}s REMAINING
                </div>

                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Question {session.currentQuestionIndex + 1} of {quiz.questions.length}
                </div>

                <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white leading-snug">
                  {currentQuestion.text}
                </h2>

                {/* Status indicator: Changeable answer note */}
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {isSubmitted ? (
                    <span className="text-emerald-500 font-black flex items-center justify-center gap-1">
                      <CheckCircle2 size={16} /> Answer Locked In! Waiting for question timer...
                    </span>
                  ) : selectedOption !== null ? (
                    <span className="text-indigo-600 dark:text-indigo-400 flex items-center justify-center gap-1.5">
                      Selected: <strong>Option {String.fromCharCode(65 + selectedOption)}</strong> · You can change choice anytime until timer reaches 0!
                    </span>
                  ) : (
                    <span>Tap any option to select your answer</span>
                  )}
                </div>
              </div>

              {/* Options list */}
              <div className="grid grid-cols-1 gap-4">
                {currentQuestion.options.map((opt, idx) => {
                  const isSelected = selectedOption === idx;

                  return (
                    <button 
                      key={idx} 
                      disabled={isSubmitted || timeLeft === 0} 
                      onClick={(e) => handleSelectOption(idx, e)} 
                      className={`p-6 rounded-[28px] border-3 text-lg font-black transition-all flex items-center gap-5 shadow-sm text-left relative overflow-hidden active:scale-[0.98] ${
                        isSelected 
                          ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl scale-[1.01]' 
                          : isSubmitted
                          ? 'opacity-40 border-transparent bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-indigo-400'
                      }`}
                    >
                      <span className={`w-12 h-12 flex-shrink-0 rounded-2xl flex items-center justify-center text-lg font-black transition-colors ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400'
                      }`}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="flex-grow leading-snug">{opt}</span>
                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-white text-indigo-600 flex items-center justify-center shrink-0">
                          <Check size={16} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Optional Early Lock-In Button */}
              {selectedOption !== null && !isSubmitted && timeLeft > 0 && (
                <div className="pt-2 flex justify-center">
                  <button
                    onClick={handleManualLockIn}
                    className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
                  >
                    <Lock size={16} />
                    LOCK IN ANSWER NOW (Extra Speed Bonus)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* REVEAL PHASE */}
          {session.status === SessionStatus.REVEAL && currentQuestion && (
            <div className="flex-grow flex flex-col items-center justify-center text-center space-y-8 py-10">
              <div className={`w-32 h-32 ${me?.lastAnsweredCorrectly ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-red-500 shadow-red-500/30'} rounded-full flex items-center justify-center text-white mx-auto shadow-2xl animate-in zoom-in`}>
                {me?.lastAnsweredCorrectly ? <Target size={64} /> : <XCircle size={64} />}
              </div>

              <div className="space-y-1">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                  {me?.lastAnsweredCorrectly ? 'Glorious! Correct Answer' : 'Incorrect choice'}
                </span>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                  {me?.lastAnsweredCorrectly ? '+ 1 Wisdom Point Earned' : '+ 0 Points'}
                </h3>
              </div>

              <div className="w-full space-y-3">
                <span className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em]">Correct Answer Was</span>
                <div className="p-8 bg-white dark:bg-slate-900 border-2 border-emerald-500 rounded-[36px] shadow-xl">
                   <p className="text-2xl font-black text-slate-900 dark:text-white leading-tight">
                     {currentQuestion.options[currentQuestion.correctAnswer]}
                   </p>
                </div>
              </div>
            </div>
          )}

          {/* INTERMISSION LEADERBOARD */}
          {session.status === SessionStatus.INTERMISSION && (
            <div className="flex-grow flex flex-col items-center justify-center text-center space-y-6 py-6 animate-in slide-in-from-bottom">
              {/* 3D Trophy / Golden Emblem Animation */}
              <ThreeLeaderboardEffect className="w-full h-40" />

              <div className="text-center space-y-1">
                <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Arena Standings</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                  Ranked by Maximum Correct Answers First
                </p>
              </div>

              {/* User Standing Card */}
              <div className="p-8 bg-indigo-600 text-white rounded-[36px] shadow-2xl w-full relative overflow-hidden">
                <div className="text-indigo-200 text-[10px] font-black uppercase tracking-[0.3em]">YOUR CURRENT STANDING</div>
                <div className="text-6xl font-black tracking-tight my-2">#{myRank}</div>
                <div className="text-indigo-100 font-bold text-sm">
                  {myCorrectCount} Correct Answers • {me ? me.totalTimeTaken.toFixed(1) : 0}s Total Time
                </div>
              </div>

              {/* Top 5 Standings preview */}
              <div className="w-full space-y-2 pt-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block text-left px-2">Top Warriors</span>
                {sortedParticipants.slice(0, 5).map((p, i) => {
                  const pCorrect = getCorrectAnswerCount(p.score);
                  const isMe = p.id === myId;

                  return (
                    <div 
                      key={p.id}
                      className={`flex items-center justify-between p-4 rounded-2xl border text-sm font-black ${
                        isMe 
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-400 text-indigo-900 dark:text-indigo-200' 
                          : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-7 text-left text-slate-400">#{i + 1}</span>
                        <span>{p.name}</span>
                        {isMe && <span className="text-[10px] px-2 py-0.5 bg-indigo-600 text-white rounded-md">YOU</span>}
                      </div>
                      <div className="text-right">
                        <span className="text-indigo-600 dark:text-indigo-400">{pCorrect} Correct</span>
                        <span className="text-[10px] text-slate-400 font-normal ml-2">({p.totalTimeTaken.toFixed(1)}s)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* FINISHED / HALL OF FAME */}
          {session.status === SessionStatus.FINISHED && (
            <div className="flex-grow flex flex-col items-center justify-center text-center space-y-8 py-8 animate-in zoom-in">
              <ThreeLeaderboardEffect isGrandFinale={true} className="w-full h-48" />

              <h2 className="text-4xl md:text-5xl font-black text-indigo-500 uppercase tracking-tight italic">
                Final Honor
              </h2>

              <div className="w-full max-w-sm p-10 bg-indigo-600 rounded-[48px] text-white shadow-2xl space-y-4">
                 <div className="text-indigo-200 font-black uppercase tracking-[0.3em] text-[10px]">FINAL RANK</div>
                 <div className="text-8xl font-black leading-none tracking-tighter">#{myRank}</div>
                 <div className="text-indigo-100 font-bold text-lg">
                   {myCorrectCount} of {quiz.questions.length} Correct
                 </div>
                 <div className="text-xs text-indigo-200">Total Speed: {me ? me.totalTimeTaken.toFixed(1) : 0}s</div>
              </div>

              <button 
                onClick={handleExitRoom} 
                className="px-10 py-5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all border border-slate-200 dark:border-slate-800"
              >
                Return to Home
              </button>
            </div>
          )}
        </div>

        {/* Global Connection Footer */}
        {isJoined && (
          <div className="py-6 flex items-center justify-center gap-4 text-xs">
             <div className="flex items-center gap-2.5 bg-white dark:bg-slate-900 px-5 py-2.5 rounded-full shadow-sm border border-slate-100 dark:border-slate-800">
               <div className="relative flex h-2.5 w-2.5">
                 <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'} opacity-75`}></span>
                 <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
               </div>
               <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{isConnected ? 'Synchronized' : 'Reconnecting'}</span>
             </div>

             <div className="flex items-center gap-2 bg-indigo-50 dark:bg-slate-900 px-5 py-2.5 rounded-full border border-indigo-100 dark:border-slate-800">
                <Users size={13} className="text-indigo-600" />
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{participants.length} Warriors</span>
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ParticipantView;
