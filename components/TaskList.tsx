import React from 'react';
import { Task } from '../types';

interface TaskItemProps {
  task: Task;
}

const TaskItem: React.FC<TaskItemProps> = ({ task }) => {
  const progressPercent = Math.min(100, (task.progress / task.target) * 100);
  const isDaily = task.kind === 'daily';
  
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
      <p className="text-xs" style={{ color: 'var(--amber-warn)' }}>{task.reward_preview}</p>
    </div>
  );
};

interface TaskListProps {
  tasks: Task[];
}

const TaskList: React.FC<TaskListProps> = ({ tasks }) => {
  const dailyTasks = tasks.filter(t => t.kind === 'daily');
  const weeklyTasks = tasks.filter(t => t.kind === 'weekly');

  return (
    <div className="card-glass p-5">
      <div className="mb-6">
        <h3 className="font-heading text-xl mb-3" style={{ color: 'var(--ion-blue)' }}>Daily Tasks</h3>
        <div className="space-y-3">
          {dailyTasks.map(task => <TaskItem key={task.id} task={task} />)}
        </div>
      </div>
      <div>
        <h3 className="font-heading text-xl mb-3" style={{ color: 'var(--plasma-pink)' }}>Weekly Tasks</h3>
        <div className="space-y-3">
          {weeklyTasks.map(task => <TaskItem key={task.id} task={task} />)}
        </div>
      </div>
    </div>
  );
};

export default TaskList;
