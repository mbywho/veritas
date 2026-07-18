pub mod db;
pub mod parser;
pub mod server;

use rusqlite::Connection;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{Manager, State};

pub struct AppState {
    pub db: Mutex<Connection>,
    pub broadcast_tx: tokio::sync::broadcast::Sender<String>,
}

#[derive(Serialize)]
pub struct MonitorInfo {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub x: i32,
    pub y: i32,
}

#[derive(Serialize)]
pub struct Bible {
    pub id: i64,
    pub name: String,
    pub language: Option<String>,
}

#[derive(Serialize)]
pub struct Book {
    pub id: i64,
    pub bible_id: i64,
    pub name: String,
    pub number: i64,
}

#[derive(Serialize)]
pub struct Verse {
    pub id: i64,
    pub book_id: i64,
    pub book_name: String,
    pub secondary_book_name: Option<String>,
    pub chapter: i64,
    pub verse_num: i64,
    pub text: String,
    pub secondary_text: Option<String>,
}

#[derive(Serialize)]
pub struct Song {
    pub id: i64,
    pub title: String,
    pub alternate_title: Option<String>,
    pub category: Option<String>,
}

#[derive(Serialize)]
pub struct SongVerse {
    pub id: i64,
    pub song_id: i64,
    pub verse_order: i64,
    pub text: String,
}

#[tauri::command]
fn get_bibles(state: State<'_, AppState>) -> Result<Vec<Bible>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, language FROM Bibles ORDER BY name ASC")
        .map_err(|e| e.to_string())?;
    let bible_iter = stmt
        .query_map([], |row| {
            Ok(Bible {
                id: row.get(0)?,
                name: row.get(1)?,
                language: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut bibles = Vec::new();
    for b in bible_iter {
        bibles.push(b.map_err(|e| e.to_string())?);
    }
    Ok(bibles)
}

#[tauri::command]
fn get_books(state: State<'_, AppState>, bible_id: i32) -> Result<Vec<Book>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, bible_id, name, number FROM Books WHERE bible_id = ?1 ORDER BY number ASC",
        )
        .map_err(|e| e.to_string())?;
    let book_iter = stmt
        .query_map([bible_id], |row| {
            Ok(Book {
                id: row.get(0)?,
                bible_id: row.get(1)?,
                name: row.get(2)?,
                number: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut books = Vec::new();
    for b in book_iter {
        books.push(b.map_err(|e| e.to_string())?);
    }
    Ok(books)
}

#[tauri::command]
fn get_chapter_count(
    state: State<'_, AppState>,
    bible_id: i32,
    book_number: i32,
) -> Result<i32, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT MAX(v.chapter) FROM Verses v JOIN Books b ON b.id = v.book_id WHERE b.bible_id = ?1 AND b.number = ?2").map_err(|e| e.to_string())?;
    let count: i32 = stmt
        .query_row(rusqlite::params![bible_id, book_number], |row| row.get(0))
        .unwrap_or(0);
    Ok(count)
}

#[tauri::command]
fn get_verse_count(
    state: State<'_, AppState>,
    bible_id: i32,
    book_number: i32,
    chapter_number: i32,
) -> Result<i32, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT MAX(v.verse_num) FROM Verses v JOIN Books b ON b.id = v.book_id WHERE b.bible_id = ?1 AND b.number = ?2 AND v.chapter = ?3").map_err(|e| e.to_string())?;
    let count: i32 = stmt
        .query_row(
            rusqlite::params![bible_id, book_number, chapter_number],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(count)
}

#[tauri::command]
fn import_bible(state: State<'_, AppState>, file_path: String, custom_name: Option<String>) -> Result<String, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    parser::import_zefania_xml(&file_path, &mut conn, custom_name)
        .map_err(|e| format!("Import failed: {}", e))?;
    Ok("Bible imported successfully".to_string())
}

#[tauri::command]
fn delete_bible(state: State<'_, AppState>, bible_id: i32) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM Bibles WHERE id = ?1",
        rusqlite::params![bible_id],
    )
    .map_err(|e| e.to_string())?;
    Ok("Bible deleted successfully".to_string())
}

#[tauri::command]
fn rename_bible(
    state: State<'_, AppState>,
    bible_id: i32,
    new_name: String,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE Bibles SET name = ?1 WHERE id = ?2",
        rusqlite::params![new_name.trim(), bible_id],
    )
    .map_err(|e| e.to_string())?;
    Ok("Bible renamed successfully".to_string())
}

#[tauri::command]
fn search_verses(
    state: State<'_, AppState>,
    query: String,
    primary_bible_id: i32,
    secondary_bible_id: Option<i32>,
    testament_filter: Option<String>,
) -> Result<Vec<Verse>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let safe_query = sanitize_fts_query(&query);
    if safe_query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let mut base_sql = if secondary_bible_id.is_some() {
        "SELECT v.id, v.book_id, b.name as book_name, b2.name as secondary_book_name, v.chapter, v.verse_num, v.text, v2.text as secondary_text
         FROM Verses_FTS fts
         JOIN Verses v ON v.id = fts.rowid
         JOIN Books b ON b.id = v.book_id
         LEFT JOIN Books b2 ON b2.bible_id = ?2 AND b2.number = b.number
         LEFT JOIN Verses v2 ON v2.book_id = b2.id AND v2.chapter = v.chapter AND v2.verse_num = v.verse_num
         WHERE fts.text MATCH ?1 AND b.bible_id = ?3"
            .to_string()
    } else {
        "SELECT v.id, v.book_id, b.name as book_name, NULL as secondary_book_name, v.chapter, v.verse_num, v.text, NULL as secondary_text
         FROM Verses_FTS fts
         JOIN Verses v ON v.id = fts.rowid
         JOIN Books b ON b.id = v.book_id
         WHERE fts.text MATCH ?1 AND b.bible_id = ?3"
            .to_string()
    };

    if let Some(filter) = testament_filter {
        if filter == "OT" {
            base_sql.push_str(" AND b.number <= 39");
        } else if filter == "NT" {
            base_sql.push_str(" AND b.number >= 40");
        }
    }

    base_sql.push_str(" ORDER BY fts.rank LIMIT 50");

    let mut stmt = conn.prepare(&base_sql).map_err(|e| e.to_string())?;
    let mut verses = Vec::new();

    if let Some(sec_id) = secondary_bible_id {
        let verse_iter = stmt
            .query_map(
                rusqlite::params![safe_query, sec_id, primary_bible_id],
                |row| {
                    Ok(Verse {
                        id: row.get(0)?,
                        book_id: row.get(1)?,
                        book_name: row.get(2)?,
                        secondary_book_name: row.get(3)?,
                        chapter: row.get(4)?,
                        verse_num: row.get(5)?,
                        text: row.get(6)?,
                        secondary_text: row.get(7)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;
        for verse in verse_iter {
            verses.push(verse.map_err(|e| e.to_string())?);
        }
    } else {
        let verse_iter = stmt
            .query_map(
                rusqlite::params![safe_query, primary_bible_id, primary_bible_id],
                |row| {
                    Ok(Verse {
                        id: row.get(0)?,
                        book_id: row.get(1)?,
                        book_name: row.get(2)?,
                        secondary_book_name: row.get(3)?,
                        chapter: row.get(4)?,
                        verse_num: row.get(5)?,
                        text: row.get(6)?,
                        secondary_text: row.get(7)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;
        for verse in verse_iter {
            verses.push(verse.map_err(|e| e.to_string())?);
        }
    };

    Ok(verses)
}

#[tauri::command]
fn get_chapter(
    state: State<'_, AppState>,
    bible_id: i32,
    book_number: i32,
    chapter_number: i32,
    secondary_bible_id: Option<i32>,
) -> Result<Vec<Verse>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let sql = if secondary_bible_id.is_some() {
        "SELECT v.id, v.book_id, b.name as book_name, b2.name as secondary_book_name, v.chapter, v.verse_num, v.text, v2.text as secondary_text
         FROM Verses v 
         JOIN Books b ON b.id = v.book_id 
         LEFT JOIN Books b2 ON b2.bible_id = ?4 AND b2.number = b.number
         LEFT JOIN Verses v2 ON v2.book_id = b2.id AND v2.chapter = v.chapter AND v2.verse_num = v.verse_num
         WHERE b.bible_id = ?1 AND b.number = ?2 AND v.chapter = ?3 
         ORDER BY v.verse_num ASC"
    } else {
        "SELECT v.id, v.book_id, b.name as book_name, NULL as secondary_book_name, v.chapter, v.verse_num, v.text, NULL as secondary_text
         FROM Verses v 
         JOIN Books b ON b.id = v.book_id 
         WHERE b.bible_id = ?1 AND b.number = ?2 AND v.chapter = ?3 
         ORDER BY v.verse_num ASC"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let mut verses = Vec::new();

    if let Some(sec_id) = secondary_bible_id {
        let verse_iter = stmt
            .query_map(
                rusqlite::params![bible_id, book_number, chapter_number, sec_id],
                |row| {
                    Ok(Verse {
                        id: row.get(0)?,
                        book_id: row.get(1)?,
                        book_name: row.get(2)?,
                        secondary_book_name: row.get(3)?,
                        chapter: row.get(4)?,
                        verse_num: row.get(5)?,
                        text: row.get(6)?,
                        secondary_text: row.get(7)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;
        for verse in verse_iter {
            verses.push(verse.map_err(|e| e.to_string())?);
        }
    } else {
        let verse_iter = stmt
            .query_map(
                rusqlite::params![bible_id, book_number, chapter_number],
                |row| {
                    Ok(Verse {
                        id: row.get(0)?,
                        book_id: row.get(1)?,
                        book_name: row.get(2)?,
                        secondary_book_name: row.get(3)?,
                        chapter: row.get(4)?,
                        verse_num: row.get(5)?,
                        text: row.get(6)?,
                        secondary_text: row.get(7)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;
        for verse in verse_iter {
            verses.push(verse.map_err(|e| e.to_string())?);
        }
    };

    Ok(verses)
}
fn sanitize_fts_query(input: &str) -> String {
    // Remove characters that trigger FTS5 syntax errors
    let bad_chars = ['(', ')', ':', '-', '/', '"', '*', '\'', '\\'];
    input.chars().filter(|c| !bad_chars.contains(c)).collect()
}

fn strip_html_tags(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut in_tag = false;
    for c in input.chars() {
        if c == '<' {
            in_tag = true;
        } else if c == '>' {
            in_tag = false;
        } else if !in_tag {
            output.push(c);
        }
    }
    output
}

#[tauri::command]
fn search_songs(state: State<'_, AppState>, query: String) -> Result<Vec<Song>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let safe_query = sanitize_fts_query(&query);
    if safe_query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.title, s.alternate_title, s.category 
             FROM Songs_FTS fts
             JOIN Songs s ON s.id = fts.rowid
             WHERE Songs_FTS MATCH ?1 
             ORDER BY rank 
             LIMIT 50",
        )
        .map_err(|e| e.to_string())?;

    let song_iter = stmt
        .query_map(rusqlite::params![safe_query], |row| {
            Ok(Song {
                id: row.get(0)?,
                title: row.get(1)?,
                alternate_title: row.get(2)?,
                category: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut songs = Vec::new();
    for s in song_iter {
        songs.push(s.map_err(|e| e.to_string())?);
    }
    Ok(songs)
}

#[tauri::command]
fn get_all_songs(state: State<'_, AppState>) -> Result<Vec<Song>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, title, alternate_title, category 
             FROM Songs 
             ORDER BY title",
        )
        .map_err(|e| e.to_string())?;

    let song_iter = stmt
        .query_map([], |row| {
            Ok(Song {
                id: row.get(0)?,
                title: row.get(1)?,
                alternate_title: row.get(2)?,
                category: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut songs = Vec::new();
    for song in song_iter {
        songs.push(song.map_err(|e| e.to_string())?);
    }

    Ok(songs)
}

#[tauri::command]
fn get_song_lyrics(state: State<'_, AppState>, song_id: i32) -> Result<Vec<SongVerse>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, song_id, verse_order, text 
             FROM SongVerses 
             WHERE song_id = ?1 
             ORDER BY verse_order ASC",
        )
        .map_err(|e| e.to_string())?;

    let sv_iter = stmt
        .query_map([song_id], |row| {
            Ok(SongVerse {
                id: row.get(0)?,
                song_id: row.get(1)?,
                verse_order: row.get(2)?,
                text: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut song_verses = Vec::new();
    for sv in sv_iter {
        song_verses.push(sv.map_err(|e| e.to_string())?);
    }
    Ok(song_verses)
}

#[tauri::command]
fn broadcast_slide_state(state: State<'_, AppState>, payload: String) -> Result<(), String> {
    // Send the JSON payload to all connected websockets
    let _ = state.broadcast_tx.send(payload);
    Ok(())
}

#[tauri::command]
fn import_custom_song(
    state: State<'_, AppState>,
    title: String,
    text: String,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let safe_title = sanitize_fts_query(&title);
    if !safe_title.trim().is_empty() {
        let mut check_stmt = conn
            .prepare("SELECT rowid FROM Songs_FTS WHERE title MATCH ?1 LIMIT 1")
            .map_err(|e| e.to_string())?;
        let duplicate = check_stmt
            .exists(rusqlite::params![safe_title])
            .unwrap_or(false);
        if duplicate {
            return Err("Duplicate song found".to_string());
        }
    }

    // Start a transaction or just run sequentially
    conn.execute(
        "INSERT INTO Songs (title, category) VALUES (?1, ?2)",
        rusqlite::params![title, "Custom"],
    )
    .map_err(|e| e.to_string())?;

    let song_id = conn.last_insert_rowid();

    // Split text by blank lines to get stanzas
    let stanzas: Vec<&str> = text.split("\n\n").collect();

    let mut stmt = conn
        .prepare("INSERT INTO SongVerses (song_id, verse_order, text) VALUES (?1, ?2, ?3)")
        .map_err(|e| e.to_string())?;

    for (i, stanza) in stanzas.iter().enumerate() {
        let trimmed = stanza.trim();
        if !trimmed.is_empty() {
            stmt.execute(rusqlite::params![song_id, (i + 1) as i64, trimmed])
                .map_err(|e| e.to_string())?;
        }
    }

    Ok("Song imported successfully".to_string())
}

#[tauri::command]
fn update_song(
    state: State<'_, AppState>,
    song_id: i32,
    title: String,
    text: String,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let updated = conn.execute(
        "UPDATE Songs SET title = ?1 WHERE id = ?2",
        rusqlite::params![title, song_id],
    )
    .map_err(|e| e.to_string())?;
    println!("Updated song {} to title '{}', rows affected: {}", song_id, title, updated);

    // Delete old verses
    conn.execute("DELETE FROM SongVerses WHERE song_id = ?1", [song_id])
        .map_err(|e| e.to_string())?;

    let stanzas: Vec<&str> = text.split("\n\n").collect();
    let mut stmt = conn
        .prepare("INSERT INTO SongVerses (song_id, verse_order, text) VALUES (?1, ?2, ?3)")
        .map_err(|e| e.to_string())?;

    for (i, stanza) in stanzas.iter().enumerate() {
        let trimmed = stanza.trim();
        if !trimmed.is_empty() {
            stmt.execute(rusqlite::params![song_id, (i + 1) as i64, trimmed])
                .map_err(|e| e.to_string())?;
        }
    }

    Ok("Song updated successfully".to_string())
}

#[tauri::command]
fn delete_song(state: State<'_, AppState>, song_id: i32) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM Songs WHERE id = ?1", [song_id])
        .map_err(|e| e.to_string())?;
    Ok("Song deleted successfully".to_string())
}

#[tauri::command]
fn import_songs_xml(state: State<'_, AppState>, file_path: String) -> Result<String, String> {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    let mut reader = Reader::from_file(&file_path).map_err(|e| e.to_string())?;
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut in_song = false;
    let mut in_title = false;
    let mut in_lyrics = false;

    let mut current_title = String::new();
    let mut current_lyrics = String::new();

    let mut songs_imported = 0;

    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    {
        let mut insert_song = tx
            .prepare("INSERT INTO Songs (title, category) VALUES (?1, ?2)")
            .map_err(|e| e.to_string())?;
        let mut insert_verse = tx
            .prepare("INSERT INTO SongVerses (song_id, verse_order, text) VALUES (?1, ?2, ?3)")
            .map_err(|e| e.to_string())?;
        let mut check_stmt = tx
            .prepare("SELECT rowid FROM Songs_FTS WHERE title MATCH ?1 LIMIT 1")
            .map_err(|e| e.to_string())?;

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => match e.name().as_ref() {
                    b"song" => {
                        in_song = true;
                        current_title.clear();
                        current_lyrics.clear();
                    }
                    b"name" => {
                        if in_song {
                            in_title = true;
                        }
                    }
                    b"slide" => {
                        if in_song {
                            in_lyrics = true;
                        }
                    }
                    _ => (),
                },
                Ok(Event::Text(e)) => {
                    if let Ok(val) = std::str::from_utf8(e.as_ref()) {
                        if in_title {
                            current_title = val.to_string();
                        } else if in_lyrics {
                            current_lyrics.push_str(val);
                        }
                    }
                }
                Ok(Event::CData(e)) => {
                    if in_lyrics {
                        let text = std::str::from_utf8(e.as_ref()).map_err(|e| e.to_string())?;
                        current_lyrics.push_str(text);
                    }
                }
                Ok(Event::End(ref e)) => match e.name().as_ref() {
                    b"song" => {
                        in_song = false;
                        if !current_title.is_empty() {
                            let safe_title = sanitize_fts_query(&current_title);
                            let duplicate = if safe_title.trim().is_empty() {
                                false
                            } else {
                                check_stmt
                                    .exists(rusqlite::params![safe_title])
                                    .unwrap_or(false)
                            };

                            if !duplicate {
                                insert_song
                                    .execute(rusqlite::params![current_title, "Imported"])
                                    .map_err(|e| e.to_string())?;
                                let song_id = tx.last_insert_rowid();

                                let stanzas: Vec<&str> = current_lyrics.split("<slide>").collect();
                                let mut verse_num = 1;
                                for stanza in stanzas {
                                    let cleaned_stanza =
                                        stanza.replace("<BR>", "\n").replace("<br>", "\n");
                                    let stripped_stanza = strip_html_tags(&cleaned_stanza);
                                    let trimmed = stripped_stanza.trim();
                                    if !trimmed.is_empty() {
                                        insert_verse
                                            .execute(rusqlite::params![song_id, verse_num, trimmed])
                                            .map_err(|e| e.to_string())?;
                                        verse_num += 1;
                                    }
                                }
                                songs_imported += 1;
                            }
                        }
                    }
                    b"name" => in_title = false,
                    b"slide" => in_lyrics = false,
                    _ => (),
                },
                Ok(Event::Eof) => break,
                Err(e) => {
                    return Err(format!(
                        "Error parsing XML at position {}: {:?}",
                        reader.buffer_position(),
                        e
                    ))
                }
                _ => (),
            }
            buf.clear();
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    Ok(format!("Successfully imported {} songs", songs_imported))
}

#[tauri::command]
fn get_available_monitors(app_handle: tauri::AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let monitors = app_handle.available_monitors().map_err(|e| e.to_string())?;
    let mut profiles = Vec::new();
    for monitor in monitors {
        profiles.push(MonitorInfo {
            name: monitor
                .name()
                .cloned()
                .unwrap_or_else(|| "Unknown".to_string()),
            width: monitor.size().width,
            height: monitor.size().height,
            scale_factor: monitor.scale_factor(),
            x: monitor.position().x,
            y: monitor.position().y,
        });
    }
    Ok(profiles)
}

#[tauri::command]
fn launch_projector_window(
    app_handle: tauri::AppHandle,
    monitor_name: String,
) -> Result<(), String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
    let monitors = app_handle.available_monitors().map_err(|e| e.to_string())?;
    let is_single_monitor = monitors.len() == 1;
    let target_monitor = monitors
        .into_iter()
        .find(|m| m.name() == Some(&monitor_name));

    if let Some(monitor) = target_monitor {
        if let Some(window) = app_handle.get_webview_window("projector") {
            let _ = window.set_position(tauri::Position::Physical(*monitor.position()));
            let _ = window.set_size(tauri::Size::Physical(*monitor.size()));
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            return Ok(());
        }

        #[allow(unused_mut)]
        let mut builder = WebviewWindowBuilder::new(
            &app_handle,
            "projector",
            WebviewUrl::App("/projector".into()),
        )
        .title("Veritas Projector")
        .visible(false); // Build hidden so we can manually size it safely

        if is_single_monitor {
            builder = builder
                .decorations(true)
                .always_on_top(false)
                .inner_size(800.0, 450.0)
                .center();
        } else {
            builder = builder.decorations(false).always_on_top(true);

            #[cfg(target_os = "windows")]
            {
                builder = builder.fullscreen(true);
            }
        }

        let window = builder.build().map_err(|e| e.to_string())?;

        if !is_single_monitor {
            let _ = window.set_position(tauri::Position::Physical(*monitor.position()));
            let _ = window.set_size(tauri::Size::Physical(*monitor.size()));
        }

        let _ = window.show();
        let _ = window.set_focus();

        Ok(())
    } else {
        Err(format!("Monitor '{}' not found", monitor_name))
    }
}

#[tauri::command]
fn close_projector_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app_handle.get_webview_window("projector") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_local_ip() -> Result<String, String> {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .map_err(|e| format!("Failed to get local IP: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Initialize database
            let conn = db::init_db(app.handle()).expect("Failed to initialize DB");

            // Initialize broadcast channel for WebSockets
            let (tx, _rx) = tokio::sync::broadcast::channel(100);

            app.manage(AppState {
                db: Mutex::new(conn),
                broadcast_tx: tx.clone(),
            });

            let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

            // Spawn the Axum server
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                server::start_server(app_handle, tx, shutdown_rx).await;
            });

            let app_handle_clone2 = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut shutdown_tx = Some(shutdown_tx);
                loop {
                    tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
                    use tauri::Manager;
                    let windows = app_handle_clone2.webview_windows();
                    if windows.is_empty() {
                        if let Some(tx) = shutdown_tx.take() {
                            let _ = tx.send(());
                        }
                        break;
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_bibles,
            get_books,
            get_chapter_count,
            get_verse_count,
            import_bible,
            delete_bible,
            rename_bible,
            search_verses,
            get_chapter,
            search_songs,
            get_all_songs,
            get_song_lyrics,
            broadcast_slide_state,
            import_custom_song,
            update_song,
            delete_song,
            import_songs_xml,
            get_available_monitors,
            launch_projector_window,
            close_projector_window,
            get_local_ip
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
