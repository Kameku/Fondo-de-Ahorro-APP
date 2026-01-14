export interface SavingsMonth {
  id: number;
  saver_id: number;
  month_id: string;
  label: string;
  q1_paid: boolean;
  q1_penalty: number;
  q1_penalty_paid: boolean;
  q2_paid: boolean;
  q2_penalty: number;
  q2_penalty_paid: boolean;
  is_locked: boolean;
}

export interface Loan {
  id: number;
  saver_id: number;
  amount: number;
  duration_months: number;
  interest_rate: number;
  total_interest: number;
  total_to_pay: number;
  monthly_payment: number;
  start_date: string;
  status: 'active' | 'paid';
  payments_made: number;
}

export interface Saver {
  id: number;
  user_id: number;
  name: string;
  bi_weekly_amount: number;
  start_date: string;
  months: SavingsMonth[];
  loans: Loan[];
}

export interface AppSettings {
  id: number;
  user_id: number;
  interest_rate: number;
  start_date: string;
  end_date: string;
  enable_reminders: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

export interface ReportData {
  available_funds: number;
  total_savings: number;
  expected_monthly_collection: number;
  total_interest_earned: number;
  total_penalties_collected: number;
  active_loans_capital: number;
  total_loans_given: number;
  total_loan_payments_received: number;
  savers_count: number;
  active_loans_count: number;
}

export type ViewState = 'LOGIN' | 'DASHBOARD' | 'SAVER_DETAIL' | 'ADD_SAVER' | 'ADD_LOAN' | 'REPORT' | 'SETTINGS';
