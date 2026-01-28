/**
 * ============================================================
 * LEVEL-BASED UNLOCKING - FRONTEND INTEGRATION GUIDE
 * ============================================================
 * 
 * This guide shows how to integrate the level-based question
 * unlocking system into your React/TypeScript frontend.
 */

// ============================================================
// STEP 1: Add new types to types.ts
// ============================================================

export interface PlayerUnlockStatus {
  player_level: number;
  max_tier: number;
  easy_unlocked: boolean;
  medium_unlocked: boolean;
  hard_unlocked: boolean;
}

export interface QuestionCount {
  total_questions: number;
  rewarded_questions: number;
  new_questions_left: number;
}

// Update existing DifficultyProgress type to use real data
export interface DifficultyProgress {
  total: number;                // total unlocked questions
  completed: number;            // legacy - can be removed
  answeredWithRewards: number;  // questions already rewarded
  newLeft: number;              // questions still giving rewards
}

// ============================================================
// STEP 2: Add RPC calls to gameService.ts
// ============================================================

/**
 * Get player's unlock status (what tiers and difficulties are available)
 */
export const getPlayerUnlockStatus = async (): Promise<PlayerUnlockStatus> => {
  const { data, error } = await supabase.rpc('get_player_unlock_status');
  
  if (error) {
    console.error('Error fetching unlock status:', error);
    throw error;
  }
  
  return data[0];
};

/**
 * Count available questions for a subject and difficulty
 */
export const countUnlockedQuestions = async (
  subject: string,
  difficulty: 'easy' | 'medium' | 'hard'
): Promise<QuestionCount> => {
  const { data, error } = await supabase.rpc('count_unlocked_questions', {
    p_subject: subject,
    p_difficulty: difficulty === 'medium' ? 'med' : difficulty
  });
  
  if (error) {
    console.error('Error counting questions:', error);
    throw error;
  }
  
  return data[0];
};

/**
 * Fetch unlocked, unrewarded MCQ questions (Practice Mode)
 */
export const getUnlockedMcqQuestions = async (
  subject: string,
  difficulty: 'easy' | 'medium' | 'hard',
  limit: number = 5
): Promise<Question[]> => {
  const { data, error } = await supabase.rpc('get_unlocked_mcq_questions', {
    p_subject: subject,
    p_difficulty: difficulty === 'medium' ? 'med' : difficulty,
    p_limit: limit
  });
  
  if (error) {
    console.error('Error fetching unlocked questions:', error);
    throw error;
  }
  
  if (!data || data.length === 0) {
    console.log(`📚 No new rewardable questions for ${subject} (${difficulty})`);
  }
  
  // Transform to match your Question type
  return data.map((q: any) => ({
    id: q.id.toString(),
    body: q.stem,
    options: [q.opt1, q.opt2, q.opt3, q.opt4],
    correct_answer: q.correct.toString(),
    reward_xp: q.reward_xp,
    reward_coins: q.reward_coins,
    difficulty: q.difficulty,
    subject: q.subject
  }));
};

/**
 * Fetch unlocked, unrewarded teacher questions
 */
export const getUnlockedTeacherQuestions = async (
  subject: string,
  difficulty: 'easy' | 'medium' | 'hard',
  limit: number = 5
): Promise<TeacherQuestion[]> => {
  const { data, error } = await supabase.rpc('get_unlocked_teacher_questions', {
    p_subject: subject,
    p_difficulty: difficulty === 'medium' ? 'med' : difficulty,
    p_limit: limit
  });
  
  if (error) {
    console.error('Error fetching unlocked teacher questions:', error);
    throw error;
  }
  
  if (!data || data.length === 0) {
    console.log(`📚 No new rewardable teacher questions for ${subject} (${difficulty})`);
  }
  
  return data as TeacherQuestion[];
};

/**
 * Record an MCQ attempt with proper reward tracking
 */
export const recordMcqAttempt = async (
  questionId: number,
  isCorrect: boolean
): Promise<{ shouldGrantReward: boolean; message: string }> => {
  const { data, error } = await supabase.rpc('record_mcq_attempt', {
    p_question_id: questionId,
    p_is_correct: isCorrect
  });
  
  if (error) {
    console.error('Error recording attempt:', error);
    throw error;
  }
  
  return {
    shouldGrantReward: data[0].should_grant_reward,
    message: data[0].message
  };
};

// ============================================================
// STEP 3: Update QuestView.tsx to use new RPCs
// ============================================================

/**
 * In QuestView.tsx, update the loadSubjects function:
 */

const loadSubjects = async () => {
  if (activeAssignment) {
    setMode('assignment');
    setStage('assignment_blocked');
    return;
  }

  setStage('loading');
  
  try {
    // Get unlock status first
    const unlockStatus = await GameService.getPlayerUnlockStatus();
    console.log('🔓 Unlock status:', unlockStatus);
    
    // Load subjects
    const data = await GameService.mcq_subjects_list();
    setSubjects(data);
    
    // Load REAL progress data for each subject and difficulty
    const progressPromises = data.map(async (subject) => {
      const [easyCount, mediumCount, hardCount] = await Promise.all([
        unlockStatus.easy_unlocked 
          ? GameService.countUnlockedQuestions(subject.name, 'easy')
          : Promise.resolve({ total_questions: 0, rewarded_questions: 0, new_questions_left: 0 }),
        unlockStatus.medium_unlocked
          ? GameService.countUnlockedQuestions(subject.name, 'medium')
          : Promise.resolve({ total_questions: 0, rewarded_questions: 0, new_questions_left: 0 }),
        unlockStatus.hard_unlocked
          ? GameService.countUnlockedQuestions(subject.name, 'hard')
          : Promise.resolve({ total_questions: 0, rewarded_questions: 0, new_questions_left: 0 })
      ]);
      
      return {
        id: subject.id,
        name: subject.name,
        easy: {
          total: easyCount.total_questions,
          completed: easyCount.rewarded_questions, // Legacy
          answeredWithRewards: easyCount.rewarded_questions,
          newLeft: easyCount.new_questions_left
        },
        medium: {
          total: mediumCount.total_questions,
          completed: mediumCount.rewarded_questions,
          answeredWithRewards: mediumCount.rewarded_questions,
          newLeft: mediumCount.new_questions_left
        },
        hard: {
          total: hardCount.total_questions,
          completed: hardCount.rewarded_questions,
          answeredWithRewards: hardCount.rewarded_questions,
          newLeft: hardCount.new_questions_left
        }
      };
    });
    
    const realProgress = await Promise.all(progressPromises);
    setSubjectProgress(realProgress);
    setStage('subject_selection');
  } catch (error) {
    console.error('Error loading subjects:', error);
    setStage('subject_selection');
  }
};

/**
 * Update handleDifficultySelect to use new RPC:
 */

const handleDifficultySelect = async (difficulty: SoloDifficulty) => {
  if (!selectedSubject) return;
  
  setMode('practice');
  setSelectedDifficulty(difficulty);
  setStage('loading');
  setQuestionScores([]);
  setQuestionPerformances([]);
  setSoloStreak(0);
  setMissionSummary(null);
  setTopicSummary(null);
  setQuestionStartTime(null);
  
  try {
    // Use new RPC that respects tier unlocking
    const questions = await GameService.getUnlockedMcqQuestions(
      selectedSubject.name,
      difficulty,
      5
    );
    
    if (questions.length === 0) {
      // No rewardable questions left
      alert(
        `You've already earned rewards from all unlocked ${difficulty} questions in ${selectedSubject.name}!\\n\\n` +
        `Level up to unlock more tiers, or practice without rewards.`
      );
      setStage('unified_subject_play');
      return;
    }
    
    setQuestions(questions);
    setCurrentQuestionIndex(0);
    setScore({ correct: 0, xp: 0, coins: 0, gemstones: 0 });
    setSelectedOption(null);
    setAnswerResponse(null);
    setStage('in_progress');
    setQuestionStartTime(Date.now());
  } catch (error) {
    console.error('Error loading questions:', error);
    alert('Failed to load questions');
    setStage('unified_subject_play');
  }
};

/**
 * Update handleQuestSelect to use teacher questions RPC:
 */

const handleQuestSelect = async (questId: string) => {
  if (!selectedSubject) return;
  
  setMode('teacher');
  setStage('loading');
  setQuestionScores([]);
  setQuestionPerformances([]);
  setSoloStreak(0);
  setMissionSummary(null);
  setTopicSummary(null);
  setQuestionStartTime(null);
  
  try {
    // Determine difficulty from questId or use a default
    const difficulty = 'easy'; // Or parse from questId
    
    const questions = await GameService.getUnlockedTeacherQuestions(
      selectedSubject.name,
      difficulty,
      5
    );
    
    if (questions.length === 0) {
      alert('No new rewardable questions in this quest!');
      setStage('unified_subject_play');
      return;
    }
    
    setTeacherQuestions(questions);
    setCurrentQuestionIndex(0);
    setScore({ correct: 0, xp: 0, coins: 0, gemstones: 0 });
    setSelectedOption(null);
    setAnswerResponse(null);
    setStage('in_progress');
    setQuestionStartTime(Date.now());
  } catch (err) {
    console.error('Error loading teacher questions:', err);
    alert('Failed to load teacher questions');
    setStage('unified_subject_play');
  }
};

// ============================================================
// STEP 4: Update finalizeMcqAnswer in gameService.ts
// ============================================================

/**
 * Update the finalizeMcqAnswer function to use the new
 * record_mcq_attempt RPC for proper reward tracking
 */

export const finalizeMcqAnswer = async (
  userId: string,
  questionId: string,
  isCorrect: boolean,
  // ... other params
): Promise<AnswerResponse> => {
  try {
    // Record attempt and check if should grant reward
    const attemptResult = await recordMcqAttempt(
      parseInt(questionId),
      isCorrect
    );
    
    console.log('📝 Attempt recorded:', attemptResult.message);
    
    let xpDelta = 0;
    let coinDelta = 0;
    
    if (isCorrect && attemptResult.shouldGrantReward) {
      // Grant full rewards
      xpDelta = rewardXp;
      coinDelta = rewardCoins;
      
      // Update user profile with rewards
      await updateProfile(userId, {
        xp_delta: xpDelta,
        coin_delta: coinDelta,
        // ... other updates
      });
      
      console.log('✅ Correct! Rewards granted:', { xpDelta, coinDelta });
    } else if (isCorrect && !attemptResult.shouldGrantReward) {
      // Correct but already rewarded
      console.log('⚠️ Correct, but already rewarded for this question');
    }
    
    return {
      correct: isCorrect,
      xp_delta: xpDelta,
      coin_delta: coinDelta,
      message: attemptResult.message,
      // ... other fields
    };
  } catch (error) {
    console.error('Error finalizing answer:', error);
    throw error;
  }
};

// ============================================================
// STEP 5: Update UI to show locked difficulties
// ============================================================

/**
 * In UnifiedSubjectPlay.tsx, show lock icons for locked difficulties:
 */

const UnifiedSubjectPlay: React.FC<UnifiedSubjectPlayProps> = ({
  subject,
  // ...
}) => {
  const [unlockStatus, setUnlockStatus] = useState<PlayerUnlockStatus | null>(null);
  
  useEffect(() => {
    GameService.getPlayerUnlockStatus().then(setUnlockStatus);
  }, []);
  
  // Check if difficulties are locked
  const easyLocked = !unlockStatus?.easy_unlocked;
  const mediumLocked = !unlockStatus?.medium_unlocked;
  const hardLocked = !unlockStatus?.hard_unlocked;
  
  return (
    <div>
      {/* ... */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <DifficultyCard
          level="easy"
          progress={easyProgress}
          isRecommended={recommended === 'easy'}
          isLocked={easyLocked}
          onStart={() => onSelectDifficulty('easy')}
        />
        <DifficultyCard
          level="medium"
          progress={mediumProgress}
          isRecommended={recommended === 'medium'}
          isLocked={mediumLocked}
          requiredLevel={3}
          onStart={() => onSelectDifficulty('medium')}
        />
        <DifficultyCard
          level="hard"
          progress={hardProgress}
          isRecommended={recommended === 'hard'}
          isLocked={hardLocked}
          requiredLevel={6}
          onStart={() => onSelectDifficulty('hard')}
        />
      </div>
    </div>
  );
};

/**
 * Update DifficultyCard to show lock state:
 */

interface DifficultyCardProps {
  // ... existing props
  isLocked?: boolean;
  requiredLevel?: number;
}

const DifficultyCard: React.FC<DifficultyCardProps> = ({
  level,
  progress,
  isLocked,
  requiredLevel,
  // ...
}) => {
  if (isLocked) {
    return (
      <div className="relative p-6 rounded-2xl border-2 border-slate-700 bg-slate-800/40 opacity-60">
        <div className="absolute -top-3 -right-3 px-3 py-1 bg-red-600/90 rounded-full text-white text-xs font-bold border border-red-400">
          🔒 Locked
        </div>
        
        <h3 className="text-2xl font-bold text-gray-500 mb-2">
          {level.charAt(0).toUpperCase() + level.slice(1)}
        </h3>
        
        <p className="text-gray-400 text-center mt-4">
          Unlocks at level {requiredLevel}
        </p>
      </div>
    );
  }
  
  // ... render normal card
};

// ============================================================
// SUMMARY OF CHANGES
// ============================================================

/**
 * 1. Replace mock progress data with real API calls to count_unlocked_questions
 * 2. Replace mcq_questions_get with get_unlocked_mcq_questions
 * 3. Replace get_public_questions with get_unlocked_teacher_questions
 * 4. Use record_mcq_attempt RPC to properly track rewards
 * 5. Show locked difficulties with required levels
 * 6. Display "no rewardable questions" message when appropriate
 * 
 * The system now respects:
 * - Player level → determines max tier
 * - Difficulty locks (easy: 1+, medium: 3+, hard: 6+)
 * - One reward per question per player
 * - Progressive unlocking as player levels up
 */
