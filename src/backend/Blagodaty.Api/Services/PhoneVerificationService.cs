using System.Security.Cryptography;
using System.Text;
using Blagodaty.Api.Contracts.Account;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Blagodaty.Api.Services;

public sealed class PhoneVerificationService
{
    private readonly AppDbContext _dbContext;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<PhoneVerificationService> _logger;
    private readonly PhoneVerificationOptions _options;

    public PhoneVerificationService(
        AppDbContext dbContext,
        TimeProvider timeProvider,
        ILogger<PhoneVerificationService> logger,
        IOptions<PhoneVerificationOptions> options)
    {
        _dbContext = dbContext;
        _timeProvider = timeProvider;
        _logger = logger;
        _options = options.Value;
    }

    public async Task<SendPhoneVerificationCodeResponse> SendCodeAsync(
        ApplicationUser user,
        string phoneNumber,
        CancellationToken cancellationToken = default)
    {
        var normalizedPhoneNumber = PhoneNumberHelper.Normalize(phoneNumber);
        if (string.IsNullOrWhiteSpace(normalizedPhoneNumber))
        {
            throw new InvalidOperationException("Укажите корректный номер телефона для подтверждения.");
        }

        if (string.Equals(user.PhoneNumber, normalizedPhoneNumber, StringComparison.Ordinal) && user.PhoneNumberConfirmed)
        {
            return new SendPhoneVerificationCodeResponse
            {
                PhoneNumber = normalizedPhoneNumber,
                ExpiresAtUtc = _timeProvider.GetUtcNow().UtcDateTime,
                ResendCooldownSeconds = _options.ResendCooldownSeconds,
                AlreadyVerified = true,
                IsTestMode = IsTestMode(),
                Message = "Номер уже подтверждён."
            };
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var latestPendingChallenge = await _dbContext.PhoneVerificationChallenges
            .Where(item => item.UserId == user.Id && item.ConsumedAtUtc == null && item.ExpiresAtUtc > now)
            .OrderByDescending(item => item.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (latestPendingChallenge is not null)
        {
            var secondsSinceLastCode = (now - latestPendingChallenge.CreatedAtUtc).TotalSeconds;
            if (secondsSinceLastCode < _options.ResendCooldownSeconds)
            {
                var secondsLeft = Math.Max(_options.ResendCooldownSeconds - (int)Math.Floor(secondsSinceLastCode), 1);
                throw new InvalidOperationException($"Новый код можно запросить через {secondsLeft} сек.");
            }

            latestPendingChallenge.ConsumedAtUtc = now;
        }

        var code = GenerateCode();
        var challenge = new PhoneVerificationChallenge
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            PhoneNumber = normalizedPhoneNumber,
            CodeHash = HashCode(code),
            Attempts = 0,
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddMinutes(_options.CodeTtlMinutes)
        };

        user.PhoneNumber = normalizedPhoneNumber;
        user.PhoneNumberConfirmed = false;
        _dbContext.PhoneVerificationChallenges.Add(challenge);
        await _dbContext.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Phone verification code generated for user {UserId} and phone {PhoneNumber}. Test mode: {IsTestMode}.",
            user.Id,
            normalizedPhoneNumber,
            IsTestMode());

        return new SendPhoneVerificationCodeResponse
        {
            PhoneNumber = normalizedPhoneNumber,
            ExpiresAtUtc = challenge.ExpiresAtUtc,
            ResendCooldownSeconds = _options.ResendCooldownSeconds,
            AlreadyVerified = false,
            IsTestMode = IsTestMode(),
            DebugCode = IsTestMode() ? code : null,
            Message = IsTestMode()
                ? "Код создан в тестовом режиме и показан в интерфейсе."
                : "Код подтверждения отправлен."
        };
    }

    public async Task<VerifyPhoneVerificationCodeResponse> VerifyCodeAsync(
        ApplicationUser user,
        string phoneNumber,
        string code,
        CancellationToken cancellationToken = default)
    {
        var normalizedPhoneNumber = PhoneNumberHelper.Normalize(phoneNumber);
        if (string.IsNullOrWhiteSpace(normalizedPhoneNumber))
        {
            throw new InvalidOperationException("Укажите корректный номер телефона.");
        }

        if (string.IsNullOrWhiteSpace(code))
        {
            throw new InvalidOperationException("Введите код подтверждения.");
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var challenge = await _dbContext.PhoneVerificationChallenges
            .Where(item =>
                item.UserId == user.Id &&
                item.PhoneNumber == normalizedPhoneNumber &&
                item.ConsumedAtUtc == null)
            .OrderByDescending(item => item.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (challenge is null || challenge.ExpiresAtUtc <= now)
        {
            throw new InvalidOperationException("Код подтверждения не найден или уже истёк. Запросите новый код.");
        }

        if (challenge.Attempts >= _options.MaxAttempts)
        {
            challenge.ConsumedAtUtc = now;
            await _dbContext.SaveChangesAsync(cancellationToken);
            throw new InvalidOperationException("Превышено количество попыток. Запросите новый код.");
        }

        if (!string.Equals(challenge.CodeHash, HashCode(code.Trim()), StringComparison.Ordinal))
        {
            challenge.Attempts += 1;
            if (challenge.Attempts >= _options.MaxAttempts)
            {
                challenge.ConsumedAtUtc = now;
            }

            await _dbContext.SaveChangesAsync(cancellationToken);
            throw new InvalidOperationException("Неверный код подтверждения.");
        }

        challenge.Attempts += 1;
        challenge.ConsumedAtUtc = now;
        user.PhoneNumber = normalizedPhoneNumber;
        user.PhoneNumberConfirmed = true;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new VerifyPhoneVerificationCodeResponse
        {
            PhoneNumber = normalizedPhoneNumber,
            Verified = true
        };
    }

    private bool IsTestMode()
    {
        return string.Equals(_options.Mode, "Debug", StringComparison.OrdinalIgnoreCase);
    }

    private string GenerateCode()
    {
        var length = Math.Clamp(_options.CodeLength, 4, 8);
        var minimum = (int)Math.Pow(10, length - 1);
        var maximum = (int)Math.Pow(10, length) - 1;
        return RandomNumberGenerator.GetInt32(minimum, maximum + 1).ToString();
    }

    private static string HashCode(string code)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(code));
        return Convert.ToHexString(bytes);
    }
}
