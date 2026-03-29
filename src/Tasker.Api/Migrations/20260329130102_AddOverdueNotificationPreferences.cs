using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tasker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOverdueNotificationPreferences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "OverdueNotificationHour",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "OverdueNotificationsEnabled",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OverdueNotificationHour",
                table: "users");

            migrationBuilder.DropColumn(
                name: "OverdueNotificationsEnabled",
                table: "users");
        }
    }
}
