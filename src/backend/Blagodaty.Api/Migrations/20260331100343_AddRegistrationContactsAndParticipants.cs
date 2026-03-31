using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blagodaty.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRegistrationContactsAndParticipants : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ContactEmail",
                table: "CampRegistrations",
                type: "character varying(320)",
                maxLength: 320,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "HasCar",
                table: "CampRegistrations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "HasChildren",
                table: "CampRegistrations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "ParticipantsCount",
                table: "CampRegistrations",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateTable(
                name: "CampRegistrationParticipants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CampRegistrationId = table.Column<Guid>(type: "uuid", nullable: false),
                    FullName = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    IsChild = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CampRegistrationParticipants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CampRegistrationParticipants_CampRegistrations_CampRegistra~",
                        column: x => x.CampRegistrationId,
                        principalTable: "CampRegistrations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CampRegistrationParticipants_CampRegistrationId_SortOrder",
                table: "CampRegistrationParticipants",
                columns: new[] { "CampRegistrationId", "SortOrder" });

            migrationBuilder.Sql("""
                UPDATE "CampRegistrations"
                SET "ParticipantsCount" = CASE
                    WHEN COALESCE(NULLIF(TRIM("FullName"), ''), '') <> '' THEN 1
                    ELSE 0
                END;
                """);

            migrationBuilder.Sql("""
                UPDATE "CampRegistrations" AS registrations
                SET "ContactEmail" = COALESCE(users."Email", '')
                FROM "AspNetUsers" AS users
                WHERE registrations."UserId" = users."Id"
                  AND registrations."ContactEmail" = '';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CampRegistrationParticipants");

            migrationBuilder.DropColumn(
                name: "ContactEmail",
                table: "CampRegistrations");

            migrationBuilder.DropColumn(
                name: "HasCar",
                table: "CampRegistrations");

            migrationBuilder.DropColumn(
                name: "HasChildren",
                table: "CampRegistrations");

            migrationBuilder.DropColumn(
                name: "ParticipantsCount",
                table: "CampRegistrations");
        }
    }
}
