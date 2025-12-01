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
  selectedShapeId,
  onSelectShape,
  stageRef,
  readOnly = false,
  onEditText,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageObjRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const gridLayerRef = useRef<Konva.Layer | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
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
  const selectedShapeIdRef = useRef(selectedShapeId);

  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { blanksRef.current = blanks; }, [blanks]);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { selectedShapeIdRef.current = selectedShapeId; }, [selectedShapeId]);

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

    let selectedNode: Konva.Node | null = null;
    const canDrag = activeTool === 'select' && !readOnly;

    // Draw shapes
    shapes.forEach((shape) => {
      const isSelected = selectedShapeId === shape.id;
      const strokeColor = isSelected ? '#f472b6' : (shape.stroke || '#06b6d4');
      const fillColor = isSelected ? '#f472b6' : (shape.fill || '#06b6d4');

      let konvaShape: Konva.Shape | Konva.Group | null = null;

      if (shape.type === 'line') {
        // For lines - don't use scaleX/scaleY, apply transform to points directly
        konvaShape = new Konva.Line({
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
          } else if (activeToolRef.current === 'select') {
            onSelectShape(shape.id);
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
        if (isSelected) selectedNode = konvaShape;
      }
    });

    // Draw blanks (scalable - bake transforms into dimensions)
    blanks.forEach((blank) => {
      const isSelected = selectedShapeId === blank.id;
      
      const group = new Konva.Group({
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
        } else if (activeToolRef.current === 'select') {
          onSelectShape(blank.id);
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
  }, [shapes, blanks, selectedShapeId, activeTool, readOnly, onShapesChange, onBlanksChange, onSelectShape, onEditText, handleShapeDrag, handleBlankDrag, handleShapeTransform, handleBlankTransform]);

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
          onSelectShape(null);
        }
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
