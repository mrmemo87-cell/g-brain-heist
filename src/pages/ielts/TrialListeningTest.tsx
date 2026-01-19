import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { stopBackgroundMusic, resumeBackgroundMusic } from '../../../services/audioService';
import { getRequiredEnvVar } from '../../../services/env';

// Supabase storage URL for audio files
const SUPABASE_STORAGE_URL = `${getRequiredEnvVar('VITE_SUPABASE_URL').replace(/\/$/, '')}/storage/v1/object/public/ielts-audio`;

// Audio URLs for each section
const SECTION_AUDIO = {
  1: `${SUPABASE_STORAGE_URL}/Test%201-Section%201.mp3`,
  2: `${SUPABASE_STORAGE_URL}/Test%201-Section%202.mp3`,
  3: `${SUPABASE_STORAGE_URL}/Test%201-Section%203.mp3`,
  4: `${SUPABASE_STORAGE_URL}/Test%201-Section%204.mp3`,
};

// Trial Test 1 - All 4 Sections hardcoded
const TRIAL_TEST_DATA = {
  title: "IELTS Listening Trial Test 1",
  description: "Complete all 4 sections to receive your score and feedback",
  totalQuestions: 40,
  sections: [
    // ============ SECTION 1: Questions 1-10 ============
    {
      id: 1,
      title: "Section 1",
      subtitle: "Moving Company Service Report",
      instructions: "Questions 1-6: Complete the form below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.",
      context: {
        type: 'form',
        formTitle: 'Moving Company Service Report',
        example: { label: 'Full Name', value: 'Jane Bond' }
      },
      questions: [
        { id: 1, type: 'fill-blank', label: 'Phone Number', prefix: '', suffix: '', answer: '94635550', acceptableAnswers: ['94635550', '946 355 50', '946-355-50', '946355550'] },
        { id: 2, type: 'fill-blank', label: 'USA Address', prefix: '509', suffix: '', answer: 'Clark House', acceptableAnswers: ['clark house', 'Clark House', 'CLARK HOUSE'] },
        { id: 3, type: 'fill-blank', label: '', prefix: '1137', suffix: 'in Seattle', answer: 'University Drive', acceptableAnswers: ['university drive', 'University Drive', 'UNIVERSITY DRIVE'] },
        { id: 4, type: 'fill-blank', label: 'Packing Day', prefix: '', suffix: '', answer: 'Monday', acceptableAnswers: ['monday', 'Monday', 'MONDAY'] },
        { id: 5, type: 'fill-blank', label: 'Day (Clean-up by 5:00 p.m.)', prefix: '', suffix: '', answer: 'Thursday', acceptableAnswers: ['thursday', 'Thursday', 'THURSDAY'] },
        { id: 6, type: 'fill-blank', label: 'Storage Time', prefix: '', suffix: '', answer: 'one month', acceptableAnswers: ['one month', 'One month', 'ONE MONTH', '1 month'] },
        // Questions 7-10: Matching
        { id: 7, type: 'matching', label: 'cutlery and dishes', answer: 'A', acceptableAnswers: ['A', 'a'] },
        { id: 8, type: 'matching', label: 'kettle', answer: 'C', acceptableAnswers: ['C', 'c'] },
        { id: 9, type: 'matching', label: 'alarm clock', answer: 'B', acceptableAnswers: ['B', 'b'] },
        { id: 10, type: 'matching', label: 'CD player', answer: 'C', acceptableAnswers: ['C', 'c'] },
      ],
      matchingOptions: [
        { letter: 'A', label: 'in emergency pack' },
        { letter: 'B', label: 'in personal package' },
        { letter: 'C', label: 'in storage with the furniture' }
      ]
    },
    // ============ SECTION 2: Questions 11-20 ============
    {
      id: 2,
      title: "Section 2",
      subtitle: "Annual Wullaballoo Conference",
      instructions: "Questions 11-16: Complete the table below. Write NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer.",
      context: {
        type: 'table',
        formTitle: 'Annual Wullaballoo Conference Schedule'
      },
      questions: [
        { id: 11, type: 'fill-blank', label: 'Title of lecture (9:00 a.m., Main Hall)', prefix: '', suffix: '', answer: 'Computer as Teacher', acceptableAnswers: ['computer as teacher', 'Computer as Teacher', 'COMPUTER AS TEACHER', 'Computer As Teacher'] },
        { id: 12, type: 'fill-blank', label: 'Lecturer: John Smith from the', prefix: '', suffix: '', answer: 'University of Melbourne', acceptableAnswers: ['university of melbourne', 'University of Melbourne', 'UNIVERSITY OF MELBOURNE', 'Uni of Melbourne'] },
        { id: 13, type: 'fill-blank', label: 'Lunch location: Sea View Restaurant on the', prefix: '', suffix: '', answer: 'top floor', acceptableAnswers: ['top floor', 'Top floor', 'TOP FLOOR', 'top'] },
        { id: 14, type: 'fill-blank', label: 'The lift on the', prefix: '', suffix: '', answer: 'ground floor', acceptableAnswers: ['ground floor', 'Ground floor', 'GROUND FLOOR', 'ground'] },
        { id: 15, type: 'fill-blank', label: 'Afternoon tea time', prefix: '', suffix: 'p.m.', answer: '3:10', acceptableAnswers: ['3:10', '3.10', '3 10', '3:10 pm'] },
        { id: 16, type: 'fill-blank', label: 'Informal reception location (5:10-6:10 p.m.)', prefix: '', suffix: '', answer: 'Palm Lounge', acceptableAnswers: ['palm lounge', 'Palm Lounge', 'PALM LOUNGE', 'Palm lounge'] },
        // Questions 17-20: MCQ
        { id: 17, type: 'mcq', question: 'Tickets are available', options: ['A) only at the reception desk', 'B) tomorrow evening', 'C) at any time before the reception'], answer: 'C', acceptableAnswers: ['C', 'c'] },
        { id: 18, type: 'mcq', question: 'The delegates will be charged __________ for lunch.', options: ['A) $6.50', 'B) $15.00', 'C) $25.00'], answer: 'B', acceptableAnswers: ['B', 'b'] },
        { id: 19, type: 'mcq', question: 'The restaurant is famous for', options: ['A) steak', 'B) fish', 'C) barbecue'], answer: 'B', acceptableAnswers: ['B', 'b'] },
        { id: 20, type: 'mcq', question: 'The trip on Sunday costs', options: ['A) $35 in total', 'B) $35 plus entrance fees', 'C) $35 plus lunch'], answer: 'A', acceptableAnswers: ['A', 'a'] },
      ]
    },
    // ============ SECTION 3: Questions 21-30 ============
    {
      id: 3,
      title: "Section 3",
      subtitle: "General Course Details",
      instructions: "Questions 21-26: Choose the correct letter, A, B, or C.",
      context: {
        type: 'mcq',
        formTitle: 'General Course Details'
      },
      questions: [
        { id: 21, type: 'mcq', question: 'What is the defining characteristic of a specialised course?', options: ['A) Taking a proficiency exam', 'B) Attending the class frequently', 'C) Compulsory and regular'], answer: 'C', acceptableAnswers: ['C', 'c'] },
        { id: 22, type: 'mcq', question: 'The Microbiology courses are available for', options: ['A) full-time and flexible-time students', 'B) Microbiology students only', 'C) students on a flexible schedule'], answer: 'A', acceptableAnswers: ['A', 'a'] },
        { id: 23, type: 'mcq', question: 'The Biology courses are available for', options: ['A) all students', 'B) full-time students only', 'C) freshmen only'], answer: 'B', acceptableAnswers: ['B', 'b'] },
        { id: 24, type: 'mcq', question: 'Who are interested in Microbiology courses?', options: ['A) People who need work experience', 'B) People from off-campus', 'C) People who work at hospital'], answer: 'B', acceptableAnswers: ['B', 'b'] },
        { id: 25, type: 'mcq', question: 'A Medical Science course will be opened next year because', options: ['A) there are no experimental facilities', 'B) the lab equipment is too expensive', 'C) the building is damaged'], answer: 'A', acceptableAnswers: ['A', 'a'] },
        { id: 26, type: 'mcq', question: 'Which is the quickest increasing subject in enrolment?', options: ['A) Medical Science', 'B) Statistics', 'C) Environmental Science'], answer: 'C', acceptableAnswers: ['C', 'c'] },
        // Questions 27-29: Choose THREE letters (A-G)
        { id: 27, type: 'multi-select', label: 'Compulsory course 1', question: 'Which THREE compulsory courses must be taken? (Select one per question)', options: ['A) Medical Science', 'B) Computing', 'C) Mathematics', 'D) Laboratory Techniques', 'E) Statistics', 'F) Medicine', 'G) Environmental Science'], answer: 'C', acceptableAnswers: ['C', 'c'] },
        { id: 28, type: 'multi-select', label: 'Compulsory course 2', question: '', options: ['A) Medical Science', 'B) Computing', 'C) Mathematics', 'D) Laboratory Techniques', 'E) Statistics', 'F) Medicine', 'G) Environmental Science'], answer: 'E', acceptableAnswers: ['E', 'e'] },
        { id: 29, type: 'multi-select', label: 'Compulsory course 3', question: '', options: ['A) Medical Science', 'B) Computing', 'C) Mathematics', 'D) Laboratory Techniques', 'E) Statistics', 'F) Medicine', 'G) Environmental Science'], answer: 'F', acceptableAnswers: ['F', 'f'] },
        // Question 30: Sentence completion
        { id: 30, type: 'fill-blank', label: 'There are three full scholarships that cover tuition and provide $1,500 cash as a', prefix: '', suffix: '', answer: 'textbook allowance', acceptableAnswers: ['textbook allowance', 'Textbook allowance', 'TEXTBOOK ALLOWANCE', 'textbook'] },
      ],
      multiSelectOptions: [
        { letter: 'A', label: 'Medical Science' },
        { letter: 'B', label: 'Computing' },
        { letter: 'C', label: 'Mathematics' },
        { letter: 'D', label: 'Laboratory Techniques' },
        { letter: 'E', label: 'Statistics' },
        { letter: 'F', label: 'Medicine' },
        { letter: 'G', label: 'Environmental Science' }
      ]
    },
    // ============ SECTION 4: Questions 31-40 ============
    {
      id: 4,
      title: "Section 4",
      subtitle: "How to Choose Flooring Materials",
      instructions: "Questions 31-37: Complete the notes below. Write NO MORE THAN TWO WORDS for each answer.",
      context: {
        type: 'notes',
        formTitle: 'How to Choose Flooring Materials'
      },
      questions: [
        { id: 31, type: 'fill-blank', label: 'There are some man-made materials like', prefix: '', suffix: '', answer: 'plastic', acceptableAnswers: ['plastic', 'Plastic', 'PLASTIC', 'plastics'] },
        { id: 32, type: 'fill-blank', label: 'Before being used, material undergoes', prefix: '', suffix: '', answer: 'processing', acceptableAnswers: ['processing', 'Processing', 'PROCESSING'] },
        { id: 33, type: 'fill-blank', label: 'Wood should be cut and', prefix: '', suffix: '', answer: 'seasoned', acceptableAnswers: ['seasoned', 'Seasoned', 'SEASONED'] },
        { id: 34, type: 'fill-blank', label: 'Stone should be cut and', prefix: '', suffix: '', answer: 'polished', acceptableAnswers: ['polished', 'Polished', 'POLISHED'] },
        { id: 35, type: 'fill-blank', label: 'Aside from environmental factors, one should take __________ into account during construction', prefix: '', suffix: '', answer: 'cost', acceptableAnswers: ['cost', 'Cost', 'COST', 'costs'] },
        { id: 36, type: 'fill-blank', label: 'Some properties of materials affect mood, such as __________, texture, and colour', prefix: '', suffix: '', answer: 'grain patterns', acceptableAnswers: ['grain patterns', 'Grain patterns', 'GRAIN PATTERNS', 'grain pattern'] },
        { id: 37, type: 'fill-blank', label: 'Use a mathematical formula to choose the type of wood, because __________ are subjective', prefix: '', suffix: '', answer: 'words', acceptableAnswers: ['words', 'Words', 'WORDS'] },
        // Questions 38-40: Table completion (Reflectance Rate)
        { id: 38, type: 'fill-blank', label: 'White-painted plastic reflectance rate (approximately)', prefix: '', suffix: '', answer: '0.8', acceptableAnswers: ['0.8', '0.80', '.8', '80%'] },
        { id: 39, type: 'fill-blank', label: 'Quarry tile reflectance rate (approximately)', prefix: '', suffix: '', answer: '0.1', acceptableAnswers: ['0.1', '0.10', '.1', '10%'] },
        { id: 40, type: 'fill-blank', label: 'Material with reflectance rate almost 0.0', prefix: '', suffix: '', answer: 'black velvet', acceptableAnswers: ['black velvet', 'Black velvet', 'BLACK VELVET', 'Black Velvet'] },
      ],
      tableData: {
        title: 'Material Reflectance Rate',
        headers: ['Material', 'Reflectance Rate'],
        rows: [
          { material: 'Polished silver', rate: 'Almost 1.0' },
          { material: 'White-painted plastic', rate: 'Approximately ___' },
          { material: 'Quarry tile', rate: 'Approximately ___' },
          { material: '___', rate: 'Almost 0.0' }
        ]
      }
    }
  ]
};

const TrialListeningTest: React.FC = () => {
  const navigate = useNavigate();
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioLocked, setAudioLocked] = useState(false);
  const audioLockRef = useRef(false);

  // Stop background music
  useEffect(() => {
    stopBackgroundMusic();
    return () => {
      resumeBackgroundMusic();
      if (timerRef.current) clearInterval(timerRef.current);
      // Cleanup audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Initialize audio for current section
  useEffect(() => {
    if (hasStarted && !showResults) {
      const sectionId = currentSection + 1;
      const audioUrl = SECTION_AUDIO[sectionId as keyof typeof SECTION_AUDIO];
      
      // Cleanup previous audio
      if (audioRef.current) {
        audioLockRef.current = false;
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      setAudioLoading(true);
      setAudioError(null);
      setAudioProgress(0);
      setIsPlaying(false);
      setAudioLocked(false);
      audioLockRef.current = false;
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.addEventListener('loadedmetadata', () => {
        setAudioDuration(audio.duration);
        setAudioLoading(false);
      });
      
      audio.addEventListener('timeupdate', () => {
        setAudioProgress(audio.currentTime);
      });
      
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setAudioLocked(false);
        audioLockRef.current = false;
      });

      audio.addEventListener('pause', () => {
        if (audioLockRef.current && !audio.ended) {
          audio.play().catch(() => {
            setAudioError('Could not resume audio. Please refresh the page.');
          });
        }
      });
      
      audio.addEventListener('error', () => {
        setAudioError('Failed to load audio. Please check your connection.');
        setAudioLoading(false);
      });
      
      audio.load();
    }
    
    return () => {
      if (audioRef.current) {
        audioLockRef.current = false;
        audioRef.current.pause();
      }
    };
  }, [currentSection, hasStarted, showResults]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;

    if (audioLockRef.current) return;

    audioRef.current.play().then(() => {
      setIsPlaying(true);
      setAudioLocked(true);
      audioLockRef.current = true;
    }).catch(() => {
      setAudioError('Could not play audio. Please try again.');
      setIsPlaying(false);
      setAudioLocked(false);
      audioLockRef.current = false;
    });
  };

  const seekAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setAudioProgress(time);
  };

  const formatAudioTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Timer
  useEffect(() => {
    if (hasStarted && !showResults) {
      timerRef.current = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [hasStarted, showResults]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswerChange = (questionId: number, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const calculateScore = () => {
    let correct = 0;
    let results: { id: number; userAnswer: string; correctAnswer: string; isCorrect: boolean }[] = [];
    let totalQuestions = 0;

    TRIAL_TEST_DATA.sections.forEach(section => {
      section.questions.forEach(q => {
        totalQuestions++;
        const userAnswer = (answers[q.id] || '').trim();
        const isCorrect = q.acceptableAnswers.some(
          acceptable => acceptable.toLowerCase() === userAnswer.toLowerCase()
        );
        if (isCorrect) correct++;
        results.push({
          id: q.id,
          userAnswer: userAnswer || '(no answer)',
          correctAnswer: q.answer,
          isCorrect
        });
      });
    });

    return { correct, total: totalQuestions, percentage: Math.round((correct / totalQuestions) * 100), results };
  };

  const getBandScore = (percentage: number) => {
    if (percentage >= 90) return 9;
    if (percentage >= 80) return 8;
    if (percentage >= 70) return 7;
    if (percentage >= 60) return 6;
    if (percentage >= 50) return 5;
    if (percentage >= 40) return 4;
    if (percentage >= 30) return 3;
    return 2;
  };

  const getFeedback = (bandScore: number) => {
    if (bandScore >= 8) return { level: 'Excellent', message: 'Outstanding performance! You demonstrate near-native listening comprehension.' };
    if (bandScore >= 7) return { level: 'Very Good', message: 'Strong listening skills. You can understand complex ideas with good accuracy.' };
    if (bandScore >= 6) return { level: 'Good', message: 'Competent listener. You handle most situations well but may miss some details.' };
    if (bandScore >= 5) return { level: 'Moderate', message: 'Adequate skills for basic communication. Focus on improving vocabulary and speed.' };
    return { level: 'Developing', message: 'Keep practicing! Work on basic listening skills and common vocabulary.' };
  };

  const handleSubmit = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setShowResults(true);
  };

  const section = TRIAL_TEST_DATA.sections[currentSection];
  const answeredCount = Object.keys(answers).length;
  const totalQuestions = TRIAL_TEST_DATA.sections.reduce((sum, s) => sum + s.questions.length, 0);

  // Start Screen
  if (!hasStarted) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
        padding: 'clamp(1rem, 3vw, 2rem)',
        color: 'white'
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎧</div>
            <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              IELTS Listening Trial Test
            </h1>
            <p style={{ color: '#94a3b8', fontSize: 'clamp(0.875rem, 2.5vw, 1rem)' }}>
              Test your listening skills with this free practice test
            </p>
          </div>

          {/* Test Info Card */}
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '1rem',
            padding: 'clamp(1.5rem, 4vw, 2rem)',
            marginBottom: '1.5rem',
            backdropFilter: 'blur(10px)'
          }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', color: '#60a5fa' }}>Test Overview</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '1rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#22c55e' }}>4</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Sections</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '1rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>40</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Questions</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '1rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#8b5cf6' }}>FREE</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Trial Test</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '1rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ec4899' }}>~30</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Minutes</div>
              </div>
            </div>

            <div style={{ textAlign: 'left', fontSize: '0.875rem', color: '#cbd5e1' }}>
              <p style={{ marginBottom: '0.5rem' }}>📝 <strong>Section 1:</strong> Form completion (daily conversation)</p>
              <p style={{ marginBottom: '0.5rem' }}>📝 <strong>Section 2:</strong> Table completion + MCQ (conference)</p>
              <p style={{ marginBottom: '0.5rem' }}>📝 <strong>Section 3:</strong> Multiple choice (course details)</p>
              <p>📝 <strong>Section 4:</strong> Notes completion (flooring lecture)</p>
            </div>
          </div>

          {/* Audio Tip */}
          <div style={{
            background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
            borderRadius: '1rem',
            padding: '1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <span style={{ fontSize: '2rem' }}>🎧</span>
            <div style={{ textAlign: 'left', fontSize: '0.8rem' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Audio Included!</p>
              <p style={{ color: '#bae6fd' }}>Each section has real IELTS listening audio. Use headphones for best experience.</p>
            </div>
          </div>

          {/* What You'll Get */}
          <div style={{
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            borderRadius: '1rem',
            padding: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>✨ What You'll Receive</h3>
            <div style={{ fontSize: '0.875rem', textAlign: 'left' }}>
              <p style={{ marginBottom: '0.5rem' }}>✓ Your estimated band score</p>
              <p style={{ marginBottom: '0.5rem' }}>✓ Correct answers revealed</p>
              <p>✓ Brief performance feedback</p>
            </div>
          </div>

          {/* Prime Upsell */}
          <div style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
            borderRadius: '1rem',
            padding: '1rem',
            marginBottom: '2rem',
            fontSize: '0.8rem'
          }}>
            <p style={{ marginBottom: '0.5rem' }}>⭐ <strong>PRIME members</strong> get:</p>
            <p style={{ color: '#c4b5fd' }}>Detailed feedback, tips & tricks, audio transcripts, and personalized study plans</p>
          </div>

          {/* Start Button */}
          <button
            onClick={() => setHasStarted(true)}
            style={{
              width: '100%',
              padding: '1rem 2rem',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.75rem',
              fontSize: '1.125rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              marginBottom: '1rem'
            }}
          >
            Start Free Trial Test 🚀
          </button>

          <button
            onClick={() => navigate('/ielts')}
            style={{
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            ← Back to IELTS Home
          </button>
        </div>
      </div>
    );
  }

  // Results Screen
  if (showResults) {
    const { correct, total, percentage, results } = calculateScore();
    const bandScore = getBandScore(percentage);
    const feedback = getFeedback(bandScore);

    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        padding: 'clamp(1rem, 3vw, 2rem)'
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          {/* Score Header */}
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: 'clamp(1.5rem, 4vw, 2rem)',
            marginBottom: '1rem',
            textAlign: 'center',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
            <h1 style={{ fontSize: 'clamp(1.25rem, 4vw, 1.5rem)', color: '#1e293b', marginBottom: '0.5rem' }}>
              Test Complete!
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
              Time: {formatTime(timeElapsed)}
            </p>

            {/* Band Score */}
            <div style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              borderRadius: '1rem',
              padding: '1.5rem',
              margin: '1.5rem 0',
              color: 'white'
            }}>
              <div style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>Estimated Band Score</div>
              <div style={{ fontSize: '4rem', fontWeight: 'bold' }}>{bandScore}.0</div>
              <div style={{ fontSize: '1rem', color: '#93c5fd' }}>{feedback.level}</div>
            </div>

            {/* Score Breakdown */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.75rem',
              marginBottom: '1rem'
            }}>
              <div style={{ background: '#f0fdf4', borderRadius: '0.5rem', padding: '0.75rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#16a34a' }}>{correct}</div>
                <div style={{ fontSize: '0.7rem', color: '#15803d' }}>Correct</div>
              </div>
              <div style={{ background: '#fef2f2', borderRadius: '0.5rem', padding: '0.75rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#dc2626' }}>{total - correct}</div>
                <div style={{ fontSize: '0.7rem', color: '#b91c1c' }}>Incorrect</div>
              </div>
              <div style={{ background: '#eff6ff', borderRadius: '0.5rem', padding: '0.75rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>{percentage}%</div>
                <div style={{ fontSize: '0.7rem', color: '#1d4ed8' }}>Score</div>
              </div>
            </div>

            <p style={{ color: '#475569', fontSize: '0.875rem', lineHeight: 1.6 }}>
              {feedback.message}
            </p>
          </div>

          {/* Answers Review */}
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: 'clamp(1rem, 3vw, 1.5rem)',
            marginBottom: '1rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', marginBottom: '1rem' }}>
              📋 Answer Review
            </h2>
            
            {TRIAL_TEST_DATA.sections.map((section, sIdx) => (
              <div key={section.id} style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ 
                  fontSize: '0.875rem', 
                  color: '#3b82f6', 
                  marginBottom: '0.75rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid #e2e8f0'
                }}>
                  {section.title}: {section.subtitle}
                </h3>
                
                {section.questions.map(q => {
                  const result = results.find(r => r.id === q.id);
                  return (
                    <div 
                      key={q.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        background: result?.isCorrect ? '#f0fdf4' : '#fef2f2',
                        borderRadius: '0.5rem',
                        marginBottom: '0.5rem',
                        fontSize: '0.8rem'
                      }}
                    >
                      <span style={{ 
                        fontSize: '1rem',
                        flexShrink: 0
                      }}>
                        {result?.isCorrect ? '✅' : '❌'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#374151', marginBottom: '0.25rem' }}>
                          <strong>Q{q.id}:</strong> {q.type === 'mcq' ? (q as any).question : (q as any).label || 'Fill in the blank'}
                        </div>
                        <div style={{ color: result?.isCorrect ? '#15803d' : '#dc2626' }}>
                          Your answer: <strong>{result?.userAnswer}</strong>
                        </div>
                        {!result?.isCorrect && (
                          <div style={{ color: '#16a34a' }}>
                            Correct: <strong>{result?.correctAnswer}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Prime Upsell */}
          <div style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
            borderRadius: '1rem',
            padding: 'clamp(1.25rem, 3vw, 1.5rem)',
            marginBottom: '1rem',
            color: 'white',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⭐</div>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Want Detailed Feedback?</h3>
            <p style={{ fontSize: '0.8rem', color: '#c4b5fd', marginBottom: '1rem' }}>
              Get personalized tips, audio transcripts, vocabulary lists, and a study plan tailored to your weaknesses.
            </p>
            <button
              onClick={() => navigate('/ielts/apply-prime')}
              style={{
                padding: '0.75rem 2rem',
                background: 'white',
                color: '#7c3aed',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Upgrade to Prime
            </button>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={() => {
                setAnswers({});
                setCurrentSection(0);
                setTimeElapsed(0);
                setShowResults(false);
              }}
              style={{
                padding: '0.875rem',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              🔄 Try Again
            </button>
            <button
              onClick={() => navigate('/ielts')}
              style={{
                padding: '0.875rem',
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              ← Back to IELTS Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Test Screen
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      paddingBottom: '6rem' // Space for fixed bottom bar
    }}>
      {/* Header */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: 'clamp(0.75rem, 2vw, 1rem)',
        zIndex: 100
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1rem)', fontWeight: '600', color: '#1e293b' }}>
              {section.title}: {section.subtitle}
            </div>
            <div style={{ 
              background: '#3b82f6', 
              color: 'white', 
              padding: '0.25rem 0.75rem', 
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: '600'
            }}>
              ⏱️ {formatTime(timeElapsed)}
            </div>
          </div>
          
          {/* Section Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
            {TRIAL_TEST_DATA.sections.map((s, idx) => {
              const sectionAnswered = s.questions.filter(q => answers[q.id]).length;
              const sectionTotal = s.questions.length;
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentSection(idx)}
                  style={{
                    padding: '0.375rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                    background: currentSection === idx ? '#3b82f6' : '#f1f5f9',
                    color: currentSection === idx ? 'white' : '#475569'
                  }}
                >
                  S{idx + 1} ({sectionAnswered}/{sectionTotal})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Audio Player */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
        padding: '0.75rem 1rem',
        zIndex: 99,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          {audioLoading ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem', padding: '0.5rem' }}>
              🔄 Loading audio...
            </div>
          ) : audioError ? (
            <div style={{ textAlign: 'center', color: '#fca5a5', fontSize: '0.875rem', padding: '0.5rem' }}>
              ⚠️ {audioError}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {/* Play/Pause Button */}
              <button
                onClick={togglePlayPause}
                disabled={audioLocked}
                style={{
                  width: '3rem',
                  height: '3rem',
                  borderRadius: '50%',
                  background: isPlaying ? '#ef4444' : '#22c55e',
                  color: 'white',
                  border: 'none',
                  cursor: audioLocked ? 'not-allowed' : 'pointer',
                  fontSize: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'transform 0.1s',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  opacity: audioLocked ? 0.8 : 1
                }}
              >
                {audioLocked ? '🔒' : '▶️'}
              </button>
              
              {/* Progress Bar */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <input
                  type="range"
                  min="0"
                  max={audioDuration || 100}
                  value={audioProgress}
                  onChange={seekAudio}
                  disabled={audioLocked}
                  style={{
                    width: '100%',
                    height: '6px',
                    borderRadius: '3px',
                    background: `linear-gradient(to right, #3b82f6 ${(audioProgress / (audioDuration || 1)) * 100}%, #475569 ${(audioProgress / (audioDuration || 1)) * 100}%)`,
                    cursor: audioLocked ? 'not-allowed' : 'pointer',
                    appearance: 'none',
                    WebkitAppearance: 'none'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
                  <span>{formatAudioTime(audioProgress)}</span>
                  <span>{formatAudioTime(audioDuration)}</span>
                </div>
              </div>
              
              {/* Section Label */}
              <div style={{ 
                background: '#3b82f6', 
                color: 'white', 
                padding: '0.25rem 0.5rem', 
                borderRadius: '0.25rem',
                fontSize: '0.7rem',
                fontWeight: 'bold',
                whiteSpace: 'nowrap'
              }}>
                🎧 S{currentSection + 1}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Question Content */}
      <div style={{ padding: 'clamp(1rem, 3vw, 1.5rem)', maxWidth: '600px', margin: '0 auto' }}>
        {/* Instructions */}
        <div style={{
          background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
          border: '1px solid #93c5fd',
          borderRadius: '0.75rem',
          padding: '1rem',
          marginBottom: '1rem'
        }}>
          <p style={{ fontSize: '0.8rem', color: '#1e40af', margin: 0 }}>
            📝 {section.instructions}
          </p>
        </div>

        {/* Form Context (for Section 1 style) */}
        {section.context.type === 'form' && (
          <>
            {/* Questions 1-6: Fill-in-the-blank form */}
            <div style={{
              background: 'white',
              borderRadius: '0.75rem',
              padding: '1rem',
              marginBottom: '1rem',
              border: '2px solid #e2e8f0'
            }}>
              <h3 style={{ 
                fontSize: '1rem', 
                color: '#1e293b', 
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #3b82f6'
              }}>
                📋 {section.context.formTitle}
              </h3>
              
              <div style={{ 
                background: '#dbeafe', 
                padding: '0.5rem 0.75rem', 
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                fontSize: '0.75rem',
                color: '#1e40af'
              }}>
                <strong>Questions 1–6:</strong> Complete the form below
              </div>
              
              {section.context.example && (
                <div style={{ 
                  background: '#f0fdf4', 
                  padding: '0.75rem', 
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  fontSize: '0.85rem'
                }}>
                  <span style={{ color: '#6b7280' }}>Example - {section.context.example.label}: </span>
                  <strong style={{ color: '#16a34a' }}>{section.context.example.value}</strong>
                </div>
              )}

              {section.questions.filter(q => q.type === 'fill-blank').map(q => (
                <div key={q.id} style={{ marginBottom: '1rem' }}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.8rem', 
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    <span style={{ 
                      background: '#3b82f6', 
                      color: 'white', 
                      padding: '0.125rem 0.5rem', 
                      borderRadius: '0.25rem',
                      marginRight: '0.5rem',
                      fontSize: '0.75rem'
                    }}>
                      {q.id}
                    </span>
                    {(q as any).label}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(q as any).prefix && <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{(q as any).prefix}</span>}
                    <input
                      type="text"
                      value={answers[q.id] || ''}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      placeholder="Type your answer"
                      style={{
                        flex: 1,
                        minWidth: '150px',
                        padding: '0.625rem 0.875rem',
                        border: '2px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '0.9rem',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                      onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                    />
                    {(q as any).suffix && <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{(q as any).suffix}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Questions 7-10: Matching */}
            {section.matchingOptions && section.questions.some(q => q.type === 'matching') && (
              <div style={{
                background: 'white',
                borderRadius: '0.75rem',
                padding: '1rem',
                marginBottom: '1rem',
                border: '2px solid #e2e8f0'
              }}>
                <div style={{ 
                  background: '#fef3c7', 
                  padding: '0.5rem 0.75rem', 
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  fontSize: '0.75rem',
                  color: '#92400e'
                }}>
                  <strong>Questions 7–10:</strong> Where does the speaker decide to put items in?
                  <br />Write the correct letter, A, B, or C
                </div>
                
                {/* Options Legend */}
                <div style={{
                  display: 'grid',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                  background: '#f8fafc',
                  padding: '0.75rem',
                  borderRadius: '0.5rem'
                }}>
                  {section.matchingOptions.map((opt: any) => (
                    <div key={opt.letter} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      fontSize: '0.85rem'
                    }}>
                      <span style={{
                        background: '#f59e0b',
                        color: 'white',
                        width: '1.5rem',
                        height: '1.5rem',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '0.75rem'
                      }}>
                        {opt.letter}
                      </span>
                      <span style={{ color: '#374151' }}>{opt.label}</span>
                    </div>
                  ))}
                </div>

                {/* Matching Items */}
                <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.75rem' }}>
                  Items:
                </div>
                
                {section.questions.filter(q => q.type === 'matching').map(q => (
                  <div key={q.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.75rem',
                    marginBottom: '0.75rem',
                    padding: '0.75rem',
                    background: '#fefce8',
                    borderRadius: '0.5rem'
                  }}>
                    <span style={{ 
                      background: '#f59e0b', 
                      color: 'white', 
                      padding: '0.125rem 0.5rem', 
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: 'bold'
                    }}>
                      {q.id}
                    </span>
                    <span style={{ flex: 1, color: '#374151', fontSize: '0.875rem' }}>{q.label}</span>
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      {['A', 'B', 'C'].map(letter => (
                        <button
                          key={letter}
                          onClick={() => handleAnswerChange(q.id, letter)}
                          style={{
                            width: '2.25rem',
                            height: '2.25rem',
                            borderRadius: '50%',
                            border: `2px solid ${answers[q.id] === letter ? '#f59e0b' : '#d1d5db'}`,
                            background: answers[q.id] === letter ? '#fef3c7' : 'white',
                            color: answers[q.id] === letter ? '#92400e' : '#6b7280',
                            fontWeight: 'bold',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {letter}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Notes style (Sections 2 & 4) */}
        {section.context.type === 'notes' && (
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1rem',
            border: '2px solid #e2e8f0'
          }}>
            <h3 style={{ 
              fontSize: '1rem', 
              color: '#1e293b', 
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #f59e0b'
            }}>
              📝 {section.context.formTitle}
            </h3>

            {section.questions.map(q => (
              <div key={q.id} style={{ marginBottom: '1rem' }}>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.8rem', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ 
                    background: '#f59e0b', 
                    color: 'white', 
                    padding: '0.125rem 0.5rem', 
                    borderRadius: '0.25rem',
                    marginRight: '0.5rem',
                    fontSize: '0.75rem'
                  }}>
                    {q.id}
                  </span>
                  {(q as any).label}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {(q as any).prefix && <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{(q as any).prefix}</span>}
                  <input
                    type="text"
                    value={answers[q.id] || ''}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    placeholder="Type your answer"
                    style={{
                      flex: 1,
                      minWidth: '150px',
                      padding: '0.625rem 0.875rem',
                      border: '2px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                  />
                  {(q as any).suffix && <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{(q as any).suffix}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Table style (Section 2) */}
        {section.context.type === 'table' && (
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1rem',
            border: '2px solid #e2e8f0'
          }}>
            <h3 style={{ 
              fontSize: '1rem', 
              color: '#1e293b', 
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #10b981'
            }}>
              📅 {section.context.formTitle}
            </h3>

            {/* Fill-blank questions */}
            {section.questions.filter(q => q.type === 'fill-blank').map(q => (
              <div key={q.id} style={{ marginBottom: '1rem' }}>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.8rem', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ 
                    background: '#10b981', 
                    color: 'white', 
                    padding: '0.125rem 0.5rem', 
                    borderRadius: '0.25rem',
                    marginRight: '0.5rem',
                    fontSize: '0.75rem'
                  }}>
                    {q.id}
                  </span>
                  {(q as any).label}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {(q as any).prefix && <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{(q as any).prefix}</span>}
                  <input
                    type="text"
                    value={answers[q.id] || ''}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    placeholder="Type your answer"
                    style={{
                      flex: 1,
                      minWidth: '150px',
                      padding: '0.625rem 0.875rem',
                      border: '2px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#10b981'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                  />
                  {(q as any).suffix && <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{(q as any).suffix}</span>}
                </div>
              </div>
            ))}

            {/* MCQ questions in Section 2 */}
            {section.questions.filter(q => q.type === 'mcq').length > 0 && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px dashed #e2e8f0' }}>
                <div style={{ 
                  background: '#ecfdf5', 
                  padding: '0.5rem 0.75rem', 
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  fontSize: '0.75rem',
                  color: '#065f46'
                }}>
                  <strong>Questions {section.questions.filter(q => q.type === 'mcq')[0]?.id}–{section.questions.filter(q => q.type === 'mcq').slice(-1)[0]?.id}:</strong> Choose the correct letter, A, B, or C
                </div>
                
                {section.questions.filter(q => q.type === 'mcq').map(q => {
                  const mcqQ = q as typeof q & { question: string; options: string[] };
                  return (
                    <div key={q.id} style={{ marginBottom: '1.25rem' }}>
                      <div style={{ 
                        fontSize: '0.85rem', 
                        color: '#1e293b',
                        marginBottom: '0.5rem'
                      }}>
                        <span style={{ 
                          background: '#10b981', 
                          color: 'white', 
                          padding: '0.125rem 0.5rem', 
                          borderRadius: '0.25rem',
                          marginRight: '0.5rem',
                          fontSize: '0.75rem'
                        }}>
                          {q.id}
                        </span>
                        {mcqQ.question}
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        {mcqQ.options.map((option, oIdx) => {
                          const optionLetter = option.charAt(0);
                          const isSelected = answers[q.id] === optionLetter;
                          return (
                            <button
                              key={oIdx}
                              onClick={() => handleAnswerChange(q.id, optionLetter)}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '0.625rem 0.875rem',
                                border: `2px solid ${isSelected ? '#10b981' : '#e2e8f0'}`,
                                borderRadius: '0.5rem',
                                background: isSelected ? '#ecfdf5' : 'white',
                                color: isSelected ? '#065f46' : '#374151',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                transition: 'all 0.2s'
                              }}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MCQ style (Section 3) - handles MCQ, multi-select, and fill-blank */}
        {section.context.type === 'mcq' && (
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1rem',
            border: '2px solid #e2e8f0'
          }}>
            <h3 style={{ 
              fontSize: '1rem', 
              color: '#1e293b', 
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #8b5cf6'
            }}>
              🎓 {section.context.formTitle}
            </h3>

            {/* Regular MCQ questions */}
            {section.questions.filter(q => q.type === 'mcq').map(q => {
              const mcqQ = q as typeof q & { question: string; options: string[] };
              return (
                <div key={q.id} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ 
                    fontSize: '0.875rem', 
                    color: '#1e293b',
                    marginBottom: '0.75rem'
                  }}>
                    <span style={{ 
                      background: '#8b5cf6', 
                      color: 'white', 
                      padding: '0.125rem 0.5rem', 
                      borderRadius: '0.25rem',
                      marginRight: '0.5rem',
                      fontSize: '0.75rem'
                    }}>
                      {q.id}
                    </span>
                    {mcqQ.question}
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {mcqQ.options.map((option, oIdx) => {
                      const optionLetter = option.charAt(0);
                      const isSelected = answers[q.id] === optionLetter;
                      return (
                        <button
                          key={oIdx}
                          onClick={() => handleAnswerChange(q.id, optionLetter)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '0.75rem 1rem',
                            border: `2px solid ${isSelected ? '#8b5cf6' : '#e2e8f0'}`,
                            borderRadius: '0.5rem',
                            background: isSelected ? '#f5f3ff' : 'white',
                            color: isSelected ? '#5b21b6' : '#374151',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            transition: 'all 0.2s'
                          }}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Multi-select questions (Q27-29) */}
            {section.questions.filter(q => q.type === 'multi-select').length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #e2e8f0' }}>
                <div style={{ 
                  background: '#faf5ff', 
                  padding: '0.75rem', 
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  fontSize: '0.8rem',
                  color: '#6b21a8'
                }}>
                  <strong>Questions 27–29:</strong> Which THREE compulsory courses must be taken?
                  <br /><span style={{ fontSize: '0.75rem' }}>Choose THREE letters, A-G (one per question)</span>
                </div>
                
                {/* Options Legend */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                  background: '#f8fafc',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.8rem'
                }}>
                  {(section as any).multiSelectOptions?.map((opt: any) => (
                    <div key={opt.letter} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span style={{
                        background: '#8b5cf6',
                        color: 'white',
                        width: '1.25rem',
                        height: '1.25rem',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '0.65rem'
                      }}>
                        {opt.letter}
                      </span>
                      <span style={{ color: '#374151' }}>{opt.label}</span>
                    </div>
                  ))}
                </div>

                {section.questions.filter(q => q.type === 'multi-select').map(q => (
                  <div key={q.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.75rem',
                    marginBottom: '0.75rem',
                    padding: '0.75rem',
                    background: '#faf5ff',
                    borderRadius: '0.5rem'
                  }}>
                    <span style={{ 
                      background: '#8b5cf6', 
                      color: 'white', 
                      padding: '0.125rem 0.5rem', 
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: 'bold'
                    }}>
                      {q.id}
                    </span>
                    <span style={{ flex: 1, color: '#374151', fontSize: '0.85rem' }}>{(q as any).label}</span>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(letter => (
                        <button
                          key={letter}
                          onClick={() => handleAnswerChange(q.id, letter)}
                          style={{
                            width: '2rem',
                            height: '2rem',
                            borderRadius: '50%',
                            border: `2px solid ${answers[q.id] === letter ? '#8b5cf6' : '#d1d5db'}`,
                            background: answers[q.id] === letter ? '#f5f3ff' : 'white',
                            color: answers[q.id] === letter ? '#5b21b6' : '#6b7280',
                            fontWeight: 'bold',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {letter}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Fill-blank question (Q30) */}
            {section.questions.filter(q => q.type === 'fill-blank').length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #e2e8f0' }}>
                <div style={{ 
                  background: '#faf5ff', 
                  padding: '0.5rem 0.75rem', 
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  fontSize: '0.75rem',
                  color: '#6b21a8'
                }}>
                  <strong>Question 30:</strong> Complete the sentence. Write NO MORE THAN TWO WORDS.
                </div>
                
                {section.questions.filter(q => q.type === 'fill-blank').map(q => (
                  <div key={q.id} style={{ marginBottom: '1rem' }}>
                    <label style={{ 
                      display: 'block', 
                      fontSize: '0.85rem', 
                      color: '#374151',
                      marginBottom: '0.5rem'
                    }}>
                      <span style={{ 
                        background: '#8b5cf6', 
                        color: 'white', 
                        padding: '0.125rem 0.5rem', 
                        borderRadius: '0.25rem',
                        marginRight: '0.5rem',
                        fontSize: '0.75rem'
                      }}>
                        {q.id}
                      </span>
                      {(q as any).label}
                    </label>
                    <input
                      type="text"
                      value={answers[q.id] || ''}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      placeholder="Type your answer"
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.875rem',
                        border: '2px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '0.9rem',
                        outline: 'none'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                      onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fixed Bottom Navigation */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'white',
        borderTop: '1px solid #e2e8f0',
        padding: '1rem',
        zIndex: 100
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => setCurrentSection(prev => Math.max(0, prev - 1))}
              disabled={currentSection === 0}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: currentSection === 0 ? '#f1f5f9' : '#e2e8f0',
                color: currentSection === 0 ? '#9ca3af' : '#475569',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: currentSection === 0 ? 'not-allowed' : 'pointer',
                fontWeight: '500',
                fontSize: '0.9rem'
              }}
            >
              ← Previous
            </button>

            {currentSection < TRIAL_TEST_DATA.sections.length - 1 ? (
              <button
                onClick={() => setCurrentSection(prev => prev + 1)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '0.9rem'
                }}
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.9rem'
                }}
              >
                Submit Test ✓
              </button>
            )}
          </div>
          
          <div style={{ 
            textAlign: 'center', 
            marginTop: '0.5rem', 
            fontSize: '0.75rem', 
            color: '#64748b' 
          }}>
            Answered: {answeredCount}/{totalQuestions} questions
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrialListeningTest;
