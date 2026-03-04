export type ClanId = string;
export type ZoneId = string;

export interface ClanMetadata {
  id: ClanId;
  name: string;
  color: string;
}

// Re-export from shared utility — single source of truth for clan colors
export { getClanColor, assignSessionClanColor, getUsedSessionColors, SESSION_COLOR_PALETTE } from "../../utils/clanColors";

export interface Zone {
  id: ZoneId;
  name: string;
  baseValue: number;
}

// Default zones for the default map
export const ZONES: readonly Zone[] = [
  { id: "zone-1", name: "Server Room", baseValue: 100 },
  { id: "zone-2", name: "Mainframe", baseValue: 150 },
  { id: "zone-3", name: "Security Hub", baseValue: 120 },
  { id: "zone-4", name: "Data Vault", baseValue: 200 },
  { id: "zone-5", name: "Power Grid", baseValue: 100 },
  { id: "zone-6", name: "Network Core", baseValue: 180 },
  { id: "zone-7", name: "Quantum Nexus", baseValue: 220 },
  { id: "zone-8", name: "Signal Chamber", baseValue: 190 },
];

// City map districts
export const CITY_ZONES: readonly Zone[] = [
  { id: "zone-1", name: "1st District", baseValue: 100 },
  { id: "zone-2", name: "2nd District", baseValue: 150 },
  { id: "zone-3", name: "3rd District", baseValue: 120 },
  { id: "zone-4", name: "4th District", baseValue: 200 },
  { id: "zone-5", name: "5th District", baseValue: 100 },
  { id: "zone-6", name: "6th District", baseValue: 180 },
  { id: "zone-7", name: "7th District", baseValue: 220 },
  { id: "zone-8", name: "8th District", baseValue: 190 },
  { id: "zone-9", name: "9th District", baseValue: 160 },
  { id: "zone-10", name: "10th District", baseValue: 140 },
];

// Kyrgyzstan map regions (oblasts)
export const KYRGYZSTAN_ZONES: readonly Zone[] = [
  { id: "zone-1", name: "Batken", baseValue: 120 },
  { id: "zone-2", name: "Chuy", baseValue: 200 },
  { id: "zone-3", name: "Jalal-Abad", baseValue: 180 },
  { id: "zone-4", name: "Naryn", baseValue: 150 },
  { id: "zone-5", name: "Osh", baseValue: 190 },
  { id: "zone-6", name: "Talas", baseValue: 130 },
  { id: "zone-7", name: "Ysyk-Köl", baseValue: 160 },
];

// USA map states + DC
export const USA_ZONES: readonly Zone[] = [
  { id: "zone-1", name: "Alabama", baseValue: 150 },
  { id: "zone-2", name: "Alaska", baseValue: 150 },
  { id: "zone-3", name: "Arizona", baseValue: 150 },
  { id: "zone-4", name: "Arkansas", baseValue: 150 },
  { id: "zone-5", name: "California", baseValue: 150 },
  { id: "zone-6", name: "Colorado", baseValue: 150 },
  { id: "zone-7", name: "Connecticut", baseValue: 150 },
  { id: "zone-8", name: "District of Columbia", baseValue: 150 },
  { id: "zone-9", name: "Delaware", baseValue: 150 },
  { id: "zone-10", name: "Florida", baseValue: 150 },
  { id: "zone-11", name: "Georgia", baseValue: 150 },
  { id: "zone-12", name: "Hawaii", baseValue: 150 },
  { id: "zone-13", name: "Idaho", baseValue: 150 },
  { id: "zone-14", name: "Illinois", baseValue: 150 },
  { id: "zone-15", name: "Indiana", baseValue: 150 },
  { id: "zone-16", name: "Iowa", baseValue: 150 },
  { id: "zone-17", name: "Kansas", baseValue: 150 },
  { id: "zone-18", name: "Kentucky", baseValue: 150 },
  { id: "zone-19", name: "Louisiana", baseValue: 150 },
  { id: "zone-20", name: "Maine", baseValue: 150 },
  { id: "zone-21", name: "Maryland", baseValue: 150 },
  { id: "zone-22", name: "Massachusetts", baseValue: 150 },
  { id: "zone-23", name: "Michigan", baseValue: 150 },
  { id: "zone-24", name: "Minnesota", baseValue: 150 },
  { id: "zone-25", name: "Mississippi", baseValue: 150 },
  { id: "zone-26", name: "Missouri", baseValue: 150 },
  { id: "zone-27", name: "Montana", baseValue: 150 },
  { id: "zone-28", name: "Nebraska", baseValue: 150 },
  { id: "zone-29", name: "Nevada", baseValue: 150 },
  { id: "zone-30", name: "New Hampshire", baseValue: 150 },
  { id: "zone-31", name: "New Jersey", baseValue: 150 },
  { id: "zone-32", name: "New Mexico", baseValue: 150 },
  { id: "zone-33", name: "New York", baseValue: 150 },
  { id: "zone-34", name: "North Carolina", baseValue: 150 },
  { id: "zone-35", name: "North Dakota", baseValue: 150 },
  { id: "zone-36", name: "Ohio", baseValue: 150 },
  { id: "zone-37", name: "Oklahoma", baseValue: 150 },
  { id: "zone-38", name: "Oregon", baseValue: 150 },
  { id: "zone-39", name: "Pennsylvania", baseValue: 150 },
  { id: "zone-40", name: "Rhode Island", baseValue: 150 },
  { id: "zone-41", name: "South Carolina", baseValue: 150 },
  { id: "zone-42", name: "South Dakota", baseValue: 150 },
  { id: "zone-43", name: "Tennessee", baseValue: 150 },
  { id: "zone-44", name: "Texas", baseValue: 150 },
  { id: "zone-45", name: "Utah", baseValue: 150 },
  { id: "zone-46", name: "Vermont", baseValue: 150 },
  { id: "zone-47", name: "Virginia", baseValue: 150 },
  { id: "zone-48", name: "Washington", baseValue: 150 },
  { id: "zone-49", name: "West Virginia", baseValue: 150 },
  { id: "zone-50", name: "Wisconsin", baseValue: 150 },
  { id: "zone-51", name: "Wyoming", baseValue: 150 },
];

// United Kingdom map regions
export const UNITED_KINGDOM_ZONES: readonly Zone[] = [
  { id: "zone-1", name: "Ireland", baseValue: 150 },
  { id: "zone-2", name: "Isle of Man", baseValue: 150 },
  { id: "zone-3", name: "Jersey", baseValue: 150 },
  { id: "zone-4", name: "Guernsey", baseValue: 150 },
  { id: "zone-5", name: "Northern Ireland", baseValue: 150 },
  { id: "zone-6", name: "Scotland", baseValue: 150 },
  { id: "zone-7", name: "Wales", baseValue: 150 },
  { id: "zone-8", name: "South West", baseValue: 150 },
  { id: "zone-9", name: "South East", baseValue: 150 },
  { id: "zone-10", name: "Greater London", baseValue: 150 },
  { id: "zone-11", name: "East of England", baseValue: 150 },
  { id: "zone-12", name: "West Midlands", baseValue: 150 },
  { id: "zone-13", name: "East Midlands", baseValue: 150 },
  { id: "zone-14", name: "Yorkshire and the Humber", baseValue: 150 },
  { id: "zone-15", name: "North West", baseValue: 150 },
  { id: "zone-16", name: "North East", baseValue: 150 },
];

// ── Country maps (public/maps/*.svg) ────────────────────────────────────────

export const BAHRAIN_ZONES: readonly Zone[] = [
  { id: "zone-1", name: "Capital Governorate", baseValue: 150 },
  { id: "zone-2", name: "Southern Governorate", baseValue: 150 },
  { id: "zone-3", name: "Muharraq Governorate", baseValue: 150 },
  { id: "zone-4", name: "Central Governorate", baseValue: 150 },
  { id: "zone-5", name: "Northern Governorate", baseValue: 150 },
];

export const BELGIUM_ZONES: readonly Zone[] = [
  { id: "zone-1",  name: "Antwerp", baseValue: 150 },
  { id: "zone-2",  name: "Walloon Brabant", baseValue: 150 },
  { id: "zone-3",  name: "Brussels", baseValue: 150 },
  { id: "zone-4",  name: "Hainaut", baseValue: 150 },
  { id: "zone-5",  name: "Liège", baseValue: 150 },
  { id: "zone-6",  name: "Limburg", baseValue: 150 },
  { id: "zone-7",  name: "Luxembourg", baseValue: 150 },
  { id: "zone-8",  name: "Namur", baseValue: 150 },
  { id: "zone-9",  name: "East Flanders", baseValue: 150 },
  { id: "zone-10", name: "Flemish Brabant", baseValue: 150 },
  { id: "zone-11", name: "West Flanders", baseValue: 150 },
];

export const CHINA_ZONES: readonly Zone[] = [
  { id: "zone-1",  name: "Anhui", baseValue: 150 },
  { id: "zone-2",  name: "Beijing", baseValue: 150 },
  { id: "zone-3",  name: "Chongqing", baseValue: 150 },
  { id: "zone-4",  name: "Fujian", baseValue: 150 },
  { id: "zone-5",  name: "Guangdong", baseValue: 150 },
  { id: "zone-6",  name: "Gansu", baseValue: 150 },
  { id: "zone-7",  name: "Guangxi", baseValue: 150 },
  { id: "zone-8",  name: "Guizhou", baseValue: 150 },
  { id: "zone-9",  name: "Hainan", baseValue: 150 },
  { id: "zone-10", name: "Hebei", baseValue: 150 },
  { id: "zone-11", name: "Henan", baseValue: 150 },
  { id: "zone-12", name: "Hong Kong", baseValue: 150 },
  { id: "zone-13", name: "Heilongjiang", baseValue: 150 },
  { id: "zone-14", name: "Hunan", baseValue: 150 },
  { id: "zone-15", name: "Hubei", baseValue: 150 },
  { id: "zone-16", name: "Jilin", baseValue: 150 },
  { id: "zone-17", name: "Jiangsu", baseValue: 150 },
  { id: "zone-18", name: "Jiangxi", baseValue: 150 },
  { id: "zone-19", name: "Liaoning", baseValue: 150 },
  { id: "zone-20", name: "Macau", baseValue: 150 },
  { id: "zone-21", name: "Inner Mongolia", baseValue: 150 },
  { id: "zone-22", name: "Ningxia", baseValue: 150 },
  { id: "zone-23", name: "Qinghai", baseValue: 150 },
  { id: "zone-24", name: "Shaanxi", baseValue: 150 },
  { id: "zone-25", name: "Sichuan", baseValue: 150 },
  { id: "zone-26", name: "Shandong", baseValue: 150 },
  { id: "zone-27", name: "Shanghai", baseValue: 150 },
  { id: "zone-28", name: "Shanxi", baseValue: 150 },
  { id: "zone-29", name: "Tianjin", baseValue: 150 },
  { id: "zone-30", name: "Taiwan", baseValue: 150 },
  { id: "zone-31", name: "Xinjiang", baseValue: 150 },
  { id: "zone-32", name: "Tibet", baseValue: 150 },
  { id: "zone-33", name: "Yunnan", baseValue: 150 },
  { id: "zone-34", name: "Zhejiang", baseValue: 150 },
];

export const EGYPT_ZONES: readonly Zone[] = [
  { id: "zone-1",  name: "Alexandria", baseValue: 150 },
  { id: "zone-2",  name: "Aswan", baseValue: 150 },
  { id: "zone-3",  name: "Asyut", baseValue: 150 },
  { id: "zone-4",  name: "Red Sea", baseValue: 150 },
  { id: "zone-5",  name: "Beheira", baseValue: 150 },
  { id: "zone-6",  name: "Beni Suef", baseValue: 150 },
  { id: "zone-7",  name: "Cairo", baseValue: 150 },
  { id: "zone-8",  name: "Dakahlia", baseValue: 150 },
  { id: "zone-9",  name: "Damietta", baseValue: 150 },
  { id: "zone-10", name: "Faiyum", baseValue: 150 },
  { id: "zone-11", name: "Gharbia", baseValue: 150 },
  { id: "zone-12", name: "Giza", baseValue: 150 },
  { id: "zone-13", name: "Ismailia", baseValue: 150 },
  { id: "zone-14", name: "South Sinai", baseValue: 150 },
  { id: "zone-15", name: "Qalyubia", baseValue: 150 },
  { id: "zone-16", name: "Kafr el-Sheikh", baseValue: 150 },
  { id: "zone-17", name: "Qena", baseValue: 150 },
  { id: "zone-18", name: "Luxor", baseValue: 150 },
  { id: "zone-19", name: "Minya", baseValue: 150 },
  { id: "zone-20", name: "Monufia", baseValue: 150 },
  { id: "zone-21", name: "Matruh", baseValue: 150 },
  { id: "zone-22", name: "Port Said", baseValue: 150 },
  { id: "zone-23", name: "Sohag", baseValue: 150 },
  { id: "zone-24", name: "Sharqia", baseValue: 150 },
  { id: "zone-25", name: "North Sinai", baseValue: 150 },
  { id: "zone-26", name: "Disputed Territory", baseValue: 150 },
  { id: "zone-27", name: "Suez", baseValue: 150 },
  { id: "zone-28", name: "New Valley", baseValue: 150 },
];

export const FRANCE_ZONES: readonly Zone[] = [
  { id: "zone-1",  name: "Alsace", baseValue: 150 },
  { id: "zone-2",  name: "Aquitaine", baseValue: 150 },
  { id: "zone-3",  name: "Auvergne", baseValue: 150 },
  { id: "zone-4",  name: "Burgundy", baseValue: 150 },
  { id: "zone-5",  name: "Brittany", baseValue: 150 },
  { id: "zone-6",  name: "Centre", baseValue: 150 },
  { id: "zone-7",  name: "Champagne-Ardenne", baseValue: 150 },
  { id: "zone-8",  name: "Corsica", baseValue: 150 },
  { id: "zone-9",  name: "Franche-Comté", baseValue: 150 },
  { id: "zone-10", name: "Île-de-France", baseValue: 150 },
  { id: "zone-11", name: "Languedoc-Roussillon", baseValue: 150 },
  { id: "zone-12", name: "Limousin", baseValue: 150 },
  { id: "zone-13", name: "Lorraine", baseValue: 150 },
  { id: "zone-14", name: "Midi-Pyrénées", baseValue: 150 },
  { id: "zone-15", name: "Nord-Pas-de-Calais", baseValue: 150 },
  { id: "zone-16", name: "Basse-Normandie", baseValue: 150 },
  { id: "zone-17", name: "Haute-Normandie", baseValue: 150 },
  { id: "zone-18", name: "Pays de la Loire", baseValue: 150 },
  { id: "zone-19", name: "Picardy", baseValue: 150 },
  { id: "zone-20", name: "Poitou-Charentes", baseValue: 150 },
  { id: "zone-21", name: "Provence-Alpes-Côte d'Azur", baseValue: 150 },
  { id: "zone-22", name: "Rhône-Alpes", baseValue: 150 },
];

export const INDONESIA_ZONES: readonly Zone[] = [
  { id: "zone-1",  name: "Aceh", baseValue: 150 },
  { id: "zone-2",  name: "Bali", baseValue: 150 },
  { id: "zone-3",  name: "Bangka Belitung", baseValue: 150 },
  { id: "zone-4",  name: "Bengkulu", baseValue: 150 },
  { id: "zone-5",  name: "Banten", baseValue: 150 },
  { id: "zone-6",  name: "Gorontalo", baseValue: 150 },
  { id: "zone-7",  name: "Jambi", baseValue: 150 },
  { id: "zone-8",  name: "West Java", baseValue: 150 },
  { id: "zone-9",  name: "East Java", baseValue: 150 },
  { id: "zone-10", name: "Jakarta", baseValue: 150 },
  { id: "zone-11", name: "Central Java", baseValue: 150 },
  { id: "zone-12", name: "West Kalimantan", baseValue: 150 },
  { id: "zone-13", name: "East Kalimantan", baseValue: 150 },
  { id: "zone-14", name: "Riau Islands", baseValue: 150 },
  { id: "zone-15", name: "South Kalimantan", baseValue: 150 },
  { id: "zone-16", name: "Central Kalimantan", baseValue: 150 },
  { id: "zone-17", name: "North Kalimantan", baseValue: 150 },
  { id: "zone-18", name: "Lampung", baseValue: 150 },
  { id: "zone-19", name: "Maluku", baseValue: 150 },
  { id: "zone-20", name: "North Maluku", baseValue: 150 },
  { id: "zone-21", name: "West Nusa Tenggara", baseValue: 150 },
  { id: "zone-22", name: "East Nusa Tenggara", baseValue: 150 },
  { id: "zone-23", name: "Papua", baseValue: 150 },
  { id: "zone-24", name: "West Papua", baseValue: 150 },
  { id: "zone-25", name: "Riau", baseValue: 150 },
  { id: "zone-26", name: "North Sulawesi", baseValue: 150 },
  { id: "zone-27", name: "West Sumatra", baseValue: 150 },
  { id: "zone-28", name: "Southeast Sulawesi", baseValue: 150 },
  { id: "zone-29", name: "South Sulawesi", baseValue: 150 },
  { id: "zone-30", name: "West Sulawesi", baseValue: 150 },
  { id: "zone-31", name: "South Sumatra", baseValue: 150 },
  { id: "zone-32", name: "Central Sulawesi", baseValue: 150 },
  { id: "zone-33", name: "North Sumatra", baseValue: 150 },
  { id: "zone-34", name: "Yogyakarta", baseValue: 150 },
];

export const ITALY_ZONES: readonly Zone[] = [
  { id: "zone-1",  name: "Basilicata", baseValue: 150 },
  { id: "zone-2",  name: "Calabria", baseValue: 150 },
  { id: "zone-3",  name: "Campania", baseValue: 150 },
  { id: "zone-4",  name: "Emilia-Romagna", baseValue: 150 },
  { id: "zone-5",  name: "Friuli-Venezia Giulia", baseValue: 150 },
  { id: "zone-6",  name: "Lazio", baseValue: 150 },
  { id: "zone-7",  name: "Liguria", baseValue: 150 },
  { id: "zone-8",  name: "Lombardy", baseValue: 150 },
  { id: "zone-9",  name: "Marche", baseValue: 150 },
  { id: "zone-10", name: "Molise", baseValue: 150 },
  { id: "zone-11", name: "Piedmont", baseValue: 150 },
  { id: "zone-12", name: "Puglia", baseValue: 150 },
  { id: "zone-13", name: "Sardinia", baseValue: 150 },
  { id: "zone-14", name: "Sicily", baseValue: 150 },
  { id: "zone-15", name: "Tuscany", baseValue: 150 },
  { id: "zone-16", name: "Trentino-Alto Adige", baseValue: 150 },
  { id: "zone-17", name: "Umbria", baseValue: 150 },
  { id: "zone-18", name: "Valle d'Aosta", baseValue: 150 },
  { id: "zone-19", name: "Veneto", baseValue: 150 },
];

export const JAPAN_ZONES: readonly Zone[] = [
  { id: "zone-1",  name: "Aichi", baseValue: 150 },
  { id: "zone-2",  name: "Akita", baseValue: 150 },
  { id: "zone-3",  name: "Aomori", baseValue: 150 },
  { id: "zone-4",  name: "Chiba", baseValue: 150 },
  { id: "zone-5",  name: "Ehime", baseValue: 150 },
  { id: "zone-6",  name: "Fukui", baseValue: 150 },
  { id: "zone-7",  name: "Fukuoka", baseValue: 150 },
  { id: "zone-8",  name: "Fukushima", baseValue: 150 },
  { id: "zone-9",  name: "Gifu", baseValue: 150 },
  { id: "zone-10", name: "Gunma", baseValue: 150 },
  { id: "zone-11", name: "Hyogo", baseValue: 150 },
  { id: "zone-12", name: "Hokkaido", baseValue: 150 },
  { id: "zone-13", name: "Hiroshima", baseValue: 150 },
  { id: "zone-14", name: "Ibaraki", baseValue: 150 },
  { id: "zone-15", name: "Ishikawa", baseValue: 150 },
  { id: "zone-16", name: "Iwate", baseValue: 150 },
  { id: "zone-17", name: "Kochi", baseValue: 150 },
  { id: "zone-18", name: "Kagawa", baseValue: 150 },
  { id: "zone-19", name: "Kumamoto", baseValue: 150 },
  { id: "zone-20", name: "Kanagawa", baseValue: 150 },
  { id: "zone-21", name: "Kagoshima", baseValue: 150 },
  { id: "zone-22", name: "Kyoto", baseValue: 150 },
  { id: "zone-23", name: "Mie", baseValue: 150 },
  { id: "zone-24", name: "Miyagi", baseValue: 150 },
  { id: "zone-25", name: "Miyazaki", baseValue: 150 },
  { id: "zone-26", name: "Niigata", baseValue: 150 },
  { id: "zone-27", name: "Nagano", baseValue: 150 },
  { id: "zone-28", name: "Nara", baseValue: 150 },
  { id: "zone-29", name: "Nagasaki", baseValue: 150 },
  { id: "zone-30", name: "Okinawa", baseValue: 150 },
  { id: "zone-31", name: "Osaka", baseValue: 150 },
  { id: "zone-32", name: "Okayama", baseValue: 150 },
  { id: "zone-33", name: "Oita", baseValue: 150 },
  { id: "zone-34", name: "Saga", baseValue: 150 },
  { id: "zone-35", name: "Shiga", baseValue: 150 },
  { id: "zone-36", name: "Shimane", baseValue: 150 },
  { id: "zone-37", name: "Saitama", baseValue: 150 },
  { id: "zone-38", name: "Shizuoka", baseValue: 150 },
  { id: "zone-39", name: "Tochigi", baseValue: 150 },
  { id: "zone-40", name: "Tokyo", baseValue: 150 },
  { id: "zone-41", name: "Tokushima", baseValue: 150 },
  { id: "zone-42", name: "Tottori", baseValue: 150 },
  { id: "zone-43", name: "Toyama", baseValue: 150 },
  { id: "zone-44", name: "Wakayama", baseValue: 150 },
  { id: "zone-45", name: "Yamaguchi", baseValue: 150 },
  { id: "zone-46", name: "Yamanashi", baseValue: 150 },
  { id: "zone-47", name: "Yamagata", baseValue: 150 },
];

export const KAZAKHSTAN_ZONES: readonly Zone[] = [
  { id: "zone-1",  name: "Aqmola", baseValue: 150 },
  { id: "zone-2",  name: "Aqtöbe", baseValue: 150 },
  { id: "zone-3",  name: "Almaty Oblast", baseValue: 150 },
  { id: "zone-4",  name: "Atyrau", baseValue: 150 },
  { id: "zone-5",  name: "Qaraghandy", baseValue: 150 },
  { id: "zone-6",  name: "Qostanay", baseValue: 150 },
  { id: "zone-7",  name: "Qyzylorda", baseValue: 150 },
  { id: "zone-8",  name: "Mangystau", baseValue: 150 },
  { id: "zone-9",  name: "Pavlodar", baseValue: 150 },
  { id: "zone-10", name: "North Kazakhstan", baseValue: 150 },
  { id: "zone-11", name: "East Kazakhstan", baseValue: 150 },
  { id: "zone-12", name: "South Kazakhstan", baseValue: 150 },
  { id: "zone-13", name: "West Kazakhstan", baseValue: 150 },
  { id: "zone-14", name: "Zhambyl", baseValue: 150 },
];

export const MALAYSIA_ZONES: readonly Zone[] = [
  { id: "zone-1",  name: "Johor", baseValue: 150 },
  { id: "zone-2",  name: "Kedah", baseValue: 150 },
  { id: "zone-3",  name: "Kelantan", baseValue: 150 },
  { id: "zone-4",  name: "Melaka", baseValue: 150 },
  { id: "zone-5",  name: "Negeri Sembilan", baseValue: 150 },
  { id: "zone-6",  name: "Pahang", baseValue: 150 },
  { id: "zone-7",  name: "Penang", baseValue: 150 },
  { id: "zone-8",  name: "Perak", baseValue: 150 },
  { id: "zone-9",  name: "Perlis", baseValue: 150 },
  { id: "zone-10", name: "Selangor", baseValue: 150 },
  { id: "zone-11", name: "Terengganu", baseValue: 150 },
  { id: "zone-12", name: "Sabah", baseValue: 150 },
  { id: "zone-13", name: "Sarawak", baseValue: 150 },
  { id: "zone-14", name: "Labuan", baseValue: 150 },
];

export const NETHERLANDS_ZONES: readonly Zone[] = [
  { id: "zone-1",  name: "Drenthe", baseValue: 150 },
  { id: "zone-2",  name: "Flevoland", baseValue: 150 },
  { id: "zone-3",  name: "Friesland", baseValue: 150 },
  { id: "zone-4",  name: "Gelderland", baseValue: 150 },
  { id: "zone-5",  name: "Groningen", baseValue: 150 },
  { id: "zone-6",  name: "Limburg", baseValue: 150 },
  { id: "zone-7",  name: "Noord-Brabant", baseValue: 150 },
  { id: "zone-8",  name: "Noord-Holland", baseValue: 150 },
  { id: "zone-9",  name: "Overijssel", baseValue: 150 },
  { id: "zone-10", name: "Utrecht", baseValue: 150 },
  { id: "zone-11", name: "Zeeland", baseValue: 150 },
  { id: "zone-12", name: "Zuid-Holland", baseValue: 150 },
];

export const OMAN_ZONES: readonly Zone[] = [
  { id: "zone-1",  name: "Al Batinah North", baseValue: 150 },
  { id: "zone-2",  name: "Al Batinah South", baseValue: 150 },
  { id: "zone-3",  name: "Al Buraymi", baseValue: 150 },
  { id: "zone-4",  name: "Ad Dakhiliyah", baseValue: 150 },
  { id: "zone-5",  name: "Muscat", baseValue: 150 },
  { id: "zone-6",  name: "Musandam", baseValue: 150 },
  { id: "zone-7",  name: "Al Sharqiyah North", baseValue: 150 },
  { id: "zone-8",  name: "Al Sharqiyah South", baseValue: 150 },
  { id: "zone-9",  name: "Al Wusta", baseValue: 150 },
  { id: "zone-10", name: "Az Zahirah", baseValue: 150 },
  { id: "zone-11", name: "Dhofar", baseValue: 150 },
];

export const QATAR_ZONES: readonly Zone[] = [
  { id: "zone-1", name: "Ad Dawhah (Doha)", baseValue: 150 },
  { id: "zone-2", name: "Al Khawr", baseValue: 150 },
  { id: "zone-3", name: "Ash Shamal", baseValue: 150 },
  { id: "zone-4", name: "Ar Rayyan", baseValue: 150 },
  { id: "zone-5", name: "Umm Salal", baseValue: 150 },
  { id: "zone-6", name: "Al Wakrah", baseValue: 150 },
  { id: "zone-7", name: "Az Za'ayin", baseValue: 150 },
];

export const RUSSIA_ZONES: readonly Zone[] = [
  { id: "zone-1",  name: "Adygea", baseValue: 150 },
  { id: "zone-2",  name: "Altai Krai", baseValue: 150 },
  { id: "zone-3",  name: "Amur Oblast", baseValue: 150 },
  { id: "zone-4",  name: "Arkhangelsk Oblast", baseValue: 150 },
  { id: "zone-5",  name: "Astrakhan Oblast", baseValue: 150 },
  { id: "zone-6",  name: "Bashkortostan", baseValue: 150 },
  { id: "zone-7",  name: "Belgorod Oblast", baseValue: 150 },
  { id: "zone-8",  name: "Bryansk Oblast", baseValue: 150 },
  { id: "zone-9",  name: "Buryatia", baseValue: 150 },
  { id: "zone-10", name: "Chechnya", baseValue: 150 },
  { id: "zone-11", name: "Chelyabinsk Oblast", baseValue: 150 },
  { id: "zone-12", name: "Chukotka", baseValue: 150 },
  { id: "zone-13", name: "Chuvashia", baseValue: 150 },
  { id: "zone-14", name: "Dagestan", baseValue: 150 },
  { id: "zone-15", name: "Altai Republic", baseValue: 150 },
  { id: "zone-16", name: "Ingushetia", baseValue: 150 },
  { id: "zone-17", name: "Irkutsk Oblast", baseValue: 150 },
  { id: "zone-18", name: "Ivanovo Oblast", baseValue: 150 },
  { id: "zone-19", name: "Kabardino-Balkaria", baseValue: 150 },
  { id: "zone-20", name: "Karachay-Cherkessia", baseValue: 150 },
  { id: "zone-21", name: "Krasnodar Krai", baseValue: 150 },
  { id: "zone-22", name: "Kemerovo Oblast", baseValue: 150 },
  { id: "zone-23", name: "Kaluga Oblast", baseValue: 150 },
  { id: "zone-24", name: "Khabarovsk Krai", baseValue: 150 },
  { id: "zone-25", name: "Karelia", baseValue: 150 },
  { id: "zone-26", name: "Khakassia", baseValue: 150 },
  { id: "zone-27", name: "Kalmykia", baseValue: 150 },
  { id: "zone-28", name: "Khanty-Mansiysk", baseValue: 150 },
  { id: "zone-29", name: "Kaliningrad Oblast", baseValue: 150 },
  { id: "zone-30", name: "Komi", baseValue: 150 },
  { id: "zone-31", name: "Kamchatka Krai", baseValue: 150 },
  { id: "zone-32", name: "Kursk Oblast", baseValue: 150 },
  { id: "zone-33", name: "Kostroma Oblast", baseValue: 150 },
  { id: "zone-34", name: "Kurgan Oblast", baseValue: 150 },
  { id: "zone-35", name: "Kirov Oblast", baseValue: 150 },
  { id: "zone-36", name: "Krasnoyarsk Krai", baseValue: 150 },
  { id: "zone-37", name: "Leningrad Oblast", baseValue: 150 },
  { id: "zone-38", name: "Lipetsk Oblast", baseValue: 150 },
  { id: "zone-39", name: "Moscow City", baseValue: 150 },
  { id: "zone-40", name: "Mari El", baseValue: 150 },
  { id: "zone-41", name: "Magadan Oblast", baseValue: 150 },
  { id: "zone-42", name: "Murmansk Oblast", baseValue: 150 },
  { id: "zone-43", name: "Mordovia", baseValue: 150 },
  { id: "zone-44", name: "Moscow Oblast", baseValue: 150 },
  { id: "zone-45", name: "Novgorod Oblast", baseValue: 150 },
  { id: "zone-46", name: "Nenets", baseValue: 150 },
  { id: "zone-47", name: "North Ossetia-Alania", baseValue: 150 },
  { id: "zone-48", name: "Novosibirsk Oblast", baseValue: 150 },
  { id: "zone-49", name: "Nizhny Novgorod Oblast", baseValue: 150 },
  { id: "zone-50", name: "Orenburg Oblast", baseValue: 150 },
  { id: "zone-51", name: "Oryol Oblast", baseValue: 150 },
  { id: "zone-52", name: "Omsk Oblast", baseValue: 150 },
  { id: "zone-53", name: "Perm Krai", baseValue: 150 },
  { id: "zone-54", name: "Primorsky Krai", baseValue: 150 },
  { id: "zone-55", name: "Pskov Oblast", baseValue: 150 },
  { id: "zone-56", name: "Penza Oblast", baseValue: 150 },
  { id: "zone-57", name: "Rostov Oblast", baseValue: 150 },
  { id: "zone-58", name: "Ryazan Oblast", baseValue: 150 },
  { id: "zone-59", name: "Samara Oblast", baseValue: 150 },
  { id: "zone-60", name: "Sakha (Yakutia)", baseValue: 150 },
  { id: "zone-61", name: "Sakhalin Oblast", baseValue: 150 },
  { id: "zone-62", name: "Smolensk Oblast", baseValue: 150 },
  { id: "zone-63", name: "Saint Petersburg", baseValue: 150 },
  { id: "zone-64", name: "Saratov Oblast", baseValue: 150 },
  { id: "zone-65", name: "Stavropol Krai", baseValue: 150 },
  { id: "zone-66", name: "Sverdlovsk Oblast", baseValue: 150 },
  { id: "zone-67", name: "Tambov Oblast", baseValue: 150 },
  { id: "zone-68", name: "Tomsk Oblast", baseValue: 150 },
  { id: "zone-69", name: "Tula Oblast", baseValue: 150 },
  { id: "zone-70", name: "Tatarstan", baseValue: 150 },
  { id: "zone-71", name: "Tuva", baseValue: 150 },
  { id: "zone-72", name: "Tver Oblast", baseValue: 150 },
  { id: "zone-73", name: "Tyumen Oblast", baseValue: 150 },
  { id: "zone-74", name: "Udmurtia", baseValue: 150 },
  { id: "zone-75", name: "Ulyanovsk Oblast", baseValue: 150 },
  { id: "zone-76", name: "Volgograd Oblast", baseValue: 150 },
  { id: "zone-77", name: "Vladimir Oblast", baseValue: 150 },
  { id: "zone-78", name: "Yamalo-Nenets", baseValue: 150 },
  { id: "zone-79", name: "Vologda Oblast", baseValue: 150 },
  { id: "zone-80", name: "Voronezh Oblast", baseValue: 150 },
  { id: "zone-81", name: "Yaroslavl Oblast", baseValue: 150 },
  { id: "zone-82", name: "Jewish Autonomous Oblast", baseValue: 150 },
  { id: "zone-83", name: "Zabaykalsky Krai", baseValue: 150 },
];

export const SAUDI_ARABIA_ZONES: readonly Zone[] = [
  { id: "zone-1",  name: "Riyadh", baseValue: 150 },
  { id: "zone-2",  name: "Makkah", baseValue: 150 },
  { id: "zone-3",  name: "Madinah", baseValue: 150 },
  { id: "zone-4",  name: "Eastern Province", baseValue: 150 },
  { id: "zone-5",  name: "Al-Qassim", baseValue: 150 },
  { id: "zone-6",  name: "Ha'il", baseValue: 150 },
  { id: "zone-7",  name: "Tabuk", baseValue: 150 },
  { id: "zone-8",  name: "Northern Borders", baseValue: 150 },
  { id: "zone-9",  name: "Jizan", baseValue: 150 },
  { id: "zone-10", name: "Najran", baseValue: 150 },
  { id: "zone-11", name: "Al-Bahah", baseValue: 150 },
  { id: "zone-12", name: "Al-Jawf", baseValue: 150 },
  { id: "zone-13", name: "Asir", baseValue: 150 },
];

export const SPAIN_ZONES: readonly Zone[] = [
  { id: "zone-1",  name: "Andalusia", baseValue: 150 },
  { id: "zone-2",  name: "Aragon", baseValue: 150 },
  { id: "zone-3",  name: "Asturias", baseValue: 150 },
  { id: "zone-4",  name: "Cantabria", baseValue: 150 },
  { id: "zone-5",  name: "Castile and León", baseValue: 150 },
  { id: "zone-6",  name: "Castile-La Mancha", baseValue: 150 },
  { id: "zone-7",  name: "Canary Islands", baseValue: 150 },
  { id: "zone-8",  name: "Catalonia", baseValue: 150 },
  { id: "zone-9",  name: "Extremadura", baseValue: 150 },
  { id: "zone-10", name: "Galicia", baseValue: 150 },
  { id: "zone-11", name: "La Rioja", baseValue: 150 },
  { id: "zone-12", name: "Madrid", baseValue: 150 },
  { id: "zone-13", name: "Murcia", baseValue: 150 },
  { id: "zone-14", name: "Navarre", baseValue: 150 },
  { id: "zone-15", name: "Balearic Islands", baseValue: 150 },
  { id: "zone-16", name: "Basque Country", baseValue: 150 },
  { id: "zone-17", name: "Valencia", baseValue: 150 },
];

// Map-specific zone configurations
export const MAP_ZONES: Readonly<Record<string, readonly Zone[]>> = {
  default: ZONES,
  city: CITY_ZONES,
  kyrgyzstan: KYRGYZSTAN_ZONES,
  usa: USA_ZONES,
  unitedkingdom: UNITED_KINGDOM_ZONES,
  // Country maps
  bahrain: BAHRAIN_ZONES,
  belgium: BELGIUM_ZONES,
  china: CHINA_ZONES,
  egypt: EGYPT_ZONES,
  france: FRANCE_ZONES,
  indonesia: INDONESIA_ZONES,
  italy: ITALY_ZONES,
  japan: JAPAN_ZONES,
  kazakhstan: KAZAKHSTAN_ZONES,
  malaysia: MALAYSIA_ZONES,
  netherlands: NETHERLANDS_ZONES,
  oman: OMAN_ZONES,
  qatar: QATAR_ZONES,
  russia: RUSSIA_ZONES,
  "saudi-arabia": SAUDI_ARABIA_ZONES,
  spain: SPAIN_ZONES,
};

// Helper to get zones for a specific map
export const getZonesForMap = (mapId: string = 'default'): readonly Zone[] => {
  return MAP_ZONES[mapId] || ZONES;
};

export const CONFIG = {
  TOTAL_COIN_LOOT: 100000,
  TOTAL_XP_LOOT: 5000,
  TOTAL_GEM_LOOT: 5,
  MAX_COINS_PER_PLAYER: 20000,
  MAX_XP_PER_PLAYER: 1000,
  MAX_GEMS_PER_PLAYER: 1,
  GEM_ELIGIBILITY_MIN_QUESTIONS: 5,
  GEM_ELIGIBILITY_MIN_ACCURACY: 0.5,
  STREAK_BONUS_THRESHOLD: 3,
  STREAK_BONUS_POINTS: 1,
  FAST_ANSWER_THRESHOLD_MS: 5000,
  FAST_ANSWER_BONUS: 1,
  BASE_CORRECT_POINTS: 1,
  WRONG_ANSWER_PENALTY: 1, // Points deducted from battle score for wrong answers
  WRONG_ANSWER_INFLUENCE_PENALTY_PERCENT: 0.1, // Percentage of current zone capture removed on wrong answers
  MIN_CONTRIBUTION_SCORE: 1,
  INFLUENCE_PER_POINT: 10,
};

export type GamePhase = "LOBBY" | "ACTIVE" | "ENDED";

export interface PlayerStats {
  id: string;
  name: string;
  clanId: ClanId;
  clanName: string;
  questionsAnswered: number;
  questionsCorrect: number;
  totalAnswerTimeMs: number;
  fastAnswers: number;
  streak: number;
  bestStreak: number;
  battleScore: number;
  selectedZoneId: ZoneId | null;
}

export interface ZoneState {
  id: ZoneId;
  influence: Record<ClanId, number>; // ClanId -> Influence points
}

export interface BattleQuestionOption {
  text: string;
  image_url?: string;
}

export interface BattleQuestion {
  id: string;
  question_text: string;
  correct_answer: string;
  options?: (string | BattleQuestionOption)[]; // For multiple choice questions - can be strings or objects with images
  wrong_answers?: string[]; // Fallback for legacy format
  subject?: string;
  topic?: string;
  difficulty?: string;
  question_type?: string;
  image_url?: string; // Optional question image
}

export interface ClanTerritoryGameState {
  phase: GamePhase;
  timer: number; // Remaining seconds (computed from gameEndTime - now)
  gameStartTime?: number; // Unix timestamp when game started
  gameEndTime?: number; // Unix timestamp when game should end
  endReason?: "TIME_UP" | "TEACHER_ENDED" | "TEACHER_DISMISSED";
  players: Record<string, PlayerStats>;
  zones: Record<ZoneId, ZoneState>;
  clans: Record<ClanId, ClanMetadata>;
  questions: BattleQuestion[];
  mapId?: string;
  allowClanlessPlayers: boolean;
  allowedClanIds?: string[]; // If set, only players from these clans can join
}

// Actions
export type GameAction =
  | {
      type: "JOIN";
      payload: {
        player: { id: string; name: string; clanId: ClanId; clanName: string; clanColor?: string };
      };
    }
  | { type: "SET_QUESTIONS"; payload: { questions: BattleQuestion[] } }
  | { type: "SET_MAP"; payload: { mapId: string } }
  | { type: "SET_ALLOW_CLANLESS"; payload: { allow: boolean } }
  | { type: "SET_ALLOWED_CLANS"; payload: { clanIds: string[] } }
  | { type: "SET_DURATION"; payload: { duration: number } }
  | { type: "START_GAME"; payload: { duration: number } }
  | { type: "TICK" }
  | { type: "SELECT_ZONE"; payload: { playerId: string; zoneId: ZoneId | null } }
  | {
      type: "SUBMIT_ANSWER";
      payload: { playerId: string; isCorrect: boolean; durationMs: number };
    }
  | { type: "END_GAME" }
  | { type: "DISMISS_ARENA" }
  | { type: "KICK_PLAYER"; payload: { playerId: string } }
  | { type: "REQUEST_STATE" };

export interface ClanTerritoryResults {
  winningClanId: ClanId | null;
  zoneControl: Record<ZoneId, ClanId | null>;
  clanScores: Record<ClanId, number>;
  playerRewards: PlayerReward[];
}

export interface PlayerReward {
  playerId: string;
  clanId: ClanId;
  clanName: string;
  coins: number;
  xp: number;
  gems: number;
  battleScore: number;
  questionsAnswered: number;
  questionsCorrect: number;
  accuracy: number;
}
