import React, { useState, useEffect } from 'react';
import { Plus, Users, User, Mail, Wallet, CheckCircle2, Circle, Calculator, ChevronRight, Lock, Calendar, Menu, X, BarChart3, TrendingUp, DollarSign, PieChart, Settings, Percent, AlertCircle, CalendarDays, AlertTriangle, Bell, BellRing, Loader2, LogOut, Trash2, Download, Search } from 'lucide-react';
import { Saver, ViewState, Loan, AppSettings, SavingsMonth, ReportData } from './types';
import { Header } from './components/Header';
import { Button } from './components/Button';
import { LoginView } from './components/LoginView';
import { AuthProvider, useAuth } from './context/AuthContext';
import * as api from './services/api';
import * as XLSX from 'xlsx';

// Export to Excel function
const exportToExcel = (savers: Saver[], settings: AppSettings | null) => {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Resumen del Fondo
  const fundData = [
    ['RESUMEN DEL FONDO'],
    [],
    ['Fecha de Inicio:', settings?.start_date || 'N/A'],
    ['Fecha de Fin:', settings?.end_date || 'N/A'],
    ['Tasa de Interés:', settings ? `${settings.interest_rate}%` : 'N/A'],
    [],
    ['Total Ahorradores:', savers.length],
  ];
  const wsFund = XLSX.utils.aoa_to_sheet(fundData);
  XLSX.utils.book_append_sheet(wb, wsFund, 'Resumen');

  // Sheet 2: Ahorradores
  const saversData: any[][] = [
    ['Nombre', 'Cuota Quincenal', 'Total Ahorrado', 'Préstamos Activos', 'Estado']
  ];

  savers.forEach(saver => {
    const totalSaved = saver.months.reduce((acc, m) =>
      acc + (m.q1_paid ? Number(saver.bi_weekly_amount) : 0) + (m.q2_paid ? Number(saver.bi_weekly_amount) : 0), 0
    );
    const activeLoans = saver.loans.filter(l => l.status === 'active').length;
    const hasIssues = saver.months.some(m =>
      (m.q1_penalty > 0 && !m.q1_penalty_paid) || (m.q2_penalty > 0 && !m.q2_penalty_paid)
    );

    saversData.push([
      saver.name,
      `$${Number(saver.bi_weekly_amount).toLocaleString()}`,
      `$${totalSaved.toLocaleString()}`,
      activeLoans,
      hasIssues ? 'Con Pendientes' : 'Al Día'
    ]);
  });

  const wsSavers = XLSX.utils.aoa_to_sheet(saversData);
  XLSX.utils.book_append_sheet(wb, wsSavers, 'Ahorradores');

  // Sheet 3: Detalle de Pagos por Ahorrador
  savers.forEach(saver => {
    const paymentsData: any[][] = [
      [`AHORRADOR: ${saver.name}`],
      [`Cuota Quincenal: $${Number(saver.bi_weekly_amount).toLocaleString()}`],
      [],
      ['Mes', 'Q1 Pagado', 'Q1 Multa', 'Q1 Multa Pagada', 'Q2 Pagado', 'Q2 Multa', 'Q2 Multa Pagada']
    ];

    saver.months.forEach(month => {
      paymentsData.push([
        month.label,
        month.q1_paid ? 'Sí' : 'No',
        month.q1_penalty > 0 ? `$${Number(month.q1_penalty).toLocaleString()}` : '-',
        month.q1_penalty > 0 ? (month.q1_penalty_paid ? 'Sí' : 'No') : '-',
        month.q2_paid ? 'Sí' : 'No',
        month.q2_penalty > 0 ? `$${Number(month.q2_penalty).toLocaleString()}` : '-',
        month.q2_penalty > 0 ? (month.q2_penalty_paid ? 'Sí' : 'No') : '-'
      ]);
    });

    const wsPayments = XLSX.utils.aoa_to_sheet(paymentsData);
    const sheetName = saver.name.substring(0, 31); // Excel limit
    XLSX.utils.book_append_sheet(wb, wsPayments, sheetName);
  });

  // Sheet 4: Préstamos
  const loansData: any[][] = [
    ['Ahorrador', 'Monto', 'Duración (meses)', 'Pagos Realizados', 'Estado', 'Fecha Inicio']
  ];

  savers.forEach(saver => {
    saver.loans.forEach(loan => {
      loansData.push([
        saver.name,
        `$${Number(loan.amount).toLocaleString()}`,
        loan.duration_months,
        loan.payments_made,
        loan.status === 'active' ? 'Activo' : 'Completado',
        new Date(loan.start_date).toLocaleDateString('es-ES')
      ]);
    });
  });

  const wsLoans = XLSX.utils.aoa_to_sheet(loansData);
  XLSX.utils.book_append_sheet(wb, wsLoans, 'Préstamos');

  // Generate and download
  const fileName = `Fondo_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

// Utility for currency display
const formatMoney = (amount: number) => {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
};

// Utility for input formatting (1.000.000)
const formatNumberString = (value: string) => {
  const raw = value.replace(/\D/g, '');
  if (!raw) return '';
  return new Intl.NumberFormat('es-CO').format(parseInt(raw));
};

const parseNumberString = (value: string) => {
  return parseInt(value.replace(/\./g, '')) || 0;
};

// --- Helper: Calculate Real Available Cash ---
const calculateAvailableFunds = (savers: Saver[]) => {
  let totalInflow = 0;
  let totalOutflow = 0;

  savers.forEach(saver => {
    saver.months.forEach(m => {
      if (m.q1_paid) totalInflow += Number(saver.bi_weekly_amount);
      if (m.q1_penalty_paid) totalInflow += Number(m.q1_penalty);
      if (m.q2_paid) totalInflow += Number(saver.bi_weekly_amount);
      if (m.q2_penalty_paid) totalInflow += Number(m.q2_penalty);
    });

    saver.loans.forEach(loan => {
      totalOutflow += Number(loan.amount);
      if (loan.payments_made > 0) {
        totalInflow += (Number(loan.monthly_payment) * loan.payments_made);
      }
    });
  });

  return totalInflow - totalOutflow;
};

// --- Helper: Check Loan Eligibility (local) ---
const checkLoanEligibilityLocal = (saver: Saver): { allowed: boolean; reason?: string } => {
  const now = new Date();

  for (const month of saver.months) {
    // Parse month_id correctly to avoid timezone issues
    const monthIdParts = month.month_id.split('-');
    const year = parseInt(monthIdParts[0]);
    const monthNum = parseInt(monthIdParts[1]) - 1;
    const monthDate = new Date(year, monthNum, 1);

    // Check if the month has started
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 0, 0, 0);
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

    // If the month hasn't started yet, skip it
    if (monthStart > currentMonthStart) {
      continue;
    }

    if (Number(month.q1_penalty) > 0 && !month.q1_penalty_paid) return { allowed: false, reason: "Tiene multas pendientes (Q1)." };
    if (Number(month.q2_penalty) > 0 && !month.q2_penalty_paid) return { allowed: false, reason: "Tiene multas pendientes (Q2)." };

    const q1Deadline = new Date(monthDate.getFullYear(), monthDate.getMonth(), 3);
    q1Deadline.setHours(23, 59, 59);
    if (!month.q1_paid && now > q1Deadline) {
      return { allowed: false, reason: "Tiene cuotas vencidas (1ra Quincena)." };
    }

    const q2Deadline = new Date(monthDate.getFullYear(), monthDate.getMonth(), 18);
    q2Deadline.setHours(23, 59, 59);
    if (!month.q2_paid && now > q2Deadline) {
      return { allowed: false, reason: "Tiene cuotas vencidas (2da Quincena)." };
    }
  }

  return { allowed: true };
};

// --- Helper: Check Payment Status (for visual indicators) ---
const getPaymentStatus = (month: SavingsMonth, settings: AppSettings | null): { q1Late: boolean; q2Late: boolean; outsideFundRange: boolean } => {
  const now = new Date();

  // Parse month_id correctly to avoid timezone issues
  // month_id format: "2026-02-01T00:00:00.000000Z"
  // Extract year and month from the string
  const monthIdParts = month.month_id.split('-');
  const year = parseInt(monthIdParts[0]);
  const monthNum = parseInt(monthIdParts[1]) - 1; // JavaScript months are 0-indexed
  const monthDate = new Date(year, monthNum, 1);

  // Validate that the month is within the fund's date range
  if (settings) {
    const fundStartDate = new Date(settings.start_date);
    fundStartDate.setDate(1); // Start of month
    fundStartDate.setHours(0, 0, 0, 0);

    const fundEndDate = new Date(settings.end_date);
    fundEndDate.setMonth(fundEndDate.getMonth() + 1, 0); // End of month
    fundEndDate.setHours(23, 59, 59, 999);

    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);

    // If month is outside fund range, don't mark as late
    if (monthStart < fundStartDate || monthStart > fundEndDate) {
      return {
        q1Late: false,
        q2Late: false,
        outsideFundRange: true
      };
    }
  }

  // Check if the month has started
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 0, 0, 0);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

  // If the month hasn't started yet, it can't be late
  if (monthStart > currentMonthStart) {
    return {
      q1Late: false,
      q2Late: false,
      outsideFundRange: false
    };
  }

  const q1Deadline = new Date(monthDate.getFullYear(), monthDate.getMonth(), 3, 23, 59, 59);
  const q2Deadline = new Date(monthDate.getFullYear(), monthDate.getMonth(), 18, 23, 59, 59);

  return {
    q1Late: !month.q1_paid && now > q1Deadline,
    q2Late: !month.q2_paid && now > q2Deadline,
    outsideFundRange: false
  };
};

// --- Loading Spinner ---
const LoadingSpinner = () => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center">
    <div className="text-center">
      <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
      <p className="text-slate-500">Cargando...</p>
    </div>
  </div>
);

// --- Sub-components ---

const NotificationModal = ({ day, onClose }: { day: number, onClose: () => void }) => {
  const isQ1 = day === 3;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full text-center transform transition-all scale-100 animate-in zoom-in-95 duration-200">
        <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
          <BellRing size={32} />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">Recordatorio de Pagos</h3>
        <p className="text-slate-500 mb-6 leading-relaxed">
          Hoy es día <strong className="text-slate-800">{day}</strong>.
          Es momento de verificar los pagos de la <strong className="text-emerald-600">{isQ1 ? '1ra' : '2da'} Quincena</strong> y aplicar multas si es necesario.
        </p>
        <Button fullWidth onClick={onClose}>
          Entendido, verificar ahora
        </Button>
      </div>
    </div>
  );
};

const SideMenu = ({ isOpen, onClose, onViewChange, onLogout, onExport, userName }: {
  isOpen: boolean,
  onClose: () => void,
  onViewChange: (view: ViewState) => void,
  onLogout: () => void,
  onExport: () => void,
  userName: string
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-64 bg-white h-full shadow-2xl p-6 flex flex-col animate-in slide-in-from-left duration-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-800">Menú</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100">
            <X size={24} className="text-slate-500" />
          </button>
        </div>

        <div className="mb-6 p-3 bg-emerald-50 rounded-xl">
          <p className="text-sm text-emerald-600 font-medium">{userName}</p>
        </div>

        <div className="space-y-2 flex-1">
          <button
            onClick={() => { onViewChange('DASHBOARD'); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-medium transition-colors text-left"
          >
            <Users size={20} className="shrink-0" />
            Ahorradores
          </button>

          <button
            onClick={() => { onViewChange('REPORT'); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-medium transition-colors text-left"
          >
            <BarChart3 size={20} className="shrink-0" />
            Informe de Fondo
          </button>

          <button
            onClick={() => { onViewChange('SETTINGS'); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-medium transition-colors text-left"
          >
            <Settings size={20} className="shrink-0" />
            Configuración
          </button>

          <button
            onClick={() => { onExport(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-medium transition-colors text-left"
          >
            <Download size={20} className="shrink-0" />
            Exportar a Excel
          </button>
        </div>

        <div className="pt-6 border-t border-slate-100 space-y-4">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 text-red-600 font-medium transition-colors text-left"
          >
            <LogOut size={20} className="shrink-0" />
            Cerrar Sesión
          </button>
          <p className="text-xs text-slate-400 text-center">Fondo Ahorro App v3.0</p>
        </div>
      </div>
    </div>
  );
};

const SettingsView = ({ currentSettings, user, onSave, onUpdateProfile, onBack, onTestReminder, isLoading }: {
  currentSettings: AppSettings,
  user: any,
  onSave: (newSettings: Partial<AppSettings>) => void,
  onUpdateProfile: (data: { email?: string; current_password?: string; new_password?: string; new_password_confirmation?: string }) => Promise<void>,
  onBack: () => void,
  onTestReminder: () => void,
  isLoading: boolean
}) => {
  const [rateStr, setRateStr] = useState(String(currentSettings.interest_rate));
  const [startDate, setStartDate] = useState(currentSettings.start_date.split('T')[0]);
  const [endDate, setEndDate] = useState(currentSettings.end_date.split('T')[0]);
  const [enableReminders, setEnableReminders] = useState(currentSettings.enable_reminders ?? true);

  // User profile state
  const [showProfileSection, setShowProfileSection] = useState(false);
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  const handleSave = () => {
    const val = parseFloat(rateStr);
    if (!isNaN(val) && val >= 0 && startDate && endDate) {
      if (startDate > endDate) {
        alert("La fecha de inicio no puede ser mayor a la fecha final.");
        return;
      }
      onSave({
        interest_rate: val,
        start_date: startDate,
        end_date: endDate,
        enable_reminders: enableReminders
      });
    }
  };

  const handleUpdateProfile = async () => {
    setProfileError(null);
    setProfileSuccess(null);

    // Validate inputs
    if (newPassword && newPassword !== confirmPassword) {
      setProfileError('Las contraseñas no coinciden');
      return;
    }

    if (newPassword && newPassword.length < 8) {
      setProfileError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    if (newPassword && !currentPassword) {
      setProfileError('Debes ingresar tu contraseña actual para cambiarla');
      return;
    }

    const updateData: any = {};
    if (newEmail !== user?.email) {
      updateData.email = newEmail;
    }
    if (newPassword) {
      updateData.current_password = currentPassword;
      updateData.new_password = newPassword;
      updateData.new_password_confirmation = confirmPassword;
    }

    if (Object.keys(updateData).length === 0) {
      setProfileError('No hay cambios para guardar');
      return;
    }

    try {
      await onUpdateProfile(updateData);
      setProfileSuccess('Perfil actualizado exitosamente');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      setProfileError(error.message || 'Error al actualizar el perfil');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header title="Configuración" showBack onBack={onBack} subtitle="Ajustes del Fondo" />
      <div className="p-6 space-y-6">

        {/* User Profile Section */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <User size={20} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Perfil de Usuario</h3>
                <p className="text-xs text-slate-500">Gestiona tu cuenta</p>
              </div>
            </div>
            <button
              onClick={() => setShowProfileSection(!showProfileSection)}
              className="text-emerald-600 text-sm font-semibold hover:bg-emerald-50 px-3 py-2 rounded-lg transition-colors"
            >
              {showProfileSection ? 'Ocultar' : 'Editar'}
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Mail size={16} className="text-slate-400" />
              <span className="text-slate-600">Correo:</span>
              <span className="font-medium text-slate-800">{user?.email}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User size={16} className="text-slate-400" />
              <span className="text-slate-600">Nombre:</span>
              <span className="font-medium text-slate-800">{user?.name}</span>
            </div>
          </div>

          {showProfileSection && (
            <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
              {profileError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">
                  {profileSuccess}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nuevo Correo Electrónico</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800"
                  placeholder="correo@ejemplo.com"
                />
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-700 mb-4">Cambiar Contraseña</h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Contraseña Actual</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800"
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Nueva Contraseña</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800"
                      placeholder="••••••••"
                      minLength={8}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Confirmar Nueva Contraseña</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800"
                      placeholder="••••••••"
                      minLength={8}
                    />
                  </div>
                </div>
              </div>

              <Button fullWidth onClick={handleUpdateProfile} disabled={isLoading}>
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Actualizar Perfil'}
              </Button>
            </div>
          )}
        </div>

        {/* Fund Settings Section */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <Settings size={20} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Configuración del Fondo</h3>
              <p className="text-xs text-slate-500">Ajusta los parámetros del fondo</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Tasa de Interés (%)</label>
            <div className="relative">
              <span className="absolute left-4 top-4 text-slate-400">
                <Percent size={18} />
              </span>
              <input
                type="number"
                inputMode="decimal"
                value={rateStr}
                onChange={(e) => setRateStr(e.target.value)}
                className="w-full pl-10 pr-4 py-4 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 font-mono text-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Inicio del Fondo</label>
              <div className="relative">
                <span className="absolute left-4 top-4 text-slate-400">
                  <CalendarDays size={18} />
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-4 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Finalización del Fondo</label>
              <div className="relative">
                <span className="absolute left-4 top-4 text-slate-400">
                  <CalendarDays size={18} />
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-4 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 font-medium"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center justify-between p-2 cursor-pointer select-none">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${enableReminders ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                  <Bell size={20} />
                </div>
                <div>
                  <span className="block font-medium text-slate-800">Recordatorios de Pago</span>
                  <span className="block text-xs text-slate-500">Avisar días 3 y 18</span>
                </div>
              </div>
              <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out rounded-full">
                <input
                  type="checkbox"
                  checked={enableReminders}
                  onChange={(e) => setEnableReminders(e.target.checked)}
                  className="absolute w-12 h-6 opacity-0 cursor-pointer z-10"
                />
                <div className={`block w-full h-full rounded-full transition-colors ${enableReminders ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform transform ${enableReminders ? 'translate-x-6' : 'translate-x-0'}`}></div>
              </div>
            </label>
            <div className="mt-2 flex justify-center">
              <button
                onClick={onTestReminder}
                className="text-emerald-600 text-xs font-semibold flex items-center gap-1.5 hover:bg-emerald-50 px-3 py-2 rounded-lg transition-colors active:scale-95"
              >
                <BellRing size={14} /> Probar alerta (Simulación)
              </button>
            </div>
          </div>

          <div className="pt-4">
            <Button fullWidth onClick={handleSave} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Guardar Cambios del Fondo'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ReportView = ({ reportData, onBack, isLoading }: { reportData: ReportData | null, onBack: () => void, isLoading: boolean }) => {
  if (isLoading || !reportData) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header title="Informe del Fondo" showBack onBack={onBack} />
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header title="Informe del Fondo" showBack onBack={onBack} />
      <div className="p-4 space-y-4">

        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 p-6 rounded-3xl shadow-lg shadow-emerald-200 text-white">
          <div className="flex items-center gap-3 mb-2 opacity-90">
            <div className="p-2 bg-white/20 rounded-xl">
              <DollarSign size={20} />
            </div>
            <span className="font-medium">Dinero Disponible</span>
          </div>
          <h2 className="text-4xl font-bold tracking-tight">{formatMoney(reportData.available_funds)}</h2>
          <p className="text-emerald-100 text-sm mt-1">Efectivo actual en caja</p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
              <Wallet size={20} />
            </div>
            <span className="text-slate-500 font-medium">Total Ahorrado (Histórico)</span>
          </div>
          <h2 className="text-3xl font-bold text-slate-800">{formatMoney(reportData.total_savings)}</h2>
          <p className="text-sm text-slate-400 mt-1">Suma histórica de cuotas</p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-500 font-medium text-sm">Recaudo Mensual Esperado</span>
              <Calendar size={18} className="text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{formatMoney(reportData.expected_monthly_collection)}</p>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-500 font-medium text-sm">Ganancia por Intereses</span>
              <TrendingUp size={18} className="text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-emerald-600">{formatMoney(reportData.total_interest_earned)}</p>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-500 font-medium text-sm">Multas Recaudadas</span>
              <AlertTriangle size={18} className="text-red-500" />
            </div>
            <p className="text-2xl font-bold text-red-600">{formatMoney(reportData.total_penalties_collected)}</p>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-500 font-medium text-sm">Capital en Préstamos</span>
              <PieChart size={18} className="text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{formatMoney(reportData.active_loans_capital)}</p>
          </div>
        </div>

      </div>
    </div>
  );
};

const Dashboard = ({ savers, settings, onAddSaver, onSelectSaver, onOpenMenu, isLoading }: {
  savers: Saver[],
  settings: AppSettings | null,
  onAddSaver: () => void,
  onSelectSaver: (id: number) => void,
  onOpenMenu: () => void,
  isLoading: boolean
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const availableFunds = calculateAvailableFunds(savers);

  const calculateProjectedTotal = (saver: Saver) => {
    if (!settings) return 0;
    // Parsear fechas directamente para evitar problemas de timezone
    const [startYear, startMonth] = settings.start_date.split('-').map(Number);
    const [endYear, endMonth] = settings.end_date.split('-').map(Number);

    const months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    return Math.max(0, months) * 2 * Number(saver.bi_weekly_amount);
  };

  // Filtrar ahorradores basado en la búsqueda
  const filteredSavers = savers.filter(saver =>
    saver.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Header title="Fondo de Ahorro" subtitle="Panel Principal" showMenu onMenuClick={onOpenMenu} />

      {/* Current Date Indicator */}
      <div className="px-4 pt-4">
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 flex items-center gap-2">
          <Calendar size={16} className="text-blue-600" />
          <span className="text-sm text-blue-700 font-medium">
            Fecha actual: {new Date().toLocaleDateString('es-ES', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </span>
        </div>
      </div>

      <div className="px-4 py-6">
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-3xl p-6 text-white shadow-xl shadow-emerald-200">
          <div className="flex items-center gap-3 mb-2 opacity-90">
            <div className="p-2 bg-white/20 rounded-full">
              <Wallet size={20} />
            </div>
            <span className="font-medium">Total en Caja</span>
          </div>
          <h2 className="text-4xl font-bold tracking-tight mb-1">{formatMoney(availableFunds)}</h2>
          <p className="text-emerald-100 text-sm">Dinero disponible para préstamos</p>
        </div>
      </div>

      <div className="px-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800 text-lg">Ahorradores</h3>
          <span className="text-xs font-semibold bg-slate-200 text-slate-600 px-2 py-1 rounded-full">{savers.length}</span>
        </div>

        {/* Buscador */}
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search size={20} className="text-slate-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar ahorrador..."
            className="w-full pl-12 pr-4 py-3 bg-white rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-slate-800 placeholder-slate-400 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-4 flex items-center"
            >
              <X size={18} className="text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>

        {/* Resultados de búsqueda */}
        {searchQuery && (
          <p className="text-sm text-slate-500 mb-3">
            {filteredSavers.length === 0
              ? 'No se encontraron resultados'
              : `${filteredSavers.length} resultado${filteredSavers.length !== 1 ? 's' : ''}`}
          </p>
        )}

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {savers.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-300">
                <Users className="mx-auto text-slate-300 mb-3" size={48} />
                <p className="text-slate-500">No hay ahorradores aún.</p>
              </div>
            ) : filteredSavers.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-300">
                <Search className="mx-auto text-slate-300 mb-3" size={48} />
                <p className="text-slate-500">No se encontró "{searchQuery}"</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-emerald-600 text-sm font-medium hover:underline"
                >
                  Limpiar búsqueda
                </button>
              </div>
            ) : (
              filteredSavers.map(saver => {
                const totalSaved = saver.months.reduce((acc, m) => acc + (m.q1_paid ? Number(saver.bi_weekly_amount) : 0) + (m.q2_paid ? Number(saver.bi_weekly_amount) : 0), 0);

                const eligibility = checkLoanEligibilityLocal(saver);
                const isLate = !eligibility.allowed;
                const projected = calculateProjectedTotal(saver);

                return (
                  <div
                    key={saver.id}
                    onClick={() => onSelectSaver(saver.id)}
                    className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-transform cursor-pointer flex justify-between items-center group"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg relative ${isLate ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                        {saver.name.charAt(0).toUpperCase()}
                        {isLate && <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></div>}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800">{saver.name}</h4>
                        <p className="text-sm text-slate-500">Ahorrado: <span className="text-emerald-600 font-semibold">{formatMoney(totalSaved)}</span></p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Cuota: <span className="font-medium text-slate-500">{formatMoney(Number(saver.bi_weekly_amount))}</span> · Meta: {formatMoney(projected)}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="text-slate-300 group-hover:text-emerald-500 transition-colors" />
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <button
        onClick={onAddSaver}
        className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-600 rounded-full text-white shadow-lg shadow-emerald-300 flex items-center justify-center hover:bg-emerald-700 active:scale-90 transition-all z-40"
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>
    </div>
  );
};

const AddSaverView = ({ onBack, onSave, settings, isLoading }: {
  onBack: () => void,
  onSave: (name: string, amount: number) => void,
  settings: AppSettings | null,
  isLoading: boolean
}) => {
  const [name, setName] = useState('');
  const [amountStr, setAmountStr] = useState('');

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmountStr(formatNumberString(e.target.value));
  };

  const numericAmount = parseNumberString(amountStr);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header title="Nuevo Ahorrador" showBack onBack={onBack} />
      <div className="p-6">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Nombre Completo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Juan Pérez"
              className="w-full px-4 py-4 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ahorro Quincenal</label>
            <div className="relative">
              <span className="absolute left-4 top-4 text-slate-400">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={amountStr}
                onChange={handleAmountChange}
                placeholder="0"
                className="w-full pl-8 pr-4 py-4 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 font-mono text-lg"
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">Este valor se sumará por cada quincena marcada.</p>
          </div>

          <div className="pt-4">
            <Button fullWidth onClick={() => onSave(name, numericAmount)} disabled={!name || !numericAmount || isLoading}>
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Crear Ahorrador'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AddLoanView = ({ saver, settings, availableFunds, onBack, onSave, isLoading }: {
  saver: Saver,
  settings: AppSettings,
  availableFunds: number,
  onBack: () => void,
  onSave: (amount: number, months: number) => void,
  isLoading: boolean
}) => {
  const [amountStr, setAmountStr] = useState('');
  const [monthsStr, setMonthsStr] = useState('');

  const amount = parseNumberString(amountStr);
  const months = parseInt(monthsStr) || 0;

  const eligibility = checkLoanEligibilityLocal(saver);

  const now = new Date();
  const fundEndDate = new Date(settings.end_date);

  const monthsRemaining = (fundEndDate.getFullYear() - now.getFullYear()) * 12 + (fundEndDate.getMonth() - now.getMonth());
  const maxAllowedMonths = Math.max(0, monthsRemaining);

  const rate = Number(settings.interest_rate) / 100;
  const interest = amount * rate * months;
  const total = amount + interest;
  const monthlyPayment = months > 0 ? total / months : 0;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmountStr(formatNumberString(e.target.value));
  };

  const isAmountValid = amount > 0 && amount <= availableFunds;
  const hasInsufficientFunds = amount > availableFunds;
  const isTimeValid = months > 0 && months <= maxAllowedMonths;
  const exceedsTimeLimit = months > maxAllowedMonths;

  if (!eligibility.allowed) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header title="Nuevo Préstamo" showBack onBack={onBack} subtitle={`Para: ${saver.name}`} />
        <div className="p-6">
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-red-100 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Préstamo No Disponible</h3>
            <p className="text-slate-500 mb-6">{eligibility.reason}</p>
            <p className="text-xs text-slate-400">El ahorrador debe estar al día y sin multas pendientes para solicitar un préstamo.</p>
            <Button className="mt-6" variant="secondary" fullWidth onClick={onBack}>Volver</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header title="Nuevo Préstamo" showBack onBack={onBack} subtitle={`Para: ${saver.name}`} />
      <div className="p-6 space-y-6">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">

          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex justify-between items-center">
            <span className="text-emerald-800 text-sm font-medium">Disponible en Caja</span>
            <span className="text-emerald-800 font-bold text-lg">{formatMoney(availableFunds)}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Monto a Prestar</label>
            <div className="relative">
              <span className="absolute left-4 top-4 text-slate-400">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={amountStr}
                onChange={handleAmountChange}
                placeholder="0"
                className={`w-full pl-8 pr-4 py-4 rounded-xl bg-slate-50 border focus:ring-2 outline-none text-slate-800 font-mono text-lg transition-colors
                  ${hasInsufficientFunds ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-transparent focus:ring-emerald-500'}
                `}
              />
            </div>
            {hasInsufficientFunds && (
              <div className="flex items-start gap-2 mt-2 text-red-600 text-sm animate-in slide-in-from-top-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>Fondos insuficientes. No puedes prestar más de {formatMoney(availableFunds)}.</p>
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-slate-700">Tiempo (Meses)</label>
              <span className="text-xs text-slate-400">Máx: {maxAllowedMonths} meses</span>
            </div>
            <input
              type="number"
              value={monthsStr}
              onChange={(e) => setMonthsStr(e.target.value)}
              placeholder="Ej. 3"
              className={`w-full px-4 py-4 rounded-xl bg-slate-50 border focus:ring-2 outline-none text-slate-800 text-center text-lg font-bold
                ${exceedsTimeLimit ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-transparent focus:ring-emerald-500'}
              `}
            />
            {exceedsTimeLimit && (
              <div className="flex items-start gap-2 mt-2 text-red-600 text-sm animate-in slide-in-from-top-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>El préstamo no puede superar la fecha de cierre del fondo.</p>
              </div>
            )}
          </div>

          {amount > 0 && months > 0 && !hasInsufficientFunds && !exceedsTimeLimit && (
            <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 animate-in fade-in">
              <h4 className="text-emerald-800 font-bold flex items-center gap-2 mb-3">
                <Calculator size={18} /> Resumen de Pago
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Interés Mensual ({settings.interest_rate}%)</span>
                  <span className="font-mono text-emerald-700">{formatMoney(amount * rate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Interés Total</span>
                  <span className="font-mono text-emerald-700">{formatMoney(interest)}</span>
                </div>
                <div className="h-px bg-emerald-200 my-2"></div>
                <div className="flex justify-between items-center bg-white/50 p-2 rounded-lg">
                  <span className="text-emerald-900 font-medium">Cuota Mensual</span>
                  <span className="font-mono font-bold text-emerald-700 text-lg">{formatMoney(monthlyPayment)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-1">
                  <span className="text-emerald-900">Total a Pagar</span>
                  <span className="font-mono text-emerald-900">{formatMoney(total)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="pt-2">
            <Button fullWidth onClick={() => onSave(amount, months)} disabled={!isAmountValid || !isTimeValid || isLoading}>
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar Préstamo'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SaverDetailView = ({ saver, settings, onBack, onToggleCheck, onTogglePenalty, onAddLoan, onPayLoanMonth, onDeleteSaver, isLoading }: {
  saver: Saver,
  settings: AppSettings | null,
  onBack: () => void,
  onToggleCheck: (monthId: number, quincena: 'q1' | 'q2') => void,
  onTogglePenalty: (monthId: number, quincena: 'q1' | 'q2') => void,
  onAddLoan: () => void,
  onPayLoanMonth: (loanId: number) => void,
  onDeleteSaver: () => void,
  isLoading: boolean
}) => {
  const [tab, setTab] = useState<'SAVINGS' | 'LOANS'>('SAVINGS');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const totalSaved = saver.months.reduce((acc, m) => acc + (m.q1_paid ? Number(saver.bi_weekly_amount) : 0) + (m.q2_paid ? Number(saver.bi_weekly_amount) : 0), 0);
  const loans = [...saver.loans].sort((a, b) => (a.status === 'active' ? -1 : 1));
  const activeLoans = saver.loans.filter(l => l.status === 'active');
  const totalLoansAmount = activeLoans.reduce((acc, l) => acc + (Number(l.total_to_pay) - (Number(l.monthly_payment) * l.payments_made)), 0);

  const hasActiveLoans = activeLoans.length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        title={saver.name}
        showBack
        onBack={onBack}
        subtitle="Detalles del ahorrador"
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full text-center transform transition-all scale-100 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">¿Eliminar Ahorrador?</h3>
            <p className="text-slate-500 mb-4 leading-relaxed">
              Esta acción eliminará permanentemente a <strong className="text-slate-800">{saver.name}</strong> y todo su historial de ahorros.
            </p>
            {hasActiveLoans && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg mb-4 text-sm">
                <strong>Advertencia:</strong> Este ahorrador tiene préstamos activos por {formatMoney(totalLoansAmount)}.
              </div>
            )}

            {/* Confirmation Input */}
            <div className="mb-6 text-left">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Para confirmar, escribe el nombre del ahorrador:
              </label>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={saver.name}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-red-500 focus:outline-none transition-colors"
                autoFocus
              />
              {deleteConfirmName && deleteConfirmName !== saver.name && (
                <p className="text-xs text-red-600 mt-2">El nombre no coincide</p>
              )}
            </div>

            {/* Stacked Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDeleteSaver();
                  setDeleteConfirmName('');
                }}
                disabled={isLoading || deleteConfirmName !== saver.name}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Trash2 size={18} />
                    <span>Sí, Eliminar Permanentemente</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmName('');
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-6">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col items-center">
          <span className="text-slate-400 text-sm font-medium mb-1">Ahorro Total Acumulado</span>
          <h2 className="text-4xl font-bold text-slate-800 tracking-tight">{formatMoney(totalSaved)}</h2>
          <p className="text-sm text-emerald-600 font-medium mt-1">Cuota quincenal: {formatMoney(Number(saver.bi_weekly_amount))}</p>
          <div className="mt-4 flex gap-2 bg-slate-100 p-1 rounded-xl w-full">
            <button
              onClick={() => setTab('SAVINGS')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${tab === 'SAVINGS' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500'}`}
            >
              Ahorros
            </button>
            <button
              onClick={() => setTab('LOANS')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${tab === 'LOANS' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500'}`}
            >
              Préstamos
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pb-24">
        {tab === 'SAVINGS' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2 px-2">
              <Calendar size={18} className="text-slate-400" />
              <h3 className="font-bold text-slate-700">Historial de Pagos</h3>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />}
            </div>

            {saver.months.map((month, idx) => {
              const q1Start = 1, q1End = 3;
              const q2Start = 15, q2End = 18;

              const hasQ1Penalty = Number(month.q1_penalty) > 0;
              const hasQ2Penalty = Number(month.q2_penalty) > 0;

              const paymentStatus = getPaymentStatus(month, settings);
              const isQ1Late = paymentStatus.q1Late;
              const isQ2Late = paymentStatus.q2Late;

              const isPreviousMonthDone = idx === 0 || (saver.months[idx - 1].q1_paid && saver.months[idx - 1].q2_paid);
              const isMonthLocked = !isPreviousMonthDone || month.is_locked;

              return (
                <div key={month.id} className={`bg-white rounded-2xl p-4 border shadow-sm relative overflow-hidden ${isMonthLocked ? 'opacity-60 grayscale border-slate-100' : (isQ1Late || isQ2Late) ? 'border-red-200' : 'border-slate-100'}`}>
                  {isMonthLocked && (
                    <div className="absolute inset-0 bg-slate-100/50 z-10 flex items-center justify-center">
                      <Lock className="text-slate-400" />
                    </div>
                  )}
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700 capitalize">{month.label}</span>
                      {(isQ1Late || isQ2Late) && !isMonthLocked && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                          <AlertTriangle size={12} /> Atrasado
                        </span>
                      )}
                    </div>
                    {month.q1_paid && month.q2_paid && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-bold">Completado</span>}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <button
                        disabled={isMonthLocked || isLoading}
                        onClick={() => onToggleCheck(month.id, 'q1')}
                        className={`relative p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 w-full ${month.q1_paid
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : isQ1Late
                            ? 'border-red-400 bg-red-50 text-red-600 animate-pulse'
                            : 'border-slate-200 hover:border-emerald-200 text-slate-400'
                          }`}
                      >
                        <span className="text-xs font-bold uppercase tracking-wider">Día {q1Start}-{q1End}</span>
                        {month.q1_paid ? <CheckCircle2 size={28} className="text-emerald-500" /> : isQ1Late ? <AlertCircle size={28} className="text-red-500" /> : <Circle size={28} />}
                        <span className="text-sm font-mono font-medium">{formatMoney(Number(saver.bi_weekly_amount))}</span>
                        {isQ1Late && !month.q1_paid && <span className="text-xs text-red-600 font-bold">¡Vencido!</span>}
                      </button>
                      {hasQ1Penalty && (
                        <button
                          disabled={isMonthLocked || isLoading}
                          onClick={() => onTogglePenalty(month.id, 'q1')}
                          className={`px-2 py-2 rounded-lg text-xs font-bold flex items-center justify-between border transition-all ${month.q1_penalty_paid
                            ? 'bg-slate-100 text-slate-500 border-slate-200 line-through'
                            : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100 cursor-pointer'
                            } ${isMonthLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <span>Multa (5%)</span>
                          <span>{formatMoney(Number(month.q1_penalty))}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        disabled={isMonthLocked || isLoading}
                        onClick={() => onToggleCheck(month.id, 'q2')}
                        className={`relative p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 w-full ${month.q2_paid
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : isQ2Late
                            ? 'border-red-400 bg-red-50 text-red-600 animate-pulse'
                            : 'border-slate-200 hover:border-emerald-200 text-slate-400'
                          }`}
                      >
                        <span className="text-xs font-bold uppercase tracking-wider">Día {q2Start}-{q2End}</span>
                        {month.q2_paid ? <CheckCircle2 size={28} className="text-emerald-500" /> : isQ2Late ? <AlertCircle size={28} className="text-red-500" /> : <Circle size={28} />}
                        <span className="text-sm font-mono font-medium">{formatMoney(Number(saver.bi_weekly_amount))}</span>
                        {isQ2Late && !month.q2_paid && <span className="text-xs text-red-600 font-bold">¡Vencido!</span>}
                      </button>
                      {hasQ2Penalty && (
                        <button
                          disabled={isMonthLocked || isLoading}
                          onClick={() => onTogglePenalty(month.id, 'q2')}
                          className={`px-2 py-2 rounded-lg text-xs font-bold flex items-center justify-between border transition-all ${month.q2_penalty_paid
                            ? 'bg-slate-100 text-slate-500 border-slate-200 line-through'
                            : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100 cursor-pointer'
                            } ${isMonthLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <span>Multa (5%)</span>
                          <span>{formatMoney(Number(month.q2_penalty))}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex justify-between items-center">
              <div>
                <p className="text-sm text-blue-600 font-medium">Deuda Total Pendiente</p>
                <p className="text-2xl font-bold text-blue-800">{formatMoney(totalLoansAmount)}</p>
              </div>
              <Button onClick={onAddLoan} className="!px-3 !py-2 !text-sm">
                Nuevo
              </Button>
            </div>

            <div className="space-y-3">
              {loans.length === 0 ? (
                <div className="text-center py-8 text-slate-400">No hay préstamos registrados</div>
              ) : (
                loans.map(loan => {
                  const remainingBalance = Number(loan.total_to_pay) - (Number(loan.monthly_payment) * loan.payments_made);
                  const isPaid = loan.status === 'paid';

                  return (
                    <div key={loan.id} className={`bg-white rounded-2xl p-5 border shadow-sm ${isPaid ? 'border-slate-100 opacity-75' : 'border-emerald-100'}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                            {isPaid ? 'Préstamo Pagado' : 'Préstamo Activo'}
                          </span>
                          <h4 className={`text-xl font-bold ${isPaid ? 'text-slate-600' : 'text-slate-800'}`}>{formatMoney(Number(loan.amount))}</h4>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-md font-bold ${isPaid ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>
                          {isPaid ? 'Finalizado' : 'Activo'}
                        </span>
                      </div>

                      <div className="space-y-2 text-sm border-t border-slate-50 pt-3">
                        <div className="flex justify-between bg-emerald-50 p-2 rounded-lg mb-2">
                          <span className="text-emerald-800 font-medium">Cuota Mensual</span>
                          <span className="text-emerald-800 font-bold">{formatMoney(Number(loan.monthly_payment))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Total a Pagar</span>
                          <span className="font-bold text-slate-700">{formatMoney(Number(loan.total_to_pay))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Saldo Pendiente</span>
                          <span className="font-bold text-red-500">{formatMoney(remainingBalance)}</span>
                        </div>

                        <div className="mt-4 pt-2">
                          <p className="text-xs text-slate-400 font-bold mb-2 uppercase tracking-wider text-center">Progreso de Pagos (Meses)</p>
                          <div className="flex flex-wrap justify-center gap-2">
                            {Array.from({ length: loan.duration_months }).map((_, idx) => {
                              const isMonthPaid = idx < loan.payments_made;
                              const isNextToPay = idx === loan.payments_made && !isPaid;

                              return (
                                <button
                                  key={idx}
                                  disabled={!isNextToPay || isLoading}
                                  onClick={() => isNextToPay && onPayLoanMonth(loan.id)}
                                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all border-2
                                      ${isMonthPaid ? 'bg-emerald-500 border-emerald-500 text-white' : ''}
                                      ${isNextToPay ? 'bg-white border-emerald-500 text-emerald-600 animate-pulse cursor-pointer shadow-md' : ''}
                                      ${!isMonthPaid && !isNextToPay ? 'bg-slate-50 border-slate-200 text-slate-300' : ''}
                                     `}
                                >
                                  {idx + 1}
                                </button>
                              );
                            })}
                          </div>
                          {loan.status === 'active' && (
                            <p className="text-center text-xs text-slate-400 mt-2">Toque el siguiente número para registrar el pago</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Delete Saver Button */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center justify-center gap-2 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors font-medium"
          >
            <Trash2 size={18} />
            Eliminar Ahorrador
          </button>
        </div>
      </div>
    </div>
  );
};

// Main App Component
function MainApp() {
  const { user, isLoading: isAuthLoading, login, register, logout, isAuthenticated } = useAuth();

  const [savers, setSavers] = useState<Saver[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [activeSaverId, setActiveSaverId] = useState<number | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [notificationDay, setNotificationDay] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load data on auth
  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [saversData, settingsData] = await Promise.all([
        api.getSavers(),
        api.getSettings()
      ]);
      setSavers(saversData);
      setSettings(settingsData);

      // Notification Logic
      if (settingsData.enable_reminders) {
        const now = new Date();
        const day = now.getDate();

        if (day === 3 || day === 18) {
          const sessionKey = `reminder_shown_${now.toDateString()}`;
          if (!sessionStorage.getItem(sessionKey)) {
            setNotificationDay(day);
            sessionStorage.setItem(sessionKey, 'true');
          }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadReportData = async () => {
    setIsLoading(true);
    try {
      const data = await api.getReports();
      setReportData(data);
    } catch (error) {
      console.error('Error loading report:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const activeSaver = savers.find(s => s.id === activeSaverId);
  const availableFunds = calculateAvailableFunds(savers);

  // --- Actions ---

  const handleAddSaver = async (name: string, amount: number) => {
    if (!settings) return;
    setIsLoading(true);
    try {
      const result = await api.createSaver({
        name,
        bi_weekly_amount: amount,
        start_date: settings.start_date.split('T')[0]
      });
      setSavers([...savers, result.saver]);
      setView('DASHBOARD');
    } catch (error) {
      alert('Error al crear ahorrador');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleCheck = async (monthId: number, quincena: 'q1' | 'q2') => {
    setIsLoading(true);
    try {
      const result = await api.toggleQuincena(monthId, quincena);

      // Update local state
      setSavers(savers.map(s => ({
        ...s,
        months: s.months.map(m => m.id === monthId ? result.month : m)
      })));

      // Check if we need to generate next month
      if (activeSaverId) {
        const saver = savers.find(s => s.id === activeSaverId);
        if (saver) {
          const lastMonth = saver.months[saver.months.length - 1];
          if (lastMonth.id === monthId && result.month.q1_paid && result.month.q2_paid) {
            try {
              const newMonthResult = await api.generateNextMonth(activeSaverId);
              setSavers(savers.map(s =>
                s.id === activeSaverId
                  ? { ...s, months: [...s.months.map(m => m.id === monthId ? result.month : m), newMonthResult.month] }
                  : s
              ));
            } catch {
              // Fund end date reached, no more months
            }
          }
        }
      }
    } catch (error) {
      alert('Error al actualizar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePenalty = async (monthId: number, quincena: 'q1' | 'q2') => {
    setIsLoading(true);
    try {
      const result = await api.togglePenalty(monthId, quincena);

      // Update local state
      setSavers(savers.map(s => ({
        ...s,
        months: s.months.map(m => m.id === monthId ? result.month : m)
      })));
    } catch (error) {
      alert('Error al actualizar multa');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddLoan = async (amount: number, months: number) => {
    if (!activeSaverId) return;

    setIsLoading(true);
    try {
      const result = await api.createLoan(activeSaverId, {
        amount,
        duration_months: months
      });

      setSavers(savers.map(s => {
        if (s.id === activeSaverId) {
          return { ...s, loans: [...s.loans, result.loan] };
        }
        return s;
      }));

      setView('SAVER_DETAIL');
    } catch (error: any) {
      alert(error.message || 'Error al crear préstamo');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayLoanMonth = async (loanId: number) => {
    setIsLoading(true);
    try {
      const result = await api.makeLoanPayment(loanId);

      setSavers(savers.map(s => ({
        ...s,
        loans: s.loans.map(l => l.id === loanId ? result.loan : l)
      })));
    } catch (error) {
      alert('Error al registrar pago');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async (newSettings: Partial<AppSettings>) => {
    setIsLoading(true);
    try {
      const result = await api.updateSettings(newSettings);
      setSettings(result.settings);
      setView('DASHBOARD');
    } catch (error) {
      alert('Error al guardar configuración');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSaver = async () => {
    if (!activeSaverId) return;

    setIsLoading(true);
    try {
      await api.deleteSaver(activeSaverId);
      setSavers(savers.filter(s => s.id !== activeSaverId));
      setActiveSaverId(null);
      setView('DASHBOARD');
    } catch (error) {
      alert('Error al eliminar ahorrador');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setSavers([]);
    setSettings(null);
    setView('DASHBOARD');
  };

  const handleExport = () => {
    exportToExcel(savers, settings);
  };

  const handleUpdateProfile = async (data: { email?: string; current_password?: string; new_password?: string; new_password_confirmation?: string }) => {
    setIsLoading(true);
    try {
      await api.updateUserProfile(data);
      // Optionally reload user data
      // const updatedUser = await api.getUser();
    } catch (error: any) {
      throw new Error(error.message || 'Error al actualizar el perfil');
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading while checking auth
  if (isAuthLoading) {
    return <LoadingSpinner />;
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <LoginView onLogin={login} onRegister={register} />;
  }

  return (
    <div className="antialiased text-slate-800">
      <SideMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onViewChange={(v) => {
          setView(v);
          setActiveSaverId(null);
          if (v === 'REPORT') loadReportData();
        }}
        onLogout={handleLogout}
        onExport={handleExport}
        userName={user?.name || 'Usuario'}
      />

      {notificationDay && (
        <NotificationModal day={notificationDay} onClose={() => setNotificationDay(null)} />
      )}

      {view === 'DASHBOARD' && (
        <Dashboard
          savers={savers}
          settings={settings}
          onAddSaver={() => setView('ADD_SAVER')}
          onSelectSaver={(id) => { setActiveSaverId(id); setView('SAVER_DETAIL'); }}
          onOpenMenu={() => setIsMenuOpen(true)}
          isLoading={isLoading}
        />
      )}
      {view === 'REPORT' && (
        <ReportView reportData={reportData} onBack={() => setView('DASHBOARD')} isLoading={isLoading} />
      )}
      {view === 'SETTINGS' && settings && (
        <SettingsView
          currentSettings={settings}
          user={user}
          onSave={handleSaveSettings}
          onUpdateProfile={handleUpdateProfile}
          onBack={() => setView('DASHBOARD')}
          onTestReminder={() => setNotificationDay(3)}
          isLoading={isLoading}
        />
      )}
      {view === 'ADD_SAVER' && (
        <AddSaverView
          onBack={() => setView('DASHBOARD')}
          onSave={handleAddSaver}
          settings={settings}
          isLoading={isLoading}
        />
      )}
      {view === 'SAVER_DETAIL' && activeSaver && (
        <SaverDetailView
          saver={activeSaver}
          settings={settings}
          onBack={() => setView('DASHBOARD')}
          onToggleCheck={handleToggleCheck}
          onTogglePenalty={handleTogglePenalty}
          onAddLoan={() => setView('ADD_LOAN')}
          onPayLoanMonth={handlePayLoanMonth}
          onDeleteSaver={handleDeleteSaver}
          isLoading={isLoading}
        />
      )}
      {view === 'ADD_LOAN' && activeSaver && settings && (
        <AddLoanView
          saver={activeSaver}
          settings={settings}
          availableFunds={availableFunds}
          onBack={() => setView('SAVER_DETAIL')}
          onSave={handleAddLoan}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
