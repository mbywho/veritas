import xml.etree.ElementTree as ET
import sys
import os

ENGLISH_BOOKS = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
    "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
    "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon",
    "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
    "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah",
    "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
    "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
    "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
    "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"
]

def convert_to_zefania(input_path, output_path):
    if not os.path.exists(input_path):
        print(f"Error: Could not find '{input_path}'")
        return

    print(f"Reading {input_path}...")
    try:
        tree = ET.parse(input_path)
        root = tree.getroot()
    except Exception as e:
        print(f"Error parsing XML: {e}")
        return

    # Create Zefania root
    zefania_root = ET.Element("XMLBIBLE", {
        "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        "xsi:noNamespaceSchemaLocation": "zefaniaxml.xsd",
        "version": "2.0.1.1",
        "status": "v",
        "type": "bible"
    })

    # Add INFORMATION block
    info = ET.SubElement(zefania_root, "INFORMATION")
    ET.SubElement(info, "title").text = "English Bible"
    ET.SubElement(info, "creator").text = "VerseView Clone Parser"
    ET.SubElement(info, "description").text = "Zefania XML formatted English Bible translation Module"
    ET.SubElement(info, "language").text = "en"

    # Get testaments
    testament_elements = root.findall('.//testament')
    if not testament_elements:
        testament_elements = [root]

    for testament in testament_elements:
        book_elements = testament.findall('./book')
        if not book_elements:
            book_elements = testament.findall('.//book')
            
        for book in book_elements:
            # Get book number (1-indexed in the new schema)
            bnumber_str = book.get("number", book.get("id", book.get("n", "1")))
            try:
                b_num_int = int(bnumber_str)
                bname = ENGLISH_BOOKS[b_num_int - 1] if 1 <= b_num_int <= len(ENGLISH_BOOKS) else f"Book_{bnumber_str}"
            except ValueError:
                bname = bnumber_str

            z_book = ET.SubElement(zefania_root, "BIBLEBOOK", {
                "bnumber": str(bnumber_str),
                "bname": bname
            })

            chapter_elements = book.findall('./chapter')
            
            for chapter in chapter_elements:
                cnumber = chapter.get("number", chapter.get("id", chapter.get("n", "1")))
                z_chapter = ET.SubElement(z_book, "CHAPTER", {
                    "cnumber": str(cnumber)
                })

                verse_elements = chapter.findall('./verse')
                
                for verse in verse_elements:
                    vnumber = verse.get("number", verse.get("id", verse.get("n", "1")))
                    
                    # Extract and strip text
                    v_text = verse.text if verse.text else ""
                    v_text = v_text.strip()
                    if v_text.startswith('"') and v_text.endswith('"') and len(v_text) >= 2:
                        v_text = v_text[1:-1].strip()

                    z_verse = ET.SubElement(z_chapter, "VERS", {
                        "vnumber": str(vnumber)
                    })
                    z_verse.text = v_text

    # Write the output XML
    print(f"Writing output to {output_path}...")
    zefania_tree = ET.ElementTree(zefania_root)
    ET.indent(zefania_tree, space="  ", level=0)
    zefania_tree.write(output_path, encoding="UTF-8", xml_declaration=True)
    print("Conversion complete!")

if __name__ == "__main__":
    input_file = "bible.xml"
    output_file = "zefania_bible_english.xml"
    
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
        
    convert_to_zefania(input_file, output_file)
