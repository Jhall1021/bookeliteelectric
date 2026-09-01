import { NextResponse } from "next/server";

/**
 * The one snippet a contractor pastes, and never touches again.
 *
 *   <div id="p2b"></div>
 *   <script src="https://price2book.com/embed.js" data-site="pub_..." async></script>
 *
 * A LOADER AND NOTHING ELSE. It injects an iframe and manages its height. All
 * UI lives inside the frame and is centrally deployed, so our releases reach
 * every contractor's website without anybody editing their page — which is the
 * entire reason for the loader-plus-iframe split rather than rendering into
 * the host page, where our markup would meet their theme and every update
 * would become their problem.
 *
 * WHAT IT DELIBERATELY CANNOT DO
 *
 * It asserts no contractor, no price, no visit and no booking. `data-site` is
 * an opaque routing key the server re-resolves on every request, exactly as
 * the hosted storefront does with its slug. The only message it accepts back
 * from the frame is a height, and the only thing it does with one is set a
 * height — there is no command channel, because a generic one would eventually
 * be given a command worth stealing.
 */
export async function GET() {
  const js = `(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;

  var site = script.getAttribute("data-site");
  if (!site) {
    console.error("[Price2Book] Missing data-site on the embed script.");
    return;
  }

  var origin = new URL(script.src).origin;
  var path = "/embed/" + encodeURIComponent(site);

  // Open straight at one service when the marketing link says which — an EV
  // charger ad should not land on a generic catalog. The value is a slug the
  // server resolves within the already-resolved contractor; it names nothing
  // and grants nothing.
  var service = script.getAttribute("data-service");
  if (service) path += "/s/" + encodeURIComponent(service);

  var mount = document.getElementById(script.getAttribute("data-target") || "p2b");
  if (!mount) {
    console.error("[Price2Book] No mount element. Add <div id=\\"p2b\\"></div>.");
    return;
  }

  var frame = document.createElement("iframe");
  frame.src = origin + path;
  frame.title = "Book a service";
  frame.loading = "lazy";
  frame.style.width = "100%";
  frame.style.border = "0";
  frame.style.display = "block";
  frame.style.minHeight = "640px";
  // Payments need to run inside the frame; 3DS opens its own layer.
  frame.setAttribute("allow", "payment");
  mount.appendChild(frame);

  // HEIGHT, AND ONLY HEIGHT.
  //
  // Checked against this frame's own origin and window, so another frame on
  // the page cannot resize ours, and a message from anywhere else is ignored
  // rather than inspected.
  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    if (event.source !== frame.contentWindow) return;
    var data = event.data;
    if (!data || data.type !== "p2b:height") return;
    var height = Number(data.height);
    if (!isFinite(height) || height < 200 || height > 20000) return;
    frame.style.height = height + "px";
  });
})();`;

  return new NextResponse(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // The loader is public and identical for everyone, so it caches hard —
      // but not forever: a fix to it has to reach contractors who pasted it
      // months ago without them doing anything.
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      // Any site may LOAD the script. Whether it may FRAME the storefront is
      // decided by frame-ancestors on the embed itself, which is the check
      // that actually matters.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
