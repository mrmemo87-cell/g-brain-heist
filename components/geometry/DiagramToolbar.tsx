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
  onDeleteSelected?: () => void;
  onExportImage?: () => void;
  onPrintImage?: () => void;
  hasSelection?: boolean;
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
  { id: 'delete', icon: '🗑️', label: 'Delete Mode' },
];

const DiagramToolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onToolChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
  onDeleteSelected,
  onExportImage,
  onPrintImage,
  hasSelection = false
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
        
        {/* Delete Selected Button */}
        {onDeleteSelected && (
          <button
            onClick={onDeleteSelected}
            disabled={!hasSelection}
            className={`
              w-full mb-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
              ${hasSelection
                ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30'
                : 'bg-gray-800/30 text-gray-600 cursor-not-allowed border border-transparent'
              }
            `}
            title={hasSelection ? 'Delete selected item' : 'Select an item first'}
          >
            🗑️ Delete Selected
          </button>
        )}
        
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
            <li>• Drag box to multi-select</li>
            <li>• Shift+click to add more</li>
            <li>• Double-click text to edit</li>
          </ul>
        </div>
      </div>

      {/* Export Image Button */}
      {onExportImage && (
        <div className="border-t border-gray-700 mt-2 pt-2">
          <button
            onClick={onExportImage}
            className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30 transition-all"
            title="Export diagram as a high-resolution PNG image"
          >
            Export high-resolution PNG
          </button>
          {onPrintImage ? <button type="button" onClick={onPrintImage} className="mt-2 w-full px-3 py-2 rounded-lg text-sm font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 hover:bg-cyan-500/30 transition-all">Print diagram sheet</button> : null}
          <p className="text-[10px] text-gray-500 mt-1 text-center">
            Page-safe classroom output
          </p>
        </div>
      )}
    </div>
  );
};

export default DiagramToolbar;
