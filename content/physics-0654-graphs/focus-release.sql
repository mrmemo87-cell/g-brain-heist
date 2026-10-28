-- Additive Evidence Focus release for the 0654 P1 graph package. Run before importing it.

-- Owner-authorised content release; never edits or removes existing registry rows.

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.motion-forces.motion.focus.motion-state-from-graph-shape','Identify motion states from the shape of a motion graph','Evidence that the learner can identify motion states from the shape of a motion graph.',
array['upper_secondary'],'human_governed','ad24a9ad49b2992c34f7bf6ae5d2df7ca56fb04ba0e3963f82434d021ba76f0f','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.motion-forces.motion'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.motion-forces.motion.focus.speed-from-distance-time-gradient','Calculate speed from the gradient of a distance-time graph','Evidence that the learner can calculate speed from the gradient of a distance-time graph.',
array['upper_secondary'],'human_governed','7e1d2a7d037a13b9edc9a51997f42460432342dbc6895f0dd56db2f5f9843017','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.motion-forces.motion'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.motion-forces.motion.focus.average-speed-whole-journey','Calculate average speed for a whole journey including stops','Evidence that the learner can calculate average speed for a whole journey including stops.',
array['upper_secondary'],'human_governed','45ba26f89b182584c46c5b5477233a582b68ddb571ffc9daa3fb6dba51de3000','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.motion-forces.motion'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.motion-forces.motion.focus.distance-from-speed-time-area','Calculate distance from the area under a speed-time graph','Evidence that the learner can calculate distance from the area under a speed-time graph.',
array['upper_secondary'],'human_governed','9f3264b7f9b193b8da48a36b25b8b237905dcc220d0b61b2046a5207d349d2f4','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.motion-forces.motion'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.motion-forces.motion.focus.acceleration-from-speed-time-gradient','Calculate acceleration from the gradient of a speed-time graph','Evidence that the learner can calculate acceleration from the gradient of a speed-time graph.',
array['upper_secondary'],'human_governed','16ef11c75be30d2a86cd93a86d4f9c8b45737355b700095aeafe381aca1d83ee','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.motion-forces.motion'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.motion-forces.motion.focus.deceleration-as-negative-acceleration','Express deceleration as a negative acceleration from a graph','Evidence that the learner can express deceleration as a negative acceleration from a graph.',
array['upper_secondary'],'human_governed','b42ffe5daf9ebf93abd1bccfe1064b5446a1a8b6a4657ecdac2440453f66a0c2','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.motion-forces.motion'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.motion-forces.motion.focus.changing-acceleration-from-curve','Interpret a curved speed-time graph as changing acceleration','Evidence that the learner can interpret a curved speed-time graph as changing acceleration.',
array['upper_secondary'],'human_governed','1b18e9a1154c482f52cede782edddae99c33bb4dedeba4b0b02d21d4d21c8a62','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.motion-forces.motion'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.motion-forces.forces.focus.spring-constant-from-load-extension-graph','Calculate a spring constant from a load-extension graph','Evidence that the learner can calculate a spring constant from a load-extension graph.',
array['upper_secondary'],'human_governed','b713c751c575a4a0544e7c04ee0541ad0868b9e8447a8204ee6f6d076c88e165','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.motion-forces.forces'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.motion-forces.forces.focus.limit-of-proportionality-on-graph','Identify the limit of proportionality on a load-extension graph','Evidence that the learner can identify the limit of proportionality on a load-extension graph.',
array['upper_secondary'],'human_governed','d74509d0f4fef1bcc9aa57940f09660762e87dbe21a083ff4f52b5297abb3b7a','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.motion-forces.forces'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;
