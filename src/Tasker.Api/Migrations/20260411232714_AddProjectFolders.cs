using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tasker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectFolders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "FolderId",
                table: "projects",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "project_folders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false, defaultValue: 2147483647),
                    IsCollapsed = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_project_folders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_project_folders_users_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_projects_FolderId",
                table: "projects",
                column: "FolderId");

            migrationBuilder.CreateIndex(
                name: "IX_project_folders_OwnerId",
                table: "project_folders",
                column: "OwnerId");

            migrationBuilder.AddForeignKey(
                name: "FK_projects_project_folders_FolderId",
                table: "projects",
                column: "FolderId",
                principalTable: "project_folders",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_projects_project_folders_FolderId",
                table: "projects");

            migrationBuilder.DropTable(
                name: "project_folders");

            migrationBuilder.DropIndex(
                name: "IX_projects_FolderId",
                table: "projects");

            migrationBuilder.DropColumn(
                name: "FolderId",
                table: "projects");
        }
    }
}
