namespace Blagodaty.Api.Contracts.Admin;

public sealed class AdminExternalAuthDiagnosticDto
{
    public required string Key { get; init; }
    public required string Title { get; init; }
    public bool Ok { get; init; }
    public string? Message { get; init; }
}
