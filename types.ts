
export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
  timeLimit: number; // seconds
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  createdAt: number;
  isSpecial?: boolean;
}

export interface Participant {
  id: string;
  name: string;
  rollNumber: string;
  score: number;
  totalTimeTaken: number;
  lastTimeTaken: number; // Time taken for the most recent question
  lastAnsweredCorrectly: boolean;
  answeredQuestionIndex: number;
}

export enum SessionStatus {
  IDLE = 'IDLE',
  WAITING = 'WAITING',
  ACTIVE = 'ACTIVE',
  REVEAL = 'REVEAL', // New phase to show correct answer
  INTERMISSION = 'INTERMISSION', 
  FINISHED = 'FINISHED'
}

export interface LiveSession {
  roomCode: string;
  quizId: string;
  status: SessionStatus;
  currentQuestionIndex: number;
  startTime: number | null;
  participants: Participant[];
}
