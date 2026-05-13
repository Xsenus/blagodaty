using Blagodaty.Api.Models;

namespace Blagodaty.Api.Contracts.Admin;

public sealed class UpdateRegistrationStatusRequest
{
    public RegistrationStatus Status { get; init; }
}

public sealed class UpdateRegistrationPaymentRequest
{
    public bool IsPaid { get; init; }
}
