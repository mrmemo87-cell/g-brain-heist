import type { ZoneId } from "./clanTerritoryTypes";

export type NeonMegacityTerritory = {
  id: number;
  zoneId: ZoneId;
  key: string;
  name: string;
  type: string;
  points: readonly (readonly [number, number])[];
  labelAnchor: readonly [number, number];
  badgeAnchor: readonly [number, number];
  pulseCenter: readonly [number, number];
};

export const NEON_MEGACITY_WIDTH = 1672;
export const NEON_MEGACITY_HEIGHT = 941;

export const NEON_MEGACITY_TERRITORIES: readonly NeonMegacityTerritory[] = [
  { id: 1, zoneId: "zone-1", key: "district_1", name: "Sky Tower", type: "Uplink", points: [[166,241],[254,99],[361,56],[364,4],[509,3],[524,184],[521,224],[508,295],[477,306],[266,287],[227,284],[205,273],[176,270]], labelAnchor: [220,240], badgeAnchor: [220,202], pulseCenter: [226,246] },
  { id: 2, zoneId: "zone-2", key: "district_2", name: "Quantum Market", type: "Trade Grid", points: [[545,200],[538,144],[680,115],[811,114],[843,155],[841,268],[811,298],[741,319],[677,321],[620,326],[581,327],[554,325],[525,318],[534,231]], labelAnchor: [575,250], badgeAnchor: [575,208], pulseCenter: [579,256] },
  { id: 3, zoneId: "zone-3", key: "district_3", name: "Data Arc", type: "Archive", points: [[862,193],[861,158],[889,101],[988,7],[1049,10],[1168,146],[1151,296],[1129,316],[1031,318],[918,327],[865,302],[864,273],[860,237],[858,219]], labelAnchor: [955,250], badgeAnchor: [955,210], pulseCenter: [960,257] },
  { id: 4, zoneId: "zone-4", key: "district_4", name: "Neon Port", type: "Logistics", points: [[1182,145],[1182,20],[1391,11],[1665,4],[1667,206],[1671,356],[1578,351],[1526,337],[1443,335],[1366,349],[1308,344],[1217,339],[1170,304],[1165,229]], labelAnchor: [1355,270], badgeAnchor: [1355,228], pulseCenter: [1361,277] },
  { id: 5, zoneId: "zone-5", key: "district_5", name: "Undergrid", type: "Sublevel", points: [[21,299],[137,161],[174,281],[412,321],[492,373],[467,422],[430,523],[411,539],[311,564],[206,593],[136,610],[69,628],[36,566],[27,484],[10,381]], labelAnchor: [220,476], badgeAnchor: [220,435], pulseCenter: [226,482] },
  { id: 6, zoneId: "zone-6", key: "district_6", name: "Omega Reactor", type: "Power Core", points: [[522,354],[550,346],[650,341],[795,341],[857,372],[889,474],[845,533],[805,592],[703,594],[609,561],[556,542],[502,517],[482,498],[491,456],[505,411]], labelAnchor: [610,470], badgeAnchor: [610,430], pulseCenter: [609,474] },
  { id: 7, zoneId: "zone-7", key: "district_7", name: "Cipher Vault", type: "Secure Node", points: [[897,395],[914,361],[1012,339],[1167,334],[1188,386],[1223,409],[1248,423],[1263,533],[1145,592],[1077,614],[1020,590],[954,556],[930,532],[884,514],[909,479]], labelAnchor: [995,515], badgeAnchor: [995,474], pulseCenter: [994,519] },
  { id: 8, zoneId: "zone-8", key: "district_8", name: "Void Nexus", type: "Signal Hub", points: [[1241,406],[1278,363],[1420,351],[1519,349],[1656,370],[1670,538],[1668,825],[1574,795],[1515,759],[1394,710],[1304,645],[1280,569],[1278,527],[1269,477],[1259,417]], labelAnchor: [1386,530], badgeAnchor: [1386,490], pulseCenter: [1390,535] },
  { id: 9, zoneId: "zone-9", key: "district_9", name: "Ghostline", type: "Transit", points: [[102,674],[181,623],[243,603],[475,542],[694,621],[769,655],[746,756],[757,843],[771,937],[420,938],[217,940],[13,940],[2,867],[9,797],[8,714]], labelAnchor: [300,765], badgeAnchor: [300,724], pulseCenter: [305,770] },
  { id: 10, zoneId: "zone-10", key: "district_10", name: "Citadel", type: "Command", points: [[787,623],[919,608],[1065,605],[1230,596],[1306,662],[1362,726],[1509,787],[1543,809],[1438,940],[1160,940],[1040,940],[914,936],[785,940],[776,820],[760,747]], labelAnchor: [1080,775], badgeAnchor: [1080,735], pulseCenter: [1084,780] },
] as const;

export const NEON_MEGACITY_BY_ZONE = Object.fromEntries(
  NEON_MEGACITY_TERRITORIES.map((territory) => [territory.zoneId, territory])
) as Record<ZoneId, NeonMegacityTerritory>;
