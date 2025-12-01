import React, { useState, useEffect, useRef } from 'react';
import Konva from 'konva';
import { GeometryQuestion, BlankField } from './types';
import { DiagramShape } from './KonvaCanvasEditor';
import { getTeacherGeometryQuestions } from './geometryService';

interface DiagramPickerProps {
  teacherId: string;
  onSelectDiagram: (selection: { diagramJson: string; imageDataUrl: string; title: string; id: string }) => void;
  onClose: () => void;
}

interface DiagramPreviewProps {
  question: GeometryQuestion;
  onSelect: () => void;
  selected: boolean;
}

// Lightweight preview component
const DiagramPreview = ({ question, onSelect, selected }: DiagramPreviewProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    // Generate a small preview image from the diagram
    if (!containerRef.current) return;

    try {
      const stage = new Konva.Stage({
        container: containerRef.current,
        width: 200,
        height: 120,
      });

      const layer = new Konva.Layer();
      stage.add(layer);

      // Background
      layer.add(new Konva.Rect({
        x: 0, y: 0, width: 200, height: 120,
        fill: '#0f172a',
      }));

      // Parse and render shapes
      const diagramData = JSON.parse(question.diagram_json);
      
      if (diagramData.children && diagramData.children[0]?.children) {
        const konvaNodes = diagramData.children[0].children;
        
        // Scale factor to fit
        const scale = 0.25;
        
        konvaNodes.forEach((node: any) => {
          const attrs = { ...node.attrs };
          
          if (node.className === 'Line') {
            if (attrs.points) {
              attrs.points = attrs.points.map((p: number) => p * scale);
            }
            layer.add(new Konva.Line({
              ...attrs,
              stroke: attrs.stroke || '#06b6d4',
              strokeWidth: (attrs.strokeWidth || 2) * scale,
            }));
          } else if (node.className === 'Arrow') {
            if (attrs.points) {
              attrs.points = attrs.points.map((p: number) => p * scale);
            }
            layer.add(new Konva.Arrow({
              ...attrs,
              stroke: attrs.stroke || '#06b6d4',
              fill: attrs.fill || '#06b6d4',
              strokeWidth: (attrs.strokeWidth || 2) * scale,
              pointerLength: 5,
              pointerWidth: 4,
            }));
          } else if (node.className === 'Circle') {
            layer.add(new Konva.Circle({
              x: (attrs.x || 0) * scale,
              y: (attrs.y || 0) * scale,
              radius: (attrs.radius || 20) * scale,
              stroke: attrs.stroke || '#06b6d4',
              strokeWidth: (attrs.strokeWidth || 2) * scale,
            }));
          } else if (node.className === 'Text') {
            layer.add(new Konva.Text({
              x: (attrs.x || 0) * scale,
              y: (attrs.y || 0) * scale,
              text: attrs.text || '',
              fontSize: Math.max(8, (attrs.fontSize || 14) * scale),
              fill: attrs.fill || '#e2e8f0',
            }));
          }
        });
      }

      // Also render blanks
      if (diagramData.blanks) {
        const scale = 0.25;
        diagramData.blanks.forEach((blank: BlankField) => {
          layer.add(new Konva.Rect({
            x: blank.x * scale,
            y: blank.y * scale,
            width: blank.width * scale,
            height: blank.height * scale,
            fill: '#1e3a5f',
            stroke: '#06b6d4',
            strokeWidth: 1,
            cornerRadius: 2,
          }));
        });
      }

      layer.batchDraw();

      // Generate preview URL
      setPreviewUrl(stage.toDataURL({ pixelRatio: 2 }));

      // Cleanup
      stage.destroy();
    } catch (e) {
      console.error('Failed to render preview:', e);
    }
  }, [question.diagram_json]);

  return (
    <div
      onClick={onSelect}
      className={`
        cursor-pointer rounded-lg border-2 overflow-hidden transition-all
        ${selected 
          ? 'border-cyan-500 ring-2 ring-cyan-500/50' 
          : 'border-gray-700 hover:border-gray-500'
        }
      `}
    >
      <div ref={containerRef} className="hidden" />
      
      {previewUrl ? (
        <img src={previewUrl} alt={question.title} className="w-full h-28 object-cover" />
      ) : (
        <div className="w-full h-28 bg-gray-800 flex items-center justify-center">
          <span className="text-2xl">📐</span>
        </div>
      )}
      
      <div className="p-2 bg-gray-800/50">
        <p className="text-sm text-white truncate font-medium">{question.title}</p>
        <p className="text-xs text-gray-400">
          {Object.keys(question.answers).length} blanks • {question.difficulty}
        </p>
      </div>
    </div>
  );
};

// Main DiagramPicker component
const DiagramPicker: React.FC<DiagramPickerProps> = ({ teacherId, onSelectDiagram, onClose }) => {
  const [diagrams, setDiagrams] = useState<GeometryQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadDiagrams();
  }, [teacherId]);

  const loadDiagrams = async () => {
    try {
      setLoading(true);
      const questions = await getTeacherGeometryQuestions(teacherId);
      setDiagrams(questions);
    } catch (error) {
      console.error('Failed to load diagrams:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateFullImage = async (question: GeometryQuestion): Promise<string> => {
    return new Promise((resolve) => {
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      document.body.appendChild(container);

      const stage = new Konva.Stage({
        container,
        width: 700,
        height: 450,
      });

      const layer = new Konva.Layer();
      stage.add(layer);

      // Background
      layer.add(new Konva.Rect({
        x: 0, y: 0, width: 700, height: 450,
        fill: '#0f172a',
      }));

      // Parse and render shapes
      try {
        const diagramData = JSON.parse(question.diagram_json);
        
        if (diagramData.children && diagramData.children[0]?.children) {
          diagramData.children[0].children.forEach((node: any) => {
            const attrs = node.attrs || {};
            
            if (node.className === 'Line') {
              layer.add(new Konva.Line({
                points: attrs.points || [],
                stroke: attrs.stroke || '#06b6d4',
                strokeWidth: attrs.strokeWidth || 2,
                lineCap: 'round',
              }));
            } else if (node.className === 'Arrow') {
              layer.add(new Konva.Arrow({
                points: attrs.points || [],
                stroke: attrs.stroke || '#06b6d4',
                fill: attrs.fill || '#06b6d4',
                strokeWidth: attrs.strokeWidth || 2,
                pointerLength: attrs.pointerLength || 10,
                pointerWidth: attrs.pointerWidth || 8,
              }));
            } else if (node.className === 'Circle') {
              layer.add(new Konva.Circle({
                x: attrs.x || 0,
                y: attrs.y || 0,
                radius: attrs.radius || 50,
                stroke: attrs.stroke || '#06b6d4',
                strokeWidth: attrs.strokeWidth || 2,
              }));
            } else if (node.className === 'Text') {
              layer.add(new Konva.Text({
                x: attrs.x || 0,
                y: attrs.y || 0,
                text: attrs.text || '',
                fontSize: attrs.fontSize || 18,
                fill: attrs.fill || '#e2e8f0',
                fontFamily: 'Inter, system-ui, sans-serif',
              }));
            }
          });
        }

        // Render blanks with "?" markers
        if (diagramData.blanks) {
          diagramData.blanks.forEach((blank: BlankField) => {
            const group = new Konva.Group({
              x: blank.x,
              y: blank.y,
            });
            
            group.add(new Konva.Rect({
              width: blank.width,
              height: blank.height,
              fill: '#1e3a5f',
              stroke: '#06b6d4',
              strokeWidth: 2,
              cornerRadius: 4,
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
            
            layer.add(group);
          });
        }
      } catch (e) {
        console.error('Failed to parse diagram for export:', e);
      }

      layer.batchDraw();

      const dataUrl = stage.toDataURL({ pixelRatio: 2 });
      
      stage.destroy();
      document.body.removeChild(container);
      
      resolve(dataUrl);
    });
  };

  const handleInsert = async () => {
    if (!selectedId) return;
    
    const selected = diagrams.find(d => d.id === selectedId);
    if (!selected) return;

    const imageDataUrl = await generateFullImage(selected);
    onSelectDiagram({
      diagramJson: selected.diagram_json,
      imageDataUrl,
      title: selected.title,
      id: selected.id,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">📐 Insert Geometry Diagram</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-12 text-gray-400">
              Loading diagrams...
            </div>
          ) : diagrams.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📐</div>
              <p className="text-gray-400 mb-2">No diagrams found</p>
              <p className="text-sm text-gray-500">
                Create diagrams in the Geometry Builder first
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {diagrams.map((diagram) => {
                const id = diagram.id;
                return (
                  <div key={id}>
                    <DiagramPreview
                      question={diagram}
                      selected={selectedId === diagram.id}
                      onSelect={() => setSelectedId(diagram.id)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!selectedId}
            className="flex-1 px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 rounded-lg hover:bg-cyan-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Insert Diagram
          </button>
        </div>
      </div>
    </div>
  );
};

export default DiagramPicker;
