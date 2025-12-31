
export interface User {
  id: string;
  name: string;
  email: string;
  photoUrl: string;
}

export interface SetRecord {
  id: string;
  weight: number;
  reps: number;
  timestamp: number;
}

export interface Exercise {
  id: string;
  name: string;
  targetReps: string; // e.g. "6-10" or "1-5"
  isCustomReps?: boolean; // Flag to indicate user has manually overridden this move's reps
  sets: SetRecord[];
}

export interface DayWorkout {
  week: number;
  day: number;
  exercises: Exercise[];
}

export interface UserPlan {
  daysPerWeek: number;
  maxWeeks: number;
  cyclicalReps: string[]; // e.g. ["6-10", "1-5"]
  weightUnit: 'lb' | 'kg';
}

export interface Program {
  id: string;
  name: string;
  goal?: string;
  history: Record<string, DayWorkout>;
  plan: UserPlan;
  lastAccessed: number;
  createdAt: number;
}

export interface AppState {
  programs: Program[];
  activeProgramId: string | null;
  user: User | null;
  lastSync?: number;
}
