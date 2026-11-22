-- Diagnostic Bible 2.7.1 section 10.12: storage policies call these checks as the signed-in user,
-- so that role must be allowed to run them (the same pattern as ielts_speaking_storage_access and
-- can_access_ielts_learning_recording_path). Without this grant every examiner-audio read and every
-- answer upload was refused. The checks themselves are unchanged and still fail closed.
grant execute on function private.ielts_speaking_examiner_audio_access(text) to authenticated;
grant execute on function private.ielts_speaking_mock_answer_upload(text) to authenticated;
