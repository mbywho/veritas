use quick_xml::events::Event;
use quick_xml::Reader;
use rusqlite::Connection;

pub fn import_zefania_xml(
    file_path: &str,
    conn: &mut Connection,
    custom_name: Option<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut reader = Reader::from_file(file_path)?;
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut current_bible_id: Option<i64> = None;
    let mut current_book_id: Option<i64> = None;
    let mut current_chapter: Option<i64> = None;
    let mut current_verse: Option<i64> = None;
    let mut book_counter = 1;

    let tx = conn.transaction()?;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                let tag_name = e.name().as_ref().to_ascii_uppercase();
                match tag_name.as_slice() {
                b"XMLBIBLE" | b"BIBLE" => {
                    let mut biblename = String::from("Unknown Bible");
                    for attr in e.attributes().flatten() {
                        let key = attr.key.as_ref().to_ascii_uppercase();
                        if key == b"BIBLENAME" || key == b"NAME" {
                            if let Ok(val) = std::str::from_utf8(attr.value.as_ref()) {
                                biblename = val.to_string();
                            }
                        }
                    }
                    let final_biblename = custom_name.clone().unwrap_or(biblename);
                    tx.execute("INSERT INTO Bibles (name) VALUES (?1)", [&final_biblename])?;
                    current_bible_id = Some(tx.last_insert_rowid());
                }
                b"BIBLEBOOK" | b"B" | b"BOOK" => {
                    if current_bible_id.is_none() {
                        let fallback_name = custom_name.clone().unwrap_or_else(|| "Unknown Bible".to_string());
                        tx.execute("INSERT INTO Bibles (name) VALUES (?1)", [&fallback_name])?;
                        current_bible_id = Some(tx.last_insert_rowid());
                    }

                    if let Some(bible_id) = current_bible_id {
                        let mut bname = String::new();
                        let mut bnumber = 0;
                        for attr in e.attributes().flatten() {
                            let key = attr.key.as_ref().to_ascii_uppercase();
                            match key.as_slice() {
                                b"BNAME" | b"N" | b"ID" => {
                                    if let Ok(val) = std::str::from_utf8(attr.value.as_ref()) {
                                        bname = val.to_string();
                                    }
                                }
                                b"BNUMBER" => {
                                    if let Ok(val) = std::str::from_utf8(attr.value.as_ref()) {
                                        bnumber = val.parse().unwrap_or(0);
                                    }
                                }
                                _ => {}
                            }
                        }
                        
                        if bnumber == 0 {
                            bnumber = book_counter;
                        }
                        book_counter += 1;

                        tx.execute(
                            "INSERT INTO Books (bible_id, name, number) VALUES (?1, ?2, ?3)",
                            rusqlite::params![bible_id, bname, bnumber],
                        )?;
                        current_book_id = Some(tx.last_insert_rowid());
                    }
                }
                b"CHAPTER" | b"C" => {
                    for attr in e.attributes().flatten() {
                        let key = attr.key.as_ref().to_ascii_uppercase();
                        if key == b"CNUMBER" || key == b"N" || key == b"ID" {
                            if let Ok(val) = std::str::from_utf8(attr.value.as_ref()) {
                                current_chapter = val.parse().ok();
                            }
                        }
                    }
                }
                b"VERS" | b"V" | b"VERSE" => {
                    for attr in e.attributes().flatten() {
                        let key = attr.key.as_ref().to_ascii_uppercase();
                        if key == b"VNUMBER" || key == b"N" || key == b"ID" {
                            if let Ok(val) = std::str::from_utf8(attr.value.as_ref()) {
                                current_verse = val.parse().ok();
                            }
                        }
                    }
                }
                _ => (),
            }
            }
            Ok(Event::Text(e)) => {
                if let (Some(book_id), Some(chapter), Some(verse)) =
                    (current_book_id, current_chapter, current_verse)
                {
                    if let Ok(val) = std::str::from_utf8(e.as_ref()) {
                        let text = val.trim().trim_matches('"').to_string();
                        if !text.is_empty() {
                            tx.execute(
                                "INSERT INTO Verses (book_id, chapter, verse_num, text) VALUES (?1, ?2, ?3, ?4)",
                                rusqlite::params![book_id, chapter, verse, text]
                            )?;
                            current_verse = None; // Reset verse
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Box::new(e)),
            _ => (),
        }
        buf.clear();
    }

    tx.commit()?;
    Ok(())
}
