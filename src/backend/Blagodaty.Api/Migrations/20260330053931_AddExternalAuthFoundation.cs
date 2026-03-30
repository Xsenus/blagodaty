using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blagodaty.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddExternalAuthFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AppSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Value = table.Column<string>(type: "text", nullable: true),
                    Description = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    IsSecret = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AppSettings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AuthEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Provider = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    EventType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Detail = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuthEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuthEvents_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ExternalAuthRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Provider = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    State = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    ReturnUrl = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    Intent = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ErrorMessage = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CodeVerifier = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    DeviceId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CompletedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ConsumedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExternalAuthRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExternalAuthRequests_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TelegramAuthRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    State = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    ReturnUrl = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    Intent = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ErrorMessage = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    TelegramUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    TelegramUsername = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    TelegramDisplayName = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: true),
                    TelegramChatId = table.Column<long>(type: "bigint", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CompletedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ConsumedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TelegramAuthRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TelegramAuthRequests_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "UserExternalIdentities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ProviderUserId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ProviderEmail = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    ProviderEmailVerified = table.Column<bool>(type: "boolean", nullable: false),
                    ProviderUsername = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    DisplayName = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: true),
                    AvatarUrl = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    ProfileUrl = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    RawProfileJson = table.Column<string>(type: "character varying(16000)", maxLength: 16000, nullable: true),
                    TelegramChatId = table.Column<long>(type: "bigint", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    VerifiedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastUsedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastSyncedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserExternalIdentities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserExternalIdentities_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AppSettings_Key",
                table: "AppSettings",
                column: "Key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AuthEvents_CreatedAtUtc_Provider",
                table: "AuthEvents",
                columns: new[] { "CreatedAtUtc", "Provider" });

            migrationBuilder.CreateIndex(
                name: "IX_AuthEvents_UserId_CreatedAtUtc",
                table: "AuthEvents",
                columns: new[] { "UserId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_ExternalAuthRequests_Provider_State",
                table: "ExternalAuthRequests",
                columns: new[] { "Provider", "State" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ExternalAuthRequests_State",
                table: "ExternalAuthRequests",
                column: "State",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ExternalAuthRequests_UserId",
                table: "ExternalAuthRequests",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_TelegramAuthRequests_State",
                table: "TelegramAuthRequests",
                column: "State",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TelegramAuthRequests_TelegramUserId",
                table: "TelegramAuthRequests",
                column: "TelegramUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TelegramAuthRequests_UserId",
                table: "TelegramAuthRequests",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserExternalIdentities_Provider_ProviderUserId",
                table: "UserExternalIdentities",
                columns: new[] { "Provider", "ProviderUserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserExternalIdentities_UserId_Provider",
                table: "UserExternalIdentities",
                columns: new[] { "UserId", "Provider" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AppSettings");

            migrationBuilder.DropTable(
                name: "AuthEvents");

            migrationBuilder.DropTable(
                name: "ExternalAuthRequests");

            migrationBuilder.DropTable(
                name: "TelegramAuthRequests");

            migrationBuilder.DropTable(
                name: "UserExternalIdentities");
        }
    }
}
