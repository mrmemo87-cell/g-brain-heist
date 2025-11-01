import React, { useState, useEffect } from 'react';
import { Profile, TeacherQuestion, Teacher, Subject, QuestionDifficulty } from '../types';
import * as GameService from '../services/gameService';
import BackButton from './BackButton';

interface TeacherPortalProps {
  profile: Profile;
  onComplete: () => void;
}

type PortalView = 'dashboard' | 'create-question' | 'question-bank' | 'csv-upload';

const TeacherPortal: React.FC<TeacherPortalProps> = ({ profile, onComplete }) => {
  const [view, setView] = useState<PortalView>('dashboard');
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [questions, setQuestions] = useState<TeacherQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  // Question form state
  const [questionText, setQuestionText] = useState('');
  const [subject, setSubject] = useState<Subject>('Maths');
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('easy');
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'true_false' | 'short_answer'>('multiple_choice');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [explanation, setExplanation] = useState('');
  const [points, setPoints] = useState(10);

  useEffect(() => {
    loadTeacherData();
  }, []);

  const loadTeacherData = async () => {
    try {
      setLoading(true);
      const teacherProfile = await GameService.get_teacher_profile();
      
      if (!teacherProfile) {
        // User is not a teacher yet, create profile
        const newTeacher = await GameService.create_teacher_profile();
        setTeacher(newTeacher);
      } else {
        setTeacher(teacherProfile);
      }

      // Load questions
      const myQuestions = await GameService.get_my_questions();
      setQuestions(myQuestions);
    } catch (error) {
      console.error('Error loading teacher data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const questionData = {
        subject,
        difficulty,
        question_text: questionText,
        question_type: questionType,
        question_options: questionType === 'multiple_choice' ? options.filter(o => o.trim()) : undefined,
        correct_answer: correctAnswer,
        explanation,
        points,
        is_public: true // Default to public for now
      };

      await GameService.create_question(questionData);

      // Reset form
      setQuestionText('');
      setOptions(['', '', '', '']);
      setCorrectAnswer('');
      setExplanation('');

      // Reload questions
      const myQuestions = await GameService.get_my_questions();
      setQuestions(myQuestions);

      // Show success message
      alert('✅ Question created successfully!');
      setView('question-bank');
    } catch (error) {
      console.error('Error creating question:', error);
      alert('❌ Failed to create question: ' + (error as Error).message);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;

    try {
      await GameService.delete_question(questionId);
      const myQuestions = await GameService.get_my_questions();
      setQuestions(myQuestions);
      alert('✅ Question deleted!');
    } catch (error) {
      console.error('Error deleting question:', error);
      alert('❌ Failed to delete question');
    }
  };

  const handleDuplicateQuestion = (question: TeacherQuestion) => {
    // Pre-fill the form with the question data
    setSubject(question.subject);
    setDifficulty(question.difficulty);
    setQuestionType(question.question_type);
    setQuestionText(question.question_text + ' (Copy)');
    setOptions(question.question_options);
    setCorrectAnswer(question.correct_answer);
    setExplanation(question.explanation || '');
    setPoints(question.points);
    
    // Switch to create view
    setView('create-question');
  };

  // Download CSV template
  const downloadCSVTemplate = () => {
    const template = `subject,difficulty,question_type,question_text,option1,option2,option3,option4,correct_answer,explanation,points
Maths,easy,multiple_choice,"What is 2 + 2?","2","3","4","5","4","Addition of two numbers",10
Science,medium,true_false,"Water boils at 100°C at sea level","True","False","","","True","Water's boiling point at standard pressure",15
English,hard,short_answer,"What is the past tense of 'go'?","","","","","went","Irregular verb conjugation",20`;
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'question_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Parse and upload CSV
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: 0 });

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      // Skip header row
      const dataLines = lines.slice(1);
      setUploadProgress({ current: 0, total: dataLines.length });

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];
        try {
          // Parse CSV line (handle quoted values)
          const values = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)?.map(v => v.replace(/^"|"$/g, '').trim()) || [];
          
          if (values.length < 8) {
            errors.push(`Row ${i + 2}: Insufficient columns`);
            errorCount++;
            continue;
          }

          const [subjectStr, difficultyStr, questionType, questionText, opt1, opt2, opt3, opt4, correctAnswer, explanation, pointsStr] = values;

          const questionData = {
            subject: subjectStr as Subject,
            difficulty: difficultyStr as QuestionDifficulty,
            question_text: questionText,
            question_type: questionType as 'multiple_choice' | 'true_false' | 'short_answer',
            question_options: questionType === 'multiple_choice' ? [opt1, opt2, opt3, opt4].filter(Boolean) : 
                             questionType === 'true_false' ? ['True', 'False'] : [],
            correct_answer: correctAnswer,
            explanation: explanation || '',
            points: parseInt(pointsStr) || 10,
            is_public: true
          };

          await GameService.create_question(questionData);
          successCount++;
          setUploadProgress({ current: i + 1, total: dataLines.length });
        } catch (err) {
          errors.push(`Row ${i + 2}: ${(err as Error).message}`);
          errorCount++;
        }
      }

      // Reload questions
      const myQuestions = await GameService.get_my_questions();
      setQuestions(myQuestions);

      // Show results
      const message = `✅ Upload Complete!\n\nSuccess: ${successCount} questions\nFailed: ${errorCount} questions${errors.length > 0 ? '\n\nErrors:\n' + errors.slice(0, 5).join('\n') + (errors.length > 5 ? `\n... and ${errors.length - 5} more` : '') : ''}`;
      alert(message);
      
      setView('question-bank');
    } catch (error) {
      console.error('CSV upload error:', error);
      alert('❌ Failed to parse CSV: ' + (error as Error).message);
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
      // Reset file input
      e.target.value = '';
    }
  };

  // Render Dashboard
  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h1 className="font-heading text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-500 mb-2">
          👨‍🏫 Teacher Portal
        </h1>
        <p className="text-gray-400">Welcome back, {profile.username}!</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-glass p-6 text-center border-l-4 border-cyan-500">
          <div className="text-4xl font-bold text-cyan-400">{questions.length}</div>
          <div className="text-sm text-gray-400 mt-1">Questions Created</div>
        </div>
        
        <div className="card-glass p-6 text-center border-l-4 border-green-500">
          <div className="text-4xl font-bold text-green-400">
            {questions.reduce((sum, q) => sum + q.times_answered, 0)}
          </div>
          <div className="text-sm text-gray-400 mt-1">Total Answers</div>
        </div>
        
        <div className="card-glass p-6 text-center border-l-4 border-yellow-500">
          <div className="text-4xl font-bold text-yellow-400">
            {questions.length > 0 
              ? Math.round((questions.reduce((sum, q) => sum + q.times_correct, 0) / 
                  Math.max(questions.reduce((sum, q) => sum + q.times_answered, 0), 1)) * 100)
              : 0}%
          </div>
          <div className="text-sm text-gray-400 mt-1">Average Success Rate</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => setView('create-question')}
          className="card-glass p-8 hover:scale-105 transition-transform border-2 border-pink-500/50 hover:border-pink-500"
        >
          <div className="text-6xl mb-3">➕</div>
          <div className="font-heading text-2xl text-pink-400 font-bold">Create Question</div>
          <div className="text-sm text-gray-400 mt-2">Add a new question to your library</div>
        </button>

        <button
          onClick={() => setView('question-bank')}
          className="card-glass p-8 hover:scale-105 transition-transform border-2 border-cyan-500/50 hover:border-cyan-500"
        >
          <div className="text-6xl mb-3">📚</div>
          <div className="font-heading text-2xl text-cyan-400 font-bold">Question Bank</div>
          <div className="text-sm text-gray-400 mt-2">View and manage all your questions</div>
        </button>

        <button
          onClick={() => setView('csv-upload')}
          className="card-glass p-8 hover:scale-105 transition-transform border-2 border-green-500/50 hover:border-green-500"
        >
          <div className="text-6xl mb-3">📤</div>
          <div className="font-heading text-2xl text-green-400 font-bold">Bulk Upload CSV</div>
          <div className="text-sm text-gray-400 mt-2">Import multiple questions at once</div>
        </button>
      </div>
    </div>
  );

  // Render Create Question Form
  const renderCreateQuestion = () => (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => setView('dashboard')}
        className="mb-4 text-cyan-400 hover:text-cyan-300 flex items-center gap-2"
      >
        <span>←</span> Back to Dashboard
      </button>

      {/* Quick Templates */}
      <div className="card-glass p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">⚡ Quick Templates</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => {
              setQuestionType('multiple_choice');
              setQuestionText('');
              setOptions(['', '', '', '']);
            }}
            className="p-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg transition-all text-sm"
          >
            <div className="text-2xl mb-1">📝</div>
            <div className="text-cyan-400 font-semibold">Multiple Choice</div>
          </button>
          
          <button
            type="button"
            onClick={() => {
              setQuestionType('true_false');
              setQuestionText('');
              setOptions(['True', 'False']);
            }}
            className="p-3 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-lg transition-all text-sm"
          >
            <div className="text-2xl mb-1">✓✗</div>
            <div className="text-green-400 font-semibold">True/False</div>
          </button>
          
          <button
            type="button"
            onClick={() => {
              setQuestionType('short_answer');
              setQuestionText('');
              setOptions([]);
            }}
            className="p-3 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 rounded-lg transition-all text-sm"
          >
            <div className="text-2xl mb-1">✏️</div>
            <div className="text-yellow-400 font-semibold">Short Answer</div>
          </button>
          
          <button
            type="button"
            onClick={() => {
              setQuestionText('');
              setSubject('Maths');
              setDifficulty('easy');
              setQuestionType('multiple_choice');
              setOptions(['', '', '', '']);
              setCorrectAnswer('');
              setExplanation('');
              setPoints(10);
            }}
            className="p-3 bg-gray-500/10 hover:bg-gray-500/20 border border-gray-500/30 rounded-lg transition-all text-sm"
          >
            <div className="text-2xl mb-1">🔄</div>
            <div className="text-gray-400 font-semibold">Reset Form</div>
          </button>
        </div>
      </div>

      <div className="card-glass p-6">
        <h2 className="font-heading text-3xl text-pink-400 font-bold mb-6">✨ Create New Question</h2>

        <form onSubmit={handleCreateQuestion} className="space-y-6">
          {/* Subject & Difficulty */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Subject</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value as Subject)}
                className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                required
              >
                <option value="Maths">Maths</option>
                <option value="Science">Science</option>
                <option value="English">English</option>
                <option value="Russian Language">Russian Language</option>
                <option value="Kyrgyz Language">Kyrgyz Language</option>
                <option value="German Language">German Language</option>
                <option value="Geography">Geography</option>
                <option value="Global Perspective">Global Perspective</option>
                <option value="ICT">ICT</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as QuestionDifficulty)}
                className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                required
              >
                <option value="easy">⭐ Easy</option>
                <option value="medium">⭐⭐ Medium</option>
                <option value="hard">⭐⭐⭐ Hard</option>
              </select>
            </div>
          </div>

          {/* Question Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Question Type</label>
            <select
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value as any)}
              className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
              required
            >
              <option value="multiple_choice">Multiple Choice</option>
              <option value="true_false">True/False</option>
              <option value="short_answer">Short Answer</option>
            </select>
          </div>

          {/* Question Text */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Question</label>
            <textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none min-h-[100px]"
              placeholder="Enter your question here..."
              required
            />
          </div>

          {/* Multiple Choice Options */}
          {questionType === 'multiple_choice' && (
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Answer Options</label>
              <div className="space-y-2">
                {options.map((option, index) => (
                  <input
                    key={index}
                    type="text"
                    value={option}
                    onChange={(e) => {
                      const newOptions = [...options];
                      newOptions[index] = e.target.value;
                      setOptions(newOptions);
                    }}
                    className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    required
                  />
                ))}
              </div>
            </div>
          )}

          {/* Correct Answer */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Correct Answer {questionType === 'multiple_choice' && '(Enter A, B, C, or D)'}
            </label>
            <input
              type="text"
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
              placeholder={questionType === 'multiple_choice' ? 'e.g., A' : 'Enter correct answer'}
              required
            />
          </div>

          {/* Explanation */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Explanation (Optional)</label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
              placeholder="Explain why this answer is correct..."
              rows={3}
            />
          </div>

          {/* Points */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Points (XP Reward)</label>
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(parseInt(e.target.value))}
              className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
              min="1"
              max="100"
              required
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-heading font-bold text-lg py-4 rounded-xl transition-all transform hover:scale-105 shadow-lg"
          >
            ✨ Create Question
          </button>
        </form>
      </div>
    </div>
  );

  // Render Question Bank
  const renderQuestionBank = () => (
    <div>
      <button
        onClick={() => setView('dashboard')}
        className="mb-4 text-cyan-400 hover:text-cyan-300 flex items-center gap-2"
      >
        <span>←</span> Back to Dashboard
      </button>

      <div className="flex items-center justify-between mb-6">
        <h2 className="font-heading text-3xl text-cyan-400 font-bold">📚 Question Bank</h2>
        <button
          onClick={() => setView('create-question')}
          className="bg-pink-500/20 hover:bg-pink-500/30 border border-pink-400 text-pink-400 px-4 py-2 rounded-lg font-semibold transition-all"
        >
          ➕ New Question
        </button>
      </div>

      {questions.length === 0 ? (
        <div className="card-glass p-12 text-center">
          <div className="text-6xl mb-4">📝</div>
          <p className="text-xl text-gray-400 mb-4">No questions yet!</p>
          <button
            onClick={() => setView('create-question')}
            className="bg-pink-500/20 hover:bg-pink-500/30 border border-pink-400 text-pink-400 px-6 py-3 rounded-lg font-semibold"
          >
            Create Your First Question
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="card-glass p-6 hover:border-cyan-500/50 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      q.difficulty === 'easy' ? 'bg-green-500/20 text-green-400' :
                      q.difficulty === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {q.difficulty.toUpperCase()}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-400">
                      {q.subject}
                    </span>
                    <span className="text-xs text-gray-500">
                      {q.question_type.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  
                  <p className="text-lg text-white mb-3">{q.question_text}</p>
                  
                  <div className="flex items-center gap-6 text-sm text-gray-400">
                    <span>✅ {q.times_correct} correct</span>
                    <span>📊 {q.times_answered} total answers</span>
                    <span>⭐ {q.points} XP</span>
                    {q.times_answered > 0 && (
                      <span className={`font-bold ${
                        (q.times_correct / q.times_answered * 100) >= 70 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {Math.round((q.times_correct / q.times_answered) * 100)}% success
                      </span>
                    )}
                  </div>
                </div>

                <div className="ml-4 flex gap-2">
                  <button
                    onClick={() => handleDuplicateQuestion(q)}
                    className="text-cyan-400 hover:text-cyan-300 p-2 hover:bg-cyan-500/10 rounded-lg transition-all"
                    title="Duplicate question"
                  >
                    📋
                  </button>
                  <button
                    onClick={() => handleDeleteQuestion(q.id)}
                    className="text-red-400 hover:text-red-300 p-2 hover:bg-red-500/10 rounded-lg transition-all"
                    title="Delete question"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Render CSV Upload View
  const renderCSVUpload = () => (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => setView('dashboard')}
        className="mb-4 text-cyan-400 hover:text-cyan-300 flex items-center gap-2"
      >
        ← Back to Dashboard
      </button>

      <div className="card-glass p-8">
        <h2 className="font-heading text-3xl font-bold text-green-400 mb-6">📤 Bulk Upload Questions</h2>

        {/* Instructions */}
        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-6 mb-6">
          <h3 className="font-bold text-cyan-400 mb-3 flex items-center gap-2">
            <span>📋</span> How to Use CSV Upload
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
            <li>Download the CSV template using the button below</li>
            <li>Fill in your questions following the template format</li>
            <li>Save your file as a CSV (comma-separated values)</li>
            <li>Upload the file using the upload button</li>
            <li>Review the results and fix any errors if needed</li>
          </ol>
        </div>

        {/* CSV Format Guide */}
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-6 mb-6">
          <h3 className="font-bold text-purple-400 mb-3">📝 CSV Format</h3>
          <div className="text-xs text-gray-400 mb-2">Columns (in order):</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-300">1. <code className="text-cyan-400">subject</code> - Maths, Science, English, Russian Language, Kyrgyz Language, German Language, Geography, Global Perspective, ICT</div>
            <div className="text-gray-300">2. <code className="text-cyan-400">difficulty</code> - easy, medium, hard</div>
            <div className="text-gray-300">3. <code className="text-cyan-400">question_type</code> - multiple_choice, true_false, short_answer</div>
            <div className="text-gray-300">4. <code className="text-cyan-400">question_text</code> - The question</div>
            <div className="text-gray-300">5-8. <code className="text-cyan-400">option1-4</code> - Answer choices (for multiple choice)</div>
            <div className="text-gray-300">9. <code className="text-cyan-400">correct_answer</code> - The correct answer</div>
            <div className="text-gray-300">10. <code className="text-cyan-400">explanation</code> - Why it's correct</div>
            <div className="text-gray-300">11. <code className="text-cyan-400">points</code> - Point value (10-50)</div>
          </div>
        </div>

        {/* Download Template Button */}
        <div className="mb-6">
          <button
            onClick={downloadCSVTemplate}
            className="w-full py-4 px-6 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg font-bold text-white transition-all hover:scale-105 flex items-center justify-center gap-3"
          >
            <span className="text-2xl">📥</span>
            <span>Download CSV Template</span>
          </button>
        </div>

        {/* Upload Section */}
        <div className="border-2 border-dashed border-green-500/50 rounded-lg p-8 text-center">
          <input
            type="file"
            accept=".csv"
            onChange={handleCSVUpload}
            disabled={uploading}
            className="hidden"
            id="csv-upload"
          />
          <label
            htmlFor="csv-upload"
            className={`cursor-pointer inline-block ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="text-6xl mb-4">📤</div>
            <div className="font-bold text-xl text-green-400 mb-2">
              {uploading ? 'Uploading...' : 'Click to Upload CSV File'}
            </div>
            <div className="text-sm text-gray-400">
              {uploading ? 'Please wait while we process your questions' : 'Select a .csv file from your computer'}
            </div>
          </label>

          {/* Upload Progress */}
          {uploading && uploadProgress.total > 0 && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Processing questions...</span>
                <span className="text-cyan-400">{uploadProgress.current} / {uploadProgress.total}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-cyan-500 transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="mt-6 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <h4 className="font-bold text-yellow-400 mb-2 flex items-center gap-2">
            <span>💡</span> Tips for Success
          </h4>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>• Use quotes around text with commas (e.g., "What is 2 + 2, exactly?")</li>
            <li>• For true/false questions, leave option1-4 empty</li>
            <li>• For short answer, leave option1-4 empty</li>
            <li>• Ensure correct_answer matches one of your options exactly</li>
            <li>• Test with 1-2 questions first before uploading many</li>
          </ul>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-2xl text-cyan-400 animate-pulse">Loading Teacher Portal...</div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <BackButton onClick={onComplete} />
      
      <div className="max-w-6xl mx-auto">
        {view === 'dashboard' && renderDashboard()}
        {view === 'create-question' && renderCreateQuestion()}
        {view === 'question-bank' && renderQuestionBank()}
        {view === 'csv-upload' && renderCSVUpload()}
      </div>
    </div>
  );
};

export default TeacherPortal;
