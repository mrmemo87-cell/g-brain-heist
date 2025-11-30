import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Line, Arrow, Circle, Text, Rect } from 'react-konva';
import { GeometryQuestion, BlankField, GeometryAnswerResult } from './types';
import { DiagramShape } from './KonvaCanvasEditor';
import { 
  loadGeometryQuestion, 
  getRandomGeometryQuestion,
  checkGeometryAnswers,
  recordGeometryAttempt,
  extractBlanks 
} from './geometryService';
import BackButton from '../BackButton';

interface GeometryPlayProps {
  questionId?: string;
  subject?: string;
  difficulty?: string;
  onComplete: (result: GeometryAnswerResult) => void;
  onBack: () => void;
  awardXP?: (points: number) => void;
}

const GRID_SIZE = 20;

const GeometryPlay: React.FC<GeometryPlayProps> = ({
  questionId,
  subject,
  difficulty,
  onComplete,
  onBack,
  awardXP
}) => {
  const stageRef = useRef<unknown>(null);
  
  const [question, setQuestion] = useState<GeometryQuestion | null>(null);
  const [blanks, setBlanks] = useState<BlankField[]>([]);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GeometryAnswerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [shapes, setShapes] = useState<DiagramShape[]>([]);

  // Load question
  useEffect(() => {
    loadQuestion();
  }, [questionId, subject, difficulty]);

  // Timer
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || result) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          handleSubmit(); // Auto-submit when time runs out
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, result]);

  const loadQuestion = async () => {
    try {
      setLoading(true);
      setResult(null);
      setStudentAnswers({});

      let q: GeometryQuestion | null = null;

      if (questionId) {
        q = await loadGeometryQuestion(questionId);
      } else {
        q = await getRandomGeometryQuestion(subject, difficulty);
      }

      if (!q) {
        alert('No geometry questions available.');
        onBack();
        return;
      }

      setQuestion(q);
      setTimeLeft(q.time_limit || 60);

      // Parse diagram and extract blanks
      try {
        const diagramData = JSON.parse(q.diagram_json);
        
        // Extract blanks from diagram data
        if (diagramData.blanks) {
          setBlanks(diagramData.blanks);
        } else {
          // Try to extract from Konva JSON
          const extracted = extractBlanks(q.diagram_json);
          setBlanks(extracted);
        }

        // Parse shapes from Konva stage JSON
        if (diagramData.children && diagramData.children[0]?.children) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const konvaShapes = diagramData.children[0].children
            .filter((node: any) => node.className !== 'Rect' || node.attrs?.shapeType !== 'blank')
            .map((node: any) => ({
              ...node.attrs,
              id: node.attrs?.id || `shape-${Math.random()}`,
              type: (node.className || '').toLowerCase()
            })) as DiagramShape[];
          setShapes(konvaShapes);
        }
      } catch (e) {
        console.error('Failed to parse diagram:', e);
        setBlanks([]);
      }
    } catch (error) {
      console.error('Failed to load question:', error);
      alert('Failed to load question.');
      onBack();
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (blankId: string, value: string) => {
    setStudentAnswers(prev => ({
      ...prev,
      [blankId]: value
    }));
  };

  const handleSubmit = async () => {
    if (!question || submitting) return;

    try {
      setSubmitting(true);

      // Check answers
      const checkResult = checkGeometryAnswers(
        studentAnswers,
        question.answers,
        question.points
      );

      setResult(checkResult);

      // Record attempt
      await recordGeometryAttempt(question.id, checkResult.isFullyCorrect);

      // Award XP if fully correct
      if (checkResult.isFullyCorrect && awardXP) {
        awardXP(checkResult.score);
      }

      onComplete(checkResult);
    } catch (error) {
      console.error('Failed to submit:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Render grid
  const renderGrid = (width: number, height: number) => {
    const lines = [];
    for (let x = 0; x <= width; x += GRID_SIZE) {
      lines.push(
        <Line key={`v-${x}`} points={[x, 0, x, height]} stroke="#374151" strokeWidth={0.5} />
      );
    }
    for (let y = 0; y <= height; y += GRID_SIZE) {
      lines.push(
        <Line key={`h-${y}`} points={[0, y, width, y]} stroke="#374151" strokeWidth={0.5} />
      );
    }
    return lines;
  };

  // Render shapes
  const renderShape = (shape: DiagramShape, index: number) => {
    switch (shape.type) {
      case 'line':
        return <Line key={index} points={shape.points} stroke={shape.stroke} strokeWidth={shape.strokeWidth} listening={false} />;
      case 'arrow':
        return <Arrow key={index} points={shape.points} stroke={shape.stroke} fill={shape.fill} strokeWidth={shape.strokeWidth} pointerLength={shape.pointerLength} pointerWidth={shape.pointerWidth} listening={false} />;
      case 'circle':
        return <Circle key={index} x={shape.x} y={shape.y} radius={shape.radius} stroke={shape.stroke} fill={shape.fill} strokeWidth={shape.strokeWidth} listening={false} />;
      case 'text':
        return <Text key={index} x={shape.x} y={shape.y} text={shape.text} fontSize={shape.fontSize} fill={shape.fill} listening={false} />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📐</div>
          <p className="text-gray-400">Loading diagram...</p>
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">😕</div>
          <p className="text-gray-400">No question found</p>
          <button
            onClick={onBack}
            className="mt-4 px-6 py-2 bg-gray-700 text-white rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const canvasWidth = 700;
  const canvasHeight = 450;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <BackButton onClick={onBack} />
          
          {/* Timer */}
          {timeLeft !== null && !result && (
            <div className={`px-4 py-2 rounded-lg font-mono text-lg ${
              timeLeft <= 10 ? 'bg-red-500/20 text-red-400' : 'bg-gray-800/50 text-gray-300'
            }`}>
              ⏱️ {formatTime(timeLeft)}
            </div>
          )}
        </div>

        {/* Question Card */}
        <div className="card-glass p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">{question.title}</h2>
              <div className="flex gap-3 mt-1 text-sm text-gray-400">
                <span>{question.subject}</span>
                <span>•</span>
                <span className="capitalize">{question.difficulty}</span>
                <span>•</span>
                <span>{question.points} XP</span>
              </div>
            </div>
            <div className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm">
              {blanks.length} blank{blanks.length !== 1 ? 's' : ''} to fill
            </div>
          </div>

          {/* Canvas with diagram */}
          <div className="relative border border-gray-700 rounded-lg overflow-hidden bg-gray-950">
            <Stage ref={stageRef} width={canvasWidth} height={canvasHeight}>
              <Layer>
                {renderGrid(canvasWidth, canvasHeight)}
                {shapes.map(renderShape)}
              </Layer>
            </Stage>

            {/* Input overlays for blanks */}
            {blanks.map((blank, index) => {
              const isCorrect = result && !result.wrongFields.includes(blank.id);
              const isWrong = result && result.wrongFields.includes(blank.id);

              return (
                <div
                  key={blank.id}
                  className="absolute"
                  style={{
                    left: blank.x,
                    top: blank.y,
                    width: blank.width,
                    height: blank.height
                  }}
                >
                  <input
                    type="text"
                    value={studentAnswers[blank.id] || ''}
                    onChange={(e: { target: { value: string } }) => handleAnswerChange(blank.id, e.target.value)}
                    disabled={!!result}
                    placeholder={`${index + 1}`}
                    className={`
                      w-full h-full text-center rounded border-2 outline-none text-sm font-semibold
                      ${result
                        ? isCorrect
                          ? 'bg-green-500/20 border-green-500 text-green-400'
                          : 'bg-red-500/20 border-red-500 text-red-400'
                        : 'bg-gray-800/80 border-gray-600 text-white focus:border-cyan-500'
                      }
                    `}
                  />
                </div>
              );
            })}
          </div>

          {/* Result Display */}
          {result && (
            <div className={`mt-6 p-4 rounded-lg border ${
              result.isFullyCorrect
                ? 'bg-green-500/10 border-green-500/50'
                : 'bg-red-500/10 border-red-500/50'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl mb-1">
                    {result.isFullyCorrect ? '🎉 Perfect!' : '❌ Not quite right'}
                  </div>
                  <p className="text-gray-300">
                    {result.correctCount} of {result.totalCount} correct
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-cyan-400">+{result.score} XP</div>
                  <p className="text-sm text-gray-400">
                    {Math.round((result.correctCount / result.totalCount) * 100)}% accuracy
                  </p>
                </div>
              </div>

              {/* Show correct answers if wrong */}
              {!result.isFullyCorrect && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <p className="text-sm text-gray-400 mb-2">Correct answers:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(question.answers).map(([id, answer], index) => (
                      <span
                        key={id}
                        className={`px-3 py-1 rounded text-sm ${
                          result.wrongFields.includes(id)
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}
                      >
                        {index + 1}: {answer}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          {!result ? (
            <button
              onClick={handleSubmit}
              disabled={submitting || Object.keys(studentAnswers).length === 0}
              className="flex-1 px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-bold text-lg hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
            >
              {submitting ? 'Checking...' : '✓ Submit Answers'}
            </button>
          ) : (
            <>
              <button
                onClick={loadQuestion}
                className="flex-1 px-6 py-4 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-bold text-lg hover:scale-[1.02] transition-all"
              >
                🔄 Try Another
              </button>
              <button
                onClick={onBack}
                className="px-6 py-4 bg-gray-700 text-white rounded-xl font-bold hover:bg-gray-600 transition-all"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GeometryPlay;
