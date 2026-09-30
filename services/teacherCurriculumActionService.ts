import type * as GameService from './gameService';

export type CurriculumTeachingDimension = 'content' | 'reasoning';
export type ReteachPriority = 'urgent' | 'high' | 'watch';

export interface CurriculumHotspotStudent {
  studentId: string;
  studentName: string;
  status: 'new_focus' | 'recurring' | 'persistent' | 'improving' | 'resolved' | string;
  trend: string;
  priority: string;
  focusOccurrences: number;
  evidenceItems: number;
  firstObservedAt?: string | null;
  lastObservedAt?: string | null;
  confidenceScore?: number | null;
  assessmentState?: string | null;
  teacherReviewRequired?: boolean;
}

export interface CurriculumHotspotEvidence {
  subskillCode: string;
  impactedStudents: number;
  newFocusStudents: number;
  recurringStudents: number;
  persistentStudents: number;
  improvingStudents: number;
  resolvedStudents: number;
  focusOccurrences: number;
  evidenceItems: number;
  firstObservedAt?: string | null;
  lastObservedAt?: string | null;
  teacherReviewStudents: number;
  students: CurriculumHotspotStudent[];
}

export interface CurriculumReteachRecommendation {
  rank: number;
  priority: ReteachPriority;
  dimension: CurriculumTeachingDimension;
  strandCode: string;
  strandName: string;
  skillCode: string;
  skillName: string;
  subskillCode: string;
  subskillName: string;
  whyNow: string;
  misconception: string;
  teachSequence: string[];
  classroomMove: string;
  reassessment: string;
  examinerLens: string;
  impactedStudents: number;
  persistentStudents: number;
  recurringStudents: number;
  improvingStudents: number;
  resolvedStudents: number;
  focusOccurrences: number;
  evidenceItems: number;
  affectedStudents: CurriculumHotspotStudent[];
}

interface TeachingPlay {
  misconception: string;
  teachSequence: string[];
  classroomMove: string;
  reassessment: string;
  examinerLens: string;
}

const genericPlay: TeachingPlay = {
  misconception: 'Students may know the vocabulary but not yet connect the concept to a complete economic chain of reasoning.',
  teachSequence: [
    'Re-establish the core definition and the economic variable that changes.',
    'Model one complete cause → mechanism → outcome chain.',
    'Contrast a correct example with a tempting but incomplete explanation.',
    'Move from guided practice to a fresh context without prompts.',
  ],
  classroomMove: 'Use a mini-whiteboard hinge question, then ask pairs to repair one incomplete explanation before whole-class feedback.',
  reassessment: 'Use 3–5 fresh questions: one recall check, one application item and one independent explanation. Treat the result as new evidence, not proof of mastery by itself.',
  examinerLens: 'Reward precise economics, a developed causal chain and context-specific application rather than generic assertions.',
};

const economicsPlaybook: Array<{ match: RegExp; play: TeachingPlay }> = [
  {
    match: /demand.*shift-vs-movement/,
    play: {
      misconception: 'Students confuse a movement along the demand curve with a shift of the whole curve.',
      teachSequence: [
        'Anchor the rule: own-price change → movement; non-price determinant → shift.',
        'Use paired diagrams with the changed variable named before drawing.',
        'Sort six scenarios into movement, increase in demand or decrease in demand.',
        'Require a one-sentence causal explanation before accepting each diagram.',
      ],
      classroomMove: 'Run a “move or shift?” rapid sort with price, income, tastes, substitutes and complements; students must defend one borderline case.',
      reassessment: 'Give one unfamiliar market and three changes. Students classify each change, draw one diagram and explain the mechanism without prompts.',
      examinerLens: 'A correct diagram is not enough if the written explanation names the wrong determinant or reverses the direction of the shift.',
    },
  },
  {
    match: /supply.*shift-vs-movement/,
    play: {
      misconception: 'Students treat changes in costs, productivity or indirect tax as movements along supply instead of shifts.',
      teachSequence: [
        'Separate own-price changes from conditions of supply.',
        'Link each determinant to unit cost or productive capacity.',
        'Model left/right shifts before introducing equilibrium effects.',
        'Finish with a context where two supply determinants move in opposite directions.',
      ],
      classroomMove: 'Give teams cost shock cards and ask them to place each on a supply diagram, then justify the direction in exactly one economic sentence.',
      reassessment: 'Use a fresh producer context requiring one diagram plus explanation of price and quantity effects.',
      examinerLens: 'Look for the determinant → supply shift → equilibrium consequence chain, not merely “supply goes up/down.”',
    },
  },
  {
    match: /equilibrium|shortage|surplus/,
    play: {
      misconception: 'Students can label equilibrium but struggle to explain how shortage or surplus creates pressure toward a new equilibrium.',
      teachSequence: [
        'Rebuild equilibrium as a process, not just an intersection.',
        'Show excess demand and excess supply at disequilibrium prices.',
        'Trace the incentive for price to change and the resulting quantity responses.',
        'Apply the mechanism after a demand or supply shift.',
      ],
      classroomMove: 'Use a live buyer/seller price auction: pause above and below equilibrium and ask students to predict the pressure on price.',
      reassessment: 'Present one shifted market and ask students to identify shortage/surplus, direction of price pressure and final equilibrium change.',
      examinerLens: 'Strong answers explain the adjustment mechanism; weak answers jump straight from a shift to the final price.',
    },
  },
  {
    match: /ped.*calculate/,
    play: {
      misconception: 'Students reverse numerator/denominator, ignore percentage changes or mishandle the sign.',
      teachSequence: [
        'State PED as responsiveness of quantity demanded to price.',
        'Calculate percentage changes first, then form the ratio.',
        'Use magnitude for classification and explain what the number means.',
        'Check answers against economic intuition before moving on.',
      ],
      classroomMove: 'Error clinic: students diagnose three deliberately wrong PED calculations and explain the correction.',
      reassessment: 'One clean calculation plus one interpretation question using a different product and data set.',
      examinerLens: 'Method marks depend on a valid ratio and sensible interpretation; arithmetic without economic meaning is incomplete.',
    },
  },
  {
    match: /ped.*interpret|ped.*revenue/,
    play: {
      misconception: 'Students memorize elastic/inelastic labels but cannot connect responsiveness to total revenue after a price change.',
      teachSequence: [
        'Revisit elastic, unit elastic and inelastic using magnitude.',
        'Use percentage reasoning to compare price and quantity responses.',
        'Connect the relative changes to total revenue.',
        'Add determinants only after the interpretation is secure.',
      ],
      classroomMove: 'Give price-change cards and PED values; students predict revenue direction before any calculation, then justify.',
      reassessment: 'Use one unfamiliar business context asking for PED interpretation and likely revenue effect.',
      examinerLens: 'Credit the chain from PED magnitude → relative quantity response → revenue consequence, with context where supplied.',
    },
  },
  {
    match: /externalit|market-failure/,
    play: {
      misconception: 'Students identify “bad effects” but do not distinguish private from external costs/benefits or explain why market allocation is inefficient.',
      teachSequence: [
        'Identify decision-maker, third party and spillover.',
        'Separate private and external effects using one concrete example.',
        'Link the spillover to over- or under-allocation of resources.',
        'Then evaluate one policy using effectiveness, cost and unintended effects.',
      ],
      classroomMove: 'Use stakeholder mapping around a pollution or education case: each group labels private/external costs and benefits before proposing policy.',
      reassessment: 'One contextual market-failure explanation plus one short policy evaluation requiring a condition or limitation.',
      examinerLens: 'Avoid rewarding moral language alone; the economic mechanism and allocation consequence must be explicit.',
    },
  },
  {
    match: /fiscal/,
    play: {
      misconception: 'Students name tax or government spending changes but skip the transmission mechanism to aggregate demand, output, jobs or inflation.',
      teachSequence: [
        'Identify expansionary versus contractionary direction.',
        'Trace the first-round effect on disposable income or government demand.',
        'Develop the chain into consumption/investment, aggregate demand and macro outcomes.',
        'Evaluate using spare capacity, confidence, time lags and budget effects.',
      ],
      classroomMove: 'Build a human “policy chain”: each student holds one link and the class must arrange the causal sequence correctly.',
      reassessment: 'Give a recession/inflation context and require a four-link fiscal chain plus one developed limitation.',
      examinerLens: 'Analysis marks come from linked reasoning; evaluation improves when the condition changes the likely size or direction of the effect.',
    },
  },
  {
    match: /monetary|interest-rate/,
    play: {
      misconception: 'Students state “interest rates change demand” without tracing borrowing, saving, consumption, investment and exchange-rate channels.',
      teachSequence: [
        'Start with the policy rate direction.',
        'Trace borrowing and saving incentives.',
        'Connect to consumption/investment and aggregate demand.',
        'Add exchange-rate or confidence channels only after the core chain is secure.',
      ],
      classroomMove: 'Use a transmission-chain relay: teams must order shuffled mechanism cards and identify one point where the chain could weaken.',
      reassessment: 'One unfamiliar macro context: explain the likely effect of a rate change and evaluate one reason the effect may be limited.',
      examinerLens: 'A developed chain is stronger than listing several effects; evaluation should explain why transmission may be stronger or weaker.',
    },
  },
  {
    match: /supply-side|capacity/,
    play: {
      misconception: 'Students treat every supply-side policy as an immediate demand-side stimulus.',
      teachSequence: [
        'Define the capacity/productivity objective.',
        'Separate short-run implementation from longer-run productive effects.',
        'Trace skills, incentives, infrastructure or competition into productivity/costs.',
        'Evaluate time, cost, targeting and possible distributional effects.',
      ],
      classroomMove: 'Policy sorting: classify measures by channel—human capital, infrastructure, labour incentives, competition—and defend the expected time horizon.',
      reassessment: 'Ask students to compare two supply-side policies for one specific structural problem.',
      examinerLens: 'Good evaluation recognises delayed effects and that the appropriate policy depends on the source of the supply constraint.',
    },
  },
  {
    match: /unemployment/,
    play: {
      misconception: 'Students label unemployment types by keyword rather than by the underlying cause.',
      teachSequence: [
        'Define the labour-market state precisely.',
        'Diagnose the cause before naming the type.',
        'Match policy to cause rather than to unemployment in general.',
        'Evaluate mismatch, mobility, demand conditions and time lags.',
      ],
      classroomMove: 'Case-diagnosis carousel: each station describes a worker/job-market scenario; students name the cause, type and best-targeted response.',
      reassessment: 'Use two new cases with different causes and require diagnosis plus policy justification.',
      examinerLens: 'Policy marks are strongest when the response is causally matched to the type of unemployment identified.',
    },
  },
  {
    match: /inflation/,
    play: {
      misconception: 'Students confuse a high price level with inflation and blur demand-pull and cost-push causes.',
      teachSequence: [
        'Separate price level from rate of change.',
        'Diagnose demand-side versus cost-side pressure.',
        'Trace effects on households, firms, savers/borrowers and competitiveness.',
        'Choose policy based on cause and evaluate trade-offs.',
      ],
      classroomMove: 'Inflation detective: students classify short news-style scenarios as demand-side, cost-side or ambiguous and defend the evidence.',
      reassessment: 'One cause-identification item, one stakeholder effect and one policy choice with a limitation.',
      examinerLens: 'Causal diagnosis matters: a policy can be inappropriate if the student has misidentified the source of inflation.',
    },
  },
  {
    match: /living-standards|indicator/,
    play: {
      misconception: 'Students treat GDP per head or one social indicator as a complete measure of living standards.',
      teachSequence: [
        'Distinguish material living standards from broader wellbeing.',
        'Use real per-person measures carefully.',
        'Add distribution, informal activity and non-income indicators.',
        'Make a balanced comparison using at least two types of evidence.',
      ],
      classroomMove: 'Country comparison challenge: groups receive incomplete indicator cards and must decide what additional data they need before judging living standards.',
      reassessment: 'Give a small data table and ask for a supported comparison plus one limitation of the chosen indicator.',
      examinerLens: 'Evaluation improves when students explain what an indicator misses rather than simply saying “there are limitations.”',
    },
  },
  {
    match: /exchange-rate/,
    play: {
      misconception: 'Students reverse appreciation/depreciation effects on import and export prices.',
      teachSequence: [
        'Fix the currency-direction language first.',
        'Translate the change into domestic-currency import/export prices.',
        'Trace quantity responses and then macro consequences.',
        'Evaluate elasticity, imported inputs, time horizon and trading conditions.',
      ],
      classroomMove: 'Currency direction drill using mini price tags: students physically reprice imports/exports after an appreciation or depreciation.',
      reassessment: 'Use a new currency scenario requiring direction, trade-price effect and one developed macro consequence.',
      examinerLens: 'Direction errors destroy later analysis; secure the first price link before extending the chain.',
    },
  },
  {
    match: /current-account/,
    play: {
      misconception: 'Students describe a deficit/surplus but cannot build the causal chain from domestic or external conditions to current-account outcomes.',
      teachSequence: [
        'Clarify the relevant current-account flows.',
        'Identify the initial cause—income, competitiveness, exchange rate, global demand or costs.',
        'Trace through import/export demand and values.',
        'Evaluate persistence, elasticities and policy side effects.',
      ],
      classroomMove: 'Chain-builder cards: groups connect one macro shock to imports, exports and the current account, then challenge another group’s weakest link.',
      reassessment: 'One data-response item asking for a cause and consequence of a current-account change with contextual evidence.',
      examinerLens: 'High-quality analysis makes each link explicit and uses the data/context rather than generic trade statements.',
    },
  },
  {
    match: /reasoning\.data|data-evidence/,
    play: {
      misconception: 'Students quote data but do not use it as evidence for an economic claim.',
      teachSequence: [
        'Make the claim first.',
        'Select the most relevant figure or trend.',
        'State the relationship or contrast shown by the data.',
        'Explain why that evidence supports the economic argument.',
      ],
      classroomMove: 'Highlight-to-claim exercise: students may use only two figures from a data set and must justify why those are the strongest evidence.',
      reassessment: 'One short unseen data extract requiring two evidence-backed analytical points.',
      examinerLens: 'Data earns value when integrated into reasoning, not when copied as an isolated statistic.',
    },
  },
  {
    match: /diagram/,
    play: {
      misconception: 'Students draw technically acceptable diagrams but fail to connect the diagram change to the written economic mechanism.',
      teachSequence: [
        'Name the changed determinant before drawing.',
        'Label axes, curves and initial/new equilibrium clearly.',
        'Describe the graphical change in words.',
        'Connect it to the causal explanation and context.',
      ],
      classroomMove: '“Diagram without words / words without diagram” pairing: students match incomplete pairs and repair the missing causal link.',
      reassessment: 'One fresh scenario requiring both a correctly labelled diagram and a linked written explanation.',
      examinerLens: 'Diagram marks and analysis marks are related but not interchangeable; the written chain must explain what the diagram shows.',
    },
  },
  {
    match: /chain-development|causal/,
    play: {
      misconception: 'Students stop after the first effect and produce assertions rather than developed analysis.',
      teachSequence: [
        'Write the starting change.',
        'Ask “therefore what?” until at least three economically valid links are built.',
        'Check every link for direction and mechanism.',
        'Finish with the outcome named in the question.',
      ],
      classroomMove: 'Causal-chain ladder: every pair must add one valid “because/therefore” link without repeating the previous idea.',
      reassessment: 'One structured question where students must produce a minimum three-link chain before adding any evaluation.',
      examinerLens: 'Depth comes from connected consequences, not from listing many disconnected points.',
    },
  },
  {
    match: /application/,
    play: {
      misconception: 'Students give textbook economics but do not adapt it to the firm, country, market or data in the question.',
      teachSequence: [
        'Underline the contextual clue that changes the analysis.',
        'Replace generic nouns with the actual stakeholder/market.',
        'Use supplied data or characteristics inside the causal chain.',
        'Check whether the conclusion still makes sense in this context.',
      ],
      classroomMove: 'Generic-to-context rewrite: students transform a model paragraph into one that could only belong to the case they were given.',
      reassessment: 'One unseen scenario requiring two contextualised analytical points.',
      examinerLens: 'Application is strongest when context changes the reasoning, not when a country or firm name is simply inserted.',
    },
  },
  {
    match: /depends-on|evaluation/,
    play: {
      misconception: 'Students add “it depends” as a phrase but do not explain the condition or how it changes the outcome.',
      teachSequence: [
        'State the initial analytical conclusion.',
        'Identify one material condition.',
        'Explain how a high/low or short/long version of that condition changes the effect.',
        'Use that condition to qualify the judgement.',
      ],
      classroomMove: 'Depends-on matrix: teams vary one condition at a time—elasticity, spare capacity, confidence, time horizon—and rewrite the conclusion.',
      reassessment: 'One analysis paragraph plus one developed “depends on” evaluation that changes the conclusion.',
      examinerLens: 'Evaluation must be developed: condition → changed mechanism/outcome → implication for the judgement.',
    },
  },
  {
    match: /time-horizon/,
    play: {
      misconception: 'Students mention “short run/long run” without explaining why the effect changes over time.',
      teachSequence: [
        'Identify which behaviour or capacity can adjust over time.',
        'Explain the short-run constraint.',
        'Explain the later adjustment.',
        'Use the contrast to refine the policy or market conclusion.',
      ],
      classroomMove: 'Two-column timeline: students place effects under “first” and “later” and explain what becomes adjustable.',
      reassessment: 'Require one time-horizon evaluation tied to a specific mechanism, not a generic label.',
      examinerLens: 'Time horizon earns evaluative value only when the student explains what changes between the periods.',
    },
  },
  {
    match: /judgement/,
    play: {
      misconception: 'Students repeat both sides in the conclusion instead of making a justified decision.',
      teachSequence: [
        'Identify the question’s decision criterion.',
        'Select the most important analytical factor.',
        'Weigh it against the strongest counter-condition.',
        'Make a qualified judgement explicitly tied to the context.',
      ],
      classroomMove: 'Judgement courtroom: one student argues the main case, one the strongest condition, and a third must issue a reasoned verdict.',
      reassessment: 'One mini-evaluation response ending with a two-sentence justified judgement.',
      examinerLens: 'A judgement should prioritise evidence and conditions; repeating earlier points without weighing them is not enough.',
    },
  },
];

const playFor = (subskillCode: string): TeachingPlay => (
  economicsPlaybook.find(({ match }) => match.test(subskillCode))?.play || genericPlay
);

export const curriculumDimension = (
  leaf: GameService.TeacherAcademicSkillRegistryLeaf,
): CurriculumTeachingDimension => (
  leaf.strandCode === 'econ.reasoning' || leaf.subskillCode.includes('.reasoning.')
    ? 'reasoning'
    : 'content'
);

const recommendationPriority = (hotspot: CurriculumHotspotEvidence): ReteachPriority => {
  if (hotspot.persistentStudents >= 3 || hotspot.persistentStudents >= Math.max(1, Math.ceil(hotspot.impactedStudents / 2))) return 'urgent';
  if (hotspot.persistentStudents > 0 || hotspot.recurringStudents >= 2) return 'high';
  return 'watch';
};

const evidenceSpan = (hotspot: CurriculumHotspotEvidence): string | null => {
  if (!hotspot.firstObservedAt || !hotspot.lastObservedAt) return null;
  const start = new Date(hotspot.firstObservedAt).getTime();
  const end = new Date(hotspot.lastObservedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const days = Math.max(0, Math.round((end - start) / 86_400_000));
  if (days === 0) return 'within one day';
  if (days < 14) return `across ${days} days`;
  const weeks = Math.max(2, Math.round(days / 7));
  return `across about ${weeks} weeks`;
};

const whyNow = (hotspot: CurriculumHotspotEvidence): string => {
  const parts: string[] = [];
  if (hotspot.persistentStudents) parts.push(`${hotspot.persistentStudents} persistent`);
  if (hotspot.recurringStudents) parts.push(`${hotspot.recurringStudents} recurring`);
  if (hotspot.newFocusStudents) parts.push(`${hotspot.newFocusStudents} new`);
  if (hotspot.improvingStudents) parts.push(`${hotspot.improvingStudents} improving`);
  const stateText = parts.length ? parts.join(' · ') : `${hotspot.impactedStudents} active`;
  const span = evidenceSpan(hotspot);
  return `${stateText} student signal${hotspot.impactedStudents === 1 ? '' : 's'} across ${hotspot.evidenceItems} governed evidence item${hotspot.evidenceItems === 1 ? '' : 's'} and ${hotspot.focusOccurrences} focus occurrence${hotspot.focusOccurrences === 1 ? '' : 's'}${span ? ` ${span}` : ''}.`;
};

export const buildReteachRecommendations = (
  registrySkills: GameService.TeacherAcademicSkillRegistryLeaf[],
  hotspots: CurriculumHotspotEvidence[],
): CurriculumReteachRecommendation[] => {
  const leaves = new Map(registrySkills.map((leaf) => [leaf.subskillCode, leaf]));
  const ranked = hotspots
    .filter((hotspot) => hotspot.impactedStudents > 0)
    .map((hotspot) => {
      const leaf = leaves.get(hotspot.subskillCode);
      if (!leaf) return null;
      const play = playFor(hotspot.subskillCode);
      const score =
        hotspot.persistentStudents * 10
        + hotspot.recurringStudents * 6
        + hotspot.newFocusStudents * 3
        + hotspot.teacherReviewStudents * 4
        + Math.min(hotspot.focusOccurrences, 10)
        - hotspot.improvingStudents * 2;
      return { hotspot, leaf, play, score };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.score - a.score || b.hotspot.impactedStudents - a.hotspot.impactedStudents);

  return ranked.map(({ hotspot, leaf, play }, index) => ({
    rank: index + 1,
    priority: recommendationPriority(hotspot),
    dimension: curriculumDimension(leaf),
    strandCode: leaf.strandCode,
    strandName: leaf.strandName,
    skillCode: leaf.skillCode,
    skillName: leaf.skillName,
    subskillCode: leaf.subskillCode,
    subskillName: leaf.subskillName,
    whyNow: whyNow(hotspot),
    misconception: play.misconception,
    teachSequence: play.teachSequence,
    classroomMove: play.classroomMove,
    reassessment: play.reassessment,
    examinerLens: play.examinerLens,
    impactedStudents: hotspot.impactedStudents,
    persistentStudents: hotspot.persistentStudents,
    recurringStudents: hotspot.recurringStudents,
    improvingStudents: hotspot.improvingStudents,
    resolvedStudents: hotspot.resolvedStudents,
    focusOccurrences: hotspot.focusOccurrences,
    evidenceItems: hotspot.evidenceItems,
    affectedStudents: hotspot.students.filter((student) => student.status !== 'resolved'),
  }));
};
