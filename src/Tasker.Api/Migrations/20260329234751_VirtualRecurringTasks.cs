using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tasker.Api.Migrations
{
    /// <inheritdoc />
    public partial class VirtualRecurringTasks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Step 1: Create new tables first (before dropping old columns)
            // so we can migrate data from old instance rows

            migrationBuilder.CreateTable(
                name: "recurrence_exceptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginalDate = table.Column<DateOnly>(type: "date", nullable: false),
                    IsSkipped = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Title = table.Column<string>(type: "text", nullable: true),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Priority = table.Column<short>(type: "smallint", nullable: true),
                    OverriddenDueDate = table.Column<DateOnly>(type: "date", nullable: true),
                    OverriddenDueDateTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AssignedToId = table.Column<Guid>(type: "uuid", nullable: true),
                    ClearAssignedTo = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_recurrence_exceptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_recurrence_exceptions_tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_recurrence_exceptions_users_AssignedToId",
                        column: x => x.AssignedToId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "exception_subtask_completions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    RecurrenceExceptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubtaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsCompleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exception_subtask_completions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_exception_subtask_completions_recurrence_exceptions_Recurre~",
                        column: x => x.RecurrenceExceptionId,
                        principalTable: "recurrence_exceptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_exception_subtask_completions_subtasks_SubtaskId",
                        column: x => x.SubtaskId,
                        principalTable: "subtasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_exception_subtask_completions_RecurrenceExceptionId_Subtask~",
                table: "exception_subtask_completions",
                columns: new[] { "RecurrenceExceptionId", "SubtaskId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_exception_subtask_completions_SubtaskId",
                table: "exception_subtask_completions",
                column: "SubtaskId");

            migrationBuilder.CreateIndex(
                name: "IX_recurrence_exceptions_AssignedToId",
                table: "recurrence_exceptions",
                column: "AssignedToId");

            migrationBuilder.CreateIndex(
                name: "IX_recurrence_exceptions_TaskId_OriginalDate",
                table: "recurrence_exceptions",
                columns: new[] { "TaskId", "OriginalDate" },
                unique: true);

            // Step 2: Migrate completed instances to recurrence exceptions
            migrationBuilder.Sql(@"
                INSERT INTO recurrence_exceptions (""Id"", ""TaskId"", ""OriginalDate"", ""CompletedAt"", ""IsSkipped"", ""ClearAssignedTo"", ""CreatedAt"", ""UpdatedAt"")
                SELECT gen_random_uuid(), ""RecurrenceParentId"", ""RecurrenceOriginDate"", ""CompletedAt"", false, false, now(), now()
                FROM tasks
                WHERE ""RecurrenceParentId"" IS NOT NULL
                  AND ""RecurrenceOriginDate"" IS NOT NULL
                  AND ""CompletedAt"" IS NOT NULL
                  AND NOT ""IsDeleted""
                ON CONFLICT (""TaskId"", ""OriginalDate"") DO NOTHING;
            ");

            // Step 3: Migrate soft-deleted instances as skipped exceptions
            migrationBuilder.Sql(@"
                INSERT INTO recurrence_exceptions (""Id"", ""TaskId"", ""OriginalDate"", ""IsSkipped"", ""ClearAssignedTo"", ""CreatedAt"", ""UpdatedAt"")
                SELECT gen_random_uuid(), ""RecurrenceParentId"", ""RecurrenceOriginDate"", true, false, now(), now()
                FROM tasks
                WHERE ""RecurrenceParentId"" IS NOT NULL
                  AND ""RecurrenceOriginDate"" IS NOT NULL
                  AND ""IsDeleted""
                ON CONFLICT (""TaskId"", ""OriginalDate"") DO NOTHING;
            ");

            // Step 4: Soft-delete all remaining instance rows
            migrationBuilder.Sql(@"
                UPDATE tasks SET ""IsDeleted"" = true
                WHERE ""RecurrenceParentId"" IS NOT NULL;
            ");

            // Step 5: Drop old recurrence columns
            migrationBuilder.DropForeignKey(
                name: "FK_tasks_tasks_RecurrenceParentId",
                table: "tasks");

            migrationBuilder.DropIndex(
                name: "IX_tasks_RecurrenceParentId",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "RecurrenceOriginDate",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "RecurrenceParentId",
                table: "tasks");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "exception_subtask_completions");

            migrationBuilder.DropTable(
                name: "recurrence_exceptions");

            migrationBuilder.AddColumn<DateOnly>(
                name: "RecurrenceOriginDate",
                table: "tasks",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RecurrenceParentId",
                table: "tasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_tasks_RecurrenceParentId",
                table: "tasks",
                column: "RecurrenceParentId",
                filter: "\"RecurrenceParentId\" IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_tasks_tasks_RecurrenceParentId",
                table: "tasks",
                column: "RecurrenceParentId",
                principalTable: "tasks",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
