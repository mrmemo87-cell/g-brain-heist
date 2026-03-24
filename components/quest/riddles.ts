/**
 * Funny / silly riddle bank for elite_question nodes in Quest Mode.
 * These are brain-teasers, puns, and trick questions — NOT academic questions.
 */

export interface FunnyRiddle {
  question: string;
  options: string[];
  correct: string;
  explanation: string;
}

const RIDDLES: FunnyRiddle[] = [
  {
    question: "What has keys but can't open locks?",
    options: ["A piano", "A locksmith", "A monkey", "A keyboard store"],
    correct: "A piano",
    explanation: "A piano has 88 keys and zero ability to open your front door 🎹",
  },
  {
    question: "What gets wetter the more it dries?",
    options: ["A sponge", "A towel", "Rain", "My grades"],
    correct: "A towel",
    explanation: "A towel gets wetter every time it dries something. Mind = blown 🤯",
  },
  {
    question: "What has a head and a tail but no body?",
    options: ["A snake", "A coin", "My homework", "A ghost worm"],
    correct: "A coin",
    explanation: "Heads or tails? Either way it's broke like me 🪙",
  },
  {
    question: "What can you catch but not throw?",
    options: ["A football", "A cold", "A Pokémon", "Feelings"],
    correct: "A cold",
    explanation: "Nobody's throwing colds around... wait, actually some people do sneeze everywhere 🤧",
  },
  {
    question: "I speak without a mouth and hear without ears. What am I?",
    options: ["A ghost", "An echo", "My teacher", "WiFi"],
    correct: "An echo",
    explanation: "Echo echo echo... see what I did there? 🗣️",
  },
  {
    question: "What has hands but can't clap?",
    options: ["A clock", "A statue", "A T-Rex", "My little brother"],
    correct: "A clock",
    explanation: "Clock hands are always busy going in circles. Relatable honestly ⏰",
  },
  {
    question: "If you drop me I'm sure to crack, but give me a smile and I'll always smile back. What am I?",
    options: ["An egg", "A mirror", "Your phone screen", "My confidence"],
    correct: "A mirror",
    explanation: "Mirrors never lie... unfortunately 🪞",
  },
  {
    question: "What building has the most stories?",
    options: ["A skyscraper", "A library", "School", "My grandma's house"],
    correct: "A library",
    explanation: "Libraries are literally FULL of stories. Ba dum tss 📚",
  },
  {
    question: "What has legs but doesn't walk?",
    options: ["A table", "A lazy dog", "My dad after lunch", "Pants"],
    correct: "A table",
    explanation: "Four legs, zero steps. Tables are the ultimate couch potatoes 🪑",
  },
  {
    question: "What goes up but never comes down?",
    options: ["A balloon", "Your age", "A rocket", "My stress levels"],
    correct: "Your age",
    explanation: "Happy birthday! You're older now and there's no undo button 🎂",
  },
  {
    question: "What has teeth but cannot bite?",
    options: ["A comb", "A baby shark", "A zombie grandma", "A zipper"],
    correct: "A comb",
    explanation: "Combs are all teeth, zero bite. The ultimate pacifist 💇",
  },
  {
    question: "What can travel around the world while staying in a corner?",
    options: ["A spider", "A stamp", "WiFi signal", "A lazy cat"],
    correct: "A stamp",
    explanation: "Stamps go EVERYWHERE but never leave the corner of the envelope. Living the dream 📮",
  },
  {
    question: "What has a neck but no head?",
    options: ["A bottle", "A giraffe baby", "A guitar", "My shirt"],
    correct: "A bottle",
    explanation: "Bottles are all neck. The supermodels of the kitchen 🍶",
  },
  {
    question: "What invention lets you look right through a wall?",
    options: ["X-ray glasses", "A window", "Superman's eyes", "A drill"],
    correct: "A window",
    explanation: "Windows: the original see-through technology since forever 🪟",
  },
  {
    question: "I can be cracked, made, told, and played. What am I?",
    options: ["A joke", "An egg", "A rule", "A video game"],
    correct: "A joke",
    explanation: "Jokes are multi-talented: cracked up, made up, told off, and played out 😂",
  },
  {
    question: "What has one eye but cannot see?",
    options: ["A pirate", "A needle", "A cyclops", "My webcam"],
    correct: "A needle",
    explanation: "The eye of a needle sees nothing. It just pokes stuff 🪡",
  },
  {
    question: "What starts with 'e' and ends with 'e' but only has one letter in it?",
    options: ["The word 'eye'", "An envelope", "The letter E", "Email"],
    correct: "An envelope",
    explanation: "An envelope literally has a letter inside it. English is a troll language 📩",
  },
  {
    question: "What can you hold in your right hand but NEVER in your left hand?",
    options: ["A right-handed glove", "Your left elbow", "A righty pen", "Your right hand"],
    correct: "Your left elbow",
    explanation: "Try it. Go ahead. I'll wait. You can't do it 💪",
  },
  {
    question: "A rooster sitting on top of a barn roof lays an egg. Which way does it roll?",
    options: ["Left", "Right", "It doesn't — roosters don't lay eggs!", "Down the chimney"],
    correct: "It doesn't — roosters don't lay eggs!",
    explanation: "Roosters are boys. Biology strikes again 🐓",
  },
  {
    question: "What word becomes shorter when you add two letters to it?",
    options: ["Long", "Short", "Small", "Tiny"],
    correct: "Short",
    explanation: "'Short' + 'er' = 'Shorter'. Language is a beautiful mess 📝",
  },
  {
    question: "How many months have 28 days?",
    options: ["1 (February)", "All 12 of them", "Only leap years", "None"],
    correct: "All 12 of them",
    explanation: "EVERY month has at least 28 days. Gotcha! 📅",
  },
  {
    question: "If there are 3 apples and you take away 2, how many apples do YOU have?",
    options: ["1", "2", "3", "0"],
    correct: "2",
    explanation: "YOU took 2 apples. So YOU have 2. Pay attention to the question! 🍎",
  },
  {
    question: "What can run but never walks, has a mouth but never talks?",
    options: ["A cheetah", "A river", "A blender", "My classmate during exams"],
    correct: "A river",
    explanation: "Rivers run and have mouths. Geography just got philosophical 🌊",
  },
  {
    question: "What two things can you never eat for breakfast?",
    options: ["Cereal and milk", "Lunch and dinner", "Eggs and bacon", "Pizza and ice cream"],
    correct: "Lunch and dinner",
    explanation: "Because if it's breakfast time, it's NOT lunch or dinner. Big brain time 🧠",
  },
  {
    question: "What kind of room has no doors or windows?",
    options: ["A mushroom", "A prison", "A classroom", "A dark room"],
    correct: "A mushroom",
    explanation: "A mush-ROOM. It's literally in the name. Fungi are hilarious 🍄",
  },
  {
    question: "What goes through towns and over hills but never moves?",
    options: ["A car", "A road", "Wind", "A very lazy snail"],
    correct: "A road",
    explanation: "Roads go everywhere but they just... sit there. Ultimate laziness goals 🛣️",
  },
  {
    question: "A truck driver goes the wrong way down a one-way street. He passes 4 police officers. None of them stop him. Why?",
    options: ["He's invisible", "He was walking", "The police were sleeping", "He bribed them"],
    correct: "He was walking",
    explanation: "He's a truck DRIVER, not a truck. He was on foot. Sneaky! 🚶",
  },
  {
    question: "What has 4 wheels and flies?",
    options: ["A helicopter car", "A garbage truck", "A flying bus", "A magic carpet with wheels"],
    correct: "A garbage truck",
    explanation: "Garbage trucks have flies buzzing around them. Gross but correct 🗑️",
  },
  {
    question: "What is so fragile that saying its name breaks it?",
    options: ["Glass", "Silence", "A promise", "My will to study"],
    correct: "Silence",
    explanation: "The moment you say 'silence', it's gone. Poof! 🤫",
  },
  {
    question: "If you're running in a race and you pass the person in 2nd place, what place are you in?",
    options: ["1st place", "2nd place", "3rd place", "Doesn't matter, I'm tired"],
    correct: "2nd place",
    explanation: "You passed 2nd place, so you ARE 2nd place now. Not 1st! 🏃",
  },
];

/** Pick a random funny riddle (non-repeating within a session) */
const usedIndices = new Set<number>();

export function getRandomRiddle(): FunnyRiddle {
  // Reset if all used
  if (usedIndices.size >= RIDDLES.length) {
    usedIndices.clear();
  }

  let idx: number;
  do {
    idx = Math.floor(Math.random() * RIDDLES.length);
  } while (usedIndices.has(idx));

  usedIndices.add(idx);
  return RIDDLES[idx];
}

export function resetRiddlePool(): void {
  usedIndices.clear();
}
