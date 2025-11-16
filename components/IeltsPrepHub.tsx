import React from 'react';

interface Highlight {
  title: string;
  description: string;
  icon: string;
}

interface Milestone {
  title: string;
  detail: string;
  color: string;
}

interface IeltsPrepHubProps {
  onBack?: () => void;
}

const highlights: Highlight[] = [
  {
    title: 'Speaking Arena',
    description: 'Timed prompts, peer feedback loops, and AI-hosted speaking drills that simulate the real IELTS interview.',
    icon: '🎙️',
  },
  {
    title: 'Writing Lab',
    description: 'Task 1 + Task 2 scaffolds with progress tracking so students can iterate on their essays with confidence.',
    icon: '✍️',
  },
  {
    title: 'Reading & Listening Ops',
    description: 'Mission-style passages paired with adaptive listening clips keep prep engaging and measurable.',
    icon: '🛰️',
  },
];

const milestones: Milestone[] = [
  { title: 'Daily Missions', detail: 'Micro-tasks tuned to each IELTS band target.', color: 'var(--ion-blue)' },
  { title: 'Coach Hand-Offs', detail: 'Teachers can review submissions directly from the portal.', color: 'var(--amber-warn)' },
  { title: 'Skill Heatmaps', detail: 'Instant clarity on where to focus next.', color: 'var(--plasma-pink)' },
];

const IeltsPrepHub: React.FC<IeltsPrepHubProps> = ({ onBack }) => {
  return (
    <div className="card-glass p-6 md:p-10 space-y-8 animate-fade-in-up">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.4em] text-mist-400">Brains Heist Labs</p>
          <h1 className="font-heading text-4xl md:text-5xl text-white mt-2" style={{ color: 'var(--ion-blue)' }}>
            IELTS Prep HQ
          </h1>
          <p className="text-gray-300 mt-3 max-w-2xl">
            Centralize IELTS readiness inside the game universe. Launch curated missions, monitor readiness, and keep every agent
            aligned on their band goals.
          </p>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="self-start md:self-auto px-5 py-3 rounded-xl font-semibold bg-gray-800/80 border border-gray-600 hover:border-ion-blue transition"
          >
            ⬅️ Back
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {highlights.map((highlight) => (
          <div key={highlight.title} className="bg-black/40 border border-gray-800 rounded-2xl p-5">
            <div className="text-4xl mb-3">{highlight.icon}</div>
            <h3 className="font-heading text-xl text-white mb-2">{highlight.title}</h3>
            <p className="text-gray-300 text-sm leading-relaxed">{highlight.description}</p>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-r from-gray-900/80 to-slate-900/60 rounded-3xl border border-ion-blue/40 p-6">
        <h2 className="font-heading text-2xl mb-3" style={{ color: 'var(--ion-blue)' }}>
          How it plugs into the app
        </h2>
        <p className="text-gray-200 mb-4">
          IELTS Prep sits alongside the quest loop. Students can jump in from the dashboard, teachers can deploy assignments, and
          admins track mastery from one pane of glass.
        </p>
        <div className="flex flex-col gap-4 md:flex-row">
          {milestones.map((milestone) => (
            <div
              key={milestone.title}
              className="flex-1 rounded-2xl border border-gray-800 bg-black/30 p-5 shadow-inner"
              style={{ boxShadow: `0 0 25px ${milestone.color}20` }}
            >
              <h3 className="font-heading text-lg text-white" style={{ color: milestone.color }}>
                {milestone.title}
              </h3>
              <p className="text-gray-300 text-sm mt-2">{milestone.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-gray-800 bg-black/30 p-6">
          <h3 className="font-heading text-2xl text-white">Teacher Toolkit</h3>
          <ul className="mt-4 space-y-3 text-gray-300 text-sm">
            <li>✅ Push IELTS missions to selected batches</li>
            <li>✅ Track writing submissions and give inline feedback</li>
            <li>✅ Unlock bonus raids tied to IELTS milestones</li>
          </ul>
        </div>
        <div className="rounded-3xl border border-gray-800 bg-black/30 p-6">
          <h3 className="font-heading text-2xl text-white">Student Experience</h3>
          <ul className="mt-4 space-y-3 text-gray-300 text-sm">
            <li>⚡ Daily streak rewards for IELTS-specific practice</li>
            <li>🎯 Personalized band targets with guidance</li>
            <li>🧠 Deep dives for listening, reading, writing & speaking</li>
          </ul>
        </div>
      </div>

      <div className="bg-black/40 border border-gray-800 rounded-3xl p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-heading text-2xl text-white">Ready to activate?</h3>
          <p className="text-gray-300 text-sm">Hook this hub to the navigation or preview it right from login.</p>
        </div>
        <div className="flex gap-3">
          <button className="px-5 py-3 rounded-xl font-semibold bg-ion-blue/80 text-gray-900 shadow-lg hover:bg-ion-blue">
            Launch Mission
          </button>
          <button className="px-5 py-3 rounded-xl font-semibold border border-gray-600 hover:border-ion-blue text-white">
            View Docs
          </button>
        </div>
      </div>
    </div>
  );
};

export default IeltsPrepHub;

