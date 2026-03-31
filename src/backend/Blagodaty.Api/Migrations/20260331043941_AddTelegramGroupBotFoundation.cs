using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blagodaty.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTelegramGroupBotFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TelegramChats",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ChatId = table.Column<long>(type: "bigint", nullable: false),
                    Kind = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Title = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: true),
                    Username = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    IsForum = table.Column<bool>(type: "boolean", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastSeenAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TelegramChats", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TelegramChatSubscriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TelegramChatId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventEditionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubscriptionType = table.Column<string>(type: "character varying(48)", maxLength: 48, nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    MessageThreadId = table.Column<long>(type: "bigint", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TelegramChatSubscriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TelegramChatSubscriptions_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_TelegramChatSubscriptions_EventEditions_EventEditionId",
                        column: x => x.EventEditionId,
                        principalTable: "EventEditions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TelegramChatSubscriptions_TelegramChats_TelegramChatId",
                        column: x => x.TelegramChatId,
                        principalTable: "TelegramChats",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TelegramCommandLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TelegramChatId = table.Column<Guid>(type: "uuid", nullable: true),
                    TelegramUserId = table.Column<long>(type: "bigint", nullable: true),
                    TelegramUsername = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Command = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Arguments = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Status = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    ResponsePreview = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TelegramCommandLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TelegramCommandLogs_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_TelegramCommandLogs_TelegramChats_TelegramChatId",
                        column: x => x.TelegramChatId,
                        principalTable: "TelegramChats",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TelegramChats_ChatId",
                table: "TelegramChats",
                column: "ChatId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TelegramChats_Kind_IsActive",
                table: "TelegramChats",
                columns: new[] { "Kind", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_TelegramChatSubscriptions_CreatedByUserId",
                table: "TelegramChatSubscriptions",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TelegramChatSubscriptions_EventEditionId_SubscriptionType_I~",
                table: "TelegramChatSubscriptions",
                columns: new[] { "EventEditionId", "SubscriptionType", "IsEnabled" });

            migrationBuilder.CreateIndex(
                name: "IX_TelegramChatSubscriptions_TelegramChatId_EventEditionId_Sub~",
                table: "TelegramChatSubscriptions",
                columns: new[] { "TelegramChatId", "EventEditionId", "SubscriptionType", "MessageThreadId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TelegramCommandLogs_CreatedAtUtc_Status",
                table: "TelegramCommandLogs",
                columns: new[] { "CreatedAtUtc", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_TelegramCommandLogs_TelegramChatId",
                table: "TelegramCommandLogs",
                column: "TelegramChatId");

            migrationBuilder.CreateIndex(
                name: "IX_TelegramCommandLogs_TelegramUserId_CreatedAtUtc",
                table: "TelegramCommandLogs",
                columns: new[] { "TelegramUserId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_TelegramCommandLogs_UserId",
                table: "TelegramCommandLogs",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TelegramChatSubscriptions");

            migrationBuilder.DropTable(
                name: "TelegramCommandLogs");

            migrationBuilder.DropTable(
                name: "TelegramChats");
        }
    }
}
