/** Original AI-assisted Brains Heist draft. Human approval is intentionally absent. */
export const WRITING_SCREENER_A_DRAFT = {
  code: 'bh-writing-screener-a', contentVersion: '0.1.0', packageId: 'BH-WS-A-1',
  title: 'Academic Writing Screener A', durationMinutes: 40, minimumWords: 250,
  prompt: 'Some people believe that schools should give students more time to explore subjects they choose themselves. Others believe that schools should spend that time teaching a common set of subjects to every student.\n\nDiscuss both views and give your own opinion.',
  instructions: 'Write an essay in response to the task below. Explain your ideas and support them with relevant reasons and examples. Write at least 250 words. You have 40 minutes, including time to plan and check your work.',
  provenance: {
    author: 'Brains Heist / AI-assisted original draft', rights_holder: 'Brains Heist LLC',
    rights_basis: 'Original Brains Heist task; no third-party sample task reproduced.', content_version: '0.1.0 / BH-WS-A-1',
    criterion_mappings: {
      task_response: ['eng.writing.content-development.task-relevance','eng.writing.content-development.develop-ideas','eng.writing.content-development.support-examples'],
      coherence_cohesion: ['eng.writing.organization-cohesion.logical-order','eng.writing.organization-cohesion.paragraphing','eng.writing.organization-cohesion.reference'],
      lexical_resource: ['eng.writing.vocabulary-control.precision','eng.writing.vocabulary-control.range','eng.writing.vocabulary-control.collocation'],
      grammar_range_accuracy: ['eng.writing.sentence-control.variety','eng.writing.grammar-control.accuracy','eng.writing.mechanics.punctuation'],
    },
  },
} as const;
