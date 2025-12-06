import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../../services/supabaseClient';
import { saveNotificationPreferences } from '../../../services/ieltsService';
import { stopBackgroundMusic, resumeBackgroundMusic } from '../../../services/audioService';

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
  
  const [preparationTimeLeft, setPreparationTimeLeft] = useState<number>(0);
  const [recordingTimeLeft, setRecordingTimeLeft] = useState<number>(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  
  // Success screen state
  const [alternateEmail, setAlternateEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [notifyByEmail, setNotifyByEmail] = useState(true);
  const [notifyBySms, setNotifyBySms] = useState(false);
  const [notifyInApp, setNotifyInApp] = useState(true);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const preparationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop background music when entering IELTS Speaking practice
  useEffect(() => {
    stopBackgroundMusic();
    return () => {
      resumeBackgroundMusic();
    };
  }, []);

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

      // Save attempt record - use audio_url (the standard column name in the DB)
      const { data, error } = await supabase
        .from('ielts_speaking_attempts')
        .insert({
          user_id: session.session.user.id,
          task_id: task?.id,
          audio_url: fileName,
          submitted_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setLastAttemptId(data?.id);
      setHasSubmitted(true);
    },
  });

  const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);

  // Save notification preferences when user updates them
  const savePreferencesMutation = useMutation({
    mutationFn: () => {
      if (!lastAttemptId) throw new Error('No attempt ID');
      return saveNotificationPreferences({
        attemptType: 'speaking',
        attemptId: lastAttemptId,
        alternateEmail,
        phoneNumber,
        notifyByEmail,
        notifyBySms,
        showInApp: notifyInApp,
      });
    },
  });

  // Auto-save preferences when they change (after submission)
  useEffect(() => {
    if (lastAttemptId && hasSubmitted) {
      const timer = setTimeout(() => {
        savePreferencesMutation.mutate();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [alternateEmail, phoneNumber, notifyByEmail, notifyBySms, notifyInApp, lastAttemptId, hasSubmitted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (preparationTimerRef.current) clearInterval(preparationTimerRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [audioUrl]);

  // Get times from task - with MINIMUM enforced values for realistic IELTS
  // Part 1: 4-5 min total, Part 2: 1 min prep + 2 min speak, Part 3: 4-5 min
  const getDefaultTimes = (part: number) => {
    switch(part) {
      case 1: return { prep: 0, speak: 120 }; // Part 1: No prep, 2 min speak
      case 2: return { prep: 60, speak: 120 }; // Part 2: 1 min prep, 2 min speak
      case 3: return { prep: 0, speak: 120 }; // Part 3: No prep, 2 min speak
      default: return { prep: 60, speak: 120 };
    }
  };
  
  const defaults = getDefaultTimes(task?.part || 1);
  
  // Use database values only if they're reasonable (> 10 seconds), otherwise use defaults
  const dbPrepTime = task?.follow_ups?.preparation_time;
  const dbSpeakTime = task?.follow_ups?.speaking_time || task?.follow_ups?.time_limit;
  
  const prepTime = (dbPrepTime && dbPrepTime >= 10) ? dbPrepTime : defaults.prep;
  const speakingTime = (dbSpeakTime && dbSpeakTime >= 30) ? dbSpeakTime : defaults.speak;

  // Start the entire flow (prep -> recording)
  const startPractice = async () => {
    setHasStarted(true);
    
    // Request microphone permission early
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Unable to access microphone. Please check your permissions and try again.');
      setHasStarted(false);
      return;
    }
    
    // Start preparation countdown
    setIsPreparing(true);
    setPreparationTimeLeft(prepTime);
    
    preparationTimerRef.current = setInterval(() => {
      setPreparationTimeLeft(prev => {
        if (prev <= 1) {
          if (preparationTimerRef.current) clearInterval(preparationTimerRef.current);
          setIsPreparing(false);
          // Auto-start recording when prep ends
          startRecordingInternal();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Internal recording start (called automatically after prep)
  const startRecordingInternal = () => {
    if (!streamRef.current) return;
    
    const mediaRecorder = new MediaRecorder(streamRef.current);
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
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };

    mediaRecorder.start();
    setIsRecording(true);
    setRecordingTimeLeft(speakingTime);
    setRecordingDuration(0);

    // Countdown timer for recording
    recordingTimerRef.current = setInterval(() => {
      setRecordingTimeLeft(prev => {
        setRecordingDuration(d => d + 1);
        if (prev <= 1) {
          // Auto-stop when time runs out
          stopRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
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

  const restartPractice = () => {
    setHasStarted(false);
    setIsPreparing(false);
    setIsRecording(false);
    setAudioBlob(null);
    setAudioUrl(null);
    setPreparationTimeLeft(0);
    setRecordingTimeLeft(0);
    setRecordingDuration(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ color: '#1e293b', fontSize: '1.25rem' }}>Loading...</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', color: '#1e293b' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Task not found</h2>
          <button
            onClick={() => navigate('/ielts')}
            style={{
              padding: '0.5rem 1.5rem',
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (hasSubmitted) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        padding: 'clamp(1rem, 3vw, 2rem)'
      }}>
        <div style={{
          maxWidth: '42rem',
          margin: '0 auto',
          background: 'white',
          borderRadius: '1rem',
          padding: 'clamp(1.5rem, 4vw, 2.5rem)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          textAlign: 'center'
        }}>
          {/* Success Icon */}
          <div style={{
            width: 'clamp(3.5rem, 10vw, 5rem)',
            height: 'clamp(3.5rem, 10vw, 5rem)',
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem'
          }}>
            <svg style={{ width: 'clamp(1.75rem, 5vw, 2.5rem)', height: 'clamp(1.75rem, 5vw, 2.5rem)', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.5rem' }}>
            Submission Received!
          </h1>
          <p style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.125rem)', color: '#64748b', marginBottom: '2rem' }}>
            Your speaking response has been successfully submitted.
          </p>

          {/* Expert Review Box */}
          <div style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #93c5fd',
            borderRadius: '0.75rem',
            padding: 'clamp(1rem, 3vw, 1.5rem)',
            marginBottom: '1.5rem',
            textAlign: 'left'
          }}>
            <h3 style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.125rem)', fontWeight: '600', color: '#1e40af', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🎯</span> What Happens Next
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#1e3a5f', fontSize: 'clamp(0.8rem, 2vw, 1rem)' }}>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>1.</span>
                <span>Your recording will be reviewed by a <strong>certified IELTS examiner</strong></span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>2.</span>
                <span>You'll receive detailed feedback on fluency, pronunciation, grammar & vocabulary</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>3.</span>
                <span>Your estimated band score will be sent within <strong>24 hours</strong></span>
              </li>
            </ul>
          </div>

          {/* Notification Preferences */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            padding: 'clamp(1rem, 3vw, 1.5rem)',
            marginBottom: '1.5rem',
            textAlign: 'left'
          }}>
            <h3 style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1rem)', fontWeight: '600', color: '#334155', marginBottom: '1rem' }}>
              📬 Notification Preferences
            </h3>
            
            {/* Alternate Email */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', color: '#64748b', marginBottom: '0.25rem' }}>
                Alternate email (optional)
              </label>
              <input
                type="email"
                value={alternateEmail}
                onChange={(e) => setAlternateEmail(e.target.value)}
                placeholder="Enter alternate email for results"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Phone Number */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', color: '#64748b', marginBottom: '0.25rem' }}>
                Phone number for SMS updates (optional)
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 234 567 8900"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Checkboxes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyByEmail}
                  onChange={(e) => setNotifyByEmail(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', accentColor: '#6366f1' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#475569' }}>Notify me by email when results are ready</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyBySms}
                  onChange={(e) => setNotifyBySms(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', accentColor: '#6366f1' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#475569' }}>Send SMS notification when results are ready</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyInApp}
                  onChange={(e) => setNotifyInApp(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', accentColor: '#6366f1' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#475569' }}>Show in-app notification</span>
              </label>
            </div>

            {/* Save Preferences Button */}
            <button
              onClick={() => savePreferencesMutation.mutate()}
              disabled={savePreferencesMutation.isPending}
              style={{
                width: '100%',
                marginTop: '1rem',
                padding: '0.75rem 1rem',
                background: savePreferencesMutation.isSuccess 
                  ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                  : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: savePreferencesMutation.isPending ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: '0.875rem',
                opacity: savePreferencesMutation.isPending ? 0.7 : 1,
                transition: 'all 0.2s',
              }}
            >
              {savePreferencesMutation.isPending ? '⏳ Saving...' : 
               savePreferencesMutation.isSuccess ? '✓ Preferences Saved!' : 
               '💾 Save Notification Preferences'}
            </button>
          </div>

          {/* Personalized Speaking Tips */}
          <div style={{
            background: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)',
            border: '1px solid #e879f9',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#86198f', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📊 Personalized Speaking Tips
            </h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>🎤</span>
                <span style={{ fontWeight: 600, color: '#7c3aed' }}>How to Improve Your Speaking</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569' }}>
                <li style={{ marginBottom: '0.5rem' }}>🗣️ <strong>Fluency:</strong> Speak naturally without long pauses - use fillers like "well", "let me think"</li>
                <li style={{ marginBottom: '0.5rem' }}>📚 <strong>Vocabulary:</strong> Use varied vocabulary and idiomatic expressions</li>
                <li style={{ marginBottom: '0.5rem' }}>✅ <strong>Grammar:</strong> Mix simple and complex sentence structures</li>
                <li style={{ marginBottom: '0.5rem' }}>🎵 <strong>Pronunciation:</strong> Focus on word stress and intonation patterns</li>
                <li>💡 <strong>Content:</strong> Extend your answers with examples and explanations</li>
              </ul>
            </div>
          </div>

          {/* Prime Upgrade */}
          <div style={{
            background: 'linear-gradient(135deg, #1e40af 0%, #7c3aed 100%)',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            textAlign: 'center',
            color: 'white'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⭐</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Upgrade to Prime
            </h3>
            <p style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '1rem' }}>
              Get AI-powered pronunciation feedback, fluency analysis, and expert evaluations
            </p>
            <button
              onClick={() => navigate('/ielts/pricing')}
              style={{
                padding: '0.75rem 2rem',
                background: 'white',
                color: '#1e40af',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.875rem'
              }}
            >
              🚀 Get Expert Feedback
            </button>
          </div>

          <button
            onClick={() => navigate('/ielts')}
            style={{
              padding: '0.875rem 2rem',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '1rem'
            }}
          >
            ← Back to IELTS Home
          </button>
        </div>
      </div>
    );
  }

  // Use the already calculated prepTime and speakingTime for display
  const displayPrepTime = prepTime;
  const displayMaxTime = speakingTime;
  const prepProgress = displayPrepTime > 0 ? ((displayPrepTime - preparationTimeLeft) / displayPrepTime) * 100 : 0;
  const recordProgress = displayMaxTime > 0 ? ((displayMaxTime - recordingTimeLeft) / displayMaxTime) * 100 : 0;

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      padding: '0.75rem'
    }}>
      <div style={{ maxWidth: '56rem', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          background: 'white',
          borderRadius: '0.75rem',
          padding: '1rem',
          marginBottom: '1rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6366f1', marginBottom: '0.125rem' }}>
                IELTS Speaking - Part {task.part}
              </div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
                Speaking Practice
              </h1>
            </div>
            <button
              onClick={() => navigate('/ielts')}
              style={{
                padding: '0.375rem 0.75rem',
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Exit
            </button>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.8125rem', margin: 0 }}>Free sample for skill evaluation</p>
        </div>

        {/* Task Card */}
        <div style={{
          background: 'white',
          borderRadius: '0.75rem',
          padding: '1rem',
          marginBottom: '1rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.5rem' }}>
              Task Prompt
            </h2>
            <p style={{ fontSize: '0.9375rem', color: '#334155', lineHeight: 1.6 }}>{task.prompt}</p>
          </div>

          {task.follow_ups?.cue_card_points && (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '1rem'
            }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b', marginBottom: '0.5rem' }}>
                You should say:
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {task.follow_ups.cue_card_points.map((point, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#475569', marginBottom: '0.375rem', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6366f1' }}>•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {task.follow_ups?.questions && (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '1rem'
            }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b', marginBottom: '0.5rem' }}>
                Discussion Questions:
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {task.follow_ups.questions.map((question, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#475569', marginBottom: '0.375rem', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6366f1' }}>{idx + 1}.</span>
                    <span>{question}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Timer Instructions */}
          <div style={{ display: 'grid', gridTemplateColumns: displayPrepTime > 0 ? '1fr 1fr' : '1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            {displayPrepTime > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                border: '1px solid #93c5fd',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginBottom: '0.125rem' }}>Prep Time</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e40af' }}>{formatTime(displayPrepTime)}</div>
              </div>
            )}
            <div style={{
              background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
              border: '1px solid #c4b5fd',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.75rem', color: '#7c3aed', marginBottom: '0.125rem' }}>Speaking Time</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#5b21b6' }}>{formatTime(displayMaxTime)}</div>
            </div>
          </div>

          {/* Start Practice Button - Only shown before practice begins */}
          {!hasStarted && !isPreparing && !isRecording && !audioBlob && (
            <button
              onClick={startPractice}
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              <svg style={{ width: '1.25rem', height: '1.25rem' }} fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Start Practice
            </button>
          )}

          {/* Preparation Phase - Countdown Display */}
          {isPreparing && (
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)', color: '#3b82f6', marginBottom: '0.5rem', fontWeight: '600' }}>
                ⏱️ Preparation Time
              </div>
              <div style={{ fontSize: 'clamp(1.75rem, 7vw, 3rem)', fontWeight: 'bold', color: '#3b82f6', marginBottom: '0.75rem' }}>
                {formatTime(preparationTimeLeft)}
              </div>
              <div style={{ width: '100%', background: '#e2e8f0', borderRadius: '9999px', height: '0.5rem', marginBottom: '1rem' }}>
                <div
                  style={{ 
                    background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)', 
                    height: '0.5rem', 
                    borderRadius: '9999px', 
                    transition: 'width 0.3s',
                    width: `${prepProgress}%` 
                  }}
                />
              </div>
              <p style={{ color: '#64748b' }}>Prepare your thoughts... Recording will start automatically.</p>
            </div>
          )}

          {/* Recording Phase - Countdown Display */}
          {isRecording && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)', color: '#dc2626', marginBottom: '0.5rem', fontWeight: '600' }}>
                🎙️ Recording in Progress
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(0.5rem, 2vw, 1rem)', marginBottom: '1rem' }}>
                <div style={{ 
                  width: 'clamp(0.75rem, 2.5vw, 1rem)', 
                  height: 'clamp(0.75rem, 2.5vw, 1rem)', 
                  background: '#ef4444', 
                  borderRadius: '50%',
                  animation: 'pulse 1s infinite'
                }} />
                <div style={{ fontSize: 'clamp(2rem, 8vw, 4rem)', fontWeight: 'bold', color: '#dc2626' }}>
                  {formatTime(recordingTimeLeft)}
                </div>
              </div>
              <div style={{ width: '100%', background: '#e2e8f0', borderRadius: '9999px', height: '0.5rem', marginBottom: '1rem' }}>
                <div
                  style={{ 
                    background: 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)', 
                    height: '0.5rem', 
                    borderRadius: '9999px', 
                    transition: 'width 0.3s',
                    width: `${recordProgress}%` 
                  }}
                />
              </div>
              <p style={{ color: '#64748b', marginBottom: '1rem' }}>Speak now! Recording will stop automatically when time runs out.</p>
              <button
                onClick={stopRecording}
                style={{
                  padding: '0.75rem 2rem',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Stop Recording Early
              </button>
            </div>
          )}

          {/* Playback & Submit */}
          {audioBlob && audioUrl && (
            <div>
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.75rem',
                padding: 'clamp(1rem, 3vw, 1.5rem)',
                marginBottom: '1rem'
              }}>
                <h3 style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1rem)', fontWeight: '600', color: '#1e293b', marginBottom: '1rem' }}>
                  Your Recording
                </h3>
                <audio controls src={audioUrl} style={{ width: '100%', marginBottom: '0.5rem' }} />
                <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', color: '#64748b' }}>
                  Duration: {formatTime(recordingDuration)}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  onClick={restartPractice}
                  style={{
                    width: '100%',
                    padding: 'clamp(0.625rem, 2vw, 0.75rem) 1rem',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: 'clamp(0.875rem, 2.5vw, 1rem)'
                  }}
                >
                  Re-record
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending}
                  style={{
                    width: '100%',
                    padding: 'clamp(0.625rem, 2vw, 0.75rem) 1rem',
                    background: submitMutation.isPending ? '#9ca3af' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: submitMutation.isPending ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    fontSize: 'clamp(0.875rem, 2.5vw, 1rem)'
                  }}
                >
                  {submitMutation.isPending ? 'Submitting...' : 'Submit for Review'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div style={{
          background: 'white',
          border: '1px solid #bfdbfe',
          borderRadius: '0.75rem',
          padding: 'clamp(1rem, 3vw, 1.5rem)'
        }}>
          <h3 style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1rem)', fontWeight: '600', color: '#1e40af', marginBottom: '0.75rem' }}>
            💡 Tips for Success
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569', fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>
            <li style={{ marginBottom: '0.5rem' }}>• Speak clearly and at a natural pace</li>
            <li style={{ marginBottom: '0.5rem' }}>• Use a variety of vocabulary and grammatical structures</li>
            <li style={{ marginBottom: '0.5rem' }}>• Organize your ideas logically</li>
            <li style={{ marginBottom: '0.5rem' }}>• Don't worry about minor mistakes - fluency matters more</li>
            <li>• Make sure you're in a quiet environment</li>
          </ul>
        </div>
      </div>
      
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default SpeakingPractice;
