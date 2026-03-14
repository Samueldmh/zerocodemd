import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, ArrowRight, Stethoscope, Chrome, AlertCircle } from 'lucide-react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider 
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User as AppUser } from '../types';

interface AuthProps {
  onAuth: (user: AppUser) => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuth }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getOrCreateUserProfile = async (uid: string, email: string, displayName: string | null) => {
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      return userDoc.data() as AppUser;
    } else {
      // Check if this is the first user to make them admin (simplified for now, usually done via cloud functions or first-user logic)
      // For this app, we'll check if the email matches the admin email
      const role = email === 'samuelezeigwe5@gmail.com' ? 'admin' : 'user';
      
      const newUser: AppUser = {
        id: uid,
        email,
        name: displayName || 'User',
        role
      };

      try {
        await setDoc(userDocRef, {
          ...newUser,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.warn("Failed to create user profile in Firestore (likely quota exceeded). Using local profile.", err);
      }

      return newUser;
    }
  };

  useEffect(() => {
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          // App.tsx's onAuthStateChanged will handle the user state and Firestore doc creation
          setIsLoading(true); 
        }
      } catch (err: any) {
        let message = err.message;
        if (err.code === 'auth/unauthorized-domain') message = "This domain is not authorized. Please add it to Firebase Authorized Domains.";
        setError(message);
        setIsLoading(false);
      }
    };
    checkRedirect();
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithRedirect(auth, provider);
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      if (isLogin) {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const userProfile = await getOrCreateUserProfile(result.user.uid, result.user.email!, result.user.displayName);
        onAuth(userProfile);
      } else {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const userProfile = await getOrCreateUserProfile(result.user.uid, email, name);
        onAuth(userProfile);
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      let message = err.message;
      if (err.code === 'auth/user-not-found') message = "Account not found. Please sign up first.";
      if (err.code === 'auth/wrong-password') message = "Invalid password. Please try again.";
      if (err.code === 'auth/email-already-in-use') message = "An account with this email already exists.";
      if (err.code === 'auth/operation-not-allowed') message = "This sign-in method is disabled. Please enable Email/Password in Firebase Console.";
      if (err.code === 'auth/unauthorized-domain') message = "This domain is not authorized. Please add it to Firebase Authorized Domains.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-quizard-card rounded-[3rem] border border-white/10 p-10 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-transparent via-quizard-accent/20 to-transparent" />
        
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-quizard-accent rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(0,229,255,0.3)] mx-auto mb-6">
            <Stethoscope className="text-quizard-bg w-8 h-8" />
          </div>
          <h2 className="text-3xl font-black text-white tracking-tighter mb-2">
            {isLogin ? 'Welcome Back' : 'Join the Elite'}
          </h2>
          <p className="text-white/40 font-bold text-sm uppercase tracking-widest">
            {isLogin ? 'Sign in to continue your journey' : 'Create your clinical profile'}
          </p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-400 text-sm font-bold"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <AnimatePresence mode="wait">
            {!isLogin && (
              <motion.div
                key="name-field"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="relative"
              >
                <User className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full pl-14 pr-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-4 focus:ring-quizard-accent/20 focus:border-quizard-accent outline-none transition-all text-white font-bold placeholder:text-white/10"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative">
            <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email Address"
              className="w-full pl-14 pr-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-4 focus:ring-quizard-accent/20 focus:border-quizard-accent outline-none transition-all text-white font-bold placeholder:text-white/10"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full pl-14 pr-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-4 focus:ring-quizard-accent/20 focus:border-quizard-accent outline-none transition-all text-white font-bold placeholder:text-white/10"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-5 bg-quizard-accent text-quizard-bg rounded-2xl font-black text-lg hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_30px_rgba(0,229,255,0.3)] uppercase tracking-widest flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-6 h-6 border-4 border-quizard-bg/20 border-t-quizard-bg rounded-full animate-spin" />
            ) : (
              <>
                {isLogin ? 'Sign In' : 'Sign Up'}
                <ArrowRight className="w-6 h-6" />
              </>
            )}
          </button>
        </form>

        <div className="mt-10">
          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/5"></div>
            </div>
            <div className="relative flex justify-center text-[10px] font-black uppercase tracking-[0.3em]">
              <span className="bg-quizard-card px-4 text-white/20">Or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <button 
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="flex items-center justify-center gap-3 py-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all group disabled:opacity-50"
            >
              <Chrome className="w-5 h-5 text-white/40 group-hover:text-quizard-accent transition-colors" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Continue with Google</span>
            </button>
          </div>
        </div>

        <div className="mt-10 text-center">
          <button 
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-sm font-bold text-white/40 hover:text-quizard-accent transition-colors"
          >
            {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
