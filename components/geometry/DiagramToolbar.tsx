import React from 'react';
import { DiagramTool } from './types';

interface ToolbarProps {
  activeTool: DiagramTool;
  onToolChange: (tool: DiagramTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClear: () => void;
}

const tools: { id: DiagramTool; icon: string; label: string }[] = [
  { id: 'select', icon: '👆', label: 'Select' },
  { id: 'line', icon: '📏', label: 'Line' },
  { id: 'arrow', icon: '➡️', label: 'Arrow' },
  { id: 'angle', icon: '📐', label: 'Angle' },
  { id: 'circle', icon: '⭕', label: 'Circle' },
  { id: 'point', icon: '•', label: 'Point' },
  { id: 'text', icon: 'T', label: 'Text' },
  { id: 'blank', icon: '▢', label: 'Blank' },
  { id: 'delete', icon: '🗑️', label: 'Delete' },
];

const DiagramToolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onToolChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear
}) => {
  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-900/80 border border-gray-700 rounded-xl">
      <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Tools</div>
      
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onToolChange(tool.id)}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
            ${activeTool === tool.id
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
              : 'bg-gray-800/50 text-gray-300 border border-transparent hover:bg-gray-700/50 hover:text-white'
            }
          `}
          title={tool.label}
        >
          <span className="text-lg w-6 text-center">{tool.icon}</span>
          <span>{tool.label}</span>
        </button>
      ))}

      <div className="border-t border-gray-700 my-2 pt-2">
        <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Actions</div>
        
        <div className="flex gap-2">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`
              flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all
              ${canUndo
                ? 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 hover:text-white'
                : 'bg-gray-800/30 text-gray-600 cursor-not-allowed'
              }
            `}
            title="Undo"
          >
            ↩️
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`
              flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all
              ${canRedo
                ? 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 hover:text-white'
                : 'bg-gray-800/30 text-gray-600 cursor-not-allowed'
              }
            `}
            title="Redo"
          >
            ↪️
          </button>
        </div>
        
        <button
          onClick={onClear}
          className="w-full mt-2 px-3 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-all"
        >
          🗑️ Clear All
        </button>
      </div>

      <div className="border-t border-gray-700 mt-2 pt-2">
        <div className="text-xs text-gray-500">
          <p className="mb-1">💡 Tips:</p>
          <ul className="space-y-0.5 text-[10px]">
            <li>• Click & drag to draw</li>
            <li>• Double-click text to edit</li>
            <li>• Use Blank for answer fields</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DiagramToolbar;
