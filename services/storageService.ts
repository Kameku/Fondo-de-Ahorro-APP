import { Saver, SavingsMonth, AppSettings } from '../types';

const STORAGE_KEY = 'fondo_ahorro_db_v1';
const SETTINGS_KEY = 'fondo_ahorro_settings_v1';

export const getSavers = (): Saver[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveSavers = (savers: Saver[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savers));
};

export const getSettings = (): AppSettings => {
  const data = localStorage.getItem(SETTINGS_KEY);
  if (data) return JSON.parse(data);
  
  // Default values: Current year
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1); // Jan 1st
  const end = new Date(now.getFullYear(), 11, 31); // Dec 31st
  
  return { 
    interestRate: 5,
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
    enableReminders: true
  };
};

export const saveSettings = (settings: AppSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const createInitialMonths = (startDate: string): SavingsMonth[] => {
  const months: SavingsMonth[] = [];
  // Ensure we handle timezone correctly by appending time or splitting
  const [y, m, d] = startDate.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  
  // Create first month (unlocked)
  months.push({
    id: start.toISOString(),
    label: start.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
    q1Paid: false,
    q1Penalty: 0,
    q1PenaltyPaid: false,
    q2Paid: false,
    q2Penalty: 0,
    q2PenaltyPaid: false,
    isLocked: false,
  });

  return months;
};

export const generateNextMonthIfNeeded = (saver: Saver, fundEndDateStr: string): Saver => {
  const lastMonth = saver.months[saver.months.length - 1];
  
  // If the last month is fully paid, generate the next one
  if (lastMonth.q1Paid && lastMonth.q2Paid) {
    // Calculate next month date based on the start date + number of existing months
    // This avoids drift from date math on the last element
    const [y, m, d] = saver.startDate.split('-').map(Number);
    const baseDate = new Date(y, m - 1, d);
    
    // Create the next date
    const nextDate = new Date(baseDate);
    nextDate.setMonth(baseDate.getMonth() + saver.months.length);

    // Check if nextDate exceeds fundEndDate
    const [ey, em, ed] = fundEndDateStr.split('-').map(Number);
    const fundEndDate = new Date(ey, em - 1, ed);

    // If the next month's start is AFTER the fund end date, do not generate
    if (nextDate > fundEndDate) {
        return saver;
    }
    
    const newMonth: SavingsMonth = {
      id: nextDate.toISOString(),
      label: nextDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
      q1Paid: false,
      q1Penalty: 0,
      q1PenaltyPaid: false,
      q2Paid: false,
      q2Penalty: 0,
      q2PenaltyPaid: false,
      isLocked: false, // Automatically unlocked since previous is done
    };
    
    return {
      ...saver,
      months: [...saver.months, newMonth]
    };
  }
  return saver;
};
