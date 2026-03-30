using Blagodaty.Api.Models;
using Blagodaty.Api.Options;
using Blagodaty.Api.Security;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Blagodaty.Api.Data;

public static class AppDbSeeder
{
    public static async Task SeedAsync(IServiceProvider services)
    {
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        var seedOptions = services.GetRequiredService<IOptions<SeedOptions>>().Value;

        foreach (var role in AppRoles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole<Guid>(role));
            }
        }

        if (await userManager.Users.AnyAsync())
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(seedOptions.AdminEmail) || string.IsNullOrWhiteSpace(seedOptions.AdminPassword))
        {
            return;
        }

        var admin = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = seedOptions.AdminEmail,
            Email = seedOptions.AdminEmail,
            FirstName = "Blagodaty",
            LastName = "Admin",
            DisplayName = seedOptions.AdminDisplayName,
            EmailConfirmed = true,
            CreatedAtUtc = DateTime.UtcNow
        };

        var result = await userManager.CreateAsync(admin, seedOptions.AdminPassword);
        if (!result.Succeeded)
        {
            var message = string.Join("; ", result.Errors.Select(error => error.Description));
            throw new InvalidOperationException($"Unable to create seeded admin user: {message}");
        }

        var roleResult = await userManager.AddToRolesAsync(admin, [AppRoles.Member, AppRoles.Admin]);
        if (!roleResult.Succeeded)
        {
            var message = string.Join("; ", roleResult.Errors.Select(error => error.Description));
            throw new InvalidOperationException($"Unable to assign seeded admin roles: {message}");
        }
    }
}
