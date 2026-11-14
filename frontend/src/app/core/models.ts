/** Tipos compartidos con la API REST (`/api/v1`). */

export type Role = 'admin' | 'member';
export type MembershipStatus = 'active' | 'expiring' | 'expired' | 'disabled' | 'unlimited';

export interface User {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  activeUntil: string | null;
  disabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: MembershipStatus;
  hasAccess: boolean;
  daysRemaining: number | null;
}

export interface Session {
  accessToken: string;
  expiresAt: string;
  user: User;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export interface Exercise {
  id: number;
  name: string;
  muscleGroup: string;
  equipment: string;
  description: string;
}

export const MUSCLE_GROUPS = [
  'piernas',
  'pecho',
  'espalda',
  'hombros',
  'brazos',
  'core',
  'cardio',
  'cuerpo completo',
] as const;

export interface WorkoutSet {
  reps: number;
  weightKg: number;
}

export interface WorkoutExercise {
  exerciseId: number;
  exerciseName?: string;
  sets: WorkoutSet[];
}

export interface Workout {
  id: number;
  userId: number;
  performedOn: string;
  title: string;
  durationMinutes: number | null;
  perceivedEffort: number | null;
  notes: string;
  createdAt: string;
  exerciseCount: number;
  setCount: number;
  totalVolumeKg: number;
  exercises?: WorkoutExercise[];
}

export interface WorkoutInput {
  performedOn: string;
  title: string;
  durationMinutes: number | null;
  perceivedEffort: number | null;
  notes: string;
  exercises: WorkoutExercise[];
}

export interface Measurement {
  id: number;
  measuredOn: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  notes: string;
}

export type MeasurementInput = Omit<Measurement, 'id'>;

export interface PlanItem {
  exerciseId: number;
  exerciseName?: string;
  dayLabel: string;
  sets: number;
  reps: string;
  restSeconds: number;
  notes: string;
}

export interface Plan {
  id: number;
  userId: number;
  title: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  items: PlanItem[];
}

export interface PlanInput {
  title: string;
  description: string;
  isActive: boolean;
  items: PlanItem[];
}

export interface WeeklyPoint {
  weekStart: string;
  workouts: number;
  volumeKg: number;
}

export interface PersonalRecord {
  exerciseId: number;
  exerciseName: string;
  weightKg: number;
  reps: number;
  estimated1RmKg: number;
  achievedOn: string;
}

export interface ProgressSummary {
  totalWorkouts: number;
  workoutsLast30Days: number;
  volumeLast30DaysKg: number;
  currentStreakWeeks: number;
  lastWorkoutOn: string | null;
  weekly: WeeklyPoint[];
  bodyWeight: { date: string; weightKg: number }[];
  personalRecords: PersonalRecord[];
}

export interface ExercisePoint {
  date: string;
  maxWeightKg: number;
  estimated1RmKg: number;
  totalReps: number;
  volumeKg: number;
}

export interface AdminStats {
  totalMembers: number;
  activeMembers: number;
  expiringMembers: number;
  expiredMembers: number;
  disabledUsers: number;
  admins: number;
  workoutsLast7Days: number;
  activeMembersLast7Days: number;
}

export interface Renewal {
  id: number;
  months: number;
  previousUntil: string | null;
  newUntil: string;
  renewedByName: string | null;
  createdAt: string;
}
