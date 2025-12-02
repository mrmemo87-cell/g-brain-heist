import React from 'react';
import { useNavigate } from 'react-router-dom';

const IeltsHome: React.FC = () => {
  const navigate = useNavigate();
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

  const getLevelColor = (level: string) => {
    switch(level) {
      case 'Beginner': return 'bg-emerald-100 text-emerald-700 border-emerald-300';
      case 'Intermediate': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'Advanced': return 'bg-amber-100 text-amber-700 border-amber-300';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      {/* Header - Clean, Professional */}
      <div className="border-b" style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
        <div className="max-w-7xl mx-auto px-8 py-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-lg flex items-center justify-center text-3xl" style={{ backgroundColor: '#F0F9FF' }}>
              📚
            </div>
            <div>
              <p className="text-xs font-bold tracking-wider" style={{ color: '#6B7280' }}>IELTS EXAM PREPARATION</p>
              <h1 className="text-4xl font-bold" style={{ color: '#111827' }}>IELTS Prep Center</h1>
            </div>
          </div>
          <p className="text-lg" style={{ color: '#374151' }}>Master all four skills with structured practice, expert feedback, and proven strategies. Start free or upgrade to Prime for full mock tests.</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-8 py-16">
        {/* Section Introduction */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold mb-3" style={{ color: '#111827' }}>Practice by Skill</h2>
          <p className="text-lg mb-6" style={{ color: '#6B7280' }}>Choose your skill focus and start practicing today. Each section includes free sample questions to help you prepare.</p>
          <div className="flex gap-3 flex-wrap">
            <div className="px-4 py-2 rounded-full text-sm font-semibold" style={{ backgroundColor: '#DBEAFE', color: '#1E40AF' }}>✓ Free to Start</div>
            <div className="px-4 py-2 rounded-full text-sm font-semibold" style={{ backgroundColor: '#CCFBF1', color: '#0D9488' }}>✓ Expert Content</div>
            <div className="px-4 py-2 rounded-full text-sm font-semibold" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>✓ Proven Results</div>
          </div>
        </div>

        {/* Skills Grid */}
        <div className="grid gap-12">
          {/* Reading */}
          <div>
            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div className="flex items-start gap-6 mb-8">
                <div className="w-16 h-16 rounded-lg flex items-center justify-center text-4xl flex-shrink-0" style={{ backgroundColor: '#EFF6FF' }}>
                  📚
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2" style={{ color: '#111827' }}>Reading</h3>
                  <p style={{ color: '#6B7280' }}>Three passages with comprehension questions. Build speed and accuracy in extracting key information.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {readingSets?.map((set) => (
                  <button
                    key={set.id}
                    onClick={() => navigate(`/ielts/reading/${set.id}`)}
                    style={{ 
                      backgroundColor: '#FFFFFF !important',
                      border: '2px solid #E5E7EB',
                      borderRadius: '12px',
                      padding: '20px',
                      width: '100%',
                      textAlign: 'left',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      color: '#111827 !important',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                      cursor: 'pointer',
                      transform: 'translateY(0)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#3B82F6';
                      e.currentTarget.style.backgroundColor = '#F0F9FF !important';
                      e.currentTarget.style.boxShadow = '0 12px 24px rgba(59, 130, 246, 0.15)';
                      e.currentTarget.style.transform = 'translateY(-4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#E5E7EB';
                      e.currentTarget.style.backgroundColor = '#FFFFFF !important';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div className="flex flex-col h-full">
                      <div className="mb-3 text-3xl">📖</div>
                      <div className="flex-grow">
                        <p className="font-bold text-lg" style={{ color: '#000000 !important' }}>{set.title}</p>
                        <p className="text-sm mt-2" style={{ color: '#374151 !important' }}>{set.description}</p>
                      </div>
                      <div className="mt-4 pt-4 border-t" style={{ borderColor: '#E5E7EB' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: '#0369A1', color: '#FFFFFF !important' }}>
                            Band {set.est_band_min}-{set.est_band_max}
                          </span>
                          <span className="text-xs font-bold" style={{ color: '#0369A1 !important' }}>{set.level}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Listening */}
          <div>
            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div className="flex items-start gap-6 mb-8">
                <div className="w-16 h-16 rounded-lg flex items-center justify-center text-4xl flex-shrink-0" style={{ backgroundColor: '#F3E8FF' }}>
                  🎧
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2" style={{ color: '#111827' }}>Listening</h3>
                  <p style={{ color: '#6B7280' }}>Four sections with real-world audio. Develop note-taking skills and improve concentration.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {listeningSets?.map((set) => (
                  <button
                    key={set.id}
                    onClick={() => navigate(`/ielts/listening/${set.id}`)}
                    style={{ 
                      backgroundColor: '#FFFFFF !important',
                      border: '2px solid #E5E7EB',
                      borderRadius: '12px',
                      padding: '20px',
                      width: '100%',
                      textAlign: 'left',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      color: '#111827 !important',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                      cursor: 'pointer',
                      transform: 'translateY(0)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#A855F7';
                      e.currentTarget.style.backgroundColor = '#FAF5FF !important';
                      e.currentTarget.style.boxShadow = '0 12px 24px rgba(168, 85, 247, 0.15)';
                      e.currentTarget.style.transform = 'translateY(-4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#E5E7EB';
                      e.currentTarget.style.backgroundColor = '#FFFFFF !important';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div className="flex flex-col h-full">
                      <div className="mb-3 text-3xl">🎧</div>
                      <div className="flex-grow">
                        <p className="font-bold text-lg" style={{ color: '#000000 !important' }}>{set.title}</p>
                        <p className="text-sm mt-2" style={{ color: '#374151 !important' }}>{set.description}</p>
                      </div>
                      <div className="mt-4 pt-4 border-t" style={{ borderColor: '#E5E7EB' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: '#9333EA', color: '#FFFFFF !important' }}>
                            Band {set.est_band_min}-{set.est_band_max}
                          </span>
                          <span className="text-xs font-bold" style={{ color: '#7E22CE !important' }}>{set.level}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Writing */}
          <div>
            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div className="flex items-start gap-6 mb-8">
                <div className="w-16 h-16 rounded-lg flex items-center justify-center text-4xl flex-shrink-0" style={{ backgroundColor: '#F0FDF4' }}>
                  ✍️
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2" style={{ color: '#111827' }}>Writing</h3>
                  <p style={{ color: '#6B7280' }}>Task 1 (graphs) and Task 2 (essays) with detailed feedback on grammar, vocabulary, and structure.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {writingTasks?.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => navigate(`/ielts/writing/${task.id}`)}
                    style={{ 
                      backgroundColor: '#FFFFFF !important',
                      border: '2px solid #E5E7EB',
                      borderRadius: '12px',
                      padding: '20px',
                      width: '100%',
                      textAlign: 'left',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      color: '#111827 !important',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                      cursor: 'pointer',
                      transform: 'translateY(0)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#10B981';
                      e.currentTarget.style.backgroundColor = '#F0FDF4 !important';
                      e.currentTarget.style.boxShadow = '0 12px 24px rgba(16, 185, 129, 0.15)';
                      e.currentTarget.style.transform = 'translateY(-4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#E5E7EB';
                      e.currentTarget.style.backgroundColor = '#FFFFFF !important';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div className="flex flex-col h-full">
                      <div className="mb-3 text-3xl">✍️</div>
                      <div className="flex-grow">
                        <p className="font-bold text-lg" style={{ color: '#000000 !important' }}>{task.title}</p>
                        <p className="text-sm mt-2" style={{ color: '#374151 !important' }}>{task.prompt.substring(0, 80)}...</p>
                      </div>
                      <div className="mt-4 pt-4 border-t" style={{ borderColor: '#E5E7EB' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: '#059669', color: '#FFFFFF !important' }}>
                            Target: {task.bands_target}
                          </span>
                          <span className="text-xs font-bold" style={{ color: '#047857 !important' }}>{task.task_type === 'task1' ? 'Task 1' : 'Task 2'}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Speaking */}
          <div>
            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div className="flex items-start gap-6 mb-8">
                <div className="w-16 h-16 rounded-lg flex items-center justify-center text-4xl flex-shrink-0" style={{ backgroundColor: '#FEF2F2' }}>
                  🎤
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2" style={{ color: '#111827' }}>Speaking</h3>
                  <p style={{ color: '#6B7280' }}>3-part interview simulation with instant AI feedback on pronunciation, fluency, and coherence.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {speakingTasks?.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => navigate(`/ielts/speaking/${task.id}`)}
                    style={{ 
                      backgroundColor: '#FFFFFF !important',
                      border: '2px solid #E5E7EB',
                      borderRadius: '12px',
                      padding: '20px',
                      width: '100%',
                      textAlign: 'left',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      color: '#111827 !important',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                      cursor: 'pointer',
                      transform: 'translateY(0)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#DC2626';
                      e.currentTarget.style.backgroundColor = '#FEF2F2 !important';
                      e.currentTarget.style.boxShadow = '0 12px 24px rgba(220, 38, 38, 0.15)';
                      e.currentTarget.style.transform = 'translateY(-4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#E5E7EB';
                      e.currentTarget.style.backgroundColor = '#FFFFFF !important';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div className="flex flex-col h-full">
                      <div className="mb-3 text-3xl">🎤</div>
                      <div className="flex-grow">
                        <p className="font-bold text-lg" style={{ color: '#000000 !important' }}>Part {task.part}: {task.prompt}</p>
                        <p className="text-sm mt-2" style={{ color: '#374151 !important' }}>Record and get instant AI-powered feedback</p>
                      </div>
                      <div className="mt-4 pt-4 border-t" style={{ borderColor: '#E5E7EB' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: '#DC2626', color: '#FFFFFF !important' }}>
                            Part {task.part}
                          </span>
                          <span className="text-xs font-bold" style={{ color: '#B91C1C !important' }}>Interview</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer CTA - Premium */}
        <div className="mt-20 p-12 rounded-2xl text-center" style={{ 
          background: 'linear-gradient(135deg, #0369A1 0%, #0C4A6E 100%)',
          boxShadow: '0 20px 60px rgba(3, 105, 161, 0.3)'
        }}>
          <h3 className="text-4xl font-bold mb-4" style={{ color: '#FFFFFF' }}>Unlock Your Full Potential</h3>
          <p className="mb-8 text-lg" style={{ color: '#BAE6FD' }}>Upgrade to Prime and get unlimited mock tests, expert feedback, and official certificates. Limited spots available!</p>
          
          <button style={{ 
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            color: '#FFFFFF !important',
            fontWeight: 'bold',
            padding: '16px 48px',
            borderRadius: '12px',
            border: 'none',
            fontSize: '18px',
            cursor: 'pointer',
            transition: 'all 0.3s',
            boxShadow: '0 8px 25px rgba(5, 150, 105, 0.4)',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-3px)';
            e.currentTarget.style.boxShadow = '0 12px 35px rgba(5, 150, 105, 0.6)';
            e.currentTarget.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 8px 25px rgba(5, 150, 105, 0.4)';
            e.currentTarget.style.background = 'linear-gradient(135deg, #059669 0%, #047857 100%)';
          }}
          >
            Explore Prime Membership
          </button>
        </div>
      </div>
    </div>
  );
};

export default IeltsHome;
