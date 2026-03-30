using System.ComponentModel.DataAnnotations;

namespace Blagodaty.Api.Contracts.Auth;

public sealed class RefreshRequest
{
    [Required, MinLength(24), MaxLength(512)]
    public string RefreshToken { get; set; } = string.Empty;
}
