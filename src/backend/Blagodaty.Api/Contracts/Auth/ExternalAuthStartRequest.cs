using System.ComponentModel.DataAnnotations;

namespace Blagodaty.Api.Contracts.Auth;

public sealed class ExternalAuthStartRequest
{
    [Required]
    public string Provider { get; init; } = string.Empty;

    public string? Intent { get; init; }
    public string? ReturnUrl { get; init; }
}
