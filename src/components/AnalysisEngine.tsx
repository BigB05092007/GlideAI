'use client';

import { useRef, useEffect, useState, useCallback } from "react";
import Webcam from "react-webcam";
import type { NormalizedLandmark, Results } from "@mediapipe/pose";
import { ShieldCheck, Activity, Waves } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

interface ArmEVF {
  elbowAngle: number;
  verticality: number;
  inCatchPhase: boolean;
  isEVF: boolean;
}

interface EVFResult {
  left: ArmEVF;
  right: ArmEVF;
}

interface StrokeRange {
  minY: number;
  maxY: number;
}

type PoseConnection = readonly [number, number];
type PoseConstructorConfig = { locateFile?: (f: string) => string };

interface PoseInstance {
  setOptions: (o: Record<string, unknown>) => void;
  onResults: (cb: (r: Results) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<unknown>;
  close: () => void;
  initialize?: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Pure math helpers
// ---------------------------------------------------------------------------

const DEG = 180 / Math.PI;

/**
 * Internal angle at vertex B formed by rays BA and BC.
 * Uses the dot-product formula: cos(θ) = (BA·BC) / (|BA||BC|)
 */
function angleBetweenPoints(a: Point, b: Point, c: Point): number {
  const ba: Point = { x: a.x - b.x, y: a.y - b.y };
  const bc: Point = { x: c.x - b.x, y: c.y - b.y };

  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.hypot(ba.x, ba.y);
  const magBC = Math.hypot(bc.x, bc.y);

  if (magBA === 0 || magBC === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return Math.acos(cosAngle) * DEG;
}

/**
 * Angle of the forearm (elbow→wrist vector) relative to horizontal.
 * Returns 0–90 where 90 = perfectly vertical.
 * MediaPipe Y increases downward, so a downward-pointing forearm has positive dy.
 */
function forearmVerticality(elbow: Point, wrist: Point): number {
  const dx = wrist.x - elbow.x;
  const dy = wrist.y - elbow.y;
  return Math.abs(Math.atan2(dy, dx)) * DEG;
}

// ---------------------------------------------------------------------------
// EVF constraint thresholds — shoulder 11/12, elbow 13/14, wrist 15/16
// ---------------------------------------------------------------------------

const EVF_ANGLE_MIN = 100;
const EVF_ANGLE_MAX = 120;
const EVF_VERTICALITY_MIN = 70;
const CATCH_PHASE_THRESHOLD = 0.3;
const STROKE_RANGE_DECAY = 0.005;

// ---------------------------------------------------------------------------
// checkEVF — internal elbow angle 100°–120°, forearm vertical, catch phase
// ---------------------------------------------------------------------------

function checkEVFForArm(
  shoulder: NormalizedLandmark,
  elbow: NormalizedLandmark,
  wrist: NormalizedLandmark,
  strokeRange: StrokeRange
): ArmEVF {
  const S: Point = { x: shoulder.x, y: shoulder.y };
  const E: Point = { x: elbow.x, y: elbow.y };
  const W: Point = { x: wrist.x, y: wrist.y };

  const elbowAngle = angleBetweenPoints(S, E, W);
  const verticality = forearmVerticality(E, W);

  const range = strokeRange.maxY - strokeRange.minY;
  const normalizedY =
    range > 0.01 ? (W.y - strokeRange.minY) / range : 0.5;
  const inCatchPhase = normalizedY < CATCH_PHASE_THRESHOLD;

  const angleOk = elbowAngle >= EVF_ANGLE_MIN && elbowAngle <= EVF_ANGLE_MAX;
  const verticalOk = verticality >= EVF_VERTICALITY_MIN;

  return {
    elbowAngle,
    verticality,
    inCatchPhase,
    isEVF: angleOk && verticalOk && inCatchPhase,
  };
}

function checkEVF(
  landmarks: NormalizedLandmark[],
  strokeRange: StrokeRange
): EVFResult {
  return {
    left: checkEVFForArm(landmarks[11], landmarks[13], landmarks[15], strokeRange),
    right: checkEVFForArm(landmarks[12], landmarks[14], landmarks[16], strokeRange),
  };
}

// ---------------------------------------------------------------------------
// Drawing — EVF arm segments #39FF14
// ---------------------------------------------------------------------------

const NEON_GREEN = "#39FF14";
const DEFAULT_LIMB = "rgba(0, 200, 255, 0.55)";
const DEFAULT_JOINT = "rgba(255, 255, 255, 0.85)";

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  poseConnections: readonly PoseConnection[],
  evf: EVFResult,
  width: number,
  height: number
) {
  ctx.clearRect(0, 0, width, height);

  const evfSegments = new Set<string>();

  if (evf.left.isEVF) {
    evfSegments.add("11-13");
    evfSegments.add("13-15");
  }
  if (evf.right.isEVF) {
    evfSegments.add("12-14");
    evfSegments.add("14-16");
  }

  for (const [startIdx, endIdx] of poseConnections) {
    const start = landmarks[startIdx];
    const end = landmarks[endIdx];
    if (!start || !end) continue;
    if (start.visibility !== undefined && start.visibility < 0.5) continue;
    if (end.visibility !== undefined && end.visibility < 0.5) continue;

    const segKey = `${startIdx}-${endIdx}`;
    const isEVFSeg = evfSegments.has(segKey);

    ctx.beginPath();
    ctx.moveTo(start.x * width, start.y * height);
    ctx.lineTo(end.x * width, end.y * height);
    ctx.strokeStyle = isEVFSeg ? NEON_GREEN : DEFAULT_LIMB;
    ctx.lineWidth = isEVFSeg ? 4 : 2;
    if (isEVFSeg) {
      ctx.shadowColor = NEON_GREEN;
      ctx.shadowBlur = 12;
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }
    ctx.stroke();
  }

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (lm.visibility !== undefined && lm.visibility < 0.5) continue;

    const isEVFJoint =
      (evf.left.isEVF && (i === 11 || i === 13 || i === 15)) ||
      (evf.right.isEVF && (i === 12 || i === 14 || i === 16));

    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, isEVFJoint ? 5 : 3, 0, 2 * Math.PI);
    ctx.fillStyle = isEVFJoint ? NEON_GREEN : DEFAULT_JOINT;
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Sidebar — pro-sport dark panels
// ---------------------------------------------------------------------------

function pickDisplayArm(evf: EVFResult): ArmEVF {
  if (evf.left.inCatchPhase && !evf.right.inCatchPhase) return evf.left;
  if (evf.right.inCatchPhase && !evf.left.inCatchPhase) return evf.right;
  return evf.left.elbowAngle >= evf.right.elbowAngle ? evf.left : evf.right;
}

function MetricsPanel({ evf }: { evf: EVFResult | null }) {
  const arm = evf ? pickDisplayArm(evf) : null;
  const anyEVF = evf ? evf.left.isEVF || evf.right.isEVF : false;

  return (
    <div className="flex flex-col gap-4 w-72 shrink-0">
      <div className="rounded-xl bg-zinc-950/90 border border-zinc-800/80 p-5 shadow-lg shadow-black/40">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Live Elbow Angle
          </span>
        </div>
        <p className="text-4xl font-mono font-bold tabular-nums text-white tracking-tight">
          {arm ? `${arm.elbowAngle.toFixed(1)}°` : "—"}
        </p>
        <p className="text-xs text-zinc-500 mt-2">
          EVF window: {EVF_ANGLE_MIN}°–{EVF_ANGLE_MAX}° · forearm vertical
        </p>
      </div>

      <div className="rounded-xl bg-zinc-950/90 border border-zinc-800/80 p-5 shadow-lg shadow-black/40">
        <div className="flex items-center gap-2 mb-3">
          <Waves className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Forearm verticality
          </span>
        </div>
        <p className="text-2xl font-mono font-bold tabular-nums text-zinc-200">
          {arm ? `${arm.verticality.toFixed(1)}°` : "—"}
        </p>
        <p className="text-xs text-zinc-500 mt-2">
          Min {EVF_VERTICALITY_MIN}° from horizontal for EVF
        </p>
      </div>

      <div className="rounded-xl bg-zinc-950/90 border border-zinc-800/80 p-5 shadow-lg shadow-black/40">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-3 block">
          Catch phase
        </span>
        <div className="flex items-center gap-3">
          <span
            className={`inline-block w-3 h-3 rounded-full ${
              anyEVF
                ? "bg-[#39FF14] shadow-[0_0_12px_#39FF14]"
                : "bg-amber-600"
            }`}
          />
          <span className="text-base font-semibold text-zinc-100">
            {anyEVF ? "EVF active" : "Tracking"}
          </span>
        </div>
        {evf && (
          <p className="mt-3 text-xs text-zinc-500">
            L {evf.left.isEVF ? "●" : "○"} · R {evf.right.isEVF ? "●" : "○"}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-zinc-950/90 border border-emerald-950/50 p-4 flex items-start gap-3 shadow-lg shadow-black/40">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-emerald-300">
            Privacy Status: Local-Only
          </p>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            Video never leaves this device. Pose runs in your browser only.
          </p>
        </div>
      </div>
    </div>
  );
}

// MediaPipe constructor resolution (CJS / interop)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolvePoseCtor(mp: any): new (config: PoseConstructorConfig) => PoseInstance {
  const windowPose =
    typeof window !== "undefined"
      ? (window as Window & { Pose?: unknown }).Pose
      : undefined;

  const Ctor = mp.Pose || mp.default?.Pose || windowPose || mp;

  // Keep a stable global constructor so bundler minification cannot shadow it.
  if (typeof window !== "undefined" && typeof Ctor === "function") {
    (window as Window & { Pose?: unknown }).Pose = Ctor;
  }

  return Ctor as new (config: PoseConstructorConfig) => PoseInstance;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolvePoseConnections(mp: any): readonly PoseConnection[] {
  const windowConnections =
    typeof window !== "undefined"
      ? (window as Window & { POSE_CONNECTIONS?: unknown }).POSE_CONNECTIONS
      : undefined;

  const connections =
    mp?.POSE_CONNECTIONS ||
    mp?.default?.POSE_CONNECTIONS ||
    windowConnections ||
    [];

  return Array.isArray(connections)
    ? (connections as readonly PoseConnection[])
    : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveCameraCtor(mp: any): new (
  video: HTMLVideoElement,
  options: {
    onFrame: () => Promise<void>;
    width?: number;
    height?: number;
  }
) => { start: () => Promise<void>; stop: () => void } {
  const windowCamera =
    typeof window !== "undefined"
      ? (window as Window & { Camera?: unknown }).Camera
      : undefined;

  // camera_utils is commonly distributed as UMD that attaches `Camera` to window.
  // Depending on bundler interop, the dynamic import may not expose a named export.
  const Ctor =
    mp?.Camera || mp?.default?.Camera || windowCamera || mp?.default || mp;

  if (typeof Ctor !== "function") {
    const keys =
      mp && typeof mp === "object" ? Object.keys(mp).slice(0, 25) : [];
    throw new Error(
      `MediaPipe Camera constructor not found. typeof=${typeof Ctor}; moduleKeys=${keys.join(
        ","
      )}`
    );
  }

  // Keep a stable global constructor so bundler minification cannot shadow it.
  if (typeof window !== "undefined") {
    (window as Window & { Camera?: unknown }).Camera = Ctor;
  }

  return Ctor as new (
    video: HTMLVideoElement,
    options: { onFrame: () => Promise<void>; width?: number; height?: number }
  ) => { start: () => Promise<void>; stop: () => void };
}

const MEDIAPIPE_POSE_VERSION = "0.5.1675469404";
const POSE_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/pose@${MEDIAPIPE_POSE_VERSION}/`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function AnalysisEngine() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeRangeRef = useRef<StrokeRange>({ minY: 1, maxY: 0 });
  const poseConnectionsRef = useRef<readonly PoseConnection[] | null>(null);

  const [evfState, setEvfState] = useState<EVFResult | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [videoStreamReady, setVideoStreamReady] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const onResults = useCallback((results: Results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const poseConnections = poseConnectionsRef.current ?? [];

    const video = webcamRef.current?.video;
    canvas.width = video?.videoWidth || 640;
    canvas.height = video?.videoHeight || 480;

    if (!results.poseLandmarks) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const lm = results.poseLandmarks;

    const sr = strokeRangeRef.current;
    const leftW = lm[15];
    const rightW = lm[16];
    if (leftW && rightW) {
      const wristY = Math.min(leftW.y, rightW.y);
      sr.minY = Math.min(sr.minY, wristY);
      sr.maxY = Math.max(sr.maxY, wristY);
    }
    sr.minY += STROKE_RANGE_DECAY;
    sr.maxY -= STROKE_RANGE_DECAY;
    if (sr.minY > sr.maxY && leftW && rightW) {
      const wristY = Math.min(leftW.y, rightW.y);
      sr.minY = wristY;
      sr.maxY = wristY;
    }

    const evf = checkEVF(lm, sr);
    setEvfState(evf);
    drawSkeleton(ctx, lm, poseConnections, evf, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    if (!videoStreamReady) return;

    const videoEl = webcamRef.current?.video;
    if (!videoEl) return;

    let cancelled = false;
    let camera: { stop: () => void } | null = null;
    let pose: PoseInstance | null = null;

    setCameraReady(false);
    setIsLoaded(false);

    (async () => {
      const mpPoseMod = await import("@mediapipe/pose");
      if (cancelled) return;

      const mpCameraMod = await import("@mediapipe/camera_utils");
      if (cancelled) return;

      poseConnectionsRef.current = resolvePoseConnections(mpPoseMod);

      const PoseConstructor = resolvePoseCtor(mpPoseMod);
      const CameraConstructor = resolveCameraCtor(mpCameraMod);

      const poseInstance = new PoseConstructor({
        locateFile: (file: string) => `${POSE_CDN}${file}`,
      });

      poseInstance.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      poseInstance.onResults(onResults);
      pose = poseInstance;

      if (typeof poseInstance.initialize === "function") {
        try {
          await poseInstance.initialize();
        } catch {
          if (!cancelled) setIsLoaded(false);
          return;
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      if (!cancelled) setIsLoaded(true);

      const cameraInstance = new CameraConstructor(videoEl, {
        onFrame: async () => {
          try {
            await poseInstance.send({ image: videoEl });
          } catch (error) {
            if (!cancelled) {
              console.error("Pose frame send failed", error);
            }
          }
        },
        width: 640,
        height: 480,
      });

      camera = cameraInstance;

      try {
        await cameraInstance.start();
      } catch {
        if (!cancelled) setCameraReady(false);
        return;
      }

      if (!cancelled) setCameraReady(true);
    })();

    return () => {
      cancelled = true;
      setCameraReady(false);
      setIsLoaded(false);
      poseConnectionsRef.current = null;
      try {
        camera?.stop();
      } catch {
        /* ignore */
      }
      try {
        pose?.close();
      } catch {
        /* ignore */
      }
      camera = null;
      pose = null;
    };
  }, [onResults, videoStreamReady]);

  return (
    <div className="flex gap-6 w-full h-full items-start bg-transparent">
      <div className="relative flex-1 rounded-2xl overflow-hidden bg-black border border-zinc-800 shadow-2xl shadow-black/50">
        <Webcam
          ref={webcamRef}
          mirrored
          className="relative z-0 w-full h-full object-cover"
          videoConstraints={{ width: 640, height: 480, facingMode: "user" }}
          onUserMedia={() => setVideoStreamReady(true)}
          onUserMediaError={() => setVideoStreamReady(false)}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-[100]"
          style={{ transform: "scaleX(-1)" }}
          aria-hidden
        />
        {(!isLoaded || !cameraReady) && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center bg-zinc-950/85 backdrop-blur-sm">
            <div className="text-center px-4">
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-zinc-400">Initializing pose engine…</p>
            </div>
          </div>
        )}
      </div>

      <MetricsPanel evf={evfState} />
    </div>
  );
}
