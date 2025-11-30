import React, { useRef, useEffect, useState } from 'react';
import Konva from 'konva';
import { DiagramTool, BlankField } from './types';
import { generateShapeId } from './geometryService';

export interface DiagramShape {
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
  endX?: number;
  endY?: number;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const stageObjRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const isInitializedRef = useRef(false);
  
  const [drawingState, setDrawingState] = useState<{
    isDrawing: boolean;
    startPoint: { x: number; y: number } | null;
  }>({ isDrawing: false, startPoint: null });

  const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;

  // Initialize Konva stage ONCE
  useEffect(() => {
    if (!containerRef.current || isInitializedRef.current) return;
    
    console.log('🏗️ Initializing Konva stage (once)');
    console.log('📦 Container element:', containerRef.current);
    console.log('📐 Container size:', containerRef.current.offsetWidth, 'x', containerRef.current.offsetHeight);
    isInitializedRef.current = true;

    const stage = new Konva.Stage({
      container: containerRef.current,
      width: width,
      height: height,
    });

    const layer = new Konva.Layer();
    stage.add(layer);

    // Check what Konva created
    console.log('🎭 Stage content element:', stage.content);
    console.log('🎨 Canvas elements:', stage.content?.querySelectorAll('canvas'));
    
    // Force canvas to be visible
    const canvases = stage.content?.querySelectorAll('canvas');
    if (canvases) {
      canvases.forEach((canvas, i) => {
        console.log(`Canvas ${i} size:`, canvas.width, 'x', canvas.height);
        (canvas as HTMLCanvasElement).style.display = 'block';
        (canvas as HTMLCanvasElement).style.position = 'relative';
      });
    }

    stageObjRef.current = stage;
    layerRef.current = layer;
    
    if (stageRef) {
      (stageRef as React.MutableRefObject<Konva.Stage | null>).current = stage;
    }

    // Draw initial content
    drawCanvas(layer, [], [], null, width, height);

    return () => {
      // Don't destroy on cleanup in dev mode - React strict mode issue
    };
  }, []); // Empty deps - run once

  // Update stage size if width/height change
  useEffect(() => {
    if (stageObjRef.current) {
      stageObjRef.current.width(width);
      stageObjRef.current.height(height);
    }
  }, [width, height]);

  // Redraw when shapes/blanks/selection changes
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    
    console.log('🎨 Redrawing canvas with', shapes.length, 'shapes');
    drawCanvas(layer, shapes, blanks, selectedShapeId, width, height);
  }, [shapes, blanks, selectedShapeId, width, height]);

  // Handle mouse events
  useEffect(() => {
    const stage = stageObjRef.current;
    const layer = layerRef.current;
    if (!stage || !layer) return;

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (readOnly) return;
      
      const pos = stage.getPointerPosition();
      if (!pos) return;
      
      const snappedPos = { x: snap(pos.x), y: snap(pos.y) };
      
      console.log('🖱️ Click at', snappedPos, 'tool:', activeTool);

      if (activeTool === 'select') {
        return;
      }

      if (activeTool === 'text') {
        const newShape: DiagramShape = {
          id: generateShapeId('text'),
          type: 'text',
          x: snappedPos.x,
          y: snappedPos.y,
          text: 'Text',
          fontSize: 20,
          fill: '#ffffff'
        };
        onShapesChange([...shapes, newShape]);
        return;
      }

      if (activeTool === 'point') {
        const newShape: DiagramShape = {
          id: generateShapeId('point'),
          type: 'point',
          x: snappedPos.x,
          y: snappedPos.y,
          radius: 6,
          fill: '#00ffff',
          stroke: '#00ffff',
          strokeWidth: 2
        };
        onShapesChange([...shapes, newShape]);
        return;
      }

      if (activeTool === 'blank') {
        const newBlank: BlankField = {
          id: generateShapeId('blank'),
          type: 'blank',
          x: snappedPos.x,
          y: snappedPos.y,
          width: 60,
          height: 30,
          expectedAnswer: ''
        };
        onBlanksChange([...blanks, newBlank]);
        return;
      }

      // Start drawing
      if (['line', 'arrow', 'circle', 'angle'].includes(activeTool)) {
        setDrawingState({ isDrawing: true, startPoint: snappedPos });
      }
    };

    const handleMouseMove = () => {
      if (!drawingState.isDrawing || !drawingState.startPoint) return;
      
      const pos = stage.getPointerPosition();
      if (!pos) return;
      
      const snappedPos = { x: snap(pos.x), y: snap(pos.y) };
      const start = drawingState.startPoint;

      // Remove old preview
      const oldPreview = layer.findOne('#preview');
      if (oldPreview) oldPreview.destroy();

      // Draw preview
      let preview: Konva.Shape | Konva.Group | null = null;

      if (activeTool === 'line') {
        preview = new Konva.Line({
          id: 'preview',
          points: [start.x, start.y, snappedPos.x, snappedPos.y],
          stroke: '#ffff00',
          strokeWidth: 4,
          dash: [10, 5],
        });
      } else if (activeTool === 'arrow') {
        preview = new Konva.Arrow({
          id: 'preview',
          points: [start.x, start.y, snappedPos.x, snappedPos.y],
          stroke: '#ffff00',
          fill: '#ffff00',
          strokeWidth: 4,
          pointerLength: 12,
          pointerWidth: 10,
          dash: [10, 5],
        });
      } else if (activeTool === 'circle') {
        const dx = snappedPos.x - start.x;
        const dy = snappedPos.y - start.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        preview = new Konva.Circle({
          id: 'preview',
          x: start.x,
          y: start.y,
          radius: radius,
          stroke: '#ffff00',
          strokeWidth: 4,
          dash: [10, 5],
        });
      } else if (activeTool === 'angle') {
        const group = new Konva.Group({ id: 'preview' });
        group.add(new Konva.Line({
          points: [start.x, start.y, snappedPos.x, snappedPos.y],
          stroke: '#ffff00',
          strokeWidth: 4,
          dash: [10, 5],
        }));
        group.add(new Konva.Line({
          points: [start.x, start.y, start.x + 80, start.y],
          stroke: '#ffff00',
          strokeWidth: 4,
          dash: [10, 5],
        }));
        preview = group;
      }

      if (preview) {
        layer.add(preview);
        layer.batchDraw();
      }
    };

    const handleMouseUp = () => {
      if (!drawingState.isDrawing || !drawingState.startPoint) return;
      
      const pos = stage.getPointerPosition();
      const start = drawingState.startPoint;

      // Remove preview
      const oldPreview = layer.findOne('#preview');
      if (oldPreview) oldPreview.destroy();

      if (pos) {
        const snappedPos = { x: snap(pos.x), y: snap(pos.y) };
        let newShape: DiagramShape | null = null;

        if (activeTool === 'line') {
          newShape = {
            id: generateShapeId('line'),
            type: 'line',
            points: [start.x, start.y, snappedPos.x, snappedPos.y],
            stroke: '#00ffff',
            strokeWidth: 3,
          };
        } else if (activeTool === 'arrow') {
          newShape = {
            id: generateShapeId('arrow'),
            type: 'arrow',
            points: [start.x, start.y, snappedPos.x, snappedPos.y],
            stroke: '#00ffff',
            fill: '#00ffff',
            strokeWidth: 3,
            pointerLength: 12,
            pointerWidth: 10,
          };
        } else if (activeTool === 'circle') {
          const dx = snappedPos.x - start.x;
          const dy = snappedPos.y - start.y;
          const radius = Math.sqrt(dx * dx + dy * dy);
          newShape = {
            id: generateShapeId('circle'),
            type: 'circle',
            x: start.x,
            y: start.y,
            radius: radius,
            stroke: '#00ffff',
            strokeWidth: 3,
            fill: 'transparent',
          };
        } else if (activeTool === 'angle') {
          newShape = {
            id: generateShapeId('angle'),
            type: 'angle',
            points: [start.x, start.y, snappedPos.x, snappedPos.y, start.x + 80, start.y],
            stroke: '#00ffff',
            strokeWidth: 3,
          };
        }

        if (newShape) {
          console.log('✅ Created shape:', newShape);
          onShapesChange([...shapes, newShape]);
        }
      }

      setDrawingState({ isDrawing: false, startPoint: null });
    };

    stage.on('mousedown touchstart', handleMouseDown);
    stage.on('mousemove touchmove', handleMouseMove);
    stage.on('mouseup touchend mouseleave', handleMouseUp);

    return () => {
      stage.off('mousedown touchstart', handleMouseDown);
      stage.off('mousemove touchmove', handleMouseMove);
      stage.off('mouseup touchend mouseleave', handleMouseUp);
    };
  }, [activeTool, shapes, blanks, readOnly, drawingState, onShapesChange, onBlanksChange]);

  const getCursor = () => {
    if (readOnly) return 'default';
    if (activeTool === 'select') return 'default';
    if (activeTool === 'delete') return 'not-allowed';
    return 'crosshair';
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: width,
        height: height,
        border: '3px solid #00ffff',
        borderRadius: 8,
        cursor: getCursor(),
        overflow: 'hidden',
      }}
    />
  );
};

// Separate function to draw canvas content
function drawCanvas(
  layer: Konva.Layer,
  shapes: DiagramShape[],
  blanks: BlankField[],
  selectedShapeId: string | null,
  width: number,
  height: number
) {
  // Clear everything
  layer.destroyChildren();

  // Background
  const bg = new Konva.Rect({
    x: 0,
    y: 0,
    width: width,
    height: height,
    fill: '#1a1a2e',
  });
  layer.add(bg);

  // Grid
  for (let i = 0; i <= width; i += GRID_SIZE) {
    layer.add(new Konva.Line({
      points: [i, 0, i, height],
      stroke: i % (GRID_SIZE * 5) === 0 ? '#3b4d6b' : '#2a2a4e',
      strokeWidth: i % (GRID_SIZE * 5) === 0 ? 1 : 0.5,
    }));
  }
  for (let i = 0; i <= height; i += GRID_SIZE) {
    layer.add(new Konva.Line({
      points: [0, i, width, i],
      stroke: i % (GRID_SIZE * 5) === 0 ? '#3b4d6b' : '#2a2a4e',
      strokeWidth: i % (GRID_SIZE * 5) === 0 ? 1 : 0.5,
    }));
  }

  // Draw shapes
  shapes.forEach((shape) => {
    const isSelected = selectedShapeId === shape.id;
    const strokeColor = isSelected ? '#ff69b4' : (shape.stroke || '#00ffff');
    const fillColor = isSelected ? '#ff69b4' : (shape.fill || '#00ffff');

    if (shape.type === 'line') {
      layer.add(new Konva.Line({
        points: shape.points || [],
        stroke: strokeColor,
        strokeWidth: isSelected ? 5 : (shape.strokeWidth || 3),
        lineCap: 'round',
        lineJoin: 'round',
      }));
    } else if (shape.type === 'arrow') {
      layer.add(new Konva.Arrow({
        points: shape.points || [],
        stroke: strokeColor,
        fill: fillColor,
        strokeWidth: isSelected ? 5 : (shape.strokeWidth || 3),
        pointerLength: shape.pointerLength || 12,
        pointerWidth: shape.pointerWidth || 10,
      }));
    } else if (shape.type === 'circle') {
      layer.add(new Konva.Circle({
        x: shape.x || 0,
        y: shape.y || 0,
        radius: shape.radius || 50,
        stroke: strokeColor,
        strokeWidth: isSelected ? 5 : (shape.strokeWidth || 3),
        fill: shape.fill === 'transparent' ? undefined : undefined,
      }));
    } else if (shape.type === 'text') {
      layer.add(new Konva.Text({
        x: shape.x || 0,
        y: shape.y || 0,
        text: shape.text || 'Text',
        fontSize: shape.fontSize || 20,
        fill: isSelected ? '#ff69b4' : '#ffffff',
        fontFamily: 'Arial',
      }));
    } else if (shape.type === 'point') {
      layer.add(new Konva.Circle({
        x: shape.x || 0,
        y: shape.y || 0,
        radius: 6,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: 2,
      }));
    } else if (shape.type === 'angle') {
      const pts = shape.points || [0, 0, 100, 0, 0, -100];
      layer.add(new Konva.Line({
        points: [pts[0], pts[1], pts[2], pts[3]],
        stroke: strokeColor,
        strokeWidth: isSelected ? 5 : 3,
        lineCap: 'round',
      }));
      layer.add(new Konva.Line({
        points: [pts[0], pts[1], pts[4], pts[5]],
        stroke: strokeColor,
        strokeWidth: isSelected ? 5 : 3,
        lineCap: 'round',
      }));
      layer.add(new Konva.Arc({
        x: pts[0],
        y: pts[1],
        innerRadius: 25,
        outerRadius: 25,
        angle: 45,
        rotation: -45,
        stroke: strokeColor,
        strokeWidth: 2,
      }));
    }
  });

  // Draw blanks
  blanks.forEach((blank) => {
    const isSelected = selectedShapeId === blank.id;
    layer.add(new Konva.Rect({
      x: blank.x,
      y: blank.y,
      width: blank.width,
      height: blank.height,
      fill: '#1e3a5f',
      stroke: isSelected ? '#ff69b4' : '#00ffff',
      strokeWidth: 3,
      cornerRadius: 4,
    }));
    layer.add(new Konva.Text({
      x: blank.x,
      y: blank.y + 5,
      width: blank.width,
      text: '?',
      fontSize: 20,
      fill: '#00ffff',
      align: 'center',
    }));
  });

  // Force draw
  layer.batchDraw();
  console.log('✅ Canvas drawn with', shapes.length, 'shapes');
}

export default KonvaCanvasEditor;
