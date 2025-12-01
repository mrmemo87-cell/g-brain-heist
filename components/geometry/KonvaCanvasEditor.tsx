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
  width?: number;
  height?: number;
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

// Minimal grid for performance
const GRID_SIZE = 50;

const KonvaCanvasEditor: React.FC<KonvaCanvasEditorProps> = ({
  width: propWidth,
  height: propHeight = 450,
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
  const gridLayerRef = useRef<Konva.Layer | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const isInitializedRef = useRef(false);
  const [canvasSize, setCanvasSize] = useState({ width: propWidth || 800, height: propHeight });
  const [cursorStyle, setCursorStyle] = useState('default');
  
  const [drawingState, setDrawingState] = useState<{
    isDrawing: boolean;
    startPoint: { x: number; y: number } | null;
  }>({ isDrawing: false, startPoint: null });

  // Refs for current state
  const shapesRef = useRef<DiagramShape[]>(shapes);
  const blanksRef = useRef<BlankField[]>(blanks);
  const activeToolRef = useRef(activeTool);

  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { blanksRef.current = blanks; }, [blanks]);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  // Responsive width
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current?.parentElement) {
        const parentWidth = containerRef.current.parentElement.clientWidth;
        setCanvasSize({ width: parentWidth, height: propHeight });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [propHeight]);

  // Update cursor based on tool
  useEffect(() => {
    if (readOnly) {
      setCursorStyle('default');
    } else if (activeTool === 'select') {
      setCursorStyle('default');
    } else if (activeTool === 'delete') {
      setCursorStyle('not-allowed');
    } else {
      setCursorStyle('crosshair');
    }
  }, [activeTool, readOnly]);

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
      width: canvasSize.width,
      height: canvasSize.height,
    });

    // Separate layer for static grid (performance)
    const gridLayer = new Konva.Layer({ listening: false });
    stage.add(gridLayer);
    gridLayerRef.current = gridLayer;

    // Main layer for shapes
    const layer = new Konva.Layer();
    stage.add(layer);
    layerRef.current = layer;

    // Lightweight transformer
    const transformer = new Konva.Transformer({
      rotateEnabled: true,
      rotateAnchorOffset: 20,
      enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      anchorSize: 8,
      anchorCornerRadius: 2,
      anchorStroke: '#06b6d4',
      anchorFill: '#0f172a',
      anchorStrokeWidth: 1,
      borderStroke: '#06b6d4',
      borderStrokeWidth: 1,
      borderDash: [3, 3],
      padding: 2,
      rotateAnchorCursor: 'grab',
    });
    layer.add(transformer);
    transformerRef.current = transformer;

    stageObjRef.current = stage;
    
    if (stageRef) {
      (stageRef as React.MutableRefObject<Konva.Stage | null>).current = stage;
    }

    return () => {};
  }, []);

  // Update stage size
  useEffect(() => {
    const stage = stageObjRef.current;
    if (stage) {
      stage.width(canvasSize.width);
      stage.height(canvasSize.height);
      drawGrid();
    }
  }, [canvasSize]);

  // Draw static grid once
  const drawGrid = useCallback(() => {
    const gridLayer = gridLayerRef.current;
    if (!gridLayer) return;
    
    gridLayer.destroyChildren();
    const { width, height } = canvasSize;

    // Background
    gridLayer.add(new Konva.Rect({
      x: 0, y: 0, width, height,
      fill: '#0f172a',
    }));

    // Subtle grid lines only
    for (let i = 0; i <= width; i += GRID_SIZE) {
      gridLayer.add(new Konva.Line({
        points: [i, 0, i, height],
        stroke: '#1e293b',
        strokeWidth: 1,
      }));
    }
    for (let i = 0; i <= height; i += GRID_SIZE) {
      gridLayer.add(new Konva.Line({
        points: [0, i, width, i],
        stroke: '#1e293b',
        strokeWidth: 1,
      }));
    }

    gridLayer.batchDraw();
  }, [canvasSize]);

  // Main draw function - optimized
  const drawCanvas = useCallback(() => {
    const layer = layerRef.current;
    const transformer = transformerRef.current;
    if (!layer) return;

    // Clear shapes only, keep transformer
    const children = layer.children?.slice() || [];
    children.forEach(child => {
      if (child !== transformer) child.destroy();
    });

    let selectedNode: Konva.Node | null = null;
    const canDrag = activeTool === 'select' && !readOnly;

    // Draw shapes
    shapes.forEach((shape) => {
      const isSelected = selectedShapeId === shape.id;
      const strokeColor = isSelected ? '#f472b6' : (shape.stroke || '#06b6d4');
      const fillColor = isSelected ? '#f472b6' : (shape.fill || '#06b6d4');

      let konvaShape: Konva.Shape | Konva.Group | null = null;

      if (shape.type === 'line') {
        konvaShape = new Konva.Line({
          points: shape.points || [],
          stroke: strokeColor,
          strokeWidth: shape.strokeWidth || 2,
          lineCap: 'round',
          lineJoin: 'round',
          draggable: canDrag,
          hitStrokeWidth: 15,
          perfectDrawEnabled: false,
        });
        
        konvaShape.on('click tap', () => {
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (activeToolRef.current === 'select') {
            onSelectShape(shape.id);
          }
        });
        
        konvaShape.on('dragend', function() {
          const line = this as Konva.Line;
          const oldPoints = shape.points || [];
          const dx = line.x();
          const dy = line.y();
          const newPoints = oldPoints.map((p, i) => i % 2 === 0 ? p + dx : p + dy);
          line.position({ x: 0, y: 0 });
          handleShapeDrag(shape.id, 0, 0, true, newPoints);
        });

        konvaShape.on('mouseenter', () => canDrag && setCursorStyle('move'));
        konvaShape.on('mouseleave', () => canDrag && setCursorStyle('default'));
      } 
      else if (shape.type === 'arrow') {
        konvaShape = new Konva.Arrow({
          points: shape.points || [],
          stroke: strokeColor,
          fill: fillColor,
          strokeWidth: shape.strokeWidth || 2,
          pointerLength: 10,
          pointerWidth: 8,
          draggable: canDrag,
          hitStrokeWidth: 15,
          perfectDrawEnabled: false,
        });
        
        konvaShape.on('click tap', () => {
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (activeToolRef.current === 'select') {
            onSelectShape(shape.id);
          }
        });
        
        konvaShape.on('dragend', function() {
          const arrow = this as Konva.Arrow;
          const oldPoints = shape.points || [];
          const dx = arrow.x();
          const dy = arrow.y();
          const newPoints = oldPoints.map((p, i) => i % 2 === 0 ? p + dx : p + dy);
          arrow.position({ x: 0, y: 0 });
          handleShapeDrag(shape.id, 0, 0, true, newPoints);
        });

        konvaShape.on('mouseenter', () => canDrag && setCursorStyle('move'));
        konvaShape.on('mouseleave', () => canDrag && setCursorStyle('default'));
      }
      else if (shape.type === 'circle') {
        konvaShape = new Konva.Circle({
          x: shape.x || 0,
          y: shape.y || 0,
          radius: shape.radius || 50,
          stroke: strokeColor,
          strokeWidth: shape.strokeWidth || 2,
          draggable: canDrag,
          scaleX: shape.scaleX || 1,
          scaleY: shape.scaleY || 1,
          rotation: shape.rotation || 0,
          perfectDrawEnabled: false,
        });
        
        konvaShape.on('click tap', () => {
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (activeToolRef.current === 'select') {
            onSelectShape(shape.id);
          }
        });
        
        konvaShape.on('dragend', function() {
          const circle = this as Konva.Circle;
          handleShapeDrag(shape.id, circle.x(), circle.y(), false);
        });

        konvaShape.on('transformend', function() {
          const circle = this as Konva.Circle;
          handleShapeTransform(shape.id, {
            x: circle.x(),
            y: circle.y(),
            scaleX: circle.scaleX(),
            scaleY: circle.scaleY(),
            rotation: circle.rotation(),
          });
        });

        konvaShape.on('mouseenter', () => canDrag && setCursorStyle('move'));
        konvaShape.on('mouseleave', () => canDrag && setCursorStyle('default'));
      }
      else if (shape.type === 'point') {
        konvaShape = new Konva.Circle({
          x: shape.x || 0,
          y: shape.y || 0,
          radius: 5,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: 1,
          draggable: canDrag,
          perfectDrawEnabled: false,
        });
        
        konvaShape.on('click tap', () => {
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (activeToolRef.current === 'select') {
            onSelectShape(shape.id);
          }
        });
        
        konvaShape.on('dragend', function() {
          const point = this as Konva.Circle;
          handleShapeDrag(shape.id, point.x(), point.y(), false);
        });

        konvaShape.on('mouseenter', () => canDrag && setCursorStyle('move'));
        konvaShape.on('mouseleave', () => canDrag && setCursorStyle('default'));
      }
      else if (shape.type === 'text') {
        konvaShape = new Konva.Text({
          x: shape.x || 0,
          y: shape.y || 0,
          text: shape.text || 'Text',
          fontSize: shape.fontSize || 18,
          fill: isSelected ? '#f472b6' : (shape.fill || '#e2e8f0'),
          fontFamily: 'Inter, system-ui, sans-serif',
          draggable: canDrag,
          perfectDrawEnabled: false,
        });
        
        konvaShape.on('click tap', () => {
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (activeToolRef.current === 'select') {
            onSelectShape(shape.id);
          }
        });
        
        konvaShape.on('dblclick dbltap', () => {
          if (onEditText) onEditText(shape.id, shape.text || 'Text');
        });
        
        konvaShape.on('dragend', function() {
          const text = this as Konva.Text;
          handleShapeDrag(shape.id, text.x(), text.y(), false);
        });

        konvaShape.on('transformend', function() {
          const text = this as Konva.Text;
          const newFontSize = Math.round((shape.fontSize || 18) * text.scaleX());
          text.scaleX(1);
          text.scaleY(1);
          handleShapeTransform(shape.id, {
            x: text.x(),
            y: text.y(),
            fontSize: Math.max(10, newFontSize),
            rotation: text.rotation(),
          });
        });

        konvaShape.on('mouseenter', () => canDrag && setCursorStyle('move'));
        konvaShape.on('mouseleave', () => canDrag && setCursorStyle('default'));
      }
      else if (shape.type === 'angle') {
        const pts = shape.points || [0, 0, 80, 0, 0, -80];
        const group = new Konva.Group({ draggable: canDrag });
        
        group.add(new Konva.Line({
          points: [pts[0], pts[1], pts[2], pts[3]],
          stroke: strokeColor,
          strokeWidth: 2,
          lineCap: 'round',
        }));
        group.add(new Konva.Line({
          points: [pts[0], pts[1], pts[4], pts[5]],
          stroke: strokeColor,
          strokeWidth: 2,
          lineCap: 'round',
        }));
        group.add(new Konva.Arc({
          x: pts[0],
          y: pts[1],
          innerRadius: 20,
          outerRadius: 20,
          angle: 45,
          rotation: -45,
          stroke: strokeColor,
          strokeWidth: 1,
        }));
        
        group.on('click tap', () => {
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (activeToolRef.current === 'select') {
            onSelectShape(shape.id);
          }
        });
        
        group.on('dragend', function() {
          const g = this as Konva.Group;
          const dx = g.x();
          const dy = g.y();
          const newPoints = pts.map((p, i) => i % 2 === 0 ? p + dx : p + dy);
          g.position({ x: 0, y: 0 });
          handleShapeDrag(shape.id, 0, 0, true, newPoints);
        });

        group.on('mouseenter', () => canDrag && setCursorStyle('move'));
        group.on('mouseleave', () => canDrag && setCursorStyle('default'));

        konvaShape = group;
      }

      if (konvaShape) {
        layer.add(konvaShape);
        if (isSelected) selectedNode = konvaShape;
      }
    });

    // Draw blanks
    blanks.forEach((blank) => {
      const isSelected = selectedShapeId === blank.id;
      
      const group = new Konva.Group({
        x: blank.x,
        y: blank.y,
        draggable: canDrag,
      });
      
      group.add(new Konva.Rect({
        width: blank.width,
        height: blank.height,
        fill: '#1e3a5f',
        stroke: isSelected ? '#f472b6' : '#06b6d4',
        strokeWidth: 2,
        cornerRadius: 3,
      }));
      
      group.add(new Konva.Text({
        width: blank.width,
        height: blank.height,
        text: '?',
        fontSize: 16,
        fill: '#06b6d4',
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
      
      group.on('dragend', function() {
        const g = this as Konva.Group;
        handleBlankDrag(blank.id, g.x(), g.y());
      });

      group.on('mouseenter', () => canDrag && setCursorStyle('move'));
      group.on('mouseleave', () => canDrag && setCursorStyle('default'));
      
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
  }, [shapes, blanks, selectedShapeId, activeTool, readOnly, onShapesChange, onBlanksChange, onSelectShape, onEditText, handleShapeDrag, handleBlankDrag, handleShapeTransform]);

  // Initial grid draw
  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

  // Redraw shapes when state changes
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
      
      const target = e.target;
      const isBackground = target === stage || target.getLayer() === gridLayerRef.current;
      if (!isBackground && activeToolRef.current !== 'select' && activeToolRef.current !== 'delete') return;
      
      const pos = stage.getPointerPosition();
      if (!pos) return;
      
      const tool = activeToolRef.current;

      if (tool === 'select') {
        if (isBackground) onSelectShape(null);
        return;
      }

      if (tool === 'text') {
        onShapesChange([...(shapesRef.current || []), {
          id: generateShapeId('text'),
          type: 'text',
          x: pos.x,
          y: pos.y,
          text: 'Text',
          fontSize: 18,
          fill: '#e2e8f0'
        }]);
        return;
      }

      if (tool === 'point') {
        onShapesChange([...(shapesRef.current || []), {
          id: generateShapeId('point'),
          type: 'point',
          x: pos.x,
          y: pos.y,
          fill: '#06b6d4',
          stroke: '#06b6d4',
        }]);
        return;
      }

      if (tool === 'blank') {
        onBlanksChange([...(blanksRef.current || []), {
          id: generateShapeId('blank'),
          type: 'blank',
          x: pos.x,
          y: pos.y,
          width: 50,
          height: 28,
          expectedAnswer: ''
        }]);
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
          stroke: '#fbbf24',
          strokeWidth: 2,
          dash: [6, 3],
          lineCap: 'round',
        });
      } else if (tool === 'arrow') {
        preview = new Konva.Arrow({
          id: 'preview',
          points: [start.x, start.y, pos.x, pos.y],
          stroke: '#fbbf24',
          fill: '#fbbf24',
          strokeWidth: 2,
          pointerLength: 10,
          pointerWidth: 8,
          dash: [6, 3],
        });
      } else if (tool === 'circle') {
        const dx = pos.x - start.x;
        const dy = pos.y - start.y;
        preview = new Konva.Circle({
          id: 'preview',
          x: start.x,
          y: start.y,
          radius: Math.sqrt(dx * dx + dy * dy),
          stroke: '#fbbf24',
          strokeWidth: 2,
          dash: [6, 3],
        });
      } else if (tool === 'angle') {
        const group = new Konva.Group({ id: 'preview' });
        group.add(new Konva.Line({
          points: [start.x, start.y, pos.x, pos.y],
          stroke: '#fbbf24',
          strokeWidth: 2,
          dash: [6, 3],
        }));
        group.add(new Konva.Line({
          points: [start.x, start.y, start.x + 80, start.y],
          stroke: '#fbbf24',
          strokeWidth: 2,
          dash: [6, 3],
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
        const dx = pos.x - start.x;
        const dy = pos.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 8) {
          let newShape: DiagramShape | null = null;

          if (tool === 'line') {
            newShape = {
              id: generateShapeId('line'),
              type: 'line',
              points: [start.x, start.y, pos.x, pos.y],
              stroke: '#06b6d4',
              strokeWidth: 2,
            };
          } else if (tool === 'arrow') {
            newShape = {
              id: generateShapeId('arrow'),
              type: 'arrow',
              points: [start.x, start.y, pos.x, pos.y],
              stroke: '#06b6d4',
              fill: '#06b6d4',
              strokeWidth: 2,
            };
          } else if (tool === 'circle') {
            newShape = {
              id: generateShapeId('circle'),
              type: 'circle',
              x: start.x,
              y: start.y,
              radius: distance,
              stroke: '#06b6d4',
              strokeWidth: 2,
            };
          } else if (tool === 'angle') {
            newShape = {
              id: generateShapeId('angle'),
              type: 'angle',
              points: [start.x, start.y, pos.x, pos.y, start.x + 80, start.y],
              stroke: '#06b6d4',
              strokeWidth: 2,
            };
          }

          if (newShape) {
            onShapesChange([...(shapesRef.current || []), newShape]);
          }
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

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: canvasSize.height,
        border: '1px solid #334155',
        borderRadius: 6,
        cursor: cursorStyle,
        overflow: 'hidden',
        background: '#0f172a',
      }}
    />
  );
};

export default KonvaCanvasEditor;
