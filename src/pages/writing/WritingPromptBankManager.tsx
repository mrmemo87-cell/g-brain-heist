import React from 'react';
import {
  PromptDifficultyLabel,
  listWritingPrompts,
} from '../../lib/brains_heist/writingIntegrationService.js';
import { SupportedGenre } from '../../lib/brains_heist/writingAssessment.js';
import { parseAdminDrilldownFilters } from '../../lib/brains_heist/writingAdminFilters.js';
import { WRITING_ADMIN_HELP } from '../../lib/brains_heist/writingAdminHelp.js';

interface WritingPromptBankManagerProps {
  gradeFilter?: number;
  genreFilter?: SupportedGenre;
  difficultyFilter?: PromptDifficultyLabel;
  activeFilter?: boolean;
  isLoading?: boolean;
  errorMessage?: string;
  filterQuery?: string;
}

export const WritingPromptBankManager: React.FC<WritingPromptBankManagerProps> = ({
  gradeFilter,
  genreFilter,
  difficultyFilter,
  activeFilter,
  isLoading = false,
  errorMessage,
  filterQuery = '',
}) => {
  if (isLoading) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>Loading prompt bank…</div>;
  }

  if (errorMessage) {
    return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load prompt bank: {errorMessage}</div>;
  }

  const filters = parseAdminDrilldownFilters(filterQuery);
  const prompts = listWritingPrompts({
    grade: filters.grade ?? gradeFilter,
    genre: (filters.genre as SupportedGenre | undefined) ?? genreFilter,
    difficulty_label: (filters.difficulty as PromptDifficultyLabel | undefined) ?? difficultyFilter,
    is_active: filters.active ? filters.active === 'true' : activeFilter,
    prompt_quality_flag: filters.status as 'ok' | 'questionable' | 'needs_calibration_review' | undefined,
  });

  if (!prompts.ok || !prompts.data) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>Prompt bank unavailable.</div>;
  }

  const promptRows = filters.prompt_id ? prompts.data.filter((prompt) => prompt.id === filters.prompt_id) : prompts.data;
  if (promptRows.length === 0) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>No prompts found for filters ({filterQuery || 'none'}).</div>;
  }

  return (
    <div style={{ padding: 12, color: '#e5e7eb', display: 'grid', gap: 10 }}>
      <h2 style={{ margin: 0 }}>Writing Prompt Bank Manager</h2>
      <small>{WRITING_ADMIN_HELP.overused_prompt}</small>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {promptRows.map((prompt) => (
          <article
            key={prompt.id}
            style={{ border: '1px solid #334155', borderRadius: 10, background: '#111827', padding: 10, display: 'grid', gap: 6 }}
          >
            <strong>{prompt.title}</strong>
            <span>{prompt.prompt_text}</span>
            <span>
              {prompt.genre} • Grade {prompt.grade_band} • {prompt.difficulty_label}
            </span>
            <span>Word count target: {prompt.target_word_count}</span>
            <span>Tags: {prompt.curriculum_tags.join(', ') || 'None'}</span>
            <span>Safety: {prompt.safety_status}</span>
            <span>Quality flag: {prompt.prompt_quality_flag}</span>
            <span>Status: {prompt.is_archived ? 'Archived' : prompt.is_active ? 'Active' : 'Inactive'}</span>
            <span>Usage count: {prompt.usage_count}</span>
            <span>Last used: {prompt.rotation_metadata.last_used_at ?? 'Never'}</span>
          </article>
        ))}
      </div>
    </div>
  );
};

export default WritingPromptBankManager;
