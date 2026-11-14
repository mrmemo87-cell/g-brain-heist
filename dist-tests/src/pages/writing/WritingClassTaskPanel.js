import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { assignWritingClassTask, cancelWritingClassTask, createWritingClassTask, getWritingClassDrafts, getWritingClassTaskOptions, } from '../../lib/brains_heist/writingIntegrationService.js';
const GENRES = [
    { value: 'email', label: 'Email' },
    { value: 'essay', label: 'Essay' },
    { value: 'article', label: 'Article' },
    { value: 'report', label: 'Report' },
    { value: 'review', label: 'Review' },
    { value: 'story', label: 'Story' },
    { value: 'paragraph', label: 'Paragraph' },
];
const DURATIONS = [
    { days: 1, label: 'Today only' },
    { days: 3, label: '3 days' },
    { days: 7, label: '1 week' },
    { days: 14, label: '2 weeks' },
];
const fieldStyle = {
    display: 'grid',
    gap: 4,
    fontSize: 14,
    fontWeight: 600,
};
const controlStyle = {
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    padding: '8px 10px',
    font: 'inherit',
    fontWeight: 400,
    background: '#ffffff',
    color: '#0f172a',
    maxWidth: '100%',
};
const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};
/**
 * Lets a teacher set one Writing Hub task for a whole class, see how many students have submitted it, and withdraw it.
 * Students in the class receive this task in the hub until they submit it or it closes.
 */
export const WritingClassTaskPanel = ({ scopeId, className }) => {
    const [genre, setGenre] = useState('email');
    const [options, setOptions] = useState(null);
    const [promptId, setPromptId] = useState('');
    const [days, setDays] = useState(7);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [drafts, setDrafts] = useState([]);
    const [writingOwn, setWritingOwn] = useState(false);
    const [ownTitle, setOwnTitle] = useState('');
    const [ownSituation, setOwnSituation] = useState('');
    const [ownReader, setOwnReader] = useState('');
    const [ownPoints, setOwnPoints] = useState(['', '', '']);
    useEffect(() => {
        let cancelled = false;
        void getWritingClassDrafts(scopeId).then((result) => {
            if (!cancelled)
                setDrafts(result.ok && result.data ? result.data : []);
        });
        return () => { cancelled = true; };
    }, [scopeId]);
    const load = useCallback(async (nextGenre) => {
        setError('');
        const result = await getWritingClassTaskOptions({ scope_id: scopeId, genre: nextGenre });
        if (!result.ok || !result.data) {
            setOptions(null);
            setError(result.error ?? 'Unable to load tasks for this class.');
            return;
        }
        setOptions(result.data);
        setPromptId((current) => (result.data.tasks.some((task) => task.prompt_id === current) ? current : result.data.tasks[0]?.prompt_id ?? ''));
    }, [scopeId]);
    useEffect(() => {
        setOptions(null);
        setMessage('');
        void load(genre);
    }, [genre, load]);
    const selectedTask = options?.tasks.find((task) => task.prompt_id === promptId) ?? null;
    const current = options?.current ?? null;
    const assign = async () => {
        if (!selectedTask || busy)
            return;
        setBusy(true);
        setError('');
        setMessage('');
        const result = await assignWritingClassTask({ scope_id: scopeId, prompt_id: selectedTask.prompt_id, days });
        if (!result.ok || !result.data) {
            setError(result.error ?? 'Unable to set the class task.');
        }
        else {
            setMessage(`Task set for ${result.data.student_count} ${result.data.student_count === 1 ? 'student' : 'students'}.`
                + (result.data.skipped_count > 0
                    ? ` ${result.data.skipped_count} ${result.data.skipped_count === 1 ? 'student is' : 'students are'} recorded in a different grade and did not receive it.`
                    : ''));
            await load(genre);
        }
        setBusy(false);
    };
    const saveOwnTask = async () => {
        if (busy)
            return;
        setBusy(true);
        setError('');
        setMessage('');
        const result = await createWritingClassTask({
            scope_id: scopeId,
            genre,
            title: ownTitle,
            situation: ownSituation,
            reader: ownReader,
            points: ownPoints.map((point) => point.trim()).filter(Boolean),
        });
        if (!result.ok || !result.data) {
            setError(result.error ?? 'Unable to save the task.');
        }
        else {
            setPromptId(result.data.prompt_id);
            await load(genre);
            setPromptId(result.data.prompt_id);
            setWritingOwn(false);
            setOwnTitle('');
            setOwnSituation('');
            setOwnReader('');
            setOwnPoints(['', '', '']);
            setMessage('Task saved. Check the wording below, then set it for the class.');
        }
        setBusy(false);
    };
    const withdraw = async () => {
        if (!current || busy)
            return;
        setBusy(true);
        setError('');
        setMessage('');
        const result = await cancelWritingClassTask(current.assignment_id);
        if (!result.ok)
            setError(result.error ?? 'Unable to withdraw the class task.');
        else {
            setMessage('Task withdrawn. Students can choose their own task again.');
            await load(genre);
        }
        setBusy(false);
    };
    return (_jsxs("div", { "data-testid": "writing-class-task-panel", style: { display: 'grid', gap: 14 }, children: [current ? (_jsxs("div", { className: "writing-monitor__sync-warning", role: "status", style: { display: 'grid', gap: 6 }, children: [_jsxs("strong", { children: ["Current class task: ", current.prompt_title] }), _jsxs("span", { children: [current.submitted_count, " of ", current.student_count, " students have submitted \u00B7 open until ", formatDate(current.closes_at)] }), _jsx("div", { children: _jsx("button", { type: "button", className: "writing-monitor__secondary-button", onClick: () => void withdraw(), disabled: busy, children: "Withdraw this task" }) })] })) : (_jsxs("p", { style: { margin: 0, color: '#475569' }, children: ["No class task is set. Each student in ", className, " currently gets their own task and chooses the genre."] })), _jsxs("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }, children: [_jsxs("label", { style: fieldStyle, children: ["Genre", _jsx("select", { value: genre, onChange: (event) => setGenre(event.target.value), style: controlStyle, disabled: busy, children: GENRES.map((item) => _jsx("option", { value: item.value, children: item.label }, item.value)) })] }), _jsxs("label", { style: { ...fieldStyle, flex: '1 1 220px', minWidth: 0 }, children: ["Task", options?.grade ? ` (Grade ${options.grade})` : '', _jsx("select", { value: promptId, onChange: (event) => setPromptId(event.target.value), style: controlStyle, disabled: busy || !options || options.tasks.length === 0, children: (options?.tasks ?? []).map((task) => (_jsxs("option", { value: task.prompt_id, children: [task.custom ? 'Yours: ' : '', task.title.split('·').pop()?.trim() || task.title] }, task.prompt_id))) })] }), _jsxs("label", { style: fieldStyle, children: ["Open for", _jsx("select", { value: days, onChange: (event) => setDays(Number(event.target.value)), style: controlStyle, disabled: busy, children: DURATIONS.map((item) => _jsx("option", { value: item.days, children: item.label }, item.days)) })] })] }), _jsx("div", { children: _jsx("button", { type: "button", className: "writing-monitor__text-button", onClick: () => setWritingOwn((current) => !current), disabled: busy, children: writingOwn ? 'Cancel writing my own task' : 'Or write my own task' }) }), writingOwn ? (_jsxs("div", { "data-testid": "writing-class-own-task", style: { display: 'grid', gap: 10, border: '1px solid #cbd5e1', borderRadius: 10, padding: 14 }, children: [_jsx("p", { style: { margin: 0, color: '#475569', fontSize: 14 }, children: "Your task uses the standard word limit, time and marking criteria for this grade and genre. It goes to students exactly as you write it, so check it before you set it." }), _jsxs("label", { style: fieldStyle, children: ["Short name", _jsx("input", { value: ownTitle, maxLength: 60, onChange: (event) => setOwnTitle(event.target.value), placeholder: "School trip to Issyk-Kul", style: controlStyle, disabled: busy })] }), _jsxs("label", { style: fieldStyle, children: ["Situation", _jsx("textarea", { value: ownSituation, maxLength: 600, rows: 3, onChange: (event) => setOwnSituation(event.target.value), placeholder: "Your class went on a trip last week and the school wants to know how it went.", style: controlStyle, disabled: busy })] }), _jsxs("label", { style: fieldStyle, children: ["Who the student writes for", _jsx("input", { value: ownReader, maxLength: 80, onChange: (event) => setOwnReader(event.target.value), placeholder: "the head teacher", style: controlStyle, disabled: busy })] }), ownPoints.map((point, index) => (_jsxs("label", { style: fieldStyle, children: ["Point ", index + 1, " the student must cover", index === 2 ? ' (optional)' : '', _jsx("input", { value: point, maxLength: 120, onChange: (event) => setOwnPoints((current) => current.map((item, i) => (i === index ? event.target.value : item))), placeholder: ['describe what you did', 'explain what you learned', 'suggest one improvement for next time'][index], style: controlStyle, disabled: busy })] }, `point-${index}`))), _jsx("div", { children: _jsx("button", { type: "button", className: "writing-monitor__secondary-button", onClick: () => void saveOwnTask(), disabled: busy, children: busy ? 'Saving…' : 'Save my task' }) })] })) : null, selectedTask ? (_jsxs("blockquote", { style: { margin: 0, padding: '10px 14px', borderLeft: '4px solid #2563eb', background: '#f8fafc', borderRadius: 6, lineHeight: 1.55 }, children: [selectedTask.prompt_text, _jsxs("div", { style: { color: '#475569', fontSize: 14, marginTop: 6 }, children: ["About ", selectedTask.target_word_count, " words \u00B7 ", selectedTask.time_limit_minutes, " minutes"] })] })) : options && options.tasks.length === 0 ? (_jsx("p", { style: { margin: 0, color: '#b45309' }, children: "No approved tasks were found for this class. Check that the students have a grade recorded." })) : null, _jsxs("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }, children: [_jsx("button", { type: "button", className: "writing-monitor__primary-button", onClick: () => void assign(), disabled: busy || !selectedTask, children: busy ? 'Saving…' : current ? 'Replace the class task' : `Set this task for ${className}` }), message ? _jsx("span", { role: "status", style: { color: '#166534' }, children: message }) : null, error ? _jsx("span", { role: "alert", style: { color: '#b91c1c' }, children: error }) : null] }), drafts.length > 0 ? (_jsxs("details", { "data-testid": "writing-class-drafts", children: [_jsxs("summary", { style: { cursor: 'pointer', fontWeight: 700 }, children: ["Drafts in progress (", drafts.length, ")"] }), _jsx("p", { style: { margin: '8px 0', color: '#475569', fontSize: 14 }, children: "Work students have started but not submitted. It is saved automatically as they write." }), _jsx("div", { style: { display: 'grid', gap: 10 }, children: drafts.map((item) => (_jsxs("details", { style: { border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }, children: [_jsxs("summary", { style: { cursor: 'pointer' }, children: [_jsx("strong", { children: item.student_name }), ' · ', item.task_title.split('·').pop()?.trim() || item.task_title, ' · ', item.draft.trim().split(/\s+/).filter(Boolean).length, " words", ' · saved ', formatDate(item.updated_at), item.tab_change_count > 0 ? ` · left the tab ${item.tab_change_count} ${item.tab_change_count === 1 ? 'time' : 'times'}` : ''] }), _jsx("p", { style: { margin: '8px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.55 }, children: item.draft })] }, `${item.student_id}:${item.prompt_id}`))) })] })) : null] }));
};
export default WritingClassTaskPanel;
