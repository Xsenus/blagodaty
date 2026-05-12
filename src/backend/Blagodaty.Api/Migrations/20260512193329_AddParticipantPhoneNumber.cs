using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blagodaty.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddParticipantPhoneNumber : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PhoneNumber",
                table: "CampRegistrationParticipants",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("""
                UPDATE "CampRegistrationParticipants" AS participant
                SET "PhoneNumber" = registration."PhoneNumber"
                FROM "CampRegistrations" AS registration
                WHERE participant."CampRegistrationId" = registration."Id"
                  AND participant."PhoneNumber" = ''
                  AND registration."PhoneNumber" <> '';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PhoneNumber",
                table: "CampRegistrationParticipants");
        }
    }
}
