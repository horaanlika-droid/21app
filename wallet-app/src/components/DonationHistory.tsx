import { formatDate, formatTon, shortAddress } from '../lib/format';
import type { Donation, LoadState } from '../lib/types';

interface Props {
  donations: Donation[];
  state: LoadState;
  error: string | null;
  /** Адрес текущего пользователя — свои переводы помечаем. */
  myAddress: string | null;
}

/** Последние донаты в фонд. */
export function DonationHistory({ donations, state, error, myAddress }: Props) {
  return (
    <section className="card">
      <h2 className="card__title">Последние донаты</h2>

      {state === 'loading' && donations.length === 0 && (
        <p className="muted">Загружаем историю…</p>
      )}

      {state === 'error' && donations.length === 0 && (
        <p className="error-text">{error ?? 'Не удалось загрузить историю'}</p>
      )}

      {state === 'ready' && donations.length === 0 && (
        <p className="muted">Пока никто не переводил — станьте первым.</p>
      )}

      <ul className="history">
        {donations.map((donation) => {
          const mine = Boolean(myAddress) && donation.from === myAddress;
          return (
            <li key={donation.hash} className="history__row">
              <div className="history__main">
                <span className="history__from">
                  {shortAddress(donation.from)}
                  {mine && <span className="badge">вы</span>}
                </span>
                {donation.comment && (
                  <span className="history__comment">{donation.comment}</span>
                )}
                <span className="history__time">{formatDate(donation.utime)}</span>
              </div>
              <span className="history__amount">+{formatTon(donation.amountNano, 3)} TON</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
