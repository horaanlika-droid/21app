import { useCallback, useMemo, useState } from 'react';
import { MAX_COMMENT_LENGTH, MIN_AMOUNT, PRESET_AMOUNTS } from '../lib/config';
import { tonToNano } from '../lib/format';

interface Props {
  connected: boolean;
  sending: boolean;
  onDonate: (amount: string, comment: string) => void;
}

/**
 * Форма доната: пресеты сумм, своя сумма и необязательный комментарий.
 * Кнопка блокируется на время отправки — защита от повторных кликов.
 */
export function DonateForm({ connected, sending, onDonate }: Props) {
  const [preset, setPreset] = useState<number | null>(1);
  const [custom, setCustom] = useState('');
  const [comment, setComment] = useState('');

  // активная сумма: своя имеет приоритет над пресетом
  const amount = custom.trim() !== '' ? custom.trim() : preset !== null ? String(preset) : '';

  const amountError = useMemo(() => {
    if (amount === '') return 'Выберите или введите сумму';
    try {
      const nano = tonToNano(amount);
      if (nano < tonToNano(MIN_AMOUNT)) return `Минимум ${MIN_AMOUNT} TON`;
      return null;
    } catch {
      return 'Некорректная сумма';
    }
  }, [amount]);

  const handleCustom = useCallback((raw: string) => {
    // разрешаем только цифры и один разделитель дробной части
    const normalized = raw.replace(',', '.').replace(/[^\d.]/g, '');
    const parts = normalized.split('.');
    const safe = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : normalized;

    setCustom(safe);
    if (safe !== '') setPreset(null);
  }, []);

  const handlePreset = useCallback((value: number) => {
    setPreset(value);
    setCustom(''); // выбор пресета сбрасывает ручной ввод
  }, []);

  const handleSubmit = useCallback(() => {
    if (sending || amountError) return;
    onDonate(amount, comment.trim());
  }, [amount, amountError, comment, onDonate, sending]);

  const disabled = !connected || sending || Boolean(amountError);

  return (
    <section className="card">
      <h2 className="card__title">Поддержать район</h2>
      <p className="muted muted--tight">
        Перевод уходит напрямую в фонд района, с вашего кошелька в блокчейне TON.
      </p>

      <div className="presets">
        {PRESET_AMOUNTS.map((value) => (
          <button
            key={value}
            type="button"
            className={`preset ${preset === value && custom === '' ? 'preset--on' : ''}`}
            onClick={() => handlePreset(value)}
            disabled={sending}
          >
            {value} TON
          </button>
        ))}
      </div>

      <label className="field">
        <span className="field__label">Своя сумма</span>
        <div className="field__wrap">
          <input
            className="field__input"
            inputMode="decimal"
            placeholder="например, 3.5"
            value={custom}
            onChange={(e) => handleCustom(e.target.value)}
            disabled={sending}
            aria-label="Своя сумма в TON"
          />
          <span className="field__suffix">TON</span>
        </div>
      </label>

      <label className="field">
        <span className="field__label">
          Комментарий <span className="field__optional">(необязательно)</span>
        </span>
        <div className="field__wrap">
          <input
            className="field__input"
            placeholder="За что переводите"
            value={comment}
            maxLength={MAX_COMMENT_LENGTH}
            onChange={(e) => setComment(e.target.value)}
            disabled={sending}
            aria-label="Комментарий к донату"
          />
        </div>
        <span className="field__counter">
          {comment.length}/{MAX_COMMENT_LENGTH}
        </span>
      </label>

      <button
        type="button"
        className="btn btn--primary btn--full"
        onClick={handleSubmit}
        disabled={disabled}
      >
        {sending
          ? 'Подтвердите в кошельке…'
          : connected
            ? `Отправить${amountError ? '' : ` ${amount} TON`}`
            : 'Сначала подключите кошелёк'}
      </button>

      {connected && amountError && amount !== '' && (
        <p className="error-text">{amountError}</p>
      )}
    </section>
  );
}
