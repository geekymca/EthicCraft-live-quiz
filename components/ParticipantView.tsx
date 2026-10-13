import React, { useState, useEffect, useRef } from 'react';
import { Send, Users, Timer, CheckCircle2, XCircle, ArrowLeft, Wifi, Phone, Target, Trophy, Medal, Hash, User, RefreshCw, Check, Lock } from 'lucide-react';
import { LiveSession, SessionStatus, Participant, Quiz } from '../types';
import { addParticipantToRoom, updateParticipantInRoom, checkRoomExists, fetchQuizzesFromFirebase, getRoomState, getParticipantsOnce } from '../services/syncService';
import { calculateRoundPoints, getCorrectAnswerCount, sortLeaderboard } from '../services/scoringService';
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

  // Primary key identifier: Phone Number
  const [phoneNumber, setPhoneNumber] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('participant_profile');
      if (saved) {
        try { 
          const parsed = JSON.parse(saved);
          return parsed.phoneNumber || parsed.rollNumber || ''; 
        } catch (e) {}
      }
    }
    return '';
  });

  const [isJoined, setIsJoined] = useState(false);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  
  // Choice selection state (Locks immediately on selection)
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [selectionTimeTaken, setSelectionTimeTaken] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [rejoinNotice, setRejoinNotice] = useState<string | null>(null);
  const [myParticipantId, setMyParticipantId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('myParticipantId') || '';
    }
    return '';
  });

  const [displayScore, setDisplayScore] = useState(0);

  const timerRef = useRef<any>(null);
  const pollingRef = useRef<any>(null);
  const answerEffectRef = useRef<ThreeAnswerEffectHandle | null>(null);

  // Auto-resume check on initial load
  useEffect(() => {
    const savedRoom = localStorage.getItem('active_quiz_room');
    const savedId = localStorage.getItem('myParticipantId');
    if (savedRoom && savedId && !isJoined) {
      getRoomState(savedRoom).then(async (state) => {
        // Discard session if room does not exist or has finished
        if (!state || state.status === SessionStatus.FINISHED) {
          localStorage.removeItem('active_quiz_room');
          localStorage.removeItem('myParticipantId');
          return;
        }

        const list = await getParticipantsOnce(savedRoom);
        const found = list.find((p: any) => p.id === savedId);
        if (found) {
          setRoomCode(savedRoom);
          setName(found.name);
          setPhoneNumber(found.phone_number || found.roll_number || '');
          setMyParticipantId(found.id);
          setDisplayScore(found.score);
          setIsJoined(true);
          setRejoinNotice(`Welcome back, ${found.name}! Reconnected to active session.`);
        } else {
          // Stale ID from prior quiz run
          localStorage.removeItem('active_quiz_room');
          localStorage.removeItem('myParticipantId');
        }
      });
    }
  }, []);

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
                    phoneNumber: p.phone_number || p.roll_number,
                    rollNumber: p.phone_number || p.roll_number,
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

  // Join or reconnect to live session using Phone Number as primary key
  const joinSession = async () => {
    const code = roomCode.toUpperCase().trim();
    const cleanPhone = phoneNumber.replace(/[\s\-()]/g, '').trim();

    if (!code || !name.trim() || !cleanPhone) {
      return alert("Room Code, Name, and Phone Number are required!");
    }

    if (cleanPhone.length < 6) {
      return alert("Please enter a valid Phone Number!");
    }
    
    setIsLoading(true);
    try {
      const room = await getRoomState(code);
      if (!room) {
        alert("Room Code not found! Please verify the code.");
        setIsLoading(false);
        return;
      }

      if (room.status === SessionStatus.FINISHED) {
        alert("This quiz session has already finished. Please ask the host to start a new quiz.");
        setIsLoading(false);
        return;
      }

      // Check if participant exists in this room by Phone Number (primary key for active quiz)
      const existingParticipants = await getParticipantsOnce(code);
      const storedId = localStorage.getItem('myParticipantId');

      const existingPlayer = existingParticipants.find((p: any) => {
        const pPhone = (p.phone_number || p.roll_number || '').replace(/[\s\-()]/g, '');
        return (storedId && p.id === storedId) || (pPhone && pPhone === cleanPhone);
      });

      let participantId: string;

      if (existingPlayer) {
        // Reconnect to active running quiz session
        participantId = existingPlayer.id;
        setName(existingPlayer.name);
        setPhoneNumber(existingPlayer.phone_number || existingPlayer.roll_number || cleanPhone);
        setDisplayScore(existingPlayer.score);
        setRejoinNotice(`Reconnected! Restored active session standing.`);
      } else {
        // Register new participant
        participantId = Math.random().toString(36).substring(2, 9);
        const participant: Participant = {
          id: participantId,
          name: name.trim(),
          phoneNumber: cleanPhone,
          rollNumber: cleanPhone,
          score: 0,
          totalTimeTaken: 0,
          lastTimeTaken: 0,
          lastAnsweredCorrectly: false,
          answeredQuestionIndex: -1
        };
        await addParticipantToRoom(code, participant);
      }

      // Save to localStorage and state for reconnection during this active quiz
      setMyParticipantId(participantId);
      localStorage.setItem('myParticipantId', participantId);
      localStorage.setItem('active_quiz_room', code);
      localStorage.setItem('participant_profile', JSON.stringify({ name: name.trim(), phoneNumber: cleanPhone }));

      setIsJoined(true);
    } catch (error) {
      console.error("Join error:", error);
      alert("Could not connect to room. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Reverted: Immediate lock-in on selection (cannot be changed once tapped)
  const handleSelectOption = (idx: number, event?: React.MouseEvent) => {
    if (isSubmitted || !session || session.status !== SessionStatus.ACTIVE || timeLeft === 0) return;

    setSelectedOption(idx);
    setIsSubmitted(true); // Locked immediately!

    const elapsed = session.startTime ? Math.max(0.5, (Date.now() - session.startTime) / 1000) : 1;
    setSelectionTimeTaken(elapsed);

    // Trigger dynamic 3D sparkle effect at touch/click coordinates
    if (event && answerEffectRef.current) {
      answerEffectRef.current.triggerBurst(event.clientX, event.clientY, 0x6366f1);
    }

    // Immediately submit to database
    finalizeSubmitAnswer(idx, elapsed);
  };

  // Finalize answer submission to database
  const finalizeSubmitAnswer = async (optionIdx: number, userTimeTaken: number | null) => {
    if (!session || !session.startTime || !quiz) return;

    const myId = localStorage.getItem('myParticipantId') || '';
    const question = quiz.questions[session.currentQuestionIndex];
    if (!question) return;

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

  // Exit room handler
  const handleExitRoom = () => {
    if (confirm("Leave this quiz session?")) {
      localStorage.removeItem('active_quiz_room');
      localStorage.removeItem('myParticipantId');
      setIsJoined(false);
      onExit();
    }
  };

  // Render Join View
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-indigo-600 dark:bg-slate-950 p-6 flex flex-col items-center justify-center relative transition-colors duration-500 overflow-hidden">
        <div className="max-w-md w-full space-y-6 relative z-10 animate-in fade-in slide-in-from-bottom-8">
          <div className="text-center text-white space-y-3">
            <div className="w-20 h-20 bg-white rounded-[28px] mx-auto flex items-center justify-center overflow-hidden p-2.5 shadow-2xl border-4 border-white/20">
               <img src="https://i.ibb.co/VYFjgzQL/icon.png" alt="Quiz Icon" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Wisdom Arena</h1>
            <p className="text-indigo-100/80 text-sm font-medium">Join Live Bhagavad Gita Quiz Arena</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] shadow-2xl space-y-5 border border-white/10">
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
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3">
                Phone Number (Primary Key)
              </label>
              <div className="relative">
                <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-indigo-400" size={18} />
                <input 
                  type="tel" 
                  value={phoneNumber} 
                  onChange={(e) => setPhoneNumber(e.target.value)} 
                  placeholder="e.g. 9876543210" 
                  className="w-full pl-14 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:border-indigo-500 outline-none font-bold transition-all dark:text-white" 
                />
              </div>
              <p className="text-[10px] text-slate-400 ml-3">Used as unique identifier to reconnect if disconnected</p>
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
                  <span>ENTER / JOIN ARENA</span>
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

  const cleanPhone = phoneNumber.replace(/[\s\-()]/g, '').trim();
  const myId = myParticipantId || (typeof window !== 'undefined' ? localStorage.getItem('myParticipantId') || '' : '');
  const me = participants.find(p => 
    (myId && p.id === myId) || 
    (cleanPhone && p.phone_number && p.phone_number.replace(/[\s\-()]/g, '') === cleanPhone) ||
    (cleanPhone && p.roll_number && p.roll_number.replace(/[\s\-()]/g, '') === cleanPhone) ||
    (name && p.name === name)
  );
  const activeMyId = me ? me.id : myId;
  const sortedParticipants = sortLeaderboard(participants);
  const myRank = activeMyId ? Math.max(1, sortedParticipants.findIndex(p => p.id === activeMyId) + 1) : (sortedParticipants.length > 0 ? 1 : '--');
  const currentQuestion = quiz.questions[session.currentQuestionIndex];
  const myCorrectCount = me ? getCorrectAnswerCount(me.score) : getCorrectAnswerCount(displayScore);

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
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-sm">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="leading-tight">
            <span className="font-black text-slate-900 dark:text-white block text-sm">{name}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{phoneNumber}</span>
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

                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {isSubmitted ? (
                    <span className="text-emerald-500 font-black flex items-center justify-center gap-1">
                      <CheckCircle2 size={16} /> Choice Locked In! Waiting for question timer...
                    </span>
                  ) : (
                    <span>Tap your choice to submit and lock in</span>
                  )}
                </div>
              </div>

              {/* Options list: Reverted to immediate lock-in on selection */}
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
                          ? 'opacity-40 border-transparent bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-not-allowed'
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
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Correct Answer:</div>
                <div className="p-5 bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-2xl font-black text-lg">
                  {String.fromCharCode(65 + currentQuestion.correctAnswer)}. {currentQuestion.options[currentQuestion.correctAnswer]}
                </div>
              </div>

              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">
                Host is transitioning to standings...
              </p>
            </div>
          )}

          {/* INTERMISSION / LEADERBOARD */}
          {session.status === SessionStatus.INTERMISSION && (
            <div className="space-y-6 animate-in slide-in-from-bottom-8 py-6">
              {/* 3D Trophy and celebration visual */}
              <ThreeLeaderboardEffect isGrandFinale={false} className="w-full h-40" />

              <div className="text-center space-y-1">
                <span className="text-xs font-black text-indigo-500 uppercase tracking-widest">Intermission Standings</span>
                <h3 className="text-3xl font-black text-slate-900 dark:text-white">Current Leaderboard</h3>
              </div>

              <div className="space-y-3">
                {sortedParticipants.slice(0, 10).map((p, i) => {
                  const isMe = p.id === myId;
                  const pCorrect = getCorrectAnswerCount(p.score);

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

              <div className="space-y-1">
                <span className="text-xs font-black text-indigo-500 uppercase tracking-widest">Arena Concluded</span>
                <h2 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white uppercase tracking-tight italic">
                  Final Honor & Standings
                </h2>
              </div>

              {/* Personal Rank Card */}
              <div className="w-full max-w-md p-8 md:p-10 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-[44px] text-white shadow-2xl space-y-4 border border-indigo-400/30">
                 <div className="flex items-center justify-between">
                   <span className="text-indigo-200 font-black uppercase tracking-[0.25em] text-[10px]">YOUR FINAL STANDING</span>
                   <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-black uppercase tracking-wider">
                     {myRank === 1 ? '🏆 Champion' : myRank === 2 ? '🥈 2nd Place' : myRank === 3 ? '🥉 3rd Place' : `Rank #${myRank}`}
                   </span>
                 </div>
                 
                 <div className="text-7xl md:text-8xl font-black leading-none tracking-tighter text-white">
                   #{myRank}
                 </div>
                 
                 <div className="text-lg font-black text-indigo-100">
                   {name} {phoneNumber && <span className="text-xs text-indigo-200 font-normal">({phoneNumber})</span>}
                 </div>

                 <div className="pt-2 grid grid-cols-2 gap-3 border-t border-white/20 text-left">
                   <div className="p-3 bg-white/10 rounded-2xl">
                     <span className="text-[9px] uppercase tracking-wider text-indigo-200 font-black block">Correct Answers</span>
                     <span className="text-xl font-black text-white">{myCorrectCount} / {quiz.questions.length}</span>
                   </div>
                   <div className="p-3 bg-white/10 rounded-2xl">
                     <span className="text-[9px] uppercase tracking-wider text-indigo-200 font-black block">Total Speed</span>
                     <span className="text-xl font-black text-white">{me ? me.totalTimeTaken.toFixed(1) : '0.0'}s</span>
                   </div>
                 </div>
              </div>

              {/* Complete Arena Final Leaderboard */}
              <div className="w-full max-w-md space-y-3 text-left">
                <div className="flex items-center justify-between px-2">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">All Warriors ({participants.length})</h4>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ranked by Wisdom</span>
                </div>

                <div className="space-y-2.5">
                  {sortedParticipants.map((p, i) => {
                    const isMe = p.id === activeMyId || (cleanPhone && (p.phone_number === cleanPhone || p.roll_number === cleanPhone));
                    const pCorrect = getCorrectAnswerCount(p.score);

                    return (
                      <div 
                        key={p.id}
                        className={`flex items-center justify-between p-4 rounded-2xl border text-sm font-black transition-all ${
                          isMe 
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 border-2 border-indigo-500 text-indigo-900 dark:text-indigo-200 shadow-md scale-[1.01]' 
                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200 shadow-sm'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${
                            i === 0 ? 'bg-amber-400 text-slate-950 shadow-md' :
                            i === 1 ? 'bg-slate-300 text-slate-950 shadow-md' :
                            i === 2 ? 'bg-amber-700 text-white shadow-md' :
                            'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}>
                            #{i + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span>{p.name}</span>
                              {isMe && (
                                <span className="text-[9px] px-2 py-0.5 bg-indigo-600 text-white rounded-md font-black">
                                  YOU
                                </span>
                              )}
                            </div>
                            {(p.phone_number || p.roll_number) && (
                              <span className="text-[10px] text-slate-400 font-normal block">
                                {p.phone_number || p.roll_number}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-indigo-600 dark:text-indigo-400 block tabular-nums">
                            {pCorrect} / {quiz.questions.length} Correct
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            {p.totalTimeTaken.toFixed(1)}s
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button 
                onClick={handleExitRoom} 
                className="px-12 py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-xs active:scale-95 transition-all mt-4"
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
