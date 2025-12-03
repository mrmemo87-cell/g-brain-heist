import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../../services/supabaseClient';
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

      // Save attempt record
      const { data, error } = await supabase
        .from('ielts_speaking_attempts')
        .insert({
          user_id: session.session.user.id,
          task_id: task?.id,
          recording_url: fileName,
          duration: recordingDuration,
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

  // Get times from task
  const prepTime = task?.follow_ups?.preparation_time || 60; // Default 1 minute prep
  const speakingTime = task?.follow_ups?.speaking_time || task?.follow_ups?.time_limit || 120; // Default 2 minutes

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
        padding: '2rem'
      }}>
        <div style={{
          maxWidth: '42rem',
          margin: '0 auto',
          background: 'white',
          borderRadius: '1rem',
          padding: '2.5rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          textAlign: 'center'
        }}>
          {/* Success Icon */}
          <div style={{
            width: '5rem',
            height: '5rem',
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem'
          }}>
            <svg style={{ width: '2.5rem', height: '2.5rem', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.5rem' }}>
            Submission Received!
          </h1>
          <p style={{ fontSize: '1.125rem', color: '#64748b', marginBottom: '2rem' }}>
            Your speaking response has been successfully submitted.
          </p>

          {/* Expert Review Box */}
          <div style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #93c5fd',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            textAlign: 'left'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#1e40af', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🎯</span> What Happens Next
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#1e3a5f' }}>
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
            padding: '1.5rem',
            marginBottom: '1.5rem',
            textAlign: 'left'
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#334155', marginBottom: '1rem' }}>
              📬 Notification Preferences
            </h3>
            
            {/* Alternate Email */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>
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
                  fontSize: '0.875rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Phone Number */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>
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
                  fontSize: '0.875rem',
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
          </div>

          {/* Prime Upgrade */}
          <div style={{
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            border: '1px solid #f59e0b',
            borderRadius: '0.75rem',
            padding: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#92400e', marginBottom: '0.5rem' }}>
              ⭐ Upgrade to Prime
            </h3>
            <p style={{ color: '#78350f', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
              Get unlimited attempts + personalized feedback on every submission!
            </p>
            <button
              onClick={() => navigate('/ielts/apply-prime')}
              style={{
                padding: '0.5rem 1.25rem',
                background: '#f59e0b',
                color: '#78350f',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.875rem'
              }}
            >
              Apply for Prime Access
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
            Back to IELTS Home
          </button>
        </div>
      </div>
    );
  }

  const displayPrepTime = task.follow_ups?.preparation_time || 60;
  const displayMaxTime = task.follow_ups?.speaking_time || task.follow_ups?.time_limit || 120;
  const prepProgress = displayPrepTime > 0 ? ((displayPrepTime - preparationTimeLeft) / displayPrepTime) * 100 : 0;
  const recordProgress = displayMaxTime > 0 ? ((displayMaxTime - recordingTimeLeft) / displayMaxTime) * 100 : 0;

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      padding: '1rem'
    }}>
      <div style={{ maxWidth: '56rem', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          background: 'white',
          borderRadius: '1rem',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#6366f1', marginBottom: '0.25rem' }}>
              IELTS Speaking - Part {task.part}
            </div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.25rem' }}>
              Speaking Practice
            </h1>
            <p style={{ color: '#64748b' }}>Free sample for skill evaluation</p>
          </div>
          <button
            onClick={() => navigate('/ielts')}
            style={{
              padding: '0.5rem 1rem',
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #e2e8f0',
              borderRadius: '0.5rem',
              cursor: 'pointer'
            }}
          >
            Exit
          </button>
        </div>

        {/* Task Card */}
        <div style={{
          background: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '1rem' }}>
              Task Prompt
            </h2>
            <p style={{ fontSize: '1.125rem', color: '#334155', lineHeight: 1.75 }}>{task.prompt}</p>
          </div>

          {task.follow_ups?.cue_card_points && (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', marginBottom: '0.75rem' }}>
                You should say:
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {task.follow_ups.cue_card_points.map((point, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', color: '#475569', marginBottom: '0.5rem' }}>
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
              borderRadius: '0.75rem',
              padding: '1.5rem',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', marginBottom: '0.75rem' }}>
                Discussion Questions:
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {task.follow_ups.questions.map((question, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', color: '#475569', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#6366f1' }}>{idx + 1}.</span>
                    <span>{question}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Timer Instructions */}
          <div style={{ display: 'grid', gridTemplateColumns: displayPrepTime > 0 ? '1fr 1fr' : '1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            {displayPrepTime > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                border: '1px solid #93c5fd',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ fontSize: '0.875rem', color: '#3b82f6', marginBottom: '0.25rem' }}>Preparation Time</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e40af' }}>{formatTime(displayPrepTime)}</div>
              </div>
            )}
            <div style={{
              background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
              border: '1px solid #c4b5fd',
              borderRadius: '0.5rem',
              padding: '1rem'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#7c3aed', marginBottom: '0.25rem' }}>Speaking Time</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#5b21b6' }}>{formatTime(displayMaxTime)}</div>
            </div>
          </div>

          {/* Start Practice Button - Only shown before practice begins */}
          {!hasStarted && !isPreparing && !isRecording && !audioBlob && (
            <button
              onClick={startPractice}
              style={{
                width: '100%',
                padding: '1rem 1.5rem',
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '1.125rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem'
              }}
            >
              <svg style={{ width: '1.5rem', height: '1.5rem' }} fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Start Practice ({formatTime(displayPrepTime)} prep + {formatTime(displayMaxTime)} speaking)
            </button>
          )}

          {/* Preparation Phase - Countdown Display */}
          {isPreparing && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.875rem', color: '#3b82f6', marginBottom: '0.5rem', fontWeight: '600' }}>
                ⏱️ Preparation Time
              </div>
              <div style={{ fontSize: '4rem', fontWeight: 'bold', color: '#3b82f6', marginBottom: '1rem' }}>
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
              <div style={{ fontSize: '0.875rem', color: '#dc2626', marginBottom: '0.5rem', fontWeight: '600' }}>
                🎙️ Recording in Progress
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ 
                  width: '1rem', 
                  height: '1rem', 
                  background: '#ef4444', 
                  borderRadius: '50%',
                  animation: 'pulse 1s infinite'
                }} />
                <div style={{ fontSize: '4rem', fontWeight: 'bold', color: '#dc2626' }}>
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
                padding: '1.5rem',
                marginBottom: '1rem'
              }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', marginBottom: '1rem' }}>
                  Your Recording
                </h3>
                <audio controls src={audioUrl} style={{ width: '100%', marginBottom: '0.5rem' }} />
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                  Duration: {formatTime(recordingDuration)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  onClick={restartPractice}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.5rem',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    cursor: 'pointer'
                  }}
                >
                  Re-record
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.5rem',
                    background: submitMutation.isPending ? '#9ca3af' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: submitMutation.isPending ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold'
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
          padding: '1.5rem'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e40af', marginBottom: '0.75rem' }}>
            💡 Tips for Success
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569', fontSize: '0.875rem' }}>
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
