-- Diagnostic Bible 2.0.0 section 15E.2: a recording counts as heard only when it was played on its own. On
-- 2026-10-19 five recordings were marked heard within about two minutes because several players ran at once.
-- The review screen now pauses other players, and the server refuses a listening check whose playback period
-- overlaps another check by the same reviewer.

create or replace function public.rpc_ielts_practice_content_listened(p_batch uuid, p_ref text, p_audio_url text, p_played_seconds numeric)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare b private.ielts_content_review_batches; mat text; rec private.ielts_listening_recordings; cur text;
begin
 perform private.ielts_mapping_admin();
 if auth.uid() is null then raise exception 'forbidden'; end if;
 select * into b from private.ielts_content_review_batches where id = p_batch and kind = 'practice_content';
 if b.id is null then raise exception 'batch_not_found'; end if;
 if b.status <> 'pending' then raise exception 'batch_already_decided'; end if;
 if p_ref !~ '^ielts_listening_set:' then raise exception 'not_a_listening_item'; end if;
 mat := split_part(p_ref, ':', 2);
 if not exists(select 1 from private.ielts_content_batch_items i where i.batch_id = p_batch and i.material_type = 'ielts_listening_set' and i.material_id = mat) then raise exception 'item_outside_batch'; end if;
 select * into rec from private.ielts_listening_recordings where material_id = mat;
 select audio_url into cur from public.ielts_listening_sets where id::text = mat;
 if rec.material_id is null or cur is distinct from rec.audio_url or p_audio_url is distinct from cur then raise exception 'recording_changed'; end if;
 if p_played_seconds is null or p_played_seconds < rec.duration_seconds - 2 then raise exception 'recording_not_finished'; end if;
 -- One recording at a time: a listening check cannot overlap another check by the same reviewer (5 s tolerance).
 if exists(select 1 from private.ielts_content_listen_checks o where o.reviewer_id = auth.uid() and o.material_id <> mat
   and o.checked_at > now() - make_interval(secs => greatest(p_played_seconds - 5, 0)::double precision)) then raise exception 'recordings_overlap'; end if;
 insert into private.ielts_content_listen_checks(batch_id, material_id, audio_url, reviewer_id, played_seconds)
 values (p_batch, mat, cur, auth.uid(), p_played_seconds)
 on conflict (batch_id, material_id, reviewer_id, audio_url) do update set played_seconds = excluded.played_seconds, checked_at = now();
 return jsonb_build_object('ref', p_ref, 'heard', true);
end $$;
revoke all on function public.rpc_ielts_practice_content_listened(uuid,text,text,numeric) from public, anon;
grant execute on function public.rpc_ielts_practice_content_listened(uuid,text,text,numeric) to authenticated;
