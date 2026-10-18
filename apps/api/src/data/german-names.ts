/**
 * Německá chlapecká jména podle dekády narození pro hráče z německého okresu (Freyung-Grafenau).
 * Zdroj: beliebte-vornamen.de, nejoblíbenější jména ročníků 1960, 1965 … 2015 (staženo 2026-10-18),
 * váha podle pořadí v ročníku (1000 / (pořadí + 3)), ročníky dekády sečtené. Pořadí je celoněmecké,
 * bavorská tradiční jména (Josef, Johann, Franz) v něm u starších ročníků chybí.
 */
export const GERMAN_FIRSTNAMES: Record<string, Record<string, number>> = {
  "1960s": {
    "Thomas": 666, "Michael": 500, "Andreas": 400, "Frank": 286, "Stefan": 267, "Peter": 244, "Jörg": 194, "Torsten": 178, "Ralf": 177, "Uwe": 165, "Klaus": 154, "Jürgen": 147, "Matthias": 131, "Christian": 120, "Martin": 118, "Jens": 115, "Bernd": 110, "Dirk": 109, "Wolfgang": 103, "Holger": 103, "Hans": 102, "Rainer": 96, "Karsten": 95, "Joachim": 71, "Volker": 71, "Olaf": 67, "Kai": 64, "Axel": 61, "Sven": 59, "Oliver": 45, "Markus": 42, "Dieter": 36, "Manfred": 34, "Norbert": 33, "Jan": 33, "Christoph": 32, "Rolf": 31, "Heiko": 30, "Lutz": 29, "Werner": 28, "Alexander": 27, "Harald": 27,
  },
  "1970s": {
    "Stefan": 500, "Michael": 450, "Christian": 444, "Markus": 375, "Andreas": 343, "Thomas": 292, "Frank": 214, "Alexander": 178, "Torsten": 174, "Sven": 171, "Matthias": 168, "Oliver": 153, "Martin": 144, "Jan": 133, "Jens": 102, "Marco": 98, "Marc": 96, "Jörg": 93, "Karsten": 92, "Dirk": 91, "André": 87, "Lars": 81, "Tobias": 69, "Mike": 68, "Holger": 67, "Robert": 62, "Sebastian": 59, "Ralf": 56, "Peter": 45, "Daniel": 45, "Olaf": 43, "Sascha": 37, "Florian": 36, "Heiko": 34, "Kai": 33, "Ingo": 32, "Björn": 32, "Volker": 31, "René": 30, "Klaus": 29, "Jürgen": 29, "Christoph": 29, "Dennis": 28, "Timo": 27,
  },
  "1980s": {
    "Christian": 666, "Sebastian": 400, "Daniel": 375, "Michael": 321, "Stefan": 310, "Jan": 268, "Alexander": 258, "Martin": 222, "Dennis": 177, "Tobias": 162, "Thomas": 150, "Florian": 141, "Philipp": 128, "Markus": 125, "Matthias": 124, "Benjamin": 118, "Patrick": 118, "Andreas": 105, "Christoph": 104, "Sven": 95, "Robert": 86, "André": 77, "Tim": 75, "Oliver": 73, "Marc": 71, "Sascha": 71, "Björn": 70, "Marcel": 68, "Marco": 65, "Frank": 56, "Nils": 55, "Johannes": 43, "David": 37, "Christopher": 36, "René": 33, "Lars": 31, "Steffen": 29, "Felix": 29, "Mike": 28,
  },
  "1990s": {
    "Jan": 666, "Tobias": 327, "Lukas": 295, "Alexander": 278, "Daniel": 268, "Christian": 233, "Philipp": 226, "Tim": 210, "Niklas": 200, "Florian": 177, "Dennis": 170, "Patrick": 157, "Kevin": 154, "Felix": 147, "Marcel": 144, "Sebastian": 138, "Maximilian": 109, "Fabian": 104, "David": 96, "Jonas": 96, "Marc": 79, "Timo": 73, "Julian": 68, "Christopher": 68, "Jannik": 67, "Nico": 62, "Matthias": 59, "Tom": 56, "Benjamin": 53, "Sven": 50, "Leon": 45, "Marvin": 43, "Finn": 40, "Simon": 37, "Lennard": 37, "Christoph": 36, "Dominik": 36, "Marco": 33, "Martin": 32, "Michael": 31, "Stefan": 30, "Pascal": 30, "Thomas": 29, "Moritz": 29, "Markus": 28, "Nils": 27, "Paul": 27,
  },
  "2000s": {
    "Lukas": 666, "Leon": 393, "Jan": 341, "Finn": 334, "Tim": 311, "Luca": 283, "Niklas": 268, "Jonas": 225, "Jannik": 162, "Tom": 154, "Philipp": 133, "Paul": 128, "Julian": 123, "Maximilian": 121, "Felix": 119, "Alexander": 113, "Jakob": 101, "Louis": 100, "Marvin": 95, "Max": 95, "Moritz": 90, "Nico": 83, "Florian": 80, "Kevin": 79, "Lennard": 79, "David": 72, "Simon": 71, "Fabian": 69, "Tobias": 65, "Justin": 62, "Daniel": 59, "Ben": 53, "Nils": 36, "Jonathan": 34, "Elias": 33, "Erik": 30, "Ole": 29, "Marcel": 29, "Dominik": 28, "Nick": 27, "Noah": 27,
  },
  "2010s": {
    "Leon": 533, "Ben": 533, "Jonas": 393, "Lukas": 341, "Finn": 310, "Elias": 238, "Paul": 236, "Louis": 211, "Noah": 187, "Luca": 174, "Maximilian": 171, "Felix": 160, "Max": 129, "Tim": 125, "Niklas": 106, "Moritz": 106, "Philipp": 99, "Julian": 98, "David": 83, "Jan": 79, "Alexander": 78, "Fabian": 71, "Tom": 70, "Henry": 67, "Emil": 59, "Jakob": 53, "Oskar": 43, "Anton": 42, "Simon": 40, "Jannik": 38, "Liam": 37, "Theo": 34, "Mats": 32, "Matteo": 30, "Samuel": 29, "Erik": 29, "Milan": 27,
  },
};
