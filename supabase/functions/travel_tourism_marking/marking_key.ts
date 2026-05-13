export type TravelTourismMarkingItem = {
  id: string;
  maxMarks: number;
  command: 'state' | 'identify' | 'describe' | 'explain' | 'assess' | 'evaluate';
  aoFocus: string[];
  expectedPoints: string[];
  acceptableAlternatives?: string[];
  teacherNotes: string;
  commonMistakes: string[];
  levelGuidance?: string;
};

export const TRAVEL_TOURISM_MARKING_KEY: TravelTourismMarkingItem[] = [
  {
    id: '1a', maxMarks: 2, command: 'state', aoFocus: ['AO1'],
    expectedPoints: ['Tourists increasingly consider sustainable options when planning trips.', 'Tourists are willing to pay more for sustainable travel and tourism products.', 'Tourists are prioritising waste reduction and environmental responsibility.', 'Future demand for sustainable products is expected to grow.'],
    acceptableAlternatives: ['Growing awareness of environmental impacts.', 'Demand from eco-conscious tourists.'],
    teacherNotes: 'Award 1 mark per valid reason. Answers may use Fig. 1.1 data such as 94% considering sustainable options or willingness to pay more.',
    commonMistakes: ['Repeating sustainable tourism is growing without a reason.', 'Giving actions tourists can take rather than reasons for growth.'],
  },
  {
    id: '1b', maxMarks: 2, command: 'state', aoFocus: ['AO1'],
    expectedPoints: ['Use refillable water bottles.', 'Avoid single-use plastics.', 'Recycle waste at the destination.', 'Carry reusable bags/containers.', 'Choose digital tickets/maps instead of printed materials.', 'Buy products with less packaging.'],
    teacherNotes: 'Award 1 mark per practical waste-reduction method.',
    commonMistakes: ['Generic sustainable transport points without waste reduction.', 'Vague answers such as be eco-friendly.'],
  },
  {
    id: '1c', maxMarks: 4, command: 'explain', aoFocus: ['AO1', 'AO2'],
    expectedPoints: ['Promote/market the destination to target tourists.', 'Coordinate tourism strategy and support tourism organisations.', 'Provide visitor information and education about sustainable choices.', 'Develop destination branding and campaigns.', 'Support product development, standards, research, and stakeholder partnerships.'],
    teacherNotes: 'Award up to 2 marks per role: valid role plus explanation/application.',
    commonMistakes: ['Listing roles without explanation.', 'Confusing NTOs with individual tour operators.'],
  },
  {
    id: '1d', maxMarks: 6, command: 'explain', aoFocus: ['AO1', 'AO2', 'AO3'],
    expectedPoints: ['Use local suppliers/accommodation/guides to support the local economy.', 'Reduce waste through reusable materials, recycling, and digital documents.', 'Offer low-carbon transport or smaller-group itineraries.', 'Educate tourists about responsible behaviour.', 'Protect habitats and avoid activities that damage environments or communities.', 'Work with certified sustainable providers.'],
    teacherNotes: 'Award 2 marks per way: identification plus explanation/development.',
    commonMistakes: ['Three undeveloped bullet points.', 'Repeating the same environmental idea three times.'],
  },
  {
    id: '1e', maxMarks: 6, command: 'evaluate', aoFocus: ['AO1', 'AO2', 'AO3', 'AO4'],
    expectedPoints: ['Airlines create significant emissions so sustainability can reduce environmental impact.', 'Sustainable airlines may meet tourist demand and improve brand image.', 'Costs of new aircraft/fuels may be high and fares may rise.', 'Regulations and stakeholder pressure make action important.', 'A reasoned judgement should weigh environmental importance against practical/cost limits.'],
    teacherNotes: 'Use levels. Higher marks need balanced evaluation and a supported judgement, not only methods.',
    commonMistakes: ['Only describing recycling or fuel saving.', 'No final judgement.', 'Ignoring cost/practicality.'],
    levelGuidance: '1-2: basic points. 3-4: explained importance with some balance. 5-6: clear analysis, balance, and reasoned judgement.',
  },
  {
    id: '2a', maxMarks: 2, command: 'state', aoFocus: ['AO1'],
    expectedPoints: ['Apartment', 'Villa', 'Cottage', 'Chalet', 'Caravan', 'Camping/glamping unit', 'Hostel with kitchen facilities'],
    teacherNotes: 'Award 1 mark per valid self-catering accommodation type other than home rental.', commonMistakes: ['Hotel', 'Guest house unless self-catering is explicit.'],
  },
  { id: '2b', maxMarks: 2, command: 'state', aoFocus: ['AO1'], expectedPoints: ['Hotel', 'Guest house', 'Bed and breakfast', 'Resort', 'Cruise ship', 'Lodge with meals'], teacherNotes: 'Award 1 mark per catered accommodation type.', commonMistakes: ['Apartment/villa without catering.'] },
  { id: '2c', maxMarks: 4, command: 'explain', aoFocus: ['AO1', 'AO2', 'AO3'], expectedPoints: ['Advantage: visitor spending spreads into local communities and supports hosts/local shops.', 'Advantage: increases destination capacity and choice.', 'Disadvantage: may reduce housing availability or increase rents for residents.', 'Disadvantage: may cause noise, congestion, or conflict in residential areas.', 'Disadvantage: competition for hotels may reduce formal sector revenue/jobs.'], teacherNotes: 'Award up to 2 for advantage and 2 for disadvantage: point plus explanation.', commonMistakes: ['Only giving tourist advantages.', 'No destination impact.'] },
  { id: '2d', maxMarks: 6, command: 'explain', aoFocus: ['AO1', 'AO3'], expectedPoints: ['Often cheaper for families/groups.', 'Flexibility to cook and eat at preferred times.', 'More space/privacy/home-like facilities.', 'Opportunity to experience local neighbourhoods.', 'Suitable for longer stays or special diets.'], teacherNotes: 'Award 2 marks per reason: identification plus development.', commonMistakes: ['Repeating cheap/value three times.', 'Listing without explanation.'] },
  { id: '2e', maxMarks: 6, command: 'evaluate', aoFocus: ['AO1', 'AO3', 'AO4'], expectedPoints: ['High season can increase occupancy, prices, revenue, and staffing needs.', 'Low season can cause low occupancy, cash-flow pressure, staff layoffs, or closure.', 'Providers may use differential pricing, events, or promotions to manage seasonality.', 'Judgement should recognise seasonality can be positive in peak periods but risky overall if demand is too uneven.'], teacherNotes: 'Use levels; reward balanced consideration of high and low season plus judgement.', commonMistakes: ['Only describing weather.', 'Only tourist impacts.', 'No judgement.'], levelGuidance: '1-2: simple impacts. 3-4: developed positive/negative impacts. 5-6: balanced evaluation with reasoned conclusion.' },
  { id: '3a', maxMarks: 2, command: 'state', aoFocus: ['AO1'], expectedPoints: ['Leisure/holiday', 'Business/work', 'Visiting friends and relatives', 'Education', 'Health/medical', 'Religious/cultural reasons'], teacherNotes: 'Award 1 mark per main reason.', commonMistakes: ['Transport modes instead of travel reasons.'] },
  { id: '3b', maxMarks: 2, command: 'state', aoFocus: ['AO1'], expectedPoints: ['Urban/city', 'Rural/countryside', 'Coastal/beach', 'Business destination', 'Cultural/heritage destination', 'Resort', 'Natural destination'], teacherNotes: 'Award 1 mark per type of destination.', commonMistakes: ['Naming only countries without type.'] },
  { id: '3c', maxMarks: 4, command: 'explain', aoFocus: ['AO1', 'AO2', 'AO3'], expectedPoints: ['Virtual visits increase reach to people unable to travel.', 'They create additional audience/revenue/marketing value.', 'They improve accessibility for international visitors or those with restrictions.', 'They extend event legacy after the physical visit.', 'They reduce capacity pressure at the venue.'], teacherNotes: 'Award up to 2 marks per way: point plus explanation/application to events/Expo.', commonMistakes: ['Benefits to tourists only with no event benefit.'] },
  { id: '3d', maxMarks: 6, command: 'explain', aoFocus: ['AO1', 'AO2', 'AO3'], expectedPoints: ['Increased visitor spending in accommodation, food, attractions, and retail.', 'Job creation before/during/after the event.', 'Infrastructure investment and regeneration.', 'Tax revenue and multiplier effect.', 'Destination image improvement leading to future tourism demand.'], teacherNotes: 'Award 2 marks per benefit: identification plus explanation/application to large events/Dubai.', commonMistakes: ['Social/cultural benefits only.', 'No economic explanation.'] },
  { id: '3e', maxMarks: 6, command: 'assess', aoFocus: ['AO1', 'AO2', 'AO3', 'AO4'], expectedPoints: ['Range of transport improves accessibility for different visitor needs/budgets.', 'Reduces congestion and improves visitor flow at large events.', 'Supports sustainability when public/low-carbon options are available.', 'Improves destination competitiveness and visitor satisfaction.', 'Judgement should assess relative importance and note costs/coordination.'], teacherNotes: 'Use levels; require analysis of importance, not only a list of modes.', commonMistakes: ['Listing transport types only.', 'No reference to destination/event context.', 'No assessment.'], levelGuidance: '1-2: basic points. 3-4: explained importance. 5-6: contextual assessment with supported judgement.' },
  { id: '4a', maxMarks: 2, command: 'identify', aoFocus: ['AO1', 'AO2'], expectedPoints: ['Excursions', 'Car rental/rent a car', 'Boat trips', 'Island tours', 'General tourist office/travel advice'], teacherNotes: 'Award 1 mark per service visible in the figure/signage.', commonMistakes: ['Services not supported by the image.'] },
  { id: '4b', maxMarks: 2, command: 'state', aoFocus: ['AO1'], expectedPoints: ['Communication', 'Listening', 'Patience', 'Empathy', 'Problem solving', 'Friendliness', 'Teamwork', 'Confidence'], teacherNotes: 'Award 1 mark per interpersonal skill.', commonMistakes: ['Technical skills only, e.g. computer skills.'] },
  { id: '4c', maxMarks: 4, command: 'describe', aoFocus: ['AO1', 'AO3'], expectedPoints: ['Travel agents depend on airlines/accommodation/tour operators to create products for customers.', 'Accommodation providers depend on transport operators bringing tourists to the destination.', 'Attractions depend on transport/accommodation providers and promotion to generate visits.', 'Tour operators package transport, accommodation, attractions, and ancillary services together.'], teacherNotes: 'Award up to 2 per interdependency: relationship plus descriptive detail.', commonMistakes: ['Two separate sectors listed without describing dependence.'] },
  { id: '4d', maxMarks: 6, command: 'evaluate', aoFocus: ['AO1', 'AO2', 'AO3', 'AO4'], expectedPoints: ['Meets growing demand for sustainable options.', 'Improves reputation and competitiveness.', 'Supports destination/environment/community protection.', 'May increase costs or limit product choice.', 'Judgement should weigh commercial benefits against practicality and customer demand.'], teacherNotes: 'Award via levels. Two evaluated reasons can score highly if developed and judged.', commonMistakes: ['Only listing sustainable products.', 'No evaluation of importance.'], levelGuidance: '1-2: simple reasons. 3-4: developed reasons with some evaluation. 5-6: balanced evaluation and judgement.' },
  { id: '4e', maxMarks: 6, command: 'evaluate', aoFocus: ['AO1', 'AO3', 'AO4'], expectedPoints: ['Dynamic packaging gives tourists flexibility to combine flights/accommodation/activities.', 'Can reduce price by comparing components and tailoring budget.', 'Allows personalisation and control over itinerary.', 'Can be convenient but may increase complexity or reduce protection compared with traditional packages.', 'Judgement should identify the most significant benefit and consider limitations.'], teacherNotes: 'Use levels; reward clear understanding of dynamic packaging and reasoned evaluation.', commonMistakes: ['Defining package holiday only.', 'No judgement or limitation.'], levelGuidance: '1-2: basic benefits. 3-4: explained benefits. 5-6: evaluative comparison with conclusion.' },
];
