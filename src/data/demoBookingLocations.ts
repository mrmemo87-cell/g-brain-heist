const ISO_COUNTRY_CODES = `AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CD CG CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW`
  .trim()
  .split(/\s+/);

export interface DemoCountryOption {
  code: string;
  name: string;
}

export const getDemoCountryOptions = (locale = 'en'): DemoCountryOption[] => {
  const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
  return ISO_COUNTRY_CODES
    .map((code) => ({ code, name: displayNames.of(code) ?? code }))
    .filter((country, index, countries) => countries.findIndex((item) => item.name === country.name) === index)
    .sort((left, right) => left.name.localeCompare(right.name, locale));
};

export const DEMO_CITY_SUGGESTIONS: Record<string, string[]> = {
  Australia: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra'],
  Bahrain: ['Manama', 'Riffa', 'Muharraq', 'Isa Town'],
  Belgium: ['Brussels', 'Antwerp', 'Ghent', 'Liège'],
  Canada: ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa'],
  China: ['Beijing', 'Shanghai', 'Guangzhou', 'Shenzhen', 'Chengdu'],
  Egypt: ['Cairo', 'Alexandria', 'Giza', 'New Cairo', 'Mansoura', 'Hurghada'],
  France: ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice'],
  Germany: ['Berlin', 'Munich', 'Frankfurt', 'Hamburg', 'Cologne'],
  India: ['Delhi', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune'],
  Indonesia: ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Bali'],
  Italy: ['Rome', 'Milan', 'Naples', 'Turin', 'Florence'],
  Japan: ['Tokyo', 'Osaka', 'Kyoto', 'Yokohama', 'Nagoya'],
  Jordan: ['Amman', 'Zarqa', 'Irbid', 'Aqaba'],
  Kazakhstan: ['Almaty', 'Astana', 'Shymkent', 'Karaganda', 'Aktobe'],
  Kuwait: ['Kuwait City', 'Hawally', 'Salmiya', 'Al Ahmadi'],
  Kyrgyzstan: ['Bishkek', 'Osh', 'Jalal-Abad', 'Karakol', 'Tokmok'],
  Malaysia: ['Kuala Lumpur', 'Johor Bahru', 'Penang', 'Shah Alam', 'Kota Kinabalu'],
  Netherlands: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven'],
  Oman: ['Muscat', 'Salalah', 'Sohar', 'Nizwa'],
  Pakistan: ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad'],
  Qatar: ['Doha', 'Al Rayyan', 'Al Wakrah', 'Lusail'],
  Russia: ['Moscow', 'Saint Petersburg', 'Kazan', 'Novosibirsk', 'Yekaterinburg'],
  'Saudi Arabia': ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar'],
  Singapore: ['Singapore'],
  'South Korea': ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon'],
  Spain: ['Madrid', 'Barcelona', 'Valencia', 'Seville', 'Málaga'],
  Thailand: ['Bangkok', 'Chiang Mai', 'Phuket', 'Pattaya', 'Khon Kaen'],
  Turkey: ['Istanbul', 'Ankara', 'Izmir', 'Bursa', 'Antalya'],
  'United Arab Emirates': ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Al Ain'],
  'United Kingdom': ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Edinburgh'],
  'United States': ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Miami', 'Washington'],
  Uzbekistan: ['Tashkent', 'Samarkand', 'Bukhara', 'Namangan', 'Andijan'],
};
