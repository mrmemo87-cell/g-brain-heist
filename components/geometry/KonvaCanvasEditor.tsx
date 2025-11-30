import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Line, Arrow, Circle, Text, Rect, Group } from 'react-konva';
import { DiagramTool, BlankField } from './types';
import { generateShapeId } from './geometryService';

// Custom shape type that's more flexible than Konva.ShapeConfig
interface DiagramShape {
  id: string;
  type: 'line' | 'arrow' | 'circle' | 'text' | 'group' | 'point' | 'angle';
  shapeType?: string;
  x?: number;
  y?: number;
  points?: number[];
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  radius?: number;
  text?: string;
  fontSize?: number;
  draggable?: boolean;
  lineCap?: string;
  pointerLength?: number;
  pointerWidth?: number;
  children?: DiagramShape[];
  endX?: number;
  endY?: number;
  angle?: number;
  [key: string]: unknown;
}

interface KonvaCanvasEditorProps {
  width: number;
  height: number;
  activeTool: DiagramTool;
  shapes: DiagramShape[];
  onShapesChange: (shapes: DiagramShape[]) => void;
  blanks: BlankField[];
  onBlanksChange: (blanks: BlankField[]) => void;
  selectedShapeId: string | null;
  onSelectShape: (id: string | null) => void;
  stageRef: React.MutableRefObject<unknown>;
  readOnly?: boolean;
}

const GRID_SIZE = 20;

const KonvaCanvasEditor: React.FC<KonvaCanvasEditorProps> = ({
  width,
  height,
  activeTool,
  shapes,
  onShapesChange,
  blanks,
  onBlanksChange,
  selectedShapeId,
  onSelectShape,
  stageRef,
  readOnly = false
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [tempShape, setTempShape] = useState<DiagramShape | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Draw grid background
  const renderGrid = () => {
    const lines = [];
    // Vertical lines
    for (let x = 0; x <= width; x += GRID_SIZE) {
      lines.push(
        <Line
          key={`v-${x}`}
          points={[x, 0, x, height]}
          stroke="#374151"
          strokeWidth={0.5}
          listening={false}
        />
      );
    }
    // Horizontal lines
    for (let y = 0; y <= height; y += GRID_SIZE) {
      lines.push(
        <Line
          key={`h-${y}`}
          points={[0, y, width, y]}
          stroke="#374151"
          strokeWidth={0.5}
          listening={false}
        />
      );
    }
    return lines;
  };

  const snapToGrid = (value: number): number => {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  };

  const getPointerPosition = (e: { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null } }) => {
    const stage = e.target.getStage();
    if (!stage) return null;
    return stage.getPointerPosition();
  };

  const handleMouseDown = (e: unknown) => {
    if (readOnly) return;
    
    const evt = e as { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null } };
    const pos = getPointerPosition(evt);
    if (!pos) return;

    const clickedOnEmpty = (evt as { target: unknown }).target === (evt as { target: { getStage: () => unknown } }).target.getStage();

    if (activeTool === 'select') {
      if (clickedOnEmpty) {
        onSelectShape(null);
      }
      return;
    }

    if (activeTool === 'delete') {
      return;
    }

    if (activeTool === 'text') {
      const id = generateShapeId('text');
      const newText: DiagramShape = {
        id,
        type: 'text',
        x: snapToGrid(pos.x),
        y: snapToGrid(pos.y),
        text: 'Text',
        fontSize: 18,
        fill: '#e5e7eb',
        draggable: true,
        shapeType: 'text'
      };
      onShapesChange([...shapes, newText]);
      onSelectShape(id);
      return;
    }

    if (activeTool === 'point') {
      const id = generateShapeId('point');
      const newPoint: DiagramShape = {
        id,
        type: 'circle',
        x: snapToGrid(pos.x),
        y: snapToGrid(pos.y),
        radius: 5,
        fill: '#22d3ee',
        stroke: '#0891b2',
        strokeWidth: 2,
        draggable: true,
        shapeType: 'point'
      };
      onShapesChange([...shapes, newPoint]);
      return;
    }

    if (activeTool === 'blank') {
      const id = generateShapeId('blank');
      const newBlank: BlankField = {
        id,
        type: 'blank',
        x: snapToGrid(pos.x),
        y: snapToGrid(pos.y),
        width: 60,
        height: 28,
        expectedAnswer: ''
      };
      onBlanksChange([...blanks, newBlank]);
      return;
    }

    setIsDrawing(true);
    setDrawStart({ x: snapToGrid(pos.x), y: snapToGrid(pos.y) });
  };

  const handleMouseMove = (e: unknown) => {
    if (!isDrawing || !drawStart || readOnly) return;

    const evt = e as { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null } };
    const pos = getPointerPosition(evt);
    if (!pos) return;

    const endX = snapToGrid(pos.x);
    const endY = snapToGrid(pos.y);

    if (activeTool === 'line') {
      setTempShape({
        id: 'temp',
        type: 'line',
        points: [drawStart.x, drawStart.y, endX, endY],
        stroke: '#22d3ee',
        strokeWidth: 2,
        lineCap: 'round'
      });
    } else if (activeTool === 'arrow') {
      setTempShape({
        id: 'temp',
        type: 'arrow',
        points: [drawStart.x, drawStart.y, endX, endY],
        stroke: '#22d3ee',
        strokeWidth: 2,
        pointerLength: 10,
        pointerWidth: 8,
        fill: '#22d3ee'
      });
    } else if (activeTool === 'circle') {
      const radius = Math.sqrt(
        Math.pow(endX - drawStart.x, 2) + Math.pow(endY - drawStart.y, 2)
      );
      setTempShape({
        id: 'temp',
        type: 'circle',
        x: drawStart.x,
        y: drawStart.y,
        radius: Math.max(radius, 10),
        stroke: '#22d3ee',
        strokeWidth: 2,
        fill: 'transparent'
      });
    } else if (activeTool === 'angle') {
      // Draw angle as two lines with an arc
      const angle = Math.atan2(endY - drawStart.y, endX - drawStart.x) * 180 / Math.PI;
      setTempShape({
        id: 'temp',
        type: 'angle',
        x: drawStart.x,
        y: drawStart.y,
        endX,
        endY,
        angle
      });
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !drawStart || readOnly) {
      setIsDrawing(false);
      return;
    }

    if (tempShape) {
      const id = generateShapeId(activeTool);
      
      if (activeTool === 'angle' && tempShape.type === 'angle') {
        // Create angle shape (two lines + arc)
        const newShapes: DiagramShape[] = [
          {
            id,
            type: 'group',
            x: 0,
            y: 0,
            draggable: true,
            shapeType: 'angle',
            children: [
              {
                id: `${id}-line1`,
                type: 'line',
                points: [drawStart.x, drawStart.y, tempShape.endX || 0, tempShape.endY || 0],
                stroke: '#22d3ee',
                strokeWidth: 2
              },
              {
                id: `${id}-line2`,
                type: 'line',
                points: [drawStart.x, drawStart.y, drawStart.x + 60, drawStart.y],
                stroke: '#22d3ee',
                strokeWidth: 2
              }
            ]
          }
        ];
        onShapesChange([...shapes, ...newShapes]);
      } else {
        const newShape: DiagramShape = {
          ...tempShape,
          id,
          draggable: true,
          shapeType: activeTool
        };
        onShapesChange([...shapes, newShape]);
      }
    }

    setIsDrawing(false);
    setDrawStart(null);
    setTempShape(null);
  };

  const handleShapeClick = (shapeId: string) => {
    if (readOnly) return;
    
    if (activeTool === 'delete') {
      onShapesChange(shapes.filter(s => s.id !== shapeId));
      onBlanksChange(blanks.filter(b => b.id !== shapeId));
    } else if (activeTool === 'select') {
      onSelectShape(shapeId);
    }
  };

  const handleDragEnd = (e: unknown, shapeId: string) => {
    const evt = e as { target: { x: () => number; y: () => number } };
    const newX = snapToGrid(evt.target.x());
    const newY = snapToGrid(evt.target.y());
    
    // Update shape position
    const updatedShapes = shapes.map(s => 
      s.id === shapeId ? { ...s, x: newX, y: newY } : s
    );
    onShapesChange(updatedShapes);
    
    // Update blank position
    const updatedBlanks = blanks.map(b =>
      b.id === shapeId ? { ...b, x: newX, y: newY } : b
    );
    onBlanksChange(updatedBlanks);
  };

  const handleTextDblClick = (textId: string) => {
    if (readOnly) return;
    setEditingTextId(textId);
  };

  const renderShape = (shape: DiagramShape) => {
    const isSelected = selectedShapeId === shape.id;
    const commonProps = {
      onClick: () => handleShapeClick(shape.id),
      onDragEnd: (e: unknown) => handleDragEnd(e, shape.id),
      draggable: !readOnly && activeTool === 'select'
    };

    switch (shape.type) {
      case 'line':
        return (
          <Line
            key={shape.id}
            points={shape.points}
            stroke={isSelected ? '#f472b6' : shape.stroke}
            strokeWidth={isSelected ? 3 : shape.strokeWidth}
            lineCap="round"
            {...commonProps}
          />
        );
      case 'arrow':
        return (
          <Arrow
            key={shape.id}
            points={shape.points}
            stroke={isSelected ? '#f472b6' : shape.stroke}
            fill={isSelected ? '#f472b6' : shape.fill}
            strokeWidth={isSelected ? 3 : shape.strokeWidth}
            pointerLength={shape.pointerLength}
            pointerWidth={shape.pointerWidth}
            {...commonProps}
          />
        );
      case 'circle':
        return (
          <Circle
            key={shape.id}
            x={shape.x}
            y={shape.y}
            radius={shape.radius}
            stroke={isSelected ? '#f472b6' : shape.stroke}
            fill={shape.fill}
            strokeWidth={isSelected ? 3 : shape.strokeWidth}
            {...commonProps}
          />
        );
      case 'text':
        return (
          <Text
            key={shape.id}
            x={shape.x}
            y={shape.y}
            text={shape.text}
            fontSize={shape.fontSize}
            fill={isSelected ? '#f472b6' : shape.fill}
            onDblClick={() => handleTextDblClick(shape.id)}
            {...commonProps}
          />
        );
      default:
        return null;
    }
  };

  const renderTempShape = () => {
    if (!tempShape) return null;

    switch (tempShape.type) {
      case 'line':
        return <Line points={tempShape.points} stroke={tempShape.stroke} strokeWidth={tempShape.strokeWidth} opacity={0.6} listening={false} />;
      case 'arrow':
        return <Arrow points={tempShape.points} stroke={tempShape.stroke} fill={tempShape.fill} strokeWidth={tempShape.strokeWidth} pointerLength={tempShape.pointerLength} pointerWidth={tempShape.pointerWidth} opacity={0.6} listening={false} />;
      case 'circle':
        return <Circle x={tempShape.x} y={tempShape.y} radius={tempShape.radius} stroke={tempShape.stroke} fill={tempShape.fill} strokeWidth={tempShape.strokeWidth} opacity={0.6} listening={false} />;
      case 'angle':
        return (
          <Group listening={false} opacity={0.6}>
            <Line
              points={[drawStart!.x, drawStart!.y, tempShape.endX || 0, tempShape.endY || 0]}
              stroke="#22d3ee"
              strokeWidth={2}
            />
            <Line
              points={[drawStart!.x, drawStart!.y, drawStart!.x + 60, drawStart!.y]}
              stroke="#22d3ee"
              strokeWidth={2}
            />
          </Group>
        );
      default:
        return null;
    }
  };

  const renderBlanks = () => {
    return blanks.map((blank) => (
      <Rect
        key={blank.id}
        x={blank.x}
        y={blank.y}
        width={blank.width}
        height={blank.height}
        fill="#1f2937"
        stroke={selectedShapeId === blank.id ? '#f472b6' : '#4b5563'}
        strokeWidth={selectedShapeId === blank.id ? 2 : 1}
        cornerRadius={4}
        onClick={() => handleShapeClick(blank.id)}
        onDragEnd={(e: unknown) => handleDragEnd(e, blank.id)}
        draggable={!readOnly && activeTool === 'select'}
      />
    ));
  };

  return (
    <div className="relative border border-gray-700 rounded-lg overflow-hidden bg-gray-950">
      <Stage
        ref={stageRef as any}
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
      >
        <Layer>
          {/* Grid */}
          {renderGrid()}
          
          {/* Shapes */}
          {shapes.map(renderShape)}
          
          {/* Blanks */}
          {renderBlanks()}
          
          {/* Temp shape while drawing */}
          {renderTempShape()}
        </Layer>
      </Stage>

      {/* Text editing overlay */}
      {editingTextId && !readOnly && (
        <TextEditOverlay
          shape={shapes.find(s => s.id === editingTextId)!}
          onSave={(newText) => {
            const updatedShapes = shapes.map(s =>
              s.id === editingTextId ? { ...s, text: newText } : s
            );
            onShapesChange(updatedShapes);
            setEditingTextId(null);
          }}
          onCancel={() => setEditingTextId(null)}
        />
      )}
    </div>
  );
};

// Text editing overlay component
interface TextEditOverlayProps {
  shape: DiagramShape;
  onSave: (text: string) => void;
  onCancel: () => void;
}

const TextEditOverlay: React.FC<TextEditOverlayProps> = ({ shape, onSave, onCancel }) => {
  const [text, setText] = useState(shape.text || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: { key: string }) => {
    if (e.key === 'Enter') {
      onSave(text);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      className="absolute"
      style={{
        left: shape.x,
        top: shape.y,
        transform: 'translate(-2px, -2px)'
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e: { target: { value: string } }) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onSave(text)}
        className="px-2 py-1 bg-gray-800 border border-cyan-500 rounded text-white text-lg outline-none"
        style={{ fontSize: shape.fontSize }}
      />
    </div>
  );
};

export default KonvaCanvasEditor;

// Export the DiagramShape type for other components
export type { DiagramShape };
