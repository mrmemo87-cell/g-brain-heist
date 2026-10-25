# English curriculum editorial audit

Status: **review proposal; unpublished; no school adoption**.

The merged question catalogue is live on production commit `d097bca686e05b34ae26312989f9e7d472c1f9bb`. Both original migrations are applied, the catalogue has 2,608 entries and its minute worker succeeds. No further frontend deployment was needed.

## Audit result

| Measure | Result |
| --- | ---: |
| Raw grade-specific objective candidates | 604 |
| Distinct source diagnostic focuses | 369 |
| Consolidated outcomes across grades | 232 |
| Grade 7 objective proposals | 200 |
| Grade 8 objective proposals | 199 |
| Distinct source questions | 1,366 |
| Questions held from proposed mappings | 129 |
| Questions with multiple active focuses | 32 |
| Proposed question-to-grade/objective mappings | 1,832 |

All 1,400 source question/focus rows use multiple-choice questions. The revised statements therefore describe recognition, selection, interpretation or inference. They do not claim independent productive writing or speaking. This partial bank-backed recognition map is not a complete English course or an official external syllabus.

## Corrections and holds

- Merge repeated descriptions of the same outcome while retaining exact diagnostic-focus IDs; for example do/does question selection, third-conditional result clauses and passive forms.
- Remove example-specific wording such as a single adjective or verb where the outcome is the general pattern.
- Hold broad Core demonstration focuses until individual questions can support specific outcomes.
- Hold mixed connective-function mappings and all questions with multiple active diagnostic focuses; a primary mapping must not be picked arbitrarily.
- Hold imported reading questions that refer to source passages not present in their stored text or image.
- Hold two source-taxonomy conflicts: a polite-request transformation labelled under statements, and a did not need to focus whose wording suggests non-occurrence although the item key correctly says occurrence is unknown.

These holds apply to this proposed curriculum mapping package. Existing questions, diagnostic taxonomy, scores, historical assignments and evidence have not been silently changed or withdrawn.

Structural checks found each stored answer among the options and no duplicate option strings in the 1,400 source rows. This is not a claim that all answer keys have received fresh semantic validation. Targeted semantic checks identified the examples below.

| Stored example | Audit finding |
| --- | --- |
| What did Jenner do to test his idea about immunity? | No passage or image is stored with the question; cannot establish text retrieval from the item alone. |
| What does it mean if someone is tetrachromatic? | No passage or image is stored; may test subject knowledge rather than reading. |
| Please sit down, the host said. | Item tests a reported polite request, rather than a reported statement. |
| You did not need to pay. | Key correctly says payment was unnecessary and occurrence is unknown; diagnostic-focus label needs review. |

## Exact review package

The package records every proposed objective, source focus, question ID, exact content hash and eligible grade. Every source focus is either allocated to one consolidated outcome or explicitly held. A question with more than one active focus is withheld in full, including otherwise eligible mappings. Proposed links are not approvals.

A bounded curriculum outcome may have several diagnostic focuses. The new private relation holds an explicit allowlist; it does not merge canonical registry identities. Publication rejects pending/rejected links. Mapping approval accepts only a reviewed exact focus at the reviewed question hash. Approved links and published content cannot be rewritten.

The new `2026-editorial-2` draft has 399 objectives and 574 **proposed** focus links. The previous raw draft remains available for comparison. No school offering references either draft. The 1,832 question mappings are proposals in this repository, not approved database mappings.

Before publication: review wording, overlaps, exclusions, source-taxonomy conflicts and suitability for each school course; record genuine reviewer identities through governed approval. Then preview adoption separately for English and ESL, with explicit confirmation of what the partial recognition map covers. Do not rewrite historical evidence.

## Held focus list

| Source label | Reason |
| --- | --- |
| Core demonstration: Relative clauses | broad core focus requires item review |
| Core demonstration: Present and future unreal conditions | broad core focus requires item review |
| Select a connective that makes the relationship between clauses explicit | mixed connective functions require item review |
| Explain a stated cause, method, or consequence in an informational text | source passage not in stored question |
| Interpret an explanation or term from an informational text about colour vision | source passage not in stored question |
| Locate and retrieve an explicitly stated factual detail from an informational text | source passage not in stored question |
| Retrieve an explicitly stated fact from an informational text about colour vision | source passage not in stored question |
| Retrieve an explicitly stated fact from an informational text about disease | source passage not in stored question |
| Retrieve an explicitly stated numerical fact from an informational text | source passage not in stored question |
| Select evidence that establishes narrator distrust | source passage not in stored question |
| Core demonstration: Collocation | broad core focus requires item review |
| Core demonstration: Lexical relationships | broad core focus requires item review |
| Understands didn’t need to means an action was unnecessary and normally implies it was not done | source taxonomy label conflicts with item |
| Core demonstration: Prepositions of time, place and movement | broad core focus requires item review |
| Core demonstration: Question formation | broad core focus requires item review |
| Transform direct speech into grammatically accurate reported speech | source taxonomy label conflicts with item |
| Core demonstration: Choose precise vocabulary | broad core focus requires item review |

## Grade 7: objective proposals

| Code | Proposed outcome | Exact source focuses |
| --- | --- | ---: |
| g7-adjective-position | Select natural adjective positions and adjective order in noun phrases. | 3 |
| g7-adjective-role | Select an adjective that fits the meaning and grammatical role of a sentence. | 1 |
| g7-comparison-structure | Select the comparison structure required by the sentence context. | 2 |
| g7-comparison-spelling | Select the correct spelling of comparative and superlative adjectives. | 2 |
| g7-short-adjective-comparisons | Select -er and the plus -est forms of short adjectives. | 2 |
| g7-long-adjective-comparisons | Select more and most comparison forms for longer adjectives. | 2 |
| g7-adverb-comparisons | Select comparative and superlative adverb forms in context. | 1 |
| g7-adjective-comparisons | Select the comparative or superlative adjective form required by context. | 1 |
| g7-irregular-comparisons | Select irregular comparative and superlative forms in context. | 1 |
| g7-compound-adjective-form | Identify correctly formed compound adjectives in context. | 1 |
| g7-compound-hyphenation | Select appropriate hyphenation for compound adjectives before nouns. | 1 |
| g7-participle-feeling-source | Select an -ing adjective to describe the cause of a feeling. | 2 |
| g7-participle-feeling-experiencer | Select an -ed adjective to describe the experiencer of a feeling or resulting state. | 2 |
| g7-clear-pronoun-reference | Identify a revision that makes a pronoun's reference clear. | 1 |
| g7-object-pronouns | Select object pronouns appropriate to their sentence roles. | 1 |
| g7-subject-pronouns | Select subject pronouns appropriate to their sentence roles. | 1 |
| g7-relative-that | Select that to introduce a defining relative clause. | 1 |
| g7-relative-time | Select when to introduce a relative clause referring to time. | 1 |
| g7-relative-place | Select where to introduce a relative clause referring to place. | 1 |
| g7-relative-things | Select which to refer to a thing in a relative clause. | 1 |
| g7-relative-person-subject | Select who for a person functioning as the subject of a relative clause. | 2 |
| g7-relative-person-object | Select whom for a person functioning as the object of a relative clause. | 1 |
| g7-relative-possession | Select whose to express possession in a relative clause. | 1 |
| g7-agreement-error | Identify an error in agreement between a plural subject and its verb. | 1 |
| g7-agreement-head-of-phrase | Select a verb that agrees with the head noun before an of-phrase. | 2 |
| g7-agreement-third-person | Select the third-person singular present-simple verb form. | 2 |
| g7-agreement-singular-subject-name | Select singular verb agreement with a singular subject name such as mathematics. | 1 |
| g7-agreement-indefinite-pronouns | Select singular verb agreement with each and everyone. | 2 |
| g7-agreement-there | Select is or are in existential there constructions according to noun number. | 2 |
| g7-agreement-unit-amount | Select singular verb agreement when an amount is treated as one unit. | 1 |
| g7-agreement-plural-present | Select the base present-simple verb form with a plural subject. | 1 |
| g7-evidence-support | Identify how a cited detail supports a central idea. | 1 |
| g7-evidence-conclusion | Select a conclusion that synthesises evidence and a recommendation. | 1 |
| g7-quantitative-evidence | Select numerical evidence relevant to a stated claim. | 1 |
| g7-absolute-claim-reliability | Identify the need for credible supporting evidence when evaluating an absolute claim. | 1 |
| g7-time-after | Select after to express the order of two events. | 2 |
| g7-time-before | Select before to express the order of two events. | 2 |
| g7-time-when | Select when to connect an event to its time or triggering event. | 1 |
| g7-time-while | Select while to connect simultaneous or ongoing events. | 2 |
| g7-third-conditional-structure | Identify the correct third-conditional structure for an unreal past situation. | 2 |
| g7-third-conditional-negative | Select would not have plus a past participle for a negative third-conditional result. | 1 |
| g7-third-conditional-if | Select past perfect in a third-conditional if-clause. | 3 |
| g7-third-conditional-result | Select would have plus a past participle in a third-conditional result clause. | 3 |
| g7-conditional-likely-unreal | Distinguish likely future conditions from imaginary or unlikely conditions in context. | 1 |
| g7-second-conditional-negative | Select negative conditions and results in second-conditional sentences. | 1 |
| g7-second-conditional-if | Select past simple in a second-conditional if-clause. | 1 |
| g7-second-conditional-result | Select would plus a base verb in a second-conditional result clause. | 1 |
| g7-second-conditional-meaning | Interpret imaginary or unlikely situations expressed by the second conditional. | 1 |
| g7-hypothetical-were | Select hypothetical were and If I were you for formal hypothetical advice. | 1 |
| g7-connective-addition | Select connectives that add supporting information. | 3 |
| g7-connective-sequence | Select first, then, finally and other connectives that order steps or ideas. | 2 |
| g7-connective-alternative | Select a connective that signals an alternative or conditional outcome. | 1 |
| g7-connective-similarity | Select a connective that signals comparison or similarity. | 1 |
| g7-connective-cause-result | Select connectives that express cause, result or consequence. | 4 |
| g7-connective-contrast | Select connectives that contrast ideas. | 4 |
| g7-connective-example | Select a connective that introduces an example. | 1 |
| g7-retrieve-stated-detail | Locate an explicitly stated factual or numerical detail in a text. | 1 |
| g7-consistent-tense | Identify a revision that maintains consistent verb tense. | 1 |
| g7-infer-feelings | Infer a character's feelings from described behaviour. | 1 |
| g7-feeling-evidence | Select textual evidence that supports an inferred feeling. | 1 |
| g7-infer-uncertainty | Infer uncertainty from a described sequence of actions. | 1 |
| g7-adverbial-participial-link | Select a linker or participial form appropriate to an adverbial clause. | 1 |
| g7-passive-infinitive | Select to be plus a past participle in passive-infinitive constructions. | 5 |
| g7-passive-necessity | Select have to be plus a past participle to express passive necessity. | 1 |
| g7-figurative-effect | Identify the image or emotional effect of figurative description. | 2 |
| g7-personification-identification | Identify personification in a clause. | 1 |
| g7-symbolic-theme | Infer a theme from recurring symbolic contrasts. | 1 |
| g7-can-ability | Select can or cannot to express ability. | 1 |
| g7-cant-have-deduction | Interpret cannot have plus a past participle as a deduction that a past event was impossible. | 1 |
| g7-could-have-unrealised | Interpret could have plus a past participle as an unrealised past possibility. | 1 |
| g7-must-have-deduction | Select must have plus a past participle for a strong deduction about the past. | 1 |
| g7-should-have-regret | Interpret should have and should not have plus a past participle as criticism or regret. | 1 |
| g7-obligation-prohibition-meaning | Distinguish obligation, prohibition and lack of necessity in context. | 1 |
| g7-external-obligation | Select have to or has to for an external requirement or obligation. | 2 |
| g7-strong-obligation | Select must to express a strong obligation or firm rule. | 2 |
| g7-optional-action | Interpret do not have to and does not have to as absence of necessity. | 1 |
| g7-prohibited-action | Select must not to express prohibition. | 1 |
| g7-uncertain-past-possibility | Select may have or might have plus a past participle for an uncertain past possibility. | 3 |
| g7-uncertain-negative-past | Select might not have plus a past participle for an uncertain negative past possibility. | 1 |
| g7-visual-inference | Infer an event from visible clues in a supplied image. | 1 |
| g7-zero-article-general | Select zero article for general references and uncountable nouns where appropriate. | 2 |
| g7-a-an-sound | Select a or an according to initial sound. | 2 |
| g7-article-basic-reference | Select a, an or the according to sound and reference in context. | 2 |
| g7-article-first-subsequent | Select an indefinite article for a first non-specific reference and the for a subsequent specific reference. | 2 |
| g7-article-unique-specific | Select the definite article for a unique or contextually specific reference. | 2 |
| g7-article-language-meals | Select zero article with language names and routine meal names where appropriate. | 2 |
| g7-regular-plural | Select regular plural noun forms with -s or -es. | 2 |
| g7-uncountable-homework | Select a quantifier appropriate to an uncountable noun such as homework. | 1 |
| g7-irregular-plural | Select common irregular plural noun forms. | 1 |
| g7-attributive-noun | Identify a noun used before another noun to classify or describe it. | 1 |
| g7-possessive-adjective | Select possessive adjectives appropriate to the reference. | 1 |
| g7-possessive-apostrophe | Select apostrophe-s to express possession by one owner. | 1 |
| g7-comparative-quantifiers | Select comparative or superlative quantifiers according to countability and meaning. | 1 |
| g7-much-many | Select much or many according to noun countability. | 1 |
| g7-some-any | Select some or any in basic sentence contexts. | 1 |
| g7-transition-consequence | Select a transition that signals consequence. | 1 |
| g7-prepositions-place | Select basic prepositions of place in context. | 1 |
| g7-prepositions-time | Select in, on or at for basic time expressions. | 1 |
| g7-dependent-preposition-sets | Select the preposition required by a verb-dependent pattern in context. | 13 |
| g7-compare-with | Select compare with when comparing one thing with another. | 1 |
| g7-die-of | Select die of to identify a disease or internal cause of death. | 1 |
| g7-depend-on | Select on in the verb-dependent pattern depend on. | 1 |
| g7-specialise-in | Select in in the verb-dependent pattern specialise in. | 1 |
| g7-multilingual-audience-choice | Select an adaptation of information suitable for a multilingual audience. | 1 |
| g7-formal-report-opening | Select an appropriately formal opening for a report. | 1 |
| g7-campaign-audience | Identify the intended audience of a campaign. | 1 |
| g7-emphatic-base-form | Identify that emphatic do, does or did requires the base form of the main verb. | 2 |
| g7-emphatic-present | Select do or does plus a base verb for affirmative present emphasis. | 3 |
| g7-be-negation | Select present-simple negative forms of be. | 1 |
| g7-do-negation | Select do not or does not plus a base verb in present-simple negatives. | 2 |
| g7-wh-questions-do | Select word order and do or does in basic wh-questions. | 1 |
| g7-yes-no-do-does | Select do or does in present-simple yes/no questions. | 2 |
| g7-yes-no-be | Select am, is or are in yes/no questions with be. | 1 |
| g7-reported-time | Select reported time expressions appropriate to a later reporting context. | 2 |
| g7-reported-present-past | Select past-tense forms when backshifting present-tense statements. | 1 |
| g7-reported-continuous | Select was or were plus -ing when backshifting present-continuous speech. | 1 |
| g7-reported-can | Select could or could not when backshifting can or cannot. | 1 |
| g7-reported-perfect-continuous | Select had been plus -ing when backshifting present-perfect-continuous speech. | 1 |
| g7-reported-will | Select would when backshifting will in reported speech. | 1 |
| g7-reported-pronouns | Select pronoun changes appropriate to the speaker and reporting context. | 1 |
| g7-reported-past-perfect | Select past perfect when the reporting context requires backshift. | 1 |
| g7-reported-question-order | Select statement word order in a reported wh-question. | 2 |
| g7-reported-yes-no-question | Select if or whether and statement word order in reported yes/no questions. | 1 |
| g7-reported-command | Select told plus an object plus to-infinitive to report a command. | 1 |
| g7-say-tell | Distinguish say from tell plus an object in reported statements. | 1 |
| g7-reported-negative-command | Select told plus an object plus not to-infinitive to report a negative command. | 1 |
| g7-compound-sentence | Identify a compound sentence containing two coordinated independent clauses. | 1 |
| g7-present-aspect-contrast | Distinguish present-simple and present-continuous meanings in context. | 1 |
| g7-past-continuous-negative | Select was not or were not plus -ing in past-continuous negatives. | 1 |
| g7-past-continuous-question | Select was or were before the subject in past-continuous questions. | 1 |
| g7-past-continuous-form | Select was or were plus -ing in past-continuous constructions. | 2 |
| g7-present-continuous-form | Select am, is or are plus -ing in present-continuous constructions. | 1 |
| g7-past-continuous-time | Select past continuous for an action in progress at a stated past time. | 2 |
| g7-past-background-interruption | Distinguish an ongoing past background action from a shorter completed event. | 4 |
| g7-future-continuous-error | Identify an error in the will be plus -ing future-continuous structure. | 1 |
| g7-going-to-question | Select be going to word order in a question about a plan. | 1 |
| g7-future-continuous-question | Select will plus subject plus be plus -ing in a future-continuous question. | 1 |
| g7-will-negative | Select will not plus a base verb in a future negative statement. | 1 |
| g7-future-continuous-form-meaning | Select will be plus -ing for an action in progress at a stated future time. | 4 |
| g7-future-continuous-negative | Select will not be plus -ing in future-continuous negatives. | 1 |
| g7-going-to-intention | Select be going to for a plan or intention decided before speaking. | 2 |
| g7-going-to-evidence | Select be going to for a prediction supported by present evidence. | 1 |
| g7-present-continuous-arrangement | Select present continuous for a fixed future arrangement. | 2 |
| g7-present-simple-timetable | Select present simple for an official timetable or scheduled event. | 3 |
| g7-will-prediction | Select will plus a base verb for a general future prediction. | 1 |
| g7-base-after-did | Select the base form of a verb after did. | 1 |
| g7-was-were | Select was or were according to the subject and past-time context. | 1 |
| g7-past-simple-present-perfect | Distinguish past-simple and present-perfect meanings in context. | 1 |
| g7-perfect-continuous-duration-question | Select present-perfect-continuous How long questions for an activity continuing to the present. | 1 |
| g7-past-perfect-question | Select had plus subject plus a past participle in a past-perfect question. | 1 |
| g7-present-perfect-question | Select have or has plus subject plus a past participle in a present-perfect question. | 2 |
| g7-perfect-continuous-question | Select have or has plus subject plus been plus -ing in a present-perfect-continuous question. | 1 |
| g7-perfect-continuous-negative | Select have not or has not been plus -ing in present-perfect-continuous negatives. | 1 |
| g7-past-perfect-form | Select had plus a past participle in past-perfect constructions. | 1 |
| g7-present-perfect-form | Select have or has plus a past participle in present-perfect constructions. | 1 |
| g7-perfect-continuous-meaning | Select present perfect continuous for an ongoing or repeated activity relevant to the present. | 2 |
| g7-regular-past-final-c | Select final -ck- before -ed in regular past forms of verbs ending in c. | 1 |
| g7-regular-past-y | Select -ied for regular past forms ending in consonant plus y. | 2 |
| g7-regular-past-doubling | Select final consonant doubling before -ed where stress and spelling require it. | 2 |
| g7-regular-participle-final-e | Select -d for a regular past participle of a verb ending in e. | 1 |
| g7-regular-past-form | Select regular past-simple forms with the appropriate -ed ending. | 2 |
| g7-irregular-past-form | Select common irregular past-simple verb forms. | 3 |
| g7-irregular-participle | Select irregular past-participle forms. | 1 |
| g7-epidemic-pandemic-context | Distinguish epidemic and pandemic by geographical extent in the supplied context. | 1 |
| g7-force-connotation | Select a verb according to the strength of its connotation. | 1 |
| g7-passive-participle | Select the past participle required in a passive construction. | 1 |
| g7-past-passive-singular | Select was plus a past participle for a singular past-passive construction. | 1 |
| g7-causative-past | Select had plus an object plus a past participle for an arranged past service. | 2 |
| g7-causative-present | Select have or has plus an object plus a past participle for an arranged service. | 2 |
| g7-causative-future | Select will have plus an object plus a past participle for a future arranged service. | 1 |
| g7-past-perfect-passive-active | Identify an equivalent past-perfect active sentence for a passive sentence. | 1 |
| g7-present-simple-active-passive | Identify an equivalent present-simple passive sentence for an active sentence. | 1 |
| g7-future-passive-negative | Select will not be plus a past participle in future-passive negatives. | 1 |
| g7-past-perfect-passive-question | Select had plus subject plus been plus a past participle in a past-perfect-passive question. | 1 |
| g7-present-perfect-passive-question | Select have or has plus subject plus been plus a past participle in a present-perfect-passive question. | 1 |
| g7-present-simple-passive-question | Select is or are plus subject plus a past participle in a present-simple-passive question. | 1 |
| g7-future-passive | Select will be plus a past participle in future-passive constructions. | 1 |
| g7-past-perfect-passive | Select had been plus a past participle in past-perfect-passive constructions. | 2 |
| g7-past-passive-plural | Select were plus a past participle for a plural past-passive construction. | 1 |
| g7-past-passive-form | Select was or were plus a past participle in past-passive constructions. | 1 |
| g7-present-perfect-passive | Select have or has been plus a past participle in present-perfect-passive constructions. | 3 |
| g7-present-simple-passive | Select am, is or are plus a past participle in present-simple-passive constructions. | 2 |
| g7-passive-basic-structure | Identify be plus a past participle as the basic passive structure. | 2 |
| g7-simple-passive-context | Select a present- or past-simple passive construction appropriate to context. | 1 |
| g7-past-simple-active-passive | Identify an equivalent past-simple passive sentence for an active sentence. | 2 |
| g7-active-passive-context | Identify a passive transformation that preserves the source sentence's tense and meaning. | 1 |
| g7-future-active-passive | Identify an equivalent will be plus past participle construction for a future active sentence. | 1 |
| g7-word-class-noun | Identify a noun by its function in a sentence. | 4 |
| g7-word-class-adjective | Identify an adjective by its function in a sentence. | 2 |
| g7-word-class-adverb | Identify an adverb by its function in a sentence. | 2 |
| g7-word-class-conjunction | Identify a conjunction by its function in a sentence. | 1 |
| g7-word-class-interjection | Identify an interjection by its function in a sentence. | 1 |
| g7-word-class-preposition | Identify a preposition by its function in a sentence. | 1 |
| g7-word-class-pronoun | Identify a pronoun by its function in a sentence. | 1 |
| g7-word-class-verb | Identify a verb by its function in a sentence. | 1 |
| g7-word-class-context | Identify the word class of a word from its sentence context. | 1 |
| g7-question-mark | Select a question mark to end a direct question. | 1 |
| g7-semicolon-clauses | Select a semicolon to join independent clauses. | 1 |
| g7-list-commas | Select commas to separate items in a list. | 1 |
| g7-nonessential-relative-punctuation | Select punctuation that marks a non-essential relative clause. | 1 |

## Grade 8: objective proposals

| Code | Proposed outcome | Exact source focuses |
| --- | --- | ---: |
| g8-adjective-position | Select natural adjective positions and adjective order in noun phrases. | 2 |
| g8-adjective-role | Select an adjective that fits the meaning and grammatical role of a sentence. | 1 |
| g8-comparison-structure | Select the comparison structure required by the sentence context. | 2 |
| g8-comparison-spelling | Select the correct spelling of comparative and superlative adjectives. | 2 |
| g8-short-adjective-comparisons | Select -er and the plus -est forms of short adjectives. | 1 |
| g8-adverb-comparisons | Select comparative and superlative adverb forms in context. | 1 |
| g8-adjective-comparisons | Select the comparative or superlative adjective form required by context. | 1 |
| g8-irregular-comparisons | Select irregular comparative and superlative forms in context. | 1 |
| g8-compound-adjective-form | Identify correctly formed compound adjectives in context. | 3 |
| g8-number-compounds | Select a number-based compound adjective with a singular noun component. | 1 |
| g8-compound-hyphenation | Select appropriate hyphenation for compound adjectives before nouns. | 3 |
| g8-ly-modifier-hyphenation | Identify that an -ly adverb and participle normally remain unhyphenated. | 1 |
| g8-participle-feeling-source | Select an -ing adjective to describe the cause of a feeling. | 2 |
| g8-participle-form-context | Select a participial adjective that fits its grammatical context. | 1 |
| g8-participle-feeling-experiencer | Select an -ed adjective to describe the experiencer of a feeling or resulting state. | 1 |
| g8-object-pronouns | Select object pronouns appropriate to their sentence roles. | 1 |
| g8-subject-pronouns | Select subject pronouns appropriate to their sentence roles. | 1 |
| g8-relative-pronoun-functions | Select relative pronouns according to possession and clause function. | 1 |
| g8-relative-time | Select when to introduce a relative clause referring to time. | 1 |
| g8-relative-place | Select where to introduce a relative clause referring to place. | 1 |
| g8-relative-things | Select which to refer to a thing in a relative clause. | 1 |
| g8-relative-person-subject | Select who for a person functioning as the subject of a relative clause. | 2 |
| g8-relative-person-object | Select whom for a person functioning as the object of a relative clause. | 1 |
| g8-relative-possession | Select whose to express possession in a relative clause. | 1 |
| g8-agreement-error | Identify an error in agreement between a plural subject and its verb. | 1 |
| g8-agreement-head-of-phrase | Select a verb that agrees with the head noun before an of-phrase. | 2 |
| g8-agreement-either-or | Select verb agreement with the nearer subject in an either-or construction. | 1 |
| g8-agreement-relative-antecedent | Select a relative-clause verb that agrees with its antecedent. | 1 |
| g8-agreement-third-person | Select the third-person singular present-simple verb form. | 1 |
| g8-agreement-singular-subject-name | Select singular verb agreement with a singular subject name such as mathematics. | 1 |
| g8-agreement-indefinite-pronouns | Select singular verb agreement with each and everyone. | 2 |
| g8-agreement-unit-amount | Select singular verb agreement when an amount is treated as one unit. | 1 |
| g8-agreement-plural-present | Select the base present-simple verb form with a plural subject. | 1 |
| g8-time-after | Select after to express the order of two events. | 2 |
| g8-time-before | Select before to express the order of two events. | 1 |
| g8-time-when | Select when to connect an event to its time or triggering event. | 1 |
| g8-time-while | Select while to connect simultaneous or ongoing events. | 2 |
| g8-time-while-interruption | Select while to connect an ongoing background action with an interrupting event. | 1 |
| g8-third-conditional-structure | Identify the correct third-conditional structure for an unreal past situation. | 1 |
| g8-third-conditional-if | Select past perfect in a third-conditional if-clause. | 2 |
| g8-third-conditional-result | Select would have plus a past participle in a third-conditional result clause. | 3 |
| g8-conditional-likely-unreal | Distinguish likely future conditions from imaginary or unlikely conditions in context. | 1 |
| g8-second-conditional-negative | Select negative conditions and results in second-conditional sentences. | 1 |
| g8-second-conditional-if | Select past simple in a second-conditional if-clause. | 1 |
| g8-second-conditional-result | Select would plus a base verb in a second-conditional result clause. | 1 |
| g8-second-conditional-meaning | Interpret imaginary or unlikely situations expressed by the second conditional. | 1 |
| g8-hypothetical-were | Select hypothetical were and If I were you for formal hypothetical advice. | 1 |
| g8-first-conditional | Select present simple and will plus a base verb in first-conditional sentences. | 1 |
| g8-connective-addition | Select connectives that add supporting information. | 3 |
| g8-connective-sequence | Select first, then, finally and other connectives that order steps or ideas. | 3 |
| g8-connective-conclusion | Select a connective that signals a conclusion or synthesis. | 1 |
| g8-connective-alternative | Select a connective that signals an alternative or conditional outcome. | 1 |
| g8-connective-similarity | Select a connective that signals comparison or similarity. | 1 |
| g8-connective-reversed-perspective | Select conversely to signal a reversed perspective. | 1 |
| g8-connective-cause-result | Select connectives that express cause, result or consequence. | 3 |
| g8-connective-contrast | Select connectives that contrast ideas. | 4 |
| g8-connective-example | Select a connective that introduces an example. | 1 |
| g8-retrieve-stated-detail | Locate an explicitly stated factual or numerical detail in a text. | 1 |
| g8-infer-feelings | Infer a character's feelings from described behaviour. | 1 |
| g8-feeling-evidence | Select textual evidence that supports an inferred feeling. | 1 |
| g8-adverbial-participial-link | Select a linker or participial form appropriate to an adverbial clause. | 1 |
| g8-passive-infinitive | Select to be plus a past participle in passive-infinitive constructions. | 5 |
| g8-metaphor-identification | Identify a metaphor as a direct figurative comparison. | 1 |
| g8-can-ability | Select can or cannot to express ability. | 1 |
| g8-modal-perfect-participle | Identify that a modal followed by have requires a past participle. | 1 |
| g8-neednt-have-meaning | Interpret need not have plus a past participle as an unnecessary action that occurred. | 2 |
| g8-cant-have-deduction | Interpret cannot have plus a past participle as a deduction that a past event was impossible. | 1 |
| g8-could-have-unrealised | Interpret could have plus a past participle as an unrealised past possibility. | 1 |
| g8-must-have-deduction | Select must have plus a past participle for a strong deduction about the past. | 2 |
| g8-should-have-regret | Interpret should have and should not have plus a past participle as criticism or regret. | 1 |
| g8-mustnt-base-form | Identify that must not is followed directly by a base verb. | 1 |
| g8-obligation-prohibition-meaning | Distinguish obligation, prohibition and lack of necessity in context. | 1 |
| g8-have-to-question | Select do plus subject plus have to in a present-tense question. | 1 |
| g8-external-obligation | Select have to or has to for an external requirement or obligation. | 1 |
| g8-strong-obligation | Select must to express a strong obligation or firm rule. | 2 |
| g8-optional-action | Interpret do not have to and does not have to as absence of necessity. | 1 |
| g8-prohibited-action | Select must not to express prohibition. | 1 |
| g8-uncertain-past-possibility | Select may have or might have plus a past participle for an uncertain past possibility. | 3 |
| g8-uncertain-negative-past | Select might not have plus a past participle for an uncertain negative past possibility. | 2 |
| g8-zero-article-general | Select zero article for general references and uncountable nouns where appropriate. | 3 |
| g8-a-an-sound | Select a or an according to initial sound. | 2 |
| g8-article-basic-reference | Select a, an or the according to sound and reference in context. | 2 |
| g8-article-first-subsequent | Select an indefinite article for a first non-specific reference and the for a subsequent specific reference. | 1 |
| g8-article-mountain-range | Select the definite article with a mountain-range name. | 1 |
| g8-article-unique-specific | Select the definite article for a unique or contextually specific reference. | 1 |
| g8-article-language-meals | Select zero article with language names and routine meal names where appropriate. | 2 |
| g8-regular-plural | Select regular plural noun forms with -s or -es. | 1 |
| g8-uncountable-homework | Select a quantifier appropriate to an uncountable noun such as homework. | 1 |
| g8-irregular-plural | Select common irregular plural noun forms. | 1 |
| g8-attributive-noun | Identify a noun used before another noun to classify or describe it. | 1 |
| g8-possessive-adjective | Select possessive adjectives appropriate to the reference. | 1 |
| g8-possessive-apostrophe | Select apostrophe-s to express possession by one owner. | 1 |
| g8-comparative-quantifiers | Select comparative or superlative quantifiers according to countability and meaning. | 2 |
| g8-much-many | Select much or many according to noun countability. | 1 |
| g8-some-any | Select some or any in basic sentence contexts. | 1 |
| g8-prepositions-place | Select basic prepositions of place in context. | 1 |
| g8-prepositions-time | Select in, on or at for basic time expressions. | 1 |
| g8-dependent-preposition-sets | Select the preposition required by a verb-dependent pattern in context. | 15 |
| g8-compare-with | Select compare with when comparing one thing with another. | 1 |
| g8-die-of | Select die of to identify a disease or internal cause of death. | 1 |
| g8-save-from | Select save plus an object plus from to express protection from harm. | 1 |
| g8-specialise-in | Select in in the verb-dependent pattern specialise in. | 1 |
| g8-emphatic-base-form | Identify that emphatic do, does or did requires the base form of the main verb. | 2 |
| g8-emphatic-present | Select do or does plus a base verb for affirmative present emphasis. | 2 |
| g8-emphatic-past | Select did plus a base verb for affirmative past emphasis. | 1 |
| g8-be-negation | Select present-simple negative forms of be. | 1 |
| g8-do-negation | Select do not or does not plus a base verb in present-simple negatives. | 2 |
| g8-wh-questions-do | Select word order and do or does in basic wh-questions. | 1 |
| g8-yes-no-do-does | Select do or does in present-simple yes/no questions. | 2 |
| g8-yes-no-be | Select am, is or are in yes/no questions with be. | 1 |
| g8-reported-time | Select reported time expressions appropriate to a later reporting context. | 2 |
| g8-reported-continuous | Select was or were plus -ing when backshifting present-continuous speech. | 1 |
| g8-reported-can | Select could or could not when backshifting can or cannot. | 1 |
| g8-reported-perfect-continuous | Select had been plus -ing when backshifting present-perfect-continuous speech. | 1 |
| g8-reported-will | Select would when backshifting will in reported speech. | 1 |
| g8-reported-past-perfect | Select past perfect when the reporting context requires backshift. | 1 |
| g8-reported-question-order | Select statement word order in a reported wh-question. | 2 |
| g8-reported-past-question | Select statement word order and past perfect when reporting a past-simple question with backshift. | 1 |
| g8-reported-yes-no-question | Select if or whether and statement word order in reported yes/no questions. | 1 |
| g8-reported-command | Select told plus an object plus to-infinitive to report a command. | 1 |
| g8-say-tell | Distinguish say from tell plus an object in reported statements. | 1 |
| g8-reported-negative-command | Select told plus an object plus not to-infinitive to report a negative command. | 1 |
| g8-reported-place | Select a reported place expression appropriate to a changed reporting context. | 1 |
| g8-reported-still-true | Identify when a universal or still-true fact can remain unbackshifted. | 1 |
| g8-reported-warning | Select warned plus an object plus not to-infinitive to report a warning. | 1 |
| g8-compound-sentence | Identify a compound sentence containing two coordinated independent clauses. | 1 |
| g8-past-action-consistency | Identify an inconsistent or inappropriate tense construction in coordinated past actions. | 1 |
| g8-present-aspect-contrast | Distinguish present-simple and present-continuous meanings in context. | 1 |
| g8-past-continuous-negative | Select was not or were not plus -ing in past-continuous negatives. | 2 |
| g8-past-continuous-question | Select was or were before the subject in past-continuous questions. | 1 |
| g8-past-continuous-form | Select was or were plus -ing in past-continuous constructions. | 1 |
| g8-present-continuous-form | Select am, is or are plus -ing in present-continuous constructions. | 1 |
| g8-past-continuous-time | Select past continuous for an action in progress at a stated past time. | 2 |
| g8-past-background-interruption | Distinguish an ongoing past background action from a shorter completed event. | 3 |
| g8-future-continuous-error | Identify an error in the will be plus -ing future-continuous structure. | 1 |
| g8-future-aspect-contrast | Distinguish a simple future event from an action in progress at a stated future time. | 1 |
| g8-going-to-question | Select be going to word order in a question about a plan. | 1 |
| g8-future-continuous-question | Select will plus subject plus be plus -ing in a future-continuous question. | 1 |
| g8-future-continuous-negative-question | Select will not plus subject plus be plus -ing in a negative future-continuous question. | 1 |
| g8-future-continuous-form-meaning | Select will be plus -ing for an action in progress at a stated future time. | 2 |
| g8-future-continuous-negative | Select will not be plus -ing in future-continuous negatives. | 1 |
| g8-going-to-intention | Select be going to for a plan or intention decided before speaking. | 1 |
| g8-going-to-evidence | Select be going to for a prediction supported by present evidence. | 1 |
| g8-present-continuous-arrangement | Select present continuous for a fixed future arrangement. | 2 |
| g8-present-simple-timetable | Select present simple for an official timetable or scheduled event. | 1 |
| g8-will-prediction | Select will plus a base verb for a general future prediction. | 1 |
| g8-will-spontaneous-decision | Select will for an offer or decision made at the moment of speaking. | 1 |
| g8-base-after-did | Select the base form of a verb after did. | 1 |
| g8-was-were | Select was or were according to the subject and past-time context. | 1 |
| g8-past-simple-present-perfect | Distinguish past-simple and present-perfect meanings in context. | 1 |
| g8-perfect-continuous-duration-question | Select present-perfect-continuous How long questions for an activity continuing to the present. | 2 |
| g8-present-perfect-question | Select have or has plus subject plus a past participle in a present-perfect question. | 2 |
| g8-perfect-continuous-question | Select have or has plus subject plus been plus -ing in a present-perfect-continuous question. | 1 |
| g8-past-perfect-form | Select had plus a past participle in past-perfect constructions. | 1 |
| g8-present-perfect-form | Select have or has plus a past participle in present-perfect constructions. | 1 |
| g8-perfect-continuous-meaning | Select present perfect continuous for an ongoing or repeated activity relevant to the present. | 2 |
| g8-regular-past-final-c | Select final -ck- before -ed in regular past forms of verbs ending in c. | 1 |
| g8-regular-past-y | Select -ied for regular past forms ending in consonant plus y. | 1 |
| g8-past-simple-participle | Distinguish past-simple and past-participle verb forms. | 1 |
| g8-regular-past-doubling | Select final consonant doubling before -ed where stress and spelling require it. | 2 |
| g8-regular-participle-final-e | Select -d for a regular past participle of a verb ending in e. | 1 |
| g8-regular-past-form | Select regular past-simple forms with the appropriate -ed ending. | 1 |
| g8-irregular-past-form | Select common irregular past-simple verb forms. | 3 |
| g8-irregular-participle | Select irregular past-participle forms. | 1 |
| g8-passive-participle | Select the past participle required in a passive construction. | 1 |
| g8-past-passive-singular | Select was plus a past participle for a singular past-passive construction. | 1 |
| g8-causative-error | Identify an error in have plus an object plus a past participle. | 1 |
| g8-causative-past | Select had plus an object plus a past participle for an arranged past service. | 1 |
| g8-causative-continuous | Select be having plus an object plus a past participle for a service in progress. | 2 |
| g8-causative-present | Select have or has plus an object plus a past participle for an arranged service. | 1 |
| g8-causative-future | Select will have plus an object plus a past participle for a future arranged service. | 1 |
| g8-past-perfect-passive-active | Identify an equivalent past-perfect active sentence for a passive sentence. | 1 |
| g8-future-passive-negative | Select will not be plus a past participle in future-passive negatives. | 1 |
| g8-passive-question-general | Select the appropriate auxiliary order and past participle in a passive question. | 1 |
| g8-past-perfect-passive-question | Select had plus subject plus been plus a past participle in a past-perfect-passive question. | 1 |
| g8-present-perfect-passive-question | Select have or has plus subject plus been plus a past participle in a present-perfect-passive question. | 2 |
| g8-present-simple-passive-question | Select is or are plus subject plus a past participle in a present-simple-passive question. | 1 |
| g8-future-passive | Select will be plus a past participle in future-passive constructions. | 1 |
| g8-present-perfect-passive-negative | Select have not or has not been plus a past participle in present-perfect-passive negatives. | 1 |
| g8-past-perfect-passive | Select had been plus a past participle in past-perfect-passive constructions. | 2 |
| g8-past-passive-plural | Select were plus a past participle for a plural past-passive construction. | 1 |
| g8-past-passive-form | Select was or were plus a past participle in past-passive constructions. | 1 |
| g8-present-perfect-passive | Select have or has been plus a past participle in present-perfect-passive constructions. | 1 |
| g8-present-simple-passive | Select am, is or are plus a past participle in present-simple-passive constructions. | 2 |
| g8-present-perfect-voice-equivalence | Identify equivalent active and passive present-perfect constructions. | 1 |
| g8-simple-passive-context | Select a present- or past-simple passive construction appropriate to context. | 1 |
| g8-past-simple-active-passive | Identify an equivalent past-simple passive sentence for an active sentence. | 2 |
| g8-active-passive-context | Identify a passive transformation that preserves the source sentence's tense and meaning. | 1 |
| g8-future-active-passive | Identify an equivalent will be plus past participle construction for a future active sentence. | 1 |
| g8-word-class-noun | Identify a noun by its function in a sentence. | 1 |
| g8-word-class-adjective | Identify an adjective by its function in a sentence. | 1 |
| g8-word-class-adverb | Identify an adverb by its function in a sentence. | 1 |
| g8-word-class-conjunction | Identify a conjunction by its function in a sentence. | 1 |
| g8-word-class-interjection | Identify an interjection by its function in a sentence. | 1 |
| g8-word-class-preposition | Identify a preposition by its function in a sentence. | 1 |
| g8-word-class-pronoun | Identify a pronoun by its function in a sentence. | 1 |
| g8-word-class-verb | Identify a verb by its function in a sentence. | 1 |
| g8-word-class-context | Identify the word class of a word from its sentence context. | 1 |
| g8-list-commas | Select commas to separate items in a list. | 1 |
