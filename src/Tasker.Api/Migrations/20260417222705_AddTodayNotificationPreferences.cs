using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tasker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTodayNotificationPreferences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TodayNotificationHour",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: 8);

            migrationBuilder.AddColumn<int>(
                name: "TodayNotificationWeekendHour",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: 8);

            migrationBuilder.AddColumn<bool>(
                name: "TodayNotificationsEnabled",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "TodayNotificationsGrouped",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TodayNotificationHour",
                table: "users");

            migrationBuilder.DropColumn(
                name: "TodayNotificationWeekendHour",
                table: "users");

            migrationBuilder.DropColumn(
                name: "TodayNotificationsEnabled",
                table: "users");

            migrationBuilder.DropColumn(
                name: "TodayNotificationsGrouped",
                table: "users");
        }
    }
}
