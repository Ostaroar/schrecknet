use rusqlite::Connection;

const MIGRATIONS: &[&str] = &[
    include_str!("../../migrations/0001_user_data.sql"),
    include_str!("../../migrations/0002_deck_author.sql"),
];

pub fn migrate(path: &str) -> rusqlite::Result<()> {
    let connection = Connection::open(path)?;
    migrate_connection(&connection)
}

fn migrate_connection(connection: &Connection) -> rusqlite::Result<()> {
    connection.pragma_update(None, "foreign_keys", true)?;
    let current_version: usize =
        connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    for migration in MIGRATIONS.iter().skip(current_version) {
        connection.execute_batch(migration)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_create_the_current_schema() {
        let connection = Connection::open_in_memory().unwrap();
        migrate_connection(&connection).unwrap();

        let version: usize = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        let author_columns: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('decks') WHERE name = 'author'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, MIGRATIONS.len());
        assert_eq!(author_columns, 1);
    }

    #[test]
    fn migrations_upgrade_legacy_decks_without_data_loss() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE decks(
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                 );
                 CREATE TABLE deck_cards(
                    deck_id INTEGER NOT NULL,
                    card_id INTEGER NOT NULL,
                    qty INTEGER NOT NULL,
                    PRIMARY KEY (deck_id, card_id)
                 );
                 CREATE TABLE deck_tags(
                    deck_id INTEGER NOT NULL,
                    tag TEXT NOT NULL,
                    PRIMARY KEY (deck_id, tag)
                 );
                 INSERT INTO decks VALUES (1, 'Existing', 'keep me', 'created', 'updated');",
            )
            .unwrap();

        migrate_connection(&connection).unwrap();

        let deck: (String, String, Option<String>) = connection
            .query_row(
                "SELECT name, description, author FROM decks WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(deck, ("Existing".into(), "keep me".into(), None));
    }
}
