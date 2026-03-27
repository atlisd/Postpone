using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tasker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectSortOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "projects",
                type: "integer",
                nullable: false,
                defaultValue: 2147483647);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "projects");
        }
    }
}
