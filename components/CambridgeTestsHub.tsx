import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Profile } from '../types';

interface CambridgeTest {
  id: string;
  name: string;
  description: string;
  duration: string;
  totalQuestions: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  category: 'Reading' | 'Listening' | 'Grammar' | 'Vocabulary' | 'Writing' | 'Science';
  subject: 'English stage 9' | 'AS Chemistry';
  url: string;
  isCompleted?: boolean;
  score?: number;
  completedAt?: string;
  requiresMarking?: boolean;
  isAwaitingMarking?: boolean; // True if submitted but not yet marked
  feedbackReleased?: boolean; // True if teacher has released feedback
  isMarked?: boolean; // True if teacher has marked the test
  scoresReleased?: boolean; // True if teacher released auto-marked score/report
}

interface CambridgeTestsHubProps {
  profile: Profile;
  onExit: () => void;
}

// Available Cambridge tests - add new tests here
const AVAILABLE_TESTS: CambridgeTest[] = [
  {
    id: 'cambridge-reading-25',
    name: 'Cambridge Reading Test 25',
    description: 'Comprehensive reading comprehension test covering vocabulary, matching, and detailed analysis.',
    duration: '45 min',
    totalQuestions: 42,
    difficulty: 'Intermediate',
    category: 'Reading',
    subject: 'English stage 9',
    url: '/cambridge-tests/English%20stage%209/cambridge_reading_25_answer_form.html',
  },
  {
    id: 'cambridge-listening-1',
    name: 'Cambridge Listening Test 1',
    description: 'Complete listening test with 5 parts: picture selection, multiple choice, fill-in-the-blanks, interview, and matching exercises.',
    duration: '30 min',
    totalQuestions: 25,
    difficulty: 'Intermediate',
    category: 'Listening',
    subject: 'English stage 9',
    url: '/cambridge-tests/English%20stage%209/cambridge_listening_test_1.html',
  },
  {
    id: 'cambridge-writing-1',
    name: 'Cambridge Writing Test 1',
    description: 'E2L Stage 9 Paper 3 writing test with 2 parts: a short message (45-55 words) and an opinion essay (110-130 words). Teacher-marked.',
    duration: '45 min',
    totalQuestions: 2,
    difficulty: 'Intermediate',
    category: 'Writing',
    subject: 'English stage 9',
    url: '/cambridge-tests/English%20stage%209/cambridge_writing_test_1.html',
    requiresMarking: true,
  },
  {
    id: 'cambridge-writing-2',
    name: 'Cambridge Writing Test 2',
    description: 'E2L Stage 9 Paper 3 writing test with 2 parts: an email (45-55 words) and a story (110-130 words). Teacher-marked.',
    duration: '45 min',
    totalQuestions: 2,
    difficulty: 'Intermediate',
    category: 'Writing',
    subject: 'English stage 9',
    url: '/cambridge-tests/English%20stage%209/cambridge_writing_test_2.html',
    requiresMarking: true,
  },
  {
    id: 'cambridge-end-unit-4-stage-8',
    name: 'End of Unit 4 Test (Stage 8 English)',
    description: 'Comprehensive test covering vocabulary, grammar, and language skills. 40 questions total: vocabulary matching, passive voice, present perfect continuous, and multiple-choice sections.',
    duration: '60 min',
    totalQuestions: 40,
    difficulty: 'Intermediate',
    category: 'Vocabulary' as const,
    subject: 'English stage 9',
    url: '/cambridge-tests/English%20stage%209/cambridge_end_unit_4_test.html',
  },
  {
    id: 'as-chemistry-atomic-structure-part-1',
    name: 'AS Chemistry — Atomic Structure (Part 1)',
    description: 'Chapter 1 multiple-choice practice focusing on protons, neutrons, electrons, isotopes, and particle behaviour in fields.',
    duration: '50 min',
    totalQuestions: 25,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/atomic_structure.html?part=1',
  },
  {
    id: 'as-chemistry-atomic-structure-part-2',
    name: 'AS Chemistry — Atomic Structure (Part 2)',
    description: 'Chapter 1 multiple-choice practice focusing on protons, neutrons, electrons, isotopes, and particle behaviour in fields.',
    duration: '48 min',
    totalQuestions: 24,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/atomic_structure.html?part=2',
  },
  {
    id: 'as-chemistry-ch2-atoms-molecules-stoichiometry-part-1',
    name: 'AS Chemistry Ch2 (Atoms, molecules and stoichiometry) (Part 1)',
    description: 'Chapter 2 multiple-choice practice covering Avogadro constant, empirical formulae, ionisation trends, and reacting masses.',
    duration: '64 min',
    totalQuestions: 32,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/atoms_molecules_stoichiometry.html?part=1',
  },
  {
    id: 'as-chemistry-ch2-atoms-molecules-stoichiometry-part-2',
    name: 'AS Chemistry Ch2 (Atoms, molecules and stoichiometry) (Part 2)',
    description: 'Chapter 2 multiple-choice practice covering Avogadro constant, empirical formulae, ionisation trends, and reacting masses.',
    duration: '64 min',
    totalQuestions: 32,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/atoms_molecules_stoichiometry.html?part=2',
  },
  {
    id: 'as-chemistry-ch3-chemical-bonding-part-1',
    name: 'AS Chemistry Ch3 (Chemical bonding) (Part 1)',
    description: 'Chapter 3 multiple-choice practice on metallic bonding, shapes, hybridisation, bonding energetics, and dative bonds.',
    duration: '56 min',
    totalQuestions: 28,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/chemical_bonding.html?part=1',
  },
  {
    id: 'as-chemistry-ch3-chemical-bonding-part-2',
    name: 'AS Chemistry Ch3 (Chemical bonding) (Part 2)',
    description: 'Chapter 3 multiple-choice practice on metallic bonding, shapes, hybridisation, bonding energetics, and dative bonds.',
    duration: '54 min',
    totalQuestions: 27,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/chemical_bonding.html?part=2',
  },
  {
    id: 'as-chemistry-ch4-states-of-matter-part-1',
    name: 'AS Chemistry Ch4 (States of matter) (Part 1)',
    description: 'Chapter 4 multiple-choice practice on gas laws, kinetic theory, real gas deviations, and quantitative gas questions.',
    duration: '62 min',
    totalQuestions: 31,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/states_of_matter.html?part=1',
  },
  {
    id: 'as-chemistry-ch4-states-of-matter-part-2',
    name: 'AS Chemistry Ch4 (States of matter) (Part 2)',
    description: 'Chapter 4 multiple-choice practice on gas laws, kinetic theory, real gas deviations, and quantitative gas questions.',
    duration: '60 min',
    totalQuestions: 30,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/states_of_matter.html?part=2',
  },
  {
    id: 'as-chemistry-ch5-chemical-energetics-part-1',
    name: 'AS Chemistry Ch5 (Chemical Energetics) (Part 1)',
    description: 'Chapter 5 multiple-choice practice on enthalpy terminology, energy profiles, Hess’ law reasoning, and calorimetry.',
    duration: '54 min',
    totalQuestions: 27,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/chemical_energetics.html?part=1',
  },
  {
    id: 'as-chemistry-ch5-chemical-energetics-part-2',
    name: 'AS Chemistry Ch5 (Chemical Energetics) (Part 2)',
    description: 'Chapter 5 multiple-choice practice on enthalpy terminology, energy profiles, Hess’ law reasoning, and calorimetry.',
    duration: '52 min',
    totalQuestions: 26,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/chemical_energetics.html?part=2',
  },
  {
    id: 'as-chemistry-ch6-electrochemistry-part-1',
    name: 'AS Chemistry Ch6 (Electrochemistry) (Part 1)',
    description: 'Chapter 6 multiple-choice practice on electrochemical cells, electrode potentials, fuel cells, and redox processes.',
    duration: '56 min',
    totalQuestions: 28,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/electrochemistry.html?part=1',
  },
  {
    id: 'as-chemistry-ch6-electrochemistry-part-2',
    name: 'AS Chemistry Ch6 (Electrochemistry) (Part 2)',
    description: 'Chapter 6 multiple-choice practice on electrochemical cells, electrode potentials, fuel cells, and redox processes.',
    duration: '56 min',
    totalQuestions: 28,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/electrochemistry.html?part=2',
  },
  {
    id: 'as-chemistry-ch7-equilibria-part-1',
    name: 'AS Chemistry Ch7 (Equilibria) (Part 1)',
    description: 'Le Chatelier shifts, Kp / Kc calculations, industrial processes, and equilibrium graphs.',
    duration: '74 min',
    totalQuestions: 37,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/equilibria.html?part=1',
  },
  {
    id: 'as-chemistry-ch7-equilibria-part-2',
    name: 'AS Chemistry Ch7 (Equilibria) (Part 2)',
    description: 'Le Chatelier shifts, Kp / Kc calculations, industrial processes, and equilibrium graphs.',
    duration: '72 min',
    totalQuestions: 36,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/equilibria.html?part=2',
  },
  {
    id: 'as-chemistry-ch8-reaction-kinetics-part-1',
    name: 'AS Chemistry Ch8 (Reaction kinetics) (Part 1)',
    description: 'Collision theory, Maxwell–Boltzmann curves, catalysts, half-life, and rate equation reasoning.',
    duration: '42 min',
    totalQuestions: 21,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/reaction_kinetics.html?part=1',
  },
  {
    id: 'as-chemistry-ch8-reaction-kinetics-part-2',
    name: 'AS Chemistry Ch8 (Reaction kinetics) (Part 2)',
    description: 'Collision theory, Maxwell–Boltzmann curves, catalysts, half-life, and rate equation reasoning.',
    duration: '40 min',
    totalQuestions: 20,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/reaction_kinetics.html?part=2',
  },
  {
    id: 'as-chemistry-ch9-chemical-periodicity-part-1',
    name: 'AS Chemistry Ch9 (Chemical Periodicity) (Part 1)',
    description: 'Period 3 oxides, chlorides, structure trends, acid-base behaviour, and combustion stoichiometry.',
    duration: '86 min',
    totalQuestions: 43,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/chemical_periodicity.html?part=1',
  },
  {
    id: 'as-chemistry-ch9-chemical-periodicity-part-2',
    name: 'AS Chemistry Ch9 (Chemical Periodicity) (Part 2)',
    description: 'Period 3 oxides, chlorides, structure trends, acid-base behaviour, and combustion stoichiometry.',
    duration: '84 min',
    totalQuestions: 42,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/chemical_periodicity.html?part=2',
  },
  {
    id: 'as-chemistry-ch10-group-2-part-1',
    name: 'AS Chemistry Ch10 (Group 2) (Part 1)',
    description: 'Group 2 trends practice on solubility, thermal stability, reactions, and qualitative analysis scenarios.',
    duration: '74 min',
    totalQuestions: 37,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/group_2.html?part=1',
  },
  {
    id: 'as-chemistry-ch10-group-2-part-2',
    name: 'AS Chemistry Ch10 (Group 2) (Part 2)',
    description: 'Group 2 trends practice on solubility, thermal stability, reactions, and qualitative analysis scenarios.',
    duration: '72 min',
    totalQuestions: 36,
    difficulty: 'Advanced',
    category: 'Science',
    subject: 'AS Chemistry',
    url: '/cambridge-tests/Chemistry/group_2.html?part=2',
  },
  // Add more tests here as they become available
];

interface MistakeItem {
  wrong: string;
  correct: string;
  explanation: string;
}

interface MarkJustifications {
  content: string;
  organisation: string;
  language: string;
  communicativeAchievement?: string;
}

interface WritingFeedbackView {
  testName: string;
  score: number;
  percentage: number;
  part1: {
    original: string;
    feedback: string;
    corrected: string;
    content: number;
    organisation: number;
    language: number;
    spellingMistakes?: MistakeItem[];
    grammarMistakes?: MistakeItem[];
    markJustifications?: MarkJustifications;
  };
  part2: {
    original: string;
    feedback: string;
    corrected: string;
    content: number;
    communicativeAchievement: number;
    organisation: number;
    language: number;
    spellingMistakes?: MistakeItem[];
    grammarMistakes?: MistakeItem[];
    markJustifications?: MarkJustifications;
  };
  markedBy?: string | null;
  markedAt?: string | null;
  overallComments?: string;
}

const CambridgeTestsHub: React.FC<CambridgeTestsHubProps> = ({ profile, onExit }) => {
  const [tests, setTests] = useState<CambridgeTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTest, setActiveTest] = useState<CambridgeTest | null>(null);
  const [filter, setFilter] = useState<'all' | 'completed' | 'pending'>('all');
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackData, setFeedbackData] = useState<WritingFeedbackView | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [activeFeedbackPart, setActiveFeedbackPart] = useState<'part1' | 'part2'>('part1');
  const [collapsedSubjects, setCollapsedSubjects] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadTestProgress();
  }, [profile.username]);

  useEffect(() => {
    if (!showFeedbackModal) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [showFeedbackModal]);

  // Listen for test completion messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CAMBRIDGE_TEST_COMPLETE') {
        console.log('Test completed:', event.data);
        // Refresh the test list to show updated completion status
        setTimeout(() => {
          loadTestProgress();
        }, 1000);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const loadTestProgress = async () => {
    setLoading(true);
    try {
      // Fetch completed tests from quiz_scores table (include answers for marking status)
      const { data: completedTests, error } = await supabase
        .from('quiz_scores')
        .select('quiz_name, score, total_questions, percentage, submitted_at, answers, scores_released')
        .eq('student_name', profile.username)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      // Map test completion status
      const testsWithProgress = AVAILABLE_TESTS.map(test => {
        const completion = completedTests?.find(c => 
          c.quiz_name.toLowerCase().includes(test.id.replace(/-/g, ' ').replace('cambridge ', ''))
          || test.name.toLowerCase().includes(c.quiz_name.toLowerCase().replace('cambridge ', ''))
        );
        
        // Check if this is a writing test awaiting marking
        // Parse answers if it's a string (Supabase sometimes returns JSONB as string)
        let answers: { requires_marking?: boolean; feedback?: { releasedToStudent?: boolean } } | undefined;
        if (completion?.answers) {
          answers = typeof completion.answers === 'string' 
            ? JSON.parse(completion.answers) 
            : completion.answers;
        }
        const isAwaitingMarking = test.requiresMarking && answers?.requires_marking === true;
        const feedbackReleased = answers?.feedback?.releasedToStudent === true;
        // Test is marked if requires_marking is explicitly false (was true, now marked)
        const isMarked = test.requiresMarking && answers?.requires_marking === false && answers?.marks !== undefined;
        const scoresReleased = completion?.scores_released === true;
        
        // DEBUG: Log writing test status
        if (test.requiresMarking) {
          console.log('=== WRITING TEST STATUS ===');
          console.log('Test:', test.name);
          console.log('Found completion:', !!completion);
          console.log('Raw answers type:', typeof completion?.answers);
          console.log('Raw answers:', completion?.answers);
          console.log('Parsed answers:', answers);
          console.log('answers?.requires_marking:', answers?.requires_marking);
          console.log('answers?.feedback:', answers?.feedback);
          console.log('answers?.feedback?.releasedToStudent:', answers?.feedback?.releasedToStudent);
          console.log('isAwaitingMarking:', isAwaitingMarking);
          console.log('feedbackReleased:', feedbackReleased);
        }
        
        return {
          ...test,
          isCompleted: !!completion,
          score: completion?.percentage,
          completedAt: completion?.submitted_at,
          isAwaitingMarking,
          feedbackReleased,
          isMarked,
          scoresReleased,
        };
      });

      setTests(testsWithProgress);
    } catch (err) {
      console.error('Error loading test progress:', err);
      setTests(AVAILABLE_TESTS);
    } finally {
      setLoading(false);
    }
  };

  const handleStartTest = (test: CambridgeTest) => {
    // Store user info for the test form to use
    localStorage.setItem('cambridge_test_user', JSON.stringify({
      name: profile.username,
      class: profile.batch || 'N/A',
      grade: profile.grade,
      schoolId: profile.school_id ?? null,
      userId: profile.id,
    }));
    
    const isChemistryTest = test.subject === 'AS Chemistry';
    if (isChemistryTest && test.isCompleted && !test.scoresReleased) {
      return;
    }
    // If this is a retake, clear the previous submission lock from localStorage
    if (test.isCompleted && !isChemistryTest) {
      // Clear the submission lock for writing tests
      const quizId = test.id.replace(/-/g, '_');
      localStorage.removeItem(`quiz_submitted_${quizId}`);
      localStorage.removeItem(`quiz_draft_${quizId}`);
      // Also set a flag indicating this is a retake
      localStorage.setItem('cambridge_retake', 'true');
    }
    
    setActiveTest(test);
  };

  const handleTestComplete = () => {
    setActiveTest(null);
    loadTestProgress(); // Refresh completion status
  };

  // Function to view writing test feedback
  const viewWritingFeedback = async (test: CambridgeTest) => {
    setFeedbackLoading(true);
    setShowFeedbackModal(true);
    
    try {
      // Fetch the submission with feedback
      const { data, error } = await supabase
        .from('quiz_scores')
        .select('*')
        .eq('student_name', profile.username)
        .ilike('quiz_name', '%writing%')
        .order('submitted_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;

      if (data && data.answers) {
        const answers = typeof data.answers === 'string' ? JSON.parse(data.answers) : data.answers;
        
        // DEBUG: Log what we received from the database
        console.log('=== STUDENT FEEDBACK DEBUG ===');
        console.log('Raw data.answers:', data.answers);
        console.log('Parsed answers:', answers);
        console.log('answers.feedback:', answers.feedback);
        console.log('answers.feedback?.releasedToStudent:', answers.feedback?.releasedToStudent);
        console.log('answers.requires_marking:', answers.requires_marking);
        
        // Marks and feedback are stored INSIDE the answers JSONB column
        const marks = answers.marks || null;
        const feedback = answers.feedback || null;

        console.log('Extracted marks:', marks);
        console.log('Extracted feedback:', feedback);
        console.log('feedback?.releasedToStudent:', feedback?.releasedToStudent);

        // Check if the test has been marked (requires_marking is false means it's been marked)
        // Show feedback if marked, regardless of releasedToStudent flag
        const isMarked = answers.requires_marking === false && (marks !== null || feedback !== null);
        
        if (!isMarked && answers.requires_marking === true) {
          console.log('BLOCKING: Test is still awaiting marking');
          setFeedbackData(null);
          return;
        }

        console.log('SUCCESS: Test is marked, showing feedback to student');
        setFeedbackData({
          testName: data.quiz_name,
          score: data.score,
          percentage: data.percentage,
          part1: {
            original: answers.part1 || '',
            feedback: feedback?.part1?.feedback || '',
            corrected: feedback?.part1?.correctedVersion || '',
            content: marks?.part1?.content || 0,
            organisation: marks?.part1?.organisation || 0,
            language: marks?.part1?.language || 0,
            spellingMistakes: feedback?.part1?.spellingMistakes || [],
            grammarMistakes: feedback?.part1?.grammarMistakes || [],
            markJustifications: feedback?.part1?.markJustifications || null,
          },
          part2: {
            original: answers.part2 || '',
            feedback: feedback?.part2?.feedback || '',
            corrected: feedback?.part2?.correctedVersion || '',
            content: marks?.part2?.content || 0,
            communicativeAchievement: marks?.part2?.communicativeAchievement || 0,
            organisation: marks?.part2?.organisation || 0,
            language: marks?.part2?.language || 0,
            spellingMistakes: feedback?.part2?.spellingMistakes || [],
            grammarMistakes: feedback?.part2?.grammarMistakes || [],
            markJustifications: feedback?.part2?.markJustifications || null,
          },
          markedBy: answers.marked_by || null,
          markedAt: answers.marked_at || null,
          overallComments: feedback?.overallComments || '',
        });
        setActiveFeedbackPart('part1');
      }
    } catch (err) {
      console.error('Error fetching writing feedback:', err);
      setFeedbackData(null);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const gradeSubjectMap: Record<number, CambridgeTest['subject'][]> = {
    8: ['English stage 9'],
    11: ['AS Chemistry'],
  };

  const eligibleSubjects = profile.grade === null
    ? null
    : gradeSubjectMap[profile.grade] ?? [];

  const gradeFilteredTests = eligibleSubjects === null
    ? tests
    : tests.filter(test => eligibleSubjects.includes(test.subject));

  const filteredTests = gradeFilteredTests.filter(test => {
    if (filter === 'completed') return test.isCompleted;
    if (filter === 'pending') return !test.isCompleted;
    return true;
  });

  const testsBySubject = filteredTests.reduce<Record<string, CambridgeTest[]>>((acc, test) => {
    if (!acc[test.subject]) acc[test.subject] = [];
    acc[test.subject].push(test);
    return acc;
  }, {});

  const subjectList = Object.keys(testsBySubject);

  useEffect(() => {
    setCollapsedSubjects(prev => {
      const next = { ...prev };
      subjectList.forEach(subject => {
        if (next[subject] === undefined) {
          next[subject] = true;
        }
      });
      return next;
    });
  }, [subjectList.join('|')]);

  const toggleSubject = (subject: string) => {
    setCollapsedSubjects(prev => ({
      ...prev,
      [subject]: !prev[subject],
    }));
  };

  const completedCount = gradeFilteredTests.filter(t => t.isCompleted).length;
  const totalCount = gradeFilteredTests.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner': return '#22c55e';
      case 'Intermediate': return '#f59e0b';
      case 'Advanced': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Reading': return '📖';
      case 'Listening': return '🎧';
      case 'Grammar': return '✍️';
      case 'Vocabulary': return '📚';
      case 'Writing': return '✏️';
      case 'Science': return '🧪';
      default: return '📝';
    }
  };

  // If a test is active, show it in an iframe
  if (activeTest) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#fff',
        zIndex: 9999,
      }}>
        {/* Minimal Test Header Bar */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '50px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 15px',
          background: 'linear-gradient(135deg, #302b63 0%, #24243e 100%)',
          borderBottom: '2px solid #00f5ff',
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🎧</span>
            <div>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '14px', fontWeight: 600 }}>
                {activeTest.name}
              </h2>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>
                {activeTest.totalQuestions} questions
              </p>
            </div>
          </div>
          <button
            onClick={handleTestComplete}
            style={{
              padding: '6px 16px',
              backgroundColor: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '16px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            ✕ Exit
          </button>
        </div>
        
        {/* Test iframe - absolute positioning for reliable sizing */}
        <iframe
          src={activeTest.url}
          style={{
            position: 'absolute',
            top: '52px',
            left: 0,
            width: '100%',
            height: 'calc(100vh - 52px)',
            border: 'none',
          }}
          title={activeTest.name}
          allow="autoplay"
        />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      color: '#fff',
      padding: '20px',
    }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '30px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <img 
              src="/logo.png" 
              alt="Brains Heist" 
              style={{ width: '50px', height: '50px' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div>
              <h1 style={{
                margin: 0,
                fontSize: '28px',
                fontWeight: 'bold',
                background: 'linear-gradient(90deg, #00f5ff, #00d4aa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Cambridge Tests
              </h1>
              <p style={{ margin: '5px 0 0', color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>
                Complete tests to boost your skills across subjects
              </p>
            </div>
          </div>
          <button
            onClick={onExit}
            style={{
              padding: '10px 24px',
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            ← Back to Game
          </button>
        </div>

        {/* Progress Overview */}
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: '16px',
          padding: '20px 25px',
          marginBottom: '25px',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'rgba(255,255,255,0.9)' }}>
                Your Progress
              </h3>
              <p style={{ margin: '5px 0 0', fontSize: '24px', fontWeight: 'bold', color: '#00f5ff' }}>
                {completedCount} / {totalCount} Tests Completed
              </p>
            </div>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: `conic-gradient(#00f5ff ${progressPercent}%, rgba(255,255,255,0.1) 0)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{
                width: '65px',
                height: '65px',
                borderRadius: '50%',
                backgroundColor: '#24243e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 'bold',
              }}>
                {progressPercent}%
              </div>
            </div>
          </div>
          
          {/* Welcome message */}
          <div style={{
            background: 'rgba(0,245,255,0.1)',
            borderRadius: '10px',
            padding: '12px 15px',
            borderLeft: '3px solid #00f5ff',
          }}>
            <p style={{ margin: 0, fontSize: '14px', color: 'rgba(255,255,255,0.9)' }}>
              👋 Welcome, <strong>{profile.username}</strong>! Take your time with each test. 
              Your progress is automatically saved.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '20px',
        }}>
          {(['all', 'pending', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '8px 18px',
                borderRadius: '20px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                transition: 'all 0.2s',
                background: filter === f 
                  ? 'linear-gradient(135deg, #00f5ff, #00d4aa)' 
                  : 'rgba(255,255,255,0.1)',
                color: filter === f ? '#0f0c29' : '#fff',
              }}
            >
              {f === 'all' && `📋 All (${totalCount})`}
              {f === 'pending' && `⏳ Pending (${totalCount - completedCount})`}
              {f === 'completed' && `✅ Completed (${completedCount})`}
            </button>
          ))}
        </div>

        {/* Tests Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.7)' }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>⏳</div>
            Loading tests...
          </div>
        ) : filteredTests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.7)' }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>
              {filter === 'completed' ? '📭' : '🎉'}
            </div>
            {filter === 'completed' 
              ? "You haven't completed any tests yet. Start one below!"
              : filter === 'pending'
              ? "Great job! You've completed all available tests!"
              : "No tests available at the moment."}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {Object.entries(testsBySubject).map(([subject, subjectTests]) => (
              <div key={subject} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  type="button"
                  onClick={() => toggleSubject(subject)}
                  aria-expanded={!collapsedSubjects[subject]}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '22px' }}>📁</span>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>{subject}</h3>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
                          {subjectTests.length} test{subjectTests.length !== 1 ? 's' : ''} available
                        </p>
                      </div>
                    </div>
                    <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)' }}>
                      {collapsedSubjects[subject] ? '▸' : '▾'}
                    </span>
                  </div>
                </button>
                {!collapsedSubjects[subject] && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '20px',
                  }}>
                    {subjectTests.map(test => {
                      const isChemistryTest = test.subject === 'AS Chemistry';
                      const chemistryReportReady = isChemistryTest && test.isCompleted && test.scoresReleased;
                      const chemistryLocked = isChemistryTest && test.isCompleted && !test.scoresReleased;
                      const actionLabel = test.isCompleted
                        ? (isChemistryTest ? (chemistryReportReady ? '📄 View Report' : '✅ Submitted') : '🔄 Retake Test')
                        : '▶️ Start Test';
                      return (
                      <div
                        key={test.id}
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          borderRadius: '16px',
                          overflow: 'hidden',
                          border: test.isCompleted 
                            ? '2px solid #22c55e' 
                            : '1px solid rgba(255,255,255,0.1)',
                          transition: 'all 0.3s',
                        }}
                      >
                        {/* Test Header */}
                        <div style={{
                          background: test.isCompleted 
                            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                            : 'linear-gradient(135deg, #667eea, #764ba2)',
                          padding: '20px',
                          position: 'relative',
                          paddingRight: test.isCompleted ? '120px' : '20px',
                        }}>
                          {test.isCompleted && (
                            <div style={{
                              position: 'absolute',
                              top: '12px',
                              right: '12px',
                              background: '#fff',
                              color: '#22c55e',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                            }}>
                              ✓ COMPLETED
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '32px' }}>{getCategoryIcon(test.category)}</span>
                            <div>
                              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                                {test.name}
                              </h3>
                              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  background: 'rgba(255,255,255,0.2)',
                                }}>
                                  {test.category}
                                </span>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  background: getDifficultyColor(test.difficulty),
                                  color: '#fff',
                                }}>
                                  {test.difficulty}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Test Body */}
                        <div style={{ padding: '20px' }}>
                          <p style={{
                            margin: '0 0 15px',
                            fontSize: '13px',
                            color: 'rgba(255,255,255,0.7)',
                            lineHeight: 1.5,
                          }}>
                            {test.description}
                          </p>

                          <div style={{
                            display: 'flex',
                            gap: '15px',
                            marginBottom: '15px',
                            fontSize: '12px',
                            color: 'rgba(255,255,255,0.6)',
                          }}>
                            <span>⏱️ {test.duration}</span>
                            <span>📝 {test.category === 'Writing' ? '2 parts' : `${test.totalQuestions} questions`}</span>
                          </div>

                          {test.isCompleted && (
                            <div style={{
                              background: test.isAwaitingMarking 
                                ? 'rgba(245,158,11,0.1)' 
                                : 'rgba(34,197,94,0.1)',
                              borderRadius: '10px',
                              padding: '12px',
                              marginBottom: '15px',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                                  Status:
                                </span>
                                <span style={{
                                  fontSize: '14px',
                                  fontWeight: 'bold',
                                  color: test.isAwaitingMarking
                                    ? '#f59e0b'
                                    : chemistryLocked
                                      ? '#f59e0b'
                                      : '#22c55e',
                                }}>
                                  {test.isAwaitingMarking
                                    ? '⏳ Awaiting Marking'
                                    : chemistryLocked
                                      ? '🔒 Awaiting Release'
                                      : '✅ Completed'}
                                </span>
                              </div>
                              {test.completedAt && (
                                <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                                  {test.isAwaitingMarking ? 'Submitted:' : 'Completed:'} {new Date(test.completedAt).toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </p>
                              )}
                              {chemistryLocked && (
                                <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>
                                  Detailed report will unlock once your teacher releases the results.
                                </p>
                              )}
                              
                              {/* View Feedback button for marked writing tests */}
                              {test.requiresMarking && !test.isAwaitingMarking && test.isCompleted && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    viewWritingFeedback(test);
                                  }}
                                  style={{
                                    marginTop: '10px',
                                    width: '100%',
                                    padding: '8px',
                                    borderRadius: '8px',
                                    border: '1px solid #00f5ff',
                                    background: 'transparent',
                                    color: '#00f5ff',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                  }}
                                >
                                  📝 View Teacher Feedback
                                </button>
                              )}
                            </div>
                          )}

                          <button
                            onClick={() => handleStartTest(test)}
                            disabled={chemistryLocked}
                            style={{
                              width: '100%',
                              padding: '12px',
                              borderRadius: '10px',
                              border: 'none',
                              cursor: chemistryLocked ? 'not-allowed' : 'pointer',
                              fontSize: '14px',
                              fontWeight: 600,
                              transition: 'all 0.2s',
                              background: test.isCompleted
                                ? 'rgba(255,255,255,0.1)'
                                : 'linear-gradient(135deg, #00f5ff, #00d4aa)',
                              color: test.isCompleted ? '#fff' : '#0f0c29',
                              opacity: chemistryLocked ? 0.7 : 1,
                            }}
                          >
                            {actionLabel}
                          </button>
                        </div>
                      </div>
                    )})}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Coming Soon Notice */}
        <div style={{
          marginTop: '40px',
          textAlign: 'center',
          padding: '30px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '16px',
          border: '1px dashed rgba(255,255,255,0.2)',
        }}>
          <span style={{ fontSize: '32px' }}>🚀</span>
          <h4 style={{ margin: '10px 0 5px', color: '#fff', fontSize: '16px' }}>More Tests Coming Soon!</h4>
          <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
            We're adding new Cambridge tests regularly. Check back for more practice opportunities!
          </p>
        </div>
      </div>

      {/* Writing Feedback Modal */}
      {showFeedbackModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.9)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '800px',
            maxHeight: 'calc(100vh - 40px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid rgba(0,245,255,0.3)',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '18px' }}>
                📝 Writing Test Feedback
              </h3>
              <button
                onClick={() => {
                  setShowFeedbackModal(false);
                  setFeedbackData(null);
                }}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  color: '#fff',
                  fontSize: '18px',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '20px', overflowY: 'auto' }}>
              {feedbackLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '15px' }}>⏳</div>
                  <p style={{ color: 'rgba(255,255,255,0.7)' }}>Loading feedback...</p>
                </div>
              ) : !feedbackData ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '15px' }}>📋</div>
                  <h4 style={{ color: '#fff', marginBottom: '10px' }}>Feedback Not Yet Available</h4>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                    Your teacher has marked your work but hasn't released the detailed feedback yet.
                    Check back later!
                  </p>
                </div>
              ) : (
                <>
                  {/* Score Summary */}
                  <div style={{
                    background: 'rgba(0,245,255,0.1)',
                    borderRadius: '12px',
                    padding: '15px',
                    marginBottom: '20px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#00f5ff' }}>
                      {feedbackData.score}/35
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                      Total Score ({feedbackData.percentage}%)
                    </div>
                  </div>

                  {/* Part Selector Tabs */}
                  <div style={{
                    display: 'flex',
                    gap: '10px',
                    marginBottom: '20px',
                  }}>
                    <button
                      onClick={() => setActiveFeedbackPart('part1')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '10px',
                        border: activeFeedbackPart === 'part1' ? '2px solid #00f5ff' : '1px solid rgba(255,255,255,0.2)',
                        background: activeFeedbackPart === 'part1' ? 'rgba(0,245,255,0.1)' : 'transparent',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                      }}
                    >
                      Part 1: Message
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
                        {feedbackData.part1.content + feedbackData.part1.organisation + feedbackData.part1.language}/15
                      </div>
                    </button>
                    <button
                      onClick={() => setActiveFeedbackPart('part2')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '10px',
                        border: activeFeedbackPart === 'part2' ? '2px solid #00f5ff' : '1px solid rgba(255,255,255,0.2)',
                        background: activeFeedbackPart === 'part2' ? 'rgba(0,245,255,0.1)' : 'transparent',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                      }}
                    >
                      Part 2: Essay
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
                        {feedbackData.part2.content + feedbackData.part2.communicativeAchievement + feedbackData.part2.organisation + feedbackData.part2.language}/20
                      </div>
                    </button>
                  </div>

                  {/* Spelling Mistakes */}
                  {((activeFeedbackPart === 'part1' ? feedbackData.part1.spellingMistakes : feedbackData.part2.spellingMistakes) || []).length > 0 && (
                    <div style={{
                      background: '#fef2f2',
                      borderRadius: '12px',
                      padding: '15px',
                      marginBottom: '15px',
                      border: '1px solid #fecaca',
                    }}>
                      <h5 style={{ margin: '0 0 12px', color: '#991b1b', fontSize: '14px', fontWeight: 'bold' }}>
                        🔤 Spelling Mistakes ({(activeFeedbackPart === 'part1' ? feedbackData.part1.spellingMistakes : feedbackData.part2.spellingMistakes)?.length || 0})
                      </h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(activeFeedbackPart === 'part1' ? feedbackData.part1.spellingMistakes : feedbackData.part2.spellingMistakes)?.map((m, i) => (
                          <div key={i} style={{
                            background: '#fff',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                          }}>
                            <div style={{ marginBottom: '4px' }}>
                              <span style={{ color: '#dc2626', textDecoration: 'line-through', fontWeight: 500 }}>{m.wrong}</span>
                              <span style={{ margin: '0 8px', color: '#6b7280' }}>→</span>
                              <span style={{ color: '#16a34a', fontWeight: 600 }}>{m.correct}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>{m.explanation}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Grammar Mistakes */}
                  {((activeFeedbackPart === 'part1' ? feedbackData.part1.grammarMistakes : feedbackData.part2.grammarMistakes) || []).length > 0 && (
                    <div style={{
                      background: '#fefce8',
                      borderRadius: '12px',
                      padding: '15px',
                      marginBottom: '15px',
                      border: '1px solid #fde047',
                    }}>
                      <h5 style={{ margin: '0 0 12px', color: '#854d0e', fontSize: '14px', fontWeight: 'bold' }}>
                        📝 Grammar Mistakes ({(activeFeedbackPart === 'part1' ? feedbackData.part1.grammarMistakes : feedbackData.part2.grammarMistakes)?.length || 0})
                      </h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(activeFeedbackPart === 'part1' ? feedbackData.part1.grammarMistakes : feedbackData.part2.grammarMistakes)?.map((m, i) => (
                          <div key={i} style={{
                            background: '#fff',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                          }}>
                            <div style={{ marginBottom: '4px' }}>
                              <span style={{ color: '#dc2626', textDecoration: 'line-through', fontWeight: 500 }}>{m.wrong}</span>
                              <span style={{ margin: '0 8px', color: '#6b7280' }}>→</span>
                              <span style={{ color: '#16a34a', fontWeight: 600 }}>{m.correct}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>{m.explanation}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mark Justifications */}
                  {(activeFeedbackPart === 'part1' ? feedbackData.part1.markJustifications : feedbackData.part2.markJustifications) && (
                    <div style={{
                      background: '#eff6ff',
                      borderRadius: '12px',
                      padding: '15px',
                      marginBottom: '15px',
                      border: '1px solid #bfdbfe',
                    }}>
                      <h5 style={{ margin: '0 0 12px', color: '#1e40af', fontSize: '14px', fontWeight: 'bold' }}>
                        📊 Why You Received These Marks
                      </h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                        <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                          <strong style={{ color: '#374151' }}>Content:</strong>
                          <p style={{ margin: '4px 0 0', color: '#4b5563' }}>
                            {(activeFeedbackPart === 'part1' ? feedbackData.part1.markJustifications : feedbackData.part2.markJustifications)?.content}
                          </p>
                        </div>
                        <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                          <strong style={{ color: '#374151' }}>Organisation:</strong>
                          <p style={{ margin: '4px 0 0', color: '#4b5563' }}>
                            {(activeFeedbackPart === 'part1' ? feedbackData.part1.markJustifications : feedbackData.part2.markJustifications)?.organisation}
                          </p>
                        </div>
                        <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                          <strong style={{ color: '#374151' }}>Language:</strong>
                          <p style={{ margin: '4px 0 0', color: '#4b5563' }}>
                            {(activeFeedbackPart === 'part1' ? feedbackData.part1.markJustifications : feedbackData.part2.markJustifications)?.language}
                          </p>
                        </div>
                        {activeFeedbackPart === 'part2' && feedbackData.part2.markJustifications?.communicativeAchievement && (
                          <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                            <strong style={{ color: '#374151' }}>Communicative Achievement:</strong>
                            <p style={{ margin: '4px 0 0', color: '#4b5563' }}>
                              {feedbackData.part2.markJustifications.communicativeAchievement}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Scores Breakdown */}
                  <div style={{
                    background: '#f5f5f5',
                    borderRadius: '12px',
                    padding: '15px',
                    marginBottom: '20px',
                    color: '#000',
                  }}>
                    <h5 style={{ margin: '0 0 12px', color: '#000', fontSize: '14px' }}>📈 Score Breakdown</h5>
                    {activeFeedbackPart === 'part1' ? (
                      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '80px', textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part1.content}/5</div>
                          <div style={{ fontSize: '11px', color: '#000' }}>Content</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '80px', textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part1.organisation}/5</div>
                          <div style={{ fontSize: '11px', color: '#000' }}>Organisation</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '80px', textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part1.language}/5</div>
                          <div style={{ fontSize: '11px', color: '#000' }}>Language</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '60px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part2.content}/5</div>
                          <div style={{ fontSize: '10px', color: '#000' }}>Content</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '60px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part2.communicativeAchievement}/5</div>
                          <div style={{ fontSize: '10px', color: '#000' }}>Comm. Ach.</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '60px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part2.organisation}/5</div>
                          <div style={{ fontSize: '10px', color: '#000' }}>Organisation</div>
                        </div>
                        <div style={{ flex: 1, minWidth: '60px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000' }}>{feedbackData.part2.language}/5</div>
                          <div style={{ fontSize: '10px', color: '#000' }}>Language</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Your Original Writing */}
                  <div style={{
                    background: '#f9fafb',
                    borderRadius: '12px',
                    padding: '15px',
                    marginBottom: '15px',
                    color: '#000',
                  }}>
                    <h5 style={{ margin: '0 0 10px', color: '#000', fontSize: '14px' }}>✏️ Your Original Writing</h5>
                    <div style={{
                      background: '#fff',
                      borderRadius: '8px',
                      padding: '12px',
                      fontSize: '13px',
                      lineHeight: 1.6,
                      color: '#000',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {activeFeedbackPart === 'part1' ? feedbackData.part1.original : feedbackData.part2.original}
                    </div>
                  </div>

                  {/* Teacher Feedback */}
                  {(activeFeedbackPart === 'part1' ? feedbackData.part1.feedback : feedbackData.part2.feedback) && (
                    <div style={{
                      background: '#fff7ed',
                      borderRadius: '12px',
                      padding: '15px',
                      marginBottom: '15px',
                      border: '1px solid #fed7aa',
                      color: '#000',
                    }}>
                      <h5 style={{ margin: '0 0 10px', color: '#000', fontSize: '14px' }}>💬 Teacher's Comments</h5>
                      <div style={{
                        fontSize: '13px',
                        lineHeight: 1.6,
                        color: '#000',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {activeFeedbackPart === 'part1' ? feedbackData.part1.feedback : feedbackData.part2.feedback}
                      </div>
                    </div>
                  )}

                  {/* Corrected Version */}
                  {(activeFeedbackPart === 'part1' ? feedbackData.part1.corrected : feedbackData.part2.corrected) && (
                    <div style={{
                      background: '#ecfdf3',
                      borderRadius: '12px',
                      padding: '15px',
                      border: '1px solid #bbf7d0',
                      color: '#000',
                    }}>
                      <h5 style={{ margin: '0 0 10px', color: '#000', fontSize: '14px' }}>✨ Improved Version</h5>
                      <div style={{
                        background: '#fff',
                        borderRadius: '8px',
                        padding: '12px',
                        fontSize: '13px',
                        lineHeight: 1.6,
                        color: '#000',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {activeFeedbackPart === 'part1' ? feedbackData.part1.corrected : feedbackData.part2.corrected}
                      </div>
                      <p style={{
                        margin: '10px 0 0',
                        fontSize: '11px',
                        color: '#000',
                        fontStyle: 'italic',
                      }}>
                        💡 Compare this with your original to see how you can improve your writing!
                      </p>
                    </div>
                  )}

                  {/* Overall Comments */}
                  {feedbackData.overallComments && (
                    <div style={{
                      background: '#f0f9ff',
                      borderRadius: '12px',
                      padding: '15px',
                      marginTop: '15px',
                      border: '1px solid #bae6fd',
                      color: '#000',
                    }}>
                      <h5 style={{ margin: '0 0 10px', color: '#000', fontSize: '14px' }}>📝 Overall Comments</h5>
                      <div style={{
                        fontSize: '13px',
                        lineHeight: 1.6,
                        color: '#000',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {feedbackData.overallComments}
                      </div>
                    </div>
                  )}

                  {/* Marked By Info */}
                  {feedbackData.markedBy && (
                    <div style={{
                      marginTop: '15px',
                      padding: '10px',
                      background: '#f3f4f6',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#6b7280',
                      textAlign: 'center',
                    }}>
                      Marked by <strong style={{ color: '#374151' }}>{feedbackData.markedBy.replace(/\s*\(AI\)\s*/gi, '')}</strong>
                      {feedbackData.markedAt && (
                        <span> on {new Date(feedbackData.markedAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CambridgeTestsHub;
