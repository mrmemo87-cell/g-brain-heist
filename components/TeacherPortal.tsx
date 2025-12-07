import React, { useState, useEffect, useMemo } from 'react';
import { Profile, TeacherQuestion, Teacher, Subject, QuestionDifficulty, TeacherAssignmentSummary, TeacherAssignmentReportRow, AssignmentBatch, StudentForAssignment, QuestionOption } from '../types';
import * as GameService from '../services/gameService';
import { supabase } from '../services/supabaseClient';
import BackButton from './BackButton';
import DiagramBuilder from './geometry/DiagramBuilder';

interface TeacherPortalProps {
  profile: Profile;
  onComplete: () => void;
}

type PortalView = 'dashboard' | 'create-question' | 'question-bank' | 'csv-upload' | 'assignments' | 'create-assignment' | 'reports' | 'report-detail' | 'geometry-diagrams' | 'cambridge-reports';

// XP points based on difficulty: Easy=10, Medium=15, Hard=20
const getDefaultPointsForDifficulty = (diff: QuestionDifficulty): number => {
  switch (diff) {
    case 'easy': return 10;
    case 'medium': return 15;
    case 'hard': return 20;
    default: return 10;
  }
};

// Maximum XP a teacher can assign to a question
const MAX_QUESTION_XP = 30;

const TeacherPortal: React.FC<TeacherPortalProps> = ({ profile, onComplete }) => {
  const [view, setView] = useState<PortalView>('dashboard');
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [questions, setQuestions] = useState<TeacherQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [editingQuestion, setEditingQuestion] = useState<TeacherQuestion | null>(null);

  // Question form state
  const [questionText, setQuestionText] = useState('');
  const [questionImage, setQuestionImage] = useState<File | null>(null);
  const [questionImageUrl, setQuestionImageUrl] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [subject, setSubject] = useState<Subject>('Maths');
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('easy');
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'true_false' | 'short_answer'>('multiple_choice');
  const [options, setOptions] = useState<QuestionOption[]>([
    { text: '', image_url: undefined },
    { text: '', image_url: undefined },
    { text: '', image_url: undefined },
    { text: '', image_url: undefined }
  ]);
  const [optionImages, setOptionImages] = useState<(File | null)[]>([null, null, null, null]);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [explanation, setExplanation] = useState('');
  const [points, setPoints] = useState(10);
  const [topicMode, setTopicMode] = useState<'general' | 'custom'>('general');
  const [customTopicName, setCustomTopicName] = useState('');

  // Assignment state
  const [assignments, setAssignments] = useState<TeacherAssignmentSummary[]>([]);
  const [assignmentMode, setAssignmentMode] = useState<'batch' | 'custom'>('batch');
  const [assignmentBatch, setAssignmentBatch] = useState<AssignmentBatch>('All');
  const [assignmentSubject, setAssignmentSubject] = useState<Subject>('Maths');
  const [assignmentTopicMode, setAssignmentTopicMode] = useState<'general' | 'custom'>('general');
  const [assignmentTopicName, setAssignmentTopicName] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentInstructions, setAssignmentInstructions] = useState('');
  const [assignmentQuestionIds, setAssignmentQuestionIds] = useState<string[]>([]);
  const [assignmentDueAt, setAssignmentDueAt] = useState('');
  const [assignmentAssignedAt, setAssignmentAssignedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [assignmentDifficulty, setAssignmentDifficulty] = useState<QuestionDifficulty>('easy');
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [assignmentReport, setAssignmentReport] = useState<TeacherAssignmentReportRow[]>([]);
  const [selectedReportAssignment, setSelectedReportAssignment] = useState<TeacherAssignmentSummary | null>(null);
  const [availableStudents, setAvailableStudents] = useState<StudentForAssignment[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');

  // Cambridge Test Reports State
  const [cambridgeScores, setCambridgeScores] = useState<any[]>([]);
  const [cambridgeLoading, setCambridgeLoading] = useState(false);
  const [cambridgeQuizFilter, setCambridgeQuizFilter] = useState<string>('all');
  const [cambridgeClassFilter, setCambridgeClassFilter] = useState<string>('all');
  const [showCambridgeReport, setShowCambridgeReport] = useState(false);
  const [showCambridgeAnswers, setShowCambridgeAnswers] = useState(false);
  const [selectedCambridgeStudent, setSelectedCambridgeStudent] = useState<any | null>(null);
  const [showWritingMarkingModal, setShowWritingMarkingModal] = useState(false);
  const [autoProofreadLoading, setAutoProofreadLoading] = useState(false);
  const [writingMarks, setWritingMarks] = useState<{
    part1: { content: number; organisation: number; language: number };
    part2: { content: number; communicativeAchievement: number; organisation: number; language: number };
  }>({
    part1: { content: 0, organisation: 0, language: 0 },
    part2: { content: 0, communicativeAchievement: 0, organisation: 0, language: 0 },
  });
  const [writingFeedback, setWritingFeedback] = useState<{
    part1: { feedback: string; correctedVersion: string };
    part2: { feedback: string; correctedVersion: string };
    overallComments: string;
    releasedToStudent: boolean;
  }>({
    part1: { feedback: '', correctedVersion: '' },
    part2: { feedback: '', correctedVersion: '' },
    overallComments: '',
    releasedToStudent: false,
  });
  const [cambridgeStats, setCambridgeStats] = useState<{
    totalSubmissions: number;
    avgPercentage: number;
    highestScore: { name: string; percentage: number } | null;
    lowestScore: { name: string; percentage: number } | null;
    classStats: Record<string, { count: number; avg: number; total: number }>;
  }>({
    totalSubmissions: 0,
    avgPercentage: 0,
    highestScore: null,
    lowestScore: null,
    classStats: {}
  });

  const questionTopicLabel = useMemo(() => (
    topicMode === 'general' ? 'General' : (customTopicName.trim() || 'Custom Topic')
  ), [topicMode, customTopicName]);

  const assignmentTopicLabel = useMemo(() => (
    assignmentTopicMode === 'general' ? 'General' : (assignmentTopicName.trim() || 'Custom Topic')
  ), [assignmentTopicMode, assignmentTopicName]);
  const assignmentQuestionPool = useMemo(() => (
    questions.filter((q) => q.subject === assignmentSubject)
  ), [questions, assignmentSubject]);
  const filteredStudents = useMemo(() => {
    if (!studentSearchTerm.trim()) return availableStudents;
    const search = studentSearchTerm.toLowerCase();
    return availableStudents.filter(s => 
      s.username.toLowerCase().includes(search) ||
      s.display_name.toLowerCase().includes(search) ||
      s.batch?.toLowerCase().includes(search)
    );
  }, [availableStudents, studentSearchTerm]);
  const primarySection = useMemo<'dashboard' | 'questions' | 'assignments' | 'reports' | 'cambridge'>(() => {
    if (view === 'dashboard') return 'dashboard';
    if (view === 'question-bank' || view === 'create-question' || view === 'csv-upload') return 'questions';
    if (view === 'assignments' || view === 'create-assignment') return 'assignments';
    if (view === 'cambridge-reports') return 'cambridge';
    return 'reports';
  }, [view]);

  const changeSection = (section: 'dashboard' | 'questions' | 'assignments' | 'reports' | 'cambridge') => {
    switch (section) {
      case 'dashboard':
        setView('dashboard');
        break;
      case 'questions':
        setView('question-bank');
        break;
      case 'assignments':
        setSelectedReportAssignment(null);
        setView('assignments');
        break;
      case 'reports':
        setSelectedReportAssignment(null);
        setAssignmentReport([]);
        setView('reports');
        break;
      case 'cambridge':
        setView('cambridge-reports');
        loadCambridgeScores();
        break;
      default:
        setView('dashboard');
    }
  };

  useEffect(() => {
    loadTeacherData();
  }, []);

  useEffect(() => {
    setAssignmentQuestionIds([]);
  }, [assignmentSubject]);

  const loadAssignments = async () => {
    try {
      const rows = await GameService.get_teacher_assignments();
      setAssignments(rows);
    } catch (error) {
      console.error('Error loading assignments:', error);
    }
  };

  // Correct answers for Cambridge tests
  const correctAnswers: Record<string, Record<number, string>> = {
    'Cambridge Reading 25': {
      1:"common", 2:"typically", 3:"access", 4:"stay", 5:"hunt", 6:"defend", 7:"escape", 8:"number",
      9:"B", 10:"A", 11:"A", 12:"C", 13:"A",
      14:"G", 15:"D", 16:"F", 17:"A", 18:"C",
      19:"nothing", 20:"be", 21:"for", 22:"can", 23:"the", 24:"if", 25:"would", 26:"to",
      27:"C", 28:"A", 29:"B", 30:"C", 31:"A", 32:"D", 33:"C", 34:"A", 35:"B", 36:"C",
      37:"C", 38:"B", 39:"D", 40:"A", 41:"B", 42:"C"
    },
    'Cambridge Listening Test 1': {
      1:"C", 2:"A", 3:"B", 4:"B", 5:"C",
      6:"B", 7:"B", 8:"A", 9:"C", 10:"A",
      11:"Thursdays", 12:"flute", 13:"dance studio", 14:"restaurant", 15:"DRASTLE",
      16:"B", 17:"C", 18:"C", 19:"A", 20:"A",
      21:"H", 22:"E", 23:"D", 24:"C", 25:"B"
    }
  };

  // Skill categories for analysis
  const skillCategories: Record<string, Record<string, { questions: number[]; icon: string }>> = {
    'Cambridge Reading 25': {
      "Vocabulary & Context": { questions: [1,2,3,4,5,6,7,8], icon: "📚" },
      "Reading Comprehension": { questions: [9,10,11,12,13], icon: "📖" },
      "Scanning & Matching": { questions: [14,15,16,17,18], icon: "🔍" },
      "Grammar & Structure": { questions: [19,20,21,22,23,24,25,26], icon: "✍️" },
      "Detailed Analysis": { questions: [27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42], icon: "🎯" }
    },
    'Cambridge Listening Test 1': {
      "Picture Selection": { questions: [1,2,3,4,5], icon: "🖼️" },
      "Multiple Choice": { questions: [6,7,8,9,10], icon: "📝" },
      "Form Completion": { questions: [11,12,13,14,15], icon: "📋" },
      "Interview Comprehension": { questions: [16,17,18,19,20], icon: "🎤" },
      "Speaker Matching": { questions: [21,22,23,24,25], icon: "🔊" }
    }
  };

  // Section definitions for answer details
  const testSections: Record<string, Array<{ name: string; icon: string; questions: number[] }>> = {
    'Cambridge Reading 25': [
      { name: "Part 1: Vocabulary & Context", icon: "📚", questions: [1,2,3,4,5,6,7,8] },
      { name: "Part 2: Reading Comprehension", icon: "📖", questions: [9,10,11,12,13] },
      { name: "Part 3: Matching Paragraphs", icon: "🔍", questions: [14,15,16,17,18] },
      { name: "Part 4: Grammar & Gap Fill", icon: "✍️", questions: [19,20,21,22,23,24,25,26] },
      { name: "Part 5: Detailed Comprehension", icon: "🎯", questions: [27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42] }
    ],
    'Cambridge Listening Test 1': [
      { name: "Part 1: Picture Selection", icon: "🖼️", questions: [1,2,3,4,5] },
      { name: "Part 2: Multiple Choice", icon: "📝", questions: [6,7,8,9,10] },
      { name: "Part 3: Form Completion", icon: "📋", questions: [11,12,13,14,15] },
      { name: "Part 4: Interview", icon: "🎤", questions: [16,17,18,19,20] },
      { name: "Part 5: Speaker Matching", icon: "🔊", questions: [21,22,23,24,25] }
    ]
  };

  // Action plans for improvement
  const actionPlans: Record<string, { title: string; tips: string[] }> = {
    "Vocabulary & Context": {
      title: "Build Your Vocabulary",
      tips: ["Read for 15-20 minutes daily", "Create flashcards for new words", "Use new words in your own writing"]
    },
    "Reading Comprehension": {
      title: "Strengthen Reading Skills",
      tips: ["Read questions first before the passage", "Underline keywords in questions", "Practice summarizing paragraphs"]
    },
    "Scanning & Matching": {
      title: "Improve Scanning Technique",
      tips: ["Practice finding specific names and dates", "Identify topic sentences", "Look for synonyms"]
    },
    "Grammar & Structure": {
      title: "Master Grammar Patterns",
      tips: ["Review preposition rules", "Study common collocations", "Read the complete sentence before answering"]
    },
    "Detailed Analysis": {
      title: "Develop Analytical Reading",
      tips: ["Pay attention to contrast words", "Be skeptical of extreme answers", "Find evidence in the text"]
    },
    "Picture Selection": {
      title: "Improve Visual Listening",
      tips: ["Study all pictures before audio plays", "Note key differences between options", "Listen for specific details"]
    },
    "Multiple Choice": {
      title: "Master MCQ Listening",
      tips: ["Read all options before listening", "Eliminate obviously wrong answers", "Listen for synonyms"]
    },
    "Form Completion": {
      title: "Improve Note-Taking",
      tips: ["Predict what type of word is needed", "Pay attention to spelling", "Listen for numbers and names"]
    },
    "Interview Comprehension": {
      title: "Understand Conversations",
      tips: ["Focus on the speaker's main point", "Listen for opinion words", "Note changes in tone"]
    },
    "Speaker Matching": {
      title: "Match Speakers Accurately",
      tips: ["Listen for key phrases", "Match feelings/opinions to speakers", "Don't be confused by similar content"]
    }
  };

  // Load Cambridge test scores for teacher's classes
  const loadCambridgeScores = async () => {
    setCambridgeLoading(true);
    try {
      // Get the teacher's batch/class from profile (teachers see students in their assigned classes)
      // For now, load all scores and filter by class if needed
      const { data, error } = await supabase
        .from('quiz_scores')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      const scores = data || [];
      
      // Filter by teacher's classes if profile.batch is set
      // Teachers can see all classes they teach
      const teacherBatch = profile.batch;
      let filteredScores = scores;
      
      // If teacher has a specific batch assigned, filter to only show those students
      // But most teachers should see all students, so we'll show all by default
      // This can be enhanced later with a teacher_classes table
      
      setCambridgeScores(filteredScores);

      // Calculate stats
      if (filteredScores.length > 0) {
        const avgPercentage = Math.round(filteredScores.reduce((sum, s) => sum + (s.percentage || 0), 0) / filteredScores.length);
        const sorted = [...filteredScores].sort((a, b) => b.percentage - a.percentage);
        const highestScore = sorted[0] ? { name: sorted[0].student_name, percentage: sorted[0].percentage } : null;
        const lowestScore = sorted[sorted.length - 1] ? { name: sorted[sorted.length - 1].student_name, percentage: sorted[sorted.length - 1].percentage } : null;
        
        // Class stats
        const classStats: Record<string, { count: number; avg: number; total: number }> = {};
        filteredScores.forEach(s => {
          const cls = s.student_class || 'Unknown';
          if (!classStats[cls]) classStats[cls] = { count: 0, avg: 0, total: 0 };
          classStats[cls].count++;
          classStats[cls].total += s.percentage || 0;
        });
        Object.keys(classStats).forEach(cls => {
          classStats[cls].avg = Math.round(classStats[cls].total / classStats[cls].count);
        });

        setCambridgeStats({
          totalSubmissions: filteredScores.length,
          avgPercentage,
          highestScore,
          lowestScore,
          classStats
        });
      } else {
        setCambridgeStats({
          totalSubmissions: 0,
          avgPercentage: 0,
          highestScore: null,
          lowestScore: null,
          classStats: {}
        });
      }
    } catch (error) {
      console.error('Failed to fetch Cambridge scores:', error);
    } finally {
      setCambridgeLoading(false);
    }
  };

  // Get unique quiz names and classes for filters
  const uniqueCambridgeQuizNames = [...new Set(cambridgeScores.map(s => s.quiz_name))];
  const uniqueCambridgeClasses = [...new Set(cambridgeScores.map(s => s.student_class || 'Unknown'))].sort();

  // Filter Cambridge scores
  const filteredCambridgeScores = cambridgeScores.filter(s => {
    if (cambridgeQuizFilter !== 'all' && s.quiz_name !== cambridgeQuizFilter) return false;
    if (cambridgeClassFilter !== 'all' && (s.student_class || 'Unknown') !== cambridgeClassFilter) return false;
    return true;
  });

  // Format time taken
  const formatCambridgeTime = (seconds: number) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Analyze skill performance for a student
  const analyzeSkillPerformance = (student: any) => {
    const quizName = student.quiz_name;
    const answers = student.answers || {};
    const correct = correctAnswers[quizName] || {};
    const skills = skillCategories[quizName] || {};
    
    const result: Record<string, { correct: number; total: number; percentage: number; icon: string }> = {};
    
    Object.entries(skills).forEach(([skill, data]) => {
      let skillCorrect = 0;
      data.questions.forEach(q => {
        const studentAns = (answers[q] || '').toString().trim().toLowerCase();
        const correctAns = (correct[q] || '').toString().toLowerCase();
        if (studentAns === correctAns) skillCorrect++;
      });
      result[skill] = {
        correct: skillCorrect,
        total: data.questions.length,
        percentage: Math.round((skillCorrect / data.questions.length) * 100),
        icon: data.icon
      };
    });
    
    return result;
  };

  // Get grade based on percentage
  const getGrade = (percentage: number) => {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B';
    if (percentage >= 60) return 'C';
    if (percentage >= 50) return 'D';
    return 'F';
  };

  // Get encouragement based on grade
  const getEncouragement = (grade: string) => {
    switch (grade) {
      case 'A+': return { title: "🌟 Outstanding Achievement!", message: "You've mastered this material! Keep challenging yourself with advanced content." };
      case 'A': return { title: "🎯 Excellent Work!", message: "You're performing at a high level. Focus on the few areas that need polish." };
      case 'B': return { title: "👍 Good Progress!", message: "You have a solid foundation. Target your weak areas for improvement." };
      case 'C': return { title: "📈 Room to Grow", message: "You're on the right track. More practice will boost your scores." };
      case 'D': return { title: "💪 Keep Pushing!", message: "Don't give up! Focus on understanding core concepts." };
      default: return { title: "🚀 Start Your Journey", message: "Every expert was once a beginner. Let's work on building your skills." };
    }
  };

  // Open report modal
  const openCambridgeReport = (student: any) => {
    setSelectedCambridgeStudent(student);
    setShowCambridgeReport(true);
  };

  // Open answers modal
  const openCambridgeAnswers = (student: any) => {
    setSelectedCambridgeStudent(student);
    setShowCambridgeAnswers(true);
  };

  // Open writing marking modal
  const openWritingMarking = (student: any) => {
    setSelectedCambridgeStudent(student);
    // Reset marks or load existing marks if already marked
    if (student.percentage > 0 && student.answers?.marks) {
      setWritingMarks(student.answers.marks);
    } else {
      setWritingMarks({
        part1: { content: 0, organisation: 0, language: 0 },
        part2: { content: 0, communicativeAchievement: 0, organisation: 0, language: 0 },
      });
    }
    // Load existing feedback if available
    if (student.answers?.feedback) {
      setWritingFeedback(student.answers.feedback);
    } else {
      setWritingFeedback({
        part1: { feedback: '', correctedVersion: '' },
        part2: { feedback: '', correctedVersion: '' },
        overallComments: '',
        releasedToStudent: false,
      });
    }
    setShowWritingMarkingModal(true);
  };

  // Submit writing marks
  const submitWritingMarks = async (releaseToStudent: boolean = false) => {
    if (!selectedCambridgeStudent) return;
    
    const part1Total = writingMarks.part1.content + writingMarks.part1.organisation + writingMarks.part1.language;
    const part2Total = writingMarks.part2.content + writingMarks.part2.communicativeAchievement + 
                       writingMarks.part2.organisation + writingMarks.part2.language;
    const totalScore = part1Total + part2Total;
    const maxScore = 35; // 15 for Part 1 + 20 for Part 2
    const percentage = Math.round((totalScore / maxScore) * 100);
    
    const updatedFeedback = {
      ...writingFeedback,
      releasedToStudent: releaseToStudent,
    };
    
    try {
      const { error } = await supabase
        .from('quiz_scores')
        .update({
          score: totalScore,
          percentage: percentage,
          answers: {
            ...selectedCambridgeStudent.answers,
            marks: writingMarks,
            feedback: updatedFeedback,
            marked_by: profile.username,
            marked_at: new Date().toISOString(),
            requires_marking: false
          }
        })
        .eq('id', selectedCambridgeStudent.id);
      
      if (error) throw error;
      
      alert(releaseToStudent 
        ? '✅ Marked and released to student!' 
        : '✅ Writing marked successfully! (Not yet visible to student)');
      setShowWritingMarkingModal(false);
      loadCambridgeScores(); // Refresh the list
    } catch (error) {
      console.error('Failed to submit marks:', error);
      alert('❌ Failed to submit marks');
    }
  };

  // Detailed teacher-style proofreading function
  const proofreadText = (text: string, wordTarget: string, isPart1: boolean): {
    feedback: string;
    correctedVersion: string;
    suggestedMarks: Record<string, number>;
  } => {
    const originalText = text;
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    // Spelling corrections dictionary with explanations
    const spellingFixes: { pattern: RegExp; correct: string; why: string }[] = [
      { pattern: /\bhelo\b/gi, correct: 'hello', why: 'Missing an "l"' },
      { pattern: /\bhelllo\b/gi, correct: 'hello', why: 'Extra "l"' },
      { pattern: /\bteh\b/gi, correct: 'the', why: 'Letters in wrong order' },
      { pattern: /\bwiht\b/gi, correct: 'with', why: 'Letters in wrong order' },
      { pattern: /\bfreind\b/gi, correct: 'friend', why: '"i" before "e" except after "c"' },
      { pattern: /\brecieve\b/gi, correct: 'receive', why: '"i" before "e" except after "c"' },
      { pattern: /\bbecouse\b/gi, correct: 'because', why: 'Incorrect spelling' },
      { pattern: /\bbeacuse\b/gi, correct: 'because', why: 'Letters in wrong order' },
      { pattern: /\bbecuase\b/gi, correct: 'because', why: 'Letters in wrong order' },
      { pattern: /\bdefinately\b/gi, correct: 'definitely', why: 'Common misspelling - remember "finite"' },
      { pattern: /\bdefintely\b/gi, correct: 'definitely', why: 'Missing letters' },
      { pattern: /\bintresting\b/gi, correct: 'interesting', why: 'Missing "e"' },
      { pattern: /\bintersting\b/gi, correct: 'interesting', why: 'Missing "e"' },
      { pattern: /\brealy\b/gi, correct: 'really', why: 'Missing "l"' },
      { pattern: /\breallly\b/gi, correct: 'really', why: 'Extra "l"' },
      { pattern: /\bbeautifull\b/gi, correct: 'beautiful', why: 'Only one "l" at the end' },
      { pattern: /\bbeatiful\b/gi, correct: 'beautiful', why: 'Missing "u"' },
      { pattern: /\balot\b/gi, correct: 'a lot', why: 'Should be two words' },
      { pattern: /\bthier\b/gi, correct: 'their', why: '"e" before "i"' },
      { pattern: /\bwierd\b/gi, correct: 'weird', why: '"e" before "i" (exception to rule)' },
      { pattern: /\buntill\b/gi, correct: 'until', why: 'Only one "l"' },
      { pattern: /\boccured\b/gi, correct: 'occurred', why: 'Double "r"' },
      { pattern: /\bseperate\b/gi, correct: 'separate', why: '"a" not "e" in the middle' },
      { pattern: /\bneccessary\b/gi, correct: 'necessary', why: 'One "c", double "s"' },
      { pattern: /\bnecesary\b/gi, correct: 'necessary', why: 'Double "s"' },
      { pattern: /\baccomodate\b/gi, correct: 'accommodate', why: 'Double "c" and double "m"' },
      { pattern: /\btommorow\b/gi, correct: 'tomorrow', why: 'One "m", double "r"' },
      { pattern: /\btomorow\b/gi, correct: 'tomorrow', why: 'Double "r"' },
      { pattern: /\bwich\b/gi, correct: 'which', why: 'Missing "h"' },
      { pattern: /\bwher\b/gi, correct: 'where', why: 'Missing "e"' },
      { pattern: /\bnex\b/gi, correct: 'next', why: 'Missing "t"' },
      { pattern: /\bmatch\b(?=\s+(cost|money|it))/gi, correct: 'much', why: '"match" ≠ "much"' },
      { pattern: /\bpictshars\b/gi, correct: 'pictures', why: 'Incorrect spelling' },
      { pattern: /\bpicters\b/gi, correct: 'pictures', why: 'Missing "u"' },
      { pattern: /\bphotograpy\b/gi, correct: 'photography', why: 'Missing "h"' },
      { pattern: /\bohotography\b/gi, correct: 'photography', why: 'Letters in wrong order' },
      { pattern: /\btakeing\b/gi, correct: 'taking', why: 'Remove the "e" before "-ing"' },
      { pattern: /\bcomeing\b/gi, correct: 'coming', why: 'Remove the "e" before "-ing"' },
      { pattern: /\bwriteing\b/gi, correct: 'writing', why: 'Remove the "e" before "-ing"' },
      { pattern: /\bhaveing\b/gi, correct: 'having', why: 'Remove the "e" before "-ing"' },
      { pattern: /\bloveing\b/gi, correct: 'loving', why: 'Remove the "e" before "-ing"' },
      { pattern: /\bdint\b/gi, correct: "didn't / don't", why: '"dint" is not a word' },
      { pattern: /\bwanna\b/gi, correct: 'want to', why: 'Informal - use "want to" in formal writing' },
      { pattern: /\bgonna\b/gi, correct: 'going to', why: 'Informal - use "going to" in formal writing' },
      { pattern: /\bgotta\b/gi, correct: 'got to / have to', why: 'Informal - use "have to" in formal writing' },
      { pattern: /\bppl\b/gi, correct: 'people', why: 'Avoid abbreviations in formal writing' },
      { pattern: /\bu\b/gi, correct: 'you', why: 'Avoid text-speak in formal writing' },
      { pattern: /\bur\b/gi, correct: 'your / you\'re', why: 'Avoid text-speak in formal writing' },
      { pattern: /\br\b(?=\s)/gi, correct: 'are', why: 'Avoid text-speak in formal writing' },
      { pattern: /\bshoping\b/gi, correct: 'shopping', why: 'Double "p"' },
      { pattern: /\bexperiance\b/gi, correct: 'experience', why: '"e" not "a"' },
      { pattern: /\bexpirence\b/gi, correct: 'experience', why: 'Incorrect spelling' },
    ];
    
    // Grammar fixes with contractions
    const grammarFixes: { pattern: RegExp; correct: string; why: string }[] = [
      { pattern: /\bdont\b/gi, correct: "don't", why: 'Missing apostrophe' },
      { pattern: /\bcant\b/gi, correct: "can't", why: 'Missing apostrophe' },
      { pattern: /\bwont\b/gi, correct: "won't", why: 'Missing apostrophe' },
      { pattern: /\bdidnt\b/gi, correct: "didn't", why: 'Missing apostrophe' },
      { pattern: /\bisnt\b/gi, correct: "isn't", why: 'Missing apostrophe' },
      { pattern: /\barent\b/gi, correct: "aren't", why: 'Missing apostrophe' },
      { pattern: /\bwasnt\b/gi, correct: "wasn't", why: 'Missing apostrophe' },
      { pattern: /\bwerent\b/gi, correct: "weren't", why: 'Missing apostrophe' },
      { pattern: /\bhasnt\b/gi, correct: "hasn't", why: 'Missing apostrophe' },
      { pattern: /\bhavent\b/gi, correct: "haven't", why: 'Missing apostrophe' },
      { pattern: /\bwouldnt\b/gi, correct: "wouldn't", why: 'Missing apostrophe' },
      { pattern: /\bcouldnt\b/gi, correct: "couldn't", why: 'Missing apostrophe' },
      { pattern: /\bshouldnt\b/gi, correct: "shouldn't", why: 'Missing apostrophe' },
      { pattern: /\bits\b(?=\s+(a\s+)?(good|great|nice|bad|important|better|worse|easy|hard|difficult))/gi, correct: "it's", why: '"it\'s" = "it is"' },
      { pattern: /\byoure\b/gi, correct: "you're", why: '"you\'re" = "you are"' },
      { pattern: /\btheyre\b/gi, correct: "they're", why: '"they\'re" = "they are"' },
      { pattern: /\bwere\b(?=\s+(going|coming|doing|making|leaving|taking))/gi, correct: "we're", why: '"we\'re" = "we are"' },
      { pattern: /\bcould of\b/gi, correct: 'could have', why: '"of" sounds like "have" but is incorrect' },
      { pattern: /\bwould of\b/gi, correct: 'would have', why: '"of" sounds like "have" but is incorrect' },
      { pattern: /\bshould of\b/gi, correct: 'should have', why: '"of" sounds like "have" but is incorrect' },
    ];
    
    // Find spelling mistakes
    const spellingMistakes: { wrong: string; correct: string; why: string }[] = [];
    let correctedText = text;
    
    spellingFixes.forEach(({ pattern, correct, why }) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (!spellingMistakes.find(m => m.wrong.toLowerCase() === match.toLowerCase())) {
            spellingMistakes.push({ wrong: match, correct, why });
          }
        });
        correctedText = correctedText.replace(pattern, correct);
      }
    });
    
    // Find grammar mistakes
    const grammarMistakes: { wrong: string; correct: string; why: string }[] = [];
    
    grammarFixes.forEach(({ pattern, correct, why }) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (!grammarMistakes.find(m => m.wrong.toLowerCase() === match.toLowerCase())) {
            grammarMistakes.push({ wrong: match, correct, why });
          }
        });
        correctedText = correctedText.replace(pattern, correct);
      }
    });
    
    // Check for lowercase "i"
    const lowercaseI = text.match(/\bi\b(?![''])/g);
    if (lowercaseI) {
      grammarMistakes.push({ wrong: 'i', correct: 'I', why: 'Pronoun "I" is always capitalized' });
      correctedText = correctedText.replace(/\bi\b(?![''])/g, 'I');
    }
    
    // Check for uncapitalized city/country names
    const commonPlaces = ['paris', 'london', 'tokyo', 'england', 'france', 'america', 'china', 'spain', 'italy', 'germany'];
    commonPlaces.forEach(place => {
      const regex = new RegExp(`\\b${place}\\b`, 'g');
      if (regex.test(text)) {
        const capitalized = place.charAt(0).toUpperCase() + place.slice(1);
        spellingMistakes.push({ wrong: place, correct: capitalized, why: 'Capitalize city/country names' });
        correctedText = correctedText.replace(regex, capitalized);
      }
    });
    
    // Fix punctuation
    correctedText = correctedText
      .replace(/\s+,/g, ',')
      .replace(/,(?!\s)/g, ', ')
      .replace(/\s+\./g, '.')
      .replace(/\.(?!\s|$)/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    
    // Capitalize first letter
    if (correctedText.length > 0) {
      correctedText = correctedText[0].toUpperCase() + correctedText.slice(1);
    }
    
    // Build detailed feedback with 6 structured sections
    const feedbackParts: string[] = [];
    const targetMatch = wordTarget.match(/(\d+)-(\d+)/);
    
    // ═══════════════════════════════════════════════════════════
    // SECTION 1: ORIGINAL STUDENT TEXT
    // ═══════════════════════════════════════════════════════════
    feedbackParts.push('📝 SECTION 1: ORIGINAL STUDENT TEXT');
    feedbackParts.push('═'.repeat(45));
    feedbackParts.push('');
    feedbackParts.push(`"${originalText}"`);
    feedbackParts.push('');
    if (targetMatch) {
      const [, min, max] = targetMatch;
      feedbackParts.push(`📊 Word Count: ${wordCount} words (Target: ${wordTarget})`);
      if (wordCount < parseInt(min)) {
        feedbackParts.push(`⚠️ Your text is ${parseInt(min) - wordCount} words below the minimum.`);
      } else if (wordCount > parseInt(max)) {
        feedbackParts.push(`⚠️ Your text is ${wordCount - parseInt(max)} words above the maximum.`);
      } else {
        feedbackParts.push('✅ Great! Word count is within the target range.');
      }
    }
    feedbackParts.push('');
    
    // ═══════════════════════════════════════════════════════════
    // SECTION 2: SPELLING MISTAKES & CORRECTIONS
    // ═══════════════════════════════════════════════════════════
    feedbackParts.push('🔤 SECTION 2: SPELLING MISTAKES & CORRECTIONS');
    feedbackParts.push('═'.repeat(45));
    feedbackParts.push('');
    
    if (spellingMistakes.length > 0) {
      feedbackParts.push('| ❌ Wrong | ✅ Correct | 💡 Why? |');
      feedbackParts.push('|---------|-----------|---------|');
      spellingMistakes.forEach(({ wrong, correct, why }) => {
        feedbackParts.push(`| ${wrong} | ${correct} | ${why} |`);
      });
      feedbackParts.push('');
      feedbackParts.push(`📌 Total spelling errors found: ${spellingMistakes.length}`);
    } else {
      feedbackParts.push('✅ Excellent! No spelling mistakes detected.');
      feedbackParts.push('Your spelling is accurate — well done!');
    }
    feedbackParts.push('');
    
    // ═══════════════════════════════════════════════════════════
    // SECTION 3: GRAMMAR & STRUCTURE ISSUES
    // ═══════════════════════════════════════════════════════════
    feedbackParts.push('🔧 SECTION 3: GRAMMAR & STRUCTURE ISSUES');
    feedbackParts.push('═'.repeat(45));
    feedbackParts.push('');
    
    let issueNumber = 1;
    
    if (grammarMistakes.length > 0) {
      grammarMistakes.forEach(({ wrong, correct, why }) => {
        feedbackParts.push(`${issueNumber}. ❌ You wrote: "${wrong}"`);
        feedbackParts.push(`   ✅ Correct: "${correct}"`);
        feedbackParts.push(`   💡 Explanation: ${why}`);
        feedbackParts.push('');
        issueNumber++;
      });
    }
    
    // Structure issues
    const structureIssues: string[] = [];
    
    if (sentences.length < 2) {
      structureIssues.push('Your response has only one sentence. Try developing your ideas with 2-3 sentences for better clarity.');
    }
    
    if (text.length > 100 && !text.includes('.')) {
      structureIssues.push('This is a run-on sentence! Long sentences without periods are hard to read. Break your ideas into shorter sentences.');
    }
    
    if (!isPart1 && !text.includes('\n') && wordCount > 80) {
      structureIssues.push('Your essay is one big block of text. Use paragraphs to organize your ideas (introduction, main point, conclusion).');
    }
    
    if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
      structureIssues.push('Always start your writing with a capital letter.');
    }
    
    if (!text.match(/[.!?]$/)) {
      structureIssues.push('Your text doesn\'t end with proper punctuation. Always finish with a period (.), question mark (?), or exclamation mark (!).');
    }
    
    // Check for very short sentences
    const shortSentences = sentences.filter(s => s.trim().split(/\s+/).length < 3);
    if (shortSentences.length > 0) {
      structureIssues.push('Some of your sentences are very short. Try combining ideas or adding more detail.');
    }
    
    // Check for repetitive sentence starts
    const sentenceStarts = sentences.map(s => s.trim().split(/\s+/)[0]?.toLowerCase());
    const repeatedStarts = sentenceStarts.filter((start, i) => sentenceStarts.indexOf(start) !== i);
    if (repeatedStarts.length > 0) {
      structureIssues.push(`You start multiple sentences with "${repeatedStarts[0]}". Vary your sentence beginnings for better flow.`);
    }
    
    if (structureIssues.length > 0) {
      structureIssues.forEach(issue => {
        feedbackParts.push(`${issueNumber}. 📝 ${issue}`);
        issueNumber++;
      });
    }
    
    if (grammarMistakes.length === 0 && structureIssues.length === 0) {
      feedbackParts.push('✅ Good job! No major grammar or structure issues found.');
    }
    feedbackParts.push('');
    
    // ═══════════════════════════════════════════════════════════
    // SECTION 4: ORGANIZATION & CLARITY
    // ═══════════════════════════════════════════════════════════
    feedbackParts.push('📋 SECTION 4: ORGANIZATION & CLARITY');
    feedbackParts.push('═'.repeat(45));
    feedbackParts.push('');
    
    const clarityPoints: string[] = [];
    
    // Check cohesion - linking words
    const linkingWords = ['however', 'therefore', 'moreover', 'furthermore', 'also', 'in addition', 'firstly', 'secondly', 'finally', 'because', 'although', 'while'];
    const usedLinkingWords = linkingWords.filter(word => text.toLowerCase().includes(word));
    
    if (usedLinkingWords.length > 0) {
      clarityPoints.push(`✅ Good use of linking words: ${usedLinkingWords.join(', ')}`);
    } else if (sentences.length > 2) {
      clarityPoints.push('💡 Tip: Use linking words (however, also, because, therefore) to connect your ideas.');
    }
    
    // Check for clear topic
    if (isPart1) {
      if (text.toLowerCase().includes('photography') || text.toLowerCase().includes('photo') || text.toLowerCase().includes('picture')) {
        clarityPoints.push('✅ You addressed the topic (photography) clearly.');
      } else {
        clarityPoints.push('⚠️ Make sure you address the main topic in your response.');
      }
    } else {
      if (text.toLowerCase().includes('shop') || text.toLowerCase().includes('buy') || text.toLowerCase().includes('store') || text.toLowerCase().includes('online')) {
        clarityPoints.push('✅ You addressed the topic (shopping) in your essay.');
      }
    }
    
    // Flow check
    if (sentences.length >= 3) {
      clarityPoints.push('✅ Good length — you developed your ideas well.');
    } else if (sentences.length === 2) {
      clarityPoints.push('💡 Try adding one more sentence to fully develop your point.');
    }
    
    clarityPoints.forEach(point => feedbackParts.push(point));
    feedbackParts.push('');
    
    // ═══════════════════════════════════════════════════════════
    // SECTION 5: IMPROVED VERSION
    // ═══════════════════════════════════════════════════════════
    feedbackParts.push('✨ SECTION 5: IMPROVED VERSION');
    feedbackParts.push('═'.repeat(45));
    feedbackParts.push('');
    feedbackParts.push('Here is your text with all corrections applied:');
    feedbackParts.push('');
    feedbackParts.push(`"${correctedText}"`);
    feedbackParts.push('');
    feedbackParts.push('📌 Compare this with your original to see the improvements!');
    feedbackParts.push('');
    
    // ═══════════════════════════════════════════════════════════
    // SECTION 6: TEACHER FEEDBACK FOR THE STUDENT
    // ═══════════════════════════════════════════════════════════
    feedbackParts.push('💬 SECTION 6: TEACHER FEEDBACK FOR YOU');
    feedbackParts.push('═'.repeat(45));
    feedbackParts.push('');
    
    const totalErrors = spellingMistakes.length + grammarMistakes.length + structureIssues.length;
    
    if (totalErrors === 0) {
      feedbackParts.push('🌟 Outstanding work! Your writing is clear, accurate, and well-organized.');
      feedbackParts.push('');
      feedbackParts.push('You\'ve shown excellent control of spelling, grammar, and sentence structure.');
      feedbackParts.push('Keep reading and writing regularly to maintain this high standard!');
      feedbackParts.push('');
      feedbackParts.push('⭐ Next challenge: Try using more advanced vocabulary or complex sentences.');
    } else if (totalErrors <= 3) {
      feedbackParts.push('👏 Well done! You communicated your ideas clearly with just a few small errors.');
      feedbackParts.push('');
      feedbackParts.push('What you did well:');
      feedbackParts.push('• You expressed your thoughts clearly');
      feedbackParts.push('• Your message was easy to understand');
      feedbackParts.push('');
      feedbackParts.push('To improve:');
      if (spellingMistakes.length > 0) {
        feedbackParts.push(`• Review these spellings: ${spellingMistakes.map(m => m.correct).join(', ')}`);
      }
      if (grammarMistakes.length > 0) {
        feedbackParts.push('• Practice using apostrophes in contractions (don\'t, can\'t, it\'s)');
      }
      feedbackParts.push('');
      feedbackParts.push('⭐ Keep practising — you\'re doing great!');
    } else if (totalErrors <= 6) {
      feedbackParts.push('📈 Good effort! You\'re making progress, and I can see you\'re trying.');
      feedbackParts.push('');
      feedbackParts.push('Focus areas for improvement:');
      if (spellingMistakes.length > 2) {
        feedbackParts.push('⭐ Spelling: Keep a vocabulary notebook and write each word 3 times.');
      }
      if (grammarMistakes.length > 1) {
        feedbackParts.push('⭐ Grammar: Read your work aloud — you\'ll catch more mistakes!');
      }
      if (structureIssues.length > 1) {
        feedbackParts.push('⭐ Structure: Plan your writing before you start (beginning, middle, end).');
      }
      feedbackParts.push('');
      feedbackParts.push('💪 You\'re improving! Keep working on the areas above.');
    } else {
      feedbackParts.push('💪 Don\'t give up! Every mistake is a chance to learn.');
      feedbackParts.push('');
      feedbackParts.push('I noticed you need extra practice with:');
      feedbackParts.push('');
      feedbackParts.push('1️⃣ SPELLING');
      feedbackParts.push('   • Write new words in a notebook');
      feedbackParts.push('   • Practice each word 5 times');
      feedbackParts.push('   • Use them in your own sentences');
      feedbackParts.push('');
      feedbackParts.push('2️⃣ CAPITALIZATION');
      feedbackParts.push('   • Always capitalize "I"');
      feedbackParts.push('   • Capitalize names of people and places');
      feedbackParts.push('   • Start every sentence with a capital letter');
      feedbackParts.push('');
      feedbackParts.push('3️⃣ PUNCTUATION');
      feedbackParts.push('   • End every sentence with . ? or !');
      feedbackParts.push('   • Use apostrophes: don\'t, can\'t, I\'m');
      feedbackParts.push('');
      feedbackParts.push('⭐ Tip: Read your writing slowly before submitting. You\'ll catch many errors!');
      feedbackParts.push('');
      feedbackParts.push('I believe in you! 📚');
    }
    
    // Calculate scores
    let contentScore = 4;
    let organisationScore = 4;
    let languageScore = 4;
    
    // Adjust based on word count
    if (targetMatch) {
      const [, min] = targetMatch;
      if (wordCount < parseInt(min) * 0.5) {
        contentScore = 1;
      } else if (wordCount < parseInt(min) * 0.75) {
        contentScore = 2;
      } else if (wordCount < parseInt(min)) {
        contentScore = 3;
      }
    }
    
    // Adjust based on errors
    if (totalErrors > 8) {
      languageScore = 1;
    } else if (totalErrors > 5) {
      languageScore = 2;
    } else if (totalErrors > 2) {
      languageScore = 3;
    } else if (totalErrors === 0) {
      languageScore = 5;
    }
    
    // Adjust organisation based on structure
    if (structureIssues.length > 2) {
      organisationScore = 2;
    } else if (structureIssues.length > 0) {
      organisationScore = 3;
    } else if (sentences.length >= 3) {
      organisationScore = 5;
    }
    
    const marks: Record<string, number> = isPart1
      ? { content: contentScore, organisation: organisationScore, language: languageScore }
      : { content: contentScore, communicativeAchievement: organisationScore, organisation: organisationScore, language: languageScore };
    
    return {
      feedback: feedbackParts.join('\n'),
      correctedVersion: correctedText,
      suggestedMarks: marks,
    };
  };

  // Auto-proofread writing (client-side)
  const autoProofreadWriting = () => {
    if (!selectedCambridgeStudent) return;
    
    const answers = selectedCambridgeStudent.answers || {};
    const part1Text = answers.part1 || '';
    const part2Text = answers.part2 || '';
    
    if (!part1Text && !part2Text) {
      alert('No student writing to proofread!');
      return;
    }
    
    setAutoProofreadLoading(true);
    
    // Use setTimeout to show loading state
    setTimeout(() => {
      try {
        // Process Part 1
        if (part1Text.trim()) {
          const result1 = proofreadText(part1Text, '45-55', true);
          setWritingFeedback(prev => ({
            ...prev,
            part1: { feedback: result1.feedback, correctedVersion: result1.correctedVersion }
          }));
          setWritingMarks(prev => ({
            ...prev,
            part1: {
              content: result1.suggestedMarks.content ?? prev.part1.content,
              organisation: result1.suggestedMarks.organisation ?? prev.part1.organisation,
              language: result1.suggestedMarks.language ?? prev.part1.language,
            }
          }));
        }
        
        // Process Part 2
        if (part2Text.trim()) {
          const result2 = proofreadText(part2Text, '110-130', false);
          setWritingFeedback(prev => ({
            ...prev,
            part2: { feedback: result2.feedback, correctedVersion: result2.correctedVersion }
          }));
          setWritingMarks(prev => ({
            ...prev,
            part2: {
              content: result2.suggestedMarks.content ?? prev.part2.content,
              communicativeAchievement: result2.suggestedMarks.communicativeAchievement ?? prev.part2.communicativeAchievement,
              organisation: result2.suggestedMarks.organisation ?? prev.part2.organisation,
              language: result2.suggestedMarks.language ?? prev.part2.language,
            }
          }));
        }
        
        // Generate overall comments based on word counts
        const p1Words = part1Text.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
        const p2Words = part2Text.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
        const totalWords = p1Words + p2Words;
        
        let overallMessage = '';
        if (totalWords > 150) {
          overallMessage = '👍 Good job on meeting the word count requirements! Review the specific feedback for each part.';
        } else if (totalWords > 100) {
          overallMessage = '📈 Making progress! Consider adding more detail to reach the target word counts.';
        } else {
          overallMessage = '💪 Keep practising! Try to write more to meet the word count targets.';
        }
        
        setWritingFeedback(prev => ({
          ...prev,
          overallComments: overallMessage
        }));
        
        alert('✅ Auto-proofread complete! Review the suggested feedback and marks, then adjust as needed.');
        
      } catch (error) {
        console.error('Auto-proofread failed:', error);
        alert('❌ Auto-proofread failed. Please try again.');
      } finally {
        setAutoProofreadLoading(false);
      }
    }, 300);
  };

  // Export Cambridge results to CSV
  const exportCambridgeCSV = () => {
    if (filteredCambridgeScores.length === 0) return;
    
    const headers = ['Student Name', 'Class', 'Test', 'Score', 'Total', 'Percentage', 'Time (seconds)', 'Submitted At'];
    const rows = filteredCambridgeScores.map(r => [
      r.student_name,
      r.student_class || '',
      r.quiz_name,
      r.score,
      r.total_questions,
      r.percentage,
      r.time_taken_seconds || '',
      r.submitted_at
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cambridge_results_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

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

      // Load questions and students
      const myQuestions = await GameService.get_my_questions();
      setQuestions(myQuestions);
      
      try {
        const students = await GameService.get_students_for_assignment();
        console.log('Loaded students:', students);
        setAvailableStudents(students);
      } catch (studentError) {
        console.error('Error loading students:', studentError);
        setAvailableStudents([]);
      }
      
      await loadAssignments();
    } catch (error) {
      console.error('Error loading teacher data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();

    if (topicMode === 'custom' && !customTopicName.trim()) {
      alert('Please enter a topic name for your question.');
      return;
    }

    try {
      setUploadingImage(true);
      
      // Upload question image if selected
      let imageUrl = questionImageUrl;
      if (questionImage) {
        try {
          imageUrl = await GameService.upload_question_image(questionImage);
        } catch (uploadError) {
          alert('❌ Failed to upload question image: ' + (uploadError as Error).message);
          setUploadingImage(false);
          return;
        }
      }

      // Upload option images and build final options array
      let finalOptions: QuestionOption[] | undefined = undefined;
      if (questionType === 'multiple_choice') {
        const processedOptions: QuestionOption[] = [];
        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          if (opt.text.trim()) {
            let optImageUrl = opt.image_url;
            // Upload new option image if selected
            if (optionImages[i]) {
              try {
                optImageUrl = await GameService.upload_question_image(optionImages[i]!);
              } catch (uploadError) {
                alert(`❌ Failed to upload image for Option ${String.fromCharCode(65 + i)}: ` + (uploadError as Error).message);
                setUploadingImage(false);
                return;
              }
            }
            processedOptions.push({
              text: opt.text,
              image_url: optImageUrl
            });
          }
        }
        finalOptions = processedOptions;
      }

      setUploadingImage(false);

      const questionData = {
        subject,
        topic: questionTopicLabel,
        topic_name: questionTopicLabel,
        difficulty,
        question_text: questionText,
        image_url: imageUrl || undefined,
        question_type: questionType,
        options: finalOptions,
        correct_answer: correctAnswer,
        explanation,
        points,
        is_public: true // Default to public for now
      };

      if (editingQuestion) {
        // Update existing question
        await GameService.update_question(editingQuestion.id, questionData);
        alert('✅ Question updated successfully!');
      } else {
        // Create new question
        await GameService.create_question(questionData);
        alert('✅ Question created successfully!');
      }

      // Reset form
      setQuestionText('');
      setQuestionImage(null);
      setQuestionImageUrl('');
      setOptions([
        { text: '', image_url: undefined },
        { text: '', image_url: undefined },
        { text: '', image_url: undefined },
        { text: '', image_url: undefined }
      ]);
      setOptionImages([null, null, null, null]);
      setCorrectAnswer('');
      setExplanation('');
      setTopicMode('general');
      setCustomTopicName('');
      setEditingQuestion(null);

      // Reload questions
      const myQuestions = await GameService.get_my_questions();
      setQuestions(myQuestions);

      setView('question-bank');
    } catch (error) {
      console.error('Error saving question:', error);
      alert('❌ Failed to save question: ' + (error as Error).message);
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

  // Helper to convert options from various formats to QuestionOption[]
  const normalizeOptions = (opts: (string | QuestionOption)[] | undefined): QuestionOption[] => {
    if (!opts || opts.length === 0) {
      return [
        { text: '', image_url: undefined },
        { text: '', image_url: undefined },
        { text: '', image_url: undefined },
        { text: '', image_url: undefined }
      ];
    }
    const normalized = opts.map(opt => {
      if (typeof opt === 'string') {
        return { text: opt, image_url: undefined };
      }
      return { text: opt.text || '', image_url: opt.image_url };
    });
    // Ensure we have at least 4 options
    while (normalized.length < 4) {
      normalized.push({ text: '', image_url: undefined });
    }
    return normalized;
  };

  const handleEditQuestion = (question: TeacherQuestion) => {
    // Set editing mode
    setEditingQuestion(question);
    
    // Pre-fill the form with the question data
    setSubject(question.subject);
    setDifficulty(question.difficulty);
    setQuestionType(question.question_type);
    setQuestionText(question.question_text);
    setQuestionImage(null);
    setQuestionImageUrl(question.image_url || '');
    setOptions(normalizeOptions(question.options));
    setOptionImages([null, null, null, null]);
    setCorrectAnswer(question.correct_answer);
    setExplanation(question.explanation || '');
    setPoints(question.points);
    const existingTopic = question.topic_name || question.topic || 'General';
    if (existingTopic !== 'General') {
      setTopicMode('custom');
      setCustomTopicName(existingTopic);
    } else {
      setTopicMode('general');
      setCustomTopicName('');
    }

    // Switch to create view
    setView('create-question');
  };

  const handleDuplicateQuestion = (question: TeacherQuestion) => {
    // Clear editing mode
    setEditingQuestion(null);
    
    // Pre-fill the form with the question data
    setSubject(question.subject);
    setDifficulty(question.difficulty);
    setQuestionType(question.question_type);
    setQuestionText(question.question_text + ' (Copy)');
    setQuestionImage(null);
    setQuestionImageUrl(question.image_url || '');
    setOptions(normalizeOptions(question.options));
    setOptionImages([null, null, null, null]);
    setCorrectAnswer(question.correct_answer);
    setExplanation(question.explanation || '');
    setPoints(question.points);
    const existingTopic = question.topic_name || question.topic || 'General';
    if (existingTopic !== 'General') {
      setTopicMode('custom');
      setCustomTopicName(existingTopic);
    } else {
      setTopicMode('general');
      setCustomTopicName('');
    }

    // Switch to create view
    setView('create-question');
  };

  const toggleAssignmentQuestion = (questionId: string) => {
    setAssignmentQuestionIds((prev) => (
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId]
    ));
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((prev) => 
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const selectAllStudents = () => {
    setSelectedStudentIds(filteredStudents.map(s => s.id));
  };

  const deselectAllStudents = () => {
    setSelectedStudentIds([]);
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (assignmentTopicMode === 'custom' && !assignmentTopicName.trim()) {
      alert('Please enter a topic for this assignment.');
      return;
    }

    if (!assignmentQuestionIds.length) {
      alert('Select at least one question to assign.');
      return;
    }

    if (assignmentMode === 'batch' && !assignmentBatch) {
      alert('Please select a batch for this assignment.');
      return;
    }

    if (assignmentMode === 'custom' && selectedStudentIds.length === 0) {
      alert('Please select at least one student for this assignment.');
      return;
    }

    const toIso = (value: string): string | undefined => {
      if (!value) return undefined;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return undefined;
      return date.toISOString();
    };

    try {
      setAssignmentSubmitting(true);
      await GameService.create_assignment({
        subject: assignmentSubject,
        topic_name: assignmentTopicLabel,
        batch: assignmentMode === 'batch' ? assignmentBatch : undefined,
        question_ids: assignmentQuestionIds,
        assigned_at: toIso(assignmentAssignedAt) ?? new Date().toISOString(),
        due_at: toIso(assignmentDueAt),
        title: assignmentTitle || undefined,
        instructions: assignmentInstructions || undefined,
        difficulty: assignmentDifficulty,
        assignment_mode: assignmentMode,
        student_ids: assignmentMode === 'custom' ? selectedStudentIds : undefined,
      });

      alert('📌 Assignment created and sent to students!');
      setAssignmentQuestionIds([]);
      setAssignmentTitle('');
      setAssignmentInstructions('');
      setSelectedStudentIds([]);
      setStudentSearchTerm('');
      setAssignmentTopicMode('general');
      setAssignmentTopicName('');
      setAssignmentDueAt('');
      setAssignmentAssignedAt(new Date().toISOString().slice(0, 16));
      await loadAssignments();
      setView('assignments');
    } catch (error) {
      console.error('Error creating assignment:', error);
      alert('❌ Failed to create assignment: ' + (error as Error).message);
    } finally {
      setAssignmentSubmitting(false);
    }
  };

  const handleOpenReport = async (assignment: TeacherAssignmentSummary) => {
    try {
      setReportLoading(true);
      setSelectedReportAssignment(assignment);
      const rows = await GameService.get_teacher_assignment_report(assignment.id);
      setAssignmentReport(rows);
      setView('report-detail');
    } catch (error) {
      console.error('Error loading assignment report:', error);
      alert('❌ Failed to load report: ' + (error as Error).message);
    } finally {
      setReportLoading(false);
    }
  };

  const handleExportReport = () => {
    if (!selectedReportAssignment || assignmentReport.length === 0) return;
    const header = 'Student,Batch,Score,Correct,Incorrect,Accuracy (%),Completed At';
    const rows = assignmentReport.map((row) => (
      [
        row.student_name,
        row.batch ?? '—',
        row.score,
        row.correct,
        row.incorrect,
        row.accuracy,
        new Date(row.completed_at).toLocaleString(),
      ].join(',')
    ));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedReportAssignment.topic_name || 'assignment'}-report.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Download CSV template
  const downloadCSVTemplate = () => {
    const template = `subject,topic,difficulty,question_type,question_text,option1,option2,option3,option4,correct_answer,explanation,points
Maths,General,easy,multiple_choice,"What is 2 + 2?","2","3","4","5","4","Addition of two numbers",10
Science,Lab Safety,medium,true_false,"Water boils at 100°C at sea level","True","False","","","True","Water's boiling point at standard pressure",15
English,Grammar,hard,short_answer,"What is the past tense of 'go'?","","","","","went","Irregular verb conjugation",20`;
    
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
          
          if (values.length < 12) {
            errors.push(`Row ${i + 2}: Insufficient columns`);
            errorCount++;
            continue;
          }

          const [subjectStr, topicStr, difficultyStr, questionType, questionText, opt1, opt2, opt3, opt4, correctAnswer, explanation, pointsStr] = values;

          const questionData = {
            subject: subjectStr as Subject,
            topic: topicStr || 'General',
            topic_name: topicStr || 'General',
            difficulty: difficultyStr as QuestionDifficulty,
            question_text: questionText,
            question_type: questionType as 'multiple_choice' | 'true_false' | 'short_answer',
            options: questionType === 'multiple_choice' ? [opt1, opt2, opt3, opt4].filter(Boolean) : 
                     questionType === 'true_false' ? ['True', 'False'] : undefined,
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        <div className="card-glass p-6 text-center border-l-4 border-purple-500">
          <div className="text-4xl font-bold text-purple-400">{assignments.length}</div>
          <div className="text-sm text-gray-400 mt-1">Assignments Scheduled</div>
          <div className="text-xs text-gray-500 mt-2">
            {assignments.filter((a) => a.completed_count < a.student_count).length} active ·{' '}
            {assignments.reduce((sum, a) => sum + a.completed_count, 0)} completions
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        <button
          onClick={() => setView('assignments')}
          className="card-glass p-8 hover:scale-105 transition-transform border-2 border-purple-500/50 hover:border-purple-500"
        >
          <div className="text-6xl mb-3">🗂️</div>
          <div className="font-heading text-2xl text-purple-300 font-bold">Assignments</div>
          <div className="text-sm text-gray-400 mt-2">Create and monitor mandatory quests</div>
        </button>

        <button
          onClick={() => setView('geometry-diagrams')}
          className="card-glass p-8 hover:scale-105 transition-transform border-2 border-orange-500/50 hover:border-orange-500"
        >
          <div className="text-6xl mb-3">📐</div>
          <div className="font-heading text-2xl text-orange-400 font-bold">Geometry Diagrams</div>
          <div className="text-sm text-gray-400 mt-2">Create interactive diagram questions</div>
        </button>
        <button
          onClick={() => setView('reports')}
          className="card-glass p-8 hover:scale-105 transition-transform border-2 border-blue-500/50 hover:border-blue-500"
        >
          <div className="text-6xl mb-3">📊</div>
          <div className="font-heading text-2xl text-blue-300 font-bold">Reports</div>
          <div className="text-sm text-gray-400 mt-2">Track accuracy and completion</div>
        </button>

        <button
          onClick={() => {
            setView('cambridge-reports');
            loadCambridgeScores();
          }}
          className="card-glass p-8 hover:scale-105 transition-transform border-2 border-teal-500/50 hover:border-teal-500"
        >
          <div className="text-6xl mb-3">📝</div>
          <div className="font-heading text-2xl text-teal-400 font-bold">Cambridge Tests</div>
          <div className="text-sm text-gray-400 mt-2">View student test results & detailed answers</div>
        </button>
      </div>
    </div>
  );

  // Render Create Question Form
  const renderCreateQuestion = () => (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => {
          setEditingQuestion(null);
          setView('question-bank');
        }}
        className="mb-4 text-cyan-400 hover:text-cyan-300 flex items-center gap-2"
      >
        <span>←</span> Back to Questions
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
              setOptions([
                { text: '', image_url: undefined },
                { text: '', image_url: undefined },
                { text: '', image_url: undefined },
                { text: '', image_url: undefined }
              ]);
              setOptionImages([null, null, null, null]);
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
              setQuestionImage(null);
              setQuestionImageUrl('');
              setSubject('Maths');
              setDifficulty('easy');
              setQuestionType('multiple_choice');
              setOptions([
                { text: '', image_url: undefined },
                { text: '', image_url: undefined },
                { text: '', image_url: undefined },
                { text: '', image_url: undefined }
              ]);
              setOptionImages([null, null, null, null]);
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
        <h2 className="font-heading text-3xl text-pink-400 font-bold mb-6">
          {editingQuestion ? '✏️ Edit Question' : '✨ Create New Question'}
        </h2>

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
                onChange={(e) => {
                  const newDifficulty = e.target.value as QuestionDifficulty;
                  setDifficulty(newDifficulty);
                  // Auto-set points based on difficulty
                  setPoints(getDefaultPointsForDifficulty(newDifficulty));
                }}
                className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                required
              >
                <option value="easy">⭐ Easy (10 XP)</option>
                <option value="medium">⭐⭐ Medium (15 XP)</option>
                <option value="hard">⭐⭐⭐ Hard (20 XP)</option>
              </select>
            </div>
          </div>

          {/* Topic Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Topic</label>
            <div className="flex flex-col md:flex-row gap-4">
              <select
                value={topicMode}
                onChange={(e) => setTopicMode(e.target.value as 'general' | 'custom')}
                className="bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="general">General</option>
                <option value="custom">Custom</option>
              </select>
              {topicMode === 'custom' && (
                <input
                  type="text"
                  value={customTopicName}
                  onChange={(e) => setCustomTopicName(e.target.value)}
                  className="flex-1 bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                  placeholder="Enter topic name"
                  required
                />
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">Topic helps group assignments and question reports.</p>
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
              onPaste={(e) => {
                // Handle image paste from clipboard for question image
                const items = e.clipboardData?.items;
                if (items) {
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                      const file = items[i].getAsFile();
                      if (file) {
                        setQuestionImage(file);
                        setQuestionImageUrl('');
                      }
                      break;
                    }
                  }
                }
              }}
              className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none min-h-[100px]"
              placeholder="Enter your question here... (paste screenshot to add image)"
              required
            />
          </div>

          {/* Question Image (Optional) */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Question Image (Optional)</label>
            <div 
              className="space-y-3"
              onPaste={(e) => {
                // Handle image paste from clipboard
                const items = e.clipboardData?.items;
                if (items) {
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                      e.preventDefault();
                      const file = items[i].getAsFile();
                      if (file) {
                        setQuestionImage(file);
                        setQuestionImageUrl('');
                      }
                      break;
                    }
                  }
                }
              }}
              tabIndex={0}
            >
              {(questionImageUrl || questionImage) && (
                <div className="relative inline-block">
                  <img
                    src={questionImage ? URL.createObjectURL(questionImage) : questionImageUrl}
                    alt="Question preview"
                    className="max-w-full max-h-48 rounded-lg border border-gray-600"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setQuestionImage(null);
                      setQuestionImageUrl('');
                    }}
                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold"
                  >
                    ×
                  </button>
                </div>
              )}
              {!questionImage && !questionImageUrl && (
                <div 
                  className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 transition-all"
                  onClick={() => document.getElementById('question-image-input')?.click()}
                >
                  <div className="text-gray-400">
                    <span className="text-2xl">📷</span>
                    <p className="mt-2">Click to upload or <span className="text-purple-400">paste screenshot</span> (Ctrl+V)</p>
                    <p className="text-xs mt-1">JPEG, PNG, GIF, or WebP (max 5MB)</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <label className="cursor-pointer bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 rounded-lg px-4 py-2 text-purple-300 transition-all">
                  📷 {questionImage || questionImageUrl ? 'Change Image' : 'Upload Image'}
                  <input
                    id="question-image-input"
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setQuestionImage(file);
                        setQuestionImageUrl('');
                      }
                    }}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-gray-400">or paste screenshot (Ctrl+V)</span>
              </div>
              {uploadingImage && (
                <div className="text-cyan-400 text-sm animate-pulse">⏳ Uploading image...</div>
              )}
            </div>
          </div>

          {/* Multiple Choice Options */}
          {questionType === 'multiple_choice' && (
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Answer Options (Check the correct answer)</label>
              <div className="space-y-4">
                {options.map((option, index) => (
                  <div 
                    key={index} 
                    className={`bg-black/20 border rounded-lg p-3 transition-all ${
                      correctAnswer === option.text && option.text.trim() 
                        ? 'border-green-500 bg-green-500/10' 
                        : 'border-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {/* Correct Answer Checkbox */}
                      <input
                        type="checkbox"
                        checked={correctAnswer === option.text && option.text.trim() !== ''}
                        onChange={(e) => {
                          if (e.target.checked && option.text.trim()) {
                            setCorrectAnswer(option.text);
                          } else if (!e.target.checked && correctAnswer === option.text) {
                            setCorrectAnswer('');
                          }
                        }}
                        className="w-5 h-5 rounded border-gray-600 bg-black/40 text-green-500 focus:ring-green-500 focus:ring-offset-0 cursor-pointer"
                        title="Mark as correct answer"
                      />
                      <span className="text-cyan-400 font-bold">{String.fromCharCode(65 + index)}.</span>
                      <input
                        type="text"
                        value={option.text}
                        onChange={(e) => {
                          const oldText = option.text;
                          const newOptions = [...options];
                          newOptions[index] = { ...newOptions[index], text: e.target.value };
                          setOptions(newOptions);
                          // Update correct answer if this was the correct one
                          if (correctAnswer === oldText) {
                            setCorrectAnswer(e.target.value);
                          }
                        }}
                        onPaste={(e) => {
                          // Handle image paste from clipboard
                          const items = e.clipboardData?.items;
                          if (items) {
                            for (let i = 0; i < items.length; i++) {
                              if (items[i].type.indexOf('image') !== -1) {
                                e.preventDefault();
                                const file = items[i].getAsFile();
                                if (file) {
                                  const newImages = [...optionImages];
                                  newImages[index] = file;
                                  setOptionImages(newImages);
                                  const newOptions = [...options];
                                  newOptions[index] = { ...newOptions[index], image_url: undefined };
                                  setOptions(newOptions);
                                }
                                break;
                              }
                            }
                          }
                        }}
                        className="flex-1 bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                        placeholder={`Option ${String.fromCharCode(65 + index)} text (paste image here)`}
                        required
                      />
                      {correctAnswer === option.text && option.text.trim() && (
                        <span className="text-green-400 text-sm font-semibold">✓ Correct</span>
                      )}
                    </div>
                    {/* Option Image */}
                    <div className="ml-12 flex items-center gap-3">
                      {(option.image_url || optionImages[index]) && (
                        <div className="relative inline-block">
                          <img
                            src={optionImages[index] ? URL.createObjectURL(optionImages[index]!) : option.image_url}
                            alt={`Option ${String.fromCharCode(65 + index)} preview`}
                            className="max-h-20 rounded border border-gray-600"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newOptions = [...options];
                              newOptions[index] = { ...newOptions[index], image_url: undefined };
                              setOptions(newOptions);
                              const newImages = [...optionImages];
                              newImages[index] = null;
                              setOptionImages(newImages);
                            }}
                            className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold"
                          >
                            ×
                          </button>
                        </div>
                      )}
                      <label className="cursor-pointer text-xs bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded px-2 py-1 text-purple-300 transition-all">
                        📷 {option.image_url || optionImages[index] ? 'Change' : 'Add Image'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const newImages = [...optionImages];
                              newImages[index] = file;
                              setOptionImages(newImages);
                              // Clear existing URL when new file is selected
                              const newOptions = [...options];
                              newOptions[index] = { ...newOptions[index], image_url: undefined };
                              setOptions(newOptions);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                      <span className="text-xs text-gray-500">or paste screenshot</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Correct Answer - Hidden for MCQ since we use checkboxes now */}
          {questionType !== 'multiple_choice' && (
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Correct Answer
              </label>
              <input
                type="text"
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
                className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                placeholder="Enter correct answer"
                required
              />
            </div>
          )}

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
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Points (XP Reward) <span className="text-gray-500 font-normal">— Max {MAX_QUESTION_XP} XP</span>
            </label>
            <input
              type="number"
              value={points}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                setPoints(Math.min(Math.max(val, 1), MAX_QUESTION_XP));
              }}
              className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
              min="1"
              max={MAX_QUESTION_XP}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Default: Easy=10, Medium=15, Hard=20. You can adjust up to {MAX_QUESTION_XP} XP.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-heading font-bold text-lg py-4 rounded-xl transition-all transform hover:scale-105 shadow-lg"
          >
            {editingQuestion ? '💾 Save Changes' : '✨ Create Question'}
          </button>
        </form>
      </div>
    </div>
  );

  // Render Question Bank
  const renderQuestionBank = () => (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-heading text-3xl text-cyan-400 font-bold">📚 Question Bank</h2>
        <button
          onClick={() => {
            setEditingQuestion(null);
            setView('create-question');
          }}
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
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300">
                      {q.topic_name || q.topic || 'General'}
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
                    onClick={() => handleEditQuestion(q)}
                    className="text-yellow-400 hover:text-yellow-300 p-2 hover:bg-yellow-500/10 rounded-lg transition-all"
                    title="Edit question"
                  >
                    ✏️
                  </button>
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
        onClick={() => setView('question-bank')}
        className="mb-4 text-cyan-400 hover:text-cyan-300 flex items-center gap-2"
      >
        ← Back to Questions
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
            <div className="text-gray-300">2. <code className="text-cyan-400">topic</code> - General or any custom topic name</div>
            <div className="text-gray-300">3. <code className="text-cyan-400">difficulty</code> - easy, medium, hard</div>
            <div className="text-gray-300">4. <code className="text-cyan-400">question_type</code> - multiple_choice, true_false, short_answer</div>
            <div className="text-gray-300">5. <code className="text-cyan-400">question_text</code> - The question</div>
            <div className="text-gray-300">6-9. <code className="text-cyan-400">option1-4</code> - Answer choices (for multiple choice)</div>
            <div className="text-gray-300">10. <code className="text-cyan-400">correct_answer</code> - The correct answer</div>
            <div className="text-gray-300">11. <code className="text-cyan-400">explanation</code> - Why it's correct</div>
            <div className="text-gray-300">12. <code className="text-cyan-400">points</code> - Point value (10-50)</div>
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

  const renderAssignments = () => (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-heading text-3xl text-purple-300 font-bold">🗂️ Assignments</h2>
        <button
          onClick={() => setView('create-assignment')}
          className="bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400 text-purple-200 px-4 py-2 rounded-lg font-semibold transition-all"
        >
          ➕ New Assignment
        </button>
      </div>

      {assignments.length === 0 ? (
        <div className="card-glass p-12 text-center">
          <div className="text-6xl mb-4">🧭</div>
          <p className="text-xl text-gray-400 mb-4">No assignments yet</p>
          <p className="text-gray-500">Create a mission to block normal quests until students finish.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="card-glass p-6 border border-purple-500/20">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h3 className="font-heading text-2xl text-white mb-1">{assignment.title || assignment.topic_name}</h3>
                  <p className="text-sm text-gray-400">
                    {assignment.subject_name} · Topic: {assignment.topic_name}
                  </p>
                  <p className="text-sm text-gray-400">
                    {assignment.assignment_mode === 'custom' 
                      ? `Custom (${assignment.student_count} students)` 
                      : `Batch: ${assignment.batch}`
                    } · Assigned {new Date(assignment.assigned_at).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-500">
                    Due: {assignment.due_at ? new Date(assignment.due_at).toLocaleString() : 'No due date'}
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-300">
                    {assignment.completed_count}/{assignment.student_count}
                  </div>
                  <div className="text-xs text-gray-400">Students completed</div>
                  <button
                    onClick={() => handleOpenReport(assignment)}
                    className="mt-3 px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-400 text-purple-200 hover:bg-purple-500/30 transition-all"
                  >
                    View Report
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderCreateAssignment = () => (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => setView('assignments')}
        className="mb-4 text-purple-300 hover:text-purple-200 flex items-center gap-2"
      >
        <span>←</span> Back to Assignments
      </button>

      <div className="card-glass p-6">
        <h2 className="font-heading text-3xl text-purple-300 font-bold mb-6">Create Assignment</h2>
        <form onSubmit={handleCreateAssignment} className="space-y-6">
          {/* Assignment Mode Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Assignment Mode</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAssignmentMode('batch')}
                className={`px-4 py-3 rounded-lg border transition-all ${
                  assignmentMode === 'batch'
                    ? 'bg-purple-500/30 border-purple-400 text-purple-200'
                    : 'bg-black/40 border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                📚 Assign to Batch
              </button>
              <button
                type="button"
                onClick={() => setAssignmentMode('custom')}
                className={`px-4 py-3 rounded-lg border transition-all ${
                  assignmentMode === 'custom'
                    ? 'bg-purple-500/30 border-purple-400 text-purple-200'
                    : 'bg-black/40 border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                👥 Select Students
              </button>
            </div>
          </div>

          {/* Batch Selection (only shown in batch mode) */}
          {assignmentMode === 'batch' && (
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Batch</label>
              <select
                value={assignmentBatch}
                onChange={(e) => setAssignmentBatch(e.target.value as AssignmentBatch)}
                className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white"
              >
                <option value="All">All</option>
                <option value="8A">8A</option>
                <option value="8B">8B</option>
                <option value="8C">8C</option>
              </select>
            </div>
          )}

          {/* Student Selection (only shown in custom mode) */}
          {assignmentMode === 'custom' && (
            <div className="border border-gray-600 rounded-lg p-4 bg-black/20">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-gray-300">
                  Select Students ({selectedStudentIds.length} selected)
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllStudents}
                    className="text-xs px-3 py-1 rounded bg-blue-500/20 border border-blue-400 text-blue-200 hover:bg-blue-500/30"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllStudents}
                    className="text-xs px-3 py-1 rounded bg-gray-500/20 border border-gray-500 text-gray-300 hover:bg-gray-500/30"
                  >
                    Clear
                  </button>
                </div>
              </div>
              
              <input
                type="text"
                placeholder="Search students..."
                value={studentSearchTerm}
                onChange={(e) => setStudentSearchTerm(e.target.value)}
                className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white mb-3"
              />

              <div className="max-h-64 overflow-y-auto space-y-2">
                {filteredStudents.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">No students found</p>
                ) : (
                  filteredStudents.map((student) => (
                    <label
                      key={student.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-black/40 border border-gray-700 hover:border-gray-600 cursor-pointer transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(student.id)}
                        onChange={() => toggleStudentSelection(student.id)}
                        className="w-4 h-4"
                      />
                      <div className="flex-1">
                        <div className="text-white font-medium">{student.display_name}</div>
                        <div className="text-xs text-gray-400">
                          @{student.username} · Grade {student.grade} · {student.batch || 'No batch'}
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Subject</label>
              <select
                value={assignmentSubject}
                onChange={(e) => setAssignmentSubject(e.target.value as Subject)}
                className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white"
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
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Topic</label>
            <div className="flex flex-col md:flex-row gap-4">
              <select
                value={assignmentTopicMode}
                onChange={(e) => setAssignmentTopicMode(e.target.value as 'general' | 'custom')}
                className="bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white"
              >
                <option value="general">General</option>
                <option value="custom">Custom</option>
              </select>
              {assignmentTopicMode === 'custom' && (
                <input
                  type="text"
                  value={assignmentTopicName}
                  onChange={(e) => setAssignmentTopicName(e.target.value)}
                  className="flex-1 bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  placeholder="Enter topic name"
                  required
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Title (optional)</label>
              <input
                type="text"
                value={assignmentTitle}
                onChange={(e) => setAssignmentTitle(e.target.value)}
                className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white"
                placeholder="Fractions drill"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Difficulty</label>
              <select
                value={assignmentDifficulty}
                onChange={(e) => setAssignmentDifficulty(e.target.value as QuestionDifficulty)}
                className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Instructions (optional)</label>
            <textarea
              value={assignmentInstructions}
              onChange={(e) => setAssignmentInstructions(e.target.value)}
              className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-3 text-white min-h-[80px]"
              placeholder="Focus on word problems and show your work."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Assigned At</label>
              <input
                type="datetime-local"
                value={assignmentAssignedAt}
                onChange={(e) => setAssignmentAssignedAt(e.target.value)}
                className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Due At</label>
              <input
                type="datetime-local"
                value={assignmentDueAt}
                onChange={(e) => setAssignmentDueAt(e.target.value)}
                className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-300">Questions ({assignmentQuestionIds.length} selected)</label>
              <span className="text-xs text-gray-400">Only questions from {assignmentSubject} are shown</span>
            </div>
            <div className="max-h-64 overflow-y-auto border border-gray-700 rounded-lg divide-y divide-gray-800">
              {assignmentQuestionPool.length === 0 ? (
                <div className="p-4 text-sm text-gray-400">No questions for this subject. Create some first.</div>
              ) : (
                assignmentQuestionPool.map((question) => (
                  <label key={question.id} className="flex items-start gap-3 p-4 cursor-pointer hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={assignmentQuestionIds.includes(question.id)}
                      onChange={() => toggleAssignmentQuestion(question.id)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-white">{question.question_text}</p>
                      <p className="text-xs text-gray-400">Topic: {question.topic_name || question.topic || 'General'}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={assignmentSubmitting}
            className={`w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white font-heading font-bold text-lg py-4 rounded-xl transition-all ${assignmentSubmitting ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105'}`}
          >
            {assignmentSubmitting ? 'Creating...' : 'Create Assignment'}
          </button>
        </form>
      </div>
    </div>
  );

  const renderReports = () => (
    <div>
      <h2 className="font-heading text-3xl text-blue-300 font-bold mb-6">📊 Assignment Reports</h2>
      {assignments.length === 0 ? (
        <div className="card-glass p-10 text-center">
          <div className="text-5xl mb-3">📄</div>
          <p className="text-gray-400">Create an assignment to see progress here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto card-glass p-4">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-gray-400">
                <th className="py-2 px-3">Subject</th>
                <th className="py-2 px-3">Topic</th>
                <th className="py-2 px-3">Batch</th>
                <th className="py-2 px-3">Due</th>
                <th className="py-2 px-3">Completed</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.id} className="border-t border-gray-800">
                  <td className="py-3 px-3 text-white">{assignment.subject_name}</td>
                  <td className="py-3 px-3 text-gray-300">{assignment.topic_name}</td>
                  <td className="py-3 px-3 text-gray-300">{assignment.batch}</td>
                  <td className="py-3 px-3 text-gray-300">
                    {assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3 px-3 text-gray-300">
                    {assignment.completed_count}/{assignment.student_count}
                  </td>
                  <td className="py-3 px-3">
                    <button
                      onClick={() => handleOpenReport(assignment)}
                      className="px-4 py-2 rounded-lg bg-blue-500/20 border border-blue-400 text-blue-200 hover:bg-blue-500/30"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderReportDetail = () => (
    <div>
      <button
        onClick={() => setView('reports')}
        className="mb-4 text-blue-300 hover:text-blue-200 flex items-center gap-2"
      >
        <span>←</span> Back to Reports
      </button>

      {reportLoading ? (
        <div className="card-glass p-12 text-center text-blue-300">Loading report...</div>
      ) : !selectedReportAssignment ? (
        <div className="card-glass p-12 text-center text-gray-400">Select an assignment to view details.</div>
      ) : (
        <div className="space-y-6">
          <div className="card-glass p-6">
            <h2 className="font-heading text-3xl text-white mb-2">{selectedReportAssignment.title || selectedReportAssignment.topic_name}</h2>
            <p className="text-gray-400">
              {selectedReportAssignment.subject_name} · Topic {selectedReportAssignment.topic_name} · Batch {selectedReportAssignment.batch}
            </p>
            <p className="text-sm text-gray-500">
              Due {selectedReportAssignment.due_at ? new Date(selectedReportAssignment.due_at).toLocaleString() : 'No deadline'}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-xl text-white">Student Performance</h3>
            <button
              onClick={handleExportReport}
              disabled={assignmentReport.length === 0}
              className={`px-4 py-2 rounded-lg border ${assignmentReport.length === 0 ? 'border-gray-600 text-gray-500 cursor-not-allowed' : 'border-blue-400 text-blue-200 hover:bg-blue-500/20'}`}
            >
              Export CSV
            </button>
          </div>

          {assignmentReport.length === 0 ? (
            <div className="card-glass p-10 text-center text-gray-400">No students have completed this assignment yet.</div>
          ) : (
            <div className="overflow-x-auto card-glass p-4">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-gray-400">
                    <th className="py-2 px-3">Student</th>
                    <th className="py-2 px-3">Batch</th>
                    <th className="py-2 px-3">Score</th>
                    <th className="py-2 px-3">Correct</th>
                    <th className="py-2 px-3">Incorrect</th>
                    <th className="py-2 px-3">Accuracy</th>
                    <th className="py-2 px-3">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {assignmentReport.map((row) => (
                    <tr key={row.student_id} className="border-t border-gray-800">
                      <td className="py-2 px-3 text-white">{row.student_name}</td>
                      <td className="py-2 px-3 text-gray-300">{row.batch ?? '—'}</td>
                      <td className="py-2 px-3 text-gray-300">{row.score}</td>
                      <td className="py-2 px-3 text-gray-300">{row.correct}</td>
                      <td className="py-2 px-3 text-gray-300">{row.incorrect}</td>
                      <td className="py-2 px-3 text-gray-300">{row.accuracy}%</td>
                      <td className="py-2 px-3 text-gray-300">{new Date(row.completed_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Render Cambridge Reports View
  const renderCambridgeReports = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-heading text-3xl text-teal-400 font-bold">📝 Cambridge Test Reports</h2>
          <p className="text-gray-400 mt-1">View detailed student answers and performance reports</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadCambridgeScores}
            disabled={cambridgeLoading}
            className="bg-teal-600/30 hover:bg-teal-600/50 border border-teal-400 text-white font-semibold px-5 py-2 rounded-lg transition-all"
          >
            {cambridgeLoading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
          {cambridgeScores.length > 0 && (
            <button
              onClick={exportCambridgeCSV}
              className="bg-green-600/30 hover:bg-green-600/50 border border-green-400 text-white font-semibold px-5 py-2 rounded-lg transition-all"
            >
              📥 Export CSV
            </button>
          )}
        </div>
      </div>

      {cambridgeScores.length > 0 && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-glass p-4 border-l-4 border-teal-500">
              <p className="text-sm text-gray-400">Total Submissions</p>
              <p className="text-3xl font-bold text-teal-400">{cambridgeStats.totalSubmissions}</p>
            </div>
            <div className="card-glass p-4 border-l-4 border-blue-500">
              <p className="text-sm text-gray-400">Average Score</p>
              <p className="text-3xl font-bold text-blue-400">{cambridgeStats.avgPercentage}%</p>
            </div>
            <div className="card-glass p-4 border-l-4 border-green-500">
              <p className="text-sm text-gray-400">Highest Score</p>
              <p className="text-xl font-bold text-green-400">{cambridgeStats.highestScore?.name || '-'}</p>
              <p className="text-sm text-gray-500">{cambridgeStats.highestScore ? `${cambridgeStats.highestScore.percentage}%` : ''}</p>
            </div>
            <div className="card-glass p-4 border-l-4 border-red-500">
              <p className="text-sm text-gray-400">Lowest Score</p>
              <p className="text-xl font-bold text-red-400">{cambridgeStats.lowestScore?.name || '-'}</p>
              <p className="text-sm text-gray-500">{cambridgeStats.lowestScore ? `${cambridgeStats.lowestScore.percentage}%` : ''}</p>
            </div>
          </div>

          {/* Class Performance Summary */}
          <div className="card-glass p-4">
            <h4 className="text-lg font-bold text-teal-300 mb-3">📊 Class Performance</h4>
            <div className="flex flex-wrap gap-3">
              {Object.entries(cambridgeStats.classStats).sort((a, b) => b[1].avg - a[1].avg).map(([cls, stats]) => (
                <div key={cls} className="bg-black/40 border border-gray-600 rounded-lg px-4 py-2">
                  <p className="font-bold text-white">{cls}</p>
                  <p className="text-sm text-gray-400">
                    {stats.count} students • Avg: <span className={stats.avg >= 70 ? 'text-green-400' : stats.avg >= 50 ? 'text-yellow-400' : 'text-red-400'}>{stats.avg}%</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="text-sm text-gray-400 block mb-1">Filter by Test</label>
              <select
                value={cambridgeQuizFilter}
                onChange={(e) => setCambridgeQuizFilter(e.target.value)}
                className="bg-black/40 border border-teal-400/50 rounded-lg px-4 py-2 text-white min-w-[200px]"
              >
                <option value="all">All Tests</option>
                {uniqueCambridgeQuizNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Filter by Class</label>
              <select
                value={cambridgeClassFilter}
                onChange={(e) => setCambridgeClassFilter(e.target.value)}
                className="bg-black/40 border border-teal-400/50 rounded-lg px-4 py-2 text-white min-w-[150px]"
              >
                <option value="all">All Classes</option>
                {uniqueCambridgeClasses.map(cls => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <p className="text-gray-400">Showing {filteredCambridgeScores.length} of {cambridgeScores.length} results</p>
            </div>
          </div>

          {/* Results Table */}
          <div className="card-glass p-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-teal-400/50">
                  <th className="px-4 py-3 text-teal-300">Student</th>
                  <th className="px-4 py-3 text-teal-300">Class</th>
                  <th className="px-4 py-3 text-teal-300">Test</th>
                  <th className="px-4 py-3 text-teal-300">Score</th>
                  <th className="px-4 py-3 text-teal-300">%</th>
                  <th className="px-4 py-3 text-teal-300">Time</th>
                  <th className="px-4 py-3 text-teal-300">Submitted</th>
                  <th className="px-4 py-3 text-teal-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCambridgeScores.map((score) => (
                  <tr key={score.id} className="border-b border-gray-700 hover:bg-black/30">
                    <td className="px-4 py-3 text-white font-semibold">{score.student_name}</td>
                    <td className="px-4 py-3 text-gray-300">{score.student_class || '-'}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{score.quiz_name}</td>
                    <td className="px-4 py-3">
                      {score.quiz_name === 'Cambridge Writing Test 1' && score.answers?.requires_marking ? (
                        <span className="text-yellow-400 font-semibold">⏳ Pending</span>
                      ) : (
                        <span className="font-mono text-white">{score.score}/{score.total_questions}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {score.quiz_name === 'Cambridge Writing Test 1' && score.answers?.requires_marking ? (
                        <span className="text-yellow-400 font-bold">Awaiting</span>
                      ) : (
                        <span className={`font-bold ${
                          score.percentage >= 70 ? 'text-green-400' :
                          score.percentage >= 50 ? 'text-yellow-400' : 'text-red-400'
                        }`}>{score.percentage}%</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{formatCambridgeTime(score.time_taken_seconds)}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {new Date(score.submitted_at).toLocaleDateString()} {new Date(score.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        {score.quiz_name === 'Cambridge Writing Test 1' ? (
                          <>
                            <button
                              onClick={() => openWritingMarking(score)}
                              className={`${score.answers?.requires_marking 
                                ? 'bg-yellow-600/30 hover:bg-yellow-600/50 border-yellow-400 animate-pulse' 
                                : 'bg-green-600/30 hover:bg-green-600/50 border-green-400'
                              } border text-white text-xs px-3 py-1 rounded`}
                            >
                              {score.answers?.requires_marking ? '✏️ Mark Writing' : '✓ View Marks'}
                            </button>
                            <button
                              onClick={() => openCambridgeAnswers(score)}
                              className="bg-blue-600/30 hover:bg-blue-600/50 border border-blue-400 text-white text-xs px-3 py-1 rounded"
                            >
                              📝 Read
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => openCambridgeAnswers(score)}
                              className="bg-blue-600/30 hover:bg-blue-600/50 border border-blue-400 text-white text-xs px-3 py-1 rounded"
                            >
                              📝 Answers
                            </button>
                            <button
                              onClick={() => openCambridgeReport(score)}
                              className="bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400 text-white text-xs px-3 py-1 rounded"
                            >
                              📄 Report
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {cambridgeScores.length === 0 && !cambridgeLoading && (
        <div className="card-glass p-12 text-center">
          <div className="text-6xl mb-4">📭</div>
          <p className="text-xl text-gray-400">No test submissions yet</p>
          <p className="text-sm text-gray-500 mt-2">Click "Refresh" to check for new submissions</p>
        </div>
      )}

      {/* Performance Report Modal */}
      {showCambridgeReport && selectedCambridgeStudent && (() => {
        const skillPerf = analyzeSkillPerformance(selectedCambridgeStudent);
        const sortedSkills = Object.entries(skillPerf).sort((a, b) => a[1].percentage - b[1].percentage);
        const weakAreas = sortedSkills.filter(([_, data]) => data.percentage < 70);
        const grade = getGrade(selectedCambridgeStudent.percentage);
        const encouragement = getEncouragement(grade);
        
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
              {/* Report Header */}
              <div className="p-6 border-b-4 border-purple-600">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">🧠</span>
                    <div>
                      <h1 className="text-2xl font-bold text-purple-800">Brains Heist</h1>
                      <p className="text-sm text-gray-500">Student Performance Report</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-lg font-semibold text-purple-800">{selectedCambridgeStudent.quiz_name}</h2>
                    <p className="text-sm text-gray-500">Generated: {new Date().toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* Student Banner */}
              <div className="bg-gradient-to-r from-purple-800 to-indigo-900 text-white p-6 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold">{selectedCambridgeStudent.student_name}</h2>
                  <p className="opacity-80">Class: {selectedCambridgeStudent.student_class || 'N/A'} | Completed: {new Date(selectedCambridgeStudent.submitted_at).toLocaleDateString()} | Time: {formatCambridgeTime(selectedCambridgeStudent.time_taken_seconds)}</p>
                </div>
                <div className="w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-purple-800">{grade}</span>
                  <span className="text-xs text-gray-600">{selectedCambridgeStudent.percentage}%</span>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Skills Performance */}
                <div>
                  <h3 className="text-lg font-semibold text-purple-800 border-b-2 border-gray-200 pb-2 mb-4">📊 Skills Performance Analysis</h3>
                  <div className="space-y-3">
                    {sortedSkills.map(([skill, data]) => (
                      <div key={skill} className="flex items-center gap-3">
                        <span className="w-48 text-sm text-gray-600">{data.icon} {skill}</span>
                        <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${data.percentage >= 80 ? 'bg-green-500' : data.percentage >= 65 ? 'bg-blue-500' : data.percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${data.percentage}%` }}
                          />
                        </div>
                        <span className="w-20 text-sm font-semibold text-right">{data.correct}/{data.total} ({data.percentage}%)</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Focus Areas */}
                {weakAreas.length > 0 && (
                  <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg">
                    <h4 className="font-semibold text-amber-800 mb-2">⚠️ Priority Focus Areas</h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      {weakAreas.map(([skill, data]) => (
                        <li key={skill}>• <strong>{skill}</strong> — {data.percentage}% ({data.correct}/{data.total} correct)</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action Plan */}
                <div className="border-2 border-purple-600 rounded-xl p-5">
                  <h3 className="text-lg font-semibold text-purple-800 mb-4">📋 Personalized Action Plan</h3>
                  {weakAreas.length > 0 ? weakAreas.slice(0, 3).map(([skill, data], idx) => {
                    const plan = actionPlans[skill];
                    return plan ? (
                      <div key={skill} className="flex gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                        <div className="w-8 h-8 bg-purple-800 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">{idx + 1}</div>
                        <div>
                          <h4 className="font-semibold text-gray-800">{plan.title} (Currently {data.percentage}%)</h4>
                          <p className="text-sm text-gray-600">{plan.tips.join(' • ')}</p>
                        </div>
                      </div>
                    ) : null;
                  }) : (
                    <div className="flex gap-4 p-4 bg-green-50 rounded-lg">
                      <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">✓</div>
                      <div>
                        <h4 className="font-semibold text-gray-800">Maintain Your Excellence</h4>
                        <p className="text-sm text-gray-600">Continue challenging yourself • Read diverse texts daily • Help classmates who are struggling</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Encouragement */}
                <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-xl text-center">
                  <h3 className="text-xl font-bold mb-2">{encouragement.title}</h3>
                  <p className="opacity-90">{encouragement.message}</p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t flex justify-between items-center text-xs text-gray-400">
                <span>Brains Heist Learning Platform</span>
                <span>Report ID: {selectedCambridgeStudent.id?.substring(0, 8) || 'N/A'}</span>
                <div className="flex gap-3">
                  <button onClick={() => window.print()} className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">🖨️ Print</button>
                  <button onClick={() => setShowCambridgeReport(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700">Close</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Answer Reflection Modal */}
      {showCambridgeAnswers && selectedCambridgeStudent && (() => {
        const answers = selectedCambridgeStudent.answers || {};
        const quizName = selectedCambridgeStudent.quiz_name;
        
        // Special handling for Writing Test
        if (quizName === 'Cambridge Writing Test 1') {
          const feedback = answers.feedback || {};
          
          return (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
                {/* Header */}
                <div className="p-6 border-b-4 border-blue-600">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <span className="text-4xl">✏️</span>
                      <div>
                        <h1 className="text-2xl font-bold text-blue-800">Writing Test Submission & Feedback</h1>
                        <p className="text-sm text-gray-500">Student's Written Responses with Teacher Feedback</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowCambridgeAnswers(false)}
                      className="p-2 hover:bg-gray-200 rounded-full text-xl"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Student Info */}
                <div className="bg-gradient-to-r from-blue-700 to-purple-800 text-white p-5 flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold">{selectedCambridgeStudent.student_name}</h2>
                    <p className="text-sm opacity-80">Class: {selectedCambridgeStudent.student_class || 'N/A'} | {new Date(selectedCambridgeStudent.submitted_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    {answers.requires_marking ? (
                      <div className="text-yellow-300 font-bold">⏳ Awaiting Marking</div>
                    ) : (
                      <>
                        <div className="text-3xl font-bold">{selectedCambridgeStudent.score}/35</div>
                        <div className="text-sm opacity-80">{selectedCambridgeStudent.percentage}% Score</div>
                        {feedback.releasedToStudent && <div className="text-green-300 text-xs mt-1">✓ Released to student</div>}
                      </>
                    )}
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Part 1 */}
                  <div className="border-2 border-blue-200 rounded-xl overflow-hidden">
                    <div className="bg-blue-100 p-4">
                      <h3 className="text-lg font-bold text-blue-800">📝 Part 1: Message</h3>
                      <p className="text-sm text-blue-600">Photography lessons • Word count: {answers.part1_words || 0} (Target: 45-55)</p>
                    </div>
                    <div className="p-4">
                      <label className="text-sm font-semibold text-gray-600 block mb-2">Student's Original Response:</label>
                      <div className="bg-gray-50 p-4 rounded-lg border text-gray-800 whitespace-pre-wrap leading-relaxed min-h-[100px]">
                        {answers.part1 || 'No response submitted'}
                      </div>
                      {answers.marks?.part1 && (
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                          <div className="bg-green-100 p-2 rounded-lg">
                            <div className="text-xs text-gray-500">Content</div>
                            <div className="text-lg font-bold text-green-700">{answers.marks.part1.content}/5</div>
                          </div>
                          <div className="bg-blue-100 p-2 rounded-lg">
                            <div className="text-xs text-gray-500">Organisation</div>
                            <div className="text-lg font-bold text-blue-700">{answers.marks.part1.organisation}/5</div>
                          </div>
                          <div className="bg-purple-100 p-2 rounded-lg">
                            <div className="text-xs text-gray-500">Language</div>
                            <div className="text-lg font-bold text-purple-700">{answers.marks.part1.language}/5</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Teacher Feedback for Part 1 */}
                      {feedback.part1?.feedback && (
                        <div className="mt-4 bg-orange-50 border-2 border-orange-200 rounded-lg p-4">
                          <h4 className="text-sm font-bold text-orange-800 mb-2">🔴 Teacher's Comments:</h4>
                          <p className="text-gray-700 whitespace-pre-wrap">{feedback.part1.feedback}</p>
                        </div>
                      )}
                      
                      {feedback.part1?.correctedVersion && (
                        <div className="mt-4 bg-green-50 border-2 border-green-200 rounded-lg p-4">
                          <h4 className="text-sm font-bold text-green-800 mb-2">✅ Corrected/Model Version:</h4>
                          <p className="text-gray-700 whitespace-pre-wrap">{feedback.part1.correctedVersion}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Part 2 */}
                  <div className="border-2 border-indigo-200 rounded-xl overflow-hidden">
                    <div className="bg-indigo-100 p-4">
                      <h3 className="text-lg font-bold text-indigo-800">📝 Part 2: Essay</h3>
                      <p className="text-sm text-indigo-600">Online vs shop shopping • Word count: {answers.part2_words || 0} (Target: 110-130)</p>
                    </div>
                    <div className="p-4">
                      <label className="text-sm font-semibold text-gray-600 block mb-2">Student's Original Response:</label>
                      <div className="bg-gray-50 p-4 rounded-lg border text-gray-800 whitespace-pre-wrap leading-relaxed min-h-[150px]">
                        {answers.part2 || 'No response submitted'}
                      </div>
                      {answers.marks?.part2 && (
                        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                          <div className="bg-green-100 p-2 rounded-lg">
                            <div className="text-xs text-gray-500">Content</div>
                            <div className="text-lg font-bold text-green-700">{answers.marks.part2.content}/5</div>
                          </div>
                          <div className="bg-yellow-100 p-2 rounded-lg">
                            <div className="text-xs text-gray-500">Comm. Ach.</div>
                            <div className="text-lg font-bold text-yellow-700">{answers.marks.part2.communicativeAchievement}/5</div>
                          </div>
                          <div className="bg-blue-100 p-2 rounded-lg">
                            <div className="text-xs text-gray-500">Organisation</div>
                            <div className="text-lg font-bold text-blue-700">{answers.marks.part2.organisation}/5</div>
                          </div>
                          <div className="bg-purple-100 p-2 rounded-lg">
                            <div className="text-xs text-gray-500">Language</div>
                            <div className="text-lg font-bold text-purple-700">{answers.marks.part2.language}/5</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Teacher Feedback for Part 2 */}
                      {feedback.part2?.feedback && (
                        <div className="mt-4 bg-orange-50 border-2 border-orange-200 rounded-lg p-4">
                          <h4 className="text-sm font-bold text-orange-800 mb-2">🔴 Teacher's Comments:</h4>
                          <p className="text-gray-700 whitespace-pre-wrap">{feedback.part2.feedback}</p>
                        </div>
                      )}
                      
                      {feedback.part2?.correctedVersion && (
                        <div className="mt-4 bg-green-50 border-2 border-green-200 rounded-lg p-4">
                          <h4 className="text-sm font-bold text-green-800 mb-2">✅ Corrected/Model Version:</h4>
                          <p className="text-gray-700 whitespace-pre-wrap">{feedback.part2.correctedVersion}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Overall Comments */}
                  {feedback.overallComments && (
                    <div className="border-2 border-gray-300 rounded-xl overflow-hidden">
                      <div className="bg-gray-100 p-4">
                        <h3 className="text-lg font-bold text-gray-800">💬 Overall Teacher Comments</h3>
                      </div>
                      <div className="p-4">
                        <p className="text-gray-700 whitespace-pre-wrap">{feedback.overallComments}</p>
                      </div>
                    </div>
                  )}

                  {answers.marked_by && (
                    <div className="text-center text-sm text-gray-500">
                      Marked by {answers.marked_by} on {new Date(answers.marked_at).toLocaleDateString()}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t flex justify-between items-center">
                  <span className="text-xs text-gray-400">Report ID: {selectedCambridgeStudent.id?.substring(0, 8) || 'N/A'}</span>
                  <div className="flex gap-3">
                    {(answers.requires_marking || !feedback.releasedToStudent) && (
                      <button 
                        onClick={() => { setShowCambridgeAnswers(false); openWritingMarking(selectedCambridgeStudent); }} 
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700"
                      >
                        ✏️ {answers.requires_marking ? 'Mark This' : 'Edit Feedback'}
                      </button>
                    )}
                    <button onClick={() => setShowCambridgeAnswers(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700">Close</button>
                  </div>
                </div>
              </div>
            </div>
          );
        }
        
        // Regular test handling
        const correct = correctAnswers[quizName] || {};
        const sections = testSections[quizName] || [];
        
        let correctCount = 0, wrongCount = 0, unansweredCount = 0;
        const mistakes: Array<{ q: number; studentAns: string; correctAns: string; unanswered: boolean }> = [];
        
        Object.keys(correct).forEach(qStr => {
          const q = parseInt(qStr);
          const studentAns = (answers[q] || '').toString().trim();
          const correctAns = correct[q] || '';
          
          if (!studentAns) {
            unansweredCount++;
            mistakes.push({ q, studentAns: '(No answer)', correctAns, unanswered: true });
          } else if (studentAns.toLowerCase() === correctAns.toLowerCase()) {
            correctCount++;
          } else {
            wrongCount++;
            mistakes.push({ q, studentAns, correctAns, unanswered: false });
          }
        });
        
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
              {/* Header */}
              <div className="p-6 border-b-4 border-blue-600">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">🧠</span>
                    <div>
                      <h1 className="text-2xl font-bold text-blue-800">Brains Heist</h1>
                      <p className="text-sm text-gray-500">Test Reflection & Answer Review</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-lg font-semibold text-blue-800">{selectedCambridgeStudent.quiz_name}</h2>
                    <p className="text-sm text-gray-500">Answer Details</p>
                  </div>
                </div>
              </div>

              {/* Student Info Banner */}
              <div className="bg-gradient-to-r from-blue-700 to-purple-800 text-white p-5 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">{selectedCambridgeStudent.student_name}</h2>
                  <p className="text-sm opacity-80">Class: {selectedCambridgeStudent.student_class || 'N/A'} | {new Date(selectedCambridgeStudent.submitted_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold">{selectedCambridgeStudent.score}/{selectedCambridgeStudent.total_questions}</div>
                  <div className="text-sm opacity-80">{selectedCambridgeStudent.percentage}% Score</div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-100 p-4 rounded-xl text-center">
                    <div className="text-3xl">✓</div>
                    <div className="text-3xl font-bold text-green-700">{correctCount}</div>
                    <div className="text-sm text-gray-600">Correct</div>
                  </div>
                  <div className="bg-red-100 p-4 rounded-xl text-center">
                    <div className="text-3xl">✗</div>
                    <div className="text-3xl font-bold text-red-700">{wrongCount}</div>
                    <div className="text-sm text-gray-600">Wrong</div>
                  </div>
                  <div className="bg-amber-100 p-4 rounded-xl text-center">
                    <div className="text-3xl">⚠️</div>
                    <div className="text-3xl font-bold text-amber-700">{unansweredCount}</div>
                    <div className="text-sm text-gray-600">Unanswered</div>
                  </div>
                </div>

                {/* Mistakes Summary */}
                {mistakes.length > 0 && (
                  <div className="border-2 border-red-400 rounded-xl p-4">
                    <h4 className="font-semibold text-red-800 mb-3">❌ Questions to Review ({mistakes.length})</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                      {mistakes.map((m) => (
                        <div key={m.q} className={`p-2 rounded-lg text-sm ${m.unanswered ? 'bg-amber-50 border border-amber-300' : 'bg-red-50 border border-red-300'}`}>
                          <span className="font-bold text-gray-700">Q{m.q}:</span>
                          <span className={`ml-2 ${m.unanswered ? 'text-amber-600' : 'text-red-600'}`}>{m.studentAns}</span>
                          <span className="text-gray-400 mx-1">→</span>
                          <span className="text-green-600 font-semibold">{m.correctAns}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Detailed Answers by Section */}
                {sections.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-blue-800 mb-3">📋 Detailed Answers by Section</h4>
                    {sections.map((section) => (
                      <div key={section.name} className="mb-4 border border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-100 px-4 py-2 font-semibold text-gray-700">
                          {section.icon} {section.name}
                        </div>
                        <div className="p-4">
                          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                            {section.questions.map((q) => {
                              const studentAns = (answers[q] || '').toString().trim();
                              const correctAns = correct[q] || '';
                              const isCorrect = studentAns.toLowerCase() === correctAns.toLowerCase();
                              const isEmpty = !studentAns;
                              
                              return (
                                <div
                                  key={q}
                                  className={`p-2 rounded-lg text-center text-xs ${
                                    isEmpty ? 'bg-amber-100 border border-amber-300' :
                                    isCorrect ? 'bg-green-100 border border-green-300' :
                                    'bg-red-100 border border-red-300'
                                  }`}
                                  title={`Q${q}: Student: "${studentAns || '(empty)'}" | Correct: "${correctAns}"`}
                                >
                                  <div className="font-bold text-gray-700">Q{q}</div>
                                  <div className={`font-semibold ${isEmpty ? 'text-amber-600' : isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                                    {isEmpty ? '—' : studentAns}
                                  </div>
                                  {!isCorrect && !isEmpty && (
                                    <div className="text-green-600 text-xs mt-1">✓ {correctAns}</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t flex justify-between items-center text-xs text-gray-400">
                <span>Report ID: {selectedCambridgeStudent.id?.substring(0, 8) || 'N/A'}</span>
                <span>Confidential — For Student & Teacher Use Only</span>
                <div className="flex gap-3">
                  <button onClick={() => window.print()} className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">🖨️ Print</button>
                  <button onClick={() => setShowCambridgeAnswers(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700">Close</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Writing Marking Modal */}
      {showWritingMarkingModal && selectedCambridgeStudent && (() => {
        const answers = selectedCambridgeStudent.answers || {};
        const part1Total = writingMarks.part1.content + writingMarks.part1.organisation + writingMarks.part1.language;
        const part2Total = writingMarks.part2.content + writingMarks.part2.communicativeAchievement + 
                          writingMarks.part2.organisation + writingMarks.part2.language;
        const totalScore = part1Total + part2Total;
        const percentage = Math.round((totalScore / 35) * 100);
        
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[95vh] overflow-y-auto" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
              {/* Header */}
              <div className="p-6 border-b-4 border-purple-600 bg-gradient-to-r from-purple-50 to-indigo-50">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">✏️</span>
                    <div>
                      <h1 className="text-2xl font-bold text-purple-800">Writing Test Marking & Feedback</h1>
                      <p className="text-sm text-gray-500">E2L Stage 9 Paper 3 — Provide marks and detailed feedback</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowWritingMarkingModal(false)}
                    className="p-2 hover:bg-gray-200 rounded-full text-xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Student Info */}
              <div className="bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-5 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">{selectedCambridgeStudent.student_name}</h2>
                  <p className="text-sm opacity-80">Class: {selectedCambridgeStudent.student_class || 'N/A'} | Submitted: {new Date(selectedCambridgeStudent.submitted_at).toLocaleDateString()}</p>
                </div>
                
                {/* Auto-Proofread Button */}
                <button
                  onClick={autoProofreadWriting}
                  disabled={autoProofreadLoading}
                  className={`px-5 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${
                    autoProofreadLoading 
                      ? 'bg-gray-400 cursor-wait' 
                      : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 shadow-lg hover:shadow-xl'
                  }`}
                >
                  {autoProofreadLoading ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      AI Checking...
                    </>
                  ) : (
                    <>
                      <span>🤖</span>
                      Auto-Proofread
                    </>
                  )}
                </button>
                
                <div className="text-right">
                  <div className="text-3xl font-bold">{totalScore}/35</div>
                  <div className={`text-lg font-semibold ${percentage >= 70 ? 'text-green-300' : percentage >= 50 ? 'text-yellow-300' : 'text-red-300'}`}>
                    {percentage}%
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-8">
                {/* Part 1 */}
                <div className="border-2 border-blue-200 rounded-xl overflow-hidden">
                  <div className="bg-blue-100 p-4">
                    <h3 className="text-lg font-bold text-blue-800">📝 Part 1: Message (15 marks)</h3>
                    <p className="text-sm text-blue-600">Photography lessons message • Target: 45-55 words • Actual: {answers.part1_words || 0} words</p>
                  </div>
                  
                  {/* Student's Answer */}
                  <div className="p-4 bg-gray-50 border-b">
                    <label className="text-sm font-semibold text-gray-600 block mb-2">Student's Original Response:</label>
                    <div className="bg-white p-4 rounded-lg border text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {answers.part1 || 'No response submitted'}
                    </div>
                  </div>
                  
                  {/* Marking Grid */}
                  <div className="p-4 border-b">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-green-50 p-4 rounded-xl border border-green-200">
                        <label className="text-sm font-bold text-green-800 block mb-2">Content (0-5)</label>
                        <select
                          value={writingMarks.part1.content}
                          onChange={(e) => setWritingMarks(prev => ({
                            ...prev,
                            part1: { ...prev.part1, content: parseInt(e.target.value) }
                          }))}
                          className="w-full p-2 border-2 border-green-300 rounded-lg text-lg font-bold text-center"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <p className="text-xs text-gray-500 mt-2">5: All 3 content points fully covered</p>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                        <label className="text-sm font-bold text-blue-800 block mb-2">Organisation (0-5)</label>
                        <select
                          value={writingMarks.part1.organisation}
                          onChange={(e) => setWritingMarks(prev => ({
                            ...prev,
                            part1: { ...prev.part1, organisation: parseInt(e.target.value) }
                          }))}
                          className="w-full p-2 border-2 border-blue-300 rounded-lg text-lg font-bold text-center"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <p className="text-xs text-gray-500 mt-2">5: Well organised, coherent, appropriate linking</p>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
                        <label className="text-sm font-bold text-purple-800 block mb-2">Language (0-5)</label>
                        <select
                          value={writingMarks.part1.language}
                          onChange={(e) => setWritingMarks(prev => ({
                            ...prev,
                            part1: { ...prev.part1, language: parseInt(e.target.value) }
                          }))}
                          className="w-full p-2 border-2 border-purple-300 rounded-lg text-lg font-bold text-center"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <p className="text-xs text-gray-500 mt-2">5: Sufficiently accurate, message clear</p>
                      </div>
                    </div>
                    <div className="mt-4 text-right">
                      <span className="text-lg font-bold text-blue-800">Part 1 Total: {part1Total}/15</span>
                    </div>
                  </div>
                  
                  {/* Feedback Section for Part 1 */}
                  <div className="p-4 bg-orange-50">
                    <h4 className="text-md font-bold text-orange-800 mb-3">📋 Feedback for Part 1 (visible to student when released)</h4>
                    
                    <div className="mb-4">
                      <label className="text-sm font-semibold text-gray-700 block mb-2">
                        🔴 Teacher's Comments & Corrections:
                      </label>
                      <textarea
                        value={writingFeedback.part1.feedback}
                        onChange={(e) => setWritingFeedback(prev => ({
                          ...prev,
                          part1: { ...prev.part1, feedback: e.target.value }
                        }))}
                        placeholder="Point out spelling errors, grammar mistakes, missing content points, etc. Be specific about what the student did wrong and how to improve..."
                        className="w-full p-3 border-2 border-orange-300 rounded-lg min-h-[100px] text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="text-sm font-semibold text-gray-700 block mb-2">
                        ✅ Corrected/Model Version (show student how it should be written):
                      </label>
                      <textarea
                        value={writingFeedback.part1.correctedVersion}
                        onChange={(e) => setWritingFeedback(prev => ({
                          ...prev,
                          part1: { ...prev.part1, correctedVersion: e.target.value }
                        }))}
                        placeholder="Write a corrected version of the student's response, or provide a model answer they can learn from..."
                        className="w-full p-3 border-2 border-green-300 rounded-lg min-h-[100px] text-sm bg-green-50"
                      />
                    </div>
                  </div>
                </div>

                {/* Part 2 */}
                <div className="border-2 border-indigo-200 rounded-xl overflow-hidden">
                  <div className="bg-indigo-100 p-4">
                    <h3 className="text-lg font-bold text-indigo-800">📝 Part 2: Essay (20 marks)</h3>
                    <p className="text-sm text-indigo-600">Online vs shop shopping essay • Target: 110-130 words • Actual: {answers.part2_words || 0} words</p>
                  </div>
                  
                  {/* Student's Answer */}
                  <div className="p-4 bg-gray-50 border-b">
                    <label className="text-sm font-semibold text-gray-600 block mb-2">Student's Original Response:</label>
                    <div className="bg-white p-4 rounded-lg border text-gray-800 whitespace-pre-wrap leading-relaxed min-h-[150px]">
                      {answers.part2 || 'No response submitted'}
                    </div>
                  </div>
                  
                  {/* Marking Grid */}
                  <div className="p-4 border-b">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-green-50 p-3 rounded-xl border border-green-200">
                        <label className="text-sm font-bold text-green-800 block mb-2">Content (0-5)</label>
                        <select
                          value={writingMarks.part2.content}
                          onChange={(e) => setWritingMarks(prev => ({
                            ...prev,
                            part2: { ...prev.part2, content: parseInt(e.target.value) }
                          }))}
                          className="w-full p-2 border-2 border-green-300 rounded-lg text-lg font-bold text-center"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <p className="text-xs text-gray-500 mt-2">5: All relevant, reader fully informed</p>
                      </div>
                      <div className="bg-yellow-50 p-3 rounded-xl border border-yellow-200">
                        <label className="text-sm font-bold text-yellow-800 block mb-2">Comm. Ach. (0-5)</label>
                        <select
                          value={writingMarks.part2.communicativeAchievement}
                          onChange={(e) => setWritingMarks(prev => ({
                            ...prev,
                            part2: { ...prev.part2, communicativeAchievement: parseInt(e.target.value) }
                          }))}
                          className="w-full p-2 border-2 border-yellow-300 rounded-lg text-lg font-bold text-center"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <p className="text-xs text-gray-500 mt-2">5: Clear, appropriate style</p>
                      </div>
                      <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                        <label className="text-sm font-bold text-blue-800 block mb-2">Organisation (0-5)</label>
                        <select
                          value={writingMarks.part2.organisation}
                          onChange={(e) => setWritingMarks(prev => ({
                            ...prev,
                            part2: { ...prev.part2, organisation: parseInt(e.target.value) }
                          }))}
                          className="w-full p-2 border-2 border-blue-300 rounded-lg text-lg font-bold text-center"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <p className="text-xs text-gray-500 mt-2">5: Well organised, coherent</p>
                      </div>
                      <div className="bg-purple-50 p-3 rounded-xl border border-purple-200">
                        <label className="text-sm font-bold text-purple-800 block mb-2">Language (0-5)</label>
                        <select
                          value={writingMarks.part2.language}
                          onChange={(e) => setWritingMarks(prev => ({
                            ...prev,
                            part2: { ...prev.part2, language: parseInt(e.target.value) }
                          }))}
                          className="w-full p-2 border-2 border-purple-300 rounded-lg text-lg font-bold text-center"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <p className="text-xs text-gray-500 mt-2">5: Range of vocab, good control</p>
                      </div>
                    </div>
                    <div className="mt-4 text-right">
                      <span className="text-lg font-bold text-indigo-800">Part 2 Total: {part2Total}/20</span>
                    </div>
                  </div>
                  
                  {/* Feedback Section for Part 2 */}
                  <div className="p-4 bg-orange-50">
                    <h4 className="text-md font-bold text-orange-800 mb-3">📋 Feedback for Part 2 (visible to student when released)</h4>
                    
                    <div className="mb-4">
                      <label className="text-sm font-semibold text-gray-700 block mb-2">
                        🔴 Teacher's Comments & Corrections:
                      </label>
                      <textarea
                        value={writingFeedback.part2.feedback}
                        onChange={(e) => setWritingFeedback(prev => ({
                          ...prev,
                          part2: { ...prev.part2, feedback: e.target.value }
                        }))}
                        placeholder="Point out spelling errors, grammar mistakes, weak arguments, organisation issues, etc. Be specific about what the student did wrong and how to improve..."
                        className="w-full p-3 border-2 border-orange-300 rounded-lg min-h-[120px] text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="text-sm font-semibold text-gray-700 block mb-2">
                        ✅ Corrected/Model Version (show student how it should be written):
                      </label>
                      <textarea
                        value={writingFeedback.part2.correctedVersion}
                        onChange={(e) => setWritingFeedback(prev => ({
                          ...prev,
                          part2: { ...prev.part2, correctedVersion: e.target.value }
                        }))}
                        placeholder="Write a corrected version of the student's essay, or provide a model answer they can learn from..."
                        className="w-full p-3 border-2 border-green-300 rounded-lg min-h-[150px] text-sm bg-green-50"
                      />
                    </div>
                  </div>
                </div>

                {/* Overall Comments */}
                <div className="border-2 border-gray-300 rounded-xl overflow-hidden">
                  <div className="bg-gray-100 p-4">
                    <h3 className="text-lg font-bold text-gray-800">💬 Overall Comments & Tips</h3>
                  </div>
                  <div className="p-4">
                    <textarea
                      value={writingFeedback.overallComments}
                      onChange={(e) => setWritingFeedback(prev => ({
                        ...prev,
                        overallComments: e.target.value
                      }))}
                      placeholder="Add any overall comments, encouragement, or specific tips for this student to improve their writing skills..."
                      className="w-full p-3 border-2 border-gray-300 rounded-lg min-h-[100px] text-sm"
                    />
                  </div>
                </div>

                {/* Total Score Summary */}
                <div className={`p-6 rounded-xl text-center ${
                  percentage >= 70 ? 'bg-green-100 border-2 border-green-400' :
                  percentage >= 50 ? 'bg-yellow-100 border-2 border-yellow-400' :
                  'bg-red-100 border-2 border-red-400'
                }`}>
                  <h3 className="text-2xl font-bold mb-2">Total Score: {totalScore}/35 ({percentage}%)</h3>
                  <p className="text-gray-600">
                    {percentage >= 80 ? '🏆 Excellent work!' :
                     percentage >= 70 ? '👍 Good effort!' :
                     percentage >= 50 ? '📈 Room for improvement' :
                     '💪 Needs more practice'}
                  </p>
                </div>
              </div>

              {/* Footer with Release Options */}
              <div className="p-4 border-t bg-gray-50">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">
                    {answers.marked_by ? (
                      <span>
                        Previously marked by <strong>{answers.marked_by}</strong>
                        {answers.feedback?.releasedToStudent && <span className="ml-2 text-green-600">✓ Released to student</span>}
                      </span>
                    ) : 'Not yet marked'}
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowWritingMarkingModal(false)} 
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => submitWritingMarks(false)} 
                      className="px-5 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
                    >
                      💾 Save (Draft)
                    </button>
                    <button 
                      onClick={() => submitWritingMarks(true)} 
                      className="px-5 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
                    >
                      ✅ Save & Release to Student
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2 text-center">
                  💡 "Save (Draft)" keeps feedback hidden. "Save & Release" makes marks and feedback visible to the student.
                </p>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-2xl text-cyan-400 animate-pulse">Loading Teacher Portal...</div>
      </div>
    );
  }

  const navTabs: Array<{ id: 'dashboard' | 'questions' | 'assignments' | 'reports' | 'cambridge'; label: string; icon: string }> = [
    { id: 'dashboard', label: 'Overview', icon: '🏠' },
    { id: 'questions', label: 'Questions', icon: '📚' },
    { id: 'assignments', label: 'Assignments', icon: '🗂️' },
    { id: 'reports', label: 'Reports', icon: '📊' },
    { id: 'cambridge', label: 'Cambridge Tests', icon: '📝' },
  ];

  const containerSpacing = view === 'question-bank'
    ? 'mt-6 pt-6 md:pt-10'
    : 'mt-6';

  return (
    <div className={containerSpacing}>
      <BackButton onClick={onComplete} />

      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap gap-3 mb-6">
          {navTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => changeSection(tab.id)}
              className={`px-4 py-2 rounded-full border transition-all ${primarySection === tab.id ? 'border-cyan-400 text-white bg-cyan-500/20' : 'border-gray-700 text-gray-400 hover:border-cyan-400 hover:text-white'}`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {view === 'dashboard' && renderDashboard()}
        {view === 'create-question' && renderCreateQuestion()}
        {view === 'question-bank' && renderQuestionBank()}
        {view === 'csv-upload' && renderCSVUpload()}
        {view === 'assignments' && renderAssignments()}
        {view === 'create-assignment' && renderCreateAssignment()}
        {view === 'reports' && renderReports()}
        {view === 'report-detail' && renderReportDetail()}
        {view === 'cambridge-reports' && renderCambridgeReports()}
        {view === 'geometry-diagrams' && teacher && (
          <DiagramBuilder
            teacherId={teacher.id}
            onComplete={() => setView('dashboard')}
          />
        )}
      </div>
    </div>
  );
};

export default TeacherPortal;
