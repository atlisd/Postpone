using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tasker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPinnedSmartlistItems : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid[]>(
                name: "PinnedProjectIds",
                table: "users",
                type: "uuid[]",
                nullable: false,
                defaultValueSql: "'{}'::uuid[]");

            migrationBuilder.AddColumn<Guid[]>(
                name: "PinnedTagIds",
                table: "users",
                type: "uuid[]",
                nullable: false,
                defaultValueSql: "'{}'::uuid[]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PinnedProjectIds",
                table: "users");

            migrationBuilder.DropColumn(
                name: "PinnedTagIds",
                table: "users");
        }
    }
}
