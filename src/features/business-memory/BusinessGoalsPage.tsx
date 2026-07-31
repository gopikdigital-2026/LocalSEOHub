import { useState } from 'react';
import type { GoalId, SelectedGoal } from './types';
import { AVAILABLE_GOALS, registerGoalSet } from './engine';
import { createLocalRepository } from './repository';
import { Button } from '../../components/ui';
import { trackGoalCreated } from '../../services/analytics/v2Analytics';
import {
  Check,
  Phone,
  Star,
  MapPin,
  CalendarCheck,
  Globe,
  Users,
  Shield,
  Target,
} from 'lucide-react';

const repo = createLocalRepository();

const ICON_MAP: Record<string, React.ReactNode> = {
  Phone: <Phone size={18} />,
  Star: <Star size={18} />,
  MapPin: <MapPin size={18} />,
  CalendarCheck: <CalendarCheck size={18} />,
  Globe: <Globe size={18} />,
  Users: <Users size={18} />,
  Shield: <Shield size={18} />,
};

export default function BusinessGoalsPage() {
  const initialGoals = repo.load().goals;
  const [selected, setSelected] = useState<GoalId[]>(initialGoals.map((g) => g.goalId));
  const [saved, setSaved] = useState(false);

  function toggleGoal(goalId: GoalId) {
    setSelected((prev) => {
      if (prev.includes(goalId)) return prev.filter((id) => id !== goalId);
      if (prev.length >= 3) return prev;
      return [...prev, goalId];
    });
    setSaved(false);
  }

  function handleSave() {
    const goals: SelectedGoal[] = selected.map((goalId) => ({
      goalId,
      selectedAt: new Date().toISOString(),
    }));
    repo.setGoals(goals);
    selected.forEach((goalId) => {
      const goal = AVAILABLE_GOALS.find((g) => g.id === goalId);
      if (goal) {
        registerGoalSet(repo, goalId, goal.label);
        trackGoalCreated(goalId);
      }
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-8">
      <div>
        <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">
          Tus objetivos
        </h1>
        <p className="text-v2-sm text-v2-text-secondary mt-2 leading-relaxed">
          Selecciona hasta tres objetivos. Las recomendaciones se priorizaran para ayudarte a alcanzarlos.
        </p>
      </div>

      {/* Selection counter */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-v2-primary-500" />
          <span className="text-v2-sm font-semibold text-v2-text-primary">{selected.length} de 3</span>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`w-8 h-1.5 rounded-full transition-colors ${i < selected.length ? 'bg-v2-primary-500' : 'bg-v2-neutral-100'}`} />
          ))}
        </div>
      </div>

      {/* Goals grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {AVAILABLE_GOALS.map((goal) => {
          const isSelected = selected.includes(goal.id);
          const isDisabled = !isSelected && selected.length >= 3;

          return (
            <button
              key={goal.id}
              onClick={() => toggleGoal(goal.id)}
              disabled={isDisabled}
              className={`relative text-left rounded-v2-xl border p-5 transition-all duration-200
                ${isSelected
                  ? 'border-v2-primary-400 bg-v2-primary-50/50 ring-1 ring-v2-primary-200'
                  : isDisabled
                    ? 'border-v2-border-light bg-v2-neutral-50 opacity-50 cursor-not-allowed'
                    : 'border-v2-border-light bg-white hover:border-v2-primary-200 hover:bg-v2-primary-50/20'}`}
            >
              {isSelected && (
                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-v2-primary-500 flex items-center justify-center">
                  <Check size={13} className="text-white" />
                </div>
              )}
              <div className={`w-10 h-10 rounded-v2-lg flex items-center justify-center mb-3 ${isSelected ? 'bg-v2-primary-100 text-v2-primary-600' : 'bg-v2-neutral-100 text-v2-neutral-500'}`}>
                {ICON_MAP[goal.icon] ?? <Target size={18} />}
              </div>
              <h3 className="text-v2-sm font-semibold text-v2-text-primary mb-1">{goal.label}</h3>
              <p className="text-v2-xs text-v2-text-tertiary leading-relaxed">{goal.description}</p>
            </button>
          );
        })}
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={selected.length === 0} icon={saved ? <Check size={16} /> : undefined}>
          {saved ? 'Guardado' : 'Guardar objetivos'}
        </Button>
        {saved && <span className="text-v2-xs text-v2-success-600 font-medium">Objetivos actualizados</span>}
      </div>
    </div>
  );
}
