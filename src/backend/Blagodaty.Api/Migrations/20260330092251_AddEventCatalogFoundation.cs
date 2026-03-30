using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blagodaty.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEventCatalogFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CampRegistrations_Status_UpdatedAtUtc",
                table: "CampRegistrations");

            migrationBuilder.DropIndex(
                name: "IX_CampRegistrations_UserId",
                table: "CampRegistrations");

            migrationBuilder.AddColumn<Guid>(
                name: "EventEditionId",
                table: "CampRegistrations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SelectedPriceOptionId",
                table: "CampRegistrations",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EventSeries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Slug = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Title = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventSeries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EventEditions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventSeriesId = table.Column<Guid>(type: "uuid", nullable: false),
                    Slug = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: false),
                    Title = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                    SeasonLabel = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    ShortDescription = table.Column<string>(type: "character varying(600)", maxLength: 600, nullable: false),
                    FullDescription = table.Column<string>(type: "character varying(8000)", maxLength: 8000, nullable: true),
                    Location = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: true),
                    Timezone = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    StartsAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndsAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RegistrationOpensAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RegistrationClosesAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Capacity = table.Column<int>(type: "integer", nullable: true),
                    WaitlistEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventEditions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EventEditions_EventSeries_EventSeriesId",
                        column: x => x.EventSeriesId,
                        principalTable: "EventSeries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EventContentBlocks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventEditionId = table.Column<Guid>(type: "uuid", nullable: false),
                    BlockType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Title = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: true),
                    Body = table.Column<string>(type: "character varying(8000)", maxLength: 8000, nullable: false),
                    IsPublished = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventContentBlocks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EventContentBlocks_EventEditions_EventEditionId",
                        column: x => x.EventEditionId,
                        principalTable: "EventEditions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EventPriceOptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventEditionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Title = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    SalesStartsAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SalesEndsAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Capacity = table.Column<int>(type: "integer", nullable: true),
                    IsDefault = table.Column<bool>(type: "boolean", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventPriceOptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EventPriceOptions_EventEditions_EventEditionId",
                        column: x => x.EventEditionId,
                        principalTable: "EventEditions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EventScheduleItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventEditionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    StartsAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndsAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Location = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventScheduleItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EventScheduleItems_EventEditions_EventEditionId",
                        column: x => x.EventEditionId,
                        principalTable: "EventEditions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CampRegistrations_EventEditionId",
                table: "CampRegistrations",
                column: "EventEditionId");

            migrationBuilder.CreateIndex(
                name: "IX_CampRegistrations_EventEditionId_Status_UpdatedAtUtc",
                table: "CampRegistrations",
                columns: new[] { "EventEditionId", "Status", "UpdatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_CampRegistrations_EventEditionId_UserId",
                table: "CampRegistrations",
                columns: new[] { "EventEditionId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CampRegistrations_SelectedPriceOptionId",
                table: "CampRegistrations",
                column: "SelectedPriceOptionId");

            migrationBuilder.CreateIndex(
                name: "IX_CampRegistrations_UserId",
                table: "CampRegistrations",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_EventContentBlocks_EventEditionId_BlockType_SortOrder",
                table: "EventContentBlocks",
                columns: new[] { "EventEditionId", "BlockType", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_EventEditions_EventSeriesId",
                table: "EventEditions",
                column: "EventSeriesId");

            migrationBuilder.CreateIndex(
                name: "IX_EventEditions_RegistrationClosesAtUtc",
                table: "EventEditions",
                column: "RegistrationClosesAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_EventEditions_Slug",
                table: "EventEditions",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EventEditions_Status_StartsAtUtc",
                table: "EventEditions",
                columns: new[] { "Status", "StartsAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_EventPriceOptions_EventEditionId_Code",
                table: "EventPriceOptions",
                columns: new[] { "EventEditionId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EventPriceOptions_EventEditionId_IsActive_SortOrder",
                table: "EventPriceOptions",
                columns: new[] { "EventEditionId", "IsActive", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_EventScheduleItems_EventEditionId_SortOrder",
                table: "EventScheduleItems",
                columns: new[] { "EventEditionId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_EventSeries_Slug",
                table: "EventSeries",
                column: "Slug",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_CampRegistrations_EventEditions_EventEditionId",
                table: "CampRegistrations",
                column: "EventEditionId",
                principalTable: "EventEditions",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_CampRegistrations_EventPriceOptions_SelectedPriceOptionId",
                table: "CampRegistrations",
                column: "SelectedPriceOptionId",
                principalTable: "EventPriceOptions",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CampRegistrations_EventEditions_EventEditionId",
                table: "CampRegistrations");

            migrationBuilder.DropForeignKey(
                name: "FK_CampRegistrations_EventPriceOptions_SelectedPriceOptionId",
                table: "CampRegistrations");

            migrationBuilder.DropTable(
                name: "EventContentBlocks");

            migrationBuilder.DropTable(
                name: "EventPriceOptions");

            migrationBuilder.DropTable(
                name: "EventScheduleItems");

            migrationBuilder.DropTable(
                name: "EventEditions");

            migrationBuilder.DropTable(
                name: "EventSeries");

            migrationBuilder.DropIndex(
                name: "IX_CampRegistrations_EventEditionId",
                table: "CampRegistrations");

            migrationBuilder.DropIndex(
                name: "IX_CampRegistrations_EventEditionId_Status_UpdatedAtUtc",
                table: "CampRegistrations");

            migrationBuilder.DropIndex(
                name: "IX_CampRegistrations_EventEditionId_UserId",
                table: "CampRegistrations");

            migrationBuilder.DropIndex(
                name: "IX_CampRegistrations_SelectedPriceOptionId",
                table: "CampRegistrations");

            migrationBuilder.DropIndex(
                name: "IX_CampRegistrations_UserId",
                table: "CampRegistrations");

            migrationBuilder.DropColumn(
                name: "EventEditionId",
                table: "CampRegistrations");

            migrationBuilder.DropColumn(
                name: "SelectedPriceOptionId",
                table: "CampRegistrations");

            migrationBuilder.CreateIndex(
                name: "IX_CampRegistrations_Status_UpdatedAtUtc",
                table: "CampRegistrations",
                columns: new[] { "Status", "UpdatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_CampRegistrations_UserId",
                table: "CampRegistrations",
                column: "UserId",
                unique: true);
        }
    }
}
