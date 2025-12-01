import React, { useRef, useEffect, useState, useCallback } from 'react';
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
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
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
  onEditText?: (shapeId: string, currentText: string) => void;
}

// Smaller grid for smoother positioning
const GRID_SIZE = 5;
const MAJOR_GRID_SIZE = 50;

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
  readOnly = false,
  onEditText
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageObjRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const isInitializedRef = useRef(false);
  
  const [drawingState, setDrawingState] = useState<{
    isDrawing: boolean;
    startPoint: { x: number; y: number } | null;
  }>({ isDrawing: false, startPoint: null });

  // Soft snap - only snap if very close to grid, otherwise use exact position
  const softSnap = (v: number, threshold: number = 3) => {
    const nearest = Math.round(v / GRID_SIZE) * GRID_SIZE;
    return Math.abs(v - nearest) < threshold ? nearest : v;
  };

  // Refs for current state (to use in Konva event handlers)
  const shapesRef = useRef(shapes);
  const blanksRef = useRef(blanks);
  const activeToolRef = useRef(activeTool);
  const selectedShapeIdRef = useRef(selectedShapeId);

  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { blanksRef.current = blanks; }, [blanks]);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { selectedShapeIdRef.current = selectedShapeId; }, [selectedShapeId]);

  // Update shape after drag (no forced snap)
  const handleShapeDrag = useCallback((shapeId: string, newX: number, newY: number, isLine: boolean, newPoints?: number[]) => {
    const currentShapes = shapesRef.current;
    if (!currentShapes) return;
    onShapesChange(currentShapes.map(s => {
      if (s.id === shapeId) {
        if (isLine && newPoints) {
          return { ...s, points: newPoints };
        }
        return { ...s, x: newX, y: newY };
      }
      return s;
    }));
  }, [onShapesChange]);

  // Update shape after transform (scale/rotate)
  const handleShapeTransform = useCallback((shapeId: string, attrs: Partial<DiagramShape>) => {
    const currentShapes = shapesRef.current;
    if (!currentShapes) return;
    onShapesChange(currentShapes.map(s => 
      s.id === shapeId ? { ...s, ...attrs } : s
    ));
  }, [onShapesChange]);

  const handleBlankDrag = useCallback((blankId: string, newX: number, newY: number) => {
    const currentBlanks = blanksRef.current;
    if (!currentBlanks) return;
    onBlanksChange(currentBlanks.map(b => 
      b.id === blankId ? { ...b, x: newX, y: newY } : b
    ));
  }, [onBlanksChange]);

  // Initialize Konva stage ONCE
  useEffect(() => {
    if (!containerRef.current || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const stage = new Konva.Stage({
      container: containerRef.current,
      width: width,
      height: height,
    });

    const layer = new Konva.Layer();
    stage.add(layer);

    // Create transformer for resizing shapes
    const transformer = new Konva.Transformer({
      rotateEnabled: true,
      enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center'],
      boundBoxFunc: (oldBox, newBox) => {
        if (newBox.width < 10 || newBox.height < 10) {
          return oldBox;
        }
        return newBox;
      },
      anchorSize: 10,
      anchorCornerRadius: 3,
      anchorStroke: '#00ffff',
      anchorFill: '#1a1a2e',
      borderStroke: '#ff69b4',
      borderDash: [4, 4],
    });
    layer.add(transformer);
    transformerRef.current = transformer;

    // Force canvas visibility (fix for light-mode CSS)
    const canvases = stage.content?.querySelectorAll('canvas');
    if (canvases) {
      canvases.forEach((canvas) => {
        (canvas as HTMLCanvasElement).style.display = 'block';
      });
    }

    stageObjRef.current = stage;
    layerRef.current = layer;
    
    if (stageRef) {
      (stageRef as React.MutableRefObject<Konva.Stage | null>).current = stage;
    }

    return () => {};
  }, []);

  // Update stage size
  useEffect(() => {
    if (stageObjRef.current) {
      stageObjRef.current.width(width);
      stageObjRef.current.height(height);
    }
  }, [width, height]);

  // Main draw function
  const drawCanvas = useCallback(() => {
    const layer = layerRef.current;
    const stage = stageObjRef.current;
    const transformer = transformerRef.current;
    if (!layer || !stage) return;

    // Remove all except transformer
    layer.children?.forEach(child => {
      if (child !== transformer) {
        child.destroy();
      }
    });

    // Background
    layer.add(new Konva.Rect({
      x: 0, y: 0, width, height,
      fill: '#1a1a2e',
      name: 'background',
    }));

    // Grid - major lines only for cleaner look
    for (let i = 0; i <= width; i += MAJOR_GRID_SIZE) {
      layer.add(new Konva.Line({
        points: [i, 0, i, height],
        stroke: '#2a3a5e',
        strokeWidth: 1,
        listening: false,
      }));
    }
    for (let i = 0; i <= height; i += MAJOR_GRID_SIZE) {
      layer.add(new Konva.Line({
        points: [0, i, width, i],
        stroke: '#2a3a5e',
        strokeWidth: 1,
        listening: false,
      }));
    }

    // Minor grid dots for guidance
    for (let x = 0; x <= width; x += GRID_SIZE * 2) {
      for (let y = 0; y <= height; y += GRID_SIZE * 2) {
        if (x % MAJOR_GRID_SIZE !== 0 || y % MAJOR_GRID_SIZE !== 0) {
          layer.add(new Konva.Circle({
            x, y,
            radius: 0.5,
            fill: '#3a4a6e',
            listening: false,
          }));
        }
      }
    }

    let selectedNode: Konva.Node | null = null;

    // Draw shapes with interactivity
    shapes.forEach((shape) => {
      const isSelected = selectedShapeId === shape.id;
      const strokeColor = isSelected ? '#ff69b4' : (shape.stroke || '#00ffff');
      const fillColor = isSelected ? '#ff69b4' : (shape.fill || '#00ffff');
      const canDrag = activeTool === 'select' && !readOnly;

      let konvaShape: Konva.Shape | Konva.Group | null = null;

      if (shape.type === 'line') {
        const line = new Konva.Line({
          points: shape.points || [],
          stroke: strokeColor,
          strokeWidth: isSelected ? 4 : (shape.strokeWidth || 3),
          lineCap: 'round',
          lineJoin: 'round',
          draggable: canDrag,
          hitStrokeWidth: 20,
          name: 'shape',
        });
        
        line.on('click tap', () => {
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (activeToolRef.current === 'select') {
            onSelectShape(shape.id);
          }
        });
        
        line.on('dragend', () => {
          const oldPoints = shape.points || [];
          const dx = line.x();
          const dy = line.y();
          const newPoints = oldPoints.map((p, i) => i % 2 === 0 ? softSnap(p + dx) : softSnap(p + dy));
          line.position({ x: 0, y: 0 });
          handleShapeDrag(shape.id, 0, 0, true, newPoints);
        });
        
        konvaShape = line;
        if (isSelected) selectedNode = line;
      } 
      else if (shape.type === 'arrow') {
        const arrow = new Konva.Arrow({
          points: shape.points || [],
          stroke: strokeColor,
          fill: fillColor,
          strokeWidth: isSelected ? 4 : (shape.strokeWidth || 3),
          pointerLength: shape.pointerLength || 12,
          pointerWidth: shape.pointerWidth || 10,
          draggable: canDrag,
          hitStrokeWidth: 20,
          name: 'shape',
        });
        
        arrow.on('click tap', () => {
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (activeToolRef.current === 'select') {
            onSelectShape(shape.id);
          }
        });
        
        arrow.on('dragend', () => {
          const oldPoints = shape.points || [];
          const dx = arrow.x();
          const dy = arrow.y();
          const newPoints = oldPoints.map((p, i) => i % 2 === 0 ? softSnap(p + dx) : softSnap(p + dy));
          arrow.position({ x: 0, y: 0 });
          handleShapeDrag(shape.id, 0, 0, true, newPoints);
        });
        
        konvaShape = arrow;
        if (isSelected) selectedNode = arrow;
      }
      else if (shape.type === 'circle') {
        const circle = new Konva.Circle({
          x: shape.x || 0,
          y: shape.y || 0,
          radius: shape.radius || 50,
          stroke: strokeColor,
          strokeWidth: isSelected ? 4 : (shape.strokeWidth || 3),
          fill: shape.fill === 'transparent' ? undefined : undefined,
          draggable: canDrag,
          scaleX: shape.scaleX || 1,
          scaleY: shape.scaleY || 1,
          name: 'shape',
        });
        
        circle.on('click tap', () => {
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (activeToolRef.current === 'select') {
            onSelectShape(shape.id);
          }
        });
        
        circle.on('dragend', () => {
          handleShapeDrag(shape.id, softSnap(circle.x()), softSnap(circle.y()), false);
        });

        circle.on('transformend', () => {
          handleShapeTransform(shape.id, {
            x: circle.x(),
            y: circle.y(),
            scaleX: circle.scaleX(),
            scaleY: circle.scaleY(),
            rotation: circle.rotation(),
          });
        });
        
        konvaShape = circle;
        if (isSelected) selectedNode = circle;
      }
      else if (shape.type === 'point') {
        const point = new Konva.Circle({
          x: shape.x || 0,
          y: shape.y || 0,
          radius: 6,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: 2,
          draggable: canDrag,
          name: 'shape',
        });
        
        point.on('click tap', () => {
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (activeToolRef.current === 'select') {
            onSelectShape(shape.id);
          }
        });
        
        point.on('dragend', () => {
          handleShapeDrag(shape.id, softSnap(point.x()), softSnap(point.y()), false);
        });
        
        konvaShape = point;
        if (isSelected) selectedNode = point;
      }
      else if (shape.type === 'text') {
        const text = new Konva.Text({
          x: shape.x || 0,
          y: shape.y || 0,
          text: shape.text || 'Text',
          fontSize: shape.fontSize || 20,
          fill: isSelected ? '#ff69b4' : (shape.fill || '#ffffff'),
          fontFamily: (shape['fontFamily'] as string) || 'Arial',
          draggable: canDrag,
          scaleX: shape.scaleX || 1,
          scaleY: shape.scaleY || 1,
          name: 'shape',
        });
        
        text.on('click tap', () => {
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (activeToolRef.current === 'select') {
            onSelectShape(shape.id);
          }
        });
        
        text.on('dblclick dbltap', () => {
          if (onEditText) {
            onEditText(shape.id, shape.text || 'Text');
          }
        });
        
        text.on('dragend', () => {
          handleShapeDrag(shape.id, text.x(), text.y(), false);
        });

        text.on('transformend', () => {
          const newFontSize = Math.round((shape.fontSize || 20) * text.scaleX());
          text.scaleX(1);
          text.scaleY(1);
          handleShapeTransform(shape.id, {
            x: text.x(),
            y: text.y(),
            fontSize: newFontSize,
            rotation: text.rotation(),
          });
        });
        
        konvaShape = text;
        if (isSelected) selectedNode = text;
      }
      else if (shape.type === 'angle') {
        const pts = shape.points || [0, 0, 100, 0, 0, -100];
        const group = new Konva.Group({ 
          draggable: canDrag,
          name: 'shape',
        });
        
        group.add(new Konva.Line({
          points: [pts[0], pts[1], pts[2], pts[3]],
          stroke: strokeColor,
          strokeWidth: isSelected ? 4 : 3,
          lineCap: 'round',
        }));
        group.add(new Konva.Line({
          points: [pts[0], pts[1], pts[4], pts[5]],
          stroke: strokeColor,
          strokeWidth: isSelected ? 4 : 3,
          lineCap: 'round',
        }));
        group.add(new Konva.Arc({
          x: pts[0],
          y: pts[1],
          innerRadius: 25,
          outerRadius: 25,
          angle: 45,
          rotation: -45,
          stroke: strokeColor,
          strokeWidth: 2,
        }));
        
        group.on('click tap', () => {
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (activeToolRef.current === 'select') {
            onSelectShape(shape.id);
          }
        });
        
        group.on('dragend', () => {
          const dx = group.x();
          const dy = group.y();
          const newPoints = pts.map((p, i) => i % 2 === 0 ? softSnap(p + dx) : softSnap(p + dy));
          group.position({ x: 0, y: 0 });
          handleShapeDrag(shape.id, 0, 0, true, newPoints);
        });
        
        konvaShape = group;
        if (isSelected) selectedNode = group;
      }

      if (konvaShape) {
        layer.add(konvaShape);
      }
    });

    // Draw blanks
    blanks.forEach((blank) => {
      const isSelected = selectedShapeId === blank.id;
      const canDrag = activeTool === 'select' && !readOnly;
      
      const group = new Konva.Group({
        x: blank.x,
        y: blank.y,
        draggable: canDrag,
        name: 'shape',
      });
      
      group.add(new Konva.Rect({
        width: blank.width,
        height: blank.height,
        fill: '#1e3a5f',
        stroke: isSelected ? '#ff69b4' : '#00ffff',
        strokeWidth: 3,
        cornerRadius: 4,
      }));
      
      group.add(new Konva.Text({
        width: blank.width,
        height: blank.height,
        text: '?',
        fontSize: 20,
        fill: '#00ffff',
        align: 'center',
        verticalAlign: 'middle',
      }));
      
      group.on('click tap', () => {
        if (activeToolRef.current === 'delete' && blanksRef.current) {
          onBlanksChange(blanksRef.current.filter(b => b.id !== blank.id));
        } else if (activeToolRef.current === 'select') {
          onSelectShape(blank.id);
        }
      });
      
      group.on('dragend', () => {
        handleBlankDrag(blank.id, group.x(), group.y());
      });
      
      layer.add(group);
      if (isSelected) selectedNode = group;
    });

    // Update transformer
    if (transformer) {
      if (selectedNode && activeTool === 'select') {
        transformer.nodes([selectedNode]);
        transformer.moveToTop();
      } else {
        transformer.nodes([]);
      }
    }

    layer.batchDraw();
  }, [shapes, blanks, selectedShapeId, activeTool, width, height, readOnly, onShapesChange, onBlanksChange, onSelectShape, onEditText, handleShapeDrag, handleBlankDrag, handleShapeTransform]);

  // Redraw when state changes
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Handle drawing new shapes
  useEffect(() => {
    const stage = stageObjRef.current;
    const layer = layerRef.current;
    if (!stage || !layer) return;

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (readOnly) return;
      
      // If clicking on an interactive shape (not background/grid), don't start drawing
      const target = e.target;
      const targetName = target.name ? target.name() : '';
      const isBackground = target === stage || targetName === 'background';
      if (!isBackground && activeToolRef.current !== 'select' && activeToolRef.current !== 'delete') return;
      
      const pos = stage.getPointerPosition();
      if (!pos) return;
      
      // Use exact position for fluid drawing
      const tool = activeToolRef.current;

      if (tool === 'select') {
        onSelectShape(null); // Deselect when clicking background
        return;
      }

      if (tool === 'text') {
        const newShape: DiagramShape = {
          id: generateShapeId('text'),
          type: 'text',
          x: pos.x,
          y: pos.y,
          text: 'Text',
          fontSize: 20,
          fill: '#ffffff'
        };
        onShapesChange([...(shapesRef.current || []), newShape]);
        return;
      }

      if (tool === 'point') {
        const newShape: DiagramShape = {
          id: generateShapeId('point'),
          type: 'point',
          x: pos.x,
          y: pos.y,
          radius: 6,
          fill: '#00ffff',
          stroke: '#00ffff',
          strokeWidth: 2
        };
        onShapesChange([...(shapesRef.current || []), newShape]);
        return;
      }

      if (tool === 'blank') {
        const newBlank: BlankField = {
          id: generateShapeId('blank'),
          type: 'blank',
          x: pos.x,
          y: pos.y,
          width: 60,
          height: 30,
          expectedAnswer: ''
        };
        onBlanksChange([...(blanksRef.current || []), newBlank]);
        return;
      }

      if (['line', 'arrow', 'circle', 'angle'].includes(tool || '')) {
        setDrawingState({ isDrawing: true, startPoint: pos });
      }
    };

    const handleMouseMove = () => {
      if (!drawingState.isDrawing || !drawingState.startPoint) return;
      
      const pos = stage.getPointerPosition();
      if (!pos) return;
      
      const start = drawingState.startPoint;
      const tool = activeToolRef.current;

      const oldPreview = layer.findOne('#preview');
      if (oldPreview) oldPreview.destroy();

      let preview: Konva.Shape | Konva.Group | null = null;

      if (tool === 'line') {
        preview = new Konva.Line({
          id: 'preview',
          points: [start.x, start.y, pos.x, pos.y],
          stroke: '#ffff00',
          strokeWidth: 3,
          dash: [8, 4],
          lineCap: 'round',
        });
      } else if (tool === 'arrow') {
        preview = new Konva.Arrow({
          id: 'preview',
          points: [start.x, start.y, pos.x, pos.y],
          stroke: '#ffff00',
          fill: '#ffff00',
          strokeWidth: 3,
          pointerLength: 12,
          pointerWidth: 10,
          dash: [8, 4],
        });
      } else if (tool === 'circle') {
        const dx = pos.x - start.x;
        const dy = pos.y - start.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        preview = new Konva.Circle({
          id: 'preview',
          x: start.x,
          y: start.y,
          radius: radius,
          stroke: '#ffff00',
          strokeWidth: 3,
          dash: [8, 4],
        });
      } else if (tool === 'angle') {
        const group = new Konva.Group({ id: 'preview' });
        group.add(new Konva.Line({
          points: [start.x, start.y, pos.x, pos.y],
          stroke: '#ffff00',
          strokeWidth: 3,
          dash: [8, 4],
        }));
        group.add(new Konva.Line({
          points: [start.x, start.y, start.x + 80, start.y],
          stroke: '#ffff00',
          strokeWidth: 3,
          dash: [8, 4],
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
      const tool = activeToolRef.current;

      const oldPreview = layer.findOne('#preview');
      if (oldPreview) oldPreview.destroy();

      if (pos) {
        let newShape: DiagramShape | null = null;

        // Minimum distance check to avoid accidental tiny shapes
        const dx = pos.x - start.x;
        const dy = pos.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 5) {
          if (tool === 'line') {
            newShape = {
              id: generateShapeId('line'),
              type: 'line',
              points: [start.x, start.y, pos.x, pos.y],
              stroke: '#00ffff',
              strokeWidth: 3,
            };
          } else if (tool === 'arrow') {
            newShape = {
              id: generateShapeId('arrow'),
              type: 'arrow',
              points: [start.x, start.y, pos.x, pos.y],
              stroke: '#00ffff',
              fill: '#00ffff',
              strokeWidth: 3,
              pointerLength: 12,
              pointerWidth: 10,
            };
          } else if (tool === 'circle') {
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
          } else if (tool === 'angle') {
            newShape = {
              id: generateShapeId('angle'),
              type: 'angle',
              points: [start.x, start.y, pos.x, pos.y, start.x + 80, start.y],
              stroke: '#00ffff',
              strokeWidth: 3,
            };
          }
        }

        if (newShape) {
          onShapesChange([...(shapesRef.current || []), newShape]);
        }
      }

      setDrawingState({ isDrawing: false, startPoint: null });
    };

    stage.on('mousedown touchstart', handleMouseDown);
    stage.on('mousemove touchmove', handleMouseMove);
    stage.on('mouseup touchend mouseleave', handleMouseUp);

    return () => {
      stage.off('mousedown touchstart');
      stage.off('mousemove touchmove');
      stage.off('mouseup touchend mouseleave');
    };
  }, [readOnly, drawingState, onShapesChange, onBlanksChange, onSelectShape]);

  const getCursor = () => {
    if (readOnly) return 'default';
    if (activeTool === 'select') return 'move';
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

export default KonvaCanvasEditor;
