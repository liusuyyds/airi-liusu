use sea_orm_migration::{prelude::*, sea_orm::Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    let db = manager.get_connection();
    let backend = manager.get_database_backend();

    // NOTICE:
    // ParadeDB needs filter columns to be present in the BM25 index for mixed
    // text-search/filter queries. Otherwise retrieval can fail with
    // "Unsupported query shape" when the query also filters by conversation,
    // category, or active semantic status.
    // Source/context: `docs.paradedb.com/v2/indexing` recommends indexing all
    // columns used for filtering within full-text queries.
    // Removal condition: only remove if retrieval SQL no longer combines BM25
    // operators with these filters.
    db.execute_raw(Statement::from_string(
      backend,
      "DROP INDEX IF EXISTS idx_episodic_memory_bm25;",
    ))
    .await?;

    db.execute_raw(Statement::from_string(
      backend,
      "CREATE INDEX idx_episodic_memory_bm25 ON episodic_memory \
       USING bm25 (id, conversation_id, (search_text::pdb.icu), created_at) \
       WITH (key_field='id');",
    ))
    .await?;

    db.execute_raw(Statement::from_string(
      backend,
      "DROP INDEX IF EXISTS idx_semantic_memory_fact_bm25;",
    ))
    .await?;

    db.execute_raw(Statement::from_string(
      backend,
      "CREATE INDEX idx_semantic_memory_fact_bm25 ON semantic_memory \
       USING bm25 (id, conversation_id, category, (fact::pdb.icu), invalid_at, created_at) \
       WITH (key_field='id');",
    ))
    .await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    let db = manager.get_connection();
    let backend = manager.get_database_backend();

    db.execute_raw(Statement::from_string(
      backend,
      "DROP INDEX IF EXISTS idx_episodic_memory_bm25;",
    ))
    .await?;

    db.execute_raw(Statement::from_string(
      backend,
      "CREATE INDEX idx_episodic_memory_bm25 ON episodic_memory \
       USING bm25 (id, (search_text::pdb.icu), created_at) \
       WITH (key_field='id');",
    ))
    .await?;

    db.execute_raw(Statement::from_string(
      backend,
      "DROP INDEX IF EXISTS idx_semantic_memory_fact_bm25;",
    ))
    .await?;

    db.execute_raw(Statement::from_string(
      backend,
      "CREATE INDEX idx_semantic_memory_fact_bm25 ON semantic_memory \
       USING bm25 (id, (fact::pdb.icu), created_at) \
       WITH (key_field='id');",
    ))
    .await?;

    Ok(())
  }
}
