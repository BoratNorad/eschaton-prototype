// Country (ISO 3166 numeric, as used by world-atlas) -> coalition + yields.
// Format: id: [coalition, ind, ura, inf, hp]  (yields per turn at full health)
// Countries not listed are NON-ALIGNED (grey, cannot be targeted).
// Missing yields fall back to CONFIG.defaultYield.

const T = {
  // ---- AMNAT ----
  '840': ['AMNAT', 8, 3, 4, 260], '124': ['AMNAT', 3, 3, 1, 120], '304': ['AMNAT', 0, 0, 0, 30],
  '826': ['AMNAT', 4, 0, 3, 120], '250': ['AMNAT', 4, 1, 3, 120], '276': ['AMNAT', 5, 0, 2, 130],
  '380': ['AMNAT', 3, 0, 1, 100], '724': ['AMNAT', 2, 0, 1, 80],  '620': ['AMNAT'],
  '056': ['AMNAT'], '528': ['AMNAT', 2, 0, 1, 50], '442': ['AMNAT'], '208': ['AMNAT'],
  '578': ['AMNAT'], '352': ['AMNAT', 0, 0, 1, 25], '300': ['AMNAT'], '792': ['AMNAT', 2, 0, 1, 80],
  '392': ['AMNAT', 5, 0, 2, 120], '410': ['AMNAT', 2, 0, 1, 70], '036': ['AMNAT', 2, 3, 1, 90],
  '554': ['AMNAT'], '376': ['AMNAT', 1, 0, 2, 50], '158': ['AMNAT', 2, 0, 1, 50],
  '608': ['AMNAT'], '630': ['AMNAT', 0, 0, 1, 25], '238': ['AMNAT', 0, 0, 0, 15],

  // ---- SOVWAR ----
  '643': ['SOVWAR', 7, 3, 4, 280], '804': ['SOVWAR', 3, 1, 1, 110], '112': ['SOVWAR'],
  '398': ['SOVWAR', 1, 3, 0, 80], '860': ['SOVWAR', 1, 2, 0, 60], '795': ['SOVWAR'],
  '762': ['SOVWAR'], '417': ['SOVWAR'], '051': ['SOVWAR'], '031': ['SOVWAR'], '268': ['SOVWAR'],
  '440': ['SOVWAR'], '428': ['SOVWAR'], '233': ['SOVWAR'], '498': ['SOVWAR'],
  '616': ['SOVWAR', 2, 0, 1, 80], '203': ['SOVWAR', 2, 1, 1, 60], '703': ['SOVWAR'],
  '348': ['SOVWAR'], '642': ['SOVWAR'], '100': ['SOVWAR'], '496': ['SOVWAR', 0, 1, 0, 50],
  '004': ['SOVWAR', 0, 0, 0, 50], '704': ['SOVWAR', 1, 0, 1, 60], '418': ['SOVWAR'],

  // ---- REDCHI ----
  '156': ['REDCHI', 9, 3, 4, 300], '408': ['REDCHI', 1, 1, 1, 60], '116': ['REDCHI'],
  '008': ['REDCHI'], '104': ['REDCHI'],

  // ---- INDPAK ----
  '356': ['INDPAK', 6, 1, 4, 220], '586': ['INDPAK', 2, 1, 2, 110], '050': ['INDPAK', 1, 0, 1, 60],
  '524': ['INDPAK'], '064': ['INDPAK'], '144': ['INDPAK'],

  // ---- IRLIBSYR ----
  '364': ['IRLIBSYR', 3, 1, 2, 120], '434': ['IRLIBSYR', 2, 0, 1, 70], '760': ['IRLIBSYR', 1, 0, 2, 70],
  '368': ['IRLIBSYR', 2, 0, 1, 80], '422': ['IRLIBSYR'], '887': ['IRLIBSYR'], '012': ['IRLIBSYR', 2, 0, 1, 70],

  // ---- SOUTHAF ----
  '710': ['SOUTHAF', 4, 4, 2, 130], '516': ['SOUTHAF', 0, 3, 0, 50], '072': ['SOUTHAF', 1, 1, 0, 40],
  '426': ['SOUTHAF'], '748': ['SOUTHAF'], '716': ['SOUTHAF', 1, 0, 1, 50], '024': ['SOUTHAF', 1, 0, 1, 60],
  '894': ['SOUTHAF', 1, 1, 0, 50], '454': ['SOUTHAF'], '508': ['SOUTHAF'], '450': ['SOUTHAF'],

  // ---- LATAM ----
  '192': ['LATAM', 1, 0, 3, 60], '484': ['LATAM', 3, 0, 2, 120], '076': ['LATAM', 4, 2, 2, 160],
  '032': ['LATAM', 2, 2, 1, 100], '152': ['LATAM', 1, 0, 1, 60], '604': ['LATAM'], '170': ['LATAM', 1, 0, 1, 60],
  '862': ['LATAM', 2, 0, 1, 70], '068': ['LATAM'], '600': ['LATAM'], '858': ['LATAM'], '218': ['LATAM'],
  '558': ['LATAM'], '320': ['LATAM'], '340': ['LATAM'], '222': ['LATAM'], '188': ['LATAM'], '591': ['LATAM'],
  '328': ['LATAM'], '740': ['LATAM'], '332': ['LATAM'], '214': ['LATAM'], '388': ['LATAM'], '084': ['LATAM'],
  '780': ['LATAM'], '044': ['LATAM'],
};

module.exports = T;
