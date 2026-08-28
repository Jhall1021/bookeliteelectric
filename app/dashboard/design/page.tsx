import DesignPicker from "@/components/portal/design/DesignPicker";
import { withAdminContractor } from "@/lib/adminContext";
import { selectableFamilies } from "@/lib/theme/definition";
import { readBrandInputs } from "@/lib/theme/resolve";
import { IDENTITY_SELECT, resolveIdentity } from "@/lib/storefrontIdentity";

export const dynamic = "force-dynamic";

/**
 * The design picker's current home.
 *
 * A thin mount, on purpose. Everything of substance lives in
 * `components/portal/design` and `/api/portal/design`, so moving this feature
 * into the Price2Book portal is a new route file rather than a rewrite — the
 * `/admin` path is where authentication happens to live today, not where the
 * feature belongs.
 */
export default async function DesignPage() {
  const data = await withAdminContractor(async (db, ctx) => {
    const c = await db.contractor.findUniqueOrThrow({
      where: { id: ctx.contractorId },
      select: {
        ...IDENTITY_SELECT, brandColors: true, pricingStrategy: true,
        themeFamily: true, themeVariant: true, themeVersion: true,
        sites: { where: { active: true }, select: { hostedSlug: true, publicId: true }, take: 1 },
      },
    });
    return c;
  });

  return (
    <DesignPicker
      families={selectableFamilies()}
      current={{ family: data.themeFamily, variant: data.themeVariant, version: data.themeVersion }}
      brand={readBrandInputs(data.brandColors)}
      identity={resolveIdentity(data)}
      strategy={data.pricingStrategy}
      site={{
        publicId: data.sites[0]?.publicId ?? "",
        hostedSlug: data.sites[0]?.hostedSlug ?? "",
      }}
      storefrontUrl={data.sites[0] ? `/${data.sites[0].hostedSlug}` : "/"}
    />
  );
}
