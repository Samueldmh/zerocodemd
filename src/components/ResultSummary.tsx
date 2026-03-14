import React, { useState } from 'react';
import { Trophy, RotateCcw, CheckCircle, XCircle, ChevronDown, ChevronUp, BookOpen, AlertCircle, Clock, CheckCircle2, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { QuizResult } from '../types';

interface ResultSummaryProps {
  results: QuizResult[];
  onRestart: () => void;
  isTheory?: boolean;
  currentStreak?: number;
}

export const ResultSummary: React.FC<ResultSummaryProps> = ({ results, onRestart, isTheory, currentStreak }) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  
  const total = results.length;
  const score = results.filter(r => r.isCorrect).length;
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  
  let message = isTheory 
    ? "Review complete! Theory questions are essential for deep clinical understanding."
    : "Keep studying! Medicine is a marathon, not a sprint.";
  let color = "text-rose-600";
  
  if (!isTheory) {
    if (percentage >= 90) {
      message = "Outstanding! You've mastered this material.";
      color = "text-emerald-600";
    } else if (percentage >= 70) {
      message = "Great job! You have a solid understanding.";
      color = "text-blue-600";
    } else if (percentage >= 50) {
      message = "Good effort. Review the citations for areas of improvement.";
      color = "text-amber-600";
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="bg-quizard-card rounded-[3rem] border border-white/10 p-12 shadow-2xl mb-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-transparent via-quizard-accent/20 to-transparent" />
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="text-center md:text-left">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-24 h-24 bg-quizard-accent rounded-[2rem] flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(0,229,255,0.3)] mx-auto md:mx-0"
            >
              <Trophy className="w-12 h-12 text-quizard-bg" />
            </motion.div>
            <h2 className="text-5xl font-black text-white tracking-tighter mb-2">Assessment Complete</h2>
            <p className="text-white/40 font-black uppercase tracking-[0.2em] text-sm">Clinical Competency Report</p>
          </div>

          <div className="flex flex-col items-center">
            <div className="relative w-48 h-48">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="96"
                  cy="96"
                  r="88"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="transparent"
                  className="text-white/5"
                />
                <motion.circle
                  cx="96"
                  cy="96"
                  r="88"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="transparent"
                  strokeDasharray={552.92}
                  initial={{ strokeDashoffset: 552.92 }}
                  animate={{ strokeDashoffset: 552.92 - (552.92 * percentage) / 100 }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  className="text-quizard-accent"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-black text-white tracking-tighter">{Math.round(percentage)}%</span>
                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Accuracy</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-16">
          {[
            { label: 'Total Items', value: total, icon: <BookOpen className="w-4 h-4" /> },
            { label: 'Correct', value: score, icon: <CheckCircle className="w-4 h-4" />, color: 'text-emerald-400' },
            { label: 'Incorrect', value: total - score, icon: <XCircle className="w-4 h-4" />, color: 'text-rose-400' },
            { label: 'Time Spent', value: '12:45', icon: <Clock className="w-4 h-4" /> },
            { label: 'Day Streak', value: currentStreak || 0, icon: <Flame className="w-4 h-4" />, color: 'text-orange-400' },
          ].map((stat, i) => (
            <div key={i} className="bg-white/5 rounded-3xl p-6 border border-white/5 flex flex-col items-center text-center">
              <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center mb-4 text-white/30">
                {stat.icon}
              </div>
              <p className="text-2xl font-black text-white tracking-tight">{stat.value}</p>
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] mt-1 ${stat.color || 'text-white/20'}`}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-8">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-2xl font-black text-white tracking-tighter">Detailed Review</h3>
          <div className="px-4 py-2 bg-white/5 rounded-2xl border border-white/5 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">
            {total} Clinical Vignettes
          </div>
        </div>

        {results.map((result, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-quizard-card rounded-[2.5rem] border border-white/10 overflow-hidden shadow-xl group"
          >
            <div 
              className="p-8 cursor-pointer flex items-start justify-between gap-6 hover:bg-white/5 transition-colors"
              onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
            >
              <div className="flex items-start gap-6">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-lg ${
                  result.isCorrect 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/20'
                }`}>
                  {index + 1}
                </div>
                <div>
                  <h4 className="text-xl font-black text-white leading-tight tracking-tight mb-3">{result.question.question}</h4>
                  <div className="flex items-center gap-4">
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-lg border ${
                      result.isCorrect 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      {result.isCorrect ? 'Correct' : 'Incorrect'}
                    </span>
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">
                      {isTheory ? `${result.theoryScore}% Accuracy` : `Option ${result.userAnswer !== null ? String.fromCharCode(65 + (result.userAnswer as number)) : 'N/A'}`}
                    </span>
                  </div>
                </div>
              </div>
              <div className={`p-3 bg-white/5 rounded-2xl transition-transform duration-300 ${expandedIndex === index ? 'rotate-180' : ''}`}>
                <ChevronDown className="w-6 h-6 text-white/20" />
              </div>
            </div>

            <AnimatePresence>
              {expandedIndex === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-white/5"
                >
                  <div className="p-10 bg-black/20 space-y-10">
                    {isTheory ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Your Submission</p>
                          <div className="p-6 bg-white/5 rounded-3xl border border-white/5 text-white/60 text-sm leading-relaxed font-medium">
                            {result.userAnswer}
                          </div>
                        </div>
                        <div className="space-y-4">
                          <p className="text-[10px] font-black text-quizard-accent uppercase tracking-[0.2em]">Model Answer</p>
                          <div className="p-6 bg-quizard-accent/5 rounded-3xl border border-quizard-accent/10 text-white/80 text-sm leading-relaxed font-medium markdown-body mb-4">
                            <Markdown>{result.question.modelAnswer}</Markdown>
                          </div>
                          
                          {result.question.keyPoints && (
                            <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                              <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-4">Key Concepts Analysis</p>
                              <div className="flex flex-wrap gap-2">
                                {result.question.keyPoints.map((point, i) => {
                                  const isFound = result.foundPoints?.includes(point);
                                  return (
                                    <span 
                                      key={i} 
                                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black border transition-all uppercase tracking-wider ${
                                        isFound 
                                          ? 'bg-quizard-accent/20 border-quizard-accent/40 text-quizard-accent shadow-[0_0_12px_rgba(0,229,255,0.2)]' 
                                          : 'bg-white/5 border-white/10 text-white/40 line-through'
                                      }`}
                                    >
                                      {point}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Assessment Details</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className={`p-6 rounded-3xl border-2 ${result.isCorrect ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
                            <p className="text-[10px] font-black uppercase tracking-widest mb-3 opacity-40">Your Selection</p>
                            <p className="font-black text-white text-lg">{result.userAnswer !== null ? result.question.options?.[result.userAnswer as number] : 'No Answer'}</p>
                          </div>
                          {!result.isCorrect && (
                            <div className="p-6 bg-emerald-500/5 border-2 border-emerald-500/20 rounded-3xl">
                              <p className="text-[10px] font-black uppercase tracking-widest mb-3 opacity-40 text-emerald-400">Correct Answer</p>
                              <p className="font-black text-white text-lg">{result.question.options?.[result.question.correctAnswerIndex!]}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="p-8 bg-white/5 rounded-3xl border border-white/5">
                      <div className="flex items-start gap-4 mb-6">
                        <div className="w-10 h-10 bg-quizard-accent/10 rounded-2xl flex items-center justify-center flex-shrink-0 border border-quizard-accent/20">
                          <AlertCircle className="w-6 h-6 text-quizard-accent" />
                        </div>
                        <div>
                          <h4 className="font-black text-white mb-3 uppercase tracking-widest text-sm">Clinical Explanation</h4>
                          <div className="text-white/50 text-sm leading-relaxed markdown-body font-medium">
                            <Markdown>{result.question.explanation}</Markdown>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 pt-6 border-t border-white/5">
                        <BookOpen className="w-5 h-5 text-white/20" />
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] italic">Source: {result.question.citation}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      <div className="mt-20 flex flex-col md:flex-row items-center justify-center gap-6">
        <button
          onClick={onRestart}
          className="w-full md:w-auto px-12 py-6 bg-quizard-accent text-quizard-bg rounded-3xl font-black text-lg hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(0,229,255,0.4)] uppercase tracking-widest"
        >
          New Assessment
        </button>
        <button
          className="w-full md:w-auto px-12 py-6 bg-white/5 text-white rounded-3xl font-black text-lg hover:bg-white/10 border border-white/10 transition-all uppercase tracking-widest"
        >
          Export Report
        </button>
      </div>
    </div>
  );
};
