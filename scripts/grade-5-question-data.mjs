export default [
  {
    subject: 'Mathematics', subjectCode: 'mathematics', short: 'math', file: 'mathematics-grade-5.json',
    objectives: [
      { code: 'math5-number-operations', topic: 'Number, place value and operations', statement: 'Read, compare and calculate with whole numbers, using estimation and inverse operations to check solutions.', questions: [
        ['In the place-value chart, what is the value of the highlighted digit?', '60,000', ['6,000', '600', '600,000'], 'The highlighted 6 is in the ten-thousands column, so its value is 60,000.', 'g5-math-place-value'],
        ['Which calculation is represented by an array with 6 equal rows of 4 counters?', '6 × 4 = 24', ['6 + 4 = 10', '24 ÷ 6 = 6', '24 − 4 = 20'], 'The array contains 6 equal rows of 4 counters, giving 6 × 4 = 24.'],
        ['A library has 3,482 books and receives 769 more. How many books does it have now?', '4,251', ['3,151', '4,141', '4,261'], 'Adding 3,482 and 769 gives 4,251 books.'],
        ['A shop packs 1,248 pencils equally into 6 boxes. How many pencils go in each box?', '208', ['188', '204', '218'], 'Dividing 1,248 by 6 gives 208 pencils in each box.'],
      ]},
      { code: 'math5-fractions-decimals', topic: 'Fractions and decimals', statement: 'Represent, compare and calculate with common fractions and decimals in practical contexts.', questions: [
        ['What fraction of the strip is shaded?', '3/4', ['1/4', '3/8', '4/3'], 'Six of eight equal parts are shaded, and 6/8 simplifies to 3/4.', 'g5-math-fraction-strip'],
        ['Which decimal is marked by point P on the number line?', '1.6', ['0.6', '1.4', '2.6'], 'The interval from 1 to 2 is divided into tenths, and P is on the sixth tenth after 1.', 'g5-math-decimal-line'],
        ['Which number is greatest?', '0.72', ['0.7', '0.27', '0.702'], 'Writing the numbers to three decimal places gives 0.720, 0.700, 0.270 and 0.702.'],
        ['Mira drinks 3/10 litre in the morning and 4/10 litre later. How much does she drink altogether?', '7/10 litre', ['1/10 litre', '7/20 litre', '1 1/10 litres'], 'The denominators are equal, so add the numerators: 3/10 + 4/10 = 7/10.'],
      ]},
      { code: 'math5-patterns-rules', topic: 'Patterns, rules and unknowns', statement: 'Recognise numerical and visual patterns, describe rules and solve simple problems containing unknown values.', questions: [
        ['How many tiles will Figure 4 contain?', '13', ['11', '14', '16'], 'The pattern adds 3 tiles each time: 4, 7, 10, then 13.', 'g5-math-tile-pattern'],
        ['The pairs are 1 → 4, 2 → 7 and 3 → 10. Which rule changes each input into its output?', 'Multiply by 3, then add 1', ['Add 4', 'Multiply by 4', 'Multiply by 2, then add 3'], 'For each pair, multiplying the input by 3 and adding 1 gives the output.'],
        ['What is the next number in the sequence 7, 12, 17, 22, ...?', '27', ['24', '26', '29'], 'Each term is 5 greater than the previous term, so 22 + 5 = 27.'],
        ['A number is multiplied by 4 and then 3 is added. The result is 31. What is the number?', '7', ['6', '8', '28'], 'Undo the operations: 31 − 3 = 28, then 28 ÷ 4 = 7.'],
      ]},
      { code: 'math5-geometry-measure', topic: 'Geometry and measurement', statement: 'Classify shapes and angles and solve perimeter, area, time and unit-conversion problems.', questions: [
        ['Which angle is an obtuse angle?', 'Angle C', ['Angle A', 'Angle B', 'Angle D'], 'Angle C is greater than 90 degrees but less than 180 degrees.', 'g5-math-angle-cards'],
        ['What is the area of the shaded rectangle?', '24 square units', ['10 square units', '20 square units', '28 square units'], 'The rectangle is 6 units long and 4 units wide, so its area is 6 × 4 = 24 square units.', 'g5-math-area-grid'],
        ['A rectangular garden is 9 m long and 5 m wide. What is its perimeter?', '28 m', ['14 m', '40 m', '45 m'], 'Perimeter is 9 + 5 + 9 + 5 = 28 metres.'],
        ['A film starts at 14:35 and lasts 1 hour 48 minutes. When does it finish?', '16:23', ['15:83', '16:13', '16:33'], 'Adding 1 hour gives 15:35, then adding 48 minutes gives 16:23.'],
      ]},
      { code: 'math5-data-chance', topic: 'Data and chance', statement: 'Read and compare data displays, calculate simple averages and describe likelihood using fractions.', questions: [
        ['How many more books did Cedar read than Birch?', '6', ['4', '8', '14'], 'Cedar read 14 books and Birch read 8, so the difference is 14 − 8 = 6.', 'g5-math-bar-chart'],
        ['What is the probability of landing on a star?', '3/8', ['1/3', '5/8', '3/5'], 'Three of the eight equal sectors contain a star, so the probability is 3/8.', 'g5-math-spinner'],
        ['The scores are 6, 8, 8, 9 and 9. What is the mode?', '8 and 9', ['6 only', '8 only', '9 only'], 'Both 8 and 9 occur twice, more often than any other score.'],
        ['A class survey includes only students from the football club. Why might it not represent the whole class?', 'Club members may have different preferences from other students', ['The survey contains too many subjects', 'Every student must give the same answer', 'Football clubs cannot collect data'], 'A sample from one interest group may be biased and may not reflect other students.'],
      ]},
    ],
  },
  {
    subject: 'English', subjectCode: 'english', short: 'eng', file: 'english-grade-5.json',
    objectives: [
      { code: 'eng5-reading-inference', topic: 'Reading evidence and inference', statement: 'Retrieve information and combine textual or visual clues to make and justify age-appropriate inferences.', questions: [
        ['What most likely happened just before the final picture?', 'The wind blew the papers through the open window', ['A student carefully filed every paper', 'The classroom lights stopped working', 'The teacher painted the window'], 'The open window, moving curtain and scattered papers support the inference that wind blew them inside.', 'g5-eng-story-clues'],
        ['A library notice says, “Book returns: Tuesday at 12:30.” When can pupils return books?', 'Tuesday at 12:30', ['Monday at 09:00', 'Wednesday at 15:45', 'Friday at 08:15'], 'The notice places book returns in the Tuesday 12:30 slot.'],
        ['Lena checked the sky, closed the windows and carried an umbrella. What can the reader infer?', 'She expects rain', ['She has lost her bag', 'She plans to swim', 'She is decorating the room'], 'The dark-sky check, closed windows and umbrella are connected clues that suggest rain.'],
        ['A narrator calls a new neighbourhood “a maze of identical streets.” What does this suggest?', 'The narrator finds it confusing to navigate', ['Every street contains a maze game', 'The streets are brightly coloured', 'The narrator designed the neighbourhood'], 'Comparing the streets to a maze suggests they are difficult to tell apart and navigate.'],
      ]},
      { code: 'eng5-vocabulary-effect', topic: 'Vocabulary and language effect', statement: 'Use context, word relationships and figurative language to explain meaning and effect.', questions: [
        ['Which word best completes the intensity scale?', 'furious', ['pleased', 'sleepy', 'tiny'], 'Furious is stronger than angry and completes the increasing scale of emotion.', 'g5-eng-word-scale'],
        ['What does the phrase “the moon was a silver coin” help the reader imagine?', 'A round, bright moon', ['A moon hidden by thick cloud', 'Money falling from the sky', 'A square moon beside a shop'], 'The metaphor compares the moon’s round shape and silvery brightness to a coin.'],
        ['In “The path was narrow, so we walked in single file,” what does narrow mean?', 'Not wide', ['Very noisy', 'Made of metal', 'Without an end'], 'The need to walk in single file shows that the path did not have much width.'],
        ['Which sentence uses personification?', 'The impatient wind rattled the gate', ['The gate was made of iron', 'The wind reached 30 kilometres per hour', 'The gate stood beside the path'], 'Calling the wind impatient gives it a human quality.'],
      ]},
      { code: 'eng5-grammar-punctuation', topic: 'Grammar, punctuation and sentence control', statement: 'Construct and edit sentences using accurate tense, agreement, clauses and punctuation.', questions: [
        ['Which sentence punctuates the spoken words correctly?', '“Please wait here,” said Hana.', ['“Please wait here” said Hana.', 'Please wait here,” said Hana.', '“Please wait here, said Hana.”'], 'The spoken words use quotation marks, and the comma is placed before the closing quotation mark.', 'g5-eng-direct-speech'],
        ['Which conjunction best joins the two ideas in the diagram?', 'because', ['unless', 'although', 'before'], 'Because introduces the reason that the match was moved indoors.', 'g5-eng-conjunction-bridge'],
        ['Which sentence has correct subject–verb agreement?', 'The basket of apples is heavy.', ['The basket of apples are heavy.', 'The apples in the basket is heavy.', 'The basket were heavy every day.'], 'The subject is the singular noun basket, so the correct verb is is.'],
        ['Which edit makes the sentence clearer? “After feeding the puppy, the bowl was washed by Amir.”', 'After feeding the puppy, Amir washed the bowl.', ['After the puppy, feeding Amir washed the bowl.', 'The bowl after feeding washed Amir.', 'Amir, the bowl was feeding the puppy.'], 'The revised sentence clearly shows that Amir performed both actions.'],
      ]},
      { code: 'eng5-writing-structure', topic: 'Writing structure and cohesion', statement: 'Organise ideas into coherent paragraphs and select openings, supporting details and conclusions for a clear purpose.', questions: [
        ['Which card belongs in the missing part of the paragraph plan?', 'Supporting evidence', ['A different title', 'An unrelated joke', 'The writer’s address'], 'Evidence should follow the topic sentence and support its main point before the explanation.', 'g5-eng-paragraph-plan'],
        ['Which event should appear second in the instructions?', 'Add soil to the pot', ['Enjoy the flowers', 'Label the finished plant', 'Put away every tool before starting'], 'The sequence shows preparing the pot before adding the seed and watering it.', 'g5-eng-instruction-sequence'],
        ['Which opening best begins a story about a surprising discovery?', 'When the floorboard lifted, a tiny brass key glittered underneath.', ['This report has three numbered sections.', 'Please purchase the following items.', 'In conclusion, exercise is beneficial.'], 'The opening introduces an unexpected object and creates curiosity suitable for a story.'],
        ['Which detail best supports the claim that the park needs more shade?', 'At midday, every bench is in direct sunlight', ['The park gate is painted green', 'Two paths meet beside the fountain', 'A bus stops across the road'], 'Direct sunlight on every bench is relevant evidence that shaded seating is lacking.'],
      ]},
      { code: 'eng5-purpose-audience', topic: 'Purpose, audience and information', statement: 'Identify purpose and audience and evaluate how layout, tone and evidence help communicate information.', questions: [
        ['Who is the notice mainly written for?', 'Pupils bringing reusable lunch containers', ['Pilots checking flight plans', 'Builders repairing the school roof', 'Scientists naming a new planet'], 'The school lunch message and reusable-container symbol directly address pupils making lunch choices.', 'g5-eng-school-notice'],
        ['Which feature helps readers find information fastest in the fact file?', 'Clear headings and labelled sections', ['One very long paragraph', 'Decorative marks covering the numbers', 'A title written backwards'], 'Headings and sections allow readers to scan for a specific type of information.', 'g5-eng-animal-fact-file'],
        ['Which sentence is most suitable for a polite email to a teacher?', 'Could you please explain the homework deadline?', ['Tell me the deadline right now!', 'Hey, what is going on with that work?', 'The deadline is probably not important.'], 'The sentence makes a clear request using respectful, polite language.'],
        ['An advert claims a snack is “the healthiest ever” but gives no evidence. What should a careful reader do?', 'Look for reliable nutrition information before believing the claim', ['Believe it because the letters are large', 'Assume every advert is a scientific report', 'Ignore the ingredient list completely'], 'An extreme claim needs supporting evidence from reliable nutrition information.'],
      ]},
    ],
  },
  {
    subject: 'Science', subjectCode: 'science', short: 'sci', file: 'science-grade-5.json',
    objectives: [
      { code: 'sci5-living-things', topic: 'Living things and life cycles', statement: 'Describe life cycles, food relationships and how structures or behaviours support survival.', questions: [
        ['Which stage comes immediately after the egg in the butterfly life cycle?', 'Larva', ['Adult', 'Pupa', 'Seedling'], 'A butterfly develops from egg to larva, then pupa, and finally adult.', 'g5-sci-butterfly-cycle'],
        ['Which organism is the producer in the food chain?', 'Grass', ['Rabbit', 'Fox', 'Fungus'], 'Grass makes its own food using light energy, so it is the producer.', 'g5-sci-food-chain'],
        ['Why do many desert plants have thick stems?', 'To store water', ['To catch fish', 'To make the air colder', 'To avoid all sunlight'], 'Thick, fleshy stems store water that the plant can use during dry periods.'],
        ['A disease greatly reduces the number of insects in a habitat. Which population is most directly at risk first?', 'Birds that mainly eat insects', ['Plants pollinated only by wind', 'Fish eating water plants', 'Animals eating only seeds'], 'Specialist insect-eating birds lose their main food source when insect numbers fall.'],
      ]},
      { code: 'sci5-materials-changes', topic: 'Materials and changes', statement: 'Compare material properties and distinguish reversible changes, irreversible changes and changes of state.', questions: [
        ['In a test, drinks in A, B and C cool by 18°C, 11°C and 4°C. Which container is the best insulator?', 'Material C', ['Material A', 'Material B', 'All materials conduct heat equally'], 'Material C shows the smallest temperature drop, so it is the best thermal insulator.'],
        ['Which arrow shows evaporation?', 'Arrow B', ['Arrow A', 'Arrow C', 'Arrow D'], 'Arrow B moves from liquid water to water vapour, which is evaporation.', 'g5-sci-state-change'],
        ['Which change is reversible?', 'Melting and refreezing chocolate', ['Burning paper', 'Cooking an egg', 'Rusting a nail'], 'Melted chocolate can cool and become solid again without forming a new substance.'],
        ['A mixture contains iron filings, sand and salt. What should be done first to separate it?', 'Use a magnet to remove the iron', ['Evaporate the iron', 'Filter out the dissolved salt immediately', 'Freeze the entire dry mixture'], 'A magnet selectively removes the iron before water is used to separate salt from sand.'],
      ]},
      { code: 'sci5-forces-space', topic: 'Forces, Earth and space', statement: 'Explain simple effects of forces and use models to describe Earth, Moon and Sun patterns.', questions: [
        ['What is the resultant force on the cart?', '4 N to the right', ['4 N to the left', '12 N to the right', 'The forces are balanced'], 'The forces oppose each other, so 8 N right minus 4 N left gives 4 N to the right.', 'g5-sci-force-arrows'],
        ['Which movement causes day and night?', 'Earth rotating on its axis', ['Earth orbiting the Sun once', 'The Moon orbiting Earth', 'The Sun orbiting the Moon'], 'As Earth rotates, different parts face toward and then away from the Sun.'],
        ['Which force pulls an unsupported object toward Earth?', 'Gravity', ['Friction', 'Magnetism', 'Air pressure only'], 'Gravity attracts objects with mass toward Earth.'],
        ['Why does a parachute fall more slowly when it opens?', 'Its larger area increases air resistance', ['It removes Earth’s gravity', 'Its mass becomes zero', 'The air stops moving completely'], 'The open parachute pushes against more air, increasing the upward drag force.'],
      ]},
      { code: 'sci5-energy-waves', topic: 'Electricity, light and sound', statement: 'Build and interpret simple circuits and explain basic behaviour of light and sound.', questions: [
        ['Why is the lamp off in the diagram?', 'The switch leaves a gap in the circuit', ['The battery has two terminals', 'The wires form a complete loop', 'The lamp is connected to a wire'], 'Current cannot flow around the circuit because the open switch creates a gap.', 'g5-sci-open-circuit'],
        ['Which object will produce the darkest shadow?', 'The opaque card', ['The clear sheet', 'The translucent paper', 'The empty frame'], 'An opaque object blocks the greatest amount of light and forms the darkest shadow.', 'g5-sci-shadow-test'],
        ['How can a drum produce a louder sound?', 'Strike the drum skin harder', ['Cover it with a thick cushion', 'Stop the skin vibrating', 'Move it into a vacuum'], 'A harder strike produces larger vibrations, which create a louder sound.'],
        ['Two identical lamps are added in series to one battery. Why are they dimmer than one lamp alone?', 'The available energy is shared across more components', ['The battery creates extra darkness', 'Series circuits have no complete path', 'Each lamp becomes an insulator'], 'In a series circuit, adding lamps increases resistance and the energy transfer per lamp is reduced.'],
      ]},
      { code: 'sci5-enquiry-evidence', topic: 'Scientific enquiry and evidence', statement: 'Plan fair tests, read tables and graphs, identify patterns and evaluate the reliability of conclusions.', questions: [
        ['Which factor did the pupils deliberately change between the three seed dishes?', 'Distance from the lamp', ['Type of seed', 'Number of seeds in each dish', 'Number of seeds that germinate'], 'The distance from the lamp is deliberately changed between the otherwise matching dishes.', 'g5-sci-fair-test'],
        ['Which conclusion is best supported by the results table?', 'Sugar dissolves faster in warmer water', ['Sugar never dissolves in cold water', 'Water temperature has no effect', 'Every result takes exactly 40 seconds'], 'The dissolving time becomes shorter as water temperature increases.', 'g5-sci-results-table'],
        ['Why should a measurement be repeated?', 'To check variation and calculate a more reliable average', ['To change the question after every trial', 'To guarantee the prediction is correct', 'To remove the need for units'], 'Repeated measurements reveal variation and allow an average less affected by random error.'],
        ['A plant-growth test uses different plant species in every pot. Why is the test not fair?', 'Plant species is an uncontrolled variable', ['Plants cannot be measured', 'Pots must never contain soil', 'Growth has no relationship to conditions'], 'Different species may grow at different rates, so species must be controlled when another factor is tested.'],
      ]},
    ],
  },
  {
    subject: 'Geography', subjectCode: 'geography', short: 'geo', file: 'geography-grade-5.json',
    objectives: [
      { code: 'geo5-maps-directions', topic: 'Maps, direction and scale', statement: 'Use compass directions, grid references, keys and simple scale to locate and describe places.', questions: [
        ['In which direction is the campsite from the lake?', 'Northeast', ['Northwest', 'Southeast', 'Southwest'], 'The campsite is above and to the right of the lake, which is northeast.', 'g5-geo-compass-map'],
        ['Which grid square contains the museum?', 'C2', ['B2', 'C3', 'D2'], 'The museum is in column C and row 2, giving grid reference C2.', 'g5-geo-grid-map'],
        ['A map scale says 1 cm represents 2 km. What real distance does 4 cm represent?', '8 km', ['2 km', '6 km', '12 km'], 'Multiplying 4 centimetres by 2 kilometres per centimetre gives 8 kilometres.'],
        ['Why does a map need a key?', 'To explain what its symbols represent', ['To make north change direction', 'To list every person in the area', 'To hide the map scale'], 'A key allows readers to connect map symbols with real features.'],
      ]},
      { code: 'geo5-weather-water', topic: 'Weather, climate and water', statement: 'Read weather evidence and describe key processes and stores in the water cycle.', questions: [
        ['Which month recorded the greatest rainfall?', 'April', ['January', 'February', 'May'], 'April has the tallest rainfall bar on the chart.', 'g5-geo-rainfall-chart'],
        ['Which process is shown by arrow X?', 'Condensation', ['Evaporation', 'Runoff', 'Infiltration'], 'Arrow X shows water vapour cooling and forming clouds, which is condensation.', 'g5-geo-water-cycle'],
        ['Which instrument measures air temperature?', 'Thermometer', ['Rain gauge', 'Wind vane', 'Compass'], 'A thermometer measures temperature, usually in degrees Celsius.'],
        ['Why can two places at the same latitude have different rainfall?', 'Relief and prevailing winds can affect rising air', ['Latitude fixes identical weather everywhere', 'Mountains prevent all clouds from forming', 'Rain only falls beside oceans'], 'Mountains and wind direction influence where air rises, cools and releases rain.'],
      ]},
      { code: 'geo5-landforms-environments', topic: 'Landforms and environments', statement: 'Recognise physical features and explain simple processes that shape rivers, coasts and environments.', questions: [
        ['Where is sediment most likely to be deposited in the river diagram?', 'At the inside of the bend', ['At the steep outer bank', 'At the source only', 'In the fastest current'], 'Water flows more slowly on the inside of a bend, so it deposits more sediment there.', 'g5-geo-river-bend'],
        ['Which environment has very low rainfall, hot days and sparse vegetation?', 'Desert', ['Tropical rainforest', 'Polar ice cap', 'Temperate woodland'], 'Very low rainfall, hot days and sparse vegetation are characteristic of a desert.'],
        ['What is erosion?', 'The wearing away and removal of rock or soil', ['The planting of crops in rows', 'The daily change from light to dark', 'The measurement of population'], 'Erosion wears away material and transports it from its original location.'],
        ['Why are mangrove forests valuable along some tropical coasts?', 'Their roots reduce wave energy and provide habitats', ['They increase every wave’s height', 'They remove all salt from the ocean', 'They prevent any organism from living nearby'], 'Dense roots slow water, trap sediment and create nursery habitats for many species.'],
      ]},
      { code: 'geo5-people-settlements', topic: 'People, settlements and connections', statement: 'Describe settlement patterns, population movement and how transport and services connect places.', questions: [
        ['Which site is most suitable for a new health clinic?', 'Site B', ['Site A', 'Site C', 'Site D'], 'Site B is close to most homes and beside the main road without occupying the floodplain.', 'g5-geo-settlement-site'],
        ['On a transport flow map, what does a thicker arrow usually represent?', 'A larger number of people travelling', ['A steeper mountain slope', 'A colder transport route', 'A national border'], 'Flow maps commonly use arrow thickness to show the relative number of travellers.'],
        ['Which is a pull factor encouraging people to move to a town?', 'Access to more jobs and services', ['A drought damaging crops', 'A flood destroying homes', 'Poor harvests in villages'], 'Employment and services attract people, so they are pull factors.'],
        ['A village grows beside a road junction. What is the most likely reason?', 'The junction improves movement and trade', ['Roads prevent all building', 'Junctions remove the need for services', 'Trade only occurs far from routes'], 'Accessible routes help people, goods and services meet, supporting settlement growth.'],
      ]},
      { code: 'geo5-sustainability-fieldwork', topic: 'Resources, sustainability and fieldwork', statement: 'Use field evidence to compare places and make sustainable decisions about resources and environments.', questions: [
        ['Which waste category should the school target first?', 'Food waste', ['Paper', 'Plastic', 'Metal'], 'Food waste forms the largest section of the audit chart.', 'g5-geo-waste-chart'],
        ['Which route causes the least disturbance to the woodland?', 'Route C', ['Route A', 'Route B', 'All routes cross the same area'], 'Route C follows the existing edge path and avoids the woodland core and nesting area.', 'g5-geo-path-decision'],
        ['Why should pupils count traffic at the same time on different days?', 'To make the observations more comparable', ['To ensure every vehicle is identical', 'To stop weather from ever changing', 'To avoid recording the date'], 'Using the same time controls one source of variation and makes daily results easier to compare.'],
        ['Which action is the most sustainable use of water at school?', 'Repair leaks and collect rainwater for gardens', ['Leave taps running during breaks', 'Use drinking water to wash empty paths daily', 'Ignore the water meter'], 'Preventing waste and using captured rainwater reduces demand on treated water supplies.'],
      ]},
    ],
  },
];
