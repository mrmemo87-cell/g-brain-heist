-- Brain Heist Economics canonical registry + Cambridge IGCSE Economics 0455 crosswalks.
-- Canonical skill identity belongs to Brain Heist. Cambridge references are external
-- alignment metadata only; no protected curriculum objective text is copied here.

insert into public.academic_skill_registry_versions(
  code,subject_key,title,description,authority_model,status,effective_from
) values (
  'bh-economics-core-v1',
  'economics',
  'Brain Heist Economics Core Skill Registry v1',
  'Stable longitudinal economics competency registry with Cambridge IGCSE Economics 0455 crosswalks. Content knowledge and transferable economic reasoning remain separate but connected.',
  'brain_heist_canonical_with_cambridge_crosswalk',
  'published',
  '2026-09-30'::date
)
on conflict(code) do update set
  subject_key=excluded.subject_key,
  title=excluded.title,
  description=excluded.description,
  authority_model=excluded.authority_model,
  status='published';

-- Durable strands. Six organise economic content; one carries transferable
-- economic reasoning so the same learner identity can survive syllabus revisions.
with v as (
  select id from public.academic_skill_registry_versions where code='bh-economics-core-v1'
),
seed(code,name,description) as (values
  ('econ.foundations','Economic foundations','Scarcity, choice, resources, opportunity cost and production possibilities.'),
  ('econ.markets','Markets and resource allocation','Demand, supply, price signals, elasticity, market systems, market failure and intervention.'),
  ('econ.micro','Microeconomic decision-makers','Money, households, workers, firms, production, costs, revenue, objectives and market structures.'),
  ('econ.macro','Government and the macroeconomy','Macroeconomic policy, growth, employment, unemployment and inflation.'),
  ('econ.development','Economic development','Living standards, poverty, population and differences in development.'),
  ('econ.international','International economics','Specialisation, trade, globalisation, exchange rates and external balances.'),
  ('econ.reasoning','Economic reasoning and evidence','Knowledge, quantitative/data interpretation, causal analysis, evaluation and judgement.')
)
insert into public.academic_skill_registry_nodes(
  registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status
)
select v.id,null,'strand',s.code,s.name,s.description,array['upper_secondary']::text[],'active'
from v cross join seed s
on conflict(code) do update set
  parent_id=excluded.parent_id,
  name=excluded.name,
  description=excluded.description,
  applicable_phases=excluded.applicable_phases,
  status='active',
  updated_at=now();

-- Canonical skills describe durable economics competencies rather than question
-- command words or one syllabus item's wording.
with v as (
  select id from public.academic_skill_registry_versions where code='bh-economics-core-v1'
),
seed(code,parent_code,name,description) as (values
  ('econ.foundations.scarcity-choice','econ.foundations','Scarcity and choice','Explain unlimited wants, finite resources, choice and the economic problem.'),
  ('econ.foundations.factors-production','econ.foundations','Factors of production','Classify and reason about land, labour, capital and enterprise.'),
  ('econ.foundations.opportunity-cost-ppc','econ.foundations','Opportunity cost and production possibilities','Use opportunity cost and production possibility reasoning to analyse trade-offs, efficiency and growth.'),

  ('econ.markets.market-allocation','econ.markets','Market allocation and price signals','Explain how markets coordinate choices and allocate scarce resources.'),
  ('econ.markets.demand','econ.markets','Demand','Analyse quantity demanded, demand conditions and changes in demand.'),
  ('econ.markets.supply','econ.markets','Supply','Analyse quantity supplied, supply conditions and changes in supply.'),
  ('econ.markets.equilibrium-price','econ.markets','Price determination','Analyse equilibrium, shortages, surpluses and market adjustment.'),
  ('econ.markets.ped','econ.markets','Price elasticity of demand','Calculate, interpret and apply responsiveness of quantity demanded to price.'),
  ('econ.markets.pes','econ.markets','Price elasticity of supply','Calculate, interpret and apply responsiveness of quantity supplied to price.'),
  ('econ.markets.market-systems','econ.markets','Economic systems','Compare how market, mixed and other allocation mechanisms answer economic questions.'),
  ('econ.markets.market-failure','econ.markets','Market failure','Analyse why unregulated markets may misallocate resources.'),
  ('econ.markets.intervention','econ.markets','Microeconomic government intervention','Analyse policy tools used to address market outcomes and their possible consequences.'),

  ('econ.micro.money-banking','econ.micro','Money and banking','Explain functions of money and the roles of financial institutions.'),
  ('econ.micro.households','econ.micro','Household decisions','Analyse income, saving, borrowing and consumption choices.'),
  ('econ.micro.labour','econ.micro','Workers and labour markets','Analyse occupational choice, wage determination, labour demand/supply and wage differences.'),
  ('econ.micro.firms-production','econ.micro','Firms and production','Analyse business organisation, productivity, specialisation, scale and production decisions.'),
  ('econ.micro.costs-revenue-objectives','econ.micro','Costs, revenue and firm objectives','Calculate and analyse costs, revenue, profit and business objectives.'),
  ('econ.micro.market-structures','econ.micro','Market structures and competition','Analyse competition, market power, size and features of different market environments.'),

  ('econ.macro.policy','econ.macro','Macroeconomic policy','Analyse fiscal, monetary and supply-side policies and trade-offs between objectives.'),
  ('econ.macro.growth','econ.macro','Economic growth','Analyse causes, measurement, benefits, costs and sustainability of economic growth.'),
  ('econ.macro.employment','econ.macro','Employment and unemployment','Analyse labour-market participation, unemployment causes, consequences and policy responses.'),
  ('econ.macro.inflation','econ.macro','Inflation and price stability','Analyse measurement, causes, consequences and responses to changes in the general price level.'),

  ('econ.development.living-standards','econ.development','Living standards','Use economic and social indicators to compare material living standards and wellbeing.'),
  ('econ.development.poverty','econ.development','Poverty and inequality','Analyse poverty, inequality, causes, consequences and possible responses.'),
  ('econ.development.population','econ.development','Population and demographic change','Analyse population structure, growth, dependency, migration and economic effects.'),
  ('econ.development.differences','econ.development','Differences in economic development','Analyse why development differs across countries and how development may change.'),

  ('econ.international.specialisation-trade','econ.international','Specialisation and trade','Analyse specialisation, comparative reasoning, benefits/costs of trade and interdependence.'),
  ('econ.international.globalisation-restrictions','econ.international','Globalisation and trade restrictions','Analyse globalisation, protection, trade barriers and their stakeholder effects.'),
  ('econ.international.exchange-rates','econ.international','Foreign exchange rates','Analyse exchange-rate determination and effects of appreciation and depreciation.'),
  ('econ.international.current-account','econ.international','Current account and external balance','Interpret current-account components, imbalances, causes, consequences and adjustment.'),

  ('econ.reasoning.knowledge','econ.reasoning','Economic knowledge and terminology','Use economic terms, concepts, relationships and definitions accurately.'),
  ('econ.reasoning.data','econ.reasoning','Economic data and quantitative reasoning','Read, calculate, compare and interpret economic data, tables, charts and simple quantitative evidence.'),
  ('econ.reasoning.analysis','econ.reasoning','Causal economic analysis','Build linked economic chains that connect a change to mechanisms and consequences.'),
  ('econ.reasoning.evaluation','econ.reasoning','Evaluation and reasoned judgement','Weigh conditions, stakeholders, time horizons, trade-offs and evidence to reach supported judgements.')
)
insert into public.academic_skill_registry_nodes(
  registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status
)
select v.id,p.id,'skill',s.code,s.name,s.description,array['upper_secondary']::text[],'active'
from v cross join seed s
join public.academic_skill_registry_nodes p
  on p.registry_version_id=v.id and p.code=s.parent_code and p.node_type='strand'
on conflict(code) do update set
  parent_id=excluded.parent_id,
  name=excluded.name,
  description=excluded.description,
  applicable_phases=excluded.applicable_phases,
  status='active',
  updated_at=now();

-- Atomic subskills are reusable diagnostic identities. They intentionally avoid
-- reproducing Cambridge objective sentences.
with v as (
  select id from public.academic_skill_registry_versions where code='bh-economics-core-v1'
),
seed(code,parent_code,name,description) as (values
  ('econ.foundations.scarcity-choice.resources-wants','econ.foundations.scarcity-choice','Resources, wants and scarcity','Distinguish finite productive resources from wants and explain scarcity.'),
  ('econ.foundations.scarcity-choice.choice-tradeoffs','econ.foundations.scarcity-choice','Choice and trade-offs','Explain why scarcity forces choices by households, firms and governments.'),
  ('econ.foundations.factors-production.classification','econ.foundations.factors-production','Factor classification','Classify productive resources as land, labour, capital or enterprise.'),
  ('econ.foundations.factors-production.mobility-quality','econ.foundations.factors-production','Factor mobility and quality','Analyse mobility, quantity and quality changes in factors of production.'),
  ('econ.foundations.opportunity-cost-ppc.opportunity-cost','econ.foundations.opportunity-cost-ppc','Opportunity cost','Identify and apply the next-best-alternative concept in economic choices.'),
  ('econ.foundations.opportunity-cost-ppc.ppc-interpretation','econ.foundations.opportunity-cost-ppc','Production possibility interpretation','Interpret points, movements and shifts on production possibility diagrams.'),

  ('econ.markets.market-allocation.price-signals','econ.markets.market-allocation','Price signals and incentives','Explain how changing prices influence producer and consumer decisions.'),
  ('econ.markets.market-allocation.resource-movement','econ.markets.market-allocation','Resource reallocation','Trace how incentives can move resources between uses.'),
  ('econ.markets.demand.quantity-demanded','econ.markets.demand','Quantity demanded and price','Explain the inverse price-quantity relationship with other conditions held constant.'),
  ('econ.markets.demand.determinants','econ.markets.demand','Non-price determinants of demand','Analyse income, tastes, population, related goods and other demand conditions.'),
  ('econ.markets.demand.shift-movement','econ.markets.demand','Demand shifts and movements','Distinguish a change in quantity demanded from a change in demand.'),
  ('econ.markets.supply.quantity-supplied','econ.markets.supply','Quantity supplied and price','Explain the direct price-quantity relationship with other conditions held constant.'),
  ('econ.markets.supply.determinants','econ.markets.supply','Non-price determinants of supply','Analyse costs, technology, taxes, subsidies, expectations and other supply conditions.'),
  ('econ.markets.supply.shift-movement','econ.markets.supply','Supply shifts and movements','Distinguish a change in quantity supplied from a change in supply.'),
  ('econ.markets.equilibrium-price.equilibrium','econ.markets.equilibrium-price','Market equilibrium','Identify and interpret equilibrium price and quantity.'),
  ('econ.markets.equilibrium-price.disequilibrium-adjustment','econ.markets.equilibrium-price','Shortage, surplus and adjustment','Analyse shortages, surpluses and pressure for price/quantity adjustment.'),
  ('econ.markets.ped.calculate','econ.markets.ped','PED calculation','Calculate price elasticity of demand from percentage changes.'),
  ('econ.markets.ped.interpret','econ.markets.ped','PED interpretation','Classify and interpret elasticity using the magnitude of the coefficient.'),
  ('econ.markets.ped.determinants','econ.markets.ped','PED determinants','Analyse why demand responsiveness differs between goods, consumers and time periods.'),
  ('econ.markets.ped.revenue','econ.markets.ped','PED and revenue','Apply elasticity to reason about price changes and total revenue.'),
  ('econ.markets.pes.calculate','econ.markets.pes','PES calculation','Calculate price elasticity of supply from percentage changes.'),
  ('econ.markets.pes.interpret','econ.markets.pes','PES interpretation','Classify and interpret supply responsiveness.'),
  ('econ.markets.pes.determinants','econ.markets.pes','PES determinants','Analyse capacity, stocks, production time and other influences on supply responsiveness.'),
  ('econ.markets.market-systems.allocation-questions','econ.markets.market-systems','Economic allocation questions','Compare how systems determine what, how and for whom to produce.'),
  ('econ.markets.market-systems.market-mixed','econ.markets.market-systems','Market and mixed systems','Compare private decisions with government participation in resource allocation.'),
  ('econ.markets.market-failure.externalities','econ.markets.market-failure','External costs and benefits','Analyse third-party effects and divergence between private and social outcomes.'),
  ('econ.markets.market-failure.public-merit-information','econ.markets.market-failure','Public, merit and information problems','Analyse under/over-consumption, exclusion/rivalry issues and information failures.'),
  ('econ.markets.market-failure.market-power','econ.markets.market-failure','Market power and resource allocation','Analyse how weak competition or market power may affect price, output and welfare.'),
  ('econ.markets.intervention.taxes-subsidies','econ.markets.intervention','Indirect taxes and subsidies','Analyse effects and possible trade-offs of taxes and subsidies.'),
  ('econ.markets.intervention.controls-regulation','econ.markets.intervention','Controls and regulation','Analyse price controls, rules and direct provision as policy responses.'),
  ('econ.markets.intervention.policy-evaluation','econ.markets.intervention','Micro-policy evaluation','Evaluate likely effectiveness, side effects and stakeholder impacts of intervention.'),

  ('econ.micro.money-banking.money-functions','econ.micro.money-banking','Functions of money','Explain how money supports exchange, valuation, saving and deferred payment.'),
  ('econ.micro.money-banking.financial-institutions','econ.micro.money-banking','Banking and financial intermediation','Explain roles of commercial banks, central banks and financial services.'),
  ('econ.micro.households.income-consumption-saving','econ.micro.households','Income, consumption and saving','Analyse how income and other factors affect household spending and saving.'),
  ('econ.micro.households.borrowing-interest','econ.micro.households','Borrowing and interest','Analyse household borrowing decisions and sensitivity to interest rates.'),
  ('econ.micro.labour.occupational-choice','econ.micro.labour','Occupational choice','Analyse monetary and non-monetary influences on job choice.'),
  ('econ.micro.labour.wage-determination','econ.micro.labour','Wage determination','Analyse demand and supply influences on wage rates.'),
  ('econ.micro.labour.wage-differences','econ.micro.labour','Wage differences','Explain wage variation using skills, productivity, conditions, bargaining and market forces.'),
  ('econ.micro.firms-production.specialisation-productivity','econ.micro.firms-production','Specialisation and productivity','Analyse division of labour, productivity and related advantages/disadvantages.'),
  ('econ.micro.firms-production.scale','econ.micro.firms-production','Scale of production','Analyse growth, economies and diseconomies of scale.'),
  ('econ.micro.firms-production.business-growth','econ.micro.firms-production','Firm growth and integration','Analyse reasons for and effects of firm growth and integration.'),
  ('econ.micro.costs-revenue-objectives.costs','econ.micro.costs-revenue-objectives','Costs of production','Calculate and interpret fixed, variable, total and average costs.'),
  ('econ.micro.costs-revenue-objectives.revenue-profit','econ.micro.costs-revenue-objectives','Revenue and profit','Calculate and interpret revenue, profit and loss.'),
  ('econ.micro.costs-revenue-objectives.objectives','econ.micro.costs-revenue-objectives','Business objectives','Analyse profit and alternative objectives and how priorities may change.'),
  ('econ.micro.market-structures.competition-power','econ.micro.market-structures','Competition and market power','Compare consequences of stronger competition and greater market power.'),
  ('econ.micro.market-structures.structure-outcomes','econ.micro.market-structures','Market structure and outcomes','Link market conditions to price, output, quality, choice and efficiency.'),

  ('econ.macro.policy.objectives-conflicts','econ.macro.policy','Macroeconomic objectives and conflicts','Identify policy objectives and analyse possible conflicts or complementarities.'),
  ('econ.macro.policy.fiscal','econ.macro.policy','Fiscal policy transmission','Trace changes in taxation and government spending through demand, incentives and macro outcomes.'),
  ('econ.macro.policy.monetary','econ.macro.policy','Monetary policy transmission','Trace interest-rate or monetary changes through borrowing, saving, spending and macro outcomes.'),
  ('econ.macro.policy.supply-side','econ.macro.policy','Supply-side policy transmission','Analyse how policies may influence productive capacity, costs, incentives and long-run performance.'),
  ('econ.macro.growth.measurement-causes','econ.macro.growth','Growth measurement and causes','Interpret real output growth and analyse demand- and supply-side causes.'),
  ('econ.macro.growth.costs-benefits','econ.macro.growth','Growth benefits, costs and sustainability','Evaluate effects of growth across living standards, distribution and the environment.'),
  ('econ.macro.employment.measurement','econ.macro.employment','Employment and unemployment measurement','Interpret labour-market indicators and distinguish employment, unemployment and inactivity.'),
  ('econ.macro.employment.causes-types','econ.macro.employment','Causes and types of unemployment','Distinguish and analyse cyclical, structural, frictional and other unemployment.'),
  ('econ.macro.employment.consequences-policy','econ.macro.employment','Unemployment consequences and policy','Analyse stakeholder effects and appropriate policy responses.'),
  ('econ.macro.inflation.measurement','econ.macro.inflation','Inflation measurement','Interpret price indices and inflation-rate changes.'),
  ('econ.macro.inflation.causes','econ.macro.inflation','Causes of inflation','Distinguish and analyse demand-side and cost-side inflationary pressures.'),
  ('econ.macro.inflation.consequences-policy','econ.macro.inflation','Inflation consequences and policy','Analyse stakeholder effects and evaluate policy responses.'),

  ('econ.development.living-standards.income-output-indicators','econ.development.living-standards','Income and output indicators','Use real income/output per person and related measures carefully.'),
  ('econ.development.living-standards.non-income-indicators','econ.development.living-standards','Non-income indicators','Use health, education, access and other social evidence when comparing living standards.'),
  ('econ.development.living-standards.measurement-limitations','econ.development.living-standards','Limitations of living-standard measures','Evaluate distribution, informal activity, quality, environment and comparability limitations.'),
  ('econ.development.poverty.causes-consequences','econ.development.poverty','Poverty causes and consequences','Analyse economic and social drivers and effects of poverty.'),
  ('econ.development.poverty.policy','econ.development.poverty','Poverty reduction policies','Evaluate policies intended to reduce poverty or inequality.'),
  ('econ.development.population.structure-change','econ.development.population','Population structure and change','Interpret birth/death rates, age structure, dependency and population change.'),
  ('econ.development.population.migration-effects','econ.development.population','Migration and economic effects','Analyse causes and consequences of migration for origin and destination economies.'),
  ('econ.development.differences.causes','econ.development.differences','Causes of development differences','Analyse resource, human capital, institutional, trade, investment and demographic influences.'),
  ('econ.development.differences.development-strategies','econ.development.differences','Development strategies','Evaluate approaches to raising productivity, incomes and living standards.'),

  ('econ.international.specialisation-trade.specialisation','econ.international.specialisation-trade','Specialisation and comparative reasoning','Explain gains and risks from specialisation using relative opportunity-cost reasoning.'),
  ('econ.international.specialisation-trade.free-trade-effects','econ.international.specialisation-trade','Free trade effects','Analyse benefits, costs and distributional effects of freer trade.'),
  ('econ.international.globalisation-restrictions.globalisation','econ.international.globalisation-restrictions','Globalisation','Analyse drivers and effects of deeper international economic integration.'),
  ('econ.international.globalisation-restrictions.trade-barriers','econ.international.globalisation-restrictions','Trade barriers','Analyse tariffs, quotas and other restrictions and their stakeholder effects.'),
  ('econ.international.exchange-rates.determination','econ.international.exchange-rates','Exchange-rate determination','Analyse demand and supply influences in foreign-exchange markets.'),
  ('econ.international.exchange-rates.appreciation-depreciation','econ.international.exchange-rates','Appreciation and depreciation','Trace exchange-rate changes through import/export prices, demand and macro outcomes.'),
  ('econ.international.current-account.components','econ.international.current-account','Current-account components','Classify and interpret major current-account flows.'),
  ('econ.international.current-account.imbalance','econ.international.current-account','Current-account imbalance','Analyse causes, consequences and possible adjustment of deficits and surpluses.'),

  ('econ.reasoning.knowledge.terms-concepts','econ.reasoning.knowledge','Terminology and concepts','Use economic vocabulary and concepts accurately and in the correct context.'),
  ('econ.reasoning.knowledge.relationships','econ.reasoning.knowledge','Economic relationships','Recall and explain standard relationships between economic variables.'),
  ('econ.reasoning.data.calculation','econ.reasoning.data','Economic calculation','Select and perform appropriate calculations accurately.'),
  ('econ.reasoning.data.interpretation','econ.reasoning.data','Data interpretation','Extract trends, comparisons, anomalies and economically relevant evidence from data.'),
  ('econ.reasoning.data.diagram','econ.reasoning.data','Economic diagram use','Construct and interpret simple economics diagrams accurately and purposefully.'),
  ('econ.reasoning.analysis.causal-chain','econ.reasoning.analysis','Multi-step causal chains','Develop linked mechanisms rather than isolated assertions.'),
  ('econ.reasoning.analysis.context-application','econ.reasoning.analysis','Application to context','Use case evidence and economic conditions to make analysis specific rather than generic.'),
  ('econ.reasoning.analysis.stakeholder-effects','econ.reasoning.analysis','Stakeholder effects','Trace how an economic change can affect different groups through different channels.'),
  ('econ.reasoning.evaluation.conditions','econ.reasoning.evaluation','Conditions and dependencies','Identify assumptions and conditions that change the likely outcome.'),
  ('econ.reasoning.evaluation.time-horizon','econ.reasoning.evaluation','Short-run and long-run evaluation','Distinguish effects that vary across time horizons.'),
  ('econ.reasoning.evaluation.judgement','econ.reasoning.evaluation','Supported judgement','Reach a balanced conclusion that follows from prior analysis and evidence.')
)
insert into public.academic_skill_registry_nodes(
  registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status
)
select v.id,p.id,'subskill',s.code,s.name,s.description,array['upper_secondary']::text[],'active'
from v cross join seed s
join public.academic_skill_registry_nodes p
  on p.registry_version_id=v.id and p.code=s.parent_code and p.node_type='skill'
on conflict(code) do update set
  parent_id=excluded.parent_id,
  name=excluded.name,
  description=excluded.description,
  applicable_phases=excluded.applicable_phases,
  status='active',
  updated_at=now();

-- Subject aliases make Economics a first-class governed subject throughout the
-- existing generation, manual-governance and Academic Profile pipeline.
with v as (
  select id from public.academic_skill_registry_versions where code='bh-economics-core-v1'
),
seed(alias_normalized,display_name) as (values
  ('economics','Economics'),
  ('economic studies','Economic Studies'),
  ('igcse economics','IGCSE Economics')
)
insert into public.academic_skill_registry_subject_aliases(
  alias_normalized,registry_version_id,allowed_strand_codes,display_name,status,allowed_programme_codes
)
select s.alias_normalized,v.id,null,s.display_name,'active',array['0455']::text[]
from v cross join seed s
on conflict(alias_normalized) do update set
  registry_version_id=excluded.registry_version_id,
  allowed_strand_codes=excluded.allowed_strand_codes,
  display_name=excluded.display_name,
  status='active',
  allowed_programme_codes=excluded.allowed_programme_codes;

-- Public Cambridge 0455 programme/section crosswalks for exams in 2027-2029.
-- External section labels are short public identifiers only; Brain Heist does not
-- store Cambridge's protected objective wording.
with v as (
  select id from public.academic_skill_registry_versions where code='bh-economics-core-v1'
),
seed(node_code,external_strand,external_reference_code,alignment_note) as (values
  ('econ.foundations','The basic economic problem','CIE0455-2027-S1','Broad alignment to Cambridge IGCSE Economics 0455 content section 1.'),
  ('econ.markets','The allocation of resources','CIE0455-2027-S2','Broad alignment to Cambridge IGCSE Economics 0455 content section 2.'),
  ('econ.micro','Microeconomic decision-makers','CIE0455-2027-S3','Broad alignment to Cambridge IGCSE Economics 0455 content section 3.'),
  ('econ.macro','Government and the macroeconomy','CIE0455-2027-S4','Broad alignment to Cambridge IGCSE Economics 0455 content section 4.'),
  ('econ.development','Economic development','CIE0455-2027-S5','Broad alignment to Cambridge IGCSE Economics 0455 content section 5.'),
  ('econ.international','International trade and globalisation','CIE0455-2027-S6','Broad alignment to Cambridge IGCSE Economics 0455 content section 6.')
)
insert into public.academic_skill_framework_crosswalks(
  registry_version_id,node_id,provider_name,programme_code,programme_name,phase,
  external_strand,external_reference_code,alignment_level,alignment_note,
  source_url,source_version,status
)
select
  v.id,n.id,'Cambridge International','0455','Cambridge IGCSE Economics','upper_secondary',
  s.external_strand,s.external_reference_code,'subject_content',s.alignment_note,
  'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-economics-0455/',
  '2027-2029','active'
from v cross join seed s
join public.academic_skill_registry_nodes n
  on n.registry_version_id=v.id and n.code=s.node_code
on conflict (node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level)
do update set
  programme_name=excluded.programme_name,
  phase=excluded.phase,
  external_strand=excluded.external_strand,
  alignment_note=excluded.alignment_note,
  source_url=excluded.source_url,
  source_version=excluded.source_version,
  status='active';

-- External assessment-objective namespace. These references never replace
-- Brain Heist's internal BH-AO1..BH-AO4 cognitive-process field.
with v as (
  select id from public.academic_skill_registry_versions where code='bh-economics-core-v1'
),
seed(node_code,external_reference_code,external_strand,alignment_note) as (values
  ('econ.reasoning.knowledge','CIE0455-AO1','Knowledge and understanding','External Cambridge assessment-objective crosswalk for economics knowledge and understanding.'),
  ('econ.reasoning.analysis','CIE0455-AO2','Analysis','External Cambridge assessment-objective crosswalk for economic analysis.'),
  ('econ.reasoning.evaluation','CIE0455-AO3','Evaluation','External Cambridge assessment-objective crosswalk for economic evaluation.')
)
insert into public.academic_skill_framework_crosswalks(
  registry_version_id,node_id,provider_name,programme_code,programme_name,phase,
  external_strand,external_reference_code,alignment_level,alignment_note,
  source_url,source_version,status
)
select
  v.id,n.id,'Cambridge International','0455','Cambridge IGCSE Economics','upper_secondary',
  s.external_strand,s.external_reference_code,'assessment_objective',s.alignment_note,
  'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-economics-0455/',
  '2027-2029','active'
from v cross join seed s
join public.academic_skill_registry_nodes n
  on n.registry_version_id=v.id and n.code=s.node_code
on conflict (node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level)
do update set
  programme_name=excluded.programme_name,
  phase=excluded.phase,
  external_strand=excluded.external_strand,
  alignment_note=excluded.alignment_note,
  source_url=excluded.source_url,
  source_version=excluded.source_version,
  status='active';

-- Precision evidence focuses for the highest-value IGCSE Economics misconceptions
-- and exam-reasoning behaviours.
with v as (
  select id from public.academic_skill_registry_versions where code='bh-economics-core-v1'
),
seed(subskill_code,focus_code,focus_name,focus_description) as (values
  ('econ.markets.demand.shift-movement','econ.focus.demand.shift-vs-movement','Demand shift versus movement','Distinguish a movement along a demand curve caused by price from a shift caused by a non-price condition.'),
  ('econ.markets.supply.shift-movement','econ.focus.supply.shift-vs-movement','Supply shift versus movement','Distinguish a movement along a supply curve caused by price from a shift caused by a non-price condition.'),
  ('econ.markets.equilibrium-price.disequilibrium-adjustment','econ.focus.equilibrium.shortage-surplus','Shortage and surplus adjustment','Trace how shortage or surplus creates pressure for price and quantity adjustment toward equilibrium.'),
  ('econ.markets.ped.calculate','econ.focus.ped.calculate','Calculate PED correctly','Use percentage changes in quantity demanded and price with a consistent elasticity convention.'),
  ('econ.markets.ped.interpret','econ.focus.ped.interpret','Interpret PED magnitude','Classify responsiveness from the magnitude of the PED coefficient and explain its economic meaning.'),
  ('econ.markets.ped.revenue','econ.focus.ped.revenue','Link PED to total revenue','Reason correctly about how price changes may affect total revenue under elastic or inelastic demand.'),
  ('econ.markets.pes.interpret','econ.focus.pes.interpret','Interpret PES magnitude','Classify and explain supply responsiveness using the PES coefficient.'),
  ('econ.markets.market-failure.externalities','econ.focus.market-failure.externalities','Private versus social effects','Identify third-party costs or benefits and connect them to over- or under-allocation of resources.'),
  ('econ.markets.intervention.policy-evaluation','econ.focus.micro-policy.tradeoffs','Evaluate intervention trade-offs','Judge a microeconomic policy using effectiveness, unintended effects, stakeholders and implementation conditions.'),
  ('econ.micro.labour.wage-determination','econ.focus.labour.wage-demand-supply','Wage demand and supply chain','Explain wage changes through labour demand, labour supply and productivity rather than assertion alone.'),
  ('econ.macro.policy.fiscal','econ.focus.fiscal.transmission','Fiscal-policy transmission','Trace a tax or government-spending change through aggregate spending/incentives to macroeconomic outcomes.'),
  ('econ.macro.policy.monetary','econ.focus.monetary.interest-rate-chain','Interest-rate transmission','Trace an interest-rate change through borrowing, saving and spending to output, employment and/or inflation.'),
  ('econ.macro.policy.supply-side','econ.focus.supply-side.capacity','Supply-side productive-capacity chain','Connect a supply-side measure to costs, productivity, productive capacity and longer-run macroeconomic performance.'),
  ('econ.macro.employment.causes-types','econ.focus.unemployment.types','Distinguish unemployment types','Identify the mechanism behind unemployment and distinguish structural, cyclical and frictional cases.'),
  ('econ.macro.inflation.causes','econ.focus.inflation.demand-cost','Demand-pull versus cost-push inflation','Distinguish demand-side inflationary pressure from rising production-cost pressure and trace each mechanism.'),
  ('econ.development.living-standards.measurement-limitations','econ.focus.living-standards.indicator-limits','Evaluate living-standard indicators','Use more than one indicator and explain why averages or income measures can give an incomplete comparison.'),
  ('econ.international.exchange-rates.appreciation-depreciation','econ.focus.exchange-rate.direction-effects','Exchange-rate direction and effects','Correctly trace appreciation/depreciation through import and export prices, quantities and wider outcomes.'),
  ('econ.international.current-account.imbalance','econ.focus.current-account.causal-chain','Current-account imbalance analysis','Connect domestic demand, competitiveness, exchange rates or growth to current-account outcomes.'),
  ('econ.reasoning.data.interpretation','econ.focus.reasoning.data-evidence','Use data as economic evidence','Select a relevant figure or trend and integrate it into an economic explanation rather than merely quoting it.'),
  ('econ.reasoning.data.diagram','econ.focus.reasoning.diagram-causality','Use diagrams as analysis','Label and shift the correct curve(s), identify the new outcome and explain the economic mechanism represented.'),
  ('econ.reasoning.analysis.causal-chain','econ.focus.reasoning.chain-development','Develop multi-step analysis','Extend a point through at least one economic mechanism and a logically connected consequence.'),
  ('econ.reasoning.analysis.context-application','econ.focus.reasoning.application','Apply analysis to context','Use case-specific evidence, conditions or stakeholders to make the economic reasoning specific.'),
  ('econ.reasoning.evaluation.conditions','econ.focus.reasoning.depends-on','Make evaluation conditional','State a relevant condition and explain how it changes the strength or direction of the conclusion.'),
  ('econ.reasoning.evaluation.time-horizon','econ.focus.reasoning.time-horizon','Evaluate across time','Distinguish short-run from long-run effects when adjustment lags or capacity responses matter.'),
  ('econ.reasoning.evaluation.judgement','econ.focus.reasoning.judgement','Reach a supported judgement','Choose a conclusion that follows from the preceding analysis and explain why it is more persuasive under the stated conditions.')
)
insert into public.academic_skill_evidence_focuses(
  registry_version_id,atomic_subskill_node_id,code,name,description,
  applicable_phases,source_method,source_fingerprint,status
)
select
  v.id,n.id,s.focus_code,s.focus_name,s.focus_description,
  array['upper_secondary']::text[],'platform_seed','economics-v1:'||s.focus_code,'active'
from v cross join seed s
join public.academic_skill_registry_nodes n
  on n.registry_version_id=v.id and n.code=s.subskill_code and n.node_type='subskill'
on conflict(code) do update set
  atomic_subskill_node_id=excluded.atomic_subskill_node_id,
  name=excluded.name,
  description=excluded.description,
  applicable_phases=excluded.applicable_phases,
  source_method=excluded.source_method,
  source_fingerprint=excluded.source_fingerprint,
  status='active',
  updated_at=now();

-- Every Economics subskill must be selectable during governance even when a more
-- precise evidence focus has not yet been authored.
with v as (
  select id from public.academic_skill_registry_versions where code='bh-economics-core-v1'
)
insert into public.academic_skill_evidence_focuses(
  registry_version_id,atomic_subskill_node_id,code,name,description,
  applicable_phases,source_method,source_fingerprint,status
)
select
  v.id,n.id,n.code||'.focus.core','Core demonstration',
  'Demonstrate the canonical subskill accurately in an unfamiliar economics context.',
  array['upper_secondary']::text[],'platform_seed','economics-v1-core:'||n.code,'active'
from v
join public.academic_skill_registry_nodes n
  on n.registry_version_id=v.id and n.node_type='subskill' and n.status='active'
where not exists(
  select 1 from public.academic_skill_evidence_focuses f
  where f.atomic_subskill_node_id=n.id and f.status='active'
)
on conflict(code) do update set
  atomic_subskill_node_id=excluded.atomic_subskill_node_id,
  description=excluded.description,
  applicable_phases=excluded.applicable_phases,
  source_method=excluded.source_method,
  source_fingerprint=excluded.source_fingerprint,
  status='active',
  updated_at=now();

-- Extend the existing registry RPC with framework metadata that teacher-facing
-- curriculum navigation can render without hard-coded Economics special cases.
create or replace function public.rpc_academic_skill_registry_for_generation(
  p_subject_key text,
  p_grade_level integer,
  p_phase text default null::text
)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_phase text;
  v_alias public.academic_skill_registry_subject_aliases%rowtype;
  v_version public.academic_skill_registry_versions%rowtype;
begin
  v_phase:=coalesce(nullif(trim(p_phase),''),
    case when p_grade_level between 1 and 6 then 'primary'
         when p_grade_level between 7 and 9 then 'lower_secondary'
         when p_grade_level between 10 and 12 then 'upper_secondary'
         else null end);
  if v_phase not in ('primary','lower_secondary','upper_secondary') then
    raise exception using errcode='22023',message='invalid_registry_phase';
  end if;

  select a.* into v_alias
  from public.academic_skill_registry_subject_aliases a
  where a.alias_normalized=lower(trim(coalesce(p_subject_key,'')))
    and a.status='active'
  limit 1;

  if not found then
    return jsonb_build_object(
      'success',true,'supported',false,'reason','registry_not_available_for_subject'
    );
  end if;

  select * into v_version
  from public.academic_skill_registry_versions
  where id=v_alias.registry_version_id and status='published';
  if not found then
    return jsonb_build_object(
      'success',true,'supported',false,'reason','registry_not_published'
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'supported',true,
    'canonicalSubject',v_version.subject_key,
    'registryVersion',v_version.code,
    'phase',v_phase,
    'cambridgeProgrammes',coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'code',c.programme_code,
        'name',c.programme_name
      ))
      from public.academic_skill_framework_crosswalks c
      where c.registry_version_id=v_version.id
        and c.phase=v_phase
        and c.status='active'
        and (v_alias.allowed_programme_codes is null or c.programme_code=any(v_alias.allowed_programme_codes))
    ),'[]'::jsonb),
    'frameworkAlignments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'providerName',c.provider_name,
        'programmeCode',c.programme_code,
        'programmeName',c.programme_name,
        'phase',c.phase,
        'externalStrand',c.external_strand,
        'externalReferenceCode',c.external_reference_code,
        'alignmentLevel',c.alignment_level,
        'alignmentNote',c.alignment_note,
        'sourceUrl',c.source_url,
        'sourceVersion',c.source_version
      ) order by c.alignment_level,c.external_reference_code)
      from public.academic_skill_framework_crosswalks c
      where c.registry_version_id=v_version.id
        and c.phase=v_phase
        and c.status='active'
        and (v_alias.allowed_programme_codes is null or c.programme_code=any(v_alias.allowed_programme_codes))
    ),'[]'::jsonb),
    'rules',jsonb_build_array(
      'Select canonical codes from this registry; do not invent a new official skill or subskill.',
      'Skill identity describes the durable subject competency, not the assessment process or one question context.',
      'Keep question-specific detail in the evidence statement, not the canonical skill name.',
      'If no canonical subskill fits, require taxonomy review instead of silently creating one.'
    ),
    'skills',coalesce((
      select jsonb_agg(jsonb_build_object(
        'strandCode',strand.code,
        'strandName',strand.name,
        'skillCode',skill.code,
        'skillName',skill.name,
        'skillDescription',skill.description,
        'subskillCode',leaf.code,
        'subskillName',leaf.name,
        'subskillDescription',leaf.description,
        'evidenceFocusCount',(
          select count(*)
          from public.academic_skill_evidence_focuses f
          where f.atomic_subskill_node_id=leaf.id and f.status='active'
        )
      ) order by strand.code,skill.code,leaf.code)
      from public.academic_skill_registry_nodes leaf
      join public.academic_skill_registry_nodes skill
        on skill.id=leaf.parent_id and skill.node_type='skill' and skill.status='active'
      join public.academic_skill_registry_nodes strand
        on strand.id=skill.parent_id and strand.node_type='strand' and strand.status='active'
      where leaf.registry_version_id=v_version.id
        and leaf.node_type='subskill'
        and leaf.status='active'
        and v_phase=any(leaf.applicable_phases)
        and v_phase=any(skill.applicable_phases)
        and (v_alias.allowed_strand_codes is null or strand.code=any(v_alias.allowed_strand_codes))
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.rpc_academic_skill_registry_for_generation(text,integer,text)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_academic_skill_registry_for_generation(text,integer,text)
to authenticated,service_role;

-- Migration invariants: fail the deployment rather than publish a partial registry.
do $$
declare
  v_id uuid;
  v_strands integer;
  v_skills integer;
  v_subskills integer;
  v_missing_focus integer;
  v_crosswalks integer;
begin
  select id into v_id
  from public.academic_skill_registry_versions
  where code='bh-economics-core-v1' and status='published';

  if v_id is null then
    raise exception 'economics_registry_not_published';
  end if;

  select
    count(*) filter(where node_type='strand'),
    count(*) filter(where node_type='skill'),
    count(*) filter(where node_type='subskill')
  into v_strands,v_skills,v_subskills
  from public.academic_skill_registry_nodes
  where registry_version_id=v_id and status='active';

  if v_strands <> 7 or v_skills < 30 or v_subskills < 80 then
    raise exception 'economics_registry_incomplete strands=% skills=% subskills=%',
      v_strands,v_skills,v_subskills;
  end if;

  select count(*) into v_missing_focus
  from public.academic_skill_registry_nodes n
  where n.registry_version_id=v_id
    and n.node_type='subskill'
    and n.status='active'
    and not exists(
      select 1 from public.academic_skill_evidence_focuses f
      where f.atomic_subskill_node_id=n.id and f.status='active'
    );

  if v_missing_focus <> 0 then
    raise exception 'economics_evidence_focus_coverage_incomplete missing=%',v_missing_focus;
  end if;

  select count(*) into v_crosswalks
  from public.academic_skill_framework_crosswalks c
  where c.registry_version_id=v_id
    and c.programme_code='0455'
    and c.source_version='2027-2029'
    and c.status='active';

  if v_crosswalks < 9 then
    raise exception 'economics_cambridge_crosswalk_incomplete count=%',v_crosswalks;
  end if;
end $$;
