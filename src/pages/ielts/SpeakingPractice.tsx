import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../../services/supabaseClient';

interface SpeakingTask {
  id: number;
  slug: string;
  part: number;
  prompt: string;
  follow_ups: {
    questions?: string[];
    preparation_time?: number;
    speaking_time?: number;
    time_limit?: number;
    cue_card_points?: string[];
  };
}

const SpeakingPractice: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  
  const [preparationTime, setPreparationTime] = useState<number>(0);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const preparationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: task, isLoading } = useQuery({
    queryKey: ['speaking-task', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ielts_speaking_tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      
      if (error) throw error;
      return data as SpeakingTask;
    },
    enabled: !!taskId,
  });

  const submitMutation = useMutation({
    mutationFn: async (blob: Blob) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) throw new Error('Not authenticated');

      // Upload audio file
      const fileName = `speaking/${session.session.user.id}/${task?.id}_${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('ielts-recordings')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      // Save attempt record
      const { data, error } = await supabase
        .from('ielts_speaking_attempts')
        .insert({
          user_id: session.session.user.id,
          task_id: task?.id,
          recording_url: fileName,
          duration: recordingTime,
          status: 'pending_review',
          submitted_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setHasSubmitted(true);
    },
  });

  useEffect(() => {
    return () => {
      if (preparationTimerRef.current) clearInterval(preparationTimerRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const startPreparation = () => {
    setIsPreparing(true);
    setPreparationTime(0);
    
    const prepTime = task?.follow_ups?.preparation_time || 60;
    preparationTimerRef.current = setInterval(() => {
      setPreparationTime(prev => {
        if (prev >= prepTime) {
          if (preparationTimerRef.current) clearInterval(preparationTimerRef.current);
          setIsPreparing(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      const maxTime = task?.follow_ups?.speaking_time || task?.follow_ups?.time_limit || 180;
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= maxTime) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Unable to access microphone. Please check your permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const handleSubmit = () => {
    if (audioBlob) {
      submitMutation.mutate(audioBlob);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-white text-center">
          <h2 className="text-2xl font-bold mb-4">Task not found</h2>
          <button
            onClick={() => navigate('/ielts')}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (hasSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
        <div className="max-w-3xl mx-auto bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-purple-500/30 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-white mb-4">Submitted Successfully!</h1>
            <p className="text-xl text-gray-300 mb-6">
              Your recording has been submitted for expert review.
            </p>
          </div>

          <div className="bg-slate-700/50 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-3">What happens next?</h3>
            <ul className="space-y-2 text-left text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-1">•</span>
                <span>An IELTS expert will review your speaking performance</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-1">•</span>
                <span>You'll receive detailed feedback on pronunciation, fluency, grammar, and vocabulary</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-1">•</span>
                <span>An estimated band score will be provided</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-1">•</span>
                <span>Reviews typically complete within 24-48 hours</span>
              </li>
            </ul>
          </div>

          <div className="bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-500/30 rounded-xl p-6 mb-6">
            <h3 className="text-xl font-bold text-yellow-400 mb-2">🌟 Upgrade to Prime</h3>
            <p className="text-gray-200 mb-4">
              Get full access to all skills + personalized feedback on every attempt!
            </p>
            <button
              onClick={() => navigate('/ielts/apply-prime')}
              className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-slate-900 rounded-lg transition font-bold"
            >
              Apply for Prime Access
            </button>
          </div>

          <button
            onClick={() => navigate('/ielts')}
            className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition font-medium"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const prepTime = task.follow_ups?.preparation_time || 0;
  const maxTime = task.follow_ups?.speaking_time || task.follow_ups?.time_limit || 180;
  const prepProgress = prepTime > 0 ? (preparationTime / prepTime) * 100 : 0;
  const recordProgress = (recordingTime / maxTime) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-purple-500/30">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm text-purple-400 mb-2">IELTS Speaking - Part {task.part}</div>
              <h1 className="text-3xl font-bold text-white mb-2">Speaking Practice</h1>
              <p className="text-gray-400">Free sample for skill evaluation</p>
            </div>
            <button
              onClick={() => navigate('/ielts')}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
            >
              Exit
            </button>
          </div>
        </div>

        {/* Task Card */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-purple-500/30 mb-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-4">Task Prompt</h2>
            <p className="text-xl text-gray-200 leading-relaxed">{task.prompt}</p>
          </div>

          {task.follow_ups?.cue_card_points && (
            <div className="bg-slate-700/50 rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">You should say:</h3>
              <ul className="space-y-2">
                {task.follow_ups.cue_card_points.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-gray-300">
                    <span className="text-purple-400">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {task.follow_ups?.questions && (
            <div className="bg-slate-700/50 rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Discussion Questions:</h3>
              <ul className="space-y-2">
                {task.follow_ups.questions.map((question, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-gray-300">
                    <span className="text-purple-400">{idx + 1}.</span>
                    <span>{question}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Timer Instructions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {prepTime > 0 && (
              <div className="bg-blue-600/20 border border-blue-500/30 rounded-lg p-4">
                <div className="text-sm text-blue-400 mb-1">Preparation Time</div>
                <div className="text-2xl font-bold text-white">{formatTime(prepTime)}</div>
              </div>
            )}
            <div className="bg-purple-600/20 border border-purple-500/30 rounded-lg p-4">
              <div className="text-sm text-purple-400 mb-1">Speaking Time</div>
              <div className="text-2xl font-bold text-white">{formatTime(maxTime)}</div>
            </div>
          </div>

          {/* Preparation Phase */}
          {prepTime > 0 && !isPreparing && !isRecording && !audioBlob && (
            <button
              onClick={startPreparation}
              className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-bold text-lg"
            >
              Start Preparation ({formatTime(prepTime)})
            </button>
          )}

          {isPreparing && (
            <div className="text-center">
              <div className="text-6xl font-bold text-blue-400 mb-4">
                {formatTime(prepTime - preparationTime)}
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 mb-4">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${prepProgress}%` }}
                />
              </div>
              <p className="text-gray-300">Prepare your thoughts...</p>
            </div>
          )}

          {/* Recording Phase */}
          {!isPreparing && !isRecording && !audioBlob && (prepTime === 0 || preparationTime >= prepTime) && (
            <button
              onClick={startRecording}
              className="w-full px-6 py-4 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-bold text-lg flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" />
              </svg>
              Start Recording
            </button>
          )}

          {isRecording && (
            <div className="text-center">
              <div className="flex items-center justify-center gap-4 mb-4">
                <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
                <div className="text-6xl font-bold text-red-400">
                  {formatTime(recordingTime)}
                </div>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 mb-4">
                <div
                  className="bg-red-500 h-2 rounded-full transition-all"
                  style={{ width: `${recordProgress}%` }}
                />
              </div>
              <button
                onClick={stopRecording}
                className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition font-medium"
              >
                Stop Recording
              </button>
            </div>
          )}

          {/* Playback & Submit */}
          {audioBlob && audioUrl && (
            <div className="space-y-4">
              <div className="bg-slate-700/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Your Recording</h3>
                <audio controls src={audioUrl} className="w-full mb-4" />
                <div className="text-sm text-gray-400">
                  Duration: {formatTime(recordingTime)}
                </div>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setAudioBlob(null);
                    setAudioUrl(null);
                    setRecordingTime(0);
                  }}
                  className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                >
                  Re-record
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending}
                  className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition font-bold"
                >
                  {submitMutation.isPending ? 'Submitting...' : 'Submit for Review'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-blue-600/10 border border-blue-500/30 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-400 mb-2">💡 Tips for Success</h3>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li>• Speak clearly and at a natural pace</li>
            <li>• Use a variety of vocabulary and grammatical structures</li>
            <li>• Organize your ideas logically</li>
            <li>• Don't worry about minor mistakes - fluency matters more</li>
            <li>• Make sure you're in a quiet environment</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SpeakingPractice;
