export type Role = 'EMPLOYEE' | 'ASSISTANT_MANAGER' | 'MANAGER' | 'ADMIN';

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; empId: string; role: Role };
  boutiqueId: string;
};

export type MeResponse = {
  user: { id: string; empId: string; role: Role };
  boutique: { id: string; name: string } | null;
  permissions: string[];
};

export type ManagerDashboardResponse = {
  date: string;
  tasks: { done: number; total: number };
  sales: { achieved: number; target: number; percent: number };
  coverage: { am: number; pm: number; isOk: boolean; policy: string };
};

export type TeamTodayShift = 'AM' | 'PM' | 'OFF' | 'LEAVE';

export type TeamTodayMember = {
  empId: string;
  name: string;
  role: string;
  shift: TeamTodayShift;
  salesToday: number;
  tasksDone: number;
  tasksTotal: number;
};

export type TeamTodayResponse = {
  date: string;
  members: TeamTodayMember[];
};
