import React, { useState } from 'react';
import { Task } from '../types';
import * as GameService from '../services/gameService';
import { audioService } from '../services/audioService';
import { CoinIcon, GemIcon, XPIcon } from './icons';
import CoinAnimation from './CoinAnimation';
import { neonIcon } from './visualAssets';

interface TaskItemProps {
  task: Task;
  onClaim: (task_id: string) => Promise<void>;
  claiming: boolean;
}

const TaskItem: React.FC<TaskItemProps> = ({ task, onClaim, claiming }) => {
  const progressPercent = Math.min(100, (task.progress / task.target) * 100);
  const isDaily = task.kind === 'daily';
  const isCompleted = task.progress >= task.target;
  const canClaim = isCompleted && !task.claimed;

  const borderColor = isDaily ? 'var(--ion-blue)' : 'var(--plasma-pink)';
  const progressColor = isDaily ? 'var(--ion-blue)' : 'var(--plasma-pink)';
  const progressGlow = isDaily ? 'progress-bar-glow-ion' : 'progress-bar-glow-plasma';

  const rewardChips = [
    task.reward?.xp
      ? {
          id: 'xp',
          icon: <XPIcon className="w-4 h-4" />, 
          color: 'var(--ion-blue)',
          text: `+${task.reward.xp} XP`,
        }
      : null,
    task.reward?.coins
      ? {
          id: 'coins',
          icon: <div style={{width: 16, height: 16}} className="flex items-center justify-center"><CoinAnimation width={16} height={16} /></div>, 
          color: 'var(--amber-warn)',
          text: `+${task.reward.coins} Coins`,
        }
      : null,
    task.reward?.gemstones
      ? {
          id: 'gemstones',
          icon: <GemIcon className="w-4 h-4" />,
          color: '#fda4af',
          text: `+${task.reward.gemstones} Gem${task.reward.gemstones === 1 ? '' : 's'}`,
        }
      : null,
  ].filter(Boolean) as { id: string; icon: React.ReactNode; color: string; text: string }[];
  
  return (
    <div className="bg-black/20 p-4 rounded-2xl border animate-fade-in-up" style={{ borderColor: `rgba(${isDaily ? '0, 208, 232' : '255, 45, 145'}, 0.4)` }}>
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-semibold text-gray-200">{task.title}</h4>
        <span className="text-sm font-mono" style={{ color: 'var(--mist-400)' }}>{task.progress}/{task.target}</span>
      </div>
      <div className="w-full bg-black/30 rounded-full h-1.5 mb-2">
        <div className={`h-1.5 rounded-full ${progressGlow} shimmer-effect`} style={{ width: `${progressPercent}%`, backgroundColor: progressColor }}></div>
      </div>
      <div className="flex justify-between items-center">
        <p className="text-xs" style={{ color: 'var(--amber-warn)' }}>{task.reward_preview}</p>
      </div>
      {rewardChips.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {rewardChips.map(chip => (
            <span
              key={chip.id}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-black/30 border border-white/10 text-xs font-mono"
              style={{ color: chip.color }}
            >
              {chip.icon}
              {chip.text}
            </span>
          ))}
        </div>
      )}
      <div className="flex justify-between items-center mt-3">
        {canClaim && (
          <button
            onClick={() => onClaim(task.id)}
            disabled={claiming}
            className="px-4 py-2 text-xs md:text-sm font-bold rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400 active:scale-95 transition-all disabled:opacity-50 min-h-[44px] touch-manipulation animate-pulse-glow"
          >
            {claiming ? 'Claiming...' : '✨ Claim'}
          </button>
        )}
        {task.claimed && (
          <span className="text-xs text-green-400 font-semibold">✓ Claimed</span>
        )}
      </div>
    </div>
  );
};

interface TaskListProps {
  tasks: Task[];
  onTasksUpdate: () => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const TaskList: React.FC<TaskListProps> = ({ tasks, onTasksUpdate, addToast }) => {
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);
  
  const dailyTasks = tasks.filter(t => t.kind === 'daily');
  const weeklyTasks = tasks.filter(t => t.kind === 'weekly');

  const handleClaim = async (task_id: string) => {
    if (claimingTaskId) return;
    const task = tasks.find((item) => item.id === task_id);
    if (!task) {
      addToast('Task not found. Refresh and try again.', 'error');
      return;
    }
    if (task.claimed) {
      addToast('Task already claimed.', 'warning');
      return;
    }

    setClaimingTaskId(task_id);
    try {
      const reward = await GameService.task_claim(task_id);
      audioService.play('tada');

      const rewardSummary = [
        reward.xp ? `${reward.xp} XP` : null,
        reward.coins ? `${reward.coins} Coins` : null,
        reward.gemstones ? `${reward.gemstones} Gems` : null,
      ].filter(Boolean).join(', ');
      addToast(rewardSummary ? `Task claimed: ${rewardSummary}.` : 'Task claimed successfully.', 'success');

      // Refresh tasks to show claimed status
      onTasksUpdate();
    } catch (error: any) {
      audioService.play('wrong');
      const message = error?.message || 'Failed to claim task.';
      if (/already claimed/i.test(message)) {
        addToast('Task already claimed.', 'warning');
      } else if (/not completed/i.test(message)) {
        addToast('Task is not complete yet.', 'info');
      } else {
        addToast(message, 'error');
      }
      console.error('Failed to claim task:', message);
    } finally {
      setClaimingTaskId(null);
    }
  };

  return (
    <div className="card-glass p-5">
      <div className="mb-6">
        <h3 className="font-heading text-xl mb-3 flex items-center gap-2" style={{ color: 'var(--ion-blue)' }}>
          <img src={neonIcon('reward_chest')} alt="" className="h-6 w-6 object-contain" />
          Daily Tasks
        </h3>
        <div className="space-y-3">
          {dailyTasks.map(task => (
            <TaskItem 
              key={task.id} 
              task={task} 
              onClaim={handleClaim} 
              claiming={claimingTaskId === task.id} 
            />
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-heading text-xl mb-3 flex items-center gap-2" style={{ color: 'var(--plasma-pink)' }}>
          <img src={neonIcon('quest')} alt="" className="h-6 w-6 object-contain" />
          Weekly Tasks
        </h3>
        <div className="space-y-3">
          {weeklyTasks.map(task => (
            <TaskItem 
              key={task.id} 
              task={task} 
              onClaim={handleClaim} 
              claiming={claimingTaskId === task.id} 
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TaskList;
