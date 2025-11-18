import React from 'react';

const IeltsHome: React.FC = () => {
  // Sample data for display (will be replaced with real data after DB migration)
  const readingSets = [
    { id: 1, title: 'Working from Home', description: 'General training passage on remote work', level: 'Beginner', est_band_min: 4.5, est_band_max: 6.0 },
    { id: 2, title: 'The History of Coffee', description: 'Academic passage on coffee origins', level: 'Intermediate', est_band_min: 5.5, est_band_max: 7.0 },
    { id: 3, title: 'Climate Change & Coral Reefs', description: 'Advanced passage on environmental impact', level: 'Advanced', est_band_min: 6.5, est_band_max: 8.0 },
  ];

  const listeningSets = [
    { id: 1, title: 'Travel Agency Conversation', description: 'Customer-agent booking discussion', level: 'Beginner', est_band_min: 4.5, est_band_max: 6.0 },
    { id: 2, title: 'University Orientation Talk', description: 'Campus orientation for new students', level: 'Intermediate', est_band_min: 5.5, est_band_max: 7.0 },
    { id: 3, title: 'Environmental Science Lecture', description: 'Renewable energy academic lecture', level: 'Advanced', est_band_min: 6.5, est_band_max: 8.0 },
  ];

  const writingTasks = [
    { id: 1, title: 'Population Changes Bar Chart', prompt: 'Describe population changes across three cities...', task_type: 'task1', bands_target: '5.0-7.0' },
    { id: 2, title: 'Technology in Education', prompt: 'Discuss technology impact on learning...', task_type: 'task2', bands_target: '5.5-7.5' },
    { id: 3, title: 'Environmental Responsibility', prompt: 'Discuss global vs individual environmental action...', task_type: 'task2', bands_target: '6.0-8.0' },
  ];

  const speakingTasks = [
    { id: 1, part: 1, prompt: 'Describe your hometown' },
    { id: 2, part: 2, prompt: 'Describe a memorable journey' },
    { id: 3, part: 3, prompt: 'Discuss travel and tourism' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Study mode</p>
          <h1 className="text-4xl font-semibold text-slate-900">IELTS Prep Center</h1>
          <p className="mt-2 text-slate-600">Serious practice for General & Academic modules.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
        {/* NEW: 4-Skill Practice System */}
        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Practice by Skill</h2>
            <p className="text-sm text-slate-500">Free sample exercises to build your confidence. Upgrade to Prime for full mock tests.</p>
          </div>

          {/* Reading */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 rounded-lg text-3xl">
                📚
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-slate-900">Reading</h3>
                <p className="text-sm text-slate-600 mt-1">Academic passages with comprehension questions</p>
                <div className="mt-4 space-y-2">
                  {readingSets?.map((set) => (
                    <button
                      key={set.id}
                      onClick={() => alert(`Practice: ${set.title}\n\nThis will open the reading practice interface. Feature coming soon!`)}
                      className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{set.title}</p>
                          <p className="text-sm text-slate-600">{set.description}</p>
                        </div>
                        <div className="text-right">
                          <span className="inline-block px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded">
                            {set.level}
                          </span>
                          <p className="text-xs text-slate-500 mt-1">Band {set.est_band_min}-{set.est_band_max}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Listening */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-purple-100 rounded-lg text-3xl">
                🎧
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-slate-900">Listening</h3>
                <p className="text-sm text-slate-600 mt-1">Audio exercises with note-taking practice</p>
                <div className="mt-4 space-y-2">
                  {listeningSets?.map((set) => (
                    <button
                      key={set.id}
                      onClick={() => alert(`Practice: ${set.title}\n\nThis will open the listening practice interface. Feature coming soon!`)}
                      className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{set.title}</p>
                          <p className="text-sm text-slate-600">{set.description}</p>
                        </div>
                        <div className="text-right">
                          <span className="inline-block px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded">
                            {set.level}
                          </span>
                          <p className="text-xs text-slate-500 mt-1">Band {set.est_band_min}-{set.est_band_max}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Writing */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-100 rounded-lg text-3xl">
                ✍️
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-slate-900">Writing</h3>
                <p className="text-sm text-slate-600 mt-1">Task 1 & Task 2 prompts with expert feedback</p>
                <div className="mt-4 space-y-2">
                  {writingTasks?.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => alert(`Practice: ${task.title}\n\nThis will open the writing practice interface. Feature coming soon!`)}
                      className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{task.title}</p>
                          <p className="text-sm text-slate-600">{task.prompt.substring(0, 100)}...</p>
                        </div>
                        <div className="text-right">
                          <span className="inline-block px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded">
                            {task.task_type === 'task1' ? 'Task 1' : 'Task 2'}
                          </span>
                          <p className="text-xs text-slate-500 mt-1">Target: {task.bands_target}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-orange-100 rounded-lg text-3xl">
                🎤
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-slate-900">Speaking</h3>
                <p className="text-sm text-slate-600 mt-1">Record your responses and get expert feedback</p>
                {(
                  <div className="mt-4 space-y-2">
                    {speakingTasks?.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => alert(`Speaking Task: Part ${task.part}\n\nThis will open the speaking practice interface with recording. Feature coming soon!`)}
                        className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-slate-900">{task.prompt.substring(0, 80)}...</p>
                          </div>
                          <div className="text-right">
                            <span className="inline-block px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded">
                              Part {task.part}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Upgrade CTA */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 text-white">
            <h3 className="text-xl font-semibold">Ready for the Full Experience?</h3>
            <p className="text-sm text-blue-100 mt-2">Upgrade to Prime Prep for full mock tests, detailed feedback, and certificates signed by Brains Heist Academy.</p>
            <button
              onClick={() => alert('Prime Access application coming soon! This will unlock:\n• Full mock tests\n• Expert feedback\n• Official certificates\n• Band score predictions')}
              className="mt-4 px-6 py-2 bg-white text-blue-700 font-medium rounded-lg hover:bg-blue-50 transition-colors"
            >
              Apply for Prime Access
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default IeltsHome;
