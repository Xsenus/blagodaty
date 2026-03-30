using Blagodaty.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Data;

public sealed class AppDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public DbSet<CampRegistration> CampRegistrations => Set<CampRegistration>();
    public DbSet<RefreshSession> RefreshSessions => Set<RefreshSession>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ApplicationUser>(entity =>
        {
            entity.Property(x => x.FirstName).HasMaxLength(80);
            entity.Property(x => x.LastName).HasMaxLength(80);
            entity.Property(x => x.DisplayName).HasMaxLength(120);
            entity.Property(x => x.City).HasMaxLength(120);
            entity.Property(x => x.ChurchName).HasMaxLength(180);
        });

        builder.Entity<RefreshSession>(entity =>
        {
            entity.HasIndex(x => x.TokenHash).IsUnique();
            entity.Property(x => x.TokenHash).HasMaxLength(256);
            entity.Property(x => x.CreatedByIp).HasMaxLength(64);
            entity.Property(x => x.UserAgent).HasMaxLength(512);
        });

        builder.Entity<CampRegistration>(entity =>
        {
            entity.HasIndex(x => x.UserId).IsUnique();
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.AccommodationPreference).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.FullName).HasMaxLength(180);
            entity.Property(x => x.City).HasMaxLength(120);
            entity.Property(x => x.ChurchName).HasMaxLength(180);
            entity.Property(x => x.PhoneNumber).HasMaxLength(32);
            entity.Property(x => x.EmergencyContactName).HasMaxLength(180);
            entity.Property(x => x.EmergencyContactPhone).HasMaxLength(32);
            entity.Property(x => x.HealthNotes).HasMaxLength(2000);
            entity.Property(x => x.AllergyNotes).HasMaxLength(2000);
            entity.Property(x => x.SpecialNeeds).HasMaxLength(2000);
            entity.Property(x => x.Motivation).HasMaxLength(2000);
        });
    }
}
