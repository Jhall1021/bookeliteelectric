import type { RouteAssistScanCaptureKindV1 } from "./scanProvider";

/**
 * Device-neutral capture capability description.
 *
 * Route Assist must work from an ordinary secure mobile browser on iPhone,
 * Android and other camera-capable devices. Higher-fidelity native/world
 * geometry is an enhancement, never a prerequisite for entering the flow.
 *
 * This model is deliberately about CAPTURE capability only. It does not grant
 * authority to produce Routing V2 facts, materials, labor or price.
 */
export type RouteAssistCaptureTierV1 =
  | "WEB_CAMERA"
  | "WEB_CAMERA_MOTION"
  | "WORLD_GEOMETRY";

export type RouteAssistCaptureCapabilityV1 = {
  version: 1;
  tier: RouteAssistCaptureTierV1;
  captureKind: RouteAssistScanCaptureKindV1;
  cameraAvailable: boolean;
  motionAvailable: boolean;
  worldGeometryAvailable: boolean;
};

/**
 * Conservative browser capability detector.
 *
 * Camera + optional device motion are portable capture inputs. Neither is
 * metric/world-geometry authority. A native bridge or future web capability
 * must explicitly advertise world geometry before Route Assist may label it
 * WORLD_GEOMETRY.
 */
export function detectRouteAssistWebCaptureCapabilityV1(): RouteAssistCaptureCapabilityV1 {
  if (typeof navigator === "undefined") {
    return {
      version: 1,
      tier: "WEB_CAMERA",
      captureKind: "ORDINARY_ROOM_SCAN",
      cameraAvailable: false,
      motionAvailable: false,
      worldGeometryAvailable: false,
    };
  }

  const cameraAvailable = Boolean(navigator.mediaDevices?.getUserMedia);
  const motionAvailable = typeof window !== "undefined" && "DeviceMotionEvent" in window;

  return {
    version: 1,
    tier: motionAvailable ? "WEB_CAMERA_MOTION" : "WEB_CAMERA",
    captureKind: "ORDINARY_ROOM_SCAN",
    cameraAvailable,
    motionAvailable,
    // Never infer this from device brand, browser UA, camera count, resolution,
    // motion sensors or a depth-capable handset. It must come from an explicit
    // calibrated provider/native bridge contract.
    worldGeometryAvailable: false,
  };
}

export function withRouteAssistWorldGeometryV1(
  capability: RouteAssistCaptureCapabilityV1,
): RouteAssistCaptureCapabilityV1 {
  return {
    ...capability,
    tier: "WORLD_GEOMETRY",
    worldGeometryAvailable: true,
  };
}
