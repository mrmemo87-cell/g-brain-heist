import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { listWritingPrompts, } from '../../lib/brains_heist/writingIntegrationService.js';
import { parseAdminDrilldownFilters } from '../../lib/brains_heist/writingAdminFilters.js';
import { WRITING_ADMIN_HELP } from '../../lib/brains_heist/writingAdminHelp.js';
export const WritingPromptBankManager = ({ gradeFilter, genreFilter, difficultyFilter, activeFilter, isLoading = false, errorMessage, filterQuery = '', }) => {
    if (isLoading) {
        return _jsx("div", { style: { padding: 12, color: '#e5e7eb' }, children: "Loading prompt bank\u2026" });
    }
    if (errorMessage) {
        return _jsxs("div", { style: { padding: 12, color: '#fca5a5' }, children: ["Unable to load prompt bank: ", errorMessage] });
    }
    const filters = parseAdminDrilldownFilters(filterQuery);
    const prompts = listWritingPrompts({
        grade: filters.grade ?? gradeFilter,
        genre: filters.genre ?? genreFilter,
        difficulty_label: filters.difficulty ?? difficultyFilter,
        is_active: filters.active ? filters.active === 'true' : activeFilter,
        prompt_quality_flag: filters.status,
    });
    if (!prompts.ok || !prompts.data) {
        return _jsx("div", { style: { padding: 12, color: '#e5e7eb' }, children: "Prompt bank unavailable." });
    }
    const promptRows = filters.prompt_id ? prompts.data.filter((prompt) => prompt.id === filters.prompt_id) : prompts.data;
    if (promptRows.length === 0) {
        return _jsxs("div", { style: { padding: 12, color: '#e5e7eb' }, children: ["No prompts found for filters (", filterQuery || 'none', ")."] });
    }
    return (_jsxs("div", { style: { padding: 12, color: '#e5e7eb', display: 'grid', gap: 10 }, children: [_jsx("h2", { style: { margin: 0 }, children: "Writing Prompt Bank Manager" }), _jsx("small", { children: WRITING_ADMIN_HELP.overused_prompt }), _jsx("div", { style: { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }, children: promptRows.map((prompt) => (_jsxs("article", { style: { border: '1px solid #334155', borderRadius: 10, background: '#111827', padding: 10, display: 'grid', gap: 6 }, children: [_jsx("strong", { children: prompt.title }), _jsx("span", { children: prompt.prompt_text }), _jsxs("span", { children: [prompt.genre, " \u2022 Grade ", prompt.grade_band, " \u2022 ", prompt.difficulty_label] }), _jsxs("span", { children: ["Word count target: ", prompt.target_word_count] }), _jsxs("span", { children: ["Tags: ", prompt.curriculum_tags.join(', ') || 'None'] }), _jsxs("span", { children: ["Safety: ", prompt.safety_status] }), _jsxs("span", { children: ["Quality flag: ", prompt.prompt_quality_flag] }), _jsxs("span", { children: ["Status: ", prompt.is_archived ? 'Archived' : prompt.is_active ? 'Active' : 'Inactive'] }), _jsxs("span", { children: ["Usage count: ", prompt.usage_count] }), _jsxs("span", { children: ["Last used: ", prompt.rotation_metadata.last_used_at ?? 'Never'] })] }, prompt.id))) })] }));
};
export default WritingPromptBankManager;
