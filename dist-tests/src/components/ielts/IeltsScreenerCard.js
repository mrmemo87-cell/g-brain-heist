import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { responseCoverage, coverageLabel } from '../../../services/ieltsResponseCoverage.js';
import { startingPointRoute, } from '../../../services/ieltsStartingPointService.js';
import IeltsSkillIcon from './IeltsSkillIcon.js';
export const IeltsScreenerCard = ({ skill, entry, evidence, speakingAvailable, recordLoaded = false, onNavigate, }) => {
    const title = skill[0].toUpperCase() + skill.slice(1);
    const speaking = skill === 'speaking';
    const completed = speaking
        ? evidence?.status === 'submitted'
        : entry?.status === 'completed';
    const resume = speaking
        ? evidence?.status === 'in_progress'
        : entry?.status === 'in_progress';
    const expired = entry?.status === 'expired';
    const productive = skill === 'writing' || speaking;
    const coverage = responseCoverage(evidence?.items_answered, evidence?.total);
    const needsEvidence = completed && !productive && coverage !== 'complete';
    const discoveryRoute = startingPointRoute(skill);
    const savedRoute = evidence
        ? startingPointRoute(skill, evidence)
        : entry?.attempt_id && completed
            ? startingPointRoute(skill, {
                attempt_id: entry.attempt_id,
            })
            : entry?.assignment_id
                ? `/ielts/exam/${entry.exam_event_id}`
                : discoveryRoute;
    const status = completed
        ? productive
            ? evidence?.review
                ? 'Feedback ready'
                : 'Awaiting review'
            : coverageLabel(coverage)
        : resume
            ? 'In progress'
            : expired
                ? 'Time ended'
                : entry?.status === 'ready'
                    ? 'Ready to start'
                    : speaking && speakingAvailable
                        ? 'Arrange interview'
                        : entry?.status === 'paused'
                            ? 'Paused'
                            : entry?.status === 'scheduled'
                                ? 'Scheduled'
                                : 'Not available';
    const resultPending = completed && !productive && recordLoaded && !evidence;
    const action = resultPending
        ? 'View saved work'
        : completed
            ? productive
                ? evidence?.review
                    ? 'View teacher feedback'
                    : 'View saved work'
                : 'View saved result'
            : resume
                ? speaking
                    ? 'Open saved interview'
                    : 'Resume check'
                : expired
                    ? 'Open saved attempt'
                    : speaking && speakingAvailable
                        ? 'Open Speaking interview'
                        : entry?.status === 'ready'
                            ? `Start ${title} check`
                            : 'Check availability';
    const route = resultPending && entry
        ? `/ielts/exam/${entry.exam_event_id}`
        : completed
            ? savedRoute
            : resume || expired
                ? speaking
                    ? savedRoute
                    : `/ielts/exam/${entry.exam_event_id}`
                : discoveryRoute;
    return (_jsxs("article", { "aria-label": `${title} screener`, className: "ij-skill-card", children: [_jsxs("div", { className: "ij-card-heading", children: [_jsx("span", { className: `ij-icon ij-${skill}`, children: _jsx(IeltsSkillIcon, { skill: skill }) }), _jsx("span", { className: `ij-status ${completed && !needsEvidence ? 'ij-status-saved' : ''}`, children: resultPending ? 'Result pending' : status })] }), _jsx("h3", { children: title }), _jsx("p", { children: skill === 'writing'
                    ? 'One essay · Academic Task 2 · Minimum 250 words'
                    : skill === 'reading'
                        ? 'Two passages · 12 questions · Academic Reading'
                        : speaking
                            ? 'Three parts · A recorded interview with your teacher'
                            : 'Three recordings · 12 questions · Pause and replay available' }), _jsxs("span", { className: "ij-meta", children: [speaking
                        ? 'Teacher-led'
                        : entry
                            ? `${entry.duration_minutes} minutes`
                            : 'Short check', completed && ' · Saved', productive && completed && ' · Confidence: low'] }), evidence && (skill === 'listening' || skill === 'reading') && (_jsxs("strong", { className: "ij-result", children: [evidence.raw_score, " / ", evidence.total, _jsxs("small", { children: ["Recorded score \u00B7 ", evidence.items_answered ?? 'Unknown', " of ", evidence.total, " answered \u00B7 Confidence: low"] })] })), _jsx("p", { className: "ij-card-note", children: completed
                    ? productive
                        ? evidence?.review
                            ? 'Your teacher’s comments and next practice step are ready.'
                            : 'Your work is saved. Your teacher will share feedback after review.'
                        : needsEvidence
                            ? 'This record needs teacher review and a fresh check. Missing responses do not show inability. Complete the other available screeners meanwhile.'
                            : resultPending
                                ? 'Your answers are saved. Your result is not available yet.'
                                : 'Your answers are saved. Open your record to see the result.'
                    : resume
                        ? speaking
                            ? 'Continue this interview with your teacher.'
                            : 'Continue your saved attempt with its remaining time.'
                        : expired
                            ? 'Your timer has ended. Open the saved attempt to confirm its status, then ask your teacher about a fresh check.'
                            : 'Build your starting point and find a useful practice focus.' }), evidence?.conditions_need_review && (_jsx("p", { className: "ij-conditions", children: "Assessment conditions need teacher attention. Your saved record has the details." })), _jsx("button", { type: "button", className: completed && !(productive && evidence?.review) ? "ij-primary ij-primary--quiet" : "ij-primary", onClick: () => onNavigate(route), children: action }), completed && (_jsxs("details", { className: "ij-repeat", children: [_jsx("summary", { children: speaking ? 'About further practice' : 'Repeat for practice' }), _jsx("p", { children: "Repeats use the same task and do not measure improvement. A fresh check is needed to compare progress." }), !speaking && (_jsx("button", { type: "button", className: "ij-link", onClick: () => onNavigate(discoveryRoute), children: "Open practice repeat" })), speaking && _jsx("p", { children: "Arrange further practice with your teacher." })] }))] }));
};
