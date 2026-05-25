use chrono::{DateTime, Utc};
use plastmem_entities::semantic_memory;
use plastmem_shared::AppError;
use sea_orm::{
  ConnectionTrait, DatabaseConnection, DbBackend, FromQueryResult, Statement, prelude::PgVector,
};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

/// Number of candidates fetched per search leg (BM25 and vector) before RRF merging.
const RETRIEVAL_CANDIDATE_LIMIT: i64 = 100;

// ──────────────────────────────────────────────────
// Domain model
// ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone, ToSchema)]
pub struct SemanticMemory {
  pub id: Uuid,
  pub conversation_id: Uuid,
  pub category: String,
  pub fact: String,
  pub source_episodic_ids: Vec<Uuid>,
  pub valid_at: DateTime<Utc>,
  pub invalid_at: Option<DateTime<Utc>>,
  #[serde(skip)]
  pub embedding: PgVector,
  pub created_at: DateTime<Utc>,
}

impl SemanticMemory {
  #[must_use]
  pub fn from_model(model: semantic_memory::Model) -> Self {
    Self {
      id: model.id,
      conversation_id: model.conversation_id,
      category: model.category,
      fact: model.fact,
      source_episodic_ids: model.source_episodic_ids,
      valid_at: model.valid_at.with_timezone(&Utc),
      invalid_at: model.invalid_at.map(|dt| dt.with_timezone(&Utc)),
      embedding: model.embedding,
      created_at: model.created_at.with_timezone(&Utc),
    }
  }

  /// Check if this fact is a behavioral guideline for the assistant.
  #[must_use]
  pub fn is_behavioral(&self) -> bool {
    self.category == "guideline"
  }

  /// Retrieve semantic facts using hybrid BM25 + vector search with RRF.
  ///
  /// Accepts a pre-computed embedding so callers can reuse one embedding across retrieval paths.
  pub async fn retrieve_by_embedding(
    query: &str,
    query_embedding: PgVector,
    limit: i64,
    conversation_id: Uuid,
    db: &DatabaseConnection,
    category: Option<&str>,
  ) -> Result<Vec<(Self, f64)>, AppError> {
    let sql_without_category = r"
    WITH
    fulltext AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC) AS r
      FROM (
        SELECT id, pdb.score(id) AS score
        FROM semantic_memory
        WHERE fact ||| $1
          AND conversation_id = $2
          AND invalid_at IS NULL
        ORDER BY pdb.score(id) DESC
        LIMIT $3
      ) AS fulltext_score
    ),
    semantic AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY distance) AS r
      FROM (
        SELECT id, embedding <#> $4 AS distance
        FROM semantic_memory
        WHERE conversation_id = $2
          AND invalid_at IS NULL
        ORDER BY embedding <#> $4
        LIMIT $3
      ) AS semantic_distance
    ),
    rrf AS (
      SELECT id, 1.0 / (30 + r) AS s FROM fulltext
      UNION ALL
      SELECT id, 1.0 / (30 + r) AS s FROM semantic
    ),
    rrf_score AS (
      SELECT id, SUM(s)::float8 AS score
      FROM rrf
      GROUP BY id
    )
    SELECT
      m.id, m.conversation_id, m.category, m.fact, m.source_episodic_ids,
      m.valid_at, m.invalid_at, m.embedding, m.created_at,
      r.score AS score
    FROM rrf_score r
    JOIN semantic_memory m USING (id)
    ORDER BY r.score DESC
    LIMIT $5;
    ";

    let sql_with_category = r"
    WITH
    fulltext AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC) AS r
      FROM (
        SELECT id, pdb.score(id) AS score
        FROM semantic_memory
        WHERE fact ||| $1
          AND conversation_id = $2
          AND invalid_at IS NULL
          AND category = $6
        ORDER BY pdb.score(id) DESC
        LIMIT $3
      ) AS fulltext_score
    ),
    semantic AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY distance) AS r
      FROM (
        SELECT id, embedding <#> $4 AS distance
        FROM semantic_memory
        WHERE conversation_id = $2
          AND invalid_at IS NULL
          AND category = $6
        ORDER BY embedding <#> $4
        LIMIT $3
      ) AS semantic_distance
    ),
    rrf AS (
      SELECT id, 1.0 / (30 + r) AS s FROM fulltext
      UNION ALL
      SELECT id, 1.0 / (30 + r) AS s FROM semantic
    ),
    rrf_score AS (
      SELECT id, SUM(s)::float8 AS score
      FROM rrf
      GROUP BY id
    )
    SELECT
      m.id, m.conversation_id, m.category, m.fact, m.source_episodic_ids,
      m.valid_at, m.invalid_at, m.embedding, m.created_at,
      r.score AS score
    FROM rrf_score r
    JOIN semantic_memory m USING (id)
    ORDER BY r.score DESC
    LIMIT $5;
    ";

    let mut values = vec![
      query.to_owned().into(),
      conversation_id.into(),
      RETRIEVAL_CANDIDATE_LIMIT.into(),
      query_embedding.into(),
      limit.into(),
    ];

    let sql = if let Some(category) = category {
      values.push(category.to_owned().into());
      sql_with_category
    } else {
      sql_without_category
    };

    let stmt = Statement::from_sql_and_values(DbBackend::Postgres, sql, values);

    let rows = db.query_all_raw(stmt).await?;
    let mut results = Vec::with_capacity(rows.len());

    for row in rows {
      let model = semantic_memory::Model::from_query_result(&row, "")?;
      let score: f64 = row.try_get("", "score")?;
      results.push((Self::from_model(model), score));
    }

    Ok(results)
  }
}
