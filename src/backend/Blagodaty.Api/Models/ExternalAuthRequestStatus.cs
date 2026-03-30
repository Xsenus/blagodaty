namespace Blagodaty.Api.Models;

public enum ExternalAuthRequestStatus
{
    Pending = 0,
    Completed = 1,
    Consumed = 2,
    Failed = 3,
    Expired = 4
}
