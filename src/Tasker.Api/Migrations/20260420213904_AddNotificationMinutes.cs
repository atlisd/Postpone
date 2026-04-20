using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tasker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationMinutes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "OverdueNotificationMinute",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "TodayNotificationMinute",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "TodayNotificationWeekendMinute",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OverdueNotificationMinute",
                table: "users");

            migrationBuilder.DropColumn(
                name: "TodayNotificationMinute",
                table: "users");

            migrationBuilder.DropColumn(
                name: "TodayNotificationWeekendMinute",
                table: "users");
        }
    }
}
