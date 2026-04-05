using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blagodaty.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPhoneVerificationChallenges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PhoneVerificationChallenges",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PhoneNumber = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CodeHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ConsumedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhoneVerificationChallenges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PhoneVerificationChallenges_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PhoneVerificationChallenges_ExpiresAtUtc",
                table: "PhoneVerificationChallenges",
                column: "ExpiresAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_PhoneVerificationChallenges_UserId_CreatedAtUtc",
                table: "PhoneVerificationChallenges",
                columns: new[] { "UserId", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PhoneVerificationChallenges");
        }
    }
}
