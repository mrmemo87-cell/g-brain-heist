import React, { useState } from 'react';
import { DiagramShape } from './KonvaCanvasEditor';
import { generateShapeId } from './geometryService';

interface ShapesLibraryProps {
  onAddShape: (shapes: DiagramShape[]) => void;
  onAddSymbol: (symbol: string) => void;
}

// Math symbols organized by category
const MATH_SYMBOLS = {
  greek: ['α', 'β', 'γ', 'δ', 'θ', 'λ', 'μ', 'π', 'σ', 'φ', 'ω', 'Δ', 'Σ', 'Ω'],
  operators: ['+', '−', '×', '÷', '±', '∓', '·', '∘', '√', '∛', '∜'],
  relations: ['=', '≠', '≈', '≡', '<', '>', '≤', '≥', '≪', '≫', '∝', '∼'],
  geometry: ['∠', '∟', '⊥', '∥', '≅', '∼', '△', '□', '○', '⊙', '⌀', '∆'],
  arrows: ['→', '←', '↔', '⇒', '⇐', '⇔', '↑', '↓', '↗', '↘'],
  sets: ['∈', '∉', '⊂', '⊃', '⊆', '⊇', '∪', '∩', '∅', '∞'],
  calculus: ['∫', '∬', '∮', '∂', '∇', 'ⁿ', '∑', '∏', 'lim', '∞'],
  fractions: ['½', '⅓', '¼', '⅔', '¾', '⅛', '⅜', '⅝', '⅞'],
  superscript: ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', 'ⁿ', 'ˣ', 'ʸ'],
  subscript: ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉', 'ₙ', 'ₓ'],
};

const SYMBOL_CATEGORIES = [
  { id: 'greek', name: 'Greek', icon: 'α' },
  { id: 'geometry', name: 'Geometry', icon: '∠' },
  { id: 'operators', name: 'Operators', icon: '±' },
  { id: 'relations', name: 'Relations', icon: '≤' },
  { id: 'arrows', name: 'Arrows', icon: '→' },
  { id: 'superscript', name: 'Powers', icon: 'x²' },
  { id: 'subscript', name: 'Subscript', icon: 'x₁' },
  { id: 'fractions', name: 'Fractions', icon: '½' },
  { id: 'calculus', name: 'Calculus', icon: '∫' },
  { id: 'sets', name: 'Sets', icon: '∈' },
];

// Predefined shape templates
const SHAPE_TEMPLATES = {
  triangle: {
    name: 'Triangle',
    icon: '△',
    category: 'shapes',
    create: (cx: number, cy: number): DiagramShape[] => {
      const size = 80;
      return [{
        id: generateShapeId('triangle'),
        type: 'line',
        points: [cx, cy - size/2, cx - size/2, cy + size/2, cx + size/2, cy + size/2, cx, cy - size/2],
        stroke: '#22d3ee',
        strokeWidth: 3,
      }];
    }
  },
  rightTriangle: {
    name: 'Right △',
    icon: '⌐',
    category: 'shapes',
    create: (cx: number, cy: number): DiagramShape[] => {
      const size = 80;
      return [
        {
          id: generateShapeId('rtri'),
          type: 'line',
          points: [cx - size/2, cy + size/2, cx + size/2, cy + size/2, cx - size/2, cy - size/2, cx - size/2, cy + size/2],
          stroke: '#22d3ee',
          strokeWidth: 3,
        },
        {
          id: generateShapeId('mark'),
          type: 'line',
          points: [cx - size/2 + 12, cy + size/2, cx - size/2 + 12, cy + size/2 - 12, cx - size/2, cy + size/2 - 12],
          stroke: '#22d3ee',
          strokeWidth: 2,
        }
      ];
    }
  },
  square: {
    name: 'Square',
    icon: '□',
    category: 'shapes',
    create: (cx: number, cy: number): DiagramShape[] => {
      const s = 70;
      return [{
        id: generateShapeId('sq'),
        type: 'line',
        points: [cx-s/2, cy-s/2, cx+s/2, cy-s/2, cx+s/2, cy+s/2, cx-s/2, cy+s/2, cx-s/2, cy-s/2],
        stroke: '#22d3ee',
        strokeWidth: 3,
      }];
    }
  },
  rectangle: {
    name: 'Rectangle',
    icon: '▭',
    category: 'shapes',
    create: (cx: number, cy: number): DiagramShape[] => {
      const w = 100, h = 60;
      return [{
        id: generateShapeId('rect'),
        type: 'line',
        points: [cx-w/2, cy-h/2, cx+w/2, cy-h/2, cx+w/2, cy+h/2, cx-w/2, cy+h/2, cx-w/2, cy-h/2],
        stroke: '#22d3ee',
        strokeWidth: 3,
      }];
    }
  },
  parallelogram: {
    name: 'Parallelogram',
    icon: '▱',
    category: 'shapes',
    create: (cx: number, cy: number): DiagramShape[] => {
      const w = 100, h = 50, sk = 25;
      return [{
        id: generateShapeId('para'),
        type: 'line',
        points: [cx-w/2+sk, cy-h/2, cx+w/2+sk, cy-h/2, cx+w/2-sk, cy+h/2, cx-w/2-sk, cy+h/2, cx-w/2+sk, cy-h/2],
        stroke: '#22d3ee',
        strokeWidth: 3,
      }];
    }
  },
  trapezoid: {
    name: 'Trapezoid',
    icon: '⏢',
    category: 'shapes',
    create: (cx: number, cy: number): DiagramShape[] => {
      return [{
        id: generateShapeId('trap'),
        type: 'line',
        points: [cx-30, cy-35, cx+30, cy-35, cx+50, cy+35, cx-50, cy+35, cx-30, cy-35],
        stroke: '#22d3ee',
        strokeWidth: 3,
      }];
    }
  },
  rhombus: {
    name: 'Rhombus',
    icon: '◇',
    category: 'shapes',
    create: (cx: number, cy: number): DiagramShape[] => {
      return [{
        id: generateShapeId('rhom'),
        type: 'line',
        points: [cx, cy-45, cx+35, cy, cx, cy+45, cx-35, cy, cx, cy-45],
        stroke: '#22d3ee',
        strokeWidth: 3,
      }];
    }
  },
  pentagon: {
    name: 'Pentagon',
    icon: '⬠',
    category: 'shapes',
    create: (cx: number, cy: number): DiagramShape[] => {
      const r = 45, pts: number[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i * 72 - 90) * Math.PI / 180;
        pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      pts.push(pts[0], pts[1]);
      return [{ id: generateShapeId('pent'), type: 'line', points: pts, stroke: '#22d3ee', strokeWidth: 3 }];
    }
  },
  hexagon: {
    name: 'Hexagon',
    icon: '⬡',
    category: 'shapes',
    create: (cx: number, cy: number): DiagramShape[] => {
      const r = 40, pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i * 60 - 90) * Math.PI / 180;
        pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      pts.push(pts[0], pts[1]);
      return [{ id: generateShapeId('hex'), type: 'line', points: pts, stroke: '#22d3ee', strokeWidth: 3 }];
    }
  },
  // Angles
  angleAcute: {
    name: '45°',
    icon: '∠',
    category: 'angles',
    create: (cx: number, cy: number): DiagramShape[] => {
      const len = 80;
      return [
        { id: generateShapeId('a1'), type: 'line', points: [cx, cy, cx + len, cy], stroke: '#f472b6', strokeWidth: 3 },
        { id: generateShapeId('a2'), type: 'line', points: [cx, cy, cx + len * 0.707, cy - len * 0.707], stroke: '#f472b6', strokeWidth: 3 },
        { id: generateShapeId('lbl'), type: 'text', x: cx + 20, y: cy - 15, text: '45°', fontSize: 14, fill: '#fbbf24' }
      ];
    }
  },
  angleRight: {
    name: '90°',
    icon: '∟',
    category: 'angles',
    create: (cx: number, cy: number): DiagramShape[] => {
      const len = 80;
      return [
        { id: generateShapeId('r1'), type: 'line', points: [cx, cy, cx + len, cy], stroke: '#f472b6', strokeWidth: 3 },
        { id: generateShapeId('r2'), type: 'line', points: [cx, cy, cx, cy - len], stroke: '#f472b6', strokeWidth: 3 },
        { id: generateShapeId('sq'), type: 'line', points: [cx + 12, cy, cx + 12, cy - 12, cx, cy - 12], stroke: '#f472b6', strokeWidth: 2 },
        { id: generateShapeId('lbl'), type: 'text', x: cx + 18, y: cy - 25, text: '90°', fontSize: 14, fill: '#fbbf24' }
      ];
    }
  },
  angleObtuse: {
    name: '120°',
    icon: '⦦',
    category: 'angles',
    create: (cx: number, cy: number): DiagramShape[] => {
      const len = 80;
      return [
        { id: generateShapeId('o1'), type: 'line', points: [cx, cy, cx + len, cy], stroke: '#f472b6', strokeWidth: 3 },
        { id: generateShapeId('o2'), type: 'line', points: [cx, cy, cx - len * 0.5, cy - len * 0.866], stroke: '#f472b6', strokeWidth: 3 },
        { id: generateShapeId('lbl'), type: 'text', x: cx + 10, y: cy - 30, text: '120°', fontSize: 14, fill: '#fbbf24' }
      ];
    }
  },
  // Lines
  parallel: {
    name: 'Parallel',
    icon: '∥',
    category: 'lines',
    create: (cx: number, cy: number): DiagramShape[] => {
      return [
        { id: generateShapeId('p1'), type: 'line', points: [cx - 60, cy - 20, cx + 60, cy - 20], stroke: '#10b981', strokeWidth: 3 },
        { id: generateShapeId('p2'), type: 'line', points: [cx - 60, cy + 20, cx + 60, cy + 20], stroke: '#10b981', strokeWidth: 3 },
      ];
    }
  },
  perpendicular: {
    name: 'Perpendicular',
    icon: '⊥',
    category: 'lines',
    create: (cx: number, cy: number): DiagramShape[] => {
      return [
        { id: generateShapeId('h'), type: 'line', points: [cx - 60, cy, cx + 60, cy], stroke: '#10b981', strokeWidth: 3 },
        { id: generateShapeId('v'), type: 'line', points: [cx, cy - 60, cx, cy + 60], stroke: '#10b981', strokeWidth: 3 },
        { id: generateShapeId('m'), type: 'line', points: [cx + 10, cy, cx + 10, cy - 10, cx, cy - 10], stroke: '#10b981', strokeWidth: 2 },
      ];
    }
  },
  // Circles
  circleRadius: {
    name: 'Circle+r',
    icon: '⊙',
    category: 'circles',
    create: (cx: number, cy: number): DiagramShape[] => {
      const r = 50;
      return [
        { id: generateShapeId('c'), type: 'circle', x: cx, y: cy, radius: r, stroke: '#a855f7', strokeWidth: 3, fill: 'transparent' },
        { id: generateShapeId('ctr'), type: 'point', x: cx, y: cy, radius: 4, fill: '#a855f7', stroke: '#a855f7' },
        { id: generateShapeId('rad'), type: 'line', points: [cx, cy, cx + r, cy], stroke: '#fbbf24', strokeWidth: 2 },
        { id: generateShapeId('rl'), type: 'text', x: cx + r/2 - 5, y: cy - 15, text: 'r', fontSize: 16, fill: '#fbbf24' }
      ];
    }
  },
  circleDiameter: {
    name: 'Circle+d',
    icon: '⦵',
    category: 'circles',
    create: (cx: number, cy: number): DiagramShape[] => {
      const r = 50;
      return [
        { id: generateShapeId('c'), type: 'circle', x: cx, y: cy, radius: r, stroke: '#a855f7', strokeWidth: 3, fill: 'transparent' },
        { id: generateShapeId('ctr'), type: 'point', x: cx, y: cy, radius: 4, fill: '#a855f7', stroke: '#a855f7' },
        { id: generateShapeId('dia'), type: 'line', points: [cx - r, cy, cx + r, cy], stroke: '#fbbf24', strokeWidth: 2 },
        { id: generateShapeId('dl'), type: 'text', x: cx - 5, y: cy - 15, text: 'd', fontSize: 16, fill: '#fbbf24' }
      ];
    }
  },
};

const SHAPE_CATEGORIES = [
  { id: 'shapes', name: 'Shapes', icon: '△' },
  { id: 'angles', name: 'Angles', icon: '∠' },
  { id: 'lines', name: 'Lines', icon: '∥' },
  { id: 'circles', name: 'Circles', icon: '○' },
];

const ShapesLibrary: React.FC<ShapesLibraryProps> = ({ onAddShape, onAddSymbol }) => {
  const [activeTab, setActiveTab] = useState<'shapes' | 'symbols'>('shapes');
  const [shapeCategory, setShapeCategory] = useState('shapes');
  const [symbolCategory, setSymbolCategory] = useState('greek');

  const handleAddShape = (key: string) => {
    const template = SHAPE_TEMPLATES[key as keyof typeof SHAPE_TEMPLATES];
    if (template) {
      const shapes = template.create(350, 200);
      onAddShape(shapes);
    }
  };

  const filteredShapes = Object.entries(SHAPE_TEMPLATES).filter(([_, t]) => t.category === shapeCategory);
  const currentSymbols = MATH_SYMBOLS[symbolCategory as keyof typeof MATH_SYMBOLS] || [];

  return (
    <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-2 mb-2">
      {/* Main tabs */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setActiveTab('shapes')}
          className={`px-3 py-1 rounded text-sm font-medium transition-all ${
            activeTab === 'shapes'
              ? 'bg-cyan-500/30 text-cyan-400 border border-cyan-500'
              : 'bg-gray-800/50 text-gray-400 hover:text-white'
          }`}
        >
          📐 Shapes
        </button>
        <button
          onClick={() => setActiveTab('symbols')}
          className={`px-3 py-1 rounded text-sm font-medium transition-all ${
            activeTab === 'symbols'
              ? 'bg-purple-500/30 text-purple-400 border border-purple-500'
              : 'bg-gray-800/50 text-gray-400 hover:text-white'
          }`}
        >
          ∑ Math Symbols
        </button>
      </div>

      {activeTab === 'shapes' && (
        <>
          {/* Shape category tabs */}
          <div className="flex gap-1 mb-2 flex-wrap">
            {SHAPE_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setShapeCategory(cat.id)}
                className={`px-2 py-0.5 rounded text-xs transition-all ${
                  shapeCategory === cat.id
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                    : 'bg-gray-800/30 text-gray-500 hover:text-gray-300'
                }`}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
          
          {/* Shape buttons - horizontal scroll */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {filteredShapes.map(([key, template]) => (
              <button
                key={key}
                onClick={() => handleAddShape(key)}
                className="flex-shrink-0 flex items-center gap-1 px-2 py-1 bg-gray-800/50 hover:bg-cyan-500/20 
                           border border-gray-700 hover:border-cyan-500 rounded text-xs text-gray-300 
                           hover:text-white transition-all whitespace-nowrap"
                title={template.name}
              >
                <span className="text-base">{template.icon}</span>
                <span>{template.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {activeTab === 'symbols' && (
        <>
          {/* Symbol category tabs */}
          <div className="flex gap-1 mb-2 flex-wrap">
            {SYMBOL_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSymbolCategory(cat.id)}
                className={`px-2 py-0.5 rounded text-xs transition-all ${
                  symbolCategory === cat.id
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                    : 'bg-gray-800/30 text-gray-500 hover:text-gray-300'
                }`}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
          
          {/* Symbol buttons - horizontal scroll */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {currentSymbols.map((symbol, i) => (
              <button
                key={i}
                onClick={() => onAddSymbol(symbol)}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-800/50 
                           hover:bg-purple-500/20 border border-gray-700 hover:border-purple-500 
                           rounded text-lg text-gray-300 hover:text-white transition-all"
                title={`Insert ${symbol}`}
              >
                {symbol}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">Click to add symbol as text to canvas center</p>
        </>
      )}
    </div>
  );
};

export default ShapesLibrary;
