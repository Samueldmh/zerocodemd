import React, { useState, useEffect, useRef } from 'react';
import { Stethoscope, GraduationCap, Github, Info, LogOut, ShieldCheck, Flame, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { FileUpload } from './components/FileUpload';
import { QuizComponent } from './components/QuizComponent';
import { ResultSummary } from './components/ResultSummary';
import { Auth } from './components/Auth';
import { AdminDashboard } from './components/AdminDashboard';
import { generateQuizFromContent, generateQuizFromText } from './services/gemini';
import { Quiz, AppState, QuizResult, User } from './types';

const sanitizeForFirestore = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(v => sanitizeForFirestore(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, sanitizeForFirestore(v)])
    );
  }
  return obj;
};

export default function App() {
  const [state, setState] = useState<AppState>('IDLE');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [results, setResults] = useState<QuizResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [pendingCloudSession, setPendingCloudSession] = useState<User['activeSession'] | null>(null);
  const [generatingConfig, setGeneratingConfig] = useState<{count: number, type: 'OBJECTIVE' | 'THEORY'} | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clearedSessionTitleRef = useRef<string | null>(null);

  // Load session on mount - Removed localStorage fallback
  useEffect(() => {
    // We now rely entirely on Firebase for session restoration
  }, []);

  // Save session on changes
  useEffect(() => {
    if (state === 'QUIZ' || state === 'RESULTS') {
      // Use auth.currentUser directly to avoid dependency on the 'user' state object
      // which we might update during sync, preventing infinite loops.
      if (auth.currentUser) {
        syncSessionToCloud(state, quiz, results);
      }
    }
  }, [state, quiz, results]);

  const syncSessionToCloud = async (
    newState: AppState, 
    newQuiz: Quiz | null, 
    newResults: QuizResult[] | null,
    progress?: { currentIndex: number; allResults: (QuizResult | null)[] }
  ) => {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;
    
    const sessionData = {
      state: newState,
      quiz: newQuiz,
      results: newResults,
      quizProgress: progress || user?.activeSession?.quizProgress || null,
      lastUpdated: new Date().toISOString()
    };

    // Check if it's actually different, including progress
    if (user?.activeSession && 
        JSON.stringify(user.activeSession.quiz) === JSON.stringify(sessionData.quiz) &&
        JSON.stringify(user.activeSession.results) === JSON.stringify(sessionData.results) &&
        JSON.stringify(user.activeSession.quizProgress) === JSON.stringify(sessionData.quizProgress) &&
        user.activeSession.state === sessionData.state) {
        return;
    }

    // Update local user state immediately (optimistic update)
    setUser(prev => prev ? { ...prev, activeSession: sessionData } : null);

    // Backup to localStorage in case Firebase quota is exhausted
    try {
      localStorage.setItem('quizard_backup_session', JSON.stringify(sessionData));
    } catch (e) {
      console.error("Failed to save backup session:", e);
    }

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(async () => {
      try {
        const userDocRef = doc(db, 'users', currentUserId);
        console.log("Syncing session to cloud...", newState);
        const sanitizedSession = sanitizeForFirestore(sessionData);
        await updateDoc(userDocRef, {
          activeSession: sanitizedSession
        });
      } catch (err: any) {
        console.error("Error syncing session to cloud:", err);
        // If quota is exceeded, the optimistic local update ensures the app still works for the user
      }
    }, 3000); // 3-second debounce to prevent quota exhaustion
  };

  // Check for existing session on mount
  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        unsubscribeSnapshot = onSnapshot(userDocRef, async (userDoc) => {
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            
            // Auto-upgrade if email matches admin but role is user
            if (firebaseUser.email === 'samuelezeigwe5@gmail.com' && userData.role !== 'admin') {
              try {
                await updateDoc(userDocRef, { role: 'admin' });
                return; // Snapshot will fire again
              } catch (e) {
                console.error("Failed to auto-upgrade admin role (likely quota exceeded):", e);
                userData.role = 'admin'; // Optimistic upgrade locally
              }
            }

            // Check if we have a newer backup in localStorage (e.g. from quota exhaustion)
            try {
              const backup = localStorage.getItem('quizard_backup_session');
              if (backup) {
                const backupSession = JSON.parse(backup);
                const backupDate = new Date(backupSession.lastUpdated).getTime();
                const cloudDate = userData.activeSession?.lastUpdated ? new Date(userData.activeSession.lastUpdated).getTime() : 0;
                
                if (backupDate > cloudDate) {
                  console.log("Restoring newer session from local backup (likely due to previous quota exhaustion)");
                  userData.activeSession = backupSession;
                }
              }
            } catch (e) {
              console.error("Failed to parse backup session:", e);
            }

            setUser(userData);
          } else {
            // New user profile creation is handled in Auth.tsx
            setUser({
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || 'User',
              role: firebaseUser.email === 'samuelezeigwe5@gmail.com' ? 'admin' : 'user'
            });
          }
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
        });
      } else {
        setUser(null);
      }
      setIsAuthReady(true);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []); // Removed state dependencies to prevent constant resubscription

  // Handle remote session changes (Real-time sync)
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const cloudSession = user.activeSession;

    if (!cloudSession) {
      // Cloud session was cleared remotely (e.g., "Start Fresh" on another device)
      if (state === 'QUIZ' || state === 'RESULTS') {
        setQuiz(null);
        setResults(null);
        setState('IDLE');
        setPendingCloudSession(null);
      }
      return;
    }

    // If cloud session exists and we are actively in a session, sync it
    if (state === 'QUIZ' || state === 'RESULTS') {
      if (cloudSession.state !== state) {
        setState(cloudSession.state);
      }
      // Only update if actually different to avoid unnecessary re-renders
      if (JSON.stringify(cloudSession.quiz) !== JSON.stringify(quiz)) {
        setQuiz(cloudSession.quiz);
      }
      if (JSON.stringify(cloudSession.results) !== JSON.stringify(results)) {
        setResults(cloudSession.results);
      }
    } else if (state === 'IDLE') {
      // We are on the dashboard. Show prompt if not already showing for this session
      if (cloudSession.quiz?.title === clearedSessionTitleRef.current) {
        return; // Ignore the session we just cleared
      }
      if (!pendingCloudSession || pendingCloudSession.quiz?.title !== cloudSession.quiz?.title) {
        setPendingCloudSession(cloudSession);
      }
    }
  }, [user?.activeSession, state, isAuthReady]);

  const handleAuth = (userData: User) => {
    setUser(userData);
  };

  const logUsage = async (usage: any, action: string) => {
    if (!user || !usage) return;
    const path = 'tokenUsage';
    try {
      await addDoc(collection(db, path), {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        promptTokens: usage.promptTokenCount,
        candidatesTokens: usage.candidatesTokenCount,
        totalTokens: usage.totalTokenCount,
        action,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleUpload = async (
    content: { mimeType: string; data: string }[] | string, 
    fileName: string, 
    isText?: boolean, 
    questionCount: number = 25,
    quizType: 'OBJECTIVE' | 'THEORY' = 'OBJECTIVE'
  ) => {
    setGeneratingConfig({ count: questionCount, type: quizType });
    setState('GENERATING');
    setError(null);
    clearedSessionTitleRef.current = null; // Reset this so new quizzes aren't ignored
    try {
      let result: { quiz: Quiz; usage: any };
      if (isText && typeof content === 'string') {
        result = await generateQuizFromText(content, fileName, questionCount, quizType);
      } else if (Array.isArray(content)) {
        result = await generateQuizFromContent(content, fileName, questionCount, quizType);
      } else {
        throw new Error("Invalid content format");
      }
      
      try {
        await logUsage(result.usage, `Generate ${quizType} Quiz (${fileName})`);
      } catch (logErr) {
        console.warn("Failed to log usage (likely quota exceeded), but continuing with quiz generation:", logErr);
      }
      setQuiz(result.quiz);
      setState('QUIZ');
    } catch (err: any) {
      console.error("Generation Error:", err);
      
      let errorMessage = 'Failed to generate quiz. Please ensure the file is readable and try again.';
      
      if (err.message?.includes('safety')) {
        errorMessage = 'The AI declined to process this content due to safety filters. Please ensure the material is strictly medical/academic.';
      } else if (err.message?.includes('quota') || err.message?.includes('429')) {
        errorMessage = 'API rate limit or daily quota exceeded. Please try uploading a smaller file, requesting fewer questions, or wait a few minutes before trying again.';
      } else if (err.message?.includes('Invalid content')) {
        errorMessage = 'The file format was not recognized. Please try a different file.';
      } else if (err.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      
      setError(errorMessage);
      setState('IDLE');
    }
  };

  const handleQuizComplete = async (quizResults: QuizResult[]) => {
    setResults(quizResults);
    setState('RESULTS');
    
    // Update streak on quiz completion
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      if (user.lastActiveDate !== today) {
        const userDocRef = doc(db, 'users', user.id);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        let newStreak = (user.currentStreak || 0);
        if (user.lastActiveDate === yesterdayStr) {
          newStreak += 1;
        } else {
          newStreak = 1;
        }

        const newLongest = Math.max(newStreak, user.longestStreak || 0);

        const newStreakState = {
          currentStreak: newStreak,
          longestStreak: newLongest,
          lastActiveDate: today
        };
        
        // Optimistic update
        setUser({
          ...user,
          ...newStreakState
        });

        try {
          await updateDoc(userDocRef, newStreakState);
        } catch (err) {
          console.error("Error updating streak (likely quota exceeded), but updated locally:", err);
        }
      }
    }
  };

  const handleRestart = () => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    // Remember the title of the session we are clearing so we don't prompt for it again
    if (user?.activeSession?.quiz?.title) {
      clearedSessionTitleRef.current = user.activeSession.quiz.title;
    } else if (pendingCloudSession?.quiz?.title) {
      clearedSessionTitleRef.current = pendingCloudSession.quiz.title;
    } else if (quiz?.title) {
      clearedSessionTitleRef.current = quiz.title;
    }

    setQuiz(null);
    setResults(null);
    setState('IDLE');
    setPendingCloudSession(null); // Ensure pending session is cleared
    
    try {
      localStorage.removeItem('quizard_backup_session');
    } catch (e) {}

    // Optimistically clear the local user's active session to prevent the modal from popping up
    setUser(prev => prev ? { ...prev, activeSession: undefined } : null);

    if (auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      updateDoc(userDocRef, {
        activeSession: null
      }).catch(err => console.error("Error clearing cloud session:", err));
    }
  };

  const handleRestoreSession = () => {
    if (!pendingCloudSession) return;
    setQuiz(pendingCloudSession.quiz);
    setResults(pendingCloudSession.results);
    setState(pendingCloudSession.state);
    
    setPendingCloudSession(null);
  };

  const handleDiscardSession = () => {
    setPendingCloudSession(null);
    handleRestart();
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      handleRestart();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <div className="min-h-screen bg-quizard-bg font-sans text-white selection:bg-quizard-accent selection:text-quizard-bg">
      {!isAuthReady ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-quizard-accent/20 border-t-quizard-accent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Header */}
      <header className="bg-quizard-bg/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={handleRestart}>
            <div className="w-12 h-12 bg-quizard-accent rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(0,229,255,0.3)] group-hover:scale-110 transition-transform duration-300">
              <Stethoscope className="text-quizard-bg w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter leading-none text-white">zerocode<span className="text-quizard-accent">md</span></h1>
              <p className="text-[10px] font-black text-quizard-accent/60 uppercase tracking-[0.2em] mt-1">Clinical Intelligence</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <nav className="hidden md:flex items-center gap-8">
              <a href="#" className="text-sm font-bold text-white/60 hover:text-quizard-accent transition-colors">Methodology</a>
              <a href="#" className="text-sm font-bold text-white/60 hover:text-quizard-accent transition-colors">Standards</a>
              {user?.role === 'admin' && (
                <button 
                  onClick={() => setState('ADMIN')}
                  className={`text-sm font-black transition-colors uppercase tracking-widest ${state === 'ADMIN' ? 'text-quizard-accent' : 'text-white/60 hover:text-quizard-accent'}`}
                >
                  Admin Panel
                </button>
              )}
              {user && (
                <div className="flex items-center gap-6">
                  {/* Streak Indicator */}
                  <motion.div 
                    whileHover={{ scale: 1.05 }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-xl group cursor-help"
                    title={`Longest Streak: ${user.longestStreak || 0} days`}
                  >
                    <Flame className={`w-5 h-5 ${user.currentStreak ? 'text-orange-500 fill-orange-500 animate-pulse' : 'text-white/20'}`} />
                    <span className="text-sm font-black text-orange-500">{user.currentStreak || 0}</span>
                  </motion.div>

                  <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-2xl border border-white/10">
                    <div className="w-8 h-8 bg-quizard-accent rounded-xl flex items-center justify-center font-black text-quizard-bg text-xs">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-black text-white/80">{user.name}</span>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="text-sm font-black text-rose-500 hover:text-rose-400 transition-colors uppercase tracking-widest"
                  >
                    Logout
                  </button>
                </div>
              )}
              {!user && (
                <button className="px-6 py-2.5 bg-white/5 text-white rounded-2xl text-sm font-black hover:bg-white/10 border border-white/10 transition-all hover:scale-105 active:scale-95">
                  Support
                </button>
              )}
            </nav>

            {/* Mobile Actions */}
            <div className="flex md:hidden items-center gap-2">
              {user && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-500/10 border border-orange-500/20 rounded-lg mr-1">
                  <Flame className={`w-4 h-4 ${user.currentStreak ? 'text-orange-500 fill-orange-500' : 'text-white/20'}`} />
                  <span className="text-[10px] font-black text-orange-500">{user.currentStreak || 0}</span>
                </div>
              )}
              {user?.role === 'admin' && (
                <button 
                  onClick={() => setState('ADMIN')}
                  className={`p-2 rounded-xl transition-colors ${state === 'ADMIN' ? 'bg-quizard-accent text-quizard-bg' : 'bg-white/5 text-quizard-accent hover:bg-white/10'}`}
                  title="Admin Panel"
                >
                  <ShieldCheck className="w-6 h-6" />
                </button>
              )}
              {user && (
                <button 
                  onClick={handleLogout}
                  className="p-2 text-rose-500 bg-white/5 hover:bg-rose-500/10 rounded-xl transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-6 h-6" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <AnimatePresence>
          {pendingCloudSession && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-quizard-bg/80 backdrop-blur-xl p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="bg-white/5 border border-white/10 rounded-[2.5rem] shadow-2xl max-w-md w-full p-10 text-center relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-quizard-accent to-blue-500" />
                
                <div className="w-20 h-20 bg-quizard-accent/10 rounded-3xl flex items-center justify-center mb-8 mx-auto border border-quizard-accent/20">
                  <BookOpen className="w-10 h-10 text-quizard-accent" />
                </div>
                
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Continue Quiz?</h3>
                <p className="text-white/60 mb-10 leading-relaxed font-medium">
                  We found an unfinished clinical assessment from another device. Would you like to resume your progress?
                </p>
                
                <div className="flex flex-col gap-4">
                  <button
                    onClick={handleRestoreSession}
                    className="w-full py-5 bg-quizard-accent text-quizard-bg rounded-2xl font-black hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_30px_rgba(0,229,255,0.3)] flex items-center justify-center gap-3 uppercase tracking-widest text-sm"
                  >
                    <Flame className="w-5 h-5" />
                    Resume Session
                  </button>
                  <button
                    onClick={handleDiscardSession}
                    className="w-full py-5 bg-white/5 text-white/60 rounded-2xl font-black hover:bg-white/10 transition-all border border-white/10 uppercase tracking-widest text-sm"
                  >
                    Start Fresh
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {!user ? (
            <motion.div
              key="auth"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Auth onAuth={handleAuth} />
            </motion.div>
          ) : (
            <>
              {state === 'IDLE' && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="text-center max-w-4xl mx-auto"
                >
                  <div className="mb-16">
                    <motion.div 
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="inline-flex items-center gap-2 px-4 py-1.5 bg-quizard-accent/10 text-quizard-accent rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-8 border border-quizard-accent/20"
                    >
                      <GraduationCap className="w-4 h-4" />
                      Next-Gen Medical Board Prep
                    </motion.div>
                    <motion.h2 
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="text-6xl md:text-8xl font-black text-white mb-8 tracking-tighter leading-[0.85]"
                    >
                      Master Medicine.<br />
                      <span className="text-quizard-accent drop-shadow-[0_0_30px_rgba(0,229,255,0.3)]">Play to Win.</span>
                    </motion.h2>
                    <motion.p 
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="text-xl text-white/60 max-w-2xl mx-auto leading-relaxed font-medium"
                    >
                      Welcome back, {user.name}. Ready to transform complex clinical data into high-yield interactive assessments?
                    </motion.p>
                  </div>

              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <FileUpload onUpload={handleUpload} isGenerating={false} />
              </motion.div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-8 p-5 bg-rose-500/10 border border-rose-500/20 rounded-[2rem] text-rose-400 text-sm max-w-md mx-auto flex items-center gap-3 font-bold"
                >
                  <Info className="w-5 h-5 flex-shrink-0" />
                  {error}
                </motion.div>
              ) }

              <div className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
                {[
                  {
                    title: "Clinical Deep Scan",
                    desc: "Proprietary algorithms scan every diagram, table, and clinical vignette for 100% material coverage.",
                    icon: "🔬",
                    color: "from-blue-500 to-cyan-500"
                  },
                  {
                    title: "Evidence-Based",
                    desc: "Every answer is cross-referenced with your specific source material for absolute accuracy.",
                    icon: "📚",
                    color: "from-purple-500 to-indigo-500"
                  },
                  {
                    title: "Board Standard",
                    desc: "Questions are calibrated to match the difficulty and style of major medical board examinations.",
                    icon: "🩺",
                    color: "from-emerald-500 to-teal-500"
                  }
                ].map((feature, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + (i * 0.1) }}
                    className="p-10 bg-quizard-card rounded-[2.5rem] border border-white/5 shadow-2xl hover:border-quizard-accent/30 transition-all group relative overflow-hidden"
                  >
                    <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b ${feature.color} opacity-50`} />
                    <div className="text-5xl mb-8 group-hover:scale-110 transition-transform duration-500">{feature.icon}</div>
                    <h3 className="text-2xl font-black text-white mb-4 tracking-tight">{feature.title}</h3>
                    <p className="text-white/50 text-sm leading-relaxed font-medium">{feature.desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {state === 'GENERATING' && (
            <motion.div
              key="generating"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <FileUpload onUpload={() => {}} isGenerating={true} generatingConfig={generatingConfig || undefined} />
            </motion.div>
          )}

          {state === 'QUIZ' && quiz && (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="pt-4"
            >
              <QuizComponent 
                quiz={quiz} 
                onComplete={handleQuizComplete} 
                onProgressUpdate={(currentIndex, allResults) => {
                  syncSessionToCloud(state, quiz, results, { currentIndex, allResults });
                }}
                initialProgress={user?.activeSession?.quizProgress}
                onQuit={handleRestart}
              />
            </motion.div>
          )}

          {state === 'RESULTS' && results && (
            <motion.div
              key="results"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
            >
              <ResultSummary 
                results={results} 
                onRestart={handleRestart} 
                isTheory={quiz?.type === 'THEORY'}
                currentStreak={user?.currentStreak || 0}
              />
            </motion.div>
          )}

          {state === 'ADMIN' && user?.role === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <AdminDashboard onBack={() => {
                if (results) setState('RESULTS');
                else if (quiz) setState('QUIZ');
                else setState('IDLE');
              }} />
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-auto py-16 border-t border-white/5 bg-quizard-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-quizard-accent rounded-xl flex items-center justify-center shadow-lg shadow-quizard-accent/20">
              <Stethoscope className="text-quizard-bg w-6 h-6" />
            </div>
            <span className="text-xl font-black text-white tracking-tighter">zerocode<span className="text-quizard-accent">md</span></span>
          </div>
          
          <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] text-center">
            © 2026 zerocodemd. Professional Medical Intelligence.
          </div>

          <div className="flex items-center gap-8">
            <a href="#" className="text-white/30 hover:text-quizard-accent transition-colors">
              <Github className="w-6 h-6" />
            </a>
            <a href="#" className="text-[10px] font-black text-white/30 hover:text-white transition-colors uppercase tracking-[0.2em]">Privacy</a>
            <a href="#" className="text-[10px] font-black text-white/30 hover:text-white transition-colors uppercase tracking-[0.2em]">Terms</a>
          </div>
        </div>
      </footer>
        </>
      )}
    </div>
  );
}
