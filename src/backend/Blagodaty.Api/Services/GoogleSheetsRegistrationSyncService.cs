using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Blagodaty.Api.Contracts.Admin;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Services;

public sealed class GoogleSheetsRegistrationSyncService
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly AppSettingsService _appSettingsService;
    private readonly AppDbContext _dbContext;
    private readonly HttpClient _httpClient;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<GoogleSheetsRegistrationSyncService> _logger;

    public GoogleSheetsRegistrationSyncService(
        AppSettingsService appSettingsService,
        AppDbContext dbContext,
        HttpClient httpClient,
        TimeProvider timeProvider,
        ILogger<GoogleSheetsRegistrationSyncService> logger)
    {
        _appSettingsService = appSettingsService;
        _dbContext = dbContext;
        _httpClient = httpClient;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task<AdminGoogleSheetsSyncSettingsResponse> GetAdminAsync(CancellationToken cancellationToken = default)
    {
        var settings = await LoadSettingsAsync(cancellationToken);
        return MapAdmin(settings);
    }

    public async Task<AdminGoogleSheetsSyncSettingsResponse> UpdateAsync(
        UpdateAdminGoogleSheetsSyncSettingsRequest request,
        CancellationToken cancellationToken = default)
    {
        var current = await LoadSettingsAsync(cancellationToken);
        var nextServiceAccountJson = AppSettingsService.NormalizeValue(request.ServiceAccountJson)
            ?? current.ServiceAccountJson;

        var settings = new GoogleSheetsSyncSettingsModel
        {
            Enabled = request.Enabled,
            SpreadsheetId = AppSettingsService.NormalizeValue(request.SpreadsheetId),
            SheetName = AppSettingsService.NormalizeValue(request.SheetName) ?? "Registrations",
            ServiceAccountJson = nextServiceAccountJson,
            LastSyncedAtUtc = current.LastSyncedAtUtc,
            LastError = current.LastError
        };

        await SaveSettingsAsync(settings, cancellationToken);
        return MapAdmin(settings);
    }

    public async Task<AdminGoogleSheetsSyncRunResponse> SyncLatestEventAsync(CancellationToken cancellationToken = default)
    {
        var eventEditionId = await _dbContext.EventEditions
            .AsNoTracking()
            .Where(item => item.EventSeries.Kind == EventKind.Camp && item.Status != EventEditionStatus.Draft)
            .OrderByDescending(item => item.StartsAtUtc)
            .Select(item => (Guid?)item.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (eventEditionId is null)
        {
            return new AdminGoogleSheetsSyncRunResponse
            {
                Synced = false,
                Message = "Не найдено событие для синхронизации."
            };
        }

        return await SyncEventAsync(eventEditionId.Value, cancellationToken);
    }

    public async Task<bool> TrySyncRegistrationEventAsync(Guid? eventEditionId, CancellationToken cancellationToken = default)
    {
        if (eventEditionId is null)
        {
            return false;
        }

        try
        {
            var settings = await LoadSettingsAsync(cancellationToken);
            if (!CanSync(settings))
            {
                return false;
            }

            await SyncEventCoreAsync(settings, eventEditionId.Value, cancellationToken);
            return true;
        }
        catch (Exception error)
        {
            _logger.LogWarning(error, "Google Sheets registration sync failed for event {EventEditionId}", eventEditionId);
            await StoreLastErrorAsync(error.Message, cancellationToken);
            return false;
        }
    }

    private async Task<AdminGoogleSheetsSyncRunResponse> SyncEventAsync(Guid eventEditionId, CancellationToken cancellationToken)
    {
        var settings = await LoadSettingsAsync(cancellationToken);
        if (!CanSync(settings))
        {
            return new AdminGoogleSheetsSyncRunResponse
            {
                Synced = false,
                Message = "Синхронизация не настроена: включите интеграцию, укажите ID таблицы и JSON ключ service account."
            };
        }

        try
        {
            var rowsWritten = await SyncEventCoreAsync(settings, eventEditionId, cancellationToken);
            var syncedAtUtc = _timeProvider.GetUtcNow().UtcDateTime;
            return new AdminGoogleSheetsSyncRunResponse
            {
                Synced = true,
                Message = "Google таблица обновлена.",
                RowsWritten = rowsWritten,
                SyncedAtUtc = syncedAtUtc
            };
        }
        catch (Exception error)
        {
            await StoreLastErrorAsync(error.Message, cancellationToken);
            return new AdminGoogleSheetsSyncRunResponse
            {
                Synced = false,
                Message = error.Message
            };
        }
    }

    private async Task<int> SyncEventCoreAsync(
        GoogleSheetsSyncSettingsModel settings,
        Guid eventEditionId,
        CancellationToken cancellationToken)
    {
        var eventItem = await _dbContext.EventEditions
            .AsNoTracking()
            .Include(item => item.EventSeries)
            .FirstOrDefaultAsync(item => item.Id == eventEditionId, cancellationToken);
        if (eventItem is null)
        {
            throw new InvalidOperationException("Событие для синхронизации не найдено.");
        }

        var registrations = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Include(item => item.User)
            .Include(item => item.SelectedPriceOption)
            .Include(item => item.Participants)
            .Where(item => item.EventEditionId == eventEditionId)
            .OrderBy(item => item.Status)
            .ThenBy(item => item.SubmittedAtUtc ?? item.UpdatedAtUtc)
            .ThenBy(item => item.FullName)
            .ToListAsync(cancellationToken);

        var accessToken = await GetAccessTokenAsync(settings.ServiceAccountJson!, cancellationToken);
        var sheetName = string.IsNullOrWhiteSpace(settings.SheetName) ? "Registrations" : settings.SheetName.Trim();
        var paymentRows = await ReadExistingPaymentRowsAsync(settings.SpreadsheetId!, sheetName, accessToken, cancellationToken);
        var values = BuildRows(eventItem, registrations, paymentRows);
        await ClearSheetAsync(settings.SpreadsheetId!, sheetName, accessToken, cancellationToken);
        await UpdateSheetAsync(settings.SpreadsheetId!, sheetName, accessToken, values, cancellationToken);

        settings = settings with
        {
            LastSyncedAtUtc = _timeProvider.GetUtcNow().UtcDateTime,
            LastError = null
        };
        await SaveSettingsAsync(settings, cancellationToken);
        return Math.Max(values.Count - 1, 0);
    }

    private static List<IReadOnlyList<object>> BuildRows(
        EventEdition eventItem,
        IReadOnlyList<CampRegistration> registrations,
        IReadOnlyDictionary<string, PaymentColumns> paymentRows)
    {
        var rows = new List<IReadOnlyList<object>>
        {
            new object[]
            {
                "Событие",
                eventItem.Title,
                "Сезон",
                eventItem.SeasonLabel ?? string.Empty,
                "Обновлено UTC",
                DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture)
            },
            Array.Empty<object>(),
            new object[]
            {
                "№",
                "ID заявки",
                "Статус",
                "Контактное лицо",
                "Участник",
                "Дата рождения",
                "16-17 лет",
                "Телефон участника",
                "Телефон заявки",
                "Email",
                "Город",
                "Церковь",
                "Тариф",
                "Стоимость",
                "Размещение",
                "Здоровье / аллергии",
                "Пожелания",
                "Оплатил",
                "Сумма внесена",
                "Дата оплаты",
                "Остаток",
                "Комментарий оплаты",
                "Обновлено UTC"
            }
        };

        var rowNumber = 1;
        foreach (var registration in registrations)
        {
            var participants = registration.Participants.Count > 0
                ? registration.Participants.OrderBy(item => item.SortOrder).ToArray()
                : [new CampRegistrationParticipant
                    {
                        FullName = registration.FullName,
                        PhoneNumber = registration.PhoneNumber,
                        BirthDate = registration.BirthDate == default ? null : registration.BirthDate,
                        IsChild = registration.HasChildren,
                        SortOrder = 0
                    }];

            foreach (var participant in participants)
            {
                var participantPhoneNumber = GetParticipantPhoneNumber(participant, registration);
                var paymentKey = BuildPaymentKey(registration.Id, participant.FullName);
                paymentRows.TryGetValue(paymentKey, out var payment);
                var amountPaid = TryParsePaymentAmount(payment?.AmountPaid);
                var balance = CalculateBalance(registration.SelectedPriceOption?.Amount, amountPaid, payment?.Balance);

                rows.Add(new object[]
                {
                    rowNumber++,
                    registration.Id.ToString(),
                    FormatRegistrationStatus(registration.Status),
                    registration.FullName,
                    participant.FullName,
                    participant.BirthDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? string.Empty,
                    participant.IsChild ? "Да" : "Нет",
                    participantPhoneNumber,
                    registration.PhoneNumber,
                    !string.IsNullOrWhiteSpace(registration.ContactEmail)
                        ? registration.ContactEmail
                        : TechnicalEmailHelper.ToVisibleEmail(registration.User.Email),
                    registration.City,
                    registration.ChurchName,
                    registration.SelectedPriceOption?.Title ?? string.Empty,
                    registration.SelectedPriceOption?.Amount ?? 0m,
                    FormatAccommodation(registration.AccommodationPreference),
                    BuildMedicalNotes(registration),
                    registration.Motivation ?? string.Empty,
                    payment?.Payer ?? string.Empty,
                    payment?.AmountPaid ?? string.Empty,
                    payment?.PaidAt ?? string.Empty,
                    balance,
                    payment?.Comment ?? string.Empty,
                    registration.UpdatedAtUtc.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture)
                });
            }
        }

        return rows;
    }

    private async Task<IReadOnlyDictionary<string, PaymentColumns>> ReadExistingPaymentRowsAsync(
        string spreadsheetId,
        string sheetName,
        string accessToken,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"https://sheets.googleapis.com/v4/spreadsheets/{Uri.EscapeDataString(spreadsheetId)}/values/{Uri.EscapeDataString(ToSheetRange(sheetName, "A:AZ"))}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        await EnsureGoogleSuccessAsync(response, cancellationToken);

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        using var document = JsonDocument.Parse(body);
        if (!document.RootElement.TryGetProperty("values", out var valuesElement) ||
            valuesElement.ValueKind != JsonValueKind.Array)
        {
            return new Dictionary<string, PaymentColumns>();
        }

        var rows = valuesElement
            .EnumerateArray()
            .Where(row => row.ValueKind == JsonValueKind.Array)
            .Select(row => row.EnumerateArray().Select(CellToString).ToArray())
            .ToArray();
        if (rows.Length < 4)
        {
            return new Dictionary<string, PaymentColumns>();
        }

        var headers = rows[2]
            .Select((title, index) => new { Title = title.Trim(), Index = index })
            .Where(item => !string.IsNullOrWhiteSpace(item.Title))
            .ToDictionary(item => item.Title, item => item.Index, StringComparer.OrdinalIgnoreCase);

        if (!headers.TryGetValue("ID заявки", out var registrationIdIndex) ||
            !headers.TryGetValue("Участник", out var participantIndex))
        {
            return new Dictionary<string, PaymentColumns>();
        }

        var payerIndex = headers.TryGetValue("Оплатил", out var foundPayerIndex) ? foundPayerIndex : -1;
        var amountPaidIndex = headers.TryGetValue("Сумма внесена", out var foundAmountPaidIndex) ? foundAmountPaidIndex : -1;
        var paidAtIndex = headers.TryGetValue("Дата оплаты", out var foundPaidAtIndex) ? foundPaidAtIndex : -1;
        var balanceIndex = headers.TryGetValue("Остаток", out var foundBalanceIndex) ? foundBalanceIndex : -1;
        var commentIndex = headers.TryGetValue("Комментарий оплаты", out var foundCommentIndex) ? foundCommentIndex : -1;

        var result = new Dictionary<string, PaymentColumns>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows.Skip(3))
        {
            var registrationId = GetCell(row, registrationIdIndex);
            var participantName = GetCell(row, participantIndex);
            if (string.IsNullOrWhiteSpace(registrationId) || string.IsNullOrWhiteSpace(participantName))
            {
                continue;
            }

            var key = BuildPaymentKey(registrationId, participantName);
            result[key] = new PaymentColumns(
                GetCell(row, payerIndex),
                GetCell(row, amountPaidIndex),
                GetCell(row, paidAtIndex),
                GetCell(row, balanceIndex),
                GetCell(row, commentIndex));
        }

        return result;
    }

    private async Task ClearSheetAsync(
        string spreadsheetId,
        string sheetName,
        string accessToken,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"https://sheets.googleapis.com/v4/spreadsheets/{Uri.EscapeDataString(spreadsheetId)}/values/{Uri.EscapeDataString(ToSheetRange(sheetName, "A:AZ"))}:clear");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Content = new StringContent("{}", Encoding.UTF8, "application/json");

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        await EnsureGoogleSuccessAsync(response, cancellationToken);
    }

    private async Task UpdateSheetAsync(
        string spreadsheetId,
        string sheetName,
        string accessToken,
        IReadOnlyCollection<IReadOnlyList<object>> values,
        CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(new { values }, SerializerOptions);
        using var request = new HttpRequestMessage(
            HttpMethod.Put,
            $"https://sheets.googleapis.com/v4/spreadsheets/{Uri.EscapeDataString(spreadsheetId)}/values/{Uri.EscapeDataString(ToSheetRange(sheetName, "A1"))}?valueInputOption=RAW");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Content = new StringContent(payload, Encoding.UTF8, "application/json");

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        await EnsureGoogleSuccessAsync(response, cancellationToken);
    }

    private async Task<string> GetAccessTokenAsync(string serviceAccountJson, CancellationToken cancellationToken)
    {
        using var document = JsonDocument.Parse(serviceAccountJson);
        var root = document.RootElement;
        var clientEmail = root.GetProperty("client_email").GetString();
        var privateKey = root.GetProperty("private_key").GetString();
        var tokenUri = root.TryGetProperty("token_uri", out var tokenUriElement)
            ? tokenUriElement.GetString()
            : "https://oauth2.googleapis.com/token";

        if (string.IsNullOrWhiteSpace(clientEmail) || string.IsNullOrWhiteSpace(privateKey))
        {
            throw new InvalidOperationException("JSON ключ service account должен содержать client_email и private_key.");
        }

        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var jwt = CreateSignedJwt(clientEmail, privateKey, tokenUri!, now);
        var form = new Dictionary<string, string>
        {
            ["grant_type"] = "urn:ietf:params:oauth:grant-type:jwt-bearer",
            ["assertion"] = jwt
        };

        using var response = await _httpClient.PostAsync(tokenUri, new FormUrlEncodedContent(form), cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Google OAuth вернул ошибку {(int)response.StatusCode}: {body}");
        }

        using var tokenDocument = JsonDocument.Parse(body);
        var accessToken = tokenDocument.RootElement.GetProperty("access_token").GetString();
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            throw new InvalidOperationException("Google OAuth не вернул access_token.");
        }

        return accessToken;
    }

    private static string CreateSignedJwt(string clientEmail, string privateKey, string audience, long issuedAt)
    {
        var header = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(new
        {
            alg = "RS256",
            typ = "JWT"
        }));
        var payload = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(new
        {
            iss = clientEmail,
            scope = "https://www.googleapis.com/auth/spreadsheets",
            aud = audience,
            iat = issuedAt,
            exp = issuedAt + 3600
        }));
        var signingInput = $"{header}.{payload}";

        using var rsa = RSA.Create();
        rsa.ImportFromPem(privateKey);
        var signature = rsa.SignData(
            Encoding.ASCII.GetBytes(signingInput),
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);

        return $"{signingInput}.{Base64UrlEncode(signature)}";
    }

    private async Task StoreLastErrorAsync(string message, CancellationToken cancellationToken)
    {
        var settings = await LoadSettingsAsync(cancellationToken);
        await SaveSettingsAsync(settings with { LastError = message }, cancellationToken);
    }

    private async Task SaveSettingsAsync(GoogleSheetsSyncSettingsModel settings, CancellationToken cancellationToken)
    {
        var serialized = JsonSerializer.Serialize(settings, SerializerOptions);
        await _appSettingsService.UpsertAsync(
            SiteSettingKeys.GoogleSheetsSyncConfigJson,
            serialized,
            "Google Sheets registration sync configuration",
            true,
            cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<GoogleSheetsSyncSettingsModel> LoadSettingsAsync(CancellationToken cancellationToken)
    {
        var raw = await _appSettingsService.GetStringAsync(SiteSettingKeys.GoogleSheetsSyncConfigJson, null, cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return new GoogleSheetsSyncSettingsModel();
        }

        try
        {
            return JsonSerializer.Deserialize<GoogleSheetsSyncSettingsModel>(raw, SerializerOptions)
                ?? new GoogleSheetsSyncSettingsModel();
        }
        catch (JsonException)
        {
            return new GoogleSheetsSyncSettingsModel();
        }
    }

    private static AdminGoogleSheetsSyncSettingsResponse MapAdmin(GoogleSheetsSyncSettingsModel settings)
    {
        var serviceAccountEmail = TryGetServiceAccountEmail(settings.ServiceAccountJson);

        return new AdminGoogleSheetsSyncSettingsResponse
        {
            Enabled = settings.Enabled,
            SpreadsheetId = settings.SpreadsheetId,
            SheetName = settings.SheetName,
            HasServiceAccountJson = !string.IsNullOrWhiteSpace(settings.ServiceAccountJson),
            ServiceAccountEmail = serviceAccountEmail,
            LastSyncedAtUtc = settings.LastSyncedAtUtc,
            LastError = settings.LastError
        };
    }

    private static string? TryGetServiceAccountEmail(string? serviceAccountJson)
    {
        if (string.IsNullOrWhiteSpace(serviceAccountJson))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(serviceAccountJson);
            return document.RootElement.TryGetProperty("client_email", out var emailElement)
                ? emailElement.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool CanSync(GoogleSheetsSyncSettingsModel settings)
    {
        return settings.Enabled &&
               !string.IsNullOrWhiteSpace(settings.SpreadsheetId) &&
               !string.IsNullOrWhiteSpace(settings.ServiceAccountJson);
    }

    private static string CellToString(JsonElement element)
    {
        return element.ValueKind == JsonValueKind.String
            ? element.GetString() ?? string.Empty
            : element.ToString();
    }

    private static string GetCell(IReadOnlyList<string> row, int index)
    {
        return index >= 0 && index < row.Count ? row[index] : string.Empty;
    }

    private static string BuildPaymentKey(Guid registrationId, string participantName)
    {
        return BuildPaymentKey(registrationId.ToString(), participantName);
    }

    private static string BuildPaymentKey(string registrationId, string participantName)
    {
        var normalizedRegistrationId = Guid.TryParse(registrationId, out var parsedId)
            ? parsedId.ToString("N")
            : registrationId.Trim().ToUpperInvariant();
        return $"{normalizedRegistrationId}|{participantName.Trim().ToUpperInvariant()}";
    }

    private static string GetParticipantPhoneNumber(CampRegistrationParticipant participant, CampRegistration registration)
    {
        return string.IsNullOrWhiteSpace(participant.PhoneNumber)
            ? registration.PhoneNumber
            : participant.PhoneNumber;
    }

    private static decimal? TryParsePaymentAmount(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value
            .Replace("₽", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("руб.", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("руб", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace(" ", string.Empty, StringComparison.Ordinal)
            .Replace("\u00A0", string.Empty, StringComparison.Ordinal)
            .Replace(',', '.')
            .Trim();

        return decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)
            ? amount
            : null;
    }

    private static object CalculateBalance(decimal? totalAmount, decimal? paidAmount, string? preservedBalance)
    {
        if (totalAmount is null)
        {
            return preservedBalance ?? string.Empty;
        }

        if (paidAmount.HasValue)
        {
            return Math.Max(totalAmount.Value - paidAmount.Value, 0m);
        }

        return string.IsNullOrWhiteSpace(preservedBalance)
            ? totalAmount.Value
            : preservedBalance;
    }

    private static string ToSheetRange(string sheetName, string range)
    {
        return $"'{sheetName.Replace("'", "''")}'!{range}";
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static async Task EnsureGoogleSuccessAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        throw new InvalidOperationException($"Google Sheets вернул ошибку {(int)response.StatusCode}: {body}");
    }

    private static string BuildMedicalNotes(CampRegistration registration)
    {
        var parts = new[]
        {
            string.IsNullOrWhiteSpace(registration.HealthNotes) ? null : $"Здоровье: {registration.HealthNotes}",
            string.IsNullOrWhiteSpace(registration.AllergyNotes) ? null : $"Аллергии: {registration.AllergyNotes}",
            string.IsNullOrWhiteSpace(registration.SpecialNeeds) ? null : $"Особые нужды: {registration.SpecialNeeds}"
        };

        return string.Join("\n", parts.Where(item => !string.IsNullOrWhiteSpace(item)));
    }

    private static string FormatRegistrationStatus(RegistrationStatus status) => status switch
    {
        RegistrationStatus.Draft => "Черновик",
        RegistrationStatus.Submitted => "Отправлено",
        RegistrationStatus.Confirmed => "Подтверждено",
        RegistrationStatus.Cancelled => "Отменено",
        _ => status.ToString()
    };

    private static string FormatAccommodation(AccommodationPreference preference) => preference switch
    {
        AccommodationPreference.Tent => "Палатка",
        AccommodationPreference.Cabin => "Домик (старый вариант)",
        AccommodationPreference.Either => "Нужны доп. условия",
        _ => preference.ToString()
    };

    private sealed record GoogleSheetsSyncSettingsModel
    {
        public bool Enabled { get; init; }
        public string? SpreadsheetId { get; init; }
        public string? SheetName { get; init; } = "Registrations";
        public string? ServiceAccountJson { get; init; }
        public DateTime? LastSyncedAtUtc { get; init; }
        public string? LastError { get; init; }
    }

    private sealed record PaymentColumns(
        string Payer,
        string AmountPaid,
        string PaidAt,
        string Balance,
        string Comment);
}
