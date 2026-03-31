using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blagodaty.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTelegramDeliveryLogsAndGroupAdminChecks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TelegramSubscriptionDeliveryLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TelegramChatSubscriptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    NotificationKey = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    SentAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TelegramSubscriptionDeliveryLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TelegramSubscriptionDeliveryLogs_TelegramChatSubscriptions_~",
                        column: x => x.TelegramChatSubscriptionId,
                        principalTable: "TelegramChatSubscriptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TelegramSubscriptionDeliveryLogs_SentAtUtc",
                table: "TelegramSubscriptionDeliveryLogs",
                column: "SentAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_TelegramSubscriptionDeliveryLogs_TelegramChatSubscriptionId~",
                table: "TelegramSubscriptionDeliveryLogs",
                columns: new[] { "TelegramChatSubscriptionId", "NotificationKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TelegramSubscriptionDeliveryLogs");
        }
    }
}
