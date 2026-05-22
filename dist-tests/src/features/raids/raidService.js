import { supabase } from '../../../services/supabaseClient.js';
import { createRaidSession, finalizeRaidSession, fetchRaidStatus, joinRaidSession, submitRaidAnswer as rpcSubmitRaidAnswer, } from '../../../services/rpcGateway.js';
const RAID_REWARD_POOL = { xp: 500, coins: 800, badge: 'Neural Siege Victor' };
const WRONG_ANSWER_PENALTY_SECONDS = 5;
const MVP_BONUS_RATIO = 0.3;
const DEFAULT_MODE = 'mega_crew';
const MODE_LIMITS = {
    strike_squad: { teamSize: 3, lobbyDurationSeconds: 600 },
    mega_crew: { teamSize: 5, lobbyDurationSeconds: 900 },
    clan_war: { teamSize: 12, lobbyDurationSeconds: 1200 },
};
const PANIC_PHASE_SECONDS = 60;
const ARENA_THEMES = {
    strike_squad: 'Solar Flare Alley',
    mega_crew: 'Neon Cortex Arena',
    clan_war: 'Galactic Study Coliseum',
};
const QUESTIONS_PER_WAVE = 5;
const QUESTION_FETCH_MULTIPLIER = 3;
let bhEnrollmentPromise = null;
const RAID_TO_MCQ_DIFFICULTY = {
    easy: ['easy'],
    medium: ['medium', 'med'],
    hard: ['hard'],
};
const ALL_MCQ_DIFFICULTIES = ['easy', 'medium', 'med', 'hard'];
const shuffleArray = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};
const normalizeRaidDifficulty = (value) => {
    if (!value)
        return 'easy';
    if (value === 'med' || value === 'medium')
        return 'medium';
    if (value === 'hard')
        return 'hard';
    return 'easy';
};
const getBaseScoreForDifficulty = (difficulty, isSpike = false) => {
    const base = difficulty === 'easy' ? 60 : difficulty === 'medium' ? 80 : 100;
    return isSpike ? base + 20 : base;
};
const mcqRowToRaidQuestion = (row, isSpike) => {
    const difficulty = normalizeRaidDifficulty(row.difficulty);
    return {
        id: String(row.id),
        prompt: row.stem,
        answers: [row.opt1, row.opt2, row.opt3, row.opt4].map((choice, idx) => choice || `Option ${idx + 1}`),
        correctIndex: Math.max(0, Math.min(3, (row.correct ?? 1) - 1)),
        difficulty,
        baseScore: getBaseScoreForDifficulty(difficulty, isSpike),
        isSpike,
        subject: row.subject ?? undefined,
    };
};
const buildSyntheticQuestion = (wave, slotIndex, isSpike) => {
    const difficulty = isSpike ? 'hard' : wave.difficulty;
    return {
        id: `synthetic_${wave.waveNumber}_${slotIndex}`,
        prompt: isSpike
            ? `Spike protocol ${slotIndex + 1}: Crack the encrypted pattern for wave ${wave.waveNumber}.`
            : `Solve checkpoint ${slotIndex + 1} for wave ${wave.waveNumber}.`,
        answers: ['A - option', 'B - option', 'C - option', 'D - option'],
        correctIndex: slotIndex % 4,
        difficulty,
        baseScore: getBaseScoreForDifficulty(difficulty, isSpike),
        isSpike,
    };
};
const selectMcqRows = async (difficulties, limit, grade) => {
    if (difficulties.length === 0 || limit <= 0) {
        return [];
    }
    let query = supabase
        .from('questions')
        .select('id, question_text, options, correct_answer, difficulty, subject')
        .eq('is_active', true)
        .in('difficulty', difficulties)
        .limit(limit);
    if (typeof grade === 'number') {
        query = query.eq('grade', grade);
    }
    const { data, error } = await query;
    if (error) {
        console.error('Failed to load MCQ questions for raids', error);
        return [];
    }
    return (data ?? []).map((row) => {
        const options = Array.isArray(row.options) ? row.options : [];
        const parsedCorrect = Number(row.correct_answer);
        const correct = Number.isFinite(parsedCorrect) && parsedCorrect >= 1 && parsedCorrect <= 4
            ? parsedCorrect
            : 1;
        return {
            id: String(row.id),
            stem: row.question_text ?? '',
            opt1: options[0] ?? '',
            opt2: options[1] ?? '',
            opt3: options[2] ?? '',
            opt4: options[3] ?? '',
            correct,
            difficulty: row.difficulty ?? null,
            subject: row.subject ?? null,
        };
    });
};
const fetchMcqPool = async (difficulties, requested, grade) => {
    if (requested <= 0) {
        return [];
    }
    const selectionLimit = Math.max(requested * QUESTION_FETCH_MULTIPLIER, requested);
    let rows = await selectMcqRows(difficulties, selectionLimit, grade);
    if (rows.length < requested && typeof grade === 'number') {
        const fallback = await selectMcqRows(difficulties, selectionLimit, null);
        const seen = new Set(rows.map((row) => row.id));
        fallback.forEach((row) => {
            if (!seen.has(row.id)) {
                rows.push(row);
            }
        });
    }
    return shuffleArray(rows).slice(0, requested);
};
const getArenaTheme = (mode = DEFAULT_MODE) => ARENA_THEMES[mode] ?? ARENA_THEMES.mega_crew;
const DEFAULT_WAVES = [
    { waveNumber: 1, difficulty: 'easy', scoreThreshold: 5, bossHp: 300, spikeQuestions: 2 },
    { waveNumber: 2, difficulty: 'medium', scoreThreshold: 7, bossHp: 450, spikeQuestions: 2 },
    { waveNumber: 3, difficulty: 'hard', scoreThreshold: 9, bossHp: 600, spikeQuestions: 2 },
];
const createWaveState = (wave) => ({
    ...wave,
    spikeQuestionIds: Array.from({ length: wave.spikeQuestions }, (_, idx) => `wave${wave.waveNumber}_spike_${idx + 1}`),
    damageDealt: 0,
    completed: false,
});
const getNowIso = () => new Date().toISOString();
const ensureBhEnrollment = async () => {
    if (!bhEnrollmentPromise) {
        bhEnrollmentPromise = (async () => {
            const { error } = await supabase.rpc('bh_enroll_self');
            if (error) {
                bhEnrollmentPromise = null;
                throw new Error(error.message ?? 'BH access denied');
            }
        })();
    }
    return bhEnrollmentPromise;
};
export const calculateTeamDamage = (individualScore, waveScoreThreshold, bossHpPerWave) => {
    if (waveScoreThreshold <= 0 || bossHpPerWave <= 0) {
        return 0;
    }
    const ratio = individualScore / waveScoreThreshold;
    return Math.max(0, Math.round(ratio * bossHpPerWave));
};
export const trackWaveProgress = (wave, damageDelta) => {
    const nextDamage = Math.min(wave.bossHp, wave.damageDealt + Math.max(0, damageDelta));
    return {
        ...wave,
        damageDealt: nextDamage,
        completed: nextDamage >= wave.bossHp,
    };
};
const rankParticipants = (participants) => {
    return [...participants].sort((a, b) => b.damageDealt - a.damageDealt);
};
const computeRewardBreakdown = (participants) => {
    const totalDamage = participants.reduce((total, p) => total + p.damageDealt, 0);
    if (totalDamage <= 0) {
        return participants.map((p) => ({
            userId: p.userId,
            username: p.username,
            damageShare: 0,
            baseXp: 0,
            baseCoins: 0,
            bonusXp: 0,
            bonusCoins: 0,
            totalXp: 0,
            totalCoins: 0,
            isMvp: false,
        }));
    }
    const ranked = rankParticipants(participants);
    const mvp = ranked[0];
    const distributableXp = RAID_REWARD_POOL.xp * (1 - MVP_BONUS_RATIO);
    const distributableCoins = RAID_REWARD_POOL.coins * (1 - MVP_BONUS_RATIO);
    const mvpBonusXp = RAID_REWARD_POOL.xp * MVP_BONUS_RATIO;
    const mvpBonusCoins = RAID_REWARD_POOL.coins * MVP_BONUS_RATIO;
    return ranked.map((participant) => {
        const share = participant.damageDealt / totalDamage;
        const baseXp = Math.round(distributableXp * share);
        const baseCoins = Math.round(distributableCoins * share);
        const isMvp = participant.userId === mvp.userId;
        const bonusXp = isMvp ? Math.round(mvpBonusXp) : 0;
        const bonusCoins = isMvp ? Math.round(mvpBonusCoins) : 0;
        return {
            userId: participant.userId,
            username: participant.username,
            damageShare: share,
            baseXp,
            baseCoins,
            bonusXp,
            bonusCoins,
            totalXp: baseXp + bonusXp,
            totalCoins: baseCoins + bonusCoins,
            isMvp,
        };
    });
};
export const startRaid = async (bossId) => {
    await ensureBhEnrollment();
    const { data, error } = await createRaidSession(bossId, { waves: DEFAULT_WAVES, reward_pool: RAID_REWARD_POOL });
    if (error) {
        throw new Error(error.message ?? 'Failed to create raid');
    }
    const mode = DEFAULT_MODE;
    return {
        raidId: data.raid_id,
        bossId,
        status: 'scheduled',
        rewardPool: RAID_REWARD_POOL,
        waves: DEFAULT_WAVES.map(createWaveState),
        participants: [],
        spectators: [],
        mode,
        lobbyDurationSeconds: MODE_LIMITS[mode].lobbyDurationSeconds,
        panicPhaseSeconds: PANIC_PHASE_SECONDS,
        arenaTheme: getArenaTheme(mode),
        activePhase: 'briefing',
        startsAt: getNowIso(),
    };
};
export const joinRaid = async (raidId, username, userId) => {
    await ensureBhEnrollment();
    const { data, error } = await joinRaidSession(raidId);
    if (error) {
        throw new Error(error.message ?? 'Failed to join raid');
    }
    await supabase
        .from('raid_participants')
        .upsert({
        id: data.participant_id,
        raid_id: raidId,
        user_id: userId,
        username,
        joined_at: getNowIso(),
        damage: 0,
        answers_submitted: 0,
    });
    return {
        userId,
        username,
        damageDealt: 0,
        answersSubmitted: 0,
        lastActive: getNowIso(),
        role: 'player',
    };
};
export const submitRaidAnswer = async (payload, wave, participant) => {
    await ensureBhEnrollment();
    const damage = payload.isCorrect
        ? calculateTeamDamage(payload.score, payload.waveScoreThreshold, payload.bossHp)
        : 0;
    const penaltySeconds = payload.isCorrect ? 0 : WRONG_ANSWER_PENALTY_SECONDS;
    const updatedWave = trackWaveProgress(wave, damage);
    const updatedParticipant = {
        ...participant,
        damageDealt: participant.damageDealt + damage,
        answersSubmitted: participant.answersSubmitted + 1,
        lastActive: getNowIso(),
    };
    const answerPayload = {
        raid_id: payload.raidId,
        question_id: payload.questionId,
        answer: JSON.stringify({
            answer: payload.answerText,
            isCorrect: payload.isCorrect,
            damage,
            penaltySeconds,
        }),
        time_spent: payload.timeTakenSeconds + penaltySeconds,
    };
    const { error } = await rpcSubmitRaidAnswer(answerPayload);
    if (error) {
        throw new Error(error.message ?? 'Failed to submit raid answer');
    }
    await supabase
        .from('raid_participants')
        .update({
        damage: updatedParticipant.damageDealt,
        answers_submitted: updatedParticipant.answersSubmitted,
        last_active: updatedParticipant.lastActive,
    })
        .eq('raid_id', payload.raidId)
        .eq('user_id', participant.userId);
    return {
        damage,
        penaltySeconds,
        waveCleared: updatedWave.completed,
        updatedWave,
        updatedParticipant,
    };
};
export const finalizeRaid = async (raidId, participants) => {
    await ensureBhEnrollment();
    const rewards = computeRewardBreakdown(participants);
    const { error } = await finalizeRaidSession(raidId);
    if (error) {
        throw new Error(error.message ?? 'Failed to finalize raid');
    }
    const mvpParticipant = rewards.find((reward) => reward.isMvp);
    if (mvpParticipant) {
        await supabase
            .from('raid_participants')
            .update({ is_mvp: true })
            .eq('raid_id', raidId)
            .eq('user_id', mvpParticipant.userId);
    }
    return {
        mvp: mvpParticipant
            ? {
                userId: mvpParticipant.userId,
                username: mvpParticipant.username,
                damageDealt: participants.find((p) => p.userId === mvpParticipant.userId)?.damageDealt ?? 0,
                answersSubmitted: participants.find((p) => p.userId === mvpParticipant.userId)?.answersSubmitted ?? 0,
                lastActive: getNowIso(),
                isMvp: true,
            }
            : null,
        rewards,
    };
};
export const getRaidWaveQuestions = async (request) => {
    const { wave, spikeSlots, grade, totalQuestions = QUESTIONS_PER_WAVE } = request;
    const spikeSet = new Set(spikeSlots);
    const baseDifficultyFilters = RAID_TO_MCQ_DIFFICULTY[wave.difficulty];
    const basePool = await fetchMcqPool(baseDifficultyFilters, Math.max(totalQuestions - spikeSlots.length, 0), grade);
    const spikePool = spikeSlots.length
        ? await fetchMcqPool(RAID_TO_MCQ_DIFFICULTY.hard, spikeSlots.length, grade)
        : [];
    const fillerPool = await fetchMcqPool(ALL_MCQ_DIFFICULTIES, totalQuestions, grade);
    const baseQueue = [...basePool];
    const spikeQueue = [...spikePool];
    const fillerQueue = [...fillerPool];
    const usedIds = new Set();
    const questions = [];
    for (let slot = 0; slot < totalQuestions; slot += 1) {
        const isSpike = spikeSet.has(slot);
        let pick;
        const chooseNext = (queue) => {
            while (queue.length > 0) {
                const candidate = queue.shift();
                if (candidate && !usedIds.has(String(candidate.id))) {
                    usedIds.add(String(candidate.id));
                    return candidate;
                }
            }
            return undefined;
        };
        if (isSpike) {
            pick = chooseNext(spikeQueue);
        }
        if (!pick) {
            pick = chooseNext(baseQueue);
        }
        if (!pick) {
            pick = chooseNext(fillerQueue);
        }
        if (pick) {
            questions.push(mcqRowToRaidQuestion(pick, isSpike));
        }
        else {
            questions.push(buildSyntheticQuestion(wave, slot, isSpike));
        }
    }
    return questions;
};
const inflateRaid = async (raidRow) => {
    const { data: waveRows } = await supabase
        .from('raid_waves')
        .select('wave_number, difficulty, score_threshold, boss_hp, spike_questions, damage, completed')
        .eq('raid_id', raidRow.id)
        .order('wave_number', { ascending: true });
    const waves = (waveRows && waveRows.length > 0
        ? waveRows.map((wave) => ({
            waveNumber: wave.wave_number,
            difficulty: wave.difficulty,
            scoreThreshold: wave.score_threshold,
            bossHp: wave.boss_hp,
            spikeQuestions: wave.spike_questions,
            spikeQuestionIds: Array.from({ length: wave.spike_questions }, (_, idx) => `wave${wave.wave_number}_spike_${idx + 1}`),
            damageDealt: wave.damage ?? 0,
            completed: wave.completed ?? false,
        }))
        : (raidRow.wave_config?.waves ?? DEFAULT_WAVES).map((wave) => ({
            ...createWaveState(wave),
            damageDealt: wave.damageDealt ?? 0,
            completed: Boolean(wave.completed),
        })));
    const { data: participantRows } = await supabase
        .from('raid_participants')
        .select('user_id, username, damage, answers_submitted, last_active, is_mvp')
        .eq('raid_id', raidRow.id);
    const participants = (participantRows ?? []).map((row, idx) => ({
        userId: row.user_id,
        username: row.username,
        damageDealt: row.damage ?? 0,
        answersSubmitted: row.answers_submitted ?? 0,
        lastActive: row.last_active ?? raidRow.created_at,
        isMvp: row.is_mvp ?? false,
        team: idx % 2 === 0 ? 'alpha' : 'beta',
        role: 'player',
    }));
    const mode = raidRow.mode ?? DEFAULT_MODE;
    return {
        raidId: raidRow.id,
        bossId: raidRow.boss_id,
        status: raidRow.status,
        rewardPool: raidRow.reward_pool ?? RAID_REWARD_POOL,
        waves,
        participants,
        spectators: raidRow.spectators ?? [],
        mode,
        lobbyDurationSeconds: raidRow.lobby_duration_seconds ?? MODE_LIMITS[mode].lobbyDurationSeconds,
        panicPhaseSeconds: raidRow.panic_phase_seconds ?? PANIC_PHASE_SECONDS,
        arenaTheme: raidRow.arena_theme ?? getArenaTheme(mode),
        activePhase: raidRow.active_phase ?? 'wave',
        createdBy: raidRow.created_by,
        startsAt: raidRow.starts_at,
        endsAt: raidRow.ends_at,
    };
};
export const getActiveRaid = async () => {
    await ensureBhEnrollment();
    const { data, error } = await supabase
        .from('raids')
        .select('*')
        .in('status', ['scheduled', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) {
        console.error('Failed to fetch raid', error);
        return null;
    }
    if (!data) {
        return null;
    }
    return inflateRaid(data);
};
export const getRaidStatus = async (raidId) => {
    await ensureBhEnrollment();
    const { data, error } = await fetchRaidStatus(raidId);
    if (error) {
        console.error('Failed to load raid status via RPC', error);
        return null;
    }
    if (!data) {
        return getActiveRaid();
    }
    return inflateRaid({
        id: data.id || raidId,
        boss_id: data.boss_id,
        status: data.status,
        reward_pool: data.reward_pool ?? RAID_REWARD_POOL,
        wave_config: data.wave_config ?? { waves: DEFAULT_WAVES },
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        created_at: data.created_at ?? getNowIso(),
    });
};
const normalizeDifficulty = (value) => {
    if (!value)
        return 'easy';
    if (value === 'med' || value === 'medium')
        return 'medium';
    if (value === 'hard')
        return 'hard';
    return value === 'easy' ? 'easy' : 'medium';
};
export const getBossUnlockState = async (userId) => {
    const { data, error } = await supabase
        .from('attempts')
        .select('is_correct, created_at, mcq_questions!inner(difficulty, subject)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30);
    if (error) {
        console.error('Failed to load attempts for boss unlock', error);
        return {
            unlocked: false,
            consecutiveMissions: 0,
            crushedTopics: [],
            reason: 'Unable to read mission history',
        };
    }
    const attempts = data || [];
    if (attempts.length === 0) {
        return {
            unlocked: false,
            consecutiveMissions: 0,
            crushedTopics: [],
            reason: 'Complete more missions to reveal the boss node.',
        };
    }
    const missionWindows = [];
    const chronological = [...attempts].reverse();
    for (let idx = 0; idx < chronological.length; idx += 5) {
        missionWindows.push(chronological.slice(idx, idx + 5));
    }
    let consecutive = 0;
    let bestConsecutive = 0;
    missionWindows.forEach((window) => {
        if (window.length < 5) {
            return;
        }
        const isMediumOrHard = window.every((attempt) => {
            const difficulty = normalizeDifficulty(attempt.mcq_questions?.difficulty);
            return difficulty === 'medium' || difficulty === 'hard';
        });
        const accuracy = window.filter((attempt) => attempt.is_correct).length / window.length;
        if (isMediumOrHard && accuracy >= 0.8) {
            consecutive += 1;
            bestConsecutive = Math.max(bestConsecutive, consecutive);
        }
        else {
            consecutive = 0;
        }
    });
    const topicStats = new Map();
    chronological.forEach((attempt) => {
        const subject = attempt.mcq_questions?.subject || 'Unknown';
        const stat = topicStats.get(subject) || { correct: 0, total: 0, lastAttempt: attempt.created_at };
        stat.total += 1;
        if (attempt.is_correct) {
            stat.correct += 1;
        }
        stat.lastAttempt = attempt.created_at;
        topicStats.set(subject, stat);
    });
    const crushedTopics = Array.from(topicStats.entries())
        .filter(([_, stat]) => {
        if (stat.total < 10)
            return false;
        const accuracy = stat.correct / stat.total;
        const daysSince = (Date.now() - new Date(stat.lastAttempt).getTime()) / (1000 * 60 * 60 * 24);
        const recencyScore = Math.exp(-daysSince / 14);
        return accuracy >= 0.85 && recencyScore >= 0.4;
    })
        .map(([topic]) => topic);
    const unlocked = bestConsecutive >= 3 && crushedTopics.length > 0;
    return {
        unlocked,
        consecutiveMissions: Math.min(bestConsecutive, 3),
        crushedTopics,
        reason: unlocked
            ? undefined
            : 'Complete 3 Medium+ missions in a row with ≥80% accuracy and maintain at least one crushed topic.',
    };
};
export const getDefaultRaidStatus = (bossId) => ({
    raidId: '',
    bossId,
    status: 'scheduled',
    rewardPool: RAID_REWARD_POOL,
    waves: DEFAULT_WAVES.map(createWaveState),
    participants: [],
    spectators: [],
    mode: DEFAULT_MODE,
    lobbyDurationSeconds: MODE_LIMITS[DEFAULT_MODE].lobbyDurationSeconds,
    panicPhaseSeconds: PANIC_PHASE_SECONDS,
    arenaTheme: getArenaTheme(DEFAULT_MODE),
    activePhase: 'briefing',
});
