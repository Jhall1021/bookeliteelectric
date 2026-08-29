/**
 * Who the contractor is, as the storefront needs it — ADR-016.
 *
 * The third layer of the contract:
 *
 *   contractor identity + pinned theme definition + pricing strategy
 *     -> resolved customer storefront
 *
 * Each layer owns its own data and none reaches into another. A theme
 * definition never carries a company name; identity never carries a colour
 * ramp; neither decides how a price is calculated.
 *
 * Every field has a defined fallback, because a contractor mid-setup should
 * render a storefront missing a licence line — not a broken page, and never
 * somebody else's licence.
 */

/** Exactly what the storefront reads. Narrower than the Contractor row. */
export type StorefrontIdentity = {
  /** "Elite Electric & Lighting" — mastheads, alt text, email subjects. */
  displayName: string;
  /** "Elite" — possessive and nav use, so a link reads "Why Elite". */
  shortName: string;
  /** The registered entity, for the copyright line. */
  legalName: string;
  logoUrl: string | null;
  logoWhiteUrl: string | null;
  phone: string | null;
  /** Digits only, for tel: — a formatted number in an href silently fails. */
  phoneHref: string | null;
  email: string | null;
  address: { line1: string; line2: string | null; cityStateZip: string } | null;
  /** "NJ Electrical License #17272", assembled, or null if incomplete. */
  license: string | null;
  serviceArea: { label: string; imageUrl: string | null; imageAlt: string } | null;
  /**
   * The storefront hero photograph, or null when this contractor has supplied
   * none — in which case the hero renders WITHOUT a photograph.
   *
   * This was a module constant in components/home/Hero.tsx pointing at Elite's
   * own photograph, logo on the shirt and all, and every storefront rendered
   * it. Falling back to a different stock image would repeat the mistake in a
   * quieter register: a shared default photograph still tells every visitor
   * that unrelated businesses are the same business.
   */
  heroImage: { url: string; alt: string } | null;
};

/** The shape read from the database. Kept explicit so the select stays honest. */
export type IdentityRow = {
  name: string;
  shortName: string | null;
  legalName: string | null;
  logoUrl: string | null;
  logoWhiteUrl: string | null;
  phone: string | null;
  supportEmail: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  licenseLabel: string | null;
  licenseNumber: string | null;
  serviceAreaLabel: string | null;
  serviceAreaImageUrl: string | null;
  serviceAreaImageAlt: string | null;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
};

/** The Prisma select, in one place, so no caller invents its own subset. */
export const IDENTITY_SELECT = {
  name: true, shortName: true, legalName: true,
  logoUrl: true, logoWhiteUrl: true, phone: true, supportEmail: true,
  addressLine1: true, addressLine2: true, city: true, state: true, postalCode: true,
  licenseLabel: true, licenseNumber: true,
  serviceAreaLabel: true, serviceAreaImageUrl: true, serviceAreaImageAlt: true,
  heroImageUrl: true, heroImageAlt: true,
} as const;

const trim = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export function resolveIdentity(row: IdentityRow): StorefrontIdentity {
  const displayName = trim(row.name) ?? "This contractor";
  const phone = trim(row.phone);

  const line1 = trim(row.addressLine1);
  const city = trim(row.city), state = trim(row.state), zip = trim(row.postalCode);
  // An address is shown whole or not at all. Half of one — a street with no
  // town — is worse than none: it looks like a bug to a homeowner and it is.
  const address = line1 && city && state
    ? { line1, line2: trim(row.addressLine2), cityStateZip: `${city}, ${state}${zip ? ` ${zip}` : ""}` }
    : null;

  // Same rule. A bare number with no label means nothing, and a label with no
  // number is an empty claim.
  const label = trim(row.licenseLabel), number = trim(row.licenseNumber);
  const license = label && number ? `${label} #${number}` : null;

  const areaLabel = trim(row.serviceAreaLabel);
  const heroUrl = trim(row.heroImageUrl);

  return {
    displayName,
    shortName: trim(row.shortName) ?? displayName,
    legalName: trim(row.legalName) ?? displayName,
    logoUrl: trim(row.logoUrl),
    logoWhiteUrl: trim(row.logoWhiteUrl) ?? trim(row.logoUrl),
    phone,
    phoneHref: phone ? phone.replace(/\D/g, "") || null : null,
    email: trim(row.supportEmail),
    address,
    license,
    serviceArea: areaLabel
      ? {
          label: areaLabel,
          imageUrl: trim(row.serviceAreaImageUrl),
          // Never inherit another contractor's alt text with their territory
          // named in it.
          imageAlt: trim(row.serviceAreaImageAlt) ?? `Map of the area served by ${displayName}`,
        }
      : null,
    heroImage: heroUrl
      ? { url: heroUrl, alt: trim(row.heroImageAlt) ?? `${displayName}` }
      : null,
  };
}

/**
 * For rendering outside a storefront — the not-found page, a preview. Names
 * nobody, which is the only safe default.
 */
export const ANONYMOUS_IDENTITY: StorefrontIdentity = {
  displayName: "This contractor", shortName: "us", legalName: "This contractor",
  logoUrl: null, logoWhiteUrl: null, phone: null, phoneHref: null, email: null,
  address: null, license: null, serviceArea: null, heroImage: null,
};

/**
 * Load one contractor's identity plus the address their mail sends from.
 *
 * A single helper so no send site invents its own select and quietly omits a
 * field — the failure mode being a customer thanked by a company they never
 * hired.
 */
export async function loadIdentity(
  db: { contractor: { findUnique: (a: any) => Promise<any> } }, contractorId: string,
): Promise<{ identity: StorefrontIdentity; fromAddress: string | null }> {
  const row = await db.contractor.findUnique({
    where: { id: contractorId },
    select: { ...IDENTITY_SELECT, emailFromAddress: true },
  });
  return {
    identity: row ? resolveIdentity(row) : ANONYMOUS_IDENTITY,
    fromAddress: row?.emailFromAddress ?? null,
  };
}
