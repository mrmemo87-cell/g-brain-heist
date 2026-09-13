-- Transaction-only verification: leaves no account or army changes.
begin;
do $$ declare u uuid; h jsonb; req uuid:=gen_random_uuid(); v int; begin
 select id into u from public.users where role='student' and not coalesce(is_banned,false) and (banned_until is null or banned_until<=now()) and not exists(select 1 from public.commander_profiles p where p.user_id=users.id) limit 1;
 if u is null then raise exception 'No eligible test subject'; end if;
 update public.users set coins=650 where id=u;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 h:=public.rpc_commander_headquarters();
 if (h->'wallet'->>'coins')::int<>650 then raise exception 'Unenrolled balance failure'; end if;
 h:=public.rpc_commander_command(gen_random_uuid(),'enroll',null,null);
 if (h->'profile'->>'coins')::int<>650 then raise exception 'Starter grant must not mint coins'; end if;
 h:=public.rpc_commander_command(req,'train','force',1);
 if (h->'profile'->>'coins')::int<>625 or (h->'profile'->>'force_rank')::int<>2 then raise exception 'Shared training debit failure'; end if;
 h:=public.rpc_commander_command(req,'train','force',1);
 if (h->'profile'->>'coins')::int<>625 then raise exception 'Duplicate debit'; end if;
 h:=public.rpc_commander_command(gen_random_uuid(),'buy','rift_blade',2);
 if (h->'profile'->>'coins')::int<>525 then raise exception 'Shared purchase failure'; end if;
 h:=public.rpc_commander_command(gen_random_uuid(),'equip','rift_blade',3);
 if (h->'loadout'->>'bolt')::int<>34 then raise exception 'Loadout regression'; end if;
 execute 'reset role';
 if (select coins from public.users where id=u)<>525 then raise exception 'Account wallet mismatch'; end if;
 insert into public.reward_event_receipts(user_id,event_type,event_id,idempotency_key,created_at)
 values(u,'task_reward_claim','task:task_d1:2099-01-01',gen_random_uuid()::text,now()+interval '1 second');
 execute 'set local role authenticated';
 h:=public.rpc_commander_headquarters();
 if (h->'profile'->>'coins')::int<>525 or (h->'profile'->>'xp')::int<>150 then raise exception 'Reward must grant Commander XP without duplicate Coins'; end if;
 h:=public.rpc_commander_headquarters();
 if (h->'profile'->>'xp')::int<>150 then raise exception 'Duplicate XP'; end if;
 v:=(h->'profile'->>'version')::int;
 execute 'reset role';
 update public.users set coins=0 where id=u;
 execute 'set local role authenticated';
 begin
  perform public.rpc_commander_command(gen_random_uuid(),'train','force',v);
  raise exception 'Insufficient balance unexpectedly accepted';
 exception when sqlstate 'P0001' then
  if SQLERRM<>'commander_insufficient_coins' then raise; end if;
 end;
 execute 'reset role';
end $$;
rollback;
