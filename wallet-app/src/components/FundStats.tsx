import { formatTon, shortAddress } from '../lib/format';
import type { DonationStats, LoadState } from '../lib/types';

interface Props {
  fundAddress: string;
  fundBalance: bigint | null;
  stats: DonationStats;
  state: LoadState;
  error: string | null;
  onCopy: (text: string) => void;
}

/** Общий кошелёк фонда: баланс, сумма донатов, число донатеров. */
export function FundStats({ fundAddress, fundBalance, stats, state, error, onCopy }: Props) {
  const loading = state === 'loading' && fundBalance === null;

  return (
    <section className="card">
      <h2 className="card__title">Фонд района</h2>

      <div className="fund-balance">
        <span className="fund-balance__value">
          {fundBalance === null ? (loading ? '…' : '—') : `${formatTon(fundBalance, 2)} TON`}
        </span>
        <span className="fund-balance__label">на общем кошельке</span>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat__value">
            {state === 'ready' ? `${formatTon(stats.totalNano, 2)} TON` : '—'}
          </span>
          <span className="stat__label">собрано донатами</span>
        </div>
        <div className="stat">
          <span className="stat__value">{state === 'ready' ? stats.donorsCount : '—'}</span>
          <span className="stat__label">
            {declension(stats.donorsCount, 'донатер', 'донатера', 'донатеров')}
          </span>
        </div>
      </div>

      <button type="button" className="btn btn--ghost btn--full" onClick={() => onCopy(fundAddress)}>
        <span className="btn__mono">{shortAddress(fundAddress, 8, 6)}</span>
        Скопировать адрес фонда
      </button>

      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

/** Русское склонение: 1 донатер / 2 донатера / 5 донатеров. */
function declension(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
