const record = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function getIeltsReadingPassages(payload) {
    if (!record(payload) || !Array.isArray(payload['passages']))
        return [];
    const ids = new Set();
    const passages = [];
    for (const value of payload['passages']) {
        if (!record(value) || typeof value['id'] !== 'string' || typeof value['title'] !== 'string'
            || ids.has(value['id']) || !Array.isArray(value['paragraphs']) || value['paragraphs'].length === 0)
            return [];
        const labels = new Set();
        const paragraphs = [];
        for (const paragraph of value['paragraphs']) {
            if (!record(paragraph) || typeof paragraph['label'] !== 'string' || typeof paragraph['text'] !== 'string'
                || !paragraph['text'].trim() || labels.has(paragraph['label']))
                return [];
            labels.add(paragraph['label']);
            paragraphs.push({ label: paragraph['label'], text: paragraph['text'] });
        }
        ids.add(value['id']);
        passages.push({ id: value['id'], title: value['title'], paragraphs });
    }
    return passages;
}
export function readingPassageKey(attemptId) { return `ielts_reading_passage_${attemptId}`; }
export function restoreReadingPassage(attemptId, ids, storage = window.localStorage) {
    try {
        const saved = storage.getItem(readingPassageKey(attemptId));
        if (saved && ids.includes(saved))
            return saved;
    }
    catch { /* Browser recovery is optional. */ }
    return ids[0] ?? '';
}
export function saveReadingPassage(attemptId, passageId, storage = window.localStorage) {
    try {
        storage.setItem(readingPassageKey(attemptId), passageId);
    }
    catch { /* Saving answers remains independent. */ }
}
