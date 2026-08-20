import { generateMonthlyComparison, generateWeeklyImprovementPlan, storeAttemptInErrorMemory, assessWritingExam, createEmptyErrorMemory, formatMonthlyGrowthReport, } from './writingAssessment.js';
import { generateDailyWritingTasksForWeek } from './writingTaskGenerator.js';
import { evaluateWritingPracticeTask } from './writingPracticeEvaluator.js';
export const createInitialStudentWritingState = (studentId, grade, genre, memory = createEmptyErrorMemory()) => ({
    student_id: studentId,
    grade,
    current_genre: genre,
    latest_assessment: null,
    repeated_error_memory: memory,
    active_week_plan: null,
    active_daily_tasks: [],
    completed_daily_tasks: [],
    adaptation_trend: {
        success_streak: 0,
        failure_streak: 0,
        last_recommended_action: 'move_forward',
    },
    monthly_history: [],
    current_difficulty_state: 'baseline',
    last_monthly_review_at: null,
});
export const runInitialWritingAssessmentFlow = (input) => {
    const state = input.current_state ??
        createInitialStudentWritingState(input.student_id, input.grade, input.genre, createEmptyErrorMemory());
    const assessment = input.assessment_result ?? assessWritingExam({
        promptText: input.prompt_text,
        grade: input.grade,
        genre: input.genre,
        targetWordCount: input.target_word_count,
        studentResponse: input.student_response,
    });
    const attemptedAt = input.attempted_at ?? new Date().toISOString();
    const memory = storeAttemptInErrorMemory(state.repeated_error_memory, input.student_id, assessment, attemptedAt);
    const weeklyPlan = generateWeeklyImprovementPlan({
        assessment,
        grade: input.grade,
        genre: input.genre,
        repeatedErrorMemory: memory,
        studentId: input.student_id,
    });
    const dailyTasks = generateDailyWritingTasksForWeek({
        weekly_plan: weeklyPlan,
        latest_assessment: assessment,
        grade: input.grade,
        target_genre: input.genre,
        repeated_error_memory: memory,
        student_id: input.student_id,
    });
    const month = attemptedAt.slice(0, 7);
    const updatedState = {
        ...state,
        student_id: input.student_id,
        grade: input.grade,
        current_genre: input.genre,
        latest_assessment: assessment,
        repeated_error_memory: memory,
        active_week_plan: weeklyPlan,
        active_daily_tasks: dailyTasks,
        completed_daily_tasks: [],
        monthly_history: [...state.monthly_history, { month, attempted_at: attemptedAt, score: assessment.total_score }],
    };
    return {
        assessment_result: assessment,
        weekly_plan: weeklyPlan,
        daily_tasks: dailyTasks,
        updated_writing_state: updatedState,
    };
};
const buildPracticeAttemptAssessment = (latestAssessment, evaluation) => {
    const updatedWeakness = evaluation.detected_weakness_tags;
    const updatedImprovement = new Set(evaluation.detected_improvement_tags);
    const blendedTags = [
        ...new Set([
            ...updatedWeakness,
            ...latestAssessment.weakness_tags.filter((tag) => !updatedImprovement.has(tag)),
        ]),
    ];
    return {
        ...latestAssessment,
        academic_profile_ready: false,
        assessment_status: 'legacy_estimate',
        derived_from_assessment_id: latestAssessment.assessment_id,
        weakness_tags: blendedTags,
        top_3_priorities: latestAssessment.top_3_priorities,
        total_score: latestAssessment.total_score,
    };
};
const autoTriggerExamReviewTask = (state) => {
    if (state.active_daily_tasks.length === 0)
        return state;
    const completedDays = new Set(state.completed_daily_tasks.map((item) => item.task.day_number));
    const allCompleted = state.active_daily_tasks.every((task) => completedDays.has(task.day_number));
    const hasExam = state.completed_daily_tasks.some((item) => item.task.task_type === 'full exam-style response');
    if (!allCompleted || hasExam)
        return state;
    const template = state.active_daily_tasks[state.active_daily_tasks.length - 1];
    const examTask = {
        ...template,
        day_number: template.day_number + 1,
        task_type: 'full exam-style response',
        title: `Day ${template.day_number + 1}: Auto exam-style review`,
        task_mode: 'exam_style',
    };
    return {
        ...state,
        active_daily_tasks: [...state.active_daily_tasks, examTask],
    };
};
export const runDailyWritingPracticeFlow = (input) => {
    if (!input.writing_state.latest_assessment) {
        throw new Error('Cannot run daily practice flow without an initial assessment.');
    }
    const evaluation = evaluateWritingPracticeTask({
        daily_task: input.daily_task,
        student_submission: input.student_submission,
        latest_assessment: input.writing_state.latest_assessment,
        repeated_error_memory: input.writing_state.repeated_error_memory,
        grade: input.writing_state.grade,
        genre: input.writing_state.current_genre,
        student_id: input.student_id,
    });
    const completedAt = input.completed_at ?? new Date().toISOString();
    const practiceAttempt = buildPracticeAttemptAssessment(input.writing_state.latest_assessment, evaluation);
    const memory = storeAttemptInErrorMemory(input.writing_state.repeated_error_memory, input.student_id, practiceAttempt, completedAt);
    const trend = { ...input.writing_state.adaptation_trend };
    if (evaluation.recommended_next_action === 'increase_difficulty' || evaluation.recommended_next_action === 'move_forward') {
        trend.success_streak += 1;
        trend.failure_streak = 0;
    }
    else {
        trend.failure_streak += 1;
        trend.success_streak = 0;
    }
    trend.last_recommended_action = evaluation.recommended_next_action;
    const difficultyState = evaluation.recommended_next_action === 'increase_difficulty'
        ? 'increased'
        : evaluation.recommended_next_action === 'reduce_difficulty'
            ? 'reduced'
            : input.writing_state.current_difficulty_state;
    const updatedStateBase = {
        ...input.writing_state,
        repeated_error_memory: memory,
        latest_assessment: practiceAttempt,
        completed_daily_tasks: [
            ...input.writing_state.completed_daily_tasks,
            {
                task: input.daily_task,
                submission: input.student_submission,
                evaluation,
                completed_at: completedAt,
            },
        ],
        adaptation_trend: trend,
        current_difficulty_state: difficultyState,
    };
    const updatedState = autoTriggerExamReviewTask(updatedStateBase);
    return {
        practice_evaluation_result: evaluation,
        updated_writing_state: updatedState,
    };
};
export const runWeeklyWritingReviewFlow = (input) => {
    const completed = input.completed_week_state.completed_daily_tasks;
    const completedCount = completed.length;
    const scoreSum = completed.reduce((sum, item) => sum + item.evaluation.target_skill_score, 0);
    const avgScore = completedCount > 0 ? Number((scoreSum / completedCount).toFixed(2)) : 0;
    const weakCounts = new Map();
    for (const item of completed) {
        for (const tag of item.evaluation.detected_weakness_tags) {
            weakCounts.set(tag, (weakCounts.get(tag) ?? 0) + 1);
        }
    }
    const topWeaknesses = [...weakCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tag]) => tag);
    const totalPlanned = input.completed_week_state.active_daily_tasks.length;
    const completionRate = totalPlanned > 0 ? Number((completedCount / totalPlanned).toFixed(2)) : 0;
    const carryPrimary = topWeaknesses[0]?.replaceAll('_', ' ') ?? 'maintain balanced writing control';
    const carrySecondary = topWeaknesses[1]?.replaceAll('_', ' ') ?? 'improve development of supporting ideas';
    const keepWordCount = topWeaknesses.includes('under_length');
    const adaptationSignal = input.completed_week_state.adaptation_trend.success_streak >= 3
        ? 'increase_difficulty'
        : input.completed_week_state.adaptation_trend.failure_streak >= 2
            ? 'reduce_difficulty'
            : 'maintain';
    return {
        weekly_review_summary: {
            completed_tasks: completedCount,
            average_target_skill_score: avgScore,
            top_remaining_weaknesses: topWeaknesses,
            completion_rate: completionRate,
        },
        next_week_planning_inputs: {
            carry_forward_primary_target: carryPrimary,
            carry_forward_secondary_target: carrySecondary,
            recommended_genre: input.completed_week_state.current_genre,
            keep_word_count_control: keepWordCount,
            adaptation_signal: adaptationSignal,
        },
    };
};
export const runMonthlyWritingReviewFlow = (input) => {
    const comparison = generateMonthlyComparison(input.writing_state.repeated_error_memory, input.student_id, input.month);
    const report = formatMonthlyGrowthReport(comparison, input.writing_state.repeated_error_memory);
    const updatedState = {
        ...input.writing_state,
        last_monthly_review_at: new Date().toISOString(),
    };
    return {
        monthly_comparison_summary: comparison,
        student_facing_monthly_report: report,
        next_month_target_recommendations: report.next_month_priorities,
        updated_writing_state: updatedState,
    };
};
