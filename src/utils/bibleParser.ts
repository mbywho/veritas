export interface ParsedReference {
  bookNumber: number;
  chapter: number;
  verse?: number;
}

const books = [
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy", "joshua", "judges", "ruth",
  "1 samuel", "2 samuel", "1 kings", "2 kings", "1 chronicles", "2 chronicles", "ezra",
  "nehemiah", "esther", "job", "psalms", "proverbs", "ecclesiastes", "song of solomon",
  "isaiah", "jeremiah", "lamentations", "ezekiel", "daniel", "hosea", "joel", "amos",
  "obadiah", "jonah", "micah", "nahum", "habakkuk", "zephaniah", "haggai", "zechariah",
  "malachi", "matthew", "mark", "luke", "john", "acts", "romans", "1 corinthians",
  "2 corinthians", "galatians", "ephesians", "philippians", "colossians", "1 thessalonians",
  "2 thessalonians", "1 timothy", "2 timothy", "titus", "philemon", "hebrews", "james",
  "1 peter", "2 peter", "1 john", "2 john", "3 john", "jude", "revelation"
];

const specialAbbreviations: Record<string, number> = {
  "ps": 19, "psa": 19,
  "song": 22, "songs": 22,
  "mrk": 41,
  "jhn": 43, "jn": 43,
  "phm": 57, "phile": 57,
  "jas": 59, "jm": 59,
};

export function parseBibleReference(query: string): ParsedReference | null {
  const match = query.trim().toLowerCase().match(/^([\d\s]*[a-z]+(?:\s+of\s+[a-z]+)?)\s+(\d+)(?:[:\s]+(\d+))?$/);

  if (!match) return null;

  let rawBook = match[1].replace(/\s+/g, ' ').trim();

  let bookNumber = specialAbbreviations[rawBook.replace(/\s+/g, '')];

  if (!bookNumber) {
    const index = books.findIndex(b => b.startsWith(rawBook) || b.replace(/\s+/g, '').startsWith(rawBook.replace(/\s+/g, '')));
    if (index !== -1) {
      bookNumber = index + 1;
    }
  }

  if (!bookNumber) return null;

  const chapter = parseInt(match[2], 10);
  const verse = match[3] ? parseInt(match[3], 10) : undefined;

  return { bookNumber, chapter, verse };
}