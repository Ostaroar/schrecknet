use rusqlite::Connection;

const MIGRATIONS: &[&str] = &[
    include_str!("../../migrations/0001_user_data.sql"),
    include_str!("../../migrations/0002_deck_author.sql"),
    include_str!("../../migrations/0003_inventory.sql"),
    include_str!("../../migrations/0004_game_groups.sql"),
    include_str!("../../migrations/0005_game_group_archetypes.sql"),
    include_str!("../../migrations/0006_inventory_precons.sql"),
    include_str!("../../migrations/0007_game_group_write_passphrase.sql"),
];

pub fn migrate(path: &str) -> rusqlite::Result<()> {
    let connection = Connection::open(path)?;
    migrate_connection(&connection)
}

pub(crate) fn migrate_connection(connection: &Connection) -> rusqlite::Result<()> {
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
        let inventory_mode_columns: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('decks') WHERE name = 'inventory_mode'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let inventory_tables: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'
                 AND name IN ('inventory', 'deck_card_inventory_overrides')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let game_group_tables: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'
                 AND name IN ('game_groups', 'group_games', 'group_game_results')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let archetype_columns: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('group_game_results')
                 WHERE name = 'archetype_id'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let group_passphrase_columns: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('game_groups')
                 WHERE name = 'write_passphrase_hash'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, MIGRATIONS.len());
        assert_eq!(author_columns, 1);
        assert_eq!(inventory_mode_columns, 1);
        assert_eq!(inventory_tables, 2);
        assert_eq!(game_group_tables, 3);
        assert_eq!(archetype_columns, 1);
        assert_eq!(group_passphrase_columns, 1);
    }

    #[test]
    fn inventory_mode_defaults_to_excluded_for_existing_decks() {
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
                 PRAGMA user_version = 1;
                 ALTER TABLE decks ADD COLUMN author TEXT;
                 PRAGMA user_version = 2;
                 INSERT INTO decks VALUES (1, 'Existing', NULL, 'created', 'updated', NULL);",
            )
            .unwrap();

        migrate_connection(&connection).unwrap();

        let mode: String = connection
            .query_row("SELECT inventory_mode FROM decks WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(mode, "excluded");
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
