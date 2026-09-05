import { supabase } from '../../services/supabaseClient.js';
const normalizeGeometryQuestion = (row) => ({
    ...row,
    // Diagrams are reusable teacher assets. Subject belongs to the final
    // classroom question that consumes the asset, not to the drawing itself.
    subject: row?.subject || '',
});
/**
 * Save a reusable geometry/diagram asset to Supabase.
 *
 * The legacy API still accepts subject/subjectId so existing callers remain
 * compatible, but new diagram saves intentionally do not bind the asset to an
 * academic subject. The consuming question chooses its own subject later.
 */
export const saveGeometryQuestion = async (teacherId, title, diagramJson, answers, options = {}) => {
    const { data, error } = await supabase
        .from('geometry_questions')
        .insert({
        teacher_id: teacherId,
        title,
        diagram_json: diagramJson,
        answers,
        subject: null,
        subject_id: null,
        topic: options.topic || 'Geometry',
        difficulty: options.difficulty || 'medium',
        points: options.points || 15,
        time_limit: options.timeLimit || 60,
        is_active: true,
        is_public: true
    })
        .select()
        .single();
    if (error)
        throw error;
    return normalizeGeometryQuestion(data);
};
/**
 * Update an existing reusable diagram asset.
 */
export const updateGeometryQuestion = async (questionId, updates) => {
    const { subject: _legacySubject, ...assetUpdates } = updates;
    const { data, error } = await supabase
        .from('geometry_questions')
        .update({
        ...assetUpdates,
        subject: null,
        subject_id: null,
        updated_at: new Date().toISOString()
    })
        .eq('id', questionId)
        .select()
        .single();
    if (error)
        throw error;
    return normalizeGeometryQuestion(data);
};
/**
 * Load a geometry question by ID
 */
export const loadGeometryQuestion = async (questionId) => {
    const { data, error } = await supabase
        .from('geometry_questions')
        .select('*')
        .eq('id', questionId)
        .single();
    if (error) {
        if (error.code === 'PGRST116')
            return null; // Not found
        throw error;
    }
    return data ? normalizeGeometryQuestion(data) : null;
};
/**
 * Get all geometry questions for a teacher
 */
export const getTeacherGeometryQuestions = async (teacherId) => {
    const { data, error } = await supabase
        .from('geometry_questions')
        .select('*')
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false });
    if (error)
        throw error;
    return (data || []).map(normalizeGeometryQuestion);
};
/**
 * Get a random geometry question for practice
 */
export const getRandomGeometryQuestion = async (subject, difficulty) => {
    const { data, error } = await supabase
        .rpc('get_random_geometry_question', {
        p_subject: subject || null,
        p_difficulty: difficulty || null
    });
    if (error)
        throw error;
    return data ? normalizeGeometryQuestion(data) : null;
};
/**
 * Delete a geometry question
 */
export const deleteGeometryQuestion = async (questionId) => {
    const { error } = await supabase
        .from('geometry_questions')
        .delete()
        .eq('id', questionId);
    if (error)
        throw error;
};
/**
 * Record an attempt at a geometry question
 */
export const recordGeometryAttempt = async (questionId, isCorrect) => {
    const { error } = await supabase.rpc('record_geometry_attempt', {
        p_question_id: questionId,
        p_is_correct: isCorrect
    });
    if (error)
        throw error;
};
/**
 * Extract blank fields from Konva JSON
 */
export const extractBlanks = (diagramJson) => {
    try {
        const parsed = JSON.parse(diagramJson);
        const blanks = [];
        const findBlanks = (node) => {
            if (node.attrs?.shapeType === 'blank') {
                blanks.push({
                    id: node.attrs.id || `blank_${blanks.length}`,
                    type: 'blank',
                    x: node.attrs.x || 0,
                    y: node.attrs.y || 0,
                    width: node.attrs.width || 60,
                    height: node.attrs.height || 30,
                    expectedAnswer: node.attrs.expectedAnswer || '',
                    label: node.attrs.label
                });
            }
            if (node.children) {
                node.children.forEach(findBlanks);
            }
        };
        findBlanks(parsed);
        return blanks;
    }
    catch (error) {
        console.error('Failed to extract blanks:', error);
        return [];
    }
};
/**
 * Normalize an answer for comparison
 */
export const normalizeAnswer = (answer) => {
    const trimmed = answer.trim().toLowerCase();
    const num = parseFloat(trimmed);
    if (!isNaN(num)) {
        return String(num);
    }
    return trimmed;
};
/**
 * Check student answers against correct answers
 */
export const checkGeometryAnswers = (studentAnswers, correctAnswers, totalPoints) => {
    const wrongFields = [];
    let correctCount = 0;
    const totalCount = Object.keys(correctAnswers).length;
    for (const [fieldId, correctAnswer] of Object.entries(correctAnswers)) {
        const studentAnswer = studentAnswers[fieldId] || '';
        const normalizedStudent = normalizeAnswer(studentAnswer);
        const normalizedCorrect = normalizeAnswer(correctAnswer);
        if (normalizedStudent === normalizedCorrect) {
            correctCount++;
        }
        else {
            wrongFields.push(fieldId);
        }
    }
    const score = totalCount > 0
        ? Math.round((correctCount / totalCount) * totalPoints)
        : 0;
    return {
        correctCount,
        totalCount,
        wrongFields,
        score,
        isFullyCorrect: correctCount === totalCount
    };
};
/**
 * Generate a unique ID for shapes
 */
export const generateShapeId = (prefix = 'shape') => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};
