import type * as GameService from './gameService';
import {
  curriculumDimensionForSubject,
  type CurriculumSubjectExperienceKey,
} from './curriculumSubjectExperienceService';

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
  misconception: 'Students may recognise the topic but not yet show secure understanding when the question, representation or context changes.',
  teachSequence: [
    'Re-establish the smallest essential idea or method.',
    'Model one successful example while making the thinking visible.',
    'Contrast it with a common error or incomplete response.',
    'Move from guided practice to a fresh independent example without prompts.',
  ],
  classroomMove: 'Use one short hinge question, inspect the reasoning behind responses, then repair the most common error together.',
  reassessment: 'Use 3–5 fresh items that sample recall, application and an independent response. Treat the result as new evidence, not proof of mastery by itself.',
  examinerLens: 'Look for accurate subject knowledge, a complete method or explanation, and evidence that the student can transfer the learning independently.',
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


const subjectGenericPlays: Partial<Record<CurriculumSubjectExperienceKey, TeachingPlay>> = {
  english: {
    misconception: 'Students may recognise the language feature in isolation but struggle to use or interpret it accurately in a complete text or response.',
    teachSequence: [
      'Revisit the target language or comprehension skill with one clear model.',
      'Annotate what a successful response notices, selects or controls.',
      'Compare a strong response with a plausible weaker one.',
      'Move to a fresh text or writing/speaking context without scaffolds.',
    ],
    classroomMove: 'Use a short model-and-improve routine: students identify one strength, repair one weakness and explain why the revision is better.',
    reassessment: 'Use a new text, prompt or communication task that requires the same skill without repeating the taught example.',
    examinerLens: 'Look for meaning, control, evidence from the text or task, and communication that is appropriate to purpose and audience.',
  },
  mathematics: {
    misconception: 'Students may remember a procedure but not understand when to use it, why it works or how to check whether the answer is reasonable.',
    teachSequence: [
      'Represent the mathematical idea before returning to the procedure.',
      'Model the method and verbalise the decision at each step.',
      'Analyse one common error and locate exactly where the reasoning changes.',
      'Finish with a non-routine problem that requires method selection.',
    ],
    classroomMove: 'Use an error-analysis hinge question: students choose which worked solution is valid and justify the exact step that proves it.',
    reassessment: 'Use one familiar calculation and one fresh problem that requires selecting and justifying the method independently.',
    examinerLens: 'Credit a valid method, accurate working, clear mathematical reasoning and a final answer that is checked against the context.',
  },
  science: {
    misconception: 'Students may recall scientific facts but struggle to connect evidence, mechanism and conclusion in an unfamiliar investigation or context.',
    teachSequence: [
      'Re-establish the scientific idea or relationship with a simple model.',
      'Link the idea to observable evidence or a practical example.',
      'Contrast correlation, description and a valid scientific explanation.',
      'Apply the idea to a fresh data set, investigation or real-world context.',
    ],
    classroomMove: 'Use claim–evidence–reasoning: students must support one scientific claim with evidence and explain the mechanism connecting them.',
    reassessment: 'Use a fresh question or data set requiring both scientific knowledge and evidence-based reasoning.',
    examinerLens: 'Look for correct scientific ideas, appropriate use of evidence, control of variables where relevant, and a conclusion that follows from the data.',
  },
  geography: {
    misconception: 'Students may know a geographical fact or process but struggle to explain spatial patterns, use evidence or apply it to a named place.',
    teachSequence: [
      'Rebuild the geographical process, pattern or concept.',
      'Locate it on a map, graph, image or place example.',
      'Model the chain between cause, process and consequence.',
      'Apply it to a fresh place or data source and justify the conclusion.',
    ],
    classroomMove: 'Use a map/data spotlight: students select the strongest piece of geographical evidence and explain what it shows and why it matters.',
    reassessment: 'Use a new place, map or data set that requires the same geographical idea without repeating the classroom example.',
    examinerLens: 'Look for accurate place/process knowledge, geographical evidence, linked explanation and application to the specific context.',
  },
  'global-perspectives': {
    misconception: 'Students may state an opinion or quote a source without analysing evidence quality, alternative perspectives or the reasoning behind a claim.',
    teachSequence: [
      'Clarify the claim or research question.',
      'Separate evidence from assertion and identify source provenance.',
      'Compare the strength of competing evidence or perspectives.',
      'Reach a reasoned conclusion that acknowledges an important limitation.',
    ],
    classroomMove: 'Use a source challenge: students rank two pieces of evidence for usefulness and credibility, then defend the ranking with criteria.',
    reassessment: 'Use a new source set or issue requiring evidence selection, analysis and a justified conclusion.',
    examinerLens: 'Look for purposeful research, analysis of evidence, evaluation of sources or perspectives, and a conclusion supported by reasoning.',
  },
  'digital-technology': {
    misconception: 'Students may remember terminology or copy a solution but struggle to trace how data, logic or system behaviour produces the outcome.',
    teachSequence: [
      'Make the system, data flow or algorithm visible.',
      'Trace one worked example step by step before changing the input.',
      'Diagnose a realistic bug, security risk or design flaw.',
      'Build or evaluate a fresh solution and test it against clear criteria.',
    ],
    classroomMove: 'Use predict–run–explain: students predict the result of a short algorithm or system change before testing and explaining the outcome.',
    reassessment: 'Use a new digital problem requiring students to trace, build, test or justify a solution independently.',
    examinerLens: 'Look for accurate technical knowledge, logical sequencing, testing evidence and a solution or explanation that fits the stated problem.',
  },
  'modern-languages': {
    misconception: 'Students may know vocabulary or grammar in isolation but cannot retrieve and combine it accurately enough to understand or communicate meaning.',
    teachSequence: [
      'Secure the smallest high-value language chunk or pattern.',
      'Model it inside meaningful listening, reading, speaking or writing.',
      'Contrast an accurate form with a common transfer or word-order error.',
      'Require retrieval and communication in a new context without a model.',
    ],
    classroomMove: 'Use retrieve–adapt–communicate: students recall the target language, change one detail and then use it in a genuine mini-response.',
    reassessment: 'Use a fresh listening, reading, speaking or writing task that requires spontaneous retrieval rather than copying the taught model.',
    examinerLens: 'Look for communicated meaning, appropriate vocabulary, control of structures and enough accuracy or comprehension for the task.',
  },
  'travel-tourism': {
    misconception: 'Students may recall industry terminology but struggle to apply it to a customer, destination, business or sustainability scenario.',
    teachSequence: [
      'Re-establish the industry concept and the stakeholder it affects.',
      'Apply it to one realistic travel or tourism scenario.',
      'Compare two possible decisions and identify their trade-offs.',
      'Move to a fresh case and require a justified recommendation.',
    ],
    classroomMove: 'Use a mini case conference: groups act as tourism managers and must make one recommendation using evidence from the scenario.',
    reassessment: 'Use a fresh industry scenario requiring application, evidence and a justified operational or strategic decision.',
    examinerLens: 'Look for correct industry knowledge, application to the scenario, analysis of impacts and a justified recommendation where required.',
  },
  economics: {
    misconception: 'Students may know the economic vocabulary but not yet connect the concept to a complete causal chain or apply it to the context.',
    teachSequence: [
      'Re-establish the core definition and the economic variable that changes.',
      'Model one complete cause → mechanism → outcome chain.',
      'Contrast a correct example with a tempting but incomplete explanation.',
      'Move from guided practice to a fresh economic context without prompts.',
    ],
    classroomMove: 'Use a mini-whiteboard hinge question, then ask pairs to repair one incomplete economic explanation before whole-class feedback.',
    reassessment: 'Use 3–5 fresh questions: one recall check, one application item and one independent explanation using a new context.',
    examinerLens: 'Look for precise economics, developed causal reasoning and context-specific application rather than generic assertions.',
  },
};

const subjectPlaybooks: Partial<Record<CurriculumSubjectExperienceKey, Array<{ match: RegExp; play: TeachingPlay }>>> = {
  english: [
    {
      match: /eng\.reading|inference|evidence|main-idea|summary/,
      play: {
        misconception: 'Students may locate words in a text but struggle to infer meaning or select evidence that actually supports the answer.',
        teachSequence: [
          'Separate literal retrieval from inference.',
          'Model how a clue in the text supports one reasonable interpretation.',
          'Reject one tempting answer that is not fully supported.',
          'Use a fresh paragraph and require evidence-backed inference independently.',
        ],
        classroomMove: 'Run “prove it from the text”: every inference must be paired with the shortest supporting quotation or detail.',
        reassessment: 'Use a new text with one retrieval item, one inference item and one evidence-selection item.',
        examinerLens: 'A strong response answers the question directly and uses relevant textual evidence rather than copying an unrelated sentence.',
      },
    },
    {
      match: /eng\.writing|paragraph|cohes|organisation|audience|purpose/,
      play: {
        misconception: 'Students may have suitable ideas but organise them weakly or fail to adapt language and structure to purpose and audience.',
        teachSequence: [
          'Clarify purpose, audience and the intended effect.',
          'Model a paragraph with a clear controlling idea and logical development.',
          'Compare weak and strong cohesion between sentences.',
          'Write a fresh paragraph independently using the same success criteria.',
        ],
        classroomMove: 'Use a paragraph surgery task: reorder and revise a weak paragraph, then explain the reason for each change.',
        reassessment: 'Use a short fresh prompt requiring one independently organised response for a defined audience and purpose.',
        examinerLens: 'Look for clear organisation, controlled language choices, relevant development and communication suited to the task.',
      },
    },
    {
      match: /eng\.use-of-english|grammar|sentence|verb|agreement|punct/,
      play: {
        misconception: 'Students may identify a grammar rule when prompted but apply it inconsistently inside complete sentences.',
        teachSequence: [
          'State the pattern using one minimal pair.',
          'Notice the cue that determines the correct form.',
          'Repair common incorrect examples and explain the change.',
          'Apply the pattern in original sentences without a prompt.',
        ],
        classroomMove: 'Use sentence contrast: students choose between two near-identical forms and justify the grammatical cue.',
        reassessment: 'Use fresh sentence completion plus one short original-sentence task.',
        examinerLens: 'Look for control of the target form in context, not just the ability to name the grammar rule.',
      },
    },
  ],
  mathematics: [
    {
      match: /math\.algebra|equation|expression|function/,
      play: {
        misconception: 'Students may manipulate symbols mechanically without preserving equivalence or understanding what the symbols represent.',
        teachSequence: [
          'Represent the algebraic relationship before manipulating it.',
          'Model one valid transformation and state why equivalence is preserved.',
          'Analyse a common sign, inverse-operation or substitution error.',
          'Solve a fresh problem and check the solution in the original relationship.',
        ],
        classroomMove: 'Use “always, sometimes, never” algebra statements and require a counterexample or justification.',
        reassessment: 'Use one procedural algebra item and one contextual or unfamiliar algebra problem.',
        examinerLens: 'Look for valid transformations, mathematically coherent working and evidence that the final result has been checked.',
      },
    },
    {
      match: /math\.number|fraction|percentage|ratio|proportion/,
      play: {
        misconception: 'Students may choose an operation from surface clues instead of reasoning about the quantity, unit or multiplicative relationship.',
        teachSequence: [
          'Represent the quantities and units clearly.',
          'Estimate the size of a sensible answer.',
          'Select the operation from the relationship rather than a keyword.',
          'Calculate and compare the answer with the estimate.',
        ],
        classroomMove: 'Use estimate-before-calculate: students must give a sensible range before touching a calculator or formal algorithm.',
        reassessment: 'Use a fresh numerical problem with changed values and a requirement to justify the chosen operation.',
        examinerLens: 'Look for correct interpretation, suitable method, unit awareness and a final answer that is reasonable.',
      },
    },
    {
      match: /math\.mathematical-practice|reason|model|problem|represent/,
      play: {
        misconception: 'Students may reach an answer on familiar exercises but struggle to select a strategy or justify it when the problem is unfamiliar.',
        teachSequence: [
          'Restate the problem in a useful representation.',
          'Identify knowns, unknowns and constraints.',
          'Compare two possible strategies before choosing one.',
          'Solve, justify and test whether the result fits the original problem.',
        ],
        classroomMove: 'Use a strategy compare: two methods are shown and students decide which is more efficient or robust and explain why.',
        reassessment: 'Use a non-routine problem that can be solved in more than one way and require a short justification.',
        examinerLens: 'Look for strategic choice, connected reasoning, representation and a conclusion that addresses the original problem.',
      },
    },
  ],
  science: [
    {
      match: /science\.scientific-practice|variable|investigation|data|graph|measurement/,
      play: {
        misconception: 'Students may follow a practical method but not understand variables, evidence quality or how data supports a conclusion.',
        teachSequence: [
          'State the scientific question and identify the variables.',
          'Explain what makes the evidence fair, valid and repeatable.',
          'Interpret the pattern in the data before explaining it.',
          'Evaluate one limitation and improve the method or conclusion.',
        ],
        classroomMove: 'Use a practical-method audit: students circle one control, one measurement weakness and one improvement in a short method.',
        reassessment: 'Use a new investigation/data set requiring variable identification, interpretation and one evidence-based improvement.',
        examinerLens: 'Look for correct variable logic, appropriate evidence use, justified conclusions and realistic evaluation of the method.',
      },
    },
    {
      match: /science\.(biology|chemistry|physics|earth-space)/,
      play: {
        misconception: 'Students may recall a scientific term but not explain the mechanism or relationship that makes the phenomenon happen.',
        teachSequence: [
          'Define the key entity, quantity or process precisely.',
          'Build the mechanism using a diagram, particle model, system model or causal chain.',
          'Test the model against one prediction or observation.',
          'Apply it to an unfamiliar scientific context.',
        ],
        classroomMove: 'Use “what changes, what stays, why?” to force students beyond naming the phenomenon into mechanism.',
        reassessment: 'Use one fresh context requiring explanation, prediction or calculation from the same scientific idea.',
        examinerLens: 'Look for correct scientific relationships and a mechanism that explains the observation rather than restating it.',
      },
    },
  ],
  geography: [
    {
      match: /geo\.(skills|enquiry)|map|graph|fieldwork|data/,
      play: {
        misconception: 'Students may read one feature from a map or data set but struggle to combine evidence or judge its reliability.',
        teachSequence: [
          'Identify what the source can and cannot show.',
          'Extract the most relevant spatial or numerical evidence.',
          'Describe the pattern accurately before explaining it.',
          'Evaluate the evidence or method using the geographical question.',
        ],
        classroomMove: 'Use source triangulation: students combine a map with one graph/photo and state what becomes more convincing when both are used.',
        reassessment: 'Use a new map/data set requiring description, explanation and one evidence-quality judgement.',
        examinerLens: 'Look for accurate source use, geographical terminology and conclusions tied to the actual spatial/data evidence.',
      },
    },
    {
      match: /geo\.(physical|human|environment)/,
      play: {
        misconception: 'Students may list causes or effects without explaining the geographical process connecting them.',
        teachSequence: [
          'Locate the process in a real or named place context.',
          'Build the causal sequence step by step.',
          'Separate immediate and longer-term effects where relevant.',
          'Apply the process to a fresh place or management decision.',
        ],
        classroomMove: 'Use a process-chain map: students link cause → process → place-specific consequence and identify the weakest link.',
        reassessment: 'Use a different named place or data source requiring the same geographical process to be explained.',
        examinerLens: 'Look for linked geographical explanation, relevant place evidence and a conclusion that matches the question scale.',
      },
    },
  ],
  'global-perspectives': [
    {
      match: /gp\.research|source|evidence/,
      play: {
        misconception: 'Students may collect information without judging whether it is relevant, credible or sufficient for the research question.',
        teachSequence: [
          'Tighten the research question.',
          'Identify what evidence would actually answer it.',
          'Evaluate provenance, expertise, currency and possible bias.',
          'Select complementary evidence rather than repeating the same perspective.',
        ],
        classroomMove: 'Use a source triage: students keep, qualify or reject sources and justify each decision with one criterion.',
        reassessment: 'Use a new research question and source set requiring selection and justification of the strongest evidence.',
        examinerLens: 'Look for purposeful research choices and explicit evaluation of source usefulness and credibility.',
      },
    },
    {
      match: /gp\.evaluation|argument|perspective|credib/,
      play: {
        misconception: 'Students may disagree with a viewpoint instead of evaluating the quality of its reasoning and evidence.',
        teachSequence: [
          'Separate the claim from the evidence supporting it.',
          'Identify assumptions and missing evidence.',
          'Compare the reasoning with a credible alternative perspective.',
          'Reach a judgement based on criteria rather than preference.',
        ],
        classroomMove: 'Use argument X-ray: label claim, evidence, assumption and weakness in a short argument before judging its strength.',
        reassessment: 'Use a new argument requiring one supported strength, one supported limitation and a justified overall judgement.',
        examinerLens: 'Look for evaluation of reasoning and evidence, not agreement or disagreement with the position.',
      },
    },
  ],
  'digital-technology': [
    {
      match: /digital\.programming|code|debug|algorithm/,
      play: {
        misconception: 'Students may edit code by trial and error without tracing state, control flow or the reason the bug occurs.',
        teachSequence: [
          'State the intended input, process and output.',
          'Trace the algorithm with a small example.',
          'Locate the exact step where actual behaviour diverges.',
          'Fix the logic and test normal plus edge cases.',
        ],
        classroomMove: 'Use a trace table or dry run before allowing any code changes.',
        reassessment: 'Use a new short program or pseudocode task requiring prediction, debugging and explanation.',
        examinerLens: 'Look for logical tracing, appropriate constructs, test evidence and an explanation of why the correction works.',
      },
    },
    {
      match: /digital\.computational-thinking|decomposition|pattern|abstraction/,
      play: {
        misconception: 'Students may jump to implementation before breaking the problem into manageable, testable parts.',
        teachSequence: [
          'Define the problem and success criteria.',
          'Decompose it into smaller responsibilities.',
          'Identify repeated patterns and irrelevant detail.',
          'Design an algorithm or representation before implementation.',
        ],
        classroomMove: 'Use a “no coding yet” design sprint where students must submit decomposition and pseudocode before building.',
        reassessment: 'Use a new problem requiring decomposition, abstraction and an ordered solution plan.',
        examinerLens: 'Look for a solution structure that is logical, generalisable and connected to the stated problem.',
      },
    },
  ],
  'modern-languages': [
    {
      match: /mfl\.(grammar|vocabulary)/,
      play: {
        misconception: 'Students may recognise the correct form or word but cannot retrieve it quickly enough or combine it accurately in a sentence.',
        teachSequence: [
          'Retrieve the target form or vocabulary without notes.',
          'Contrast it with the most common competing form.',
          'Use it in a meaningful sentence with one controlled change.',
          'Recycle it later in a different topic or communication task.',
        ],
        classroomMove: 'Use fast retrieval followed by sentence transformation so recall immediately becomes communication.',
        reassessment: 'Use a new topic where students must retrieve and use the language without a model.',
        examinerLens: 'Look for meaning first, then range and control of the targeted vocabulary or grammatical structure.',
      },
    },
    {
      match: /mfl\.(listening|reading|speaking|writing)/,
      play: {
        misconception: 'Students may understand or produce isolated words but lose meaning when language is extended, paraphrased or less predictable.',
        teachSequence: [
          'Secure key gist or communicative intent first.',
          'Identify the details or language chunks carrying meaning.',
          'Practise paraphrase, repair or expansion.',
          'Move to a fresh authentic-style communication task.',
        ],
        classroomMove: 'Use information-gap work: students must communicate enough meaning to complete a task rather than simply repeat a model.',
        reassessment: 'Use a new receptive or productive task with unfamiliar details but the same communicative demand.',
        examinerLens: 'Look for successful communication, comprehension of meaning, and increasing control rather than perfect isolated recall.',
      },
    },
  ],
  'travel-tourism': [
    {
      match: /travel\.customer-service|customer|service/,
      play: {
        misconception: 'Students may list customer-service principles without adapting the response to the customer type, problem or service standard.',
        teachSequence: [
          'Identify the customer need and service failure or opportunity.',
          'Select the relevant service principle.',
          'Apply it to a realistic staff response.',
          'Judge the likely impact on satisfaction, reputation and repeat business.',
        ],
        classroomMove: 'Use a role-play escalation: students respond to the same issue for different customer profiles and explain what changes.',
        reassessment: 'Use a fresh customer scenario requiring an appropriate response and explanation of its business impact.',
        examinerLens: 'Look for realistic industry application and a clear link between the action and the customer/business outcome.',
      },
    },
    {
      match: /travel\.(research-analysis|impacts-sustainability)|sustain|data/,
      play: {
        misconception: 'Students may describe tourism impacts or data without weighing stakeholders, evidence or longer-term trade-offs.',
        teachSequence: [
          'Identify the destination/business decision and affected stakeholders.',
          'Use the strongest available evidence or data.',
          'Compare economic, social and environmental consequences.',
          'Make a justified recommendation with one condition or trade-off.',
        ],
        classroomMove: 'Use a destination decision board: groups must choose a policy and defend it from at least two stakeholder perspectives.',
        reassessment: 'Use a new destination or business case requiring evidence-based analysis and a justified recommendation.',
        examinerLens: 'Look for balanced industry analysis, stakeholder awareness, evidence use and a recommendation grounded in the case.',
      },
    },
  ],
};

const playFor = (
  subjectKey: CurriculumSubjectExperienceKey,
  leaf: GameService.TeacherAcademicSkillRegistryLeaf,
): TeachingPlay => {
  const searchable = [leaf.strandCode, leaf.skillCode, leaf.subskillCode].join(' ');
  const playbook = subjectKey === 'economics'
    ? economicsPlaybook
    : (subjectPlaybooks[subjectKey] || []);
  return playbook.find(({ match }) => match.test(searchable))?.play
    || subjectGenericPlays[subjectKey]
    || genericPlay;
};

export const curriculumDimension = (
  leaf: GameService.TeacherAcademicSkillRegistryLeaf,
  subjectKey: CurriculumSubjectExperienceKey = 'generic',
): CurriculumTeachingDimension => curriculumDimensionForSubject(leaf, subjectKey);

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
  subjectKey: CurriculumSubjectExperienceKey = 'generic',
): CurriculumReteachRecommendation[] => {
  const leaves = new Map(registrySkills.map((leaf) => [leaf.subskillCode, leaf]));
  const ranked = hotspots
    .filter((hotspot) => hotspot.impactedStudents > 0)
    .map((hotspot) => {
      const leaf = leaves.get(hotspot.subskillCode);
      if (!leaf) return null;
      const play = playFor(subjectKey, leaf);
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
    dimension: curriculumDimension(leaf, subjectKey),
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
