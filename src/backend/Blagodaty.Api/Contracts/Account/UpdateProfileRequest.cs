using System.ComponentModel.DataAnnotations;

namespace Blagodaty.Api.Contracts.Account;

public sealed class UpdateProfileRequest
{
    [Required, MaxLength(80)]
    public string FirstName { get; set; } = string.Empty;

    [Required, MaxLength(80)]
    public string LastName { get; set; } = string.Empty;

    [Required, MaxLength(120)]
    public string DisplayName { get; set; } = string.Empty;

    [Phone, MaxLength(32)]
    public string? PhoneNumber { get; set; }

    [MaxLength(120)]
    public string? City { get; set; }

    [MaxLength(180)]
    public string? ChurchName { get; set; }
}
