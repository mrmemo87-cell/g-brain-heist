/**
 * Intel Room: one line of "field intel" per territory, shown while students explore
 * the next map during the sealed weekend. Short, true, and useful in an English lesson.
 */

export const TERRITORY_INTEL: Record<string, Record<string, string>> = {
  kyrgyzstan: {
    'zone-2': 'Home of Bishkek, the capital. Most people, most points.',
    'zone-5': 'Osh is over 3,000 years old — older than Rome.',
    'zone-3': 'Walnut forests of Arslanbob: the largest on Earth.',
    'zone-7': 'Issyk-Kul: a lake so big it never freezes.',
    'zone-4': 'Son-Kul pastures sit at 3,000 m — yurts and horses in summer.',
    'zone-6': 'Birthplace of the hero Manas, according to the epic.',
    'zone-1': 'The Fergana Valley border — apricots and sunshine.',
  },
  unitedkingdom: {
    'zone-10': 'Nearly 9 million people and 300 languages spoken daily.',
    'zone-9': 'Dover’s white cliffs: the first thing sailors see from France.',
    'zone-6': 'Edinburgh, Highlands, and the word "loch" for lake.',
    'zone-15': 'Manchester and Liverpool: football, music, and the first railway.',
    'zone-14': 'Yorkshire pudding is eaten with roast beef, not for dessert.',
    'zone-12': 'Birmingham has more canals than Venice.',
    'zone-11': 'Cambridge University is here — founded in 1209.',
    'zone-8': 'Stonehenge: 5,000-year-old stones nobody fully explains.',
    'zone-13': 'Robin Hood’s Sherwood Forest, Nottingham.',
    'zone-7': 'Welsh is still spoken here — "Croeso" means welcome.',
    'zone-16': 'Hadrian’s Wall marked the edge of the Roman Empire.',
    'zone-5': 'Giant’s Causeway: 40,000 natural stone columns.',
  },
  kazakhstan: {
    'zone-3': 'Almaty means "place of apples" — apples come from here.',
    'zone-5': 'Qaraghandy: coal, steel, and the first Soviet cosmodrome link.',
    'zone-11': 'Altai Mountains and Lake Markakol in the far east.',
    'zone-12': 'Turkistan’s mausoleum is a UNESCO World Heritage site.',
    'zone-1': 'Surrounds Astana, the capital built on the steppe.',
    'zone-4': 'Where the Ural River meets the Caspian Sea.',
    'zone-8': 'Aktau: a city with streets named by numbers, not names.',
    'zone-9': 'Pavlodar sits on the Irtysh, one of Asia’s longest rivers.',
  },
  japan: {
    'zone-40': 'The biggest city on Earth: 37 million in the metro area.',
    'zone-31': 'Osaka is Japan’s kitchen — takoyaki and okonomiyaki.',
    'zone-22': 'Kyoto was the capital for 1,000 years; 1,600 temples.',
    'zone-12': 'Hokkaido: snow festivals and Japan’s best skiing.',
    'zone-20': 'Yokohama, Japan’s second city, and the Great Buddha of Kamakura.',
    'zone-13': 'Hiroshima’s Peace Memorial and the floating torii of Miyajima.',
    'zone-30': 'Okinawa: subtropical islands where people live the longest.',
    'zone-27': 'Nagano hosted the 1998 Winter Olympics — and has snow monkeys.',
  },
  egypt: {
    'zone-7': 'Cairo: the Nile, the pyramids next door, 20 million people.',
    'zone-12': 'The Great Pyramid stood as the tallest building for 3,800 years.',
    'zone-1': 'Alexandria once held the greatest library of the ancient world.',
    'zone-18': 'Luxor: Valley of the Kings and the tomb of Tutankhamun.',
    'zone-2': 'Aswan’s dam created Lake Nasser, 500 km long.',
    'zone-4': 'Coral reefs of Hurghada — some of the clearest water anywhere.',
    'zone-14': 'Mount Sinai and the Blue Hole of Dahab.',
    'zone-22': 'Port Said guards the entrance to the Suez Canal.',
  },
  usa: {
    'zone-5': 'California alone would be the world’s 5th largest economy.',
    'zone-44': 'Texas: bigger than France, and it was once its own country.',
    'zone-33': 'New York City: the Statue of Liberty was a gift from France.',
    'zone-10': 'Florida launches rockets from Cape Canaveral.',
    'zone-14': 'Chicago, Illinois built the world’s first skyscraper in 1885.',
    'zone-48': 'Washington state: home of Boeing, Amazon, and Mount Rainier.',
    'zone-6': 'Colorado has 58 mountains above 4,000 m.',
    'zone-11': 'Georgia: peaches, Atlanta, and the birthplace of Coca-Cola.',
    'zone-3': 'The Grand Canyon is 446 km long and 1.8 km deep.',
    'zone-2': 'Alaska is the biggest state — bought from Russia in 1867.',
  },
};

export const territoryIntel = (mapId: string, zoneId: string): string | null => TERRITORY_INTEL[mapId]?.[zoneId] ?? null;

/** The rules, in the order a student should read them. English message ids. */
export const CONQUEST_RULES = [
  'Monday to Friday, every daily mission you finish adds power to your class.',
  'Power each day = the share of your class that finished — a small class can beat a big one.',
  'Territories are shared out by power. The strongest class holds the most valuable ones.',
  'Friday 23:59 the vault seals. Nobody sees the final scores until Monday 07:00.',
  'On the weekend: predict the winner, raid rival classes, cheer on the Hype Wall.',
  'Monday: the winning class gets badges, its top five get heist roles and certificates.',
] as const;
