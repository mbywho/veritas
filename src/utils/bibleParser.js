var books = [
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
var specialAbbreviations = {
    "ps": 19, "psa": 19,
    "song": 22, "songs": 22,
    "mrk": 41,
    "jhn": 43, "jn": 43,
    "phm": 57, "phile": 57,
    "jas": 59, "jm": 59,
};
export function parseBibleReference(query) {
    var match = query.trim().toLowerCase().match(/^([\d\s]*[a-z]+(?:\s+of\s+[a-z]+)?)\s+(\d+)(?:[:\s]+(\d+))?$/);
    if (!match)
        return null;
    var rawBook = match[1].replace(/\s+/g, ' ').trim();
    var bookNumber = specialAbbreviations[rawBook.replace(/\s+/g, '')];
    if (!bookNumber) {
        var index = books.findIndex(function (b) { return b.startsWith(rawBook) || b.replace(/\s+/g, '').startsWith(rawBook.replace(/\s+/g, '')); });
        if (index !== -1) {
            bookNumber = index + 1;
        }
    }
    if (!bookNumber)
        return null;
    var chapter = parseInt(match[2], 10);
    var verse = match[3] ? parseInt(match[3], 10) : undefined;
    return { bookNumber: bookNumber, chapter: chapter, verse: verse };
}
