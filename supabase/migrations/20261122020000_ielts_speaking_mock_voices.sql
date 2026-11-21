-- Diagnostic Bible 2.7.1 section 10.12: three examiner voices across the six Speaking practice mocks.
-- Owner decision (2026-11-22): one voice per mock, three voices in all, so different mocks sound
-- different while each student hears one examiner for the whole test.
--   B, C: Miriam (unchanged, script version 1)   D, E: Tom   F, G: Leslie
-- Scripts are append-only, so D to G get a version 2 with the same lines in the new voice. Version 1
-- of those mocks was never released and has no audio. Identical lines in the same voice still share
-- one audio file. Nothing is released here.
do $mig$
declare m record; old private.ielts_speaking_mock_scripts; v jsonb; lines jsonb; errors text[]; sid uuid;
begin
  for m in select * from (values
      ('bh-speaking-mock-d','Tom','0b7f3a52-3d21-5c8e-9d10-6a1d2c3e4f51'::uuid),
      ('bh-speaking-mock-e','Tom','4a2e6c13-8b0f-5d47-a1c9-7e3f5b2d6a82'::uuid),
      ('bh-speaking-mock-f','Leslie','9c5d1e74-2f6a-5b83-b0e2-3d4c7a8f1e93'::uuid),
      ('bh-speaking-mock-g','Leslie','6e8a4f25-1c3b-5d9e-8f70-2b5d9c1a7e04'::uuid)) x(code,voice,id) loop
    select * into old from private.ielts_speaking_mock_scripts where package_code=m.code and version=1;
    if not found or old.released_at is not null then raise exception '% version 1 missing or already released',m.code; end if;
    v:=jsonb_set(old.voice,'{voice}',to_jsonb(m.voice));
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key',l.key,'part',l.part,'kind',l.kind,'body',l.body,'answer_seconds',l.answer_seconds,
        'replay_allowed',case when l.replay_allowed then true end)) order by l.position) into lines
      from private.ielts_speaking_mock_script_lines l where l.script_id=old.id;
    errors:=private.ielts_speaking_mock_script_errors(lines,old.cue_card,v);
    if cardinality(errors)>0 then raise exception '% script invalid: %',m.code,array_to_string(errors,','); end if;
    insert into private.ielts_speaking_mock_scripts(id,package_code,content_hash,version,voice,cue_card,created_by)
    values(m.id,m.code,old.content_hash,2,v,old.cue_card,'1d4f3b8d-f24f-4651-ad33-85165359cf88');
    insert into private.ielts_speaking_mock_script_lines(script_id,position,key,part,kind,body,answer_seconds,replay_allowed,audio_key)
    select m.id,l.position,l.key,l.part,l.kind,l.body,l.answer_seconds,l.replay_allowed,private.ielts_speaking_mock_audio_key(l.body,v)
    from private.ielts_speaking_mock_script_lines l where l.script_id=old.id;
  end loop;
end $mig$;
