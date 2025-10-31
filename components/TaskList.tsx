import React, { useState } from 'react';
import { Task } from '../types';
import * as GameService from '../services/gameService';
import { audioService } from '../services/audioService';

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
  
  return (
    <div className="bg-black/20 p-4 rounded-2xl border" style={{ borderColor: `rgba(${isDaily ? '0, 208, 232' : '255, 45, 145'}, 0.4)` }}>
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-semibold text-gray-200">{task.title}</h4>
        <span className="text-sm font-mono" style={{ color: 'var(--mist-400)' }}>{task.progress}/{task.target}</span>
      </div>
      <div className="w-full bg-black/30 rounded-full h-1.5 mb-2">
        <div className={`h-1.5 rounded-full ${progressGlow}`} style={{ width: `${progressPercent}%`, backgroundColor: progressColor }}></div>
      </div>
      <div className="flex justify-between items-center">
        <p className="text-xs" style={{ color: 'var(--amber-warn)' }}>{task.reward_preview}</p>
        {canClaim && (
          <button
            onClick={() => onClaim(task.id)}
            disabled={claiming}
            className="px-4 py-2 text-xs md:text-sm font-bold rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400 active:scale-95 transition-all disabled:opacity-50 min-h-[44px] touch-manipulation"
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
}

const TaskList: React.FC<TaskListProps> = ({ tasks, onTasksUpdate }) => {
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);
  
  const dailyTasks = tasks.filter(t => t.kind === 'daily');
  const weeklyTasks = tasks.filter(t => t.kind === 'weekly');

  const handleClaim = async (task_id: string) => {
    setClaimingTaskId(task_id);
    try {
      const reward = await GameService.task_claim(task_id);
      audioService.play('tada');
      
      // Show toast or reward modal here (would need to pass addToast from parent)
      console.log('Claimed reward:', reward);
      
      // Refresh tasks to show claimed status
      onTasksUpdate();
    } catch (error: any) {
      audioService.play('wrong');
      console.error('Failed to claim task:', error.message);
    } finally {
      setClaimingTaskId(null);
    }
  };

  return (
    <div className="card-glass p-5">
      <div className="mb-6">
        <h3 className="font-heading text-xl mb-3" style={{ color: 'var(--ion-blue)' }}>Daily Tasks</h3>
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
        <h3 className="font-heading text-xl mb-3" style={{ color: 'var(--plasma-pink)' }}>Weekly Tasks</h3>
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
