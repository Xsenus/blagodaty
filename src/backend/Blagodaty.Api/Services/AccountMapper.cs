using Blagodaty.Api.Contracts.Account;
using Blagodaty.Api.Contracts.Admin;
using Blagodaty.Api.Models;

namespace Blagodaty.Api.Services;

public static class AccountMapper
{
    public static UserSummaryDto ToUserSummary(ApplicationUser user, IReadOnlyCollection<string> roles)
    {
        return new UserSummaryDto
        {
            Id = user.Id,
            Email = TechnicalEmailHelper.ToVisibleEmail(user.Email),
            DisplayName = user.DisplayName,
            FirstName = user.FirstName,
            LastName = user.LastName,
            City = user.City,
            ChurchName = user.ChurchName,
            PhoneNumber = user.PhoneNumber,
            Roles = roles
        };
    }

    public static ExternalIdentityDto ToExternalIdentity(UserExternalIdentity identity)
    {
        return new ExternalIdentityDto
        {
            Provider = identity.Provider,
            DisplayName = GetExternalIdentityDisplayName(identity),
            ProviderUsername = identity.ProviderUsername,
            ProviderEmail = TechnicalEmailHelper.ToVisibleEmail(identity.ProviderEmail),
            ProviderEmailVerified = identity.ProviderEmailVerified,
            AvatarUrl = identity.AvatarUrl,
            ProfileUrl = identity.ProfileUrl,
            CreatedAtUtc = identity.CreatedAtUtc,
            VerifiedAtUtc = identity.VerifiedAtUtc,
            LastUsedAtUtc = identity.LastUsedAtUtc
        };
    }

    public static AdminUserDto ToAdminUser(
        ApplicationUser user,
        IReadOnlyCollection<string> roles,
        RegistrationStatus? registrationStatus,
        DateTime? registrationUpdatedAtUtc,
        IReadOnlyCollection<ExternalIdentityDto> externalIdentities)
    {
        return new AdminUserDto
        {
            Id = user.Id,
            Email = TechnicalEmailHelper.ToVisibleEmail(user.Email),
            DisplayName = user.DisplayName,
            FirstName = user.FirstName,
            LastName = user.LastName,
            City = user.City,
            ChurchName = user.ChurchName,
            PhoneNumber = user.PhoneNumber,
            Roles = roles,
            CreatedAtUtc = user.CreatedAtUtc,
            LastLoginAtUtc = user.LastLoginAtUtc,
            RegistrationStatus = registrationStatus,
            RegistrationUpdatedAtUtc = registrationUpdatedAtUtc,
            ExternalIdentities = externalIdentities
        };
    }

    private static string GetExternalIdentityDisplayName(UserExternalIdentity identity)
    {
        if (!string.IsNullOrWhiteSpace(identity.DisplayName))
        {
            return identity.DisplayName.Trim();
        }

        if (!string.IsNullOrWhiteSpace(identity.ProviderUsername))
        {
            return identity.ProviderUsername.Trim();
        }

        return identity.Provider switch
        {
            "google" => "Google",
            "vk" => "VK",
            "yandex" => "Yandex",
            "telegram" => "Telegram",
            _ => identity.Provider
        };
    }
}
