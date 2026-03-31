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
    public DbSet<EventSeries> EventSeries => Set<EventSeries>();
    public DbSet<EventEdition> EventEditions => Set<EventEdition>();
    public DbSet<EventPriceOption> EventPriceOptions => Set<EventPriceOption>();
    public DbSet<EventScheduleItem> EventScheduleItems => Set<EventScheduleItem>();
    public DbSet<EventContentBlock> EventContentBlocks => Set<EventContentBlock>();
    public DbSet<EventMediaItem> EventMediaItems => Set<EventMediaItem>();
    public DbSet<GalleryAsset> GalleryAssets => Set<GalleryAsset>();
    public DbSet<RefreshSession> RefreshSessions => Set<RefreshSession>();
    public DbSet<AppSetting> AppSettings => Set<AppSetting>();
    public DbSet<UserExternalIdentity> UserExternalIdentities => Set<UserExternalIdentity>();
    public DbSet<ExternalAuthRequest> ExternalAuthRequests => Set<ExternalAuthRequest>();
    public DbSet<TelegramAuthRequest> TelegramAuthRequests => Set<TelegramAuthRequest>();
    public DbSet<TelegramChat> TelegramChats => Set<TelegramChat>();
    public DbSet<TelegramChatSubscription> TelegramChatSubscriptions => Set<TelegramChatSubscription>();
    public DbSet<TelegramCommandLog> TelegramCommandLogs => Set<TelegramCommandLog>();
    public DbSet<TelegramSubscriptionDeliveryLog> TelegramSubscriptionDeliveryLogs => Set<TelegramSubscriptionDeliveryLog>();
    public DbSet<AuthEvent> AuthEvents => Set<AuthEvent>();
    public DbSet<UserNotification> UserNotifications => Set<UserNotification>();

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
            entity.HasIndex(x => x.CreatedAtUtc);
            entity.HasIndex(x => x.LastLoginAtUtc);
            entity.HasMany(x => x.ExternalIdentities)
                .WithOne(x => x.User)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.CampRegistrations)
                .WithOne(x => x.User)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.Notifications)
                .WithOne(x => x.User)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<EventSeries>(entity =>
        {
            entity.HasIndex(x => x.Slug).IsUnique();
            entity.Property(x => x.Slug).HasMaxLength(120);
            entity.Property(x => x.Title).HasMaxLength(180);
            entity.Property(x => x.Kind).HasConversion<string>().HasMaxLength(32);
        });

        builder.Entity<EventEdition>(entity =>
        {
            entity.HasIndex(x => x.Slug).IsUnique();
            entity.HasIndex(x => new { x.Status, x.StartsAtUtc });
            entity.HasIndex(x => x.RegistrationClosesAtUtc);
            entity.Property(x => x.Slug).HasMaxLength(140);
            entity.Property(x => x.Title).HasMaxLength(220);
            entity.Property(x => x.SeasonLabel).HasMaxLength(80);
            entity.Property(x => x.ShortDescription).HasMaxLength(600);
            entity.Property(x => x.FullDescription).HasMaxLength(8000);
            entity.Property(x => x.Location).HasMaxLength(220);
            entity.Property(x => x.Timezone).HasMaxLength(64);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.HasOne(x => x.EventSeries)
                .WithMany(x => x.Editions)
                .HasForeignKey(x => x.EventSeriesId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<EventPriceOption>(entity =>
        {
            entity.HasIndex(x => new { x.EventEditionId, x.Code }).IsUnique();
            entity.HasIndex(x => new { x.EventEditionId, x.IsActive, x.SortOrder });
            entity.Property(x => x.Code).HasMaxLength(64);
            entity.Property(x => x.Title).HasMaxLength(180);
            entity.Property(x => x.Description).HasMaxLength(1000);
            entity.Property(x => x.Currency).HasMaxLength(8);
            entity.Property(x => x.Amount).HasPrecision(12, 2);
            entity.HasOne(x => x.EventEdition)
                .WithMany(x => x.PriceOptions)
                .HasForeignKey(x => x.EventEditionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<EventScheduleItem>(entity =>
        {
            entity.HasIndex(x => new { x.EventEditionId, x.SortOrder });
            entity.Property(x => x.Title).HasMaxLength(180);
            entity.Property(x => x.Kind).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Location).HasMaxLength(220);
            entity.Property(x => x.Notes).HasMaxLength(2000);
            entity.HasOne(x => x.EventEdition)
                .WithMany(x => x.ScheduleItems)
                .HasForeignKey(x => x.EventEditionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<EventContentBlock>(entity =>
        {
            entity.HasIndex(x => new { x.EventEditionId, x.BlockType, x.SortOrder });
            entity.Property(x => x.BlockType).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Title).HasMaxLength(180);
            entity.Property(x => x.Body).HasMaxLength(8000);
            entity.HasOne(x => x.EventEdition)
                .WithMany(x => x.ContentBlocks)
                .HasForeignKey(x => x.EventEditionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<EventMediaItem>(entity =>
        {
            entity.HasIndex(x => new { x.EventEditionId, x.SortOrder });
            entity.Property(x => x.Type).HasConversion<string>().HasMaxLength(16);
            entity.Property(x => x.Url).HasMaxLength(2000);
            entity.Property(x => x.ThumbnailUrl).HasMaxLength(2000);
            entity.Property(x => x.Title).HasMaxLength(180);
            entity.Property(x => x.Caption).HasMaxLength(1000);
            entity.HasOne(x => x.EventEdition)
                .WithMany(x => x.MediaItems)
                .HasForeignKey(x => x.EventEditionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<GalleryAsset>(entity =>
        {
            entity.HasIndex(x => x.CreatedAtUtc);
            entity.Property(x => x.Kind).HasConversion<string>().HasMaxLength(16);
            entity.Property(x => x.Name).HasMaxLength(180);
            entity.Property(x => x.Description).HasMaxLength(1000);
            entity.Property(x => x.ContentType).HasMaxLength(200);
            entity.Property(x => x.FileExtension).HasMaxLength(32);
            entity.Property(x => x.OriginalFileName).HasMaxLength(260);
            entity.Property(x => x.DiskPath).HasMaxLength(1024);
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
            entity.HasIndex(x => new { x.EventEditionId, x.UserId }).IsUnique();
            entity.HasIndex(x => x.EventEditionId);
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.UpdatedAtUtc);
            entity.HasIndex(x => new { x.EventEditionId, x.Status, x.UpdatedAtUtc });
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
            entity.HasOne(x => x.EventEdition)
                .WithMany(x => x.Registrations)
                .HasForeignKey(x => x.EventEditionId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(x => x.SelectedPriceOption)
                .WithMany(x => x.Registrations)
                .HasForeignKey(x => x.SelectedPriceOptionId)
                .OnDelete(DeleteBehavior.SetNull);
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

        builder.Entity<TelegramChat>(entity =>
        {
            entity.HasIndex(x => x.ChatId).IsUnique();
            entity.HasIndex(x => new { x.Kind, x.IsActive });
            entity.Property(x => x.Kind).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.Title).HasMaxLength(240);
            entity.Property(x => x.Username).HasMaxLength(120);
        });

        builder.Entity<TelegramChatSubscription>(entity =>
        {
            entity.HasIndex(x => new { x.TelegramChatId, x.EventEditionId, x.SubscriptionType, x.MessageThreadId }).IsUnique();
            entity.HasIndex(x => new { x.EventEditionId, x.SubscriptionType, x.IsEnabled });
            entity.Property(x => x.SubscriptionType).HasConversion<string>().HasMaxLength(48);
            entity.HasOne(x => x.Chat)
                .WithMany(x => x.Subscriptions)
                .HasForeignKey(x => x.TelegramChatId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.EventEdition)
                .WithMany()
                .HasForeignKey(x => x.EventEditionId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.CreatedByUser)
                .WithMany()
                .HasForeignKey(x => x.CreatedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<TelegramCommandLog>(entity =>
        {
            entity.HasIndex(x => new { x.CreatedAtUtc, x.Status });
            entity.HasIndex(x => new { x.TelegramUserId, x.CreatedAtUtc });
            entity.Property(x => x.Command).HasMaxLength(64);
            entity.Property(x => x.Arguments).HasMaxLength(1000);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.TelegramUsername).HasMaxLength(120);
            entity.Property(x => x.ResponsePreview).HasMaxLength(2000);
            entity.HasOne(x => x.Chat)
                .WithMany(x => x.CommandLogs)
                .HasForeignKey(x => x.TelegramChatId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<TelegramSubscriptionDeliveryLog>(entity =>
        {
            entity.HasIndex(x => new { x.TelegramChatSubscriptionId, x.NotificationKey }).IsUnique();
            entity.HasIndex(x => x.SentAtUtc);
            entity.Property(x => x.NotificationKey).HasMaxLength(180);
            entity.HasOne(x => x.Subscription)
                .WithMany(x => x.DeliveryLogs)
                .HasForeignKey(x => x.TelegramChatSubscriptionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<AuthEvent>(entity =>
        {
            entity.HasIndex(x => new { x.CreatedAtUtc, x.Provider });
            entity.HasIndex(x => new { x.UserId, x.CreatedAtUtc });
            entity.Property(x => x.Provider).HasMaxLength(32);
            entity.Property(x => x.EventType).HasMaxLength(64);
            entity.Property(x => x.Detail).HasMaxLength(1024);
        });

        builder.Entity<UserNotification>(entity =>
        {
            entity.HasIndex(x => new { x.UserId, x.IsRead, x.CreatedAtUtc });
            entity.HasIndex(x => new { x.UserId, x.DeduplicationKey }).IsUnique();
            entity.Property(x => x.Type).HasConversion<string>().HasMaxLength(64);
            entity.Property(x => x.Severity).HasConversion<string>().HasMaxLength(16);
            entity.Property(x => x.Title).HasMaxLength(240);
            entity.Property(x => x.Message).HasMaxLength(2000);
            entity.Property(x => x.LinkUrl).HasMaxLength(512);
            entity.Property(x => x.DeduplicationKey).HasMaxLength(220);
            entity.HasOne(x => x.EventEdition)
                .WithMany()
                .HasForeignKey(x => x.EventEditionId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(x => x.Registration)
                .WithMany()
                .HasForeignKey(x => x.RegistrationId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }
}
