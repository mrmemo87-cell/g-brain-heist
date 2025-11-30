import React from 'react';
import { DiagramShape } from './KonvaCanvasEditor';
import { generateShapeId } from './geometryService';

interface ShapesLibraryProps {
  onAddShape: (shapes: DiagramShape[]) => void;
}

// Predefined geometric shape templates
const SHAPE_TEMPLATES = {
  // Basic shapes
  triangle: {
    name: '△ Triangle',
    category: 'basic',
    create: (cx: number, cy: number): DiagramShape[] => {
      const size = 100;
      return [{
        id: generateShapeId('triangle'),
        type: 'line',
        points: [
          cx, cy - size/2,           // Top
          cx - size/2, cy + size/2,  // Bottom left
          cx + size/2, cy + size/2,  // Bottom right
          cx, cy - size/2            // Back to top
        ],
        stroke: '#22d3ee',
        strokeWidth: 3,
        draggable: true,
        shapeType: 'triangle'
      }];
    }
  },
  rightTriangle: {
    name: '⌐ Right Triangle',
    category: 'basic',
    create: (cx: number, cy: number): DiagramShape[] => {
      const size = 100;
      return [
        {
          id: generateShapeId('rtriangle'),
          type: 'line',
          points: [
            cx - size/2, cy + size/2,  // Bottom left (right angle)
            cx + size/2, cy + size/2,  // Bottom right
            cx - size/2, cy - size/2,  // Top
            cx - size/2, cy + size/2   // Back to start
          ],
          stroke: '#22d3ee',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'rightTriangle'
        },
        // Right angle marker
        {
          id: generateShapeId('rightangle'),
          type: 'line',
          points: [
            cx - size/2 + 15, cy + size/2,
            cx - size/2 + 15, cy + size/2 - 15,
            cx - size/2, cy + size/2 - 15
          ],
          stroke: '#22d3ee',
          strokeWidth: 2,
          draggable: true,
          shapeType: 'marker'
        }
      ];
    }
  },
  square: {
    name: '□ Square',
    category: 'basic',
    create: (cx: number, cy: number): DiagramShape[] => {
      const size = 80;
      return [{
        id: generateShapeId('square'),
        type: 'line',
        points: [
          cx - size/2, cy - size/2,
          cx + size/2, cy - size/2,
          cx + size/2, cy + size/2,
          cx - size/2, cy + size/2,
          cx - size/2, cy - size/2
        ],
        stroke: '#22d3ee',
        strokeWidth: 3,
        draggable: true,
        shapeType: 'square'
      }];
    }
  },
  rectangle: {
    name: '▭ Rectangle',
    category: 'basic',
    create: (cx: number, cy: number): DiagramShape[] => {
      const w = 120, h = 70;
      return [{
        id: generateShapeId('rect'),
        type: 'line',
        points: [
          cx - w/2, cy - h/2,
          cx + w/2, cy - h/2,
          cx + w/2, cy + h/2,
          cx - w/2, cy + h/2,
          cx - w/2, cy - h/2
        ],
        stroke: '#22d3ee',
        strokeWidth: 3,
        draggable: true,
        shapeType: 'rectangle'
      }];
    }
  },
  parallelogram: {
    name: '▱ Parallelogram',
    category: 'basic',
    create: (cx: number, cy: number): DiagramShape[] => {
      const w = 120, h = 60, skew = 30;
      return [{
        id: generateShapeId('para'),
        type: 'line',
        points: [
          cx - w/2 + skew, cy - h/2,
          cx + w/2 + skew, cy - h/2,
          cx + w/2 - skew, cy + h/2,
          cx - w/2 - skew, cy + h/2,
          cx - w/2 + skew, cy - h/2
        ],
        stroke: '#22d3ee',
        strokeWidth: 3,
        draggable: true,
        shapeType: 'parallelogram'
      }];
    }
  },
  rhombus: {
    name: '◇ Rhombus',
    category: 'basic',
    create: (cx: number, cy: number): DiagramShape[] => {
      const w = 80, h = 100;
      return [{
        id: generateShapeId('rhombus'),
        type: 'line',
        points: [
          cx, cy - h/2,
          cx + w/2, cy,
          cx, cy + h/2,
          cx - w/2, cy,
          cx, cy - h/2
        ],
        stroke: '#22d3ee',
        strokeWidth: 3,
        draggable: true,
        shapeType: 'rhombus'
      }];
    }
  },
  trapezoid: {
    name: '⏢ Trapezoid',
    category: 'basic',
    create: (cx: number, cy: number): DiagramShape[] => {
      const topW = 60, bottomW = 120, h = 70;
      return [{
        id: generateShapeId('trap'),
        type: 'line',
        points: [
          cx - topW/2, cy - h/2,
          cx + topW/2, cy - h/2,
          cx + bottomW/2, cy + h/2,
          cx - bottomW/2, cy + h/2,
          cx - topW/2, cy - h/2
        ],
        stroke: '#22d3ee',
        strokeWidth: 3,
        draggable: true,
        shapeType: 'trapezoid'
      }];
    }
  },
  pentagon: {
    name: '⬠ Pentagon',
    category: 'basic',
    create: (cx: number, cy: number): DiagramShape[] => {
      const r = 60;
      const points: number[] = [];
      for (let i = 0; i < 5; i++) {
        const angle = (i * 72 - 90) * Math.PI / 180;
        points.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      }
      points.push(points[0], points[1]); // Close shape
      return [{
        id: generateShapeId('pentagon'),
        type: 'line',
        points,
        stroke: '#22d3ee',
        strokeWidth: 3,
        draggable: true,
        shapeType: 'pentagon'
      }];
    }
  },
  hexagon: {
    name: '⬡ Hexagon',
    category: 'basic',
    create: (cx: number, cy: number): DiagramShape[] => {
      const r = 55;
      const points: number[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i * 60 - 90) * Math.PI / 180;
        points.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      }
      points.push(points[0], points[1]);
      return [{
        id: generateShapeId('hexagon'),
        type: 'line',
        points,
        stroke: '#22d3ee',
        strokeWidth: 3,
        draggable: true,
        shapeType: 'hexagon'
      }];
    }
  },
  
  // Angle configurations
  angleAcute: {
    name: '∠ Acute Angle',
    category: 'angles',
    create: (cx: number, cy: number): DiagramShape[] => {
      const len = 100;
      return [
        {
          id: generateShapeId('angle1'),
          type: 'line',
          points: [cx, cy, cx + len, cy],
          stroke: '#f472b6',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'angleLine'
        },
        {
          id: generateShapeId('angle2'),
          type: 'line',
          points: [cx, cy, cx + len * Math.cos(45 * Math.PI/180), cy - len * Math.sin(45 * Math.PI/180)],
          stroke: '#f472b6',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'angleLine'
        },
        {
          id: generateShapeId('label'),
          type: 'text',
          x: cx + 25,
          y: cy - 15,
          text: '45°',
          fontSize: 14,
          fill: '#fbbf24',
          draggable: true,
          shapeType: 'text'
        }
      ];
    }
  },
  angleRight: {
    name: '∟ Right Angle',
    category: 'angles',
    create: (cx: number, cy: number): DiagramShape[] => {
      const len = 100;
      return [
        {
          id: generateShapeId('rangle1'),
          type: 'line',
          points: [cx, cy, cx + len, cy],
          stroke: '#f472b6',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'angleLine'
        },
        {
          id: generateShapeId('rangle2'),
          type: 'line',
          points: [cx, cy, cx, cy - len],
          stroke: '#f472b6',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'angleLine'
        },
        {
          id: generateShapeId('rsquare'),
          type: 'line',
          points: [cx + 15, cy, cx + 15, cy - 15, cx, cy - 15],
          stroke: '#f472b6',
          strokeWidth: 2,
          draggable: true,
          shapeType: 'marker'
        },
        {
          id: generateShapeId('label'),
          type: 'text',
          x: cx + 20,
          y: cy - 25,
          text: '90°',
          fontSize: 14,
          fill: '#fbbf24',
          draggable: true,
          shapeType: 'text'
        }
      ];
    }
  },
  angleObtuse: {
    name: '⦦ Obtuse Angle',
    category: 'angles',
    create: (cx: number, cy: number): DiagramShape[] => {
      const len = 100;
      const angle = 120;
      return [
        {
          id: generateShapeId('oangle1'),
          type: 'line',
          points: [cx, cy, cx + len, cy],
          stroke: '#f472b6',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'angleLine'
        },
        {
          id: generateShapeId('oangle2'),
          type: 'line',
          points: [cx, cy, cx + len * Math.cos(angle * Math.PI/180), cy - len * Math.sin(angle * Math.PI/180)],
          stroke: '#f472b6',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'angleLine'
        },
        {
          id: generateShapeId('label'),
          type: 'text',
          x: cx + 15,
          y: cy - 35,
          text: '120°',
          fontSize: 14,
          fill: '#fbbf24',
          draggable: true,
          shapeType: 'text'
        }
      ];
    }
  },
  angleStraight: {
    name: '— Straight Angle',
    category: 'angles',
    create: (cx: number, cy: number): DiagramShape[] => {
      const len = 120;
      return [
        {
          id: generateShapeId('sangle'),
          type: 'line',
          points: [cx - len, cy, cx + len, cy],
          stroke: '#f472b6',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'straightAngle'
        },
        {
          id: generateShapeId('spoint'),
          type: 'circle',
          x: cx,
          y: cy,
          radius: 5,
          fill: '#fbbf24',
          stroke: '#f472b6',
          strokeWidth: 2,
          draggable: true,
          shapeType: 'point'
        },
        {
          id: generateShapeId('label'),
          type: 'text',
          x: cx - 15,
          y: cy - 25,
          text: '180°',
          fontSize: 14,
          fill: '#fbbf24',
          draggable: true,
          shapeType: 'text'
        }
      ];
    }
  },
  
  // Lines and segments
  parallelLines: {
    name: '∥ Parallel Lines',
    category: 'lines',
    create: (cx: number, cy: number): DiagramShape[] => {
      const len = 150;
      const gap = 50;
      return [
        {
          id: generateShapeId('pline1'),
          type: 'line',
          points: [cx - len/2, cy - gap/2, cx + len/2, cy - gap/2],
          stroke: '#10b981',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'line'
        },
        {
          id: generateShapeId('pline2'),
          type: 'line',
          points: [cx - len/2, cy + gap/2, cx + len/2, cy + gap/2],
          stroke: '#10b981',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'line'
        },
        // Parallel markers
        {
          id: generateShapeId('pmark1'),
          type: 'arrow',
          points: [cx - 5, cy - gap/2 - 8, cx + 5, cy - gap/2 - 8],
          stroke: '#10b981',
          fill: '#10b981',
          strokeWidth: 2,
          pointerLength: 6,
          pointerWidth: 6,
          draggable: true,
          shapeType: 'marker'
        },
        {
          id: generateShapeId('pmark2'),
          type: 'arrow',
          points: [cx - 5, cy + gap/2 - 8, cx + 5, cy + gap/2 - 8],
          stroke: '#10b981',
          fill: '#10b981',
          strokeWidth: 2,
          pointerLength: 6,
          pointerWidth: 6,
          draggable: true,
          shapeType: 'marker'
        }
      ];
    }
  },
  perpendicularLines: {
    name: '⊥ Perpendicular',
    category: 'lines',
    create: (cx: number, cy: number): DiagramShape[] => {
      const len = 100;
      return [
        {
          id: generateShapeId('perpline1'),
          type: 'line',
          points: [cx - len, cy, cx + len, cy],
          stroke: '#10b981',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'line'
        },
        {
          id: generateShapeId('perpline2'),
          type: 'line',
          points: [cx, cy - len, cx, cy + len],
          stroke: '#10b981',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'line'
        },
        // Right angle marker
        {
          id: generateShapeId('perpmark'),
          type: 'line',
          points: [cx + 12, cy, cx + 12, cy - 12, cx, cy - 12],
          stroke: '#10b981',
          strokeWidth: 2,
          draggable: true,
          shapeType: 'marker'
        }
      ];
    }
  },
  transversal: {
    name: '⟋ Transversal',
    category: 'lines',
    create: (cx: number, cy: number): DiagramShape[] => {
      const len = 140;
      const gap = 60;
      return [
        // Two parallel lines
        {
          id: generateShapeId('tline1'),
          type: 'line',
          points: [cx - len/2, cy - gap/2, cx + len/2, cy - gap/2],
          stroke: '#10b981',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'line'
        },
        {
          id: generateShapeId('tline2'),
          type: 'line',
          points: [cx - len/2, cy + gap/2, cx + len/2, cy + gap/2],
          stroke: '#10b981',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'line'
        },
        // Transversal line
        {
          id: generateShapeId('trans'),
          type: 'line',
          points: [cx - 40, cy - 80, cx + 40, cy + 80],
          stroke: '#f472b6',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'transversal'
        }
      ];
    }
  },
  
  // Circles
  circleWithRadius: {
    name: '⊙ Circle + Radius',
    category: 'circles',
    create: (cx: number, cy: number): DiagramShape[] => {
      const r = 60;
      return [
        {
          id: generateShapeId('circle'),
          type: 'circle',
          x: cx,
          y: cy,
          radius: r,
          stroke: '#a855f7',
          strokeWidth: 3,
          fill: 'transparent',
          draggable: true,
          shapeType: 'circle'
        },
        // Center point
        {
          id: generateShapeId('center'),
          type: 'circle',
          x: cx,
          y: cy,
          radius: 4,
          fill: '#a855f7',
          stroke: '#a855f7',
          strokeWidth: 2,
          draggable: true,
          shapeType: 'point'
        },
        // Radius line
        {
          id: generateShapeId('radius'),
          type: 'line',
          points: [cx, cy, cx + r, cy],
          stroke: '#fbbf24',
          strokeWidth: 2,
          draggable: true,
          shapeType: 'radius'
        },
        {
          id: generateShapeId('rlabel'),
          type: 'text',
          x: cx + r/2 - 5,
          y: cy - 18,
          text: 'r',
          fontSize: 16,
          fill: '#fbbf24',
          draggable: true,
          shapeType: 'text'
        }
      ];
    }
  },
  circleWithDiameter: {
    name: '⦵ Circle + Diameter',
    category: 'circles',
    create: (cx: number, cy: number): DiagramShape[] => {
      const r = 60;
      return [
        {
          id: generateShapeId('circle'),
          type: 'circle',
          x: cx,
          y: cy,
          radius: r,
          stroke: '#a855f7',
          strokeWidth: 3,
          fill: 'transparent',
          draggable: true,
          shapeType: 'circle'
        },
        // Center point
        {
          id: generateShapeId('center'),
          type: 'circle',
          x: cx,
          y: cy,
          radius: 4,
          fill: '#a855f7',
          stroke: '#a855f7',
          strokeWidth: 2,
          draggable: true,
          shapeType: 'point'
        },
        // Diameter line
        {
          id: generateShapeId('diameter'),
          type: 'line',
          points: [cx - r, cy, cx + r, cy],
          stroke: '#fbbf24',
          strokeWidth: 2,
          draggable: true,
          shapeType: 'diameter'
        },
        {
          id: generateShapeId('dlabel'),
          type: 'text',
          x: cx - 5,
          y: cy - 18,
          text: 'd',
          fontSize: 16,
          fill: '#fbbf24',
          draggable: true,
          shapeType: 'text'
        }
      ];
    }
  },
  semicircle: {
    name: '⌓ Semicircle',
    category: 'circles',
    create: (cx: number, cy: number): DiagramShape[] => {
      const r = 60;
      // Create semicircle using multiple points
      const points: number[] = [];
      for (let i = 0; i <= 180; i += 10) {
        const angle = i * Math.PI / 180;
        points.push(cx + r * Math.cos(angle), cy - r * Math.sin(angle));
      }
      return [
        {
          id: generateShapeId('semicircle'),
          type: 'line',
          points: [...points, cx - r, cy], // Close with diameter
          stroke: '#a855f7',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'semicircle'
        },
        // Diameter line
        {
          id: generateShapeId('sdiameter'),
          type: 'line',
          points: [cx - r, cy, cx + r, cy],
          stroke: '#a855f7',
          strokeWidth: 3,
          draggable: true,
          shapeType: 'diameter'
        }
      ];
    }
  }
};

const CATEGORIES = [
  { id: 'basic', name: '📐 Basic Shapes', color: 'cyan' },
  { id: 'angles', name: '∠ Angles', color: 'pink' },
  { id: 'lines', name: '═ Lines', color: 'green' },
  { id: 'circles', name: '⭕ Circles', color: 'purple' }
];

const ShapesLibrary: React.FC<ShapesLibraryProps> = ({ onAddShape }) => {
  const [activeCategory, setActiveCategory] = React.useState('basic');

  const handleAddShape = (templateKey: string) => {
    const template = SHAPE_TEMPLATES[templateKey as keyof typeof SHAPE_TEMPLATES];
    if (template) {
      // Place shape at center of canvas
      const shapes = template.create(350, 225);
      onAddShape(shapes);
    }
  };

  const filteredTemplates = Object.entries(SHAPE_TEMPLATES)
    .filter(([_, t]) => t.category === activeCategory);

  return (
    <div className="card-glass p-3">
      <h3 className="text-sm font-semibold text-gray-300 mb-2">📚 Shapes Library</h3>
      
      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 mb-3">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-2 py-1 rounded text-xs transition-all ${
              activeCategory === cat.id
                ? 'bg-cyan-500/30 text-cyan-400 border border-cyan-500'
                : 'bg-gray-800/50 text-gray-400 border border-gray-700 hover:border-gray-500'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Shape buttons */}
      <div className="grid grid-cols-2 gap-2">
        {filteredTemplates.map(([key, template]) => (
          <button
            key={key}
            onClick={() => handleAddShape(key)}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-700/50 
                       border border-gray-700 hover:border-cyan-500 rounded-lg text-left
                       text-sm text-gray-300 hover:text-white transition-all group"
          >
            <span className="text-lg group-hover:scale-110 transition-transform">
              {template.name.split(' ')[0]}
            </span>
            <span className="text-xs">{template.name.split(' ').slice(1).join(' ')}</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Click to add shape to center of canvas
      </p>
    </div>
  );
};

export default ShapesLibrary;
