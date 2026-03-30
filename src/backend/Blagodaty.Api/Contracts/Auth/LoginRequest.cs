using System.ComponentModel.DataAnnotations;

namespace Blagodaty.Api.Contracts.Auth;

public sealed class LoginRequest
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(128)]
    public string Password { get; set; } = string.Empty;
}
