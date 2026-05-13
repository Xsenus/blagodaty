using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blagodaty.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRegistrationPaymentAndHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPaid",
                table: "CampRegistrations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "PaidAtUtc",
                table: "CampRegistrations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PaymentUpdatedByUserId",
                table: "CampRegistrations",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CampRegistrationHistoryEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CampRegistrationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActorDisplayName = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    ChangeType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    PreviousValue = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    NewValue = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CampRegistrationHistoryEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CampRegistrationHistoryEntries_AspNetUsers_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_CampRegistrationHistoryEntries_CampRegistrations_CampRegist~",
                        column: x => x.CampRegistrationId,
                        principalTable: "CampRegistrations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CampRegistrations_PaymentUpdatedByUserId",
                table: "CampRegistrations",
                column: "PaymentUpdatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CampRegistrationHistoryEntries_ActorUserId",
                table: "CampRegistrationHistoryEntries",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CampRegistrationHistoryEntries_CampRegistrationId_CreatedAt~",
                table: "CampRegistrationHistoryEntries",
                columns: new[] { "CampRegistrationId", "CreatedAtUtc" });

            migrationBuilder.AddForeignKey(
                name: "FK_CampRegistrations_AspNetUsers_PaymentUpdatedByUserId",
                table: "CampRegistrations",
                column: "PaymentUpdatedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CampRegistrations_AspNetUsers_PaymentUpdatedByUserId",
                table: "CampRegistrations");

            migrationBuilder.DropTable(
                name: "CampRegistrationHistoryEntries");

            migrationBuilder.DropIndex(
                name: "IX_CampRegistrations_PaymentUpdatedByUserId",
                table: "CampRegistrations");

            migrationBuilder.DropColumn(
                name: "IsPaid",
                table: "CampRegistrations");

            migrationBuilder.DropColumn(
                name: "PaidAtUtc",
                table: "CampRegistrations");

            migrationBuilder.DropColumn(
                name: "PaymentUpdatedByUserId",
                table: "CampRegistrations");
        }
    }
}
