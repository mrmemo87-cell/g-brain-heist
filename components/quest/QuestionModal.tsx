import React, { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import type { QuestNode } from '../../types';

interface QuestionModalProps {
  node: QuestNode;
  streak: number;
  onAnswer: (selectedOption: string) => void;
  onClose: () => void;
  /** Result from server — null while answering */
  result: { is_correct: boolean; explanation?: string } | null;
  isSubmitting: boolean;
}

const QuestionModal: React.FC<QuestionModalProps> = ({ node, streak, onAnswer, onClose, result, isSubmitting }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const timeLimit = node.time_limit ?? 30;

  // Entrance animation
  useEffect(() => {
    if (modalRef.current) {
      gsap.fromTo(modalRef.current,
        { scale: 0.85, opacity: 0, y: 30 },
        { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: 'back.out(1.4)' }
      );
    }
  }, []);

  // Timer
  useEffect(() => {
    if (result) return; // Stop timer when answered
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [result]);

  const handleSelect = useCallback((option: string) => {
    if (result || isSubmitting) return;
    setSelected(option);
  }, [result, isSubmitting]);

  const handleSubmit = useCallback(() => {
    if (!selected || result || isSubmitting) return;
    onAnswer(selected);
  }, [selected, result, isSubmitting, onAnswer]);

  const timeRatio = elapsed / timeLimit;
  const timerColor = timeRatio > 0.8 ? 'text-red-400' : timeRatio > 0.5 ? 'text-amber-400' : 'text-cyan-400';
  const isElite = node.type === 'elite_question';

  // Options may arrive as plain strings or as {text: "..."} objects from DB
  const optText = (opt: unknown): string =>
    typeof opt === 'string' ? opt : (opt as any)?.text ?? String(opt);

  const getOptionStyle = (option: string) => {
    const base = 'w-full p-4 rounded-xl border text-left transition-all duration-200 font-medium';

    if (!result) {
      const isSelected = option === selected;
      return `${base} ${isSelected
        ? 'bg-cyan-500/20 border-cyan-400 text-white scale-[1.02]'
        : 'bg-slate-800/70 border-slate-600/50 text-slate-200 hover:bg-slate-700/80 hover:border-slate-500'}`;
    }

    const isCorrect = option === node.correct_option;
    const isUserPick = option === selected;

    if (isCorrect) return `${base} bg-green-500/25 border-green-400 text-green-100`;
    if (isUserPick && !result.is_correct) return `${base} bg-red-500/25 border-red-400 text-red-100`;
    return `${base} bg-slate-800/40 border-slate-700 text-slate-500`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        ref={modalRef}
        className={`w-full max-w-lg rounded-2xl border p-6 space-y-5 ${
          isElite
            ? 'bg-gradient-to-br from-red-950/90 via-slate-900/95 to-red-950/90 border-red-500/40 shadow-[0_0_40px_rgba(239,68,68,0.2)]'
            : 'bg-gradient-to-br from-slate-900/95 via-slate-900/98 to-indigo-950/90 border-cyan-500/30 shadow-[0_0_40px_rgba(34,211,238,0.15)]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{isElite ? '⚡' : '❓'}</span>
            <span className={`text-xs font-bold uppercase tracking-widest ${isElite ? 'text-red-300' : 'text-cyan-300'}`}>
              {isElite ? 'Elite Challenge' : 'Question Node'}
            </span>
          </div>
          <div className={`font-mono text-sm font-bold tabular-nums ${timerColor}`}>
            {Math.max(0, timeLimit - elapsed)}s
          </div>
        </div>

        {/* Question */}
        <p className="text-white font-semibold text-lg leading-relaxed">
          {node.question_body}
        </p>

        {/* Options */}
        <div className="space-y-3">
          {(node.options ?? []).map((opt, i) => {
            const label = optText(opt);
            return (
              <button
                key={i}
                onClick={() => handleSelect(label)}
                disabled={!!result || isSubmitting}
                className={getOptionStyle(label)}
              >
                <span className="mr-2 text-xs font-bold text-slate-500">{String.fromCharCode(65 + i)}.</span>
                {label}
              </button>
            );
          })}
        </div>

        {/* Submit / Result */}
        {!result ? (
          <button
            onClick={handleSubmit}
            disabled={!selected || isSubmitting}
            className={`w-full py-3 rounded-xl font-bold text-lg transition-all ${
              selected && !isSubmitting
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:scale-[1.02] active:scale-95 shadow-lg shadow-cyan-500/30'
                : 'bg-slate-700 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? 'Checking...' : 'Lock In'}
          </button>
        ) : (
          <div className="space-y-3">
            <div className={`p-4 rounded-xl border text-center font-bold text-lg ${
              result.is_correct
                ? 'bg-green-500/15 border-green-400/40 text-green-300'
                : 'bg-red-500/15 border-red-400/40 text-red-300'
            }`}>
              {result.is_correct ? '🎯 Correct!' : '❌ Incorrect'}
            </div>
            {result.explanation && (
              <p className="text-sm text-slate-300 leading-relaxed">{result.explanation}</p>
            )}
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-cyan-500/30"
            >
              Continue →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestionModal;
