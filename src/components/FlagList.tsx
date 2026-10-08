import type { Flag } from "../domain/types";

const ICON: Record<Flag["severity"], string> = { critical: "!", warning: "!", info: "i" };
const LABEL: Record<Flag["severity"], string> = { critical: "Red flag", warning: "Warning", info: "Note" };

export function FlagList({ flags, limit }: { flags: Flag[]; limit?: number }) {
  const shown = limit ? flags.slice(0, limit) : flags;
  if (!flags.length) return <p className="ok-line">No warnings found.</p>;
  return (
    <ul className="flags">
      {shown.map((f, i) => (
        <li key={`${f.code}-${i}`} className={`flag flag-${f.severity}`}>
          <span className="flag-icon" aria-hidden="true">{ICON[f.severity]}</span>
          <div>
            <p className="flag-title">
              <span className="sr-only">{LABEL[f.severity]}: </span>
              {f.title}
            </p>
            <p className="flag-detail">{f.detail}</p>
          </div>
        </li>
      ))}
      {limit && flags.length > limit && <li className="hint">+{flags.length - limit} more below</li>}
    </ul>
  );
}
