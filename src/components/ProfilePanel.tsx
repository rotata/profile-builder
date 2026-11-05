import { displayValue, FIELD_GROUPS, FIELD_LABELS } from "@/components/profileLabels";
import { isScalarField, type ProfileEntry, type ProfileField, type TravelProfile } from "@/shared/contract";

type ProfilePanelProps = {
  profile: TravelProfile;
  updating: boolean;
  extractionFailed: boolean;
};

function entriesOf(profile: TravelProfile, field: ProfileField): ProfileEntry[] {
  if (isScalarField(field)) {
    const entry = profile[field];
    return entry ? [entry] : [];
  }
  return profile[field];
}

/** Read-only view of what the assistant has learned, with the traveler's own words on hover. */
export function ProfilePanel({ profile, updating, extractionFailed }: ProfilePanelProps) {
  const groups = FIELD_GROUPS.map((group) => ({
    ...group,
    rows: group.fields
      .map((field) => ({ field, entries: entriesOf(profile, field) }))
      .filter((row) => row.entries.length > 0),
  })).filter((group) => group.rows.length > 0);

  return (
    <div className="space-y-4" data-testid="profile-panel">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Your travel profile</h2>
        {updating && (
          <span className="text-xs text-black/50" data-testid="profile-updating">
            Updating…
          </span>
        )}
      </div>

      {extractionFailed && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900" role="status">
          Couldn&apos;t update your profile from that message. Your chat is saved; it will catch up next time.
        </p>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-black/50">Nothing learned yet. Preferences appear here as you chat.</p>
      ) : (
        groups.map((group) => (
          <section key={group.title}>
            <h3 className="mb-1 text-xs font-medium tracking-wide text-black/40 uppercase">{group.title}</h3>
            <dl className="space-y-1.5">
              {group.rows.map(({ field, entries }) => (
                <div key={field} className="flex gap-3 text-sm" data-testid={`field-${field}`}>
                  <dt className="w-32 shrink-0 text-black/60">{FIELD_LABELS[field]}</dt>
                  <dd className="flex flex-wrap gap-1">
                    {entries.map((entry) => (
                      <span
                        key={entry.value}
                        title={`You said: “${entry.evidence}”`}
                        className="rounded-full bg-black/[.05] px-2 py-0.5"
                      >
                        {displayValue(entry.value)}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))
      )}
    </div>
  );
}
