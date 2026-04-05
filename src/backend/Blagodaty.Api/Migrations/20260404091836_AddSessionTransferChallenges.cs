using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blagodaty.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSessionTransferChallenges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SessionTransferChallenges",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ConsumedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedByIp = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    UserAgent = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SessionTransferChallenges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SessionTransferChallenges_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SessionTransferChallenges_TokenHash",
                table: "SessionTransferChallenges",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SessionTransferChallenges_UserId_ExpiresAtUtc",
                table: "SessionTransferChallenges",
                columns: new[] { "UserId", "ExpiresAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SessionTransferChallenges");
        }
    }
}
