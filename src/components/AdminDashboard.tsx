import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Activity, User, Cpu, Calendar, ArrowLeft, Search, ShieldCheck } from 'lucide-react';
import { collection, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { TokenUsage } from '../types';

interface AdminDashboardProps {
  onBack: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [usage, setUsage] = useState<TokenUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchUsage = async () => {
      const path = 'tokenUsage';
      try {
        const q = query(collection(db, path), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => {
          const docData = doc.data();
          return {
            id: doc.id,
            ...docData,
            createdAt: (docData.createdAt as Timestamp).toDate().toISOString()
          } as TokenUsage;
        });
        setUsage(data);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, path);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsage();
  }, []);

  const filteredUsage = usage.filter(u => 
    u.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.action.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalTokens = usage.reduce((acc, curr) => acc + curr.totalTokens, 0);
  const totalRequests = usage.length;
  const uniqueUsers = new Set(usage.map(u => u.userId)).size;

  // Real-time Token Logic
  const DAILY_LIMIT = 1000000; // 1M tokens daily limit
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tokensToday = usage
    .filter(u => new Date(u.createdAt) >= startOfDay)
    .reduce((acc, curr) => acc + curr.totalTokens, 0);
  
  const remainingTokens = Math.max(0, DAILY_LIMIT - tokensToday);
  const percentUsed = (tokensToday / DAILY_LIMIT) * 100;

  // Calculate time until reset (UTC midnight)
  const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const timeUntilReset = nextReset.getTime() - now.getTime();
  const hoursUntilReset = Math.floor(timeUntilReset / (1000 * 60 * 60));
  const minutesUntilReset = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-12">
        <div className="flex items-center gap-4 sm:gap-6">
          <button 
            onClick={onBack}
            className="p-3 sm:p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all group shrink-0"
          >
            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-white/40 group-hover:text-quizard-accent" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <ShieldCheck className="w-5 h-5 text-quizard-accent shrink-0" />
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tighter">Admin <span className="text-quizard-accent">Intelligence</span></h2>
            </div>
            <p className="text-white/40 font-bold text-[10px] sm:text-xs uppercase tracking-widest">Global Token Monitoring & Usage Analytics</p>
          </div>
        </div>

        <div className="relative w-full lg:w-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input 
            type="text"
            placeholder="Search users or actions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 pr-6 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-quizard-accent/20 focus:border-quizard-accent outline-none transition-all text-sm font-bold w-full lg:w-64"
          />
        </div>
      </div>

      {/* Real-time Quota Monitor */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mb-12 p-8 bg-quizard-card rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-8">
          <div className="flex items-center gap-2 px-4 py-2 bg-quizard-accent/10 rounded-full border border-quizard-accent/20">
            <div className="w-2 h-2 bg-quizard-accent rounded-full animate-pulse" />
            <span className="text-[10px] font-black text-quizard-accent uppercase tracking-widest">Live Quota Status</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h3 className="text-xl font-black text-white mb-6 uppercase tracking-widest">Daily Token Budget</h3>
            <div className="flex items-end gap-4 mb-4">
              <span className="text-6xl font-black text-white tracking-tighter">{remainingTokens.toLocaleString()}</span>
              <span className="text-white/20 font-bold text-lg mb-2 uppercase tracking-widest">Tokens Remaining</span>
            </div>
            
            <div className="w-full h-4 bg-white/5 rounded-full overflow-hidden border border-white/5 mb-4">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${percentUsed}%` }}
                className={`h-full transition-all duration-1000 ${percentUsed > 80 ? 'bg-rose-500' : 'bg-quizard-accent'}`}
                style={{ boxShadow: `0 0 20px ${percentUsed > 80 ? 'rgba(244,63,94,0.5)' : 'rgba(0,229,255,0.5)'}` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
              <span className="text-white/40">Used: {tokensToday.toLocaleString()}</span>
              <span className="text-white/40">Limit: {DAILY_LIMIT.toLocaleString()}</span>
            </div>
          </div>

          <div className="lg:border-l lg:border-white/5 lg:pl-12">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center">
                <Calendar className="w-6 h-6 text-quizard-accent" />
              </div>
              <div>
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Next Reset In</p>
                <p className="text-2xl font-black text-white tracking-tight">{hoursUntilReset}h {minutesUntilReset}m</p>
              </div>
            </div>
            <p className="text-xs text-white/40 leading-relaxed font-medium">
              The daily token quota resets automatically at UTC midnight. Usage is calculated across all clinical assessments generated by all users.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {[
          { label: "Total Tokens", value: totalTokens.toLocaleString(), icon: Cpu, color: "text-blue-400" },
          { label: "Total Requests", value: totalRequests.toLocaleString(), icon: Activity, color: "text-emerald-400" },
          { label: "Active Users", value: uniqueUsers.toLocaleString(), icon: User, color: "text-purple-400" },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-8 bg-quizard-card rounded-[2rem] border border-white/5 shadow-xl relative overflow-hidden group"
          >
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">{stat.label}</p>
                <p className="text-3xl font-black text-white tracking-tighter">{stat.value}</p>
              </div>
              <div className={`p-4 bg-white/5 rounded-2xl ${stat.color} group-hover:scale-110 transition-transform`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-quizard-accent/5 transition-colors" />
          </motion.div>
        ))}
      </div>

      {/* Usage Table */}
      <div className="bg-quizard-card rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-8 py-6 text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">User</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Action</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Tokens (In/Out)</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Total</th>
                <th className="px-8 py-6 text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-8 h-8 border-4 border-quizard-accent/20 border-t-quizard-accent rounded-full animate-spin" />
                      <p className="text-xs font-black text-white/20 uppercase tracking-widest">Synchronizing Data...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredUsage.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <p className="text-xs font-black text-white/20 uppercase tracking-widest">No usage data detected</p>
                  </td>
                </tr>
              ) : (
                filteredUsage.map((u, i) => (
                  <motion.tr 
                    key={u.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center font-black text-quizard-accent text-xs border border-white/10">
                          {u.userName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-black text-white group-hover:text-quizard-accent transition-colors">{u.userName}</p>
                          <p className="text-[10px] font-bold text-white/30">{u.userEmail}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black text-white/60 uppercase tracking-widest">
                        {u.action}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white/40">{u.promptTokens}</span>
                        <span className="text-white/10">/</span>
                        <span className="text-xs font-bold text-white/40">{u.candidatesTokens}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-sm font-black text-quizard-accent">{u.totalTokens}</span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2 text-white/30">
                        <Calendar className="w-3 h-3" />
                        <span className="text-[10px] font-bold">{new Date(u.createdAt).toLocaleString()}</span>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
