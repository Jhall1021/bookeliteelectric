import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";
import { activationRefusal } from "@/lib/serviceActivation";

function optionalText(
  value: unknown,
  fieldLabel: string
): { ok: true; value: string | null | undefined } | { ok: false; response: NextResponse } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `${fieldLabel} must be text or null.` },
        { status: 400 }
      ),
    };
  }
  return { ok: true, value: value.trim() || null };
}

export async function PATCH(req: Request, { params }: { params: { serviceId: string } }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  const { name, shortDescription, disclaimer, startingPriceLabel, active } = body;

  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (active !== undefined && typeof active !== "boolean") {
    return NextResponse.json({ error: "Visibility must be true or false." }, { status: 400 });
  }

  const descriptionValue = optionalText(shortDescription, "Description");
  if (!descriptionValue.ok) return descriptionValue.response;
  const disclaimerValue = optionalText(disclaimer, "Disclaimer");
  if (!disclaimerValue.ok) return disclaimerValue.response;
  const startingLabelValue = optionalText(startingPriceLabel, "Starting price label");
  if (!startingLabelValue.ok) return startingLabelValue.response;

  return withAdminContractor(async (db, ctx) => {
    const service = await db.service.findUnique({
      where: { id: params.serviceId },
      select: {
        id: true,
        active: true,
        shortDescription: true,
        disclaimer: true,
        startingPriceLabel: true,
      },
    });
    if (!service) return NextResponse.json({ error: "Unknown service" }, { status: 404 });

    const wantsActive = typeof active === "boolean" ? active : service.active;

    if (wantsActive && !service.active) {
      const refusal = await activationRefusal(db, ctx.contractorId, params.serviceId);
      if (refusal) {
        if (refusal.code === "UNKNOWN_SERVICE") {
          return NextResponse.json({ error: "Unknown service" }, { status: 404 });
        }
        console.error(`[admin/services] refused to activate ${params.serviceId}: ${refusal.code}`);
        return NextResponse.json(
          {
            error: refusal.code,
            message: refusal.message,
            ...(refusal.unresolvedMaterialKeys ? { unresolvedMaterialKeys: refusal.unresolvedMaterialKeys } : {}),
            ...(refusal.missingPrerequisites ? { missingPrerequisites: refusal.missingPrerequisites } : {}),
            ...(refusal.prerequisites ? { prerequisites: refusal.prerequisites } : {}),
          },
          { status: 409 }
        );
      }
    }

    await db.service.update({
      where: { id: params.serviceId },
      data: {
        name: name.trim(),
        shortDescription:
          descriptionValue.value === undefined ? service.shortDescription : descriptionValue.value,
        disclaimer:
          disclaimerValue.value === undefined ? service.disclaimer : disclaimerValue.value,
        startingPriceLabel:
          startingLabelValue.value === undefined ? service.startingPriceLabel : startingLabelValue.value,
        active: wantsActive,
      },
    });

    return NextResponse.json({ ok: true });
  });
}
