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
    public DbSet<AppSetting> AppSettings => Set<AppSetting>();
    public DbSet<UserExternalIdentity> UserExternalIdentities => Set<UserExternalIdentity>();
    public DbSet<ExternalAuthRequest> ExternalAuthRequests => Set<ExternalAuthRequest>();
    public DbSet<TelegramAuthRequest> TelegramAuthRequests => Set<TelegramAuthRequest>();
    public DbSet<AuthEvent> AuthEvents => Set<AuthEvent>();

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
            entity.HasMany(x => x.ExternalIdentities)
                .WithOne(x => x.User)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
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

        builder.Entity<AppSetting>(entity =>
        {
            entity.HasIndex(x => x.Key).IsUnique();
            entity.Property(x => x.Key).HasMaxLength(120);
            entity.Property(x => x.Description).HasMaxLength(512);
        });

        builder.Entity<UserExternalIdentity>(entity =>
        {
            entity.HasIndex(x => new { x.Provider, x.ProviderUserId }).IsUnique();
            entity.HasIndex(x => new { x.UserId, x.Provider });
            entity.Property(x => x.Provider).HasMaxLength(32);
            entity.Property(x => x.ProviderUserId).HasMaxLength(200);
            entity.Property(x => x.ProviderEmail).HasMaxLength(320);
            entity.Property(x => x.ProviderUsername).HasMaxLength(120);
            entity.Property(x => x.DisplayName).HasMaxLength(180);
            entity.Property(x => x.AvatarUrl).HasMaxLength(1024);
            entity.Property(x => x.ProfileUrl).HasMaxLength(1024);
            entity.Property(x => x.RawProfileJson).HasMaxLength(16000);
        });

        builder.Entity<ExternalAuthRequest>(entity =>
        {
            entity.HasIndex(x => x.State).IsUnique();
            entity.HasIndex(x => new { x.Provider, x.State }).IsUnique();
            entity.Property(x => x.Provider).HasMaxLength(32);
            entity.Property(x => x.State).HasMaxLength(80);
            entity.Property(x => x.ReturnUrl).HasMaxLength(512);
            entity.Property(x => x.Intent).HasConversion<string>().HasMaxLength(16);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            entity.Property(x => x.ErrorMessage).HasMaxLength(1000);
            entity.Property(x => x.CodeVerifier).HasMaxLength(512);
            entity.Property(x => x.DeviceId).HasMaxLength(128);
        });

        builder.Entity<TelegramAuthRequest>(entity =>
        {
            entity.HasIndex(x => x.State).IsUnique();
            entity.HasIndex(x => x.TelegramUserId);
            entity.Property(x => x.State).HasMaxLength(80);
            entity.Property(x => x.ReturnUrl).HasMaxLength(512);
            entity.Property(x => x.Intent).HasConversion<string>().HasMaxLength(16);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            entity.Property(x => x.ErrorMessage).HasMaxLength(1000);
            entity.Property(x => x.TelegramUserId).HasMaxLength(64);
            entity.Property(x => x.TelegramUsername).HasMaxLength(120);
            entity.Property(x => x.TelegramDisplayName).HasMaxLength(180);
        });

        builder.Entity<AuthEvent>(entity =>
        {
            entity.HasIndex(x => new { x.CreatedAtUtc, x.Provider });
            entity.HasIndex(x => new { x.UserId, x.CreatedAtUtc });
            entity.Property(x => x.Provider).HasMaxLength(32);
            entity.Property(x => x.EventType).HasMaxLength(64);
            entity.Property(x => x.Detail).HasMaxLength(1024);
        });
    }
}
