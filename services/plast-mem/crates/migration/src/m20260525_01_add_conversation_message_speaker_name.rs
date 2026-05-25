use sea_orm_migration::{prelude::*, schema::text};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(ConversationMessage::Table)
          .add_column_if_not_exists(text(ConversationMessage::SpeakerName).null())
          .to_owned(),
      )
      .await
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .alter_table(
        Table::alter()
          .table(ConversationMessage::Table)
          .drop_column(ConversationMessage::SpeakerName)
          .to_owned(),
      )
      .await
  }
}

#[derive(Iden)]
enum ConversationMessage {
  Table,
  SpeakerName,
}
