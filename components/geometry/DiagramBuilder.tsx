import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DiagramTool, BlankField, GeometryQuestion } from './types';
import DiagramToolbar from './DiagramToolbar';
import KonvaCanvasEditor, { DiagramShape } from './KonvaCanvasEditor';
import ShapesLibrary from './ShapesLibrary';
import GeometryUseInQuestion, { type GeometryUseInQuestionPayload } from './GeometryUseInQuestion';
import { 
  saveGeometryQuestion, 
  updateGeometryQuestion,
  getTeacherGeometryQuestions,
  deleteGeometryQuestion,
  generateShapeId 
} from './geometryService';
import BackButton from '../BackButton';
import { brainsAlert } from '../../src/utils/brainsAlert';
import { createSchoolDocumentId, escapeSchoolDocumentHtml, openSchoolDocumentPreview, schoolDocumentFileName } from '../../src/lib/schoolDocument';

interface DiagramBuilderProps {
  teacherId: string;
  onComplete: () => void;
  onUseInQuestion?: (payload: GeometryUseInQuestionPayload) => void;
  schoolName?: string;
  schoolLogoUrl?: string | null;
  teacherName?: string;
  schoolId?: string | null;
}

const DiagramBuilder: React.FC<DiagramBuilderProps> = ({ teacherId, onComplete, onUseInQuestion, schoolName = 'Brains Heist', schoolLogoUrl, teacherName = 'Teacher', schoolId }) => {
  const stageRef = useRef<unknown>(null);
  
  // Tool state
  const [activeTool, setActiveTool] = useState<DiagramTool>('select');
  
  // Canvas state
  const [shapes, setShapes] = useState<DiagramShape[]>([]);
  const [blanks, setBlanks] = useState<BlankField[]>([]);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  
  // History for undo/redo
  const [history, setHistory] = useState<{ shapes: DiagramShape[]; blanks: BlankField[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Question metadata
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('Geometry');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [points, setPoints] = useState(15);
  const [timeLimit, setTimeLimit] = useState(60);
  
  // Editing state
  const [editingBlankId, setEditingBlankId] = useState<string | null>(null);
  const [editingBlankAnswer, setEditingBlankAnswer] = useState('');
  
  // Text editing state
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [labelFontSize, setLabelFontSize] = useState(24);
  
  // Saved questions
  const [savedQuestions, setSavedQuestions] = useState<GeometryQuestion[]>([]);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  
  // UI state
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'editor' | 'list'>('list');

  // Load saved questions
  useEffect(() => {
    loadSavedQuestions();
  }, [teacherId]);

  const loadSavedQuestions = async () => {
    try {
      setLoading(true);
      const questions = await getTeacherGeometryQuestions(teacherId);
      setSavedQuestions(questions);
    } catch (error) {
      console.error('Failed to load questions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Save to history when shapes or blanks change
  useEffect(() => {
    if (shapes.length > 0 || blanks.length > 0) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({ shapes: [...shapes], blanks: [...blanks] });
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [shapes.length, blanks.length]);

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setShapes(prevState.shapes);
      setBlanks(prevState.blanks);
      setHistoryIndex(historyIndex - 1);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setShapes(nextState.shapes);
      setBlanks(nextState.blanks);
      setHistoryIndex(historyIndex + 1);
    }
  };

  const handleClear = () => {
    if (confirm('Clear all shapes? This cannot be undone.')) {
      setShapes([]);
      setBlanks([]);
      setSelectedShapeIds([]);
      setHistory([]);
      setHistoryIndex(-1);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      brainsAlert('Please enter a title for this diagram.', 'info');
      return;
    }

    if (blanks.length === 0) {
      brainsAlert('Please add at least one blank field for students to fill in.', 'info');
      return;
    }

    // Check all blanks have answers
    const missingAnswers = blanks.filter(b => !b.expectedAnswer.trim());
    if (missingAnswers.length > 0) {
      brainsAlert('Please set expected answers for all blank fields.', 'info');
      return;
    }

    try {
      setSaving(true);

      // Build diagram JSON from stage
      const diagramJson = (stageRef.current as any)?.toJSON?.() || '{}';


      // Build answers object
      const answers: Record<string, string> = {};
      blanks.forEach(blank => {
        answers[blank.id] = blank.expectedAnswer;
      });

      // Add blank metadata to diagram
      const diagramWithBlanks = JSON.parse(diagramJson);
      diagramWithBlanks.blanks = blanks;
      diagramWithBlanks.brainHeistDiagramVersion = 2;
      diagramWithBlanks.brainHeistShapes = shapes;
      const finalDiagramJson = JSON.stringify(diagramWithBlanks);

      if (editingQuestionId) {
        await updateGeometryQuestion(editingQuestionId, {
          title,
          diagram_json: finalDiagramJson,
          answers,
          subject,
          topic,
          difficulty,
          points,
          time_limit: timeLimit
        });
        brainsAlert('Diagram updated successfully.', 'success');
      } else {
        await saveGeometryQuestion(
          teacherId,
          title,
          finalDiagramJson,
          answers,
          { subject, topic, difficulty, points, timeLimit }
        );
        brainsAlert('Diagram saved successfully.', 'success');
      }

      // Reset and reload
      handleNewDiagram();
      await loadSavedQuestions();
      setView('list');
    } catch (error) {
      console.error('Failed to save:', error);
      brainsAlert('Unable to save diagram: ' + (error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleNewDiagram = () => {
    setShapes([]);
    setBlanks([]);
    setSelectedShapeIds([]);
    setHistory([]);
    setHistoryIndex(-1);
    setTitle('');
    setSubject('');
    setTopic('Geometry');
    setDifficulty('medium');
    setPoints(15);
    setTimeLimit(60);
    setEditingQuestionId(null);
    setView('editor');
  };

  const handleEditQuestion = (question: GeometryQuestion) => {
    try {
      const diagramData = JSON.parse(question.diagram_json);
      
      // Restore blanks
      if (diagramData.blanks) {
        setBlanks(diagramData.blanks);
      }
      
      // Newer diagrams keep an explicit editable shape model alongside the
      // existing Konva JSON. Older saved diagrams remain backward-compatible.
      setShapes(Array.isArray(diagramData.brainHeistShapes) ? diagramData.brainHeistShapes : []);
      setSelectedShapeIds([]);
      setTitle(question.title);
      setSubject(question.subject || '');
      setTopic(question.topic);
      setDifficulty(question.difficulty);
      setPoints(question.points);
      setTimeLimit(question.time_limit);
      setEditingQuestionId(question.id);
      setView('editor');
    } catch (error) {
      console.error('Failed to load question:', error);
      brainsAlert('Unable to load question for editing.', 'error');
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Delete this diagram question? This cannot be undone.')) return;

    try {
      await deleteGeometryQuestion(questionId);
      await loadSavedQuestions();
      brainsAlert('Question deleted successfully.', 'success');
    } catch (error) {
      console.error('Failed to delete:', error);
      brainsAlert('Unable to delete question. Please try again.', 'error');
    }
  };

  const handleBlankClick = (blankId: string) => {
    const blank = blanks.find(b => b.id === blankId);
    if (blank) {
      setEditingBlankId(blankId);
      setEditingBlankAnswer(blank.expectedAnswer);
    }
  };

  const saveBlankAnswer = () => {
    if (editingBlankId) {
      setBlanks(blanks.map(b =>
        b.id === editingBlankId
          ? { ...b, expectedAnswer: editingBlankAnswer }
          : b
      ));
      setEditingBlankId(null);
      setEditingBlankAnswer('');
    }
  };

  // Render saved questions list
  const renderQuestionsList = () => (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-heading text-2xl text-cyan-400">📐 Geometry Diagrams</h2>
        <button
          onClick={handleNewDiagram}
          className="px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 rounded-lg hover:bg-cyan-500/30 transition-all font-semibold"
        >
          ➕ New Diagram
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <img
            src="/BRAINS.svg"
            alt="Loading..."
            className="w-24 h-24 animate-pulse"
            style={{ filter: 'drop-shadow(0 0 20px rgba(0, 212, 255, 0.6))' }}
          />
        </div>
      ) : savedQuestions.length === 0 ? (
        <div className="card-glass p-12 text-center">
          <div className="text-6xl mb-4">📐</div>
          <p className="text-xl text-gray-300 mb-4">No geometry diagrams yet</p>
          <p className="text-gray-400 mb-6">Build clean classroom diagrams, send a tightly cropped SVG + PNG fallback straight into a normal question, or add answer blanks for an interactive diagram question.</p>
          <button
            onClick={handleNewDiagram}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-semibold hover:scale-105 transition-all"
          >
            Create Your First Diagram
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {savedQuestions.map((question) => (
            <div
              key={question.id}
              className="card-glass p-4 flex items-center justify-between"
            >
              <div className="flex-1">
                <h3 className="font-semibold text-white">{question.title}</h3>
                <div className="flex gap-3 mt-1 text-sm text-gray-400">
                  <span>Reusable visual</span>
                  <span>•</span>
                  <span className="capitalize">{question.difficulty}</span>
                  <span>•</span>
                  <span>{question.points} XP</span>
                  <span>•</span>
                  <span>{Object.keys(question.answers).length} blanks</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEditQuestion(question)}
                  className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg hover:bg-gray-600/50 text-sm"
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => handleDeleteQuestion(question.id)}
                  className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 text-sm"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Event handlers with proper types
  const handleTitleChange = (e: { target: { value: string } }) => {
    setTitle(e.target.value);
  };

  const handleDifficultyChange = (e: { target: { value: string } }) => {
    setDifficulty(e.target.value as 'easy' | 'medium' | 'hard');
  };

  const handleBlankAnswerChange = (e: { target: { value: string } }) => {
    setEditingBlankAnswer(e.target.value);
  };

  const handleBlankKeyDown = (e: { key: string }) => {
    if (e.key === 'Enter') saveBlankAnswer();
    if (e.key === 'Escape') setEditingBlankId(null);
  };

  // Add shapes from library
  const handleAddShapesFromLibrary = (newShapes: DiagramShape[]) => {
    setShapes([...shapes, ...newShapes]);
  };

  const handleAddLabel = () => {
    const text = labelDraft.trim();
    if (!text) return;
    const id = generateShapeId('text');
    const offset = shapes.filter((shape) => shape.type === 'text').length % 6;
    const newLabel: DiagramShape = {
      id,
      type: 'text',
      x: 90 + offset * 24,
      y: 80 + offset * 22,
      text,
      fontSize: labelFontSize,
      fill: '#f8fafc',
      fontFamily: 'Arial',
    };
    setShapes((current) => [...current, newLabel]);
    setSelectedShapeIds([id]);
    setActiveTool('select');
    setLabelDraft('');
  };

  // Add math symbol as text shape
  const handleAddSymbol = (symbol: string) => {
    const newTextShape: DiagramShape = {
      id: `symbol-${Date.now()}`,
      type: 'text',
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      text: symbol,
      fontSize: 28,
      fill: '#00ffff',
      fontFamily: 'serif',
    };
    setShapes([...shapes, newTextShape]);
  };

  // Handle text editing
  const handleEditText = (shapeId: string, currentText: string) => {
    setEditingTextId(shapeId);
    setEditingTextValue(currentText);
  };

  const saveTextEdit = () => {
    if (editingTextId) {
      const nextText = editingTextValue.trim();
      if (!nextText) return;
      setShapes((current) => current.map((shape) =>
        shape.id === editingTextId ? { ...shape, text: nextText } : shape
      ));
      setEditingTextId(null);
      setEditingTextValue('');
    }
  };

  const cancelTextEdit = () => {
    setEditingTextId(null);
    setEditingTextValue('');
  };

  // Delete selected shapes or blanks (supports multi-select)
  const handleDeleteSelected = () => {
    if (selectedShapeIds.length === 0) return;
    
    // Filter out selected shapes
    setShapes(shapes.filter(s => !selectedShapeIds.includes(s.id)));
    // Filter out selected blanks
    setBlanks(blanks.filter(b => !selectedShapeIds.includes(b.id)));
    // Clear selection
    setSelectedShapeIds([]);
  };

  // Export diagram as PNG image (for use in regular questions)
  const handleExportImage = () => {
    const stage = stageRef.current as { toDataURL?: (config: { pixelRatio: number }) => string } | null;
    if (!stage?.toDataURL) {
      brainsAlert('Cannot export — canvas not ready.', 'error');
      return;
    }
    
    try {
      const dataUrl = stage.toDataURL({ pixelRatio: 4 });
      
      // Create download link
      const link = document.createElement('a');
      link.download = `diagram-${title || 'untitled'}-${Date.now()}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Also copy to clipboard if supported
      if (navigator.clipboard) {
        fetch(dataUrl)
          .then(res => res.blob())
          .then(blob => {
            navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]).then(() => {
              brainsAlert('Image downloaded and copied to clipboard. You can now paste it directly into question creation.', 'success');
            }).catch(() => {
              // Clipboard failed, but download succeeded
            });
          });
      }
    } catch (e) {
      console.error('Export failed:', e);
      brainsAlert('Unable to export image.', 'error');
    }
  };

  const handlePrintImage = () => {
    const stage = stageRef.current as { toDataURL?: (config: { pixelRatio: number }) => string } | null;
    if (!stage?.toDataURL) { brainsAlert('Cannot print — canvas not ready.', 'error'); return; }
    try {
      const dataUrl = stage.toDataURL({ pixelRatio: 4 });
      openSchoolDocumentPreview({
        meta: {
          documentId: createSchoolDocumentId('geometry'),
          templateVersion: 'geometry-diagram-sheet-v1',
          title: title || 'Geometry Diagram',
          subtitle: `${topic} · ${difficulty}`,
          schoolName,
          schoolLogoUrl,
          audience: 'student',
          status: 'final',
          confidentiality: 'school-use',
          generatedAt: new Date().toISOString(),
          generatedBy: teacherName,
        },
        bodyHtml: `<div class="document-grid"><div class="document-card"><strong>Student name</strong><p>________________________________</p></div><div class="document-card"><strong>Class / date</strong><p>________________________________</p></div></div><figure style="margin:8mm 0;text-align:center"><img src="${escapeSchoolDocumentHtml(dataUrl)}" alt="${escapeSchoolDocumentHtml(title || 'Geometry diagram')}" style="max-width:100%;max-height:150mm;object-fit:contain"><figcaption style="margin-top:4mm;color:#64748b">Show all working clearly.</figcaption></figure><div style="height:45mm;border:1px solid #cbd5e1;border-radius:3mm;padding:3mm"><strong>Working and answer</strong></div>`,
        orientation: 'portrait',
        inkSaver: true,
        fileName: schoolDocumentFileName(schoolName, title || 'Geometry_Diagram'),
      });
    } catch (error) {
      brainsAlert(error instanceof Error ? error.message : 'Unable to open the diagram document.', 'error');
    }
  };

  // Render editor view
  const renderEditor = () => (
    <div className="flex flex-col gap-4 xl:flex-row">
      {/* Left Toolbar */}
      <div className="w-full flex-shrink-0 xl:w-44">
        <DiagramToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onClear={handleClear}
          onDeleteSelected={handleDeleteSelected}
          onExportImage={handleExportImage}
          onPrintImage={handlePrintImage}
          hasSelection={selectedShapeIds.length > 0}
        />
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1">
        {/* Question Metadata */}
        <div className="card-glass p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-400 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={handleTitleChange}
                placeholder="e.g., Find angles x and y"
                className="w-full px-3 py-2 bg-gray-800/50 border border-gray-600 rounded-lg text-white focus:border-cyan-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Difficulty</label>
              <select
                value={difficulty}
                onChange={handleDifficultyChange}
                className="w-full px-3 py-2 bg-gray-800/50 border border-gray-600 rounded-lg text-white focus:border-cyan-500 outline-none"
              >
                <option value="easy">⭐ Easy (10 XP)</option>
                <option value="medium">⭐⭐ Medium (15 XP)</option>
                <option value="hard">⭐⭐⭐ Hard (20 XP)</option>
              </select>
            </div>
          </div>
        </div>

        <section className="mb-4 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <label className="grid gap-1 text-xs font-semibold text-slate-300">Labels & annotations
              <input value={labelDraft} onChange={(event: { target: { value: string } }) => setLabelDraft(event.target.value)} onKeyDown={(event: { key: string; preventDefault: () => void }) => { if (event.key === 'Enter') { event.preventDefault(); handleAddLabel(); } }} placeholder="e.g. A, 45°, radius, 6 cm" className="min-h-11 rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white placeholder:text-slate-500" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-300">Size
              <select value={labelFontSize} onChange={(event: { target: { value: string } }) => setLabelFontSize(Number(event.target.value))} className="min-h-11 rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white"><option value={18}>Small</option><option value={24}>Medium</option><option value={32}>Large</option></select>
            </label>
            <button type="button" onClick={handleAddLabel} disabled={!labelDraft.trim()} className="self-end min-h-11 rounded-lg bg-cyan-600 px-4 text-sm font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40">Add label</button>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3"><span><strong className="text-slate-200">1.</strong> Build the figure</span><span><strong className="text-slate-200">2.</strong> Add clear labels</span><span><strong className="text-slate-200">3.</strong> Use in Question or add blanks</span></div>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">Select and drag labels to position them. Double-click or double-tap an existing label to edit its wording.</p>
        </section>

        {/* Shapes Library - Horizontal above canvas */}
        <div className="mb-4">
          <ShapesLibrary onAddShape={handleAddShapesFromLibrary} onAddSymbol={handleAddSymbol} />
        </div>

        {/* Canvas with instruction */}
        <div className="relative">
          <div className="absolute top-2 right-2 z-10 text-xs text-gray-400 bg-slate-900/90 px-2 py-1 rounded border border-slate-700">
            Drag to move/select • Resize with handles • Double-click labels to edit
          </div>
          <KonvaCanvasEditor
            height={450}
            activeTool={activeTool}
            shapes={shapes}
            onShapesChange={setShapes}
            blanks={blanks}
            onBlanksChange={setBlanks}
            selectedShapeIds={selectedShapeIds}
            onSelectShapes={setSelectedShapeIds}
            stageRef={stageRef}
            onEditText={handleEditText}
          />
          
          {/* Text Editing Modal */}
          {editingTextId && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
              <div className="bg-gray-800 border border-cyan-500 rounded-lg p-4 shadow-xl">
                <h3 className="text-sm font-semibold text-cyan-400 mb-3">✏️ Edit Text</h3>
                <input
                  type="text"
                  value={editingTextValue}
                  onChange={(e: { target: { value: string } }) => setEditingTextValue(e.target.value)}
                  className="w-64 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-lg outline-none focus:border-cyan-500"
                  autoFocus
                  onKeyDown={(e: { key: string }) => {
                    if (e.key === 'Enter') saveTextEdit();
                    if (e.key === 'Escape') cancelTextEdit();
                  }}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={cancelTextEdit}
                    className="flex-1 px-3 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveTextEdit}
                    className="flex-1 px-3 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500 rounded hover:bg-cyan-500/30 text-sm"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Blanks Editor */}
        {blanks.length > 0 && (
          <div className="card-glass p-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">📝 Blank Fields & Answers</h3>
            <div className="grid gap-2">
              {blanks.map((blank, index) => (
                <div
                  key={blank.id}
                  className="flex items-center gap-3 p-2 bg-gray-800/30 rounded-lg"
                >
                  <span className="text-sm text-gray-400 w-20">Blank {index + 1}</span>
                  {editingBlankId === blank.id ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={editingBlankAnswer}
                        onChange={handleBlankAnswerChange}
                        placeholder="Expected answer"
                        className="flex-1 px-3 py-1.5 bg-gray-700 border border-cyan-500 rounded text-white text-sm outline-none"
                        autoFocus
                        onKeyDown={handleBlankKeyDown}
                      />
                      <button
                        onClick={saveBlankAnswer}
                        className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded text-sm"
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-between">
                      <span className={`text-sm ${blank.expectedAnswer ? 'text-white' : 'text-red-400'}`}>
                        {blank.expectedAnswer || '(no answer set)'}
                      </span>
                      <button
                        onClick={() => handleBlankClick(blank.id)}
                        className="px-3 py-1 bg-gray-700/50 text-gray-300 rounded text-sm hover:bg-gray-600/50"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => setView('list')}
            className="px-6 py-3 bg-gray-700/50 text-gray-300 rounded-lg font-semibold hover:bg-gray-600/50 transition-all"
          >
            ← Back
          </button>
          {onUseInQuestion && (
            <GeometryUseInQuestion
              title={title}
              subject={subject}
              topic={topic}
              difficulty={difficulty}
              shapes={shapes}
              blanks={blanks}
              onUseInQuestion={onUseInQuestion}
            />
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-semibold hover:scale-[1.02] transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : editingQuestionId ? '💾 Update Diagram' : '💾 Save Diagram'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen p-6">
      <div className="mb-6">
        <BackButton onClick={view === 'editor' ? () => setView('list') : onComplete} />
      </div>
      
      {view === 'list' ? renderQuestionsList() : renderEditor()}
    </div>
  );
};

export default DiagramBuilder;
