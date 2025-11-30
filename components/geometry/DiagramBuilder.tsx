import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DiagramTool, BlankField, GeometryQuestion } from './types';
import DiagramToolbar from './DiagramToolbar';
import KonvaCanvasEditor, { DiagramShape } from './KonvaCanvasEditor';
import ShapesLibrary from './ShapesLibrary';
import { 
  saveGeometryQuestion, 
  updateGeometryQuestion,
  getTeacherGeometryQuestions,
  deleteGeometryQuestion,
  generateShapeId 
} from './geometryService';
import BackButton from '../BackButton';

interface DiagramBuilderProps {
  teacherId: string;
  onComplete: () => void;
}

const DiagramBuilder: React.FC<DiagramBuilderProps> = ({ teacherId, onComplete }) => {
  const stageRef = useRef<unknown>(null);
  
  // Tool state
  const [activeTool, setActiveTool] = useState<DiagramTool>('select');
  
  // Canvas state
  const [shapes, setShapes] = useState<DiagramShape[]>([]);
  const [blanks, setBlanks] = useState<BlankField[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  
  // History for undo/redo
  const [history, setHistory] = useState<{ shapes: DiagramShape[]; blanks: BlankField[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Question metadata
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Maths');
  const [topic, setTopic] = useState('Geometry');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [points, setPoints] = useState(15);
  const [timeLimit, setTimeLimit] = useState(60);
  
  // Editing state
  const [editingBlankId, setEditingBlankId] = useState<string | null>(null);
  const [editingBlankAnswer, setEditingBlankAnswer] = useState('');
  
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
      setSelectedShapeId(null);
      setHistory([]);
      setHistoryIndex(-1);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter a title for this diagram.');
      return;
    }

    if (blanks.length === 0) {
      alert('Please add at least one blank field for students to fill in.');
      return;
    }

    // Check all blanks have answers
    const missingAnswers = blanks.filter(b => !b.expectedAnswer.trim());
    if (missingAnswers.length > 0) {
      alert('Please set expected answers for all blank fields.');
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
        alert('✅ Diagram updated successfully!');
      } else {
        await saveGeometryQuestion(
          teacherId,
          title,
          finalDiagramJson,
          answers,
          { subject, topic, difficulty, points, timeLimit }
        );
        alert('✅ Diagram saved successfully!');
      }

      // Reset and reload
      handleNewDiagram();
      await loadSavedQuestions();
      setView('list');
    } catch (error) {
      console.error('Failed to save:', error);
      alert('❌ Failed to save diagram: ' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleNewDiagram = () => {
    setShapes([]);
    setBlanks([]);
    setSelectedShapeId(null);
    setHistory([]);
    setHistoryIndex(-1);
    setTitle('');
    setSubject('Maths');
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
      
      // Restore shapes (would need to parse from Konva JSON)
      // For now, just load the blanks with their answers
      setTitle(question.title);
      setSubject(question.subject);
      setTopic(question.topic);
      setDifficulty(question.difficulty);
      setPoints(question.points);
      setTimeLimit(question.time_limit);
      setEditingQuestionId(question.id);
      setView('editor');
    } catch (error) {
      console.error('Failed to load question:', error);
      alert('Failed to load question for editing.');
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Delete this diagram question? This cannot be undone.')) return;

    try {
      await deleteGeometryQuestion(questionId);
      await loadSavedQuestions();
      alert('✅ Question deleted.');
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('❌ Failed to delete question.');
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
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : savedQuestions.length === 0 ? (
        <div className="card-glass p-12 text-center">
          <div className="text-6xl mb-4">📐</div>
          <p className="text-xl text-gray-400 mb-4">No geometry diagrams yet</p>
          <p className="text-gray-500 mb-6">Create interactive diagram questions with blank fields for students to fill in.</p>
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
                  <span>{question.subject}</span>
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

  // Render editor view
  const renderEditor = () => (
    <div className="flex gap-4">
      {/* Left Toolbar */}
      <div className="w-44 flex-shrink-0 space-y-4">
        <DiagramToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onClear={handleClear}
        />
        
        {/* Shapes Library */}
        <ShapesLibrary onAddShape={handleAddShapesFromLibrary} />
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

        {/* Canvas with instruction */}
        <div className="relative">
          <div className="absolute top-2 right-2 z-10 text-xs text-gray-400 bg-gray-800/80 px-2 py-1 rounded">
            💡 Use tools on left OR click shapes from library below
          </div>
          <KonvaCanvasEditor
            width={700}
            height={450}
            activeTool={activeTool}
            shapes={shapes}
            onShapesChange={setShapes}
            blanks={blanks}
            onBlanksChange={setBlanks}
            selectedShapeId={selectedShapeId}
            onSelectShape={setSelectedShapeId}
            stageRef={stageRef}
          />
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
