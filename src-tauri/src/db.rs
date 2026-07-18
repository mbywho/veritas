use rusqlite::{Connection, Result};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn init_db(app_handle: &AppHandle) -> Result<Connection, Box<dyn std::error::Error>> {
    let app_dir = app_handle
        .path()
        .app_local_data_dir()
        .expect("Failed to get local data directory");

    // Ensure the app data directory exists
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)?;
    }

    let old_db_path: PathBuf = app_dir.join("verseview.db");
    let db_path: PathBuf = app_dir.join("veritas.db");
    
    // Migrate old db to new db name if it exists
    if old_db_path.exists() && !db_path.exists() {
        let _ = fs::rename(old_db_path, &db_path);
    }

    // Connect to SQLite
    let conn = Connection::open(db_path)?;
    conn.execute("PRAGMA foreign_keys = ON;", [])?;

    // Create schema
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS Bibles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            language TEXT
        );

        CREATE TABLE IF NOT EXISTS Books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bible_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            number INTEGER NOT NULL,
            FOREIGN KEY(bible_id) REFERENCES Bibles(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS Verses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            chapter INTEGER NOT NULL,
            verse_num INTEGER NOT NULL,
            text TEXT NOT NULL,
            FOREIGN KEY(book_id) REFERENCES Books(id) ON DELETE CASCADE
        );

        -- FTS5 virtual table for high performance full-text search
        CREATE VIRTUAL TABLE IF NOT EXISTS Verses_FTS USING fts5(
            text,
            content='Verses',
            content_rowid='id'
        );

        -- Triggers to automatically update FTS index when Verses are modified
        CREATE TRIGGER IF NOT EXISTS Verses_ai AFTER INSERT ON Verses BEGIN
            INSERT INTO Verses_FTS(rowid, text) VALUES (new.id, new.text);
        END;

        CREATE TRIGGER IF NOT EXISTS Verses_ad AFTER DELETE ON Verses BEGIN
            INSERT INTO Verses_FTS(Verses_FTS, rowid, text) VALUES ('delete', old.id, old.text);
        END;

        CREATE TRIGGER IF NOT EXISTS Verses_au AFTER UPDATE ON Verses BEGIN
            INSERT INTO Verses_FTS(Verses_FTS, rowid, text) VALUES ('delete', old.id, old.text);
            INSERT INTO Verses_FTS(rowid, text) VALUES (new.id, new.text);
        END;

        CREATE TABLE IF NOT EXISTS Songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            alternate_title TEXT,
            category TEXT
        );

        CREATE TABLE IF NOT EXISTS SongVerses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            song_id INTEGER NOT NULL,
            verse_order INTEGER NOT NULL,
            text TEXT NOT NULL,
            FOREIGN KEY(song_id) REFERENCES Songs(id) ON DELETE CASCADE
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS Songs_FTS USING fts5(
            title,
            alternate_title,
            content='Songs',
            content_rowid='id'
        );

        CREATE TRIGGER IF NOT EXISTS Songs_ai AFTER INSERT ON Songs BEGIN
            INSERT INTO Songs_FTS(rowid, title, alternate_title) VALUES (new.id, new.title, new.alternate_title);
        END;
        
        CREATE TRIGGER IF NOT EXISTS Songs_ad AFTER DELETE ON Songs BEGIN
            INSERT INTO Songs_FTS(Songs_FTS, rowid, title, alternate_title) VALUES ('delete', old.id, old.title, old.alternate_title);
        END;

        CREATE TRIGGER IF NOT EXISTS Songs_au AFTER UPDATE ON Songs BEGIN
            INSERT INTO Songs_FTS(Songs_FTS, rowid, title, alternate_title) VALUES ('delete', old.id, old.title, old.alternate_title);
            INSERT INTO Songs_FTS(rowid, title, alternate_title) VALUES (new.id, new.title, new.alternate_title);
        END;
        ",
    )?;

    Ok(conn)
}
