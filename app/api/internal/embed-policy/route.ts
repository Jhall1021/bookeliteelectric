import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { frameAncestors } from "@/lib/embedOrigins";

/**
 * The `frame-ancestors` value for one embedded storefront.
 *
 * Exists because middleware runs on the Edge in Next 14 and cannot reach
 * Prisma, while `frame-ancestors` must be an HTTP header — a meta tag is
 * ignored for it — and the value is per-contractor. So the middleware asks.
 *
 * Deliberately returns the POLICY STRING and nothing else. Not the origin
 * list, not the contractor, not whether the publicId exists: an unknown
 * identifier answers `'none'`, which is the same answer a contractor who has
 * registered no domain gets. Probing it reveals only that Price2Book will not
 * let you frame something, which is true of every value it can return.
 */
export async function GET(req: Request) {
  const publicId = new URL(req.url).searchParams.get("publicId") ?? "";

  const site = publicId
    ? await prisma.contractorSite.findUnique({
        where: { publicId },
        select: { active: true, embedOrigins: true },
      })
    : null;

  const policy = site?.active ? frameAncestors(site.embedOrigins) : frameAncestors([]);

  return NextResponse.json(
    { policy },
    {
      // Short, because a contractor who has just added their domain should not
      // wait minutes to see the embed work; long enough that a page of assets
      // does not re-ask for every one.
      headers: { "Cache-Control": "private, max-age=30" },
    }
  );
}
