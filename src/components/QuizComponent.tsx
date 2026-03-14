import React, { useState } from 'react';
import { CheckCircle2, XCircle, ChevronRight, ChevronLeft, BookOpen, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { Quiz, Question, QuizResult } from '../types';

interface QuizComponentProps {
  quiz: Quiz;
  onComplete: (results: QuizResult[]) => void;
  onProgressUpdate?: (currentIndex: number, allResults: (QuizResult | null)[]) => void;
  initialProgress?: { currentIndex: number; allResults: (QuizResult | null)[] };
  onQuit: () => void;
}

export const QuizComponent: React.FC<QuizComponentProps> = ({ quiz, onComplete, onProgressUpdate, initialProgress, onQuit }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [theoryAnswer, setTheoryAnswer] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [allResults, setAllResults] = useState<(QuizResult | null)[]>(new Array(quiz.questions.length).fill(null));
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  // Load progress on mount or when initialProgress changes
  React.useEffect(() => {
    if (initialProgress) {
      // Only update if it's different to avoid unnecessary re-renders
      if (currentIndex !== initialProgress.currentIndex ||
          JSON.stringify(allResults) !== JSON.stringify(initialProgress.allResults)) {
        setCurrentIndex(initialProgress.currentIndex);
        setAllResults(initialProgress.allResults);
      }
    }
  }, [initialProgress, quiz.title, quiz.questions.length]);

  // Save progress on changes
  React.useEffect(() => {
    if (onProgressUpdate) {
      onProgressUpdate(currentIndex, allResults);
    }
  }, [currentIndex, allResults, quiz.title, onProgressUpdate]);

  const currentQuestion = quiz.questions[currentIndex];
  const isTheory = quiz.type === 'THEORY';
  const currentResult = allResults[currentIndex];

  // If we have a result for this index, use it to populate state
  React.useEffect(() => {
    if (currentResult) {
      if (isTheory) {
        setTheoryAnswer(currentResult.userAnswer as string);
      } else {
        setSelectedOption(currentResult.userAnswer as number);
      }
      setIsSubmitted(true);
    } else {
      setSelectedOption(null);
      setTheoryAnswer('');
      setIsSubmitted(false);
    }
  }, [currentIndex, currentResult, isTheory]);

  const handleOptionSelect = (index: number) => {
    if (isSubmitted || isTheory) return;
    setSelectedOption(index);
  };

  const handleSubmit = () => {
    if (!isTheory && selectedOption === null) return;
    if (isTheory && theoryAnswer.trim() === '') return;
    
    const marking = isTheory ? getTheoryMarking() : null;
    const result: QuizResult = {
      question: currentQuestion,
      userAnswer: isTheory ? theoryAnswer : selectedOption!,
      isCorrect: isTheory ? undefined : selectedOption === currentQuestion.correctAnswerIndex,
      theoryScore: marking?.score,
      foundPoints: marking?.found
    };

    const newResults = [...allResults];
    newResults[currentIndex] = result;
    setAllResults(newResults);
    setIsSubmitted(true);
  };

  const handleNext = () => {
    if (currentIndex + 1 < quiz.questions.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onComplete(allResults.filter((r): r is QuizResult => r !== null));
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const getTheoryMarking = () => {
    if (!currentQuestion.keyPoints) return null;
    const foundPoints = currentQuestion.keyPoints.filter(point => 
      theoryAnswer.toLowerCase().includes(point.toLowerCase())
    );
    return {
      found: foundPoints,
      total: currentQuestion.keyPoints.length,
      score: Math.round((foundPoints.length / currentQuestion.keyPoints.length) * 100)
    };
  };

  const progress = ((currentIndex + 1) / quiz.questions.length) * 100;

  return (
    <div className="w-full max-w-5xl mx-auto h-[calc(100vh-140px)] flex flex-col">
      <div className="mb-4 flex-shrink-0">
        <div className="flex justify-between items-end mb-1">
          <div className="flex flex-col">
            <h2 className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Question {currentIndex + 1} of {quiz.questions.length}</h2>
            <span className="text-[8px] font-black text-quizard-accent uppercase tracking-[0.2em] mt-0.5">
              {isTheory ? 'Theory Assessment' : 'Objective Assessment'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[9px] font-black text-quizard-accent tracking-widest">{Math.round(progress)}% COMPLETE</span>
            <button 
              onClick={() => setShowQuitConfirm(true)}
              className="text-[9px] font-black text-rose-500 hover:text-rose-400 tracking-widest uppercase transition-colors"
            >
              QUIT
            </button>
          </div>
        </div>
        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            className="h-full bg-quizard-accent shadow-[0_0_10px_rgba(0,229,255,0.5)]"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-quizard-card rounded-[1.5rem] border border-white/10 shadow-2xl h-full flex flex-col relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-quizard-accent/20 to-transparent" />
            
            <div className="flex-1 flex flex-col md:flex-row min-h-0">
              {/* Left Pane: Question/Prompt */}
              <div className="w-full md:w-1/2 p-4 sm:p-6 border-b md:border-b-0 md:border-r border-white/5 flex flex-col min-h-0">
                <div className="mb-3 flex-shrink-0">
                  <span className="inline-block px-2 py-0.5 bg-white/5 text-white/40 text-[8px] font-black rounded-md uppercase tracking-[0.2em] mb-2 border border-white/5">
                    {isTheory ? 'Clinical/Theoretical Prompt' : 'Multiple Choice Question'}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                  <h3 className="text-lg sm:text-xl font-black text-white leading-tight tracking-tighter">
                    {currentQuestion.question}
                  </h3>
                </div>
              </div>

              {/* Right Pane: Interaction/Explanation */}
              <div className="w-full md:w-1/2 p-4 sm:p-6 flex flex-col min-h-0 bg-white/[0.01]">
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar mb-4">
                  {!isTheory && (
                    <div className="space-y-2">
                      {currentQuestion.options && currentQuestion.options.length > 0 ? (
                        currentQuestion.options.map((option, index) => {
                          const isSelected = selectedOption === index;
                          const isCorrect = index === currentQuestion.correctAnswerIndex;
                          const showCorrect = isSubmitted && isCorrect;
                          const showWrong = isSubmitted && isSelected && !isCorrect;

                          return (
                            <button
                              key={index}
                              disabled={isSubmitted}
                              onClick={() => handleOptionSelect(index)}
                              className={`w-full text-left p-3 rounded-xl border-2 transition-all flex items-center justify-between group relative overflow-hidden ${
                                showCorrect 
                                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]' 
                                  : showWrong 
                                    ? 'border-rose-500 bg-rose-500/10 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                                    : isSelected
                                      ? 'border-quizard-accent bg-quizard-accent text-quizard-bg shadow-[0_0_15px_rgba(0,229,255,0.3)]'
                                      : 'border-white/5 bg-white/5 hover:bg-white/10 text-white/70 hover:border-white/20'
                              }`}
                            >
                              <span className="flex-1 font-black text-xs sm:text-sm tracking-tight z-10">{option}</span>
                              <div className="z-10 ml-2">
                                {showCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                {showWrong && <XCircle className="w-4 h-4 text-rose-500" />}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-bold flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          This objective question is missing options. Please skip or report.
                        </div>
                      )}
                    </div>
                  )}

                  {isTheory && !isSubmitted && (
                    <div className="h-full flex flex-col">
                      <label className="block text-[8px] font-black text-white/30 uppercase tracking-[0.2em] mb-1.5">Your Answer</label>
                      <textarea
                        value={theoryAnswer}
                        onChange={(e) => setTheoryAnswer(e.target.value)}
                        placeholder="Type your clinical reasoning here..."
                        className="flex-1 w-full min-h-[150px] p-4 bg-white/5 border border-white/10 rounded-xl focus:ring-4 focus:ring-quizard-accent/20 focus:border-quizard-accent outline-none transition-all text-white resize-none font-bold text-sm placeholder:text-white/10"
                      />
                      <p className="text-[8px] text-white/20 mt-1.5 italic font-bold uppercase tracking-widest">Marked based on key medical concepts.</p>
                    </div>
                  )}

                  {isSubmitted && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-3"
                    >
                      {isTheory && (
                        <div className="p-3 bg-quizard-accent/5 rounded-xl border border-quizard-accent/10">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-black text-quizard-accent uppercase tracking-widest text-[9px]">AI Marking Report</h4>
                            <div className="px-2 py-0.5 bg-quizard-accent/20 rounded-lg text-quizard-accent font-black text-xs border border-quizard-accent/20">
                              {getTheoryMarking()?.score}% Accuracy
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap gap-1">
                            {currentQuestion.keyPoints?.map((point, i) => {
                              const isFound = theoryAnswer.toLowerCase().includes(point.toLowerCase());
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

                      <div className={`p-4 rounded-xl border-2 ${isTheory ? 'bg-white/5 border-white/10' : (selectedOption === currentQuestion.correctAnswerIndex ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5')}`}>
                        <div className="flex items-start gap-2 mb-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isTheory ? 'bg-white/10' : (selectedOption === currentQuestion.correctAnswerIndex ? 'bg-emerald-500/20' : 'bg-rose-500/20')}`}>
                            <AlertCircle className={`w-3.5 h-3.5 ${isTheory ? 'text-white/40' : (selectedOption === currentQuestion.correctAnswerIndex ? 'text-emerald-500' : 'text-rose-500')}`} />
                          </div>
                          <div>
                            <h4 className="font-black text-white mb-0.5 uppercase tracking-widest text-[9px]">{isTheory ? 'Model Answer' : 'Expert Explanation'}</h4>
                            <div className="text-white/60 text-xs leading-relaxed max-w-none markdown-body font-medium">
                              <Markdown>{isTheory ? currentQuestion.modelAnswer : currentQuestion.explanation}</Markdown>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                          <BookOpen className="w-2.5 h-2.5 text-white/20" />
                          <div className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em] italic">
                            Source: {currentQuestion.citation}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="flex-shrink-0 flex gap-2">
                  {currentIndex > 0 && (
                    <button
                      onClick={handleBack}
                      className="px-4 py-3 bg-white/5 text-white/40 rounded-xl font-black text-xs hover:bg-white/10 transition-all flex items-center justify-center gap-1.5 border border-white/10 uppercase tracking-widest"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </button>
                  )}

                  {isSubmitted ? (
                    <button
                      onClick={handleNext}
                      className="flex-1 py-3 bg-quizard-accent text-quizard-bg rounded-xl font-black text-sm hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(0,229,255,0.3)] uppercase tracking-widest"
                    >
                      {currentIndex + 1 === quiz.questions.length ? 'Complete Assessment' : 'Next Question'}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      disabled={isTheory ? theoryAnswer.trim() === '' : selectedOption === null}
                      onClick={handleSubmit}
                      className="flex-1 py-3 bg-quizard-accent text-quizard-bg rounded-xl font-black text-sm hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-20 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,229,255,0.3)] uppercase tracking-widest"
                    >
                      {isTheory ? 'Submit for Marking' : 'Confirm Selection'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showQuitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-quizard-bg/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-quizard-card border border-rose-500/20 rounded-[2rem] p-8 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-rose-500" />
              </div>
              <h3 className="text-xl font-black text-white mb-2">Quit Assessment?</h3>
              <p className="text-white/60 text-sm mb-8">Are you sure you want to quit? All your current progress will be permanently lost.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowQuitConfirm(false)}
                  className="flex-1 py-3 rounded-xl font-black text-xs bg-white/5 text-white hover:bg-white/10 transition-colors uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  onClick={onQuit}
                  className="flex-1 py-3 rounded-xl font-black text-xs bg-rose-500 text-white hover:bg-rose-600 transition-colors uppercase tracking-widest shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                >
                  Quit Quiz
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
