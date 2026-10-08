import type { VerificationReport } from "../domain/verification";
import type { Plan } from "../domain/plans";

const LICENSE_TEXT = {
  active: "Active",
  expired: "Expired",
  suspended: "Suspended",
  not_found: "Not found",
  not_provided: "No number given",
} as const;

export function VerificationPanel({ report, plan, loading }: { report?: VerificationReport; plan: Plan; loading: boolean }) {
  if (loading || !report) {
    return (
      <div className="verify" aria-busy="true">
        <div className="skeleton" style={{ width: "60%" }} />
        <div className="skeleton" style={{ width: "40%" }} />
      </div>
    );
  }
  const { business, license, courtRecords } = report;
  return (
    <dl className="verify">
      {business && (
        <>
          <dt>Business registration</dt>
          <dd className={business.entityStatus === "active" ? "good" : "bad"}>
            {business.entityStatus === "active" ? `Active${business.yearsRegistered ? `, ${business.yearsRegistered} years` : ""}` : "Not found"}
            {business.complaints > 0 && <span className="muted"> · {business.complaints} complaint{business.complaints > 1 ? "s" : ""}</span>}
          </dd>
        </>
      )}
      <dt>State license</dt>
      {license ? (
        <dd className={license.status === "active" ? "good" : "bad"}>
          {LICENSE_TEXT[license.status]}
          {license.number && <span className="muted"> · #{license.number}</span>}
          {license.expires && <span className="muted"> · {license.status === "expired" ? "expired" : "expires"} {license.expires}</span>}
        </dd>
      ) : (
        <dd className="muted">{plan.licenseCheck ? "Not checked" : "Not included in Essential"}</dd>
      )}
      <dt>Lawsuits and liens</dt>
      {courtRecords ? (
        courtRecords.length === 0 ? (
          <dd className="good">None found</dd>
        ) : (
          <dd>
            <ul className="cases">
              {courtRecords.map((c, i) => (
                <li key={i} className={c.role === "defendant" ? "bad" : ""}>
                  <strong>{c.caseType}</strong> · {c.role === "defendant" ? "sued" : "sued a client"} · {c.outcome} · filed {c.filed}
                  <br />
                  <span className="muted">{c.summary}</span>
                </li>
              ))}
            </ul>
          </dd>
        )
      ) : (
        <dd className="muted">{plan.courtRecords ? "Not checked" : "Not included in Essential"}</dd>
      )}
    </dl>
  );
}
