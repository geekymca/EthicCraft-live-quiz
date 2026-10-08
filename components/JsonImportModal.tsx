import React, { useState } from 'react';
import { X, Upload, FileText, Check, AlertCircle, Copy, Download, Code2, Sparkles } from 'lucide-react';
import { Question } from '../types';

interface JsonImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (questions: Question[], title?: string, description?: string, mode?: 'replace' | 'append') => void;
  existingQuestions: Question[];
  currentTitle?: string;
  defaultTime: number;
}

const SAMPLE_JSON = [
  {
    "text": "Who is the speaker of the Bhagavad Gita?",
    "options": ["Lord Krishna", "Arjuna", "Sanjaya", "Dhritarashtra"],
    "correctAnswer": 0,
    "timeLimit": 20
  },
  {
    "text": "What does 'Karmanye Vadhikaraste Ma Phaleshu Kadachana' teach us?",
    "options": [
      "Renounce all actions",
      "Focus on sincere duty without attachment to results",
      "Action only for personal reward",
      "Flee from challenging situations"
    ],
    "correctAnswer": 1,
    "timeLimit": 25
  },
  {
    "text": "How many chapters and verses are there in the Bhagavad Gita?",
    "options": [
      "18 Chapters, 700 Verses",
      "12 Chapters, 500 Verses",
      "24 Chapters, 1000 Verses",
      "10 Chapters, 400 Verses"
    ],
    "correctAnswer": 0,
    "timeLimit": 20
  }
];

export const JsonImportModal: React.FC<JsonImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
  existingQuestions,
  currentTitle,
  defaultTime,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [jsonText, setJsonText] = useState('');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<{
    questions: Question[];
    title?: string;
    description?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const parseAndValidateJson = (text: string) => {
    setErrorMsg(null);
    setParsedPreview(null);

    const trimmed = text.trim();
    if (!trimmed) {
      setErrorMsg('Please paste or upload JSON code.');
      return null;
    }

    try {
      const data = JSON.parse(trimmed);
      let rawQuestions: any[] = [];
      let quizTitle: string | undefined;
      let quizDescription: string | undefined;

      if (Array.isArray(data)) {
        rawQuestions = data;
      } else if (typeof data === 'object' && data !== null) {
        if (data.title && typeof data.title === 'string') quizTitle = data.title;
        if (data.description && typeof data.description === 'string') quizDescription = data.description;

        if (Array.isArray(data.questions)) {
          rawQuestions = data.questions;
        } else if (Array.isArray(data.items)) {
          rawQuestions = data.items;
        } else {
          throw new Error('JSON object must contain a "questions" array.');
        }
      } else {
        throw new Error('Invalid JSON structure. Expected an array of questions or an object with "questions".');
      }

      if (rawQuestions.length === 0) {
        throw new Error('No questions found in JSON.');
      }

      const formattedQuestions: Question[] = rawQuestions.map((q, idx) => {
        const text = q.text || q.question || q.prompt || q.title || `Question ${idx + 1}`;
        let options: string[] = [];

        if (Array.isArray(q.options)) {
          options = q.options.map((opt: any) => String(opt || '').trim());
        } else if (Array.isArray(q.choices)) {
          options = q.choices.map((opt: any) => String(opt || '').trim());
        } else if (Array.isArray(q.answers)) {
          options = q.answers.map((opt: any) => String(opt || '').trim());
        }

        if (options.length < 2) {
          throw new Error(`Question ${idx + 1} ("${text.slice(0, 30)}...") must have at least 2 options.`);
        }

        // Parse correctAnswer: can be 0-indexed number, or "A", "B", "C", "D", or option text
        let correctIdx = 0;
        if (typeof q.correctAnswer === 'number') {
          correctIdx = q.correctAnswer;
        } else if (typeof q.correctAnswerIndex === 'number') {
          correctIdx = q.correctAnswerIndex;
        } else if (typeof q.answerIndex === 'number') {
          correctIdx = q.answerIndex;
        } else if (typeof q.correctAnswer === 'string') {
          const letterMatch = q.correctAnswer.trim().toUpperCase();
          if (['A', 'B', 'C', 'D'].includes(letterMatch)) {
            correctIdx = letterMatch.charCodeAt(0) - 65;
          } else {
            const foundIdx = options.findIndex(o => o.toLowerCase() === q.correctAnswer.toLowerCase());
            correctIdx = foundIdx >= 0 ? foundIdx : 0;
          }
        }

        // Clamp to valid range
        if (correctIdx < 0 || correctIdx >= options.length) {
          correctIdx = 0;
        }

        const timeLimit = typeof q.timeLimit === 'number' && q.timeLimit > 0
          ? q.timeLimit
          : (typeof q.time === 'number' && q.time > 0 ? q.time : defaultTime);

        return {
          id: q.id || Math.random().toString(36).substring(2, 9),
          text: String(text).trim(),
          options,
          correctAnswer: correctIdx,
          timeLimit
        };
      });

      const result = {
        questions: formattedQuestions,
        title: quizTitle,
        description: quizDescription
      };
      setParsedPreview(result);
      return result;
    } catch (err: any) {
      setErrorMsg(err.message || 'JSON parsing error. Please check formatting syntax.');
      return null;
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonText(e.target.value);
    if (e.target.value.trim().length > 10) {
      parseAndValidateJson(e.target.value);
    } else {
      setParsedPreview(null);
      setErrorMsg(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setJsonText(content);
        parseAndValidateJson(content);
      }
    };
    reader.readAsText(file);
  };

  const handleLoadSample = () => {
    const sampleStr = JSON.stringify(SAMPLE_JSON, null, 2);
    setJsonText(sampleStr);
    parseAndValidateJson(sampleStr);
  };

  const handleExecuteImport = () => {
    const valid = parsedPreview || parseAndValidateJson(jsonText);
    if (!valid || valid.questions.length === 0) return;

    onImport(valid.questions, valid.title, valid.description, importMode);
    onClose();
  };

  const exportJsonStr = JSON.stringify(
    {
      title: currentTitle || 'Bhagavad Gita Quiz',
      questions: existingQuestions.map(({ text, options, correctAnswer, timeLimit }) => ({
        text,
        options,
        correctAnswer,
        timeLimit
      }))
    },
    null,
    2
  );

  const handleCopyExport = () => {
    navigator.clipboard.writeText(exportJsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadExport = () => {
    const blob = new Blob([exportJsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(currentTitle || 'quiz').toLowerCase().replace(/\s+/g, '_')}_questions.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[36px] w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col my-8 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Code2 size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Bulk JSON Question Manager</h2>
              <p className="text-slate-500 text-xs font-semibold">Import or export all questions in one click</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 pt-2 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            onClick={() => setActiveTab('import')}
            className={`px-6 py-3 font-black text-sm transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'import'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Upload size={16} /> Import Questions
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`px-6 py-3 font-black text-sm transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'export'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Download size={16} /> Export Current Quiz ({existingQuestions.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8 space-y-6 flex-grow overflow-y-auto max-h-[60vh]">
          {activeTab === 'import' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Source:</span>
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors">
                    <Upload size={14} /> Upload .JSON File
                    <input type="file" accept=".json,application/json" onChange={handleFileUpload} className="hidden" />
                  </label>
                  <button
                    onClick={handleLoadSample}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-xl text-xs font-bold transition-colors"
                  >
                    <Sparkles size={14} /> Insert Sample Template
                  </button>
                </div>

                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
                  <button
                    onClick={() => setImportMode('append')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                      importMode === 'append' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Append to Existing
                  </button>
                  <button
                    onClick={() => setImportMode('replace')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                      importMode === 'replace' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Replace All
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                  Paste JSON Array or Object
                </label>
                <textarea
                  value={jsonText}
                  onChange={handleTextChange}
                  placeholder={`[\n  {\n    "text": "Your Question Text",\n    "options": ["Option A", "Option B", "Option C", "Option D"],\n    "correctAnswer": 0,\n    "timeLimit": 20\n  }\n]`}
                  rows={9}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-800/60 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-indigo-500 outline-none resize-y"
                  spellCheck={false}
                />
              </div>

              {/* Status / Preview Alert */}
              {errorMsg && (
                <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-2xl text-red-600 dark:text-red-400 text-xs font-bold">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <div className="font-black">JSON Error</div>
                    <div className="mt-0.5">{errorMsg}</div>
                  </div>
                </div>
              )}

              {parsedPreview && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl text-emerald-700 dark:text-emerald-300 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-black text-sm">
                    <Check size={18} className="text-emerald-500" />
                    <span>Ready to import {parsedPreview.questions.length} questions!</span>
                  </div>
                  {parsedPreview.title && (
                    <div>Detected Quiz Title: <span className="font-bold">{parsedPreview.title}</span></div>
                  )}
                  <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 font-medium max-h-24 overflow-y-auto space-y-1 pr-2">
                    {parsedPreview.questions.slice(0, 3).map((q, i) => (
                      <div key={i} className="truncate">
                        • {q.text} ({q.options.length} options, Ans: {String.fromCharCode(65 + q.correctAnswer)})
                      </div>
                    ))}
                    {parsedPreview.questions.length > 3 && (
                      <div className="italic">+ {parsedPreview.questions.length - 3} more questions...</div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Current Quiz JSON ({existingQuestions.length} Questions)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyExport}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy to Clipboard'}
                  </button>
                  <button
                    onClick={handleDownloadExport}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-bold text-white transition-colors"
                  >
                    <Download size={14} /> Download File
                  </button>
                </div>
              </div>

              <textarea
                value={exportJsonStr}
                readOnly
                rows={12}
                className="w-full p-4 bg-slate-50 dark:bg-slate-800/60 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-mono text-xs text-slate-900 dark:text-slate-100 outline-none resize-y"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 md:p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-end gap-4">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-2xl font-black text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm transition-colors"
          >
            Cancel
          </button>
          {activeTab === 'import' && (
            <button
              onClick={handleExecuteImport}
              disabled={!parsedPreview || parsedPreview.questions.length === 0}
              className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-2xl font-black text-sm transition-all shadow-xl shadow-indigo-600/20"
            >
              Import {parsedPreview ? `${parsedPreview.questions.length} Questions` : 'Questions'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

export default JsonImportModal;
