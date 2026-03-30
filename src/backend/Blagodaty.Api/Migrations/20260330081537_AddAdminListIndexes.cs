using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blagodaty.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAdminListIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_CampRegistrations_Status",
                table: "CampRegistrations",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_CampRegistrations_Status_UpdatedAtUtc",
                table: "CampRegistrations",
                columns: new[] { "Status", "UpdatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_CampRegistrations_UpdatedAtUtc",
                table: "CampRegistrations",
                column: "UpdatedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_CreatedAtUtc",
                table: "AspNetUsers",
                column: "CreatedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_LastLoginAtUtc",
                table: "AspNetUsers",
                column: "LastLoginAtUtc");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CampRegistrations_Status",
                table: "CampRegistrations");

            migrationBuilder.DropIndex(
                name: "IX_CampRegistrations_Status_UpdatedAtUtc",
                table: "CampRegistrations");

            migrationBuilder.DropIndex(
                name: "IX_CampRegistrations_UpdatedAtUtc",
                table: "CampRegistrations");

            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_CreatedAtUtc",
                table: "AspNetUsers");

            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_LastLoginAtUtc",
                table: "AspNetUsers");
        }
    }
}
