using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tasker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddInvitationAndPasswordResetTokens : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "PasswordHash",
                table: "users",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<DateTime>(
                name: "InvitationExpiresAt",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvitationTokenHash",
                table: "users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PasswordResetExpiresAt",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PasswordResetTokenHash",
                table: "users",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_InvitationTokenHash",
                table: "users",
                column: "InvitationTokenHash",
                filter: "\"InvitationTokenHash\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_users_PasswordResetTokenHash",
                table: "users",
                column: "PasswordResetTokenHash",
                filter: "\"PasswordResetTokenHash\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_users_InvitationTokenHash",
                table: "users");

            migrationBuilder.DropIndex(
                name: "IX_users_PasswordResetTokenHash",
                table: "users");

            migrationBuilder.DropColumn(
                name: "InvitationExpiresAt",
                table: "users");

            migrationBuilder.DropColumn(
                name: "InvitationTokenHash",
                table: "users");

            migrationBuilder.DropColumn(
                name: "PasswordResetExpiresAt",
                table: "users");

            migrationBuilder.DropColumn(
                name: "PasswordResetTokenHash",
                table: "users");

            migrationBuilder.AlterColumn<string>(
                name: "PasswordHash",
                table: "users",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);
        }
    }
}
