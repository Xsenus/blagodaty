import { useEffect, useRef, useState } from 'react';
import { sendPhoneVerificationCode, verifyPhoneVerificationCode } from '../lib/api';

type PhoneVerificationPanelProps = {
  accessToken: string | null;
  phoneNumber: string;
  isConfirmed: boolean;
  onPhoneNumberChange: (value: string) => void;
  onAccountReload: () => Promise<void>;
  onVerified?: () => void | Promise<void>;
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Уточняется';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function normalizePhone(value?: string | null) {
  if (!value) {
    return '';
  }

  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return value.trim();
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }

  return digits.length >= 10 ? `+${digits}` : value.trim();
}

function formatResendCountdown(seconds: number) {
  if (seconds < 60) {
    return `${seconds} сек.`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (!remainingSeconds) {
    return `${minutes} мин.`;
  }

  return `${minutes} мин. ${remainingSeconds} сек.`;
}

function parseCooldownSeconds(message: string) {
  const match = message.match(/(\d+)\s*сек/i);
  if (!match) {
    return null;
  }

  const seconds = Number.parseInt(match[1], 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function PhoneVerificationPanel({
  accessToken,
  phoneNumber,
  isConfirmed,
  onPhoneNumberChange,
  onAccountReload,
  onVerified,
}: PhoneVerificationPanelProps) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expiresAtUtc, setExpiresAtUtc] = useState<string | null>(null);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number | null>(null);
  const [cooldownTick, setCooldownTick] = useState(() => Date.now());
  const normalizedPhone = normalizePhone(phoneNumber);
  const previousPhoneRef = useRef(normalizedPhone);
  const resendCountdown = cooldownUntilMs ? Math.max(0, Math.ceil((cooldownUntilMs - cooldownTick) / 1000)) : 0;

  useEffect(() => {
    if (!cooldownUntilMs) {
      return undefined;
    }

    if (cooldownUntilMs <= Date.now()) {
      setCooldownUntilMs(null);
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setCooldownTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [cooldownUntilMs]);

  useEffect(() => {
    if (previousPhoneRef.current && previousPhoneRef.current !== normalizedPhone) {
      setCode('');
      setMessage(null);
      setError(null);
      setExpiresAtUtc(null);
      setDebugCode(null);
      setCooldownUntilMs(null);
    }

    previousPhoneRef.current = normalizedPhone;
  }, [normalizedPhone]);

  async function handleSendCode() {
    if (!accessToken) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsSending(true);

    try {
      const response = await sendPhoneVerificationCode(accessToken, {
        phoneNumber,
      });

      onPhoneNumberChange(response.phoneNumber);
      setCode('');
      setExpiresAtUtc(response.alreadyVerified ? null : response.expiresAtUtc);
      setDebugCode(response.alreadyVerified ? null : response.debugCode ?? null);
      setMessage(response.message ?? 'Код подтверждения создан.');
      setCooldownTick(Date.now());
      setCooldownUntilMs(
        response.alreadyVerified || response.resendCooldownSeconds <= 0
          ? null
          : Date.now() + response.resendCooldownSeconds * 1000,
      );

      if (response.alreadyVerified) {
        await onAccountReload();
        await onVerified?.();
      }
    } catch (nextError) {
      const nextMessage = nextError instanceof Error ? nextError.message : 'Не удалось отправить код подтверждения.';
      const cooldownSeconds = parseCooldownSeconds(nextMessage);
      if (cooldownSeconds) {
        setCooldownTick(Date.now());
        setCooldownUntilMs(Date.now() + cooldownSeconds * 1000);
      }

      setError(nextMessage);
    } finally {
      setIsSending(false);
    }
  }

  async function handleVerify() {
    if (!accessToken) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsVerifying(true);

    try {
      const response = await verifyPhoneVerificationCode(accessToken, {
        phoneNumber,
        code,
      });

      onPhoneNumberChange(response.phoneNumber);
      setCode('');
      setDebugCode(null);
      setCooldownUntilMs(null);
      setMessage('Телефон подтверждён.');
      await onAccountReload();
      await onVerified?.();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось подтвердить телефон.');
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="phone-verification-panel">
      <div className={`phone-verification-banner${isConfirmed ? ' verified' : ''}`}>
        <strong>{isConfirmed ? 'Номер подтверждён' : 'Подтвердите номер телефона'}</strong>
        <p>
          {isConfirmed
            ? `Активный номер ${phoneNumber || 'сохранён'} подтверждён и готов для уведомлений.`
            : 'Запросите код, введите его ниже и подтвердите номер без выхода из кабинета.'}
        </p>
      </div>

      <div className="phone-verification-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={isSending || !phoneNumber.trim() || resendCountdown > 0}
          onClick={() => void handleSendCode()}
        >
          {isSending ? 'Отправляем код...' : isConfirmed ? 'Отправить код повторно' : 'Получить код'}
        </button>
      </div>

      {resendCountdown > 0 ? (
        <p className="form-muted phone-verification-hint">
          Повторный запрос станет доступен через {formatResendCountdown(resendCountdown)}
        </p>
      ) : null}

      <div className="phone-verification-row">
        <label>
          <span>Код подтверждения</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Введите код"
          />
          {expiresAtUtc ? <small className="form-muted">Код действует до {formatDateTime(expiresAtUtc)}.</small> : null}
        </label>

        <button
          className="primary-button"
          type="button"
          disabled={isVerifying || !code.trim()}
          onClick={() => void handleVerify()}
        >
          {isVerifying ? 'Проверяем...' : 'Подтвердить номер'}
        </button>
      </div>

      {debugCode ? <p className="form-success">Тестовый режим: код {debugCode}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
