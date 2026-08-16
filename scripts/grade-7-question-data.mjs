export default [
  {
    subject: 'Mathematics', subjectCode: 'mathematics', short: 'math', file: 'mathematics-grade-7.json',
    objectives: [
      { code: 'math7-ratio-proportion', topic: 'Ratio, proportion and percentages', statement: 'Apply proportional reasoning, percentages and rational numbers in mathematical and everyday contexts.', questions: [
        ['The diagram shows that 3 notebooks cost 12 som. At the same rate, what do 5 notebooks cost?', '20 som', ['15 som','18 som','24 som'], 'Each notebook costs 12 ÷ 3 = 4 som, so five notebooks cost 5 × 4 = 20 som.', 'g7-math-ratio-line'],
        ['What percentage of the hundred-square is marked?', '40%', ['4%','60%','400%'], 'Four of ten full columns are marked, which is 40 of 100 cells or 40%.', 'g7-math-percent-grid'],
        ['A jacket costs 2,400 som and is reduced by 15%. What is the sale price?', '2,040 som', ['360 som','2,160 som','2,760 som'], 'Fifteen percent of 2,400 is 360; subtracting the discount gives 2,040 som.'],
        ['A map is enlarged in the ratio 3:2. A road measuring 8 cm on the original measures how long on the enlargement?', '12 cm', ['5.3 cm','10 cm','16 cm'], 'The enlargement scale factor is 3/2, so 8 × 3/2 = 12 cm.'],
      ]},
      { code: 'math7-algebra-sequences', topic: 'Algebra, equations and sequences', statement: 'Form and simplify expressions, solve linear equations and generalise arithmetic sequences.', questions: [
        ['Which expression gives the output in the value table?', '3n + 2', ['2n + 3','3n − 2','5n'], 'Each output is three times n plus two, so the rule is 3n + 2.', 'g7-math-sequence-table'],
        ['Simplify 4a + 7 + 3a − 2.', '7a + 5', ['7a + 9','12a','7a − 5'], 'Combining like terms gives 4a + 3a = 7a and 7 − 2 = 5.'],
        ['Solve 3(x − 2) = 21.', 'x = 9', ['x = 5','x = 7','x = 23'], 'Dividing by 3 gives x − 2 = 7, so adding 2 gives x = 9.'],
        ['The nth term is 5n − 3. Which term of the sequence equals 72?', 'The 15th term', ['The 14th term','The 16th term','The 25th term'], 'Solving 5n − 3 = 72 gives 5n = 75 and n = 15.'],
      ]},
      { code: 'math7-geometry-measure', topic: 'Geometry and measurement', statement: 'Use angle relationships, transformations and circle measures to solve geometric problems.', questions: [
        ['What is the value of x in the parallel-line diagram?', '68°', ['22°','112°','292°'], 'Corresponding angles between parallel lines are equal, so x is 68°.', 'g7-math-transversal'],
        ['Using π = 22/7, what is the circumference of the circle?', '44 cm', ['22 cm','49 cm','154 cm'], 'Circumference is 2πr = 2 × 22/7 × 7 = 44 cm.', 'g7-math-circle-radius'],
        ['A triangle has angles 48° and 67°. What is its third angle?', '65°', ['55°','75°','115°'], 'Angles in a triangle total 180°, so the third angle is 180 − 48 − 67 = 65°.'],
        ['A shape is reflected in the y-axis. What happens to the point (−4, 3)?', 'It maps to (4, 3)', ['It maps to (−4, −3)','It maps to (3, −4)','It maps to (4, −3)'], 'Reflection in the y-axis changes the sign of the x-coordinate but keeps y unchanged.'],
      ]},
      { code: 'math7-data-probability', topic: 'Data and probability', statement: 'Interpret distributions and calculate measures and probabilities to support conclusions.', questions: [
        ['What is the probability that the spinner lands on a circle?', '5/8', ['3/8','5/3','1/2'], 'Five of the eight equal sectors contain circles, so the probability is 5/8.', 'g7-math-spinner'],
        ['Find the median of 4, 7, 8, 10, 13, 15 and 20.', '10', ['8','11','13'], 'There are seven ordered values, so the fourth and middle value is 10.'],
        ['A bag contains 5 red, 3 blue and 2 green counters. What is the probability of choosing a counter that is not red?', '1/2', ['1/5','3/10','2/3'], 'Five of the ten counters are blue or green, giving 5/10 = 1/2.'],
        ['Set A and Set B both have mean 12. Set A has range 4 and Set B has range 15. Which conclusion is justified?', 'Set B is more spread out', ['Set A has the larger maximum for certain','Both sets contain identical values','Set B must contain more values'], 'The larger range shows greater spread, but it does not determine sample size or exact values.'],
      ]},
      { code: 'math7-rates-scale', topic: 'Rates, scale and multi-step problems', statement: 'Model multi-step rate, scale and unit-conversion problems and check the reasonableness of solutions.', questions: [
        ['A cyclist travels 36 km in 2 hours. What is the average speed?', '18 km/h', ['9 km/h','34 km/h','72 km/h'], 'Average speed equals distance divided by time: 36 ÷ 2 = 18 km/h.'],
        ['A tap fills 15 litres in 3 minutes. At the same rate, how much does it fill in 8 minutes?', '40 litres', ['24 litres','30 litres','45 litres'], 'The rate is 5 litres per minute, so in 8 minutes it fills 40 litres.'],
        ['A floor plan uses scale 1:50. A wall is 7.2 cm on the plan. What is its real length?', '3.6 m', ['0.144 m','36 m','360 m'], 'The real length is 7.2 × 50 = 360 cm, which is 3.6 m.'],
        ['A car uses 6.5 litres per 100 km. Estimate the fuel needed for 340 km, then choose the reasonable exact result.', '22.1 litres', ['5.2 litres','52.3 litres','221 litres'], 'Multiplying 6.5 by 3.4 gives 22.1 litres, close to the estimate 7 × 3.5 ≈ 24.5.'],
      ]},
    ],
  },
  {
    subject: 'English', subjectCode: 'english', short: 'eng', file: 'english-grade-7.json',
    objectives: [
      { code: 'eng7-reading-inference', topic: 'Reading evidence and inference', statement: 'Select and connect explicit and implicit evidence to explain inference, viewpoint and theme.', questions: [
        ['Which inference is best supported by the visual clues?', 'A gust through the window scattered the papers', ['A student deliberately sorted the papers','The classroom was locked all day','Rain soaked every sheet of paper'], 'The open window, moving curtain and scattered papers together support the gust inference.', 'g7-eng-story-clues'],
        ['“Amir reread the message, typed a reply, deleted it, and placed the phone face down.” What can be inferred?', 'He is uncertain how to respond', ['He cannot read the message','His phone battery is empty','He has already sent several replies'], 'Drafting and deleting a reply before hiding the screen suggests hesitation or uncertainty.'],
        ['Which detail most strongly shows that the narrator distrusts the guide?', 'The narrator checks every direction against an old map', ['The guide carries a red bag','The group walks before lunch','The path contains small stones'], 'Checking each direction independently is purposeful evidence that the narrator doubts the guide.'],
        ['A story repeatedly contrasts a locked gate with birds flying overhead. Which theme is most strongly suggested?', 'The desire for freedom', ['The value of expensive objects','The difficulty of learning bird names','The importance of matching colours'], 'The contrast between confinement and free flight develops a theme about longing for freedom.'],
      ]},
      { code: 'eng7-language-effect', topic: 'Language and literary effect', statement: 'Analyse how figurative language, imagery and precise vocabulary shape meaning and reader response.', questions: [
        ['What effect does “stitched a path through the storm” create?', 'It presents the light as joining darkness into a safe route', ['It states that the lighthouse repairs clothing','It proves the storm has completely ended','It gives the exact distance to the shore'], 'The metaphor makes the beam seem to join a visible route through dangerous darkness.', 'g7-eng-language-effect'],
        ['In “The deadline crept closer,” what is personified?', 'The deadline', ['The writer','The clock face','The completed task'], 'The abstract deadline is given the living action of creeping closer.'],
        ['Which verb most strongly suggests a door closed with sudden force?', 'Slammed', ['Moved','Rested','Opened with slow and deliberate care'], 'Slammed precisely conveys both rapid movement and forceful impact.'],
        ['Why might a writer describe silence as “heavy” after an argument?', 'To suggest tension that feels difficult to bear', ['To measure the mass of the room','To show that everyone became louder','To explain the furniture arrangement'], 'The sensory metaphor turns emotional tension into something that seems physically burdensome.'],
      ]},
      { code: 'eng7-grammar-cohesion', topic: 'Grammar, punctuation and cohesion', statement: 'Control clauses, punctuation, reference and tense to create accurate, cohesive sentences.', questions: [
        ['Which option correctly uses a semicolon to connect two complete clauses?', 'The storm had passed; the roads were still flooded.', ['The storm; had passed the roads were still flooded.','The storm had; passed, the roads were still flooded.','The storm had passed the; roads were still flooded.'], 'A semicolon correctly joins two closely related independent clauses.'],
        ['Choose the sentence with consistent tense.', 'Mina opened the gate and walked into the garden.', ['Mina opens the gate and walked into the garden.','Mina had opened the gate and walks inside.','Mina opening the gate and walked inside.'], 'Both verbs are in the simple past, so the sequence is grammatically consistent.'],
        ['Which revision makes the pronoun reference clear?', 'When Daria met Leila, Daria carried the portfolio.', ['When Daria met Leila, she carried it.','She met her while carrying it.','When they met, she carried the portfolio.'], 'Repeating Daria removes ambiguity about which person carried the portfolio.'],
        ['Which sentence correctly punctuates a non-essential clause?', 'The library, which opened in 1920, is being restored.', ['The library which opened, in 1920 is being restored.','The library which, opened in 1920 is being restored.','The library which opened in 1920, is being restored.'], 'The removable relative clause is enclosed by a matching pair of commas.'],
      ]},
      { code: 'eng7-writing-structure', topic: 'Writing structure and evidence', statement: 'Organise claims, evidence and explanations into coherent texts with purposeful transitions and conclusions.', questions: [
        ['What is the main purpose of the explanation box in the article plan?', 'To show how the evidence supports the central idea', ['To introduce an unrelated topic','To repeat the headline word for word','To list sources without discussing them'], 'Explanation connects selected evidence to the central idea so the reasoning is clear.', 'g7-eng-article-layout'],
        ['Which transition best introduces a consequence?', 'As a result', ['In contrast','For instance','Meanwhile'], 'As a result explicitly signals that the next idea is a consequence of the previous one.'],
        ['Which evidence best supports the claim that a reading club increased participation?', 'Attendance records rose from 18 to 31 students over six weeks', ['The club poster uses bright colours','One member likes adventure stories','The library has four windows'], 'Comparable attendance data directly measures the claimed change in participation.'],
        ['Which conclusion most effectively closes an argument for safer crossings near school?', 'Installing marked crossings would address the documented risk and protect all road users.', ['That is everything I know about roads.','Crossings can be painted in several colours.','My first paragraph already explained the problem.'], 'The sentence returns to the evidence-based claim and states its wider significance.'],
      ]},
      { code: 'eng7-purpose-audience', topic: 'Purpose, audience and media', statement: 'Evaluate how tone, design and persuasive choices suit audience, purpose and communication medium.', questions: [
        ['Who is the campaign poster most directly trying to persuade?', 'Students who can choose reusable bottles', ['Engineers designing water pipes','Historians studying old containers in museums','Pilots planning a flight route'], 'The school-style slogan, bottle symbol and scan-to-join action target student choices.', 'g7-eng-campaign-poster'],
        ['Which opening best suits a formal report to the school board?', 'This report evaluates three options using cost, safety and access data.', ['Hey everyone, here is what we reckon!','Once upon a time there were three options.','You will never believe option two!'], 'The opening states purpose and criteria in a neutral, appropriately formal tone.'],
        ['A headline says “Miracle Study Trick Guarantees Success!” What should a careful reader check first?', 'Whether credible evidence supports the absolute claim', ['Whether the headline uses a capital letter','Whether the page background is blue','Whether the article contains a photograph'], 'The guarantee is an extreme claim, so source quality and supporting evidence require scrutiny.'],
        ['Which change most improves an emergency notice for a multilingual audience?', 'Use short steps, clear symbols and tested translations', ['Add dense paragraphs of unfamiliar technical slang and abbreviations','Use colour as the only warning signal','Replace instructions with a humorous story'], 'Concise steps, redundant symbols and verified translations improve speed, clarity and access.'],
      ]},
    ],
  },
  {
    subject: 'Science', subjectCode: 'science', short: 'sci', file: 'science-grade-7.json',
    objectives: [
      { code: 'sci7-cells-systems', topic: 'Cells and living systems', statement: 'Relate specialised cell structures to functions and explain organisation in living systems.', questions: [
        ['Which feature best helps the pictured nerve cell carry signals over long distances?', 'Its very long fibre', ['Its lack of a cell membrane','Its square outer wall','Its large air space'], 'The extended fibre allows electrical impulses to travel between distant parts of the body.', 'g7-sci-specialised-cell'],
        ['Which sequence shows increasing biological organisation?', 'Cell → tissue → organ → organ system', ['Organ → cell → tissue → organism','Tissue → cell → organ system → organ','Cell → organ system → tissue → organ'], 'Similar cells form tissues, tissues form organs, and organs cooperate in systems.'],
        ['Why are root hair cells effective at absorbing water and minerals?', 'Their projections provide a large surface area', ['They contain no cytoplasm','They are completely waterproof','Their nuclei make soil warmer'], 'The hair-like projection increases contact with soil water and dissolved mineral ions.'],
        ['During vigorous exercise, why do breathing rate and heart rate both increase?', 'To supply more oxygen and remove more carbon dioxide', ['To stop all cellular respiration','To cool the bones inside joints','To reduce blood flow to muscles'], 'Working muscles respire faster, requiring increased oxygen delivery and carbon dioxide removal.'],
      ]},
      { code: 'sci7-particles-reactions', topic: 'Particles, mixtures and reactions', statement: 'Use particle models and conservation to explain diffusion, reactions and separation processes.', questions: [
        ['What process causes the particles to become evenly distributed?', 'Diffusion', ['Freezing','Filtration','Condensation'], 'Random particle motion causes net movement from high to low concentration until distribution is even.', 'g7-sci-diffusion'],
        ['Which word equation matches the particle model?', '2AB + B₂ → 2AB₂', ['AB + B₂ → AB₃','2A + 2B → A₂B₂','2AB₂ → 2AB + B₂'], 'The diagram shows two AB units plus one B₂ unit forming two AB₂ units.', 'g7-sci-reaction-model'],
        ['Which method best separates pure water from a salt solution?', 'Simple distillation', ['Filtration only','A magnet','Chromatography paper only'], 'Distillation boils and condenses the water while the dissolved salt remains behind.'],
        ['A sealed flask has a mass of 145.6 g before a reaction. What mass should it have after the reaction?', '145.6 g', ['0 g','72.8 g','More than 145.6 g in every case'], 'In a closed system atoms are rearranged but not lost, so total mass is conserved.'],
      ]},
      { code: 'sci7-forces-motion', topic: 'Forces, motion and pressure', statement: 'Interpret motion graphs and apply resultant force and pressure relationships.', questions: [
        ['During which interval is the object stationary?', 'From 4 to 6 minutes', ['From 0 to 2 minutes','From 2 to 4 minutes','From 6 to 8 minutes'], 'A horizontal distance–time segment means distance is unchanged, so the object is stationary.', 'g7-sci-distance-time'],
        ['Which position produces the greater pressure on the surface?', 'Position B', ['Position A','Both always produce zero pressure','Both have different weights'], 'The same weight acts through a smaller contact area in B, producing greater pressure.', 'g7-sci-pressure-blocks'],
        ['A runner travels 150 m in 30 s. What is the average speed?', '5 m/s', ['0.2 m/s','120 m/s','4,500 m/s'], 'Average speed is distance divided by time: 150 ÷ 30 = 5 m/s.'],
        ['A 12 N force acts right and a 7 N force acts left on a 2 kg cart. What motion change should result?', 'The cart accelerates to the right', ['The cart must remain stationary','The cart accelerates to the left','The forces are balanced'], 'The resultant is 5 N to the right, so the cart accelerates in that direction.'],
      ]},
      { code: 'sci7-energy-electricity', topic: 'Energy and electricity', statement: 'Analyse circuit behaviour and quantify useful and dissipated energy transfers.', questions: [
        ['What happens to the other lamp if one lamp is removed from this parallel circuit?', 'It can remain lit on its own branch', ['It must become a battery','It always goes out because there is one path','It receives no electrical energy in any circuit'], 'Each parallel branch provides a separate complete path, so the other branch can keep working.', 'g7-sci-parallel-circuit'],
        ['How much energy is transferred as thermal energy in the diagram?', '80 J', ['20 J','100 J','120 J'], 'Energy is conserved, so thermal transfer is 100 J input minus 20 J light = 80 J.', 'g7-sci-sankey'],
        ['Which device transfers electrical energy mainly into kinetic energy?', 'An electric fan', ['A stationary heater','A lamp','A battery being stored'], 'A fan motor uses electrical energy to produce movement of its blades.'],
        ['A machine receives 500 J and transfers 350 J usefully. What is its efficiency?', '70%', ['30%','150%','850%'], 'Efficiency is useful output divided by input: 350/500 × 100% = 70%.'],
      ]},
      { code: 'sci7-scientific-enquiry', topic: 'Scientific enquiry and evidence', statement: 'Design fair investigations, analyse patterns and evaluate reliability, validity and conclusions.', questions: [
        ['What is the independent variable in the pictured investigation?', 'Water temperature', ['Volume of water','Size of sugar cube','Time taken to dissolve'], 'The deliberately changed factor is temperature; the other shown conditions are controlled.', 'g7-sci-fair-test'],
        ['Why should each dissolving test be repeated?', 'To identify variation and calculate a representative mean', ['To change several variables together','To guarantee the prediction is correct','To avoid recording any units'], 'Repeats reveal random variation and allow a mean that better represents the result.'],
        ['A result lies far from all repeats and a procedural mistake was recorded. What is the best action?', 'Repeat that trial and justify excluding the anomalous result', ['Delete every result without explanation','Change the hypothesis to match it','Average it twice so it has more influence'], 'A documented procedural error supports a transparent repeat and justified treatment of the anomaly.'],
        ['Two variables rise together in an observational study. Which conclusion is safest?', 'They are associated, but the study alone does not prove causation', ['One variable certainly causes the other','The relationship must be accidental','Both variables have identical units'], 'Correlation supports an association, while uncontrolled factors may explain the pattern.'],
      ]},
    ],
  },
  {
    subject: 'Geography', subjectCode: 'geography', short: 'geo', file: 'geography-grade-7.json',
    objectives: [
      { code: 'geo7-map-fieldwork', topic: 'Map skills and fieldwork', statement: 'Use scale, contours and sampling methods to interpret places and collect representative evidence.', questions: [
        ['Which estimate is most reasonable for the height of point P?', 'About 225 m', ['About 75 m','Exactly 200 m','More than 300 m'], 'P lies between the 200 m and 250 m contours, so about 225 m is reasonable.', 'g7-geo-contours'],
        ['What real distance does the mapped 6 cm route represent?', '15 km', ['2.4 km','8.5 km','150 km'], 'At 2.5 km per centimetre, 6 cm represents 6 × 2.5 = 15 km.', 'g7-geo-scale-route'],
        ['Why might a fieldwork team use systematic sampling along a transect?', 'To collect observations at regular, repeatable intervals', ['To select only the most dramatic locations','To guarantee every site is identical','To avoid recording the sampling method'], 'Regular intervals reduce arbitrary site choice and make the method repeatable.'],
        ['Students survey noise only beside the busiest road at lunchtime. What is the main limitation?', 'The sample does not represent other places or times', ['Noise cannot be measured outdoors','Roads never affect survey results','Lunch provides too many map coordinates'], 'One busy location and one time create spatial and temporal sampling bias.'],
      ]},
      { code: 'geo7-weather-climate', topic: 'Weather, climate and water', statement: 'Interpret climate evidence and explain atmospheric and water-cycle processes across places.', questions: [
        ['Which months form the main wet season in the climate graph?', 'June to August', ['December to February','March to May','September to November'], 'The rainfall bars are consistently tallest during June, July and August.', 'g7-geo-climate-graph'],
        ['What process changes surface water into water vapour?', 'Evaporation', ['Condensation','Precipitation','Infiltration'], 'Solar energy enables liquid water at the surface to become water vapour.'],
        ['Why is a city centre often warmer than nearby countryside at night?', 'Buildings store heat and release it slowly', ['Cities receive more hours of sunlight','Rural areas have no atmosphere','Wind can never enter a city'], 'Urban materials absorb daytime energy and release it slowly, contributing to a heat island.'],
        ['A climate graph uses averages from only two years. Why is its climate claim weak?', 'Climate patterns require a much longer record', ['Monthly values cannot be averaged','Rainfall has no measurable units','Temperature never changes between years'], 'Two years may reflect short-term variability rather than a robust long-term climate pattern.'],
      ]},
      { code: 'geo7-rivers-coasts', topic: 'River and coastal processes', statement: 'Explain how erosion, transport and deposition shape river and coastal landscapes and hazards.', questions: [
        ['Where is the steepest gradient on the river profile?', 'Near the source', ['Near the mouth','At sea level only','The gradient is identical throughout'], 'The profile falls most rapidly over distance in the upper course near the source.', 'g7-geo-river-profile'],
        ['When is a river most likely to deposit sediment?', 'When it loses velocity and energy', ['When its velocity increases sharply','When discharge becomes impossible','When all particles dissolve'], 'A slower river has less capacity and competence, so it deposits part of its load.'],
        ['How does hydraulic action erode a cliff?', 'Waves compress air in cracks and weaken rock', ['Saltwater instantly melts all rock','Wind carries the entire cliff away','Plants turn the rock into seawater'], 'Repeated compression and release of trapped air widens cracks in the cliff.'],
        ['A sea wall protects one town but increases erosion farther along the coast. Which process best explains this?', 'Reduced sediment supply interrupts longshore drift', ['The wall increases global sea level','Tides stop moving near concrete','All waves reverse direction permanently'], 'Trapping sediment can starve downdrift beaches, reducing their protective width.'],
      ]},
      { code: 'geo7-population-urban', topic: 'Population, migration and urbanisation', statement: 'Analyse migration, population distribution and urban change using spatial and demographic evidence.', questions: [
        ['What dominant migration pattern is shown on the map?', 'Movement from rural settlements toward the city', ['Equal movement between every place','Movement only from the city to villages','No movement across the region'], 'The largest and most numerous arrows point from rural settlements into the city.', 'g7-geo-migration-flows'],
        ['Which is a likely pull factor for migration to a city?', 'Greater access to jobs and services', ['Crop failure in a rural area','Loss of farmland after drought','Conflict near a village'], 'Employment and service opportunities can attract people toward urban areas.'],
        ['A district has 84,000 people in 420 km². What is its population density?', '200 people per km²', ['20 people per km²','350 people per km²','35,280 people per km²'], 'Population density is 84,000 ÷ 420 = 200 people per square kilometre.'],
        ['Why can rapid urbanisation create informal settlements?', 'Housing and infrastructure may not grow as fast as population', ['All new residents prefer unsafe housing','Cities immediately run out of land everywhere','Urban jobs always disappear during growth'], 'When planned supply lags population growth, households may rely on unplanned housing.'],
      ]},
      { code: 'geo7-resources-sustainability', topic: 'Resources and sustainability', statement: 'Evaluate resource and development decisions using environmental, social and economic evidence.', questions: [
        ['Which wind-farm site best balances strong wind with distance from homes and the nesting zone?', 'Site B', ['Site A','Site C','Site D'], 'B is exposed to the prevailing wind while lying away from both mapped constraints.', 'g7-geo-wind-site'],
        ['Which energy source is renewable?', 'Solar radiation', ['Coal','Natural gas','Uranium ore'], 'Sunlight is continually replenished on human timescales, unlike the finite fuels listed.'],
        ['Why is water described as renewable but still scarce in some places?', 'Supply varies by season, location, quality and demand', ['Earth creates unlimited clean water everywhere','Renewable means no management is needed','Water cannot move between stores'], 'The global cycle renews water, but accessible clean supply is uneven and demand can exceed it.'],
        ['Which proposal best demonstrates sustainable resource planning?', 'Meet present needs while protecting ecosystems and future supply', ['Maximise extraction this year regardless of damage','Ban all resource use without assessing needs','Judge success only by short-term profit'], 'Sustainability balances current social and economic needs with long-term environmental limits.'],
      ]},
    ],
  },
];
