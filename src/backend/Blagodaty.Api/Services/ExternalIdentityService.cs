using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Security;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Services;

public sealed record ExternalIdentityProfile(
    string Provider,
    string ProviderUserId,
    string? Email,
    bool EmailVerified,
    string? Username,
    string? DisplayName,
    string? AvatarUrl,
    string? ProfileUrl = null,
    long? TelegramChatId = null,
    string? RawProfileJson = null);

public sealed class ExternalIdentityService
{
    private readonly AppDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly TimeProvider _timeProvider;

    public ExternalIdentityService(
        AppDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _timeProvider = timeProvider;
    }

    public async Task<UserExternalIdentity?> FindExternalIdentityAsync(
        string provider,
        string providerUserId,
        CancellationToken cancellationToken = default)
    {
        var normalizedProvider = TechnicalEmailHelper.NormalizeProvider(provider);
        var normalizedUserId = (providerUserId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedProvider) || string.IsNullOrWhiteSpace(normalizedUserId))
        {
            return null;
        }

        return await _dbContext.UserExternalIdentities
            .Include(identity => identity.User)
            .FirstOrDefaultAsync(
                identity => identity.Provider == normalizedProvider && identity.ProviderUserId == normalizedUserId,
                cancellationToken);
    }

    public async Task<ApplicationUser> ResolveOrCreateExternalUserAsync(
        ExternalIdentityProfile profile,
        CancellationToken cancellationToken = default)
    {
        var normalizedProvider = TechnicalEmailHelper.NormalizeProvider(profile.Provider);
        var providerUserId = (profile.ProviderUserId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedProvider) || string.IsNullOrWhiteSpace(providerUserId))
        {
            throw new InvalidOperationException("External auth provider is invalid.");
        }

        var confirmedEmail = profile.EmailVerified
            ? TechnicalEmailHelper.NormalizeRealEmail(profile.Email)
            : null;

        var identity = await _dbContext.UserExternalIdentities
            .Include(item => item.User)
            .FirstOrDefaultAsync(
                item => item.Provider == normalizedProvider && item.ProviderUserId == providerUserId,
                cancellationToken);

        var user = identity?.User;
        if (user is null && !string.IsNullOrWhiteSpace(confirmedEmail))
        {
            user = await _userManager.Users.FirstOrDefaultAsync(item => item.Email == confirmedEmail, cancellationToken);
        }

        if (user is null)
        {
            var email = confirmedEmail ?? TechnicalEmailHelper.BuildTechnicalEmail(normalizedProvider, providerUserId);
            user = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                UserName = email,
                Email = email,
                EmailConfirmed = !string.IsNullOrWhiteSpace(confirmedEmail),
                FirstName = ExtractFirstName(profile.DisplayName),
                LastName = ExtractLastName(profile.DisplayName),
                DisplayName = NormalizeDisplayName(profile),
                CreatedAtUtc = _timeProvider.GetUtcNow().UtcDateTime
            };

            var createResult = await _userManager.CreateAsync(user);
            if (!createResult.Succeeded)
            {
                throw BuildIdentityException(createResult);
            }

            var roleResult = await _userManager.AddToRoleAsync(user, AppRoles.Member);
            if (!roleResult.Succeeded)
            {
                throw BuildIdentityException(roleResult);
            }
        }
        else
        {
            ApplyUserProfile(user, profile, confirmedEmail);

            var updateResult = await _userManager.UpdateAsync(user);
            if (!updateResult.Succeeded)
            {
                throw BuildIdentityException(updateResult);
            }
        }

        await UpsertExternalIdentityAsync(user.Id, profile, cancellationToken);
        return user;
    }

    public async Task<UserExternalIdentity> AttachExternalIdentityAsync(
        Guid userId,
        ExternalIdentityProfile profile,
        CancellationToken cancellationToken = default)
    {
        var normalizedProvider = TechnicalEmailHelper.NormalizeProvider(profile.Provider);
        var providerUserId = (profile.ProviderUserId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedProvider) || string.IsNullOrWhiteSpace(providerUserId))
        {
            throw new InvalidOperationException("External auth provider is invalid.");
        }

        var user = await _userManager.Users.FirstOrDefaultAsync(item => item.Id == userId, cancellationToken)
            ?? throw new InvalidOperationException("User was not found.");

        var existingIdentity = await _dbContext.UserExternalIdentities
            .FirstOrDefaultAsync(
                identity => identity.Provider == normalizedProvider && identity.ProviderUserId == providerUserId,
                cancellationToken);

        if (existingIdentity is not null && existingIdentity.UserId != userId)
        {
            throw new InvalidOperationException("This external account is already linked to another user.");
        }

        ApplyUserProfile(
            user,
            profile,
            profile.EmailVerified ? TechnicalEmailHelper.NormalizeRealEmail(profile.Email) : null);

        var updateResult = await _userManager.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            throw BuildIdentityException(updateResult);
        }

        return await UpsertExternalIdentityAsync(userId, profile, cancellationToken);
    }

    public async Task<bool> DetachExternalIdentityAsync(
        Guid userId,
        string provider,
        CancellationToken cancellationToken = default)
    {
        var normalizedProvider = TechnicalEmailHelper.NormalizeProvider(provider);
        if (string.IsNullOrWhiteSpace(normalizedProvider))
        {
            throw new InvalidOperationException("External auth provider is invalid.");
        }

        var user = await _userManager.Users.FirstOrDefaultAsync(item => item.Id == userId, cancellationToken)
            ?? throw new InvalidOperationException("User was not found.");

        var identitiesToRemove = await _dbContext.UserExternalIdentities
            .Where(identity => identity.UserId == userId && identity.Provider == normalizedProvider)
            .ToListAsync(cancellationToken);

        if (identitiesToRemove.Count == 0)
        {
            return false;
        }

        var hasPassword = !string.IsNullOrWhiteSpace(user.PasswordHash);
        var hasVisibleEmail = TechnicalEmailHelper.IsValidRealEmail(user.Email);
        var remainingExternalIdentityCount = await _dbContext.UserExternalIdentities
            .CountAsync(identity => identity.UserId == userId && identity.Provider != normalizedProvider, cancellationToken);

        if (!hasPassword && !hasVisibleEmail && remainingExternalIdentityCount == 0)
        {
            throw new InvalidOperationException("Cannot unlink the last sign-in method.");
        }

        _dbContext.UserExternalIdentities.RemoveRange(identitiesToRemove);

        if (normalizedProvider == "telegram")
        {
            var requests = await _dbContext.TelegramAuthRequests
                .Where(item => item.UserId == userId)
                .ToListAsync(cancellationToken);

            foreach (var request in requests)
            {
                request.UserId = null;
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task<UserExternalIdentity> UpsertExternalIdentityAsync(
        Guid userId,
        ExternalIdentityProfile profile,
        CancellationToken cancellationToken)
    {
        var normalizedProvider = TechnicalEmailHelper.NormalizeProvider(profile.Provider);
        var providerUserId = (profile.ProviderUserId ?? string.Empty).Trim();
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        var identity = await _dbContext.UserExternalIdentities
            .FirstOrDefaultAsync(
                item => item.Provider == normalizedProvider && item.ProviderUserId == providerUserId,
                cancellationToken);

        if (identity is null)
        {
            identity = new UserExternalIdentity
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Provider = normalizedProvider,
                ProviderUserId = providerUserId,
                CreatedAtUtc = now
            };

            _dbContext.UserExternalIdentities.Add(identity);
        }

        identity.UserId = userId;
        identity.ProviderEmail = profile.EmailVerified ? TechnicalEmailHelper.NormalizeRealEmail(profile.Email) : AppSettingsService.NormalizeValue(profile.Email);
        identity.ProviderEmailVerified = profile.EmailVerified;
        identity.ProviderUsername = AppSettingsService.NormalizeValue(profile.Username);
        identity.DisplayName = AppSettingsService.NormalizeValue(profile.DisplayName);
        identity.AvatarUrl = AppSettingsService.NormalizeValue(profile.AvatarUrl);
        identity.ProfileUrl = AppSettingsService.NormalizeValue(profile.ProfileUrl);
        identity.RawProfileJson = AppSettingsService.NormalizeValue(profile.RawProfileJson);
        identity.TelegramChatId = profile.TelegramChatId ?? identity.TelegramChatId;
        identity.VerifiedAtUtc ??= now;
        identity.LastUsedAtUtc = now;
        identity.LastSyncedAtUtc = now;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return identity;
    }

    private static void ApplyUserProfile(ApplicationUser user, ExternalIdentityProfile profile, string? confirmedEmail)
    {
        if (!string.IsNullOrWhiteSpace(confirmedEmail) &&
            (TechnicalEmailHelper.IsTechnicalEmail(user.Email) || string.IsNullOrWhiteSpace(user.Email)))
        {
            user.Email = confirmedEmail;
            user.UserName = confirmedEmail;
            user.EmailConfirmed = true;
        }

        var displayName = NormalizeDisplayName(profile);
        if (!string.IsNullOrWhiteSpace(displayName) && string.IsNullOrWhiteSpace(user.DisplayName))
        {
            user.DisplayName = displayName;
        }

        if (string.IsNullOrWhiteSpace(user.FirstName))
        {
            user.FirstName = ExtractFirstName(profile.DisplayName);
        }

        if (string.IsNullOrWhiteSpace(user.LastName))
        {
            user.LastName = ExtractLastName(profile.DisplayName);
        }
    }

    private static string NormalizeDisplayName(ExternalIdentityProfile profile)
    {
        if (!string.IsNullOrWhiteSpace(profile.DisplayName))
        {
            return profile.DisplayName.Trim();
        }

        if (!string.IsNullOrWhiteSpace(profile.Username))
        {
            return profile.Username.Trim();
        }

        return profile.Provider switch
        {
            "google" => "Google user",
            "vk" => "VK user",
            "yandex" => "Yandex user",
            "telegram" => "Telegram user",
            _ => "Participant"
        };
    }

    private static string ExtractFirstName(string? displayName)
    {
        var normalized = AppSettingsService.NormalizeValue(displayName);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        return normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? string.Empty;
    }

    private static string ExtractLastName(string? displayName)
    {
        var normalized = AppSettingsService.NormalizeValue(displayName);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var parts = normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 1 ? string.Join(' ', parts.Skip(1)) : string.Empty;
    }

    private static InvalidOperationException BuildIdentityException(IdentityResult result)
    {
        return new InvalidOperationException(string.Join("; ", result.Errors.Select(error => error.Description)));
    }
}
