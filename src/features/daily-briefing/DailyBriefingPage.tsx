import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { DataStatusBadge } from '../../components/data-status';
import { Badge, Button } from '../../components/ui';
import {
  trackDailyBriefingView,
  trackRecommendationExecute,
  trackQuickActionClick,
  trackTomorrowPreviewView,
} from '../../services/analytics/v2Analytics';
import { getDailyGoal, getDailyActions } from './engine';
import { demoRecommendations, demoDailyBriefing } from '../../app-v2/demo/demoData';
import type { Recommendation, ImpactLevel, ConfidenceLevel } from '../../domain/types';
import {
  ArrowRight,
  Check,
  Clock,
  FileText,
  Info,
  MessageSquare,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Calendar,
  Wifi,
} from 'lucide-react';

// ─── Demo Mode Banner ───────────────────────────────────────────────────────

function DemoModeBanner() {
  return (
    <div className="flex items-start gap-3 rounded-v2-xl border border-v2-warning-200 bg-v2-warning-50/50 px-4 py-3">
      <Info size={15} className="text-v2-warning-500 mt-0.5 shrink-0" />
      <div>
        <p className="text-v2-sm font-medium text-v2-text-primary">Modo demostracion</p>
        <p className="text-v2-xs text-v2-text-secondary leading-relaxed mt-0.5">
          Estas viendo datos de ejemplo. Completa acciones reales o conecta fuentes para ver recomendaciones basadas en tu negocio.
        </p>
      </div>
    </div>
  );
}

// ─── Quick Action Bar ───────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { id: 'publish', label: 'Nueva publicacion', icon: <FileText size={16} />, route: '/app-v2/plan', available: true },
  { id: 'reviews', label: 'Responder resenas', icon: <MessageSquare size={16} />, route: null, available: false, reason: 'Conecta Google Business para responder resenas.' },
  { id: 'analyze', label: 'Analizar negocio', icon: <Search size={16} />, route: '/app-v2/fuentes', available: true },
  { id: 'content', label: 'Crear contenido', icon: <Sparkles size={16} />, route: '/app-v2/plan', available: true },
];

function QuickActionBar() {
  const navigate = useNavigate();
  const [tooltip, setTooltip] = useState<string | null>(null);

  return (
    <div className="relative">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => {
              trackQuickActionClick(action.id);
              if (action.available && action.route) {
                navigate(action.route);
              } else if (!action.available) {
                setTooltip(action.reason ?? null);
                setTimeout(() => setTooltip(null), 3000);
              }
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-v2-lg border
              text-v2-sm font-medium whitespace-nowrap shrink-0 transition-all duration-150
              ${action.available
                ? 'border-v2-border-light bg-white text-v2-text-secondary hover:text-v2-text-primary hover:border-v2-primary-300 hover:bg-v2-primary-50/50'
                : 'border-v2-border-light bg-v2-neutral-50 text-v2-text-tertiary'
              }`}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
      {tooltip && (
        <div className="absolute top-full left-0 right-0 mt-2 px-4 py-2.5 rounded-v2-lg bg-v2-neutral-800 text-white text-v2-xs shadow-v2-lg z-10 animate-in">
          <div className="flex items-center gap-2">
            <Wifi size={12} className="text-v2-warning-400 shrink-0" />
            {tooltip}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Daily Goal Card ────────────────────────────────────────────────────────

function DailyGoalCard({ goal }: { goal: Recommendation }) {
  return (
    <div className="relative overflow-hidden rounded-v2-xl bg-gradient-to-br from-v2-primary-600 to-v2-primary-700 p-6 sm:p-8">
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <Target size={14} className="text-v2-primary-200" />
          <span className="text-v2-xs font-semibold text-v2-primary-200 uppercase tracking-wider">
            Objetivo del dia
          </span>
        </div>
        <h2 className="text-v2-xl sm:text-v2-2xl font-bold text-white mb-2 leading-tight">
          {goal.title}
        </h2>
        <p className="text-v2-sm text-v2-primary-100 leading-relaxed max-w-lg">
          {goal.reason}
        </p>
        <div className="flex items-center gap-4 mt-5">
          <span className="flex items-center gap-1.5 text-v2-xs text-v2-primary-200">
            <Clock size={12} />
            ~{goal.estimatedTimeMinutes} min
          </span>
          <DataStatusBadge confidence={goal.confidence} className="!bg-white/10 !text-white !border-white/20" />
        </div>
      </div>
      <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5" />
      <div className="absolute -right-4 -bottom-12 w-32 h-32 rounded-full bg-white/5" />
    </div>
  );
}

// ─── Recommendation Card ────────────────────────────────────────────────────

function ImpactIndicator({ level }: { level: ImpactLevel }) {
  const config = {
    high: { color: 'text-v2-error-500', bg: 'bg-v2-error-500', label: 'Alto' },
    medium: { color: 'text-v2-warning-500', bg: 'bg-v2-warning-400', label: 'Medio' },
    low: { color: 'text-v2-neutral-400', bg: 'bg-v2-neutral-300', label: 'Bajo' },
  };
  const c = config[level];
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${c.bg}`} />
      <span className={`text-v2-xs font-medium ${c.color}`}>{c.label} impacto</span>
    </div>
  );
}

function ConfidenceLabel({ confidence }: { confidence: ConfidenceLevel }) {
  const labels = { verified: 'Dato verificado', estimated: 'Estimacion', demo: 'Ejemplo demostrativo' };
  const styles = {
    verified: 'text-v2-success-600',
    estimated: 'text-v2-warning-600',
    demo: 'text-v2-neutral-500',
  };
  return (
    <span className={`text-v2-xs ${styles[confidence]}`}>{labels[confidence]}</span>
  );
}

interface RecommendationCardProps {
  rec: Recommendation;
  onExecute: (id: string) => void;
}

function RecommendationCard({ rec, onExecute }: RecommendationCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="group rounded-v2-xl border border-v2-border-light bg-white hover:border-v2-primary-200 transition-all duration-200">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h3 className="text-v2-base font-semibold text-v2-text-primary leading-snug">
            {rec.title}
          </h3>
          <ImpactIndicator level={rec.impact} />
        </div>

        <p className="text-v2-sm text-v2-text-secondary leading-relaxed mb-4">
          {rec.summary}
        </p>

        {expanded && (
          <div className="mb-4 pl-4 border-l-2 border-v2-primary-200 animate-in">
            <p className="text-v2-xs font-medium text-v2-text-secondary mb-1">Te recomendamos esta accion porque:</p>
            <p className="text-v2-sm text-v2-text-secondary leading-relaxed">{rec.explanation}</p>
          </div>
        )}

        <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mb-5">
          <span className="flex items-center gap-1.5 text-v2-xs text-v2-text-tertiary">
            <Clock size={12} />
            {rec.estimatedTimeMinutes} min
          </span>
          <span className="text-v2-xs text-v2-text-tertiary">
            {rec.source}
          </span>
          <ConfidenceLabel confidence={rec.confidence} />
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => onExecute(rec.id)}
            icon={<ArrowRight size={14} />}
          >
            Empezar
          </Button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-v2-xs font-medium text-v2-text-tertiary hover:text-v2-primary-600 transition-colors"
          >
            {expanded ? 'Menos detalle' : 'Por que es importante'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Weekly Progress Card ───────────────────────────────────────────────────

function WeeklyProgressCard({ completed, total }: { completed: number; total: number }) {
  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={15} className="text-v2-primary-500" />
          <span className="text-v2-sm font-semibold text-v2-text-primary">Plan semanal</span>
        </div>
        <span className="text-v2-xs text-v2-text-tertiary">Datos de ejemplo</span>
      </div>

      <div className="flex gap-1 mb-3">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-2.5 flex-1 rounded-full transition-colors duration-300 ${
              i < completed ? 'bg-v2-primary-500' : 'bg-v2-neutral-100'
            }`}
          />
        ))}
      </div>

      <p className="text-v2-sm text-v2-text-secondary">
        <span className="font-semibold text-v2-text-primary">{completed}</span> de {total} acciones
      </p>
    </div>
  );
}

// ─── Completed Today Card ───────────────────────────────────────────────────

function CompletedTodayCard({ count, timeMinutes }: { count: number; timeMinutes: number }) {
  if (count === 0) return null;

  return (
    <div className="rounded-v2-xl border border-v2-success-200 bg-v2-success-50/50 p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-v2-success-100 flex items-center justify-center">
          <Check size={18} className="text-v2-success-600" />
        </div>
        <div>
          <p className="text-v2-sm font-semibold text-v2-text-primary">
            {count} {count === 1 ? 'accion completada' : 'acciones completadas'} hoy
          </p>
          <p className="text-v2-xs text-v2-text-tertiary">
            {timeMinutes} min invertidos
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Tomorrow Preview Card ──────────────────────────────────────────────────

function TomorrowPreviewCard({ topics }: { topics: string[] }) {
  useEffect(() => {
    trackTomorrowPreviewView();
  }, []);

  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Calendar size={15} className="text-v2-neutral-400" />
        <span className="text-v2-sm font-semibold text-v2-text-primary">Manana trabajaremos en</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {topics.map((topic) => (
          <Badge key={topic} variant="neutral">{topic}</Badge>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function DailyBriefingPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const userName = session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Usuario';

  const dailyGoal = getDailyGoal(demoRecommendations);
  const dailyActions = getDailyActions(demoRecommendations, 3);
  const { weeklyProgress, tomorrowTopics, completedToday, timeInvestedMinutes } = demoDailyBriefing;

  useEffect(() => {
    trackDailyBriefingView();
  }, []);

  function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos dias';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  }

  function handleExecute(id: string) {
    trackRecommendationExecute(id, 'demo');
    navigate(`/app-v2/ejecutar/${id}`);
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-8">
      {/* Greeting */}
      <div>
        <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">
          {getGreeting()}, {userName}.
        </h1>
        <p className="text-v2-sm sm:text-v2-base text-v2-text-secondary mt-2 leading-relaxed">
          Te recomendamos una accion para avanzar hoy con tu negocio.
        </p>
      </div>

      {/* Demo Mode Banner */}
      <DemoModeBanner />

      {/* Quick Actions */}
      <QuickActionBar />

      {/* Daily Goal */}
      {dailyGoal && <DailyGoalCard goal={dailyGoal} />}

      {/* Completed today */}
      <CompletedTodayCard count={completedToday} timeMinutes={timeInvestedMinutes} />

      {/* Priority Actions */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-v2-base font-semibold text-v2-text-primary">Acciones prioritarias</h2>
          <DataStatusBadge confidence="demo" />
        </div>
        <div className="space-y-3">
          {dailyActions.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} onExecute={handleExecute} />
          ))}
        </div>
      </section>

      {/* Weekly Progress */}
      <WeeklyProgressCard completed={weeklyProgress.completed} total={weeklyProgress.total} />

      {/* Tomorrow Preview */}
      <TomorrowPreviewCard topics={tomorrowTopics} />
    </div>
  );
}
