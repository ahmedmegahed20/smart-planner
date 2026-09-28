import { getDb } from '../db/connection';
import { nowIso, todayStr, addDays, startOfWeek, endOfWeek } from '../utils/date';
import { listTasks, createTask, getTask, createFromQuickCapture, updateTask } from './tasks';
import { listHabits, getHabitStats, createHabit } from './habits';
import { listGoals, getGoalProgress, createGoal, addGoalStep, listProjects } from './goals';
import { getSmartGoalStats, suggestSmartSteps } from './smartGoals';
import { listRoutines } from './routines';
import { getDailyStats, getWeekStats, detectInsights, getMonthStats, computeProductivityScore } from './analytics';
import { getFocusStats } from './life';
import { listMoodEntries } from './life';
import { getUser } from './settings';
import { emit } from './events';

interface Row { [key: string]: any; }

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface AiAction {
  id: string;
  kind: 'create_task' | 'complete_task' | 'reschedule_task' | 'create_habit' | 'create_goal' | 'create_goal_step' | 'note';
  label: string;
  payload: Record<string, unknown>;
}

export function getAiContext(): Record<string, unknown> {
  const db = getDb();
  const today = getDailyStats(todayStr(), listHabits());
  const week = getWeekStats(1);
  const month = getMonthStats(new Date().getFullYear(), new Date().getMonth() + 1);
  const goals = listGoals().map((g) => {
    const smart = g.isSmart ? getSmartGoalStats(g.id) : null;
    return {
      id: g.id,
      name: g.name,
      status: g.status,
      isSmart: g.isSmart,
      progress: smart ? smart.progressPct : getGoalProgress(g.id).pct,
      smart: smart
        ? {
            pct: smart.progressPct,
            current: smart.currentValue,
            target: smart.targetValue,
            unit: smart.displayUnit,
            remaining: smart.remaining,
            status: smart.status,
            daysLeft: smart.daysLeft,
            requiredDaily: smart.requiredDaily,
            requiredWeekly: smart.requiredWeekly,
            avgDaily: smart.avgDaily,
            avgWeekly: smart.avgWeekly,
            estimatedCompletionDate: smart.estimatedCompletionDate,
            weeklyDone: smart.stats.week,
            streak: smart.stats.currentStreak,
            contributions: smart.contributions,
            warnings: smart.warnings,
            linkedTasks: smart.links.tasks.items,
            linkedHabits: smart.links.habits.items,
          }
        : null,
    };
  });
  const projects = listProjects().map((p) => ({ id: p.id, name: p.name, status: p.status }));
  const habits = listHabits().map((h) => ({ id: h.id, name: h.name, category: h.category, stats: getHabitStats(h.id)?.completionRate ?? 0 }));
  const tasks = listTasks()
    .filter((t) => t.status !== 'completed')
    .slice(0, 100)
    .map((t) => ({ id: t.id, title: t.title, priority: t.priority, dueDate: t.dueDate, status: t.status, estimateMinutes: t.estimateMinutes }));
  const focus = getFocusStats(7);
  const insights = detectInsights();
  const mood = listMoodEntries().slice(-7);
  const score = computeProductivityScore({ tasks: 20, habits: 20, goals: 15, focus: 15, routines: 15, consistency: 15 });
  const profile = getUser();

  return {
    user: { name: profile?.name || 'Ahmed', workingHours: profile?.workingHours ?? 8 },
    today,
    week,
    month,
    goals,
    projects,
    habits,
    tasks,
    focus,
    insights,
    mood,
    score: score.score,
  };
}

export function analyzeRequest(query: string): { intent: string; response: string; actions: AiAction[] } {
  const ctx = getAiContext();
  const q = query.toLowerCase();
  const tasks = ctx.tasks as Array<Record<string, unknown>>;
  const goals = ctx.goals as Array<Record<string, unknown>>;
  const habits = ctx.habits as Array<Record<string, unknown>>;
  const db = getDb();

  if (/(plan|plan my day|daily plan|plan today)/.test(q)) {
    return planDay(ctx, q);
  }
  if (/(summarize|summary).*week|week.*summary/.test(q)) {
    const week = ctx.week as Record<string, unknown>;
    const response = `This week you completed ${week.completed} items (${week.pct}%), with ${week.focusMinutes} minutes of focus. Best day: ${(week.daily as any[]).toSorted((a, b) => b.pct - a.pct)[0]?.day ?? '—'} (${(week.daily as any[]).toSorted((a, b) => b.pct - a.pct)[0]?.pct ?? 0}%). You have ${tasks.length} open tasks.`;
    return { intent: 'week-summary', response, actions: [] };
  }
  if (/(summarize|summary).*month/.test(q)) {
    const month = ctx.month as Record<string, unknown>;
    const response = `This month: ${month.completed} items completed, ${month.missed} missed, ${month.focusMinutes} focus minutes. Overall ${month.pct}%. Your most consistent habit is "${(month.mostConsistent as any[])[0]?.habit?.name ?? '—'}" at ${(month.mostConsistent as any[])[0]?.rate ?? 0}%.`;
    return { intent: 'month-summary', response, actions: [] };
  }
  if (/(break down|breakdown|milestones).*(goal|project)/.test(q)) {
    const goalsList = ctx.goals as Array<Record<string, unknown>>;
    let target = goalsList[0];
    for (const g of goalsList) {
      if (g.name && q.includes(String(g.name).toLowerCase())) { target = g; break; }
    }
    if (target) {
      const stats = getSmartGoalStats(target.id as string);
      const sug = suggestSmartSteps(target.id as string);
      const milestones = sug.milestones.map((m) => ({
        title: typeof m === 'string' ? m : m.title,
        value: typeof m === 'string' ? undefined : m.value,
      }));
      const steps = stats && stats.milestones.items.length === 0 && milestones.length > 0
        ? milestones
        : sug.tasks.map((t) => ({ title: `${t.title} (${t.estimateMinutes ?? 60}m)`, value: undefined }));
      const actions: AiAction[] = steps.slice(0, 5).map((s) => ({
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: 'create_goal_step' as const,
        label: `Add milestone: ${s.title}`,
        payload: { goalId: target.id, title: s.title, value: s.value },
      }));
      return {
        intent: 'goal-breakdown',
        response: `I analyzed the goal "${target.name}" and propose ${steps.length} milestones. Review the action list below before applying.`,
        actions,
      };
    }
    return { intent: 'goal-breakdown', response: 'No active goals found to break down. Create a goal first.', actions: [] };
  }
  if (/(am i (behind|ahead|on track)|on track|goal.*(behind|ahead|pace|status)|(behind|ahead).*goal|catch up|estimated)/.test(q)) {
    const goalsList = ctx.goals as Array<Record<string, unknown>>;
    let g = goalsList.find((x) => x.isSmart);
    for (const x of goalsList) {
      if (x.name && q.includes(String(x.name).toLowerCase())) { g = x; break; }
    }
    if (!g) {
      return { intent: 'goal-status', response: 'No Smart Goal found for that. Smart status needs a goal with the SMART toggle enabled.', actions: [] };
    }
    const s = g.smart as Record<string, unknown>;
    const pace = s.requiredDaily ? `${round2(s.requiredDaily as number)}/day needed` : 'no deadline — pacing undefined';
    const est = s.estimatedCompletionDate ? `Estimated completion: ${s.estimatedCompletionDate}` : 'No estimate yet (no progress rate to project)';
    return {
      intent: 'goal-status',
      response: `"${g.name}" is ${String(s.status ?? g.status).replace('_', ' ')}. Progress ${s.pct}% (${s.current}/${s.target}), remaining ${s.remaining}, ${s.daysLeft ?? '—'} days left. ${pace}. ${est}.`,
      actions: [],
    };
  }
  if (/(next best action|what should i do|priority|prioritize)/.test(q)) {
    const open = tasks.filter((t) => t.status !== 'completed') as Array<{ dueDate?: string; priority?: string; title: string }>;
    open.sort((a, b) => {
      const pScore = (b.priority === 'p1' ? 4 : b.priority === 'p2' ? 3 : b.priority === 'p3' ? 2 : 1) - (a.priority === 'p1' ? 4 : a.priority === 'p2' ? 3 : a.priority === 'p3' ? 2 : 1);
      if (a.dueDate && b.dueDate) return pScore;
      return pScore;
    });
    const top = open[0];
    if (top) {
      return {
        intent: 'next-best-action',
        response: `Your next best action: "${top.title}". Priority ${top.priority?.toUpperCase() ?? 'P3'}, due ${top.dueDate ?? 'no due date'}. Consider starting a focus session on it.`,
        actions: [],
      };
    }
    return { intent: 'next-best-action', response: 'No open tasks. Create a task to get recommendations.', actions: [] };
  }
  if (/(create|add).*(task)/.test(q)) {
    const title = q.replace(/create|add|task|:|-/g, '').replace(/^[\s,]+/, '').trim();
    if (title) {
      const action = {
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: 'create_task' as const,
        label: `Create task: "${title}"`,
        payload: { title },
      };
      return {
        intent: 'create-task',
        response: `I can create a task: "${title}". Confirm to add it.`,
        actions: [action],
      };
    }
  }
  if (/(suggest|recommend).*(habit)/.test(q)) {
    const suggestions = [
      'Read for 20 minutes',
      'Practice a cybersecurity lab',
      'Exercise for 30 minutes',
      'Avoid social media for 2 hours',
      'Write a daily recap',
    ];
    return {
      intent: 'suggest-habits',
      response: `Based on typical goals, here are habits you could start: ${suggestions.join(', ')}. Let me know which to create.`,
      actions: suggestions.slice(0, 3).map((s) => ({
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: 'create_habit' as const,
        label: `Create habit: ${s}`,
        payload: { name: s },
      })),
    };
  }
  if (/(recover|behind|fallen behind|missed)/.test(q)) {
    const open = tasks.filter((t) => (t as any).dueDate && (t as any).dueDate < todayStr()) as Array<{ title: string; id: string }>;
    return {
      intent: 'recovery-plan',
      response: open.length
        ? `You have ${open.length} overdue task(s): ${open.map((t) => t.title).join(', ')}. I can move them to the next available days. Review the reschedule actions.`
        : `No overdue tasks right now. Nice work — keep the momentum.`,
      actions: open.slice(0, 5).map((t, i) => ({
        id: `ai-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        kind: 'reschedule_task' as const,
        label: `Move "${t.title}" to ${addDays(todayStr(), i + 1)}`,
        payload: { taskId: t.id, dueDate: addDays(todayStr(), i + 1) },
      })),
    };
  }
  if (/(analyze|productivity|how am i doing|score)/.test(q)) {
    return {
      intent: 'analysis',
      response: `Your productivity score is ${(ctx.score as any) ?? '—'}/100. Today: ${(ctx.today as any).pct}% completion. Weekly: ${(ctx.week as any).pct}%. You have ${tasks.length} open tasks across ${goals.length} active goals.`,
      actions: [],
    };
  }

  return {
    intent: 'general',
    response: `Here's your current status: ${(ctx.today as any).completed}/${(ctx.today as any).total} completed today (${(ctx.today as any).pct}%). ${(ctx.today as any).focusMinutes} focus minutes. ${tasks.length} open tasks. ${(ctx.insights as any[]).slice(0, 2).map((i) => i.text).join(' ')}`,
    actions: [],
  };
}

function planDay(ctx: Record<string, unknown>, query: string): { intent: string; response: string; actions: AiAction[] } {
  const tasks = ctx.tasks as Array<Record<string, unknown>>;
  const open = tasks.filter((t) => t.status !== 'completed');
  const actions: AiAction[] = [];
  const now = new Date();
  let cursor = 9; // start at 9am
  const capacity = (ctx.user as any)?.workingHours ?? 8;

  const pOrder: Record<string, number> = { p1: 0, p2: 1, p3: 2, p4: 3 };
  const sorted = [...open].sort((a, b) => {
    return (pOrder[(a.priority as string) || 'p3'] ?? 2) - (pOrder[(b.priority as string) || 'p3'] ?? 2);
  });

  let plannedCount = 0;
  const db = getDb();
  for (const t of sorted) {
    if (plannedCount >= capacity) break;
    const est = (t.estimateMinutes as number) ?? 45;
    const startH = cursor;
    cursor += Math.ceil(est / 60);
    const d = now.toISOString().slice(0, 10);
    actions.push({
      id: `ai-${Date.now()}-${plannedCount}-${Math.random().toString(36).slice(2, 7)}`,
      kind: 'reschedule_task',
      label: `Schedule "${t.title as string}" at ${startH}:00 (${est}m)`,
      payload: { taskId: t.id, dueDate: d, plannedStart: `${d}T${String(startH).padStart(2, '0')}:00`, plannedEnd: `${d}T${String(Math.min(23, Math.min(startH + Math.ceil(est / 60), 23))).padStart(2, '0')}:00` },
    });
    plannedCount++;
  }

  return {
    intent: 'plan-day',
    response: `I reviewed your ${open.length} open tasks and available capacity, and propose a plan of ${plannedCount} time-boxed blocks. Review and confirm the changes below.`,
    actions,
  };
}

export function executeAiActions(actions: AiAction[]): Array<{ action: string; result: string; ok: boolean }> {
  const results: Array<{ action: string; result: string; ok: boolean }> = [];
  for (const a of actions) {
    try {
      if (a.kind === 'create_task') {
        const title = String(a.payload.title ?? '');
        const t = createTask({
          title,
          goalId: (a.payload.goalId as string) || null,
          tags: String(a.payload.tags ?? ''),
          dueDate: (a.payload.dueDate as string) || null,
        });
        results.push({ action: a.label, result: `Created "${t.title}"`, ok: true });
      } else if (a.kind === 'reschedule_task') {
        const t = getTask(String(a.payload.taskId));
        if (!t) {
          results.push({ action: a.label, result: 'Task not found', ok: false });
          continue;
        }
        // Go through tasks.updateTask so history, calendar events, notifications,
        // and goal recomputation all fire exactly like a manual update.
        const patch: Record<string, unknown> = {
          dueDate: a.payload.dueDate ? String(a.payload.dueDate).slice(0, 10) : t.dueDate,
          plannedStart: a.payload.plannedStart ?? null,
          plannedEnd: a.payload.plannedEnd ?? null,
        };
        if (a.payload.dueTime != null) patch.dueTime = String(a.payload.dueTime);
        if (t.status === 'inbox') patch.status = 'planned';
        const updated = updateTask(t.id, patch as never);
        results.push({ action: a.label, result: updated ? `Rescheduled "${updated.title}"` : 'Rescheduled', ok: !!updated });
      } else if (a.kind === 'create_habit') {
        const name = String(a.payload.name ?? a.payload.title ?? '').trim();
        if (!name) {
          results.push({ action: a.label, result: 'No habit name provided', ok: false });
          continue;
        }
        const habit = createHabit({
          name,
          goalId: (a.payload.goalId as string) || null,
          goalContribution: a.payload.goalContribution != null ? Number(a.payload.goalContribution) : null,
          targetValue: a.payload.targetValue != null ? Number(a.payload.targetValue) : undefined,
          unit: (a.payload.unit as string) || '',
        });
        results.push({ action: a.label, result: `Created habit "${habit.name}"`, ok: true });
      } else if (a.kind === 'create_goal') {
        const title = String(a.payload.name ?? a.payload.title ?? '');
        if (title) {
          const goal = createGoal({ name: title, ...(a.payload as object) } as never);
          results.push({ action: a.label, result: `Created goal "${goal.name}"`, ok: true });
        } else {
          results.push({ action: a.label, result: 'No goal name provided', ok: false });
        }
      } else if (a.kind === 'create_goal_step') {
        const goalId = String(a.payload.goalId ?? '');
        const title = String(a.payload.title ?? '');
        if (goalId && title.trim()) {
          const step = addGoalStep(goalId, title.trim(), {
            value: a.payload.value != null ? Number(a.payload.value) : undefined,
          });
          results.push({ action: a.label, result: `Added milestone "${step.title}"${step.value > 0 ? ` (${step.value})` : ''}`, ok: true });
        } else {
          results.push({ action: a.label, result: 'Missing goal or milestone title', ok: false });
        }
      } else {
        results.push({ action: a.label, result: 'No-op', ok: true });
      }
      emit('data:changed', {});
    } catch (e) {
      results.push({ action: a.label, result: (e as Error).message, ok: false });
    }
  }
  return results;
}