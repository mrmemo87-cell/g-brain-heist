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
  selectedShapeIds: string[];
  onSelectShapes: (ids: string[]) => void;
  stageRef: React.MutableRefObject<unknown>;
  readOnly?: boolean;
  onEditText?: (shapeId: string, currentText: string) => void;
  onDeleteSelected?: () => void;
}

const GRID_SIZE = 50;

const KonvaCanvasEditor: React.FC<KonvaCanvasEditorProps> = ({
  height: propHeight = 450,
  activeTool,
  shapes,
  onShapesChange,
  blanks,
  onBlanksChange,
  selectedShapeIds,
  onSelectShapes,
  stageRef,
  readOnly = false,
  onEditText,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageObjRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const gridLayerRef = useRef<Konva.Layer | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const selectionRectRef = useRef<Konva.Rect | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const isInitializedRef = useRef(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: propHeight });
  const [cursorStyle, setCursorStyle] = useState('default');
  
  const [drawingState, setDrawingState] = useState<{
    isDrawing: boolean;
    startPoint: { x: number; y: number } | null;
  }>({ isDrawing: false, startPoint: null });

  // Refs for current state
  const shapesRef = useRef<DiagramShape[]>(shapes);
  const blanksRef = useRef<BlankField[]>(blanks);
  const activeToolRef = useRef(activeTool);
  const selectedShapeIdsRef = useRef<string[]>(selectedShapeIds);

  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { blanksRef.current = blanks; }, [blanks]);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { selectedShapeIdsRef.current = selectedShapeIds; }, [selectedShapeIds]);

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
    } else if (activeTool === 'multi-select') {
      setCursorStyle('crosshair');
    } else if (activeTool === 'delete') {
      setCursorStyle('crosshair');
    } else {
      setCursorStyle('crosshair');
    }
  }, [activeTool, readOnly]);

  // Handle shape drag
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

  // Handle shape transform - PERSIST scale/rotation
  const handleShapeTransform = useCallback((shapeId: string, attrs: Partial<DiagramShape>) => {
    const currentShapes = shapesRef.current;
    if (!currentShapes) return;
    onShapesChange(currentShapes.map(s => 
      s.id === shapeId ? { ...s, ...attrs } : s
    ));
  }, [onShapesChange]);

  // Handle blank drag
  const handleBlankDrag = useCallback((blankId: string, newX: number, newY: number) => {
    const currentBlanks = blanksRef.current;
    if (!currentBlanks) return;
    onBlanksChange(currentBlanks.map(b => 
      b.id === blankId ? { ...b, x: newX, y: newY } : b
    ));
  }, [onBlanksChange]);

  // Handle blank transform - PERSIST scale
  const handleBlankTransform = useCallback((blankId: string, attrs: Partial<BlankField>) => {
    const currentBlanks = blanksRef.current;
    if (!currentBlanks) return;
    onBlanksChange(currentBlanks.map(b => 
      b.id === blankId ? { ...b, ...attrs } : b
    ));
  }, [onBlanksChange]);

  // Initialize Konva stage
  useEffect(() => {
    if (!containerRef.current || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const stage = new Konva.Stage({
      container: containerRef.current,
      width: canvasSize.width,
      height: canvasSize.height,
    });

    // Grid layer (non-interactive)
    const gridLayer = new Konva.Layer({ listening: false });
    stage.add(gridLayer);
    gridLayerRef.current = gridLayer;

    // Main layer for shapes
    const layer = new Konva.Layer();
    stage.add(layer);
    layerRef.current = layer;

    // Transformer with all anchors for full resize
    const transformer = new Konva.Transformer({
      rotateEnabled: true,
      rotateAnchorOffset: 25,
      enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center'],
      anchorSize: 10,
      anchorCornerRadius: 2,
      anchorStroke: '#06b6d4',
      anchorFill: '#1e293b',
      anchorStrokeWidth: 2,
      borderStroke: '#06b6d4',
      borderStrokeWidth: 2,
      borderDash: [4, 4],
      padding: 5,
      keepRatio: false,
    });
    layer.add(transformer);
    transformerRef.current = transformer;

    const selectionRect = new Konva.Rect({
      visible: false,
      fill: 'rgba(6, 182, 212, 0.12)',
      stroke: '#06b6d4',
      dash: [6, 4],
      listening: false,
    });
    layer.add(selectionRect);
    selectionRectRef.current = selectionRect;

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

  // Draw static grid
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

    // Grid lines
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

  // Main draw function
  const drawCanvas = useCallback(() => {
    const layer = layerRef.current;
    const transformer = transformerRef.current;
    if (!layer) return;

    // Clear shapes only, keep transformer
    const children = layer.children?.slice() || [];
    children.forEach(child => {
      if (child !== transformer) child.destroy();
    });

    const selectedIds = new Set(selectedShapeIds);
    const selectedNodes: Konva.Node[] = [];
    const canDrag = ['select', 'multi-select'].includes(activeTool) && !readOnly;

    const appendSelection = (id: string) => {
      if (activeToolRef.current === 'select') {
        onSelectShapes([id]);
      } else if (activeToolRef.current === 'multi-select') {
        const existing = selectedShapeIdsRef.current || [];
        if (existing.includes(id)) {
          onSelectShapes(existing);
        } else {
          onSelectShapes([...existing, id]);
        }
      }
    };

    // Draw shapes
    shapes.forEach((shape) => {
      const isSelected = selectedIds.has(shape.id);
      const strokeColor = isSelected ? '#f472b6' : (shape.stroke || '#06b6d4');
      const fillColor = isSelected ? '#f472b6' : (shape.fill || '#06b6d4');

      let konvaShape: Konva.Shape | Konva.Group | null = null;

      if (shape.type === 'line') {
        // For lines - don't use scaleX/scaleY, apply transform to points directly
        konvaShape = new Konva.Line({
          id: shape.id,
          points: shape.points || [],
          stroke: strokeColor,
          strokeWidth: shape.strokeWidth || 2,
          lineCap: 'round',
          lineJoin: 'round',
          draggable: canDrag,
          hitStrokeWidth: 20,
        });
        
        konvaShape.on('click tap', (e) => {
          e.cancelBubble = true;
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (['select', 'multi-select'].includes(activeToolRef.current || '')) {
            appendSelection(shape.id);
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

        konvaShape.on('transformend', function() {
          const line = this as Konva.Line;
          // Bake transform into the actual points
          const oldPoints = shape.points || [];
          const scaleX = line.scaleX();
          const scaleY = line.scaleY();
          const rotation = line.rotation() * Math.PI / 180;
          const cos = Math.cos(rotation);
          const sin = Math.sin(rotation);
          
          // Find center for rotation
          let cx = 0, cy = 0;
          for (let i = 0; i < oldPoints.length; i += 2) {
            cx += oldPoints[i];
            cy += oldPoints[i + 1];
          }
          cx /= (oldPoints.length / 2);
          cy /= (oldPoints.length / 2);
          
          const newPoints: number[] = [];
          for (let i = 0; i < oldPoints.length; i += 2) {
            // Scale relative to center
            let x = (oldPoints[i] - cx) * scaleX;
            let y = (oldPoints[i + 1] - cy) * scaleY;
            // Rotate
            const rx = x * cos - y * sin;
            const ry = x * sin + y * cos;
            // Add back center
            newPoints.push(rx + cx, ry + cy);
          }
          
          // Reset transform and update points
          line.scaleX(1);
          line.scaleY(1);
          line.rotation(0);
          line.position({ x: 0, y: 0 });
          
          handleShapeTransform(shape.id, { points: newPoints });
        });

        konvaShape.on('mouseenter', () => canDrag && setCursorStyle('move'));
        konvaShape.on('mouseleave', () => setCursorStyle(activeToolRef.current === 'select' ? 'default' : 'crosshair'));
      }
      else if (shape.type === 'arrow') {
        // For arrows - don't use scaleX/scaleY, apply transform to points directly
        konvaShape = new Konva.Arrow({
          id: shape.id,
          points: shape.points || [],
          stroke: strokeColor,
          fill: fillColor,
          strokeWidth: shape.strokeWidth || 2,
          pointerLength: 10,
          pointerWidth: 8,
          draggable: canDrag,
          hitStrokeWidth: 20,
        });
        
        konvaShape.on('click tap', (e) => {
          e.cancelBubble = true;
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (['select', 'multi-select'].includes(activeToolRef.current || '')) {
            appendSelection(shape.id);
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

        konvaShape.on('transformend', function() {
          const arrow = this as Konva.Arrow;
          // Bake transform into the actual points
          const oldPoints = shape.points || [];
          const scaleX = arrow.scaleX();
          const scaleY = arrow.scaleY();
          const rotation = arrow.rotation() * Math.PI / 180;
          const cos = Math.cos(rotation);
          const sin = Math.sin(rotation);
          
          // Find center for rotation
          let cx = 0, cy = 0;
          for (let i = 0; i < oldPoints.length; i += 2) {
            cx += oldPoints[i];
            cy += oldPoints[i + 1];
          }
          cx /= (oldPoints.length / 2);
          cy /= (oldPoints.length / 2);
          
          const newPoints: number[] = [];
          for (let i = 0; i < oldPoints.length; i += 2) {
            // Scale relative to center
            let x = (oldPoints[i] - cx) * scaleX;
            let y = (oldPoints[i + 1] - cy) * scaleY;
            // Rotate
            const rx = x * cos - y * sin;
            const ry = x * sin + y * cos;
            // Add back center
            newPoints.push(rx + cx, ry + cy);
          }
          
          // Reset transform and update points
          arrow.scaleX(1);
          arrow.scaleY(1);
          arrow.rotation(0);
          arrow.position({ x: 0, y: 0 });
          
          handleShapeTransform(shape.id, { points: newPoints });
        });

        konvaShape.on('mouseenter', () => canDrag && setCursorStyle('move'));
        konvaShape.on('mouseleave', () => setCursorStyle(activeToolRef.current === 'select' ? 'default' : 'crosshair'));
      }
      else if (shape.type === 'circle') {
        // For circles - bake scale into radius
        konvaShape = new Konva.Circle({
          id: shape.id,
          x: shape.x || 0,
          y: shape.y || 0,
          radius: shape.radius || 50,
          stroke: strokeColor,
          strokeWidth: shape.strokeWidth || 2,
          draggable: canDrag,
        });
        
        konvaShape.on('click tap', (e) => {
          e.cancelBubble = true;
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (['select', 'multi-select'].includes(activeToolRef.current || '')) {
            appendSelection(shape.id);
          }
        });
        
        konvaShape.on('dragend', function() {
          const circle = this as Konva.Circle;
          handleShapeDrag(shape.id, circle.x(), circle.y(), false);
        });

        konvaShape.on('transformend', function() {
          const circle = this as Konva.Circle;
          // Bake scale into radius (use average of scaleX/scaleY)
          const avgScale = (circle.scaleX() + circle.scaleY()) / 2;
          const newRadius = (shape.radius || 50) * avgScale;
          
          circle.scaleX(1);
          circle.scaleY(1);
          circle.rotation(0);
          
          handleShapeTransform(shape.id, {
            x: circle.x(),
            y: circle.y(),
            radius: Math.max(5, newRadius),
          });
        });

        konvaShape.on('mouseenter', () => canDrag && setCursorStyle('move'));
        konvaShape.on('mouseleave', () => setCursorStyle(activeToolRef.current === 'select' ? 'default' : 'crosshair'));
      }
      else if (shape.type === 'point') {
        // Point is now scalable
        konvaShape = new Konva.Circle({
          id: shape.id,
          x: shape.x || 0,
          y: shape.y || 0,
          radius: shape.radius || 6,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: 2,
          draggable: canDrag,
          scaleX: shape.scaleX || 1,
          scaleY: shape.scaleY || 1,
        });
        
        konvaShape.on('click tap', (e) => {
          e.cancelBubble = true;
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (['select', 'multi-select'].includes(activeToolRef.current || '')) {
            appendSelection(shape.id);
          }
        });
        
        konvaShape.on('dragend', function() {
          const point = this as Konva.Circle;
          handleShapeDrag(shape.id, point.x(), point.y(), false);
        });

        konvaShape.on('transformend', function() {
          const point = this as Konva.Circle;
          // Apply scale to radius instead
          const newRadius = (shape.radius || 6) * Math.max(point.scaleX(), point.scaleY());
          point.scaleX(1);
          point.scaleY(1);
          handleShapeTransform(shape.id, {
            x: point.x(),
            y: point.y(),
            radius: Math.max(3, newRadius),
          });
        });

        konvaShape.on('mouseenter', () => canDrag && setCursorStyle('move'));
        konvaShape.on('mouseleave', () => setCursorStyle(activeToolRef.current === 'select' ? 'default' : 'crosshair'));
      }
      else if (shape.type === 'text') {
        // For text - bake scale into font size, keep rotation
        konvaShape = new Konva.Text({
          id: shape.id,
          x: shape.x || 0,
          y: shape.y || 0,
          text: shape.text || 'Text',
          fontSize: shape.fontSize || 18,
          fill: isSelected ? '#f472b6' : (shape.fill || '#e2e8f0'),
          fontFamily: 'Inter, system-ui, sans-serif',
          draggable: canDrag,
          rotation: shape.rotation || 0,
        });
        
        konvaShape.on('click tap', (e) => {
          e.cancelBubble = true;
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (['select', 'multi-select'].includes(activeToolRef.current || '')) {
            appendSelection(shape.id);
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
          // Apply scale to font size
          const avgScale = (text.scaleX() + text.scaleY()) / 2;
          const newFontSize = Math.round((shape.fontSize || 18) * avgScale);
          
          text.scaleX(1);
          text.scaleY(1);
          
          handleShapeTransform(shape.id, {
            x: text.x(),
            y: text.y(),
            fontSize: Math.max(8, newFontSize),
            rotation: text.rotation(),
          });
        });

        konvaShape.on('mouseenter', () => canDrag && setCursorStyle('move'));
        konvaShape.on('mouseleave', () => setCursorStyle(activeToolRef.current === 'select' ? 'default' : 'crosshair'));
      }
      else if (shape.type === 'angle') {
        // Angle with dynamic arc that touches both lines
        const pts = shape.points || [0, 0, 80, 0, 0, -80];
        const origin = { x: pts[0], y: pts[1] };
        const line1End = { x: pts[2] - pts[0], y: pts[3] - pts[1] };
        const line2End = { x: pts[4] - pts[0], y: pts[5] - pts[1] };
        
        // Calculate angles
        const angle1 = Math.atan2(line1End.y, line1End.x) * (180 / Math.PI);
        const angle2 = Math.atan2(line2End.y, line2End.x) * (180 / Math.PI);
        
        // Find the sweep angle
        let startAngle = Math.min(angle1, angle2);
        let endAngle = Math.max(angle1, angle2);
        let sweepAngle = endAngle - startAngle;
        
        // Handle reflex angles
        if (sweepAngle > 180) {
          startAngle = endAngle;
          sweepAngle = 360 - sweepAngle;
        }
        
        const group = new Konva.Group({
          id: shape.id,
          draggable: canDrag,
        });
        
        // Line 1
        group.add(new Konva.Line({
          points: [pts[0], pts[1], pts[2], pts[3]],
          stroke: strokeColor,
          strokeWidth: 2,
          lineCap: 'round',
        }));
        
        // Line 2
        group.add(new Konva.Line({
          points: [pts[0], pts[1], pts[4], pts[5]],
          stroke: strokeColor,
          strokeWidth: 2,
          lineCap: 'round',
        }));
        
        // Arc radius - proportional to line lengths
        const len1 = Math.sqrt(line1End.x * line1End.x + line1End.y * line1End.y);
        const len2 = Math.sqrt(line2End.x * line2End.x + line2End.y * line2End.y);
        const arcRadius = Math.min(len1, len2, 35) * 0.5;
        
        group.add(new Konva.Arc({
          x: origin.x,
          y: origin.y,
          innerRadius: arcRadius,
          outerRadius: arcRadius,
          angle: sweepAngle,
          rotation: startAngle,
          stroke: strokeColor,
          strokeWidth: 1.5,
        }));
        
        group.on('click tap', (e) => {
          e.cancelBubble = true;
          if (activeToolRef.current === 'delete' && shapesRef.current) {
            onShapesChange(shapesRef.current.filter(s => s.id !== shape.id));
          } else if (['select', 'multi-select'].includes(activeToolRef.current || '')) {
            appendSelection(shape.id);
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

        group.on('transformend', function() {
          const g = this as Konva.Group;
          // Bake transform into points
          const scaleX = g.scaleX();
          const scaleY = g.scaleY();
          const rotation = g.rotation() * Math.PI / 180;
          const cos = Math.cos(rotation);
          const sin = Math.sin(rotation);
          
          // Find center
          let cx = 0, cy = 0;
          for (let i = 0; i < pts.length; i += 2) {
            cx += pts[i];
            cy += pts[i + 1];
          }
          cx /= (pts.length / 2);
          cy /= (pts.length / 2);
          
          const newPoints: number[] = [];
          for (let i = 0; i < pts.length; i += 2) {
            let x = (pts[i] - cx) * scaleX;
            let y = (pts[i + 1] - cy) * scaleY;
            const rx = x * cos - y * sin;
            const ry = x * sin + y * cos;
            newPoints.push(rx + cx, ry + cy);
          }
          
          g.scaleX(1);
          g.scaleY(1);
          g.rotation(0);
          g.position({ x: 0, y: 0 });
          
          handleShapeTransform(shape.id, { points: newPoints });
        });

        group.on('mouseenter', () => canDrag && setCursorStyle('move'));
        group.on('mouseleave', () => setCursorStyle(activeToolRef.current === 'select' ? 'default' : 'crosshair'));

        konvaShape = group;
      }

      if (konvaShape) {
        layer.add(konvaShape);
        if (isSelected) selectedNodes.push(konvaShape);
      }
    });

    // Draw blanks (scalable - bake transforms into dimensions)
    blanks.forEach((blank) => {
      const isSelected = selectedIds.has(blank.id);
      
      const group = new Konva.Group({
        id: blank.id,
        x: blank.x,
        y: blank.y,
        draggable: canDrag,
        rotation: blank.rotation || 0,
      });
      
      group.add(new Konva.Rect({
        width: blank.width,
        height: blank.height,
        fill: '#1e3a5f',
        stroke: isSelected ? '#f472b6' : '#06b6d4',
        strokeWidth: 2,
        cornerRadius: 4,
      }));
      
      group.add(new Konva.Text({
        width: blank.width,
        height: blank.height,
        text: '?',
        fontSize: Math.min(16, blank.height * 0.6),
        fill: '#06b6d4',
        align: 'center',
        verticalAlign: 'middle',
      }));
      
      group.on('click tap', (e) => {
        e.cancelBubble = true;
        if (activeToolRef.current === 'delete' && blanksRef.current) {
          onBlanksChange(blanksRef.current.filter(b => b.id !== blank.id));
        } else if (['select', 'multi-select'].includes(activeToolRef.current || '')) {
          appendSelection(blank.id);
        }
      });
      
      group.on('dragend', function() {
        const g = this as Konva.Group;
        handleBlankDrag(blank.id, g.x(), g.y());
      });

      group.on('transformend', function() {
        const g = this as Konva.Group;
        // Bake scale into width/height immediately
        const newWidth = blank.width * g.scaleX();
        const newHeight = blank.height * g.scaleY();
        
        // Reset scale
        g.scaleX(1);
        g.scaleY(1);
        
        handleBlankTransform(blank.id, {
          x: g.x(),
          y: g.y(),
          width: Math.max(30, newWidth),
          height: Math.max(20, newHeight),
          rotation: g.rotation(),
        });
      });

      group.on('mouseenter', () => canDrag && setCursorStyle('move'));
      group.on('mouseleave', () => setCursorStyle(activeToolRef.current === 'select' ? 'default' : 'crosshair'));
      
      layer.add(group);
      if (isSelected) selectedNodes.push(group);
    });

    // Update transformer
    if (transformer) {
      if (selectedNodes.length > 0 && ['select', 'multi-select'].includes(activeTool)) {
        transformer.nodes(selectedNodes);
        transformer.moveToTop();
      } else {
        transformer.nodes([]);
      }
    }

    layer.batchDraw();
  }, [shapes, blanks, selectedShapeIds, activeTool, readOnly, onShapesChange, onBlanksChange, onSelectShapes, onEditText, handleShapeDrag, handleBlankDrag, handleShapeTransform, handleBlankTransform]);

  // Initial grid draw
  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

  // Redraw shapes when state changes
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Handle drawing new shapes - ALLOW drawing over existing shapes
  useEffect(() => {
    const stage = stageObjRef.current;
    const layer = layerRef.current;
    if (!stage || !layer) return;

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (readOnly) return;
      
      const tool = activeToolRef.current;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      // Select tool - handle selection
      if (tool === 'select') {
        const target = e.target;
        const isBackground = target === stage || target.getLayer() === gridLayerRef.current;
        if (isBackground) {
          onSelectShapes([]);
        }
        return;
      }

      if (tool === 'multi-select') {
        selectionStartRef.current = pos;
        const rect = selectionRectRef.current;
        if (rect) {
          rect.visible(true);
          rect.position({ x: pos.x, y: pos.y });
          rect.width(0);
          rect.height(0);
          layer.batchDraw();
        }
        onSelectShapes([]);
        return;
      }

      // Delete tool - only delete if clicked on a shape (handled by shape click handlers)
      if (tool === 'delete') {
        return;
      }

      // For drawing tools, ALWAYS allow drawing regardless of what's underneath
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
          radius: 6,
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
          width: 60,
          height: 32,
          expectedAnswer: ''
        }]);
        return;
      }

      // Start drawing for line-based tools
      if (['line', 'arrow', 'circle', 'angle'].includes(tool || '')) {
        setDrawingState({ isDrawing: true, startPoint: pos });
      }
    };

    const handleMouseMove = () => {
      const pos = stage.getPointerPosition();
      if (!pos) return;

      // Multi-select drag rectangle
      if (activeToolRef.current === 'multi-select' && selectionStartRef.current) {
        const start = selectionStartRef.current;
        const rect = selectionRectRef.current;
        if (rect) {
          const x = Math.min(start.x, pos.x);
          const y = Math.min(start.y, pos.y);
          const width = Math.abs(pos.x - start.x);
          const height = Math.abs(pos.y - start.y);
          rect.position({ x, y });
          rect.width(width);
          rect.height(height);
          layer.batchDraw();
        }
        return;
      }

      if (!drawingState.isDrawing || !drawingState.startPoint) return;

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
          listening: false,
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
          listening: false,
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
          listening: false,
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
      const pos = stage.getPointerPosition();

      if (activeToolRef.current === 'multi-select' && selectionStartRef.current) {
        const start = selectionStartRef.current;
        const end = pos || start;
        const rect = selectionRectRef.current;
        const selectionBox = {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y),
        };

        const intersects = (r1: { x: number; y: number; width: number; height: number }, r2: { x: number; y: number; width: number; height: number }) =>
          r1.x < r2.x + r2.width &&
          r1.x + r1.width > r2.x &&
          r1.y < r2.y + r2.height &&
          r1.y + r1.height > r2.y;

        const selected: string[] = [];
        (layer.children || []).forEach((child) => {
          if (child === transformerRef.current || child === selectionRectRef.current) return;
          if (!child.visible()) return;
          const box = child.getClientRect({ skipShadow: true, skipStroke: false });
          if (intersects(selectionBox, { x: box.x, y: box.y, width: box.width, height: box.height })) {
            const id = child.id();
            if (id) selected.push(id);
          }
        });

        if (rect) {
          rect.visible(false);
          rect.width(0);
          rect.height(0);
        }
        selectionStartRef.current = null;
        onSelectShapes(selected);
        layer.batchDraw();
        return;
      }

      if (!drawingState.isDrawing || !drawingState.startPoint) return;

      const start = drawingState.startPoint;
      const tool = activeToolRef.current;

      const oldPreview = layer.findOne('#preview');
      if (oldPreview) oldPreview.destroy();

      if (pos) {
        const dx = pos.x - start.x;
        const dy = pos.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 5) {
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
  }, [readOnly, drawingState, onShapesChange, onBlanksChange, onSelectShapes]);

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
