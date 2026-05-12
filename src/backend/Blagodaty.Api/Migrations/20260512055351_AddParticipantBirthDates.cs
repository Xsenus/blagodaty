using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blagodaty.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddParticipantBirthDates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "BirthDate",
                table: "CampRegistrationParticipants",
                type: "date",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE "CampRegistrationParticipants" AS participant
                SET "BirthDate" = registration."BirthDate"
                FROM "CampRegistrations" AS registration
                WHERE participant."CampRegistrationId" = registration."Id"
                  AND participant."SortOrder" = 0
                  AND registration."BirthDate" IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BirthDate",
                table: "CampRegistrationParticipants");
        }
    }
}
