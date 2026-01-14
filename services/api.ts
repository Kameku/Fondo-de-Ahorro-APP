import { Saver, AppSettings, SavingsMonth, Loan, AuthResponse, ReportData, User } from '../types';

const API_URL = 'http://localhost:8000/api';

const getToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

const setToken = (token: string): void => {
  localStorage.setItem('auth_token', token);
};

const removeToken = (): void => {
  localStorage.removeItem('auth_token');
};

const headers = (): HeadersInit => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (response.status === 401) {
    removeToken();
    window.location.reload();
    throw new Error('No autorizado');
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Error en la petición');
  }

  return data;
};

// Auth
export const login = async (email: string, password: string): Promise<AuthResponse> => {
  const response = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });

  const data = await handleResponse<AuthResponse>(response);
  setToken(data.token);
  return data;
};

export const register = async (name: string, email: string, password: string, passwordConfirmation: string): Promise<AuthResponse> => {
  const response = await fetch(`${API_URL}/register`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name,
      email,
      password,
      password_confirmation: passwordConfirmation
    }),
  });

  const data = await handleResponse<AuthResponse>(response);
  setToken(data.token);
  return data;
};

export const logout = async (): Promise<void> => {
  try {
    await fetch(`${API_URL}/logout`, {
      method: 'POST',
      headers: headers(),
    });
  } finally {
    removeToken();
  }
};

export const getUser = async (): Promise<User> => {
  const response = await fetch(`${API_URL}/user`, {
    headers: headers(),
  });
  return handleResponse<User>(response);
};

export const updateUserProfile = async (data: {
  email?: string;
  current_password?: string;
  new_password?: string;
  new_password_confirmation?: string;
}): Promise<{ message: string; user: User }> => {
  const response = await fetch(`${API_URL}/user/profile`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const isAuthenticated = (): boolean => {
  return !!getToken();
};

// Settings
export const getSettings = async (): Promise<AppSettings> => {
  const response = await fetch(`${API_URL}/settings`, {
    headers: headers(),
  });
  return handleResponse<AppSettings>(response);
};

export const updateSettings = async (settings: Partial<AppSettings>): Promise<{ message: string; settings: AppSettings }> => {
  const response = await fetch(`${API_URL}/settings`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(settings),
  });
  return handleResponse(response);
};

// Savers
export const getSavers = async (): Promise<Saver[]> => {
  const response = await fetch(`${API_URL}/savers`, {
    headers: headers(),
  });
  return handleResponse<Saver[]>(response);
};

export const createSaver = async (data: { name: string; bi_weekly_amount: number; start_date: string }): Promise<{ message: string; saver: Saver }> => {
  const response = await fetch(`${API_URL}/savers`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const getSaver = async (id: number): Promise<Saver> => {
  const response = await fetch(`${API_URL}/savers/${id}`, {
    headers: headers(),
  });
  return handleResponse<Saver>(response);
};

export const updateSaver = async (id: number, data: Partial<Saver>): Promise<{ message: string; saver: Saver }> => {
  const response = await fetch(`${API_URL}/savers/${id}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const deleteSaver = async (id: number): Promise<{ message: string }> => {
  const response = await fetch(`${API_URL}/savers/${id}`, {
    method: 'DELETE',
    headers: headers(),
  });
  return handleResponse(response);
};

export const generateNextMonth = async (saverId: number): Promise<{ message: string; month: SavingsMonth }> => {
  const response = await fetch(`${API_URL}/savers/${saverId}/generate-month`, {
    method: 'POST',
    headers: headers(),
  });
  return handleResponse(response);
};

// Savings Months
export const updateSavingsMonth = async (id: number, data: Partial<SavingsMonth>): Promise<{ message: string; month: SavingsMonth }> => {
  const response = await fetch(`${API_URL}/savings-months/${id}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const toggleQuincena = async (id: number, quincena: 'q1' | 'q2'): Promise<{ message: string; month: SavingsMonth }> => {
  const response = await fetch(`${API_URL}/savings-months/${id}/toggle-quincena`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ quincena }),
  });
  return handleResponse(response);
};

export const togglePenalty = async (id: number, quincena: 'q1' | 'q2'): Promise<{ message: string; month: SavingsMonth }> => {
  const response = await fetch(`${API_URL}/savings-months/${id}/toggle-penalty`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ quincena }),
  });
  return handleResponse(response);
};

export const applyPenalty = async (id: number, quincena: 'q1' | 'q2', amount: number): Promise<{ message: string; month: SavingsMonth }> => {
  const response = await fetch(`${API_URL}/savings-months/${id}/apply-penalty`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ quincena, amount }),
  });
  return handleResponse(response);
};

// Loans
export const getLoans = async (saverId: number): Promise<Loan[]> => {
  const response = await fetch(`${API_URL}/savers/${saverId}/loans`, {
    headers: headers(),
  });
  return handleResponse<Loan[]>(response);
};

export const checkLoanEligibility = async (saverId: number): Promise<{ eligible: boolean; reason: string | null }> => {
  const response = await fetch(`${API_URL}/savers/${saverId}/loan-eligibility`, {
    headers: headers(),
  });
  return handleResponse(response);
};

export const createLoan = async (saverId: number, data: { amount: number; duration_months: number }): Promise<{ message: string; loan: Loan }> => {
  const response = await fetch(`${API_URL}/savers/${saverId}/loans`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const makeLoanPayment = async (loanId: number): Promise<{ message: string; loan: Loan }> => {
  const response = await fetch(`${API_URL}/loans/${loanId}/payment`, {
    method: 'POST',
    headers: headers(),
  });
  return handleResponse(response);
};

export const deleteLoan = async (loanId: number): Promise<{ message: string }> => {
  const response = await fetch(`${API_URL}/loans/${loanId}`, {
    method: 'DELETE',
    headers: headers(),
  });
  return handleResponse(response);
};

// Reports
export const getReports = async (): Promise<ReportData> => {
  const response = await fetch(`${API_URL}/reports`, {
    headers: headers(),
  });
  return handleResponse<ReportData>(response);
};
