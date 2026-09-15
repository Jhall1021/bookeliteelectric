import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { r2 } from "@/lib/r2";
import { getOrCreateSessionId } from "@/lib/session";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { loadSession } from "@/lib/guidedFlowSession";

function safeFilename(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return normalized || "route-assist-frame.jpg";
}

/**
 * Private Route Assist media upload authorization.
 *
 * Ownership is inherited from the anonymous GuidedFlowSession and the exact
 * ROUTE_ASSIST task. The client receives an opaque storage key (`mediaRef`),
 * never a public read URL. A provider-read route creates short-lived signed GET
 * URLs server-side only after repeating the same ownership checks.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string; taskId: string } },
) {
  let site;
  try { site = await requireSiteFromRequest(req); }
  catch { return NextResponse.json({ error: "Unknown storefront." }, { status: 404 }); }

  return withSite(site, async (db) => {
    const sessionId = getOrCreateSessionId();
    const session = await loadSession(db, params.id);
    if (!session || session.sessionId !== sessionId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const task = await db.guidedFlowVisualAssistTask.findFirst({
      where: { id: params.taskId, guidedFlowSessionId: params.id, taskType: "ROUTE_ASSIST" },
      select: { id: true },
    });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => null) as { filename?: unknown; contentType?: unknown } | null;
    const filename = typeof body?.filename === "string" ? body.filename : "";
    const contentType = typeof body?.contentType === "string" ? body.contentType : "";
    if (!filename || contentType !== "image/jpeg") {
      return NextResponse.json({ error: "Route Assist accepts JPEG evidence only" }, { status: 400 });
    }

    const bucket = process.env.R2_ROUTE_ASSIST_BUCKET_NAME ?? process.env.R2_BUCKET_NAME;
    if (!bucket) return NextResponse.json({ error: "Route Assist media storage is unavailable" }, { status: 503 });

    const mediaRef = `route-assist/${params.id}/${params.taskId}/${randomUUID()}-${safeFilename(filename)}`;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: mediaRef,
      ContentType: contentType,
      Metadata: {
        guidedFlowSessionId: params.id,
        routeAssistTaskId: params.taskId,
      },
    });
    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 600 });
    return NextResponse.json({ uploadUrl, mediaRef });
  });
}
