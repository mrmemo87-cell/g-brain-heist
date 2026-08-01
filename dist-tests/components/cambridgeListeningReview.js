export const CAMBRIDGE_LISTENING_TEST_1_VERSION = 'listening-1-stage9-v3';
// Keep this in lockstep with the scoring key in the student paper.
export const CAMBRIDGE_LISTENING_TEST_1_ANSWER_KEY = {
    1: 'C', 2: 'C', 3: 'B', 4: 'A', 5: 'C',
    6: 'C', 7: 'C', 8: 'C', 9: 'A', 10: 'B',
    11: 'A', 12: 'B', 13: 'C', 14: 'B', 15: 'C',
    16: 'C', 17: 'B', 18: 'C', 19: 'A', 20: 'C',
    21: ['6:30', '6.30', '6 30', 'half past six', 'half past six pm', 'half past six p.m.', 'half past six in the evening'],
    22: ['museum'],
    23: ['garden', 'gardens'],
    24: ['painting', 'local painting', 'a painting', 'a local painting'],
    25: ['drink', 'a drink'],
    26: 'A', 27: 'B', 28: 'C', 29: 'A', 30: 'B',
};
export const CAMBRIDGE_LISTENING_TEST_1_SECTIONS = [
    { name: 'Part 1: Picture selection', icon: '🖼️', questions: [1, 2, 3, 4, 5] },
    { name: 'Part 2: Picture selection', icon: '🖼️', questions: [6, 7, 8, 9, 10] },
    { name: 'Part 3: Short conversations', icon: '💬', questions: [11, 12, 13, 14, 15] },
    { name: 'Part 4: Extended interview', icon: '🎤', questions: [16, 17, 18, 19, 20] },
    { name: 'Part 5: Note completion', icon: '📝', questions: [21, 22, 23, 24, 25] },
    { name: 'Part 6: Extended interview', icon: '🎧', questions: [26, 27, 28, 29, 30] },
];
export const CAMBRIDGE_LISTENING_TEST_1_QUESTIONS = [
    { number: 1, prompt: "What is the boy's mother doing now?", options: { A: 'Cooking', B: 'Working at a computer', C: 'Serving at a shop counter' } },
    { number: 2, prompt: 'Why was the girl late for college this morning?', options: { A: 'She missed a bus', B: 'She travelled by bicycle', C: 'Her bus broke down' } },
    { number: 3, prompt: 'Which book does the man decide to buy?', options: { A: 'A plant book', B: 'A cookery book', C: 'A photography book' } },
    { number: 4, prompt: 'What has Tom left at home?', options: { A: 'His passport', B: 'His wallet', C: 'His mobile phone' } },
    { number: 5, prompt: 'Which video will Harry watch?', options: { A: 'A music performance', B: 'A football match', C: 'A wildlife programme' } },
    { number: 6, prompt: 'Which picture shows how the kitchen will look?', options: { A: 'Arrangement A', B: 'Arrangement B', C: 'Arrangement C' } },
    { number: 7, prompt: "Which photograph shows Sara's sister?", options: { A: 'Two women boating', B: 'A woman horse riding', C: 'A family meal' } },
    { number: 8, prompt: "What is the subject of the actor's next film?", options: { A: 'Space exploration', B: 'Motor racing', C: 'Ancient Egypt' } },
    { number: 9, prompt: 'When is the next orchestra practice going to be?', options: { A: 'Tuesday the 21st', B: 'Wednesday the 22nd', C: 'Friday the 24th' } },
    { number: 10, prompt: 'What will the girl put on?', options: { A: 'Gloves', B: 'A coat', C: 'Shoes' } },
    { number: 11, prompt: 'A teacher describes a poster-drawing competition. What is the aim of the poster?', options: { A: 'Encourage young children to enjoy dairy products', B: 'Give young children scientific information', C: 'Persuade young children to treat farm animals well' } },
    { number: 12, prompt: 'What main point does a teenage dance-group member make about dance?', options: { A: "It's similar to tennis", B: 'It requires a lot of concentration', C: 'The moves are not as hard as they seem' } },
    { number: 13, prompt: 'What surprised the girl about the sea-life centre?', options: { A: 'The way exhibits were presented', B: 'The state of the building', C: 'The attitude of the staff' } },
    { number: 14, prompt: 'What kind of trip did the young man make?', options: { A: 'A climbing holiday', B: 'A science expedition', C: 'A team-building exercise' } },
    { number: 15, prompt: 'A teacher talks about students throwing away rubbish. What is the problem?', options: { A: 'Where they are doing it', B: 'How they are doing it', C: 'When they are doing it' } },
    { number: 16, prompt: 'Before becoming a full-time writer, Fiona worked ...', options: { A: 'At a university', B: 'In publishing', C: 'As a lawyer' } },
    { number: 17, prompt: 'How does Fiona feel about her life as a writer?', options: { A: 'She misses having a car', B: 'She likes working at home', C: 'She sometimes gets lonely' } },
    { number: 18, prompt: 'Why did Fiona decide to write stories for children?', options: { A: 'She used to enjoy reading them herself', B: 'She loved looking at them in bookshops', C: 'She wanted to give some to her nephews' } },
    { number: 19, prompt: 'When researching a story last year, Fiona spent time ...', options: { A: 'Learning things from an expert', B: 'Reading about outdoor living', C: 'Using a website about mountains' } },
    { number: 20, prompt: 'What does Fiona plan to do in the near future?', options: { A: 'Write a second story about the same character', B: 'Make a cartoon film from one story', C: 'Find a completely new story idea' } },
    { number: 21, prompt: 'Red Bus City Tour: What time is the last bus?' },
    { number: 22, prompt: 'The ticket includes entrance to the City ____.' },
    { number: 23, prompt: "The ticket includes a tour of the ____ at 11 o'clock daily." },
    { number: 24, prompt: 'At the art market, visitors can buy a nice ____ at a good price.' },
    { number: 25, prompt: 'At Riverside Park, visitors can get a ____ in the cafe without paying.' },
    { number: 26, prompt: 'What does Grania say about most of her medical colleagues?', options: { A: 'They are enthusiastic about her singing career', B: 'They find her music difficult to appreciate', C: 'They worry that singing could affect her work' } },
    { number: 27, prompt: 'How does Grania feel about her musical colleagues?', options: { A: 'Annoyed that they ask for medical advice', B: 'Relieved that they take her seriously as a musician', C: 'Grateful for their tolerance of her other responsibilities' } },
    { number: 28, prompt: 'What does Grania say about her future in her two professions?', options: { A: 'She would choose medicine if necessary', B: 'She is confident medicine will continue to employ her', C: 'She will not choose between medicine and music now' } },
    { number: 29, prompt: "What does Grania say about her children's attitude to her music?", options: { A: 'Her son appreciates the kind of music she plays', B: 'Her daughter prefers a different kind of music', C: 'Both children sometimes play with her band' } },
    { number: 30, prompt: 'What does Grania say about music she heard in childhood?', options: { A: 'She regrets Western influences in African music', B: 'She benefited from diverse musical influences', C: 'Kenyan music was the greatest influence' } },
];
const parseJsonObject = (value) => {
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        }
        catch {
            return {};
        }
    }
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
};
/**
 * Cambridge tests save metadata beside a numeric response map. Older report
 * code treated the wrapper as the answers, making every question look blank.
 */
export const parseCambridgeResponses = (savedAnswers) => {
    const payload = parseJsonObject(savedAnswers);
    const responses = parseJsonObject(payload['responses'] ?? payload);
    const normalized = {};
    Object.entries(responses).forEach(([key, value]) => {
        const questionNumber = Number(key);
        if (!Number.isInteger(questionNumber) || questionNumber <= 0)
            return;
        normalized[questionNumber] = value == null ? '' : String(value).trim();
    });
    return normalized;
};
export const normalizeCambridgeAnswer = (value) => String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/,/g, '')
    .replace(/\s+/g, ' ');
export const isCambridgeAnswerCorrect = (studentAnswer, expectedAnswer) => {
    const normalizedStudent = normalizeCambridgeAnswer(studentAnswer);
    if (!normalizedStudent)
        return false;
    const accepted = Array.isArray(expectedAnswer) ? expectedAnswer : [expectedAnswer];
    return accepted.some(answer => normalizeCambridgeAnswer(answer) === normalizedStudent);
};
export const getPrimaryCambridgeAnswer = (expectedAnswer) => Array.isArray(expectedAnswer) ? String(expectedAnswer[0] ?? '') : String(expectedAnswer);
