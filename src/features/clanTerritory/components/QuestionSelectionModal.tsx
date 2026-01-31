import React, { useState, useEffect } from "react";
import { supabase } from "../../../../services/supabaseClient";

interface Question {
  id: string;
  question_text: string;
  subject: string;
  topic?: string;
  difficulty: string;
  correct_answer: string;
  options?: string[];
  question_type?: string;
}

interface QuestionSelectionModalProps {
  onConfirm: (questions: Question[]) => void;
  onCancel: () => void;
  restrictedSubjects?: string[];
}

export const QuestionSelectionModal: React.FC<QuestionSelectionModalProps> = ({
  onConfirm,
  onCancel,
  restrictedSubjects,
}) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      console.log("🔍 Fetching questions from questions table...");
      
      const { data, error } = await supabase
        .from("questions")
        .select("*")
        .order("created_at", { ascending: false });

      console.log("📊 Raw query result:", { 
        data: data?.slice(0, 3), // Show first 3 for debugging
        error, 
        totalCount: data?.length,
        hasData: !!data,
        errorCode: error?.code,
        errorMessage: error?.message,
        errorDetails: error?.details
      });

      if (error) {
        console.error("❌ Supabase error:", error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.warn("⚠️ No questions returned from database. Check:");
        console.warn("  1. RLS policies on teacher_questions table");
        console.warn("  2. User is authenticated");
        console.warn("  3. Questions exist in the database");
        
        // Check auth status
        const { data: { user } } = await supabase.auth.getUser();
        console.log("🔐 Current user:", user?.id, user?.email);
      }

      // Filter questions by restricted subjects if provided
      let filteredData = data || [];
      if (restrictedSubjects && restrictedSubjects.length > 0) {
        filteredData = filteredData.filter((q: Question) => 
          restrictedSubjects.some(s => s.toLowerCase() === q.subject?.toLowerCase())
        );
        console.log(`🔒 Filtered to ${filteredData.length} questions for subjects:`, restrictedSubjects);
      }
      
      setQuestions(filteredData);
      
      // Extract unique subjects (only from filtered questions)
      let uniqueSubjects = [...new Set(filteredData.map((q: Question) => q.subject).filter(Boolean))] as string[];
      
      // If restricted, ensure only those subjects appear
      if (restrictedSubjects && restrictedSubjects.length > 0) {
        uniqueSubjects = uniqueSubjects.filter(s => 
          restrictedSubjects.some(rs => rs.toLowerCase() === s.toLowerCase())
        );
      }
      setSubjects(uniqueSubjects);
      
      // Extract unique topics from filtered questions
      const uniqueTopics = [...new Set(filteredData.map((q: Question) => q.topic).filter(Boolean))] as string[];
      setTopics(uniqueTopics);
      
      console.log(`✅ Loaded ${filteredData.length} questions (filtered from ${data?.length || 0} total)`);
      console.log(`📚 Subjects:`, uniqueSubjects);
      console.log(`🏷️ Topics:`, uniqueTopics);
    } catch (error) {
      console.error("❌ Failed to fetch questions:", error);
      alert(`Failed to load questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleQuestion = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allFilteredIds = new Set(filteredQuestions.map((q) => q.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      allFilteredIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleClearAll = () => {
    const allFilteredIds = new Set(filteredQuestions.map((q) => q.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      allFilteredIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleConfirm = () => {
    const selected = questions.filter((q) => selectedIds.has(q.id));
    if (selected.length === 0) {
      alert("Please select at least one question.");
      return;
    }
    onConfirm(selected);
  };

  // Update topics when subject changes
  useEffect(() => {
    if (subjectFilter === "all") {
      const allTopics = [...new Set(questions.map((q) => q.topic).filter(Boolean))] as string[];
      setTopics(allTopics);
    } else {
      const filteredTopics = [...new Set(
        questions.filter((q) => q.subject === subjectFilter).map((q) => q.topic).filter(Boolean)
      )] as string[];
      setTopics(filteredTopics);
    }
    setTopicFilter("all");
  }, [subjectFilter, questions]);

  const filteredQuestions = questions.filter((q) => {
    if (subjectFilter !== "all" && q.subject !== subjectFilter) return false;
    if (topicFilter !== "all" && q.topic !== topicFilter) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-3xl font-black text-white">Select Battle Questions</h2>
          <p className="text-slate-400 mt-1">
            Choose questions from your library. Students will answer these during combat.
          </p>
        </div>

        <div className="p-6 border-b border-slate-800">
          <div className="flex gap-4 items-center mb-4">
            <div className="flex-1">
              <label className="block text-xs text-slate-400 font-semibold mb-1">Subject</label>
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
              >
                <option value="all">All Subjects</option>
                {subjects.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-slate-400 font-semibold mb-1">Topic</label>
              <select
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
                disabled={topics.length === 0}
              >
                <option value="all">All Topics</option>
                {topics.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-right">
              <label className="block text-xs text-slate-400 font-semibold mb-1">Selected</label>
              <div className="text-2xl font-bold text-white">{selectedIds.size}</div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Showing {filteredQuestions.length} of {questions.length} questions
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                disabled={filteredQuestions.length === 0}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Select All ({filteredQuestions.length})
              </button>
              <button
                onClick={handleClearAll}
                disabled={filteredQuestions.length === 0 || selectedIds.size === 0}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center text-slate-400 py-12">
              <div className="animate-spin w-8 h-8 border-4 border-slate-600 border-t-white rounded-full mx-auto mb-4" />
              Loading questions...
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="text-center text-slate-400 py-12">
              <p className="text-xl mb-2">No questions found</p>
              <p className="text-sm">Create questions in your library first.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQuestions.map((q) => {
                const isSelected = selectedIds.has(q.id);
                return (
                  <div
                    key={q.id}
                    onClick={() => toggleQuestion(q.id)}
                    className={`border rounded-xl p-4 cursor-pointer transition-all ${
                      isSelected
                        ? "bg-blue-900/30 border-blue-500"
                        : "bg-slate-800/50 border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="mt-1 w-5 h-5 rounded"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {(q.topic || q.subject) && (
                            <span className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded">
                              {q.topic || q.subject}
                            </span>
                          )}
                          {q.question_type && (
                            <span className="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded uppercase">
                              {q.question_type.replace('_', ' ')}
                            </span>
                          )}
                          {q.difficulty && (
                            <span
                              className={`px-2 py-1 text-xs rounded uppercase ${
                                q.difficulty === "hard"
                                  ? "bg-red-900/50 text-red-300"
                                  : q.difficulty === "medium"
                                  ? "bg-yellow-900/50 text-yellow-300"
                                  : "bg-green-900/50 text-green-300"
                              }`}
                            >
                              {q.difficulty}
                            </span>
                          )}
                        </div>
                        <p className="text-white font-medium">{q.question_text}</p>
                        {q.options && q.options.length > 0 ? (
                          <div className="mt-2 text-sm text-slate-400">
                            <span className="text-green-400">✓</span> {q.correct_answer}
                            <span className="ml-2 text-slate-500">({q.options.length} options)</span>
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-slate-400">
                            <span className="text-green-400">✓</span> {q.correct_answer}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-800 flex gap-3">
          <button
            onClick={onCancel}
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
            className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-bold"
          >
            Start Battle with {selectedIds.size} Question{selectedIds.size !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
};
