import React from 'react';
import { X, AlertCircle, Loader2, ChevronDown } from 'lucide-react';

// ─── Button ─────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-v2-primary-600 hover:bg-v2-primary-700 text-white shadow-v2-sm hover:shadow-v2-md active:shadow-none focus-visible:ring-2 focus-visible:ring-v2-primary-500/40 focus-visible:ring-offset-2',
  secondary: 'bg-white hover:bg-v2-neutral-50 text-v2-text-primary border border-v2-border-light shadow-v2-sm hover:border-v2-border-DEFAULT focus-visible:ring-2 focus-visible:ring-v2-primary-500/30 focus-visible:ring-offset-2',
  ghost: 'bg-transparent hover:bg-v2-neutral-100 text-v2-text-secondary focus-visible:ring-2 focus-visible:ring-v2-primary-500/30 focus-visible:ring-offset-1',
  danger: 'bg-v2-error-500 hover:bg-v2-error-600 text-white shadow-v2-sm focus-visible:ring-2 focus-visible:ring-v2-error-500/40 focus-visible:ring-offset-2',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-v2-xs gap-1.5',
  md: 'px-4 py-2.5 text-v2-sm gap-2',
  lg: 'px-6 py-3 text-v2-base gap-2.5',
};

export function Button({ variant = 'primary', size = 'md', loading, icon, children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-semibold rounded-v2-lg transition-all duration-150 
        ${buttonVariants[variant]} ${buttonSizes[size]} 
        disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={size === 'sm' ? 14 : 16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
}

const cardPadding = { sm: 'p-4', md: 'p-6', lg: 'p-8' };

export function Card({ children, className = '', padding = 'md' }: CardProps) {
  return (
    <div className={`bg-white rounded-v2-xl border border-v2-border-light shadow-v2-sm ${cardPadding[padding]} ${className}`}>
      {children}
    </div>
  );
}

// ─── Badge ──────────────────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
  className?: string;
}

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-v2-primary-50 text-v2-primary-700 border-v2-primary-200',
  success: 'bg-v2-success-50 text-v2-success-600 border-v2-success-200',
  warning: 'bg-v2-warning-50 text-v2-warning-600 border-v2-warning-200',
  error: 'bg-v2-error-50 text-v2-error-600 border-v2-error-200',
  info: 'bg-v2-secondary-50 text-v2-secondary-700 border-v2-secondary-200',
  neutral: 'bg-v2-neutral-100 text-v2-neutral-600 border-v2-neutral-200',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-v2-primary-500',
  success: 'bg-v2-success-500',
  warning: 'bg-v2-warning-500',
  error: 'bg-v2-error-500',
  info: 'bg-v2-secondary-500',
  neutral: 'bg-v2-neutral-400',
};

export function Badge({ children, variant = 'default', dot, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-v2-xs font-medium rounded-full border ${badgeVariants[variant]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}

// ─── Input ──────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function Input({ label, error, icon, className = '', id, ...props }: InputProps) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={inputId} className="block text-v2-sm font-medium text-v2-text-primary">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-v2-neutral-400">{icon}</span>}
        <input
          id={inputId}
          className={`w-full rounded-v2-lg border border-v2-border-light bg-white px-3.5 py-2.5 text-v2-sm text-v2-text-primary
            placeholder:text-v2-neutral-400 focus:outline-none focus:border-v2-primary-500 focus:ring-2 focus:ring-v2-primary-500/10
            transition-all ${icon ? 'pl-10' : ''} ${error ? 'border-v2-error-400 focus:border-v2-error-500 focus:ring-v2-error-500/10' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-v2-xs text-v2-error-500 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}
    </div>
  );
}

// ─── Select ─────────────────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, options, className = '', id, ...props }: SelectProps) {
  const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={selectId} className="block text-v2-sm font-medium text-v2-text-primary">{label}</label>}
      <div className="relative">
        <select
          id={selectId}
          className={`w-full appearance-none rounded-v2-lg border border-v2-border-light bg-white px-3.5 py-2.5 pr-10 text-v2-sm text-v2-text-primary
            focus:outline-none focus:border-v2-primary-500 focus:ring-2 focus:ring-v2-primary-500/10 transition-all ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-v2-neutral-400 pointer-events-none" />
      </div>
    </div>
  );
}

// ─── Textarea ───────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', id, ...props }: TextareaProps) {
  const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={textareaId} className="block text-v2-sm font-medium text-v2-text-primary">{label}</label>}
      <textarea
        id={textareaId}        className={`w-full rounded-v2-lg border border-v2-border-light bg-white px-3.5 py-2.5 text-v2-sm text-v2-text-primary
          placeholder:text-v2-neutral-400 focus:outline-none focus:border-v2-primary-500 focus:ring-2 focus:ring-v2-primary-500/10
          transition-all resize-y min-h-[80px] ${error ? 'border-v2-error-400' : ''} ${className}`}
        {...props}
      />
      {error && <p className="text-v2-xs text-v2-error-500 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}
    </div>
  );
}

// ─── Modal ──────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-v2-neutral-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-v2-2xl shadow-v2-xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto animate-in`}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-v2-border-light">
            <h2 className="text-v2-lg font-semibold text-v2-text-primary">{title}</h2>
            <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-v2-md hover:bg-v2-neutral-100 text-v2-neutral-400 transition-colors focus-visible:ring-2 focus-visible:ring-v2-primary-500/30">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Drawer ─────────────────────────────────────────────────────────────────

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function Drawer({ open, onClose, title, children }: DrawerProps) {
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-v2-neutral-900/40 backdrop-blur-sm" onClick={onClose} />}
      <div role="dialog" aria-modal="true" aria-label={title} className={`fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-v2-xl transition-transform duration-300 ease-out
        ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-v2-border-light">
            <h2 className="text-v2-lg font-semibold text-v2-text-primary">{title}</h2>
            <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-v2-md hover:bg-v2-neutral-100 text-v2-neutral-400 transition-colors focus-visible:ring-2 focus-visible:ring-v2-primary-500/30">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-6 overflow-y-auto h-full">{children}</div>
      </div>
    </>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────────

interface TabsProps {
  tabs: { id: string; label: string; icon?: React.ReactNode }[];
  active: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 p-1 rounded-v2-lg bg-v2-neutral-100 w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-v2-md text-v2-sm font-medium transition-all duration-150
            ${active === tab.id
              ? 'bg-white text-v2-text-primary shadow-v2-sm'
              : 'text-v2-text-tertiary hover:text-v2-text-secondary'}`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── EmptyState ─────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="w-14 h-14 rounded-v2-xl bg-v2-neutral-100 border border-v2-border-light flex items-center justify-center text-v2-neutral-400 mb-4">{icon}</div>}
      <h3 className="text-v2-base font-semibold text-v2-text-primary mb-1">{title}</h3>
      {description && <p className="text-v2-sm text-v2-text-tertiary max-w-sm mb-6">{description}</p>}
      {action}
    </div>
  );
}

// ─── ErrorState ─────────────────────────────────────────────────────────────

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Algo salio mal', message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="w-12 h-12 rounded-full bg-v2-error-50 border border-v2-error-200 flex items-center justify-center mb-4">
        <AlertCircle size={20} className="text-v2-error-500" />
      </div>
      <h3 className="text-v2-base font-semibold text-v2-text-primary mb-1">{title}</h3>
      <p className="text-v2-sm text-v2-text-tertiary max-w-sm mb-4">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Reintentar</Button>}
    </div>
  );
}

// ─── LoadingState ───────────────────────────────────────────────────────────

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Cargando...' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 size={24} className="animate-spin text-v2-primary-500 mb-3" />
      <p className="text-v2-sm text-v2-text-tertiary">{message}</p>
    </div>
  );
}

// ─── PageHeader ─────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div>
        <h1 className="text-v2-2xl font-bold text-v2-text-primary">{title}</h1>
        {subtitle && <p className="text-v2-sm text-v2-text-secondary mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── SectionHeader ──────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function SectionHeader({ title, subtitle, icon, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-3">
        {icon && <div className="w-8 h-8 rounded-v2-lg bg-v2-primary-50 border border-v2-primary-200 flex items-center justify-center text-v2-primary-600">{icon}</div>}
        <div>
          <h2 className="text-v2-base font-semibold text-v2-text-primary">{title}</h2>
          {subtitle && <p className="text-v2-xs text-v2-text-tertiary">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ─── ImpactBadge ────────────────────────────────────────────────────────────

import type { ImpactLevel } from '../../domain/types';

const impactStyles: Record<ImpactLevel, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-v2-error-50 border-v2-error-200', text: 'text-v2-error-600', label: 'Alto impacto' },
  medium: { bg: 'bg-v2-warning-50 border-v2-warning-200', text: 'text-v2-warning-600', label: 'Impacto medio' },
  low: { bg: 'bg-v2-neutral-100 border-v2-neutral-200', text: 'text-v2-neutral-600', label: 'Impacto bajo' },
};

export function ImpactBadge({ level }: { level: ImpactLevel }) {
  const s = impactStyles[level];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-v2-xs font-medium rounded-full border ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

// ─── ProgressIndicator ──────────────────────────────────────────────────────

interface ProgressIndicatorProps {
  completed: number;
  inProgress: number;
  total: number;
}

export function ProgressIndicator({ completed, inProgress, total }: ProgressIndicatorProps) {
  const pctCompleted = total > 0 ? (completed / total) * 100 : 0;
  const pctInProgress = total > 0 ? (inProgress / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-v2-xs">
        <span className="text-v2-text-secondary font-medium">{completed} de {total} completadas</span>
        <span className="text-v2-text-tertiary">{inProgress} en curso</span>
      </div>
      <div className="h-2 rounded-full bg-v2-neutral-100 overflow-hidden flex" role="progressbar" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={total} aria-label={`${completed} de ${total} completadas`}>
        <div className="h-full bg-v2-success-500 rounded-full transition-all duration-500" style={{ width: `${pctCompleted}%` }} />
        <div className="h-full bg-v2-warning-400 transition-all duration-500" style={{ width: `${pctInProgress}%` }} />
      </div>
    </div>
  );
}
