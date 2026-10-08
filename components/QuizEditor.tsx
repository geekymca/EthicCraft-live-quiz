
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Sparkles, Clock, CheckCircle2, Timer, Zap, FileCode } from 'lucide-react';
import { Quiz, Question } from '../types';
import { generateQuizQuestions } from '../services/geminiService';
import { saveQuizToFirebase, fetchQuizzesFromFirebase } from '../services/syncService';
import JsonImportModal from './JsonImportModal';

interface QuizEditorProps {
  quizId: string | null;
  onBack: () => void;
}

const QuizEditor: React.FC<QuizEditorProps> = ({ quizId, onBack }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isSpecial, setIsSpecial] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [defaultTime, setDefaultTime] = useState(20);
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);

  useEffect(() => {
    if (quizId) {
      const load = async () => {
        const quizzes = await fetchQuizzesFromFirebase();
        const found = quizzes.find((q: any) => q.id === quizId) as Quiz;
        if (found) {
          setTitle(found.title);
          setDescription(found.description);
          setQuestions(found.questions);
          setIsSpecial(found.isSpecial || false);
        }
      };
      load();
    }
  }, [quizId]);

  const applyDefaultTime = () => {
    setQuestions(questions.map(q => ({ ...q, timeLimit: defaultTime })));
  };

  const addQuestion = () => {
    const newQ: Question = {
      id: Math.random().toString(36).substr(2, 9),
      text: '',
      options: ['', '', '', ''],
      correctAnswer: 0,
      timeLimit: defaultTime
    };
    setQuestions([...questions, newQ]);
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const handleAISuggest = async () => {
    if (!title) {
      alert("Please enter a quiz title for the AI to understand the topic.");
      return;
    }
    setIsGenerating(true);
    const suggested = await generateQuizQuestions(title);
    if (suggested.length > 0) {
      const formatted = suggested.map((s: any) => ({
        ...s,
        id: Math.random().toString(36).substr(2, 9),
        timeLimit: defaultTime
      }));
      setQuestions([...questions, ...formatted]);
    }
    setIsGenerating(false);
  };

  const handleJsonImport = (
    importedQuestions: Question[],
    importedTitle?: string,
    importedDesc?: string,
    mode: 'replace' | 'append' = 'append'
  ) => {
    if (mode === 'replace') {
      setQuestions(importedQuestions);
    } else {
      setQuestions(prev => [...prev, ...importedQuestions]);
    }
    if (importedTitle && !title) setTitle(importedTitle);
    if (importedDesc && !description) setDescription(importedDesc);
  };

  const handleSave = async () => {
    if (!title) return alert('Title required');
    if (questions.length === 0) return alert('Add at least one question');
    
    setIsSaving(true);
    const newQuiz: Quiz = {
      id: quizId || Math.random().toString(36).substr(2, 9),
      title,
      description,
      questions,
      isSpecial,
      createdAt: Date.now()
    };

    try {
      await saveQuizToFirebase(newQuiz);
      onBack();
    } catch (err) {
      alert("Failed to save to cloud.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="flex items-center justify-between mb-8 sticky top-0 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md py-6 z-20 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-2xl transition-colors text-slate-600 dark:text-slate-400">
            <ArrowLeft />
          </button>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{quizId ? 'Edit Quiz' : 'New Quiz'}</h1>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 disabled:opacity-50"
        >
          <Save size={18} />
          {isSaving ? 'SAVING...' : 'SAVE QUIZ'}
        </button>
      </div>

      <div className="space-y-12 pb-24">
        <section className="bg-white dark:bg-slate-800 p-8 rounded-[40px] border border-slate-200 dark:border-slate-700 shadow-sm space-y-8">
          <div className="flex items-center justify-between p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-[32px] border border-indigo-100 dark:border-indigo-900/40">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl ${isSpecial ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white dark:bg-slate-800 text-indigo-600 border border-indigo-100'}`}>
                <Zap size={24} fill={isSpecial ? 'currentColor' : 'none'} />
              </div>
              <div>
                <h3 className="text-lg font-black text-indigo-900 dark:text-white">Special Arena Mode</h3>
                <p className="text-xs text-indigo-600/70 dark:text-indigo-300/60 font-bold uppercase tracking-widest mt-0.5">Hides entry QR/Code in waiting area</p>
              </div>
            </div>
            <button 
              onClick={() => setIsSpecial(!isSpecial)}
              className={`w-16 h-8 rounded-full transition-all relative ${isSpecial ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
            >
              <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all ${isSpecial ? 'left-9' : 'left-1'}`} />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Quiz Title</label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bhagavad Gita Ch 1"
                className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:border-indigo-500 outline-none transition-all text-xl font-bold text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Default Timer (All Questions)</label>
              <div className="flex gap-2">
                <select 
                  value={defaultTime}
                  onChange={(e) => setDefaultTime(parseInt(e.target.value))}
                  className="flex-grow px-6 py-4 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:border-indigo-500 outline-none font-bold text-slate-900 dark:text-white"
                >
                  {[10, 15, 20, 30, 45, 60, 90, 120].map(s => (
                    <option key={s} value={s}>{s} seconds</option>
                  ))}
                </select>
                <button 
                  onClick={applyDefaultTime}
                  className="px-6 py-4 bg-amber-500 text-white rounded-2xl font-black hover:bg-amber-600 transition-all"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Description (Optional)</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What should participants expect?"
              className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:border-indigo-500 outline-none transition-all h-28 resize-none text-slate-700 dark:text-slate-300"
            />
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">Questions ({questions.length})</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsJsonModalOpen(true)}
              className="flex items-center gap-2 text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-5 py-3 rounded-2xl font-black transition-all border-2 border-indigo-200 dark:border-indigo-800 text-sm shadow-sm"
            >
              <FileCode size={18} />
              BULK JSON (IMPORT / EXPORT)
            </button>
            <button 
              disabled={isGenerating}
              onClick={handleAISuggest}
              className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-6 py-3 rounded-2xl font-black transition-all border-2 border-indigo-100 dark:border-indigo-900/40 disabled:opacity-50 text-sm"
            >
              <Sparkles size={18} />
              {isGenerating ? 'AI WORKING...' : 'GENERATE WITH AI'}
            </button>
          </div>
        </div>

        <div className="space-y-8">
          {questions.map((q, idx) => (
            <div key={q.id} className="bg-white dark:bg-slate-800 p-8 rounded-[40px] border border-slate-200 dark:border-slate-700 shadow-sm relative group animate-in fade-in slide-in-from-bottom-8">
              <button 
                onClick={() => removeQuestion(q.id)}
                className="absolute top-6 right-6 p-2 text-slate-300 hover:text-red-500 transition-colors"
              >
                <Trash2 size={22} />
              </button>
              
              <div className="flex gap-6 items-start mb-8">
                <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-lg">
                  {idx + 1}
                </span>
                <div className="flex-grow">
                  <input 
                    type="text" 
                    value={q.text}
                    onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                    placeholder="Enter question text..."
                    className="w-full px-0 py-2 bg-transparent border-b-4 border-slate-50 dark:border-slate-900 focus:border-indigo-500 outline-none transition-all text-2xl font-black text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {q.options.map((opt, optIdx) => (
                  <div key={optIdx} className="relative">
                    <input 
                      type="text" 
                      value={opt}
                      onChange={(e) => {
                        const newOpts = [...q.options];
                        newOpts[optIdx] = e.target.value;
                        updateQuestion(q.id, { options: newOpts });
                      }}
                      placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                      className={`w-full pl-16 pr-6 py-4 rounded-2xl border-2 outline-none transition-all font-bold ${
                        q.correctAnswer === optIdx 
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-900 dark:text-emerald-100' 
                        : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:border-indigo-500 text-slate-700 dark:text-slate-300'
                      }`}
                    />
                    <button 
                      onClick={() => updateQuestion(q.id, { correctAnswer: optIdx })}
                      className={`absolute left-4 top-1/2 -translate-y-1/2 p-1 rounded-full transition-all ${
                        q.correctAnswer === optIdx ? 'text-emerald-600' : 'text-slate-300 dark:text-slate-600 hover:text-indigo-400'
                      }`}
                    >
                      <CheckCircle2 size={32} fill={q.correctAnswer === optIdx ? 'currentColor' : 'transparent'} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-8 border-t border-slate-50 dark:border-slate-700 flex items-center gap-6">
                <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-900 px-5 py-2 rounded-2xl">
                  <Clock size={18} className="text-slate-400" />
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Time:</span>
                  <select 
                    value={q.timeLimit}
                    onChange={(e) => updateQuestion(q.id, { timeLimit: parseInt(e.target.value) })}
                    className="bg-transparent font-black text-indigo-600 outline-none text-sm"
                  >
                    {[10, 15, 20, 30, 45, 60, 90, 120].map(s => (
                      <option key={s} value={s}>{s}s</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <button 
            onClick={addQuestion}
            className="py-6 border-4 border-dashed border-slate-200 dark:border-slate-800 rounded-[32px] text-slate-500 dark:text-slate-400 font-black text-base hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center justify-center gap-3 bg-white/50 dark:bg-slate-900/50"
          >
            <Plus size={22} />
            ADD SINGLE QUESTION
          </button>
          <button 
            onClick={() => setIsJsonModalOpen(true)}
            className="py-6 border-4 border-dashed border-indigo-200 dark:border-indigo-900/50 rounded-[32px] text-indigo-600 dark:text-indigo-400 font-black text-base hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all flex items-center justify-center gap-3 bg-indigo-50/30 dark:bg-indigo-950/20"
          >
            <FileCode size={22} />
            PASTE / IMPORT BULK JSON
          </button>
        </div>
      </div>

      <JsonImportModal
        isOpen={isJsonModalOpen}
        onClose={() => setIsJsonModalOpen(false)}
        onImport={handleJsonImport}
        existingQuestions={questions}
        currentTitle={title}
        defaultTime={defaultTime}
      />
    </div>
  );
};

export default QuizEditor;
