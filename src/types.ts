export type QuestionType = 'OBJECTIVE' | 'THEORY';

export interface Question {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];
  correctAnswerIndex?: number;
  modelAnswer?: string;
  keyPoints?: string[];
  explanation: string;
  citation: string;
}

export interface Quiz {
  title: string;
  type: QuestionType;
  questions: Question[];
}

export interface QuizResult {
  question: Question;
  userAnswer: string | number;
  isCorrect?: boolean;
  theoryScore?: number;
  foundPoints?: string[];
}

export type AppState = 'IDLE' | 'UPLOADING' | 'GENERATING' | 'QUIZ' | 'RESULTS' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  currentStreak?: number;
  longestStreak?: number;
  lastActiveDate?: string;
  activeSession?: {
    state: AppState;
    quiz: Quiz | null;
    results: QuizResult[] | null;
    quizProgress?: {
      currentIndex: number;
      allResults: (QuizResult | null)[];
    };
    lastUpdated: string;
  };
}

export interface TokenUsage {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  action: string;
  createdAt: string;
}
