'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import type { NormalizedLandmark, Results } from "@mediapipe/pose";
import {
  Activity,
  AlertTriangle,
  Brain,
  Camera,
  Clock,
  Gauge,
  Hand,
  Eye,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Zap,
} from "lucide-react";

interface Point {
  x: number;
  y: number;
}

interface Point3D extends Point {
  z: number;
}

interface ArmEVF {
  elbowAngle: number;
  verticality: number;
  inCatchPhase: boolean;
  isEVF: boolean;
  valid: boolean;
  confidence: number;
}

interface EVFResult {
  left: ArmEVF;
  right: ArmEVF;
}

type ArmSide = "left" | "right";
type PredictionMode = "off" | "assist" | "extended";
type TrackingState = "live" | "limited" | "predicting" | "lost";

type StrokeType =
  | "Freestyle"
  | "Backstroke"
  | "Butterfly"
  | "Breaststroke"
  | "Unknown";

interface TechniqueFeedback {
  id: string;
  severity: "good" | "warning" | "critical";
  message: string;
}

interface ShoulderMetrics {
  visible: boolean;
  view: "front" | "side" | "top" | "unknown";
  trackedSide: ArmSide | "both" | "none";
  slopeDegrees: number;
  width: number;
  centerX: number;
  centerY: number;
}

interface TechniqueAnalysis {
  stroke: StrokeType;
  rawStroke: StrokeType;
  confidence: number;
  lockState: "acquiring" | "locked" | "switching" | "holding";
  shoulders: ShoulderMetrics;
  feedback: TechniqueFeedback[];
}

interface FullAnalysis {
  evf: EVFResult;
  technique: TechniqueAnalysis;
  styleCheck: StyleCheckStatus;
  armIdentity: ArmIdentityStatus;
  tracking: TrackingStatus;
  trails: MotionTrails;
}

interface StrokeRange {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface StrokeMemory {
  stableStroke: StrokeType;
  stableConfidence: number;
  candidateStroke: StrokeType;
  candidateFrames: number;
  unknownFrames: number;
}

interface StyleCheckStatus {
  intervalMs: number;
  lastCheckedMsAgo: number | null;
  nextCheckMs: number;
  sampleCount: number;
}

interface StyleVote {
  samples: number;
  confidenceTotal: number;
  confidencePeak: number;
}

interface StyleAccumulator {
  samples: number;
  votes: Partial<Record<StrokeType, StyleVote>>;
}

interface MotionTrack {
  points: Point[];
}

interface ArmMotion {
  samples: number;
  rangeX: number;
  rangeY: number;
}

interface MotionSummary {
  left: ArmMotion;
  right: ArmMotion;
}

interface MotionHistory {
  leftWrist: MotionTrack;
  rightWrist: MotionTrack;
}

interface ArmAngleTrack {
  elbowAngle: number;
  verticality: number;
  confidence: number;
  missingFrames: number;
}

interface AngleMemory {
  left: ArmAngleTrack | null;
  right: ArmAngleTrack | null;
}

interface ActiveArmMemory {
  side: ArmSide | null;
  candidateSide: ArmSide | null;
  candidateFrames: number;
  missingFrames: number;
}

interface ArmIdentityMemory {
  swap: boolean;
  locked: boolean;
  observedFrames: number;
  candidateSwap: boolean | null;
  candidateFrames: number;
  missingFrames: number;
  leftAnchor: Point | null;
  rightAnchor: Point | null;
}

interface ArmIdentityStatus {
  locked: boolean;
  swapped: boolean;
  leftTracked: boolean;
  rightTracked: boolean;
  confidence: number;
}

interface ArmIdentityResolution {
  landmarks: NormalizedLandmark[];
  status: ArmIdentityStatus;
  swappedChanged: boolean;
}

interface ArmChainStatus {
  score: number;
  complete: boolean;
  shoulder: boolean;
  elbow: boolean;
  wrist: boolean;
  edgeCount: number;
}

interface TrackingStatus {
  state: TrackingState;
  predictionMode: PredictionMode;
  predictionFrames: number;
  maxPredictionFrames: number;
  visibleLandmarks: number;
  reliableLandmarks: number;
  edgeLandmarks: number;
  quality: number;
  fps: number;
  leftArm: ArmChainStatus;
  rightArm: ArmChainStatus;
}

interface MotionTrails {
  left: Point[];
  right: Point[];
}

interface TrackerSettings {
  predictionMode: PredictionMode;
  edgeGuard: boolean;
  showSkeleton: boolean;
  showJoints: boolean;
  showTrails: boolean;
  overlayOpacity: number;
}

interface VideoRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OverlayMetrics {
  width: number;
  height: number;
  videoRect: VideoRect;
}

interface ArmSignal {
  score: number;
  complete: boolean;
  partial: boolean;
  hasShoulder: boolean;
  hasElbow: boolean;
  hasWrist: boolean;
}

interface LandmarkVelocity {
  x: number;
  y: number;
  z: number;
}

interface LandmarkTrack {
  landmark: NormalizedLandmark;
  velocity: LandmarkVelocity;
  missingFrames: number;
}

type PoseConnection = readonly [number, number];
type LandmarkTrackingMemory = Array<LandmarkTrack | null>;
type CatchAxis = "x" | "y";
type StyleResult = Pick<TechniqueAnalysis, "stroke" | "confidence">;
type PoseConstructorConfig = { locateFile?: (f: string) => string };

interface PoseInstance {
  setOptions: (o: Record<string, unknown>) => void;
  onResults: (cb: (r: Results) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<unknown>;
  close: () => void;
  initialize?: () => Promise<void>;
}

const DEG = 180 / Math.PI;
const EVF_ANGLE_MIN = 100;
const EVF_ANGLE_MAX = 120;
const EVF_TOP_VIEW_ANGLE_MIN = 90;
const EVF_TOP_VIEW_ANGLE_MAX = 140;
const EVF_VERTICALITY_MIN = 70;
const EVF_TOP_VIEW_VERTICALITY_MIN = 58;
const CATCH_PHASE_THRESHOLD = 0.3;
const CATCH_PHASE_EDGE_THRESHOLD = 0.28;
const STROKE_RANGE_DECAY = 0.005;
const LANDMARK_SMOOTHING_ALPHA = 0.44;
const LANDMARK_RELIABLE_VISIBILITY = 0.5;
const LANDMARK_PARTIAL_VISIBILITY = 0.22;
const LANDMARK_DRAW_VISIBILITY = 0.24;
const HAND_PROXY_VISIBILITY = 0.34;
const LOW_CONFIDENCE_JUMP_LIMIT = 0.11;
const RELIABLE_JUMP_LIMIT = 0.24;
const ASSIST_PREDICTION_HOLD_FRAMES = 8;
const EXTENDED_PREDICTION_HOLD_FRAMES = 22;
const MOTION_HISTORY_LENGTH = 42;
const DEFAULT_STYLE_CHECK_INTERVAL_MS = 8000;
const MIN_STYLE_CHECK_INTERVAL_MS = 3000;
const MAX_STYLE_CHECK_INTERVAL_MS = 15000;
const STYLE_CHECK_INTERVAL_STEP_MS = 1000;
const STROKE_ACQUIRE_CHECKS = 1;
const STROKE_SWITCH_CHECKS = 4;
const STROKE_MEMORY_HOLD_CHECKS = 5;
const ACTIVE_ARM_ACQUIRE_FRAMES = 8;
const ACTIVE_ARM_SWITCH_FRAMES = 48;
const ACTIVE_ARM_HOLD_FRAMES = 45;
const ARM_IDENTITY_ACQUIRE_FRAMES = 8;
const ARM_IDENTITY_SWITCH_FRAMES = 30;
const ARM_IDENTITY_HOLD_FRAMES = 45;
const ARM_IDENTITY_SWAP_MARGIN = 0.085;
const ARM_IDENTITY_ANCHOR_ALPHA = 0.08;
const UI_UPDATE_INTERVAL_MS = 250;
const MIN_ARM_SIGNAL_SCORE = 0.62;
const SIDE_VIEW_SHOULDER_WIDTH_THRESHOLD = 0.06;
const SINGLE_SHOULDER_SIDE_SCORE_MARGIN = 0.5;
const ACTIVE_ARM_SWITCH_SCORE_MARGIN = 1.25;
const ARM_SEGMENT_MIN = 0.015;
const FOREARM_SEGMENT_MAX = 0.58;
const UPPER_ARM_SEGMENT_MAX = 0.52;
const ARM_RATIO_MIN = 0.25;
const ARM_RATIO_MAX = 3.4;
const ANGLE_SMOOTHING_ALPHA = 0.34;
const ANGLE_MAX_STEP_DEGREES = 9;
const ANGLE_HOLD_FRAMES = 5;
const MIN_ANGLE_CONFIDENCE = 0.35;
const VIDEO_WIDTH = 960;
const VIDEO_HEIGHT = 540;
const NEON_GREEN = "#39FF14";
const DEFAULT_LIMB = "rgba(0, 200, 255, 0.55)";
const DEFAULT_JOINT = "rgba(255, 255, 255, 0.85)";
const SHOULDER_LINE = "rgba(250, 204, 21, 0.95)";
const MEDIAPIPE_POSE_VERSION = "0.5.1675469404";
const POSE_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/pose@${MEDIAPIPE_POSE_VERSION}/`;
const DEFAULT_TRACKER_SETTINGS: TrackerSettings = {
  predictionMode: "off",
  edgeGuard: true,
  showSkeleton: true,
  showJoints: true,
  showTrails: true,
  overlayOpacity: 0.9,
};
const SWIM_CONNECTIONS: readonly PoseConnection[] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [11, 23],
  [12, 24],
  [23, 24],
];
const SWIM_LANDMARKS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
]);

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

function forearmImageVerticality(elbow: Point, wrist: Point): number {
  const dx = wrist.x - elbow.x;
  const dy = wrist.y - elbow.y;
  const angle = Math.abs(Math.atan2(dy, dx) * DEG);
  return angle > 90 ? 180 - angle : angle;
}

function forearmVerticality(elbow: Point3D, wrist: Point3D, useDepth: boolean): number {
  const imageVerticality = forearmImageVerticality(elbow, wrist);
  if (!useDepth) return imageVerticality;

  const planarLength = Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y);
  const depthPitch = Math.atan2(Math.abs(wrist.z - elbow.z), Math.max(planarLength, 0.001)) * DEG;
  return imageVerticality * 0.82 + Math.min(depthPitch, 90) * 0.18;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function smoothPoint(
  previous: Point | null,
  current: Point,
  alpha: number
): Point {
  if (!previous) return current;

  return {
    x: previous.x * (1 - alpha) + current.x * alpha,
    y: previous.y * (1 - alpha) + current.y * alpha,
  };
}

function landmarkDistance(
  a: NormalizedLandmark,
  b: NormalizedLandmark
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function limitStep(previous: number, current: number, maxStep: number): number {
  return previous + clamp(current - previous, -maxStep, maxStep);
}

function getCoverRect(
  containerWidth: number,
  containerHeight: number,
  mediaWidth: number,
  mediaHeight: number
): VideoRect {
  const mediaAspect = mediaWidth / Math.max(mediaHeight, 1);
  const containerAspect = containerWidth / Math.max(containerHeight, 1);

  if (containerAspect > mediaAspect) {
    const height = containerWidth / mediaAspect;
    return {
      x: 0,
      y: (containerHeight - height) / 2,
      width: containerWidth,
      height,
    };
  }

  const width = containerHeight * mediaAspect;
  return {
    x: (containerWidth - width) / 2,
    y: 0,
    width,
    height: containerHeight,
  };
}

function prepareOverlayCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | undefined
): OverlayMetrics {
  const width = Math.max(1, canvas.clientWidth || video?.clientWidth || VIDEO_WIDTH);
  const height = Math.max(1, canvas.clientHeight || video?.clientHeight || VIDEO_HEIGHT);
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return {
    width,
    height,
    videoRect: getCoverRect(
      width,
      height,
      video?.videoWidth || VIDEO_WIDTH,
      video?.videoHeight || VIDEO_HEIGHT
    ),
  };
}

function projectLandmark(
  landmark: NormalizedLandmark,
  metrics: OverlayMetrics
): Point {
  return projectNormalizedPoint(landmark, metrics);
}

function projectNormalizedPoint(point: Point, metrics: OverlayMetrics): Point {
  const { videoRect } = metrics;

  return {
    x: videoRect.x + (1 - point.x) * videoRect.width,
    y: videoRect.y + point.y * videoRect.height,
  };
}

function predictionHoldFrames(mode: PredictionMode): number {
  if (mode === "extended") return EXTENDED_PREDICTION_HOLD_FRAMES;
  if (mode === "assist") return ASSIST_PREDICTION_HOLD_FRAMES;
  return 0;
}

function predictionModeLabel(mode: PredictionMode): string {
  if (mode === "extended") return "Extended";
  if (mode === "assist") return "Assist";
  return "Off";
}

function isOutsideFrame(lm: NormalizedLandmark, margin = 0.015): boolean {
  return (
    lm.x < -margin ||
    lm.x > 1 + margin ||
    lm.y < -margin ||
    lm.y > 1 + margin
  );
}

function isNearFrameEdge(lm: NormalizedLandmark, margin = 0.025): boolean {
  return lm.x <= margin || lm.x >= 1 - margin || lm.y <= margin || lm.y >= 1 - margin;
}

function isLikelyOffscreenLandmark(lm: NormalizedLandmark): boolean {
  const visibility = landmarkVisibility(lm);
  return isOutsideFrame(lm) || (isNearFrameEdge(lm, 0.018) && visibility < LANDMARK_PARTIAL_VISIBILITY);
}

function isTrackableLandmark(
  lm: NormalizedLandmark | undefined,
  minVisibility = LANDMARK_PARTIAL_VISIBILITY
): lm is NormalizedLandmark {
  return Boolean(lm && !isOutsideFrame(lm, 0.035) && isVisible(lm, minVisibility));
}

function range(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

function isVisible(
  lm: NormalizedLandmark | undefined,
  minVisibility = LANDMARK_RELIABLE_VISIBILITY
): lm is NormalizedLandmark {
  return Boolean(lm && (lm.visibility === undefined || lm.visibility >= minVisibility));
}

function landmarkVisibility(lm: NormalizedLandmark | undefined): number {
  return lm?.visibility ?? (lm ? 1 : 0);
}

function toPoint3D(lm: NormalizedLandmark): Point3D {
  return {
    x: lm.x,
    y: lm.y,
    z: lm.z ?? 0,
  };
}

function cloneLandmark(lm: NormalizedLandmark): NormalizedLandmark {
  return {
    ...lm,
    z: lm.z ?? 0,
    visibility: landmarkVisibility(lm),
  };
}

function createLandmarkTrackingMemory(): LandmarkTrackingMemory {
  return [];
}

function emptyLandmark(): NormalizedLandmark {
  return { x: 0, y: 0, z: 0, visibility: 0 };
}

function blendLandmarks(
  from: NormalizedLandmark,
  to: NormalizedLandmark,
  alpha: number,
  visibility: number
): NormalizedLandmark {
  return {
    ...to,
    x: clamp01(from.x * (1 - alpha) + to.x * alpha),
    y: clamp01(from.y * (1 - alpha) + to.y * alpha),
    z: (from.z ?? 0) * (1 - alpha) + (to.z ?? 0) * alpha,
    visibility,
  };
}

function limitLandmarkJump(
  from: NormalizedLandmark,
  to: NormalizedLandmark,
  maxJump: number
): NormalizedLandmark {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const jump = Math.hypot(dx, dy);

  if (jump <= maxJump || jump === 0) return to;

  const scale = maxJump / jump;
  return {
    ...to,
    x: clamp01(from.x + dx * scale),
    y: clamp01(from.y + dy * scale),
    z: (from.z ?? 0) + ((to.z ?? 0) - (from.z ?? 0)) * scale,
  };
}

function stabilizeLandmarks(
  current: NormalizedLandmark[],
  memory: LandmarkTrackingMemory,
  settings: TrackerSettings
): NormalizedLandmark[] {
  const maxHoldFrames = predictionHoldFrames(settings.predictionMode);

  return current.map((lm, index) => {
    const rawLandmark = cloneLandmark(lm);
    const edgeOccluded = settings.edgeGuard && isLikelyOffscreenLandmark(rawLandmark);
    const currentLandmark = edgeOccluded
      ? { ...rawLandmark, visibility: 0 }
      : rawLandmark;
    const track = memory[index];
    const currentVisibility = landmarkVisibility(currentLandmark);

    if (!track) {
      memory[index] = {
        landmark: currentLandmark,
        velocity: { x: 0, y: 0, z: 0 },
        missingFrames: currentVisibility >= LANDMARK_PARTIAL_VISIBILITY ? 0 : 1,
      };
      return currentLandmark;
    }

    const prev = track.landmark;
    const previousVisibility = landmarkVisibility(prev);
    const isReliable = currentVisibility >= LANDMARK_RELIABLE_VISIBILITY;
    const isPartial = currentVisibility >= LANDMARK_PARTIAL_VISIBILITY;
    const rawJump = landmarkDistance(prev, currentLandmark);
    const canPredictMissing =
      maxHoldFrames > 0 &&
      previousVisibility >= LANDMARK_PARTIAL_VISIBILITY &&
      track.missingFrames < maxHoldFrames;
    const shouldHoldOutlier =
      !isPartial &&
      previousVisibility >= LANDMARK_PARTIAL_VISIBILITY &&
      (edgeOccluded || rawJump > LOW_CONFIDENCE_JUMP_LIMIT) &&
      canPredictMissing;

    if (!isPartial && !canPredictMissing) {
      memory[index] = {
        landmark: currentLandmark,
        velocity: { x: 0, y: 0, z: 0 },
        missingFrames: track.missingFrames + 1,
      };
      return currentLandmark;
    }

    const predicted: NormalizedLandmark = {
      ...prev,
      x: clamp01(prev.x + track.velocity.x * 0.18),
      y: clamp01(prev.y + track.velocity.y * 0.18),
      z: (prev.z ?? 0) + track.velocity.z * 0.18,
      visibility: Math.max(
        currentVisibility,
        previousVisibility * (isPartial ? 0.68 : 0.46)
      ),
    };

    const filteredCurrent = shouldHoldOutlier
      ? predicted
      : limitLandmarkJump(
          prev,
          currentLandmark,
          isReliable ? RELIABLE_JUMP_LIMIT : LOW_CONFIDENCE_JUMP_LIMIT
        );
    const alpha = isReliable
      ? rawJump > RELIABLE_JUMP_LIMIT
        ? 0.56
        : LANDMARK_SMOOTHING_ALPHA
      : isPartial
        ? 0.24
        : 0.04;
    const base = isPartial ? prev : predicted;
    const visibility = isReliable
      ? Math.max(currentVisibility, previousVisibility * 0.9)
      : isPartial
        ? Math.max(currentVisibility, previousVisibility * 0.55)
        : landmarkVisibility(predicted);
    const next = blendLandmarks(base, filteredCurrent, alpha, visibility);
    const velocity = isPartial
      ? {
          x: track.velocity.x * 0.78 + (next.x - prev.x) * 0.22,
          y: track.velocity.y * 0.78 + (next.y - prev.y) * 0.22,
          z: track.velocity.z * 0.78 + ((next.z ?? 0) - (prev.z ?? 0)) * 0.22,
        }
      : {
          x: track.velocity.x * 0.72,
          y: track.velocity.y * 0.72,
          z: track.velocity.z * 0.72,
        };

    memory[index] = {
      landmark: next,
      velocity,
      missingFrames: isPartial ? 0 : track.missingFrames + 1,
    };

    return next;
  });
}

function predictLandmarksFromMemory(
  memory: LandmarkTrackingMemory
): NormalizedLandmark[] | null {
  if (memory.length === 0) return null;

  let visibleCount = 0;
  const landmarks = Array.from({ length: Math.max(33, memory.length) }, (_, index) => {
    const track = memory[index];
    if (!track) return emptyLandmark();

    const next: NormalizedLandmark = {
      ...track.landmark,
      x: clamp01(track.landmark.x + track.velocity.x * 0.12),
      y: clamp01(track.landmark.y + track.velocity.y * 0.12),
      z: (track.landmark.z ?? 0) + track.velocity.z * 0.12,
      visibility: landmarkVisibility(track.landmark) * 0.5,
    };

    track.landmark = next;
    track.velocity = {
      x: track.velocity.x * 0.68,
      y: track.velocity.y * 0.68,
      z: track.velocity.z * 0.68,
    };
    track.missingFrames += 1;

    if (isVisible(next, LANDMARK_DRAW_VISIBILITY)) visibleCount += 1;
    return next;
  });

  return visibleCount >= 3 ? landmarks : null;
}

function armIndices(side: ArmSide) {
  return side === "left"
    ? { shoulder: 11, elbow: 13, wrist: 15 }
    : { shoulder: 12, elbow: 14, wrist: 16 };
}

function handIndices(side: ArmSide): readonly number[] {
  return side === "left" ? [17, 19, 21] : [18, 20, 22];
}

function fullSideIndices(side: ArmSide): readonly number[] {
  const indices = armIndices(side);
  return [
    indices.shoulder,
    indices.elbow,
    indices.wrist,
    ...handIndices(side),
  ];
}

function oppositeArm(side: ArmSide): ArmSide {
  return side === "left" ? "right" : "left";
}

function averageVisibleLandmarks(
  landmarks: NormalizedLandmark[],
  indices: readonly number[],
  minVisibility: number
): NormalizedLandmark | null {
  let weightTotal = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  let peakVisibility = 0;

  for (const index of indices) {
    const landmark = landmarks[index];
    const visibility = landmarkVisibility(landmark);
    if (!landmark || visibility < minVisibility) continue;

    const weight = Math.max(visibility, 0.01);
    weightTotal += weight;
    x += landmark.x * weight;
    y += landmark.y * weight;
    z += (landmark.z ?? 0) * weight;
    peakVisibility = Math.max(peakVisibility, visibility);
  }

  if (weightTotal === 0) return null;

  return {
    x: clamp01(x / weightTotal),
    y: clamp01(y / weightTotal),
    z: z / weightTotal,
    visibility: peakVisibility,
  };
}

function stabilizeHandEndpoint(
  landmarks: NormalizedLandmark[],
  side: ArmSide
) {
  const indices = armIndices(side);
  const shoulder = landmarks[indices.shoulder];
  const elbow = landmarks[indices.elbow];
  const wrist = landmarks[indices.wrist];
  const visibleHandCount = handIndices(side).filter((index) =>
    isTrackableLandmark(landmarks[index], HAND_PROXY_VISIBILITY)
  ).length;
  const handProxy = averageVisibleLandmarks(
    landmarks,
    handIndices(side),
    HAND_PROXY_VISIBILITY
  );

  if (!handProxy || !isVisible(elbow, LANDMARK_DRAW_VISIBILITY)) return;
  if (visibleHandCount < 2 && !isVisible(wrist, LANDMARK_PARTIAL_VISIBILITY)) return;

  let target = handProxy;
  const handDistance = distance(elbow, handProxy);
  const upperArmLength =
    isVisible(shoulder, LANDMARK_DRAW_VISIBILITY) && isVisible(elbow, LANDMARK_DRAW_VISIBILITY)
      ? distance(shoulder, elbow)
      : 0;
  const wristVisibility = landmarkVisibility(wrist);
  const wristDistance =
    wrist && isVisible(wrist, LANDMARK_DRAW_VISIBILITY) ? distance(elbow, wrist) : 0;
  const baseLength = upperArmLength > 0 ? upperArmLength : wristDistance;
  const minForearmLength = Math.max(0.014, baseLength > 0 ? baseLength * 0.28 : 0.014);
  const maxForearmLength = clamp(
    baseLength > 0 ? baseLength * 1.55 : 0.36,
    0.07,
    FOREARM_SEGMENT_MAX
  );

  if (handDistance < minForearmLength) return;

  if (handDistance > maxForearmLength) {
    target = limitLandmarkJump(elbow, handProxy, maxForearmLength);
  }

  const wristToProxy = wrist ? landmarkDistance(wrist, target) : 0;
  const proxyDisagreesWithReliableWrist =
    wristVisibility >= LANDMARK_RELIABLE_VISIBILITY &&
    wristToProxy > Math.max(0.07, Math.max(wristDistance, minForearmLength) * 0.75);
  const proxyWeight =
    proxyDisagreesWithReliableWrist
      ? 0.08
      : wristVisibility >= LANDMARK_RELIABLE_VISIBILITY
      ? 0.28
      : wristVisibility >= LANDMARK_PARTIAL_VISIBILITY
        ? 0.58
        : 0.9;
  const base = wrist ?? handProxy;

  landmarks[indices.wrist] = blendLandmarks(
    base,
    target,
    proxyWeight,
    Math.max(
      wristVisibility * 0.9,
      landmarkVisibility(target),
      HAND_PROXY_VISIBILITY
    )
  );
}

function enhanceSwimLandmarks(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
  const enhanced = landmarks.map((landmark) => cloneLandmark(landmark));

  stabilizeHandEndpoint(enhanced, "left");
  stabilizeHandEndpoint(enhanced, "right");

  return enhanced;
}

function getArmAnchor(
  landmarks: NormalizedLandmark[],
  side: ArmSide
): Point | null {
  const anchor = averageVisibleLandmarks(
    landmarks,
    fullSideIndices(side),
    LANDMARK_DRAW_VISIBILITY
  );

  return anchor ? { x: anchor.x, y: anchor.y } : null;
}

function swapBodySides(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
  const swapped = landmarks.map((landmark) => cloneLandmark(landmark));

  for (const [leftIndex, rightIndex] of [
    [11, 12],
    [13, 14],
    [15, 16],
    [17, 18],
    [19, 20],
    [21, 22],
    [23, 24],
  ] as const) {
    swapped[leftIndex] = cloneLandmark(landmarks[rightIndex]);
    swapped[rightIndex] = cloneLandmark(landmarks[leftIndex]);
  }

  return swapped;
}

function createArmIdentityStatus(
  memory: ArmIdentityMemory,
  leftTracked: boolean,
  rightTracked: boolean
): ArmIdentityStatus {
  const trackedCount = [leftTracked, rightTracked].filter(Boolean).length;
  const lockProgress = clamp(
    memory.observedFrames / ARM_IDENTITY_ACQUIRE_FRAMES,
    0,
    1
  );

  return {
    locked: memory.locked,
    swapped: memory.swap,
    leftTracked,
    rightTracked,
    confidence: clamp(
      (memory.locked ? 0.65 : 0.25) + lockProgress * 0.25 + trackedCount * 0.05,
      0,
      1
    ),
  };
}

function resolveArmIdentityLandmarks(
  landmarks: NormalizedLandmark[],
  memory: ArmIdentityMemory
): ArmIdentityResolution {
  const rawLeftAnchor = getArmAnchor(landmarks, "left");
  const rawRightAnchor = getArmAnchor(landmarks, "right");
  const rawLeftSignal = getArmSignal(landmarks, "left");
  const rawRightSignal = getArmSignal(landmarks, "right");
  let holdAnchorUpdate = false;
  let swappedChanged = false;

  if (
    rawLeftAnchor &&
    rawRightAnchor &&
    rawLeftSignal.complete &&
    rawRightSignal.complete &&
    rawLeftSignal.score >= 1.35 &&
    rawRightSignal.score >= 1.35
  ) {
    memory.missingFrames = 0;
    memory.observedFrames += 1;

    if (memory.leftAnchor && memory.rightAnchor) {
      const keepCost =
        distance(rawLeftAnchor, memory.leftAnchor) +
        distance(rawRightAnchor, memory.rightAnchor);
      const swapCost =
        distance(rawRightAnchor, memory.leftAnchor) +
        distance(rawLeftAnchor, memory.rightAnchor);
      const costDelta = keepCost - swapCost;
      const desiredSwap =
        costDelta > ARM_IDENTITY_SWAP_MARGIN
          ? true
          : costDelta < -ARM_IDENTITY_SWAP_MARGIN
            ? false
            : memory.swap;

      if (desiredSwap !== memory.swap) {
        holdAnchorUpdate = true;
        if (memory.candidateSwap === desiredSwap) {
          memory.candidateFrames += 1;
        } else {
          memory.candidateSwap = desiredSwap;
          memory.candidateFrames = 1;
        }

        if (memory.candidateFrames >= ARM_IDENTITY_SWITCH_FRAMES) {
          memory.swap = desiredSwap;
          memory.candidateSwap = null;
          memory.candidateFrames = 0;
          holdAnchorUpdate = false;
          swappedChanged = true;
        }
      } else {
        memory.candidateSwap = null;
        memory.candidateFrames = 0;
      }
    }
  } else {
    memory.missingFrames += 1;

    if (memory.missingFrames > ARM_IDENTITY_HOLD_FRAMES) {
      memory.locked = false;
      memory.observedFrames = 0;
      memory.candidateSwap = null;
      memory.candidateFrames = 0;
      memory.leftAnchor = null;
      memory.rightAnchor = null;
    }
  }

  if (!memory.locked && memory.observedFrames >= ARM_IDENTITY_ACQUIRE_FRAMES) {
    memory.locked = true;
  }

  const mapped = memory.swap ? swapBodySides(landmarks) : landmarks.map(cloneLandmark);
  const mappedLeftAnchor = getArmAnchor(mapped, "left");
  const mappedRightAnchor = getArmAnchor(mapped, "right");

  if (mappedLeftAnchor && !holdAnchorUpdate) {
    memory.leftAnchor = smoothPoint(
      memory.leftAnchor,
      mappedLeftAnchor,
      ARM_IDENTITY_ANCHOR_ALPHA
    );
  }

  if (mappedRightAnchor && !holdAnchorUpdate) {
    memory.rightAnchor = smoothPoint(
      memory.rightAnchor,
      mappedRightAnchor,
      ARM_IDENTITY_ANCHOR_ALPHA
    );
  }

  return {
    landmarks: mapped,
    status: createArmIdentityStatus(
      memory,
      Boolean(mappedLeftAnchor),
      Boolean(mappedRightAnchor)
    ),
    swappedChanged,
  };
}

function syncEnhancedEndpointMemory(
  memory: LandmarkTrackingMemory,
  landmarks: NormalizedLandmark[],
  index: number
) {
  const landmark = landmarks[index];
  if (!landmark || !isVisible(landmark, LANDMARK_DRAW_VISIBILITY)) return;

  const track = memory[index];
  if (!track) {
    memory[index] = {
      landmark: cloneLandmark(landmark),
      velocity: { x: 0, y: 0, z: 0 },
      missingFrames: 0,
    };
    return;
  }

  const previous = track.landmark;
  const next = blendLandmarks(
    previous,
    landmark,
    landmarkVisibility(landmark) >= LANDMARK_RELIABLE_VISIBILITY ? 0.82 : 0.58,
    Math.max(landmarkVisibility(previous) * 0.6, landmarkVisibility(landmark))
  );

  track.landmark = next;
  track.velocity = {
    x: track.velocity.x * 0.55 + (next.x - previous.x) * 0.45,
    y: track.velocity.y * 0.55 + (next.y - previous.y) * 0.45,
    z: track.velocity.z * 0.55 + ((next.z ?? 0) - (previous.z ?? 0)) * 0.45,
  };
  track.missingFrames = 0;
}

function syncEnhancedArmEndpointMemory(
  memory: LandmarkTrackingMemory,
  landmarks: NormalizedLandmark[]
) {
  syncEnhancedEndpointMemory(memory, landmarks, 15);
  syncEnhancedEndpointMemory(memory, landmarks, 16);
}

function getArmSignal(landmarks: NormalizedLandmark[], side: ArmSide): ArmSignal {
  const indices = armIndices(side);
  const shoulder = landmarks[indices.shoulder];
  const elbow = landmarks[indices.elbow];
  const wrist = landmarks[indices.wrist];
  const hasShoulder = isTrackableLandmark(shoulder, LANDMARK_PARTIAL_VISIBILITY);
  const hasElbow = isTrackableLandmark(elbow, LANDMARK_PARTIAL_VISIBILITY);
  const hasWrist = isTrackableLandmark(wrist, LANDMARK_PARTIAL_VISIBILITY);
  const visibleCount = [hasShoulder, hasElbow, hasWrist].filter(Boolean).length;

  if (visibleCount < 2) {
    return {
      score: 0,
      complete: false,
      partial: false,
      hasShoulder,
      hasElbow,
      hasWrist,
    };
  }

  const hasForearm = hasElbow && hasWrist;
  const hasUpperArm = hasShoulder && hasElbow;
  const forearm = hasForearm ? distance(elbow, wrist) : 0;
  const upperArm = hasUpperArm ? distance(shoulder, elbow) : 0;
  const forearmOk =
    !hasForearm || (forearm >= ARM_SEGMENT_MIN && forearm <= FOREARM_SEGMENT_MAX);
  const upperArmOk =
    !hasUpperArm || (upperArm >= ARM_SEGMENT_MIN && upperArm <= UPPER_ARM_SEGMENT_MAX);
  const ratio = hasForearm && hasUpperArm && upperArm > 0 ? forearm / upperArm : 1;
  const ratioOk =
    !(hasForearm && hasUpperArm) || (ratio >= ARM_RATIO_MIN && ratio <= ARM_RATIO_MAX);

  if (!forearmOk || !upperArmOk || !ratioOk) {
    return {
      score: 0,
      complete: false,
      partial: false,
      hasShoulder,
      hasElbow,
      hasWrist,
    };
  }

  const rawScore =
    (hasShoulder ? landmarkVisibility(shoulder) : 0) +
    (hasElbow ? landmarkVisibility(elbow) : 0) +
    (hasWrist ? landmarkVisibility(wrist) : 0) +
    (hasForearm ? 0.18 : 0) +
    (hasShoulder && hasWrist ? 0.12 : 0);

  return {
    score: rawScore,
    complete: hasShoulder && hasElbow && hasWrist,
    partial: true,
    hasShoulder,
    hasElbow,
    hasWrist,
  };
}

function armVisibilityScore(landmarks: NormalizedLandmark[], side: ArmSide) {
  return getArmSignal(landmarks, side).score;
}

function armHasCompleteChain(landmarks: NormalizedLandmark[], side: ArmSide) {
  return getArmSignal(landmarks, side).complete;
}

function pickPrimaryArm(landmarks: NormalizedLandmark[]): ArmSide | null {
  const leftScore = armVisibilityScore(landmarks, "left");
  const rightScore = armVisibilityScore(landmarks, "right");

  if (leftScore < MIN_ARM_SIGNAL_SCORE && rightScore < MIN_ARM_SIGNAL_SCORE) return null;
  return leftScore >= rightScore ? "left" : "right";
}

function isUsablePoseFrame(
  landmarks: NormalizedLandmark[],
  settings: TrackerSettings
): boolean {
  const visibleUpperBody = [11, 12, 13, 14, 15, 16, 23, 24].filter((index) =>
    isTrackableLandmark(landmarks[index], LANDMARK_PARTIAL_VISIBILITY)
  ).length;
  const reliableUpperBody = [11, 12, 13, 14, 15, 16].filter((index) =>
    isTrackableLandmark(landmarks[index], LANDMARK_RELIABLE_VISIBILITY)
  ).length;
  const hasShoulderPair =
    isTrackableLandmark(landmarks[11], LANDMARK_PARTIAL_VISIBILITY) &&
    isTrackableLandmark(landmarks[12], LANDMARK_PARTIAL_VISIBILITY);
  const edgeUpperBody = settings.edgeGuard
    ? [11, 12, 13, 14, 15, 16, 23, 24].filter((index) => {
        const landmark = landmarks[index];
        return landmark ? isLikelyOffscreenLandmark(landmark) : false;
      }).length
    : 0;
  const leftSignal = getArmSignal(landmarks, "left");
  const rightSignal = getArmSignal(landmarks, "right");
  const hasArmChain =
    (leftSignal.complete && leftSignal.score >= 1.35) ||
    (rightSignal.complete && rightSignal.score >= 1.35);
  const hasPartialArmWithAnchor =
    (leftSignal.partial || rightSignal.partial) &&
    visibleUpperBody >= 3 &&
    reliableUpperBody >= 2;

  if (edgeUpperBody >= 5) return false;

  return (
    (hasTopViewSignal(landmarks) && reliableUpperBody >= 2) ||
    hasArmChain ||
    (hasShoulderPair && hasPartialArmWithAnchor)
  );
}

function isHandLandmarkIndex(index: number): boolean {
  return index >= 17 && index <= 22;
}

function isDrawableHandLandmark(
  landmarks: NormalizedLandmark[],
  index: number,
  edgeGuardEnabled: boolean
): boolean {
  const side: ArmSide = index % 2 === 1 ? "left" : "right";
  const { elbow, wrist } = armIndices(side);
  const hand = landmarks[index];
  const wristLandmark = landmarks[wrist];
  const elbowLandmark = landmarks[elbow];

  if (edgeGuardEnabled && isLikelyOffscreenLandmark(hand)) return false;

  if (!isVisible(hand, HAND_PROXY_VISIBILITY) || !isVisible(wristLandmark, LANDMARK_DRAW_VISIBILITY)) {
    return false;
  }

  const wristToHand = landmarkDistance(wristLandmark, hand);
  const forearmLength =
    isVisible(elbowLandmark, LANDMARK_DRAW_VISIBILITY)
      ? landmarkDistance(elbowLandmark, wristLandmark)
      : 0;
  const maxHandDistance = Math.max(0.075, forearmLength * 0.72);

  return wristToHand <= maxHandDistance;
}

function isDrawableLandmark(
  landmarks: NormalizedLandmark[],
  index: number,
  edgeGuardEnabled: boolean
): boolean {
  const landmark = landmarks[index];
  if (!landmark) return false;

  if (edgeGuardEnabled && isOutsideFrame(landmark, 0)) return false;

  if (isHandLandmarkIndex(index)) {
    return isDrawableHandLandmark(landmarks, index, edgeGuardEnabled);
  }

  return isVisible(landmark, LANDMARK_DRAW_VISIBILITY);
}

function isDrawableConnection(
  landmarks: NormalizedLandmark[],
  startIdx: number,
  endIdx: number,
  edgeGuardEnabled: boolean
): boolean {
  const start = landmarks[startIdx];
  const end = landmarks[endIdx];

  if (
    !start ||
    !end ||
    !isDrawableLandmark(landmarks, startIdx, edgeGuardEnabled) ||
    !isDrawableLandmark(landmarks, endIdx, edgeGuardEnabled)
  ) {
    return false;
  }

  const segmentLength = landmarkDistance(start, end);
  if (isHandLandmarkIndex(startIdx) || isHandLandmarkIndex(endIdx)) {
    return segmentLength <= 0.12;
  }

  return segmentLength >= 0.008 && segmentLength <= 0.62;
}

function reduceLandmarkVisibility(
  landmarks: NormalizedLandmark[],
  indices: readonly number[]
) {
  for (const index of indices) {
    const landmark = landmarks[index];
    if (landmark) {
      landmarks[index] = { ...landmark, visibility: 0 };
    }
  }
}

function cleanUnstableArmGeometry(
  landmarks: NormalizedLandmark[],
  settings: TrackerSettings
): NormalizedLandmark[] {
  const cleaned = landmarks.map(cloneLandmark);

  for (const side of ["left", "right"] as const) {
    const indices = armIndices(side);
    const shoulder = cleaned[indices.shoulder];
    const elbow = cleaned[indices.elbow];
    const wrist = cleaned[indices.wrist];

    if (settings.edgeGuard) {
      for (const index of [indices.elbow, indices.wrist, ...handIndices(side)]) {
        const landmark = cleaned[index];
        if (landmark && isLikelyOffscreenLandmark(landmark)) {
          cleaned[index] = { ...landmark, visibility: 0 };
        }
      }
    }

    const hasShoulder = isTrackableLandmark(shoulder, LANDMARK_PARTIAL_VISIBILITY);
    const hasElbow = isTrackableLandmark(elbow, LANDMARK_PARTIAL_VISIBILITY);
    const hasWrist = isTrackableLandmark(wrist, LANDMARK_PARTIAL_VISIBILITY);

    if (hasShoulder && hasElbow) {
      const upperArm = landmarkDistance(shoulder, elbow);
      if (upperArm < ARM_SEGMENT_MIN || upperArm > UPPER_ARM_SEGMENT_MAX) {
        reduceLandmarkVisibility(cleaned, [
          indices.elbow,
          indices.wrist,
          ...handIndices(side),
        ]);
        continue;
      }
    }

    if (hasElbow && hasWrist) {
      const forearm = landmarkDistance(elbow, wrist);
      if (forearm < ARM_SEGMENT_MIN || forearm > FOREARM_SEGMENT_MAX) {
        reduceLandmarkVisibility(cleaned, [indices.wrist, ...handIndices(side)]);
        continue;
      }
    }

    if (hasShoulder && hasElbow && hasWrist) {
      const upperArm = landmarkDistance(shoulder, elbow);
      const forearm = landmarkDistance(elbow, wrist);
      const ratio = forearm / Math.max(upperArm, 0.001);

      if (ratio < ARM_RATIO_MIN || ratio > ARM_RATIO_MAX) {
        reduceLandmarkVisibility(cleaned, [indices.wrist, ...handIndices(side)]);
      }
    }
  }

  return cleaned;
}

function getArmChainStatus(
  landmarks: NormalizedLandmark[],
  side: ArmSide
): ArmChainStatus {
  const signal = getArmSignal(landmarks, side);
  const indices = armIndices(side);
  const sideIndices = [indices.shoulder, indices.elbow, indices.wrist];

  return {
    score: signal.score,
    complete: signal.complete,
    shoulder: signal.hasShoulder,
    elbow: signal.hasElbow,
    wrist: signal.hasWrist,
    edgeCount: sideIndices.filter((index) => {
      const landmark = landmarks[index];
      return landmark ? isLikelyOffscreenLandmark(landmark) : false;
    }).length,
  };
}

function createTrackingStatus(
  landmarks: NormalizedLandmark[],
  settings: TrackerSettings,
  state: TrackingState,
  predictionFrames: number,
  fps: number
): TrackingStatus {
  const trackedIndices = Array.from(SWIM_LANDMARKS);
  const visibleLandmarks = trackedIndices.filter((index) =>
    isVisible(landmarks[index], LANDMARK_PARTIAL_VISIBILITY)
  ).length;
  const reliableLandmarks = trackedIndices.filter((index) =>
    isVisible(landmarks[index], LANDMARK_RELIABLE_VISIBILITY)
  ).length;
  const edgeLandmarks = trackedIndices.filter((index) => {
    const landmark = landmarks[index];
    return landmark ? isLikelyOffscreenLandmark(landmark) : false;
  }).length;
  const leftArm = getArmChainStatus(landmarks, "left");
  const rightArm = getArmChainStatus(landmarks, "right");
  const bestArmScore = Math.max(leftArm.score, rightArm.score);
  const quality = clamp(
    visibleLandmarks / trackedIndices.length * 0.34 +
      reliableLandmarks / Math.max(trackedIndices.length, 1) * 0.36 +
      Math.min(bestArmScore / 2.1, 1) * 0.3 -
      edgeLandmarks * 0.025,
    0,
    1
  );
  const limited =
    state === "live" && (quality < 0.55 || edgeLandmarks >= 2) ? "limited" : state;

  return {
    state: limited,
    predictionMode: settings.predictionMode,
    predictionFrames,
    maxPredictionFrames: predictionHoldFrames(settings.predictionMode),
    visibleLandmarks,
    reliableLandmarks,
    edgeLandmarks,
    quality,
    fps,
    leftArm,
    rightArm,
  };
}

function createMotionTrails(memory: MotionHistory): MotionTrails {
  return {
    left: [...memory.leftWrist.points],
    right: [...memory.rightWrist.points],
  };
}

function createMotionHistory(): MotionHistory {
  return {
    leftWrist: { points: [] },
    rightWrist: { points: [] },
  };
}

function createAngleMemory(): AngleMemory {
  return {
    left: null,
    right: null,
  };
}

function summarizeMotion(track: MotionTrack): ArmMotion {
  const points = track.points;
  return {
    samples: points.length,
    rangeX: range(points.map((point) => point.x)),
    rangeY: range(points.map((point) => point.y)),
  };
}

function pushMotionPoint(track: MotionTrack, landmark: NormalizedLandmark | undefined) {
  if (!isVisible(landmark, LANDMARK_PARTIAL_VISIBILITY)) return;

  track.points.push({ x: landmark.x, y: landmark.y });
  if (track.points.length > MOTION_HISTORY_LENGTH) {
    track.points.splice(0, track.points.length - MOTION_HISTORY_LENGTH);
  }
}

function updateMotionHistory(
  history: MotionHistory,
  landmarks: NormalizedLandmark[]
): MotionSummary {
  pushMotionPoint(history.leftWrist, landmarks[15]);
  pushMotionPoint(history.rightWrist, landmarks[16]);

  return {
    left: summarizeMotion(history.leftWrist),
    right: summarizeMotion(history.rightWrist),
  };
}

function createStrokeMemory(): StrokeMemory {
  return {
    stableStroke: "Unknown",
    stableConfidence: 0,
    candidateStroke: "Unknown",
    candidateFrames: 0,
    unknownFrames: 0,
  };
}

function createStyleAccumulator(): StyleAccumulator {
  return {
    samples: 0,
    votes: {},
  };
}

function pushStyleSample(accumulator: StyleAccumulator, result: StyleResult) {
  accumulator.samples += 1;

  const vote = accumulator.votes[result.stroke] ?? {
    samples: 0,
    confidenceTotal: 0,
    confidencePeak: 0,
  };

  vote.samples += 1;
  vote.confidenceTotal += result.confidence;
  vote.confidencePeak = Math.max(vote.confidencePeak, result.confidence);
  accumulator.votes[result.stroke] = vote;
}

function summarizeStyleSamples(
  accumulator: StyleAccumulator,
  fallback: StyleResult
): StyleResult {
  const entries = Object.entries(accumulator.votes) as Array<
    [StrokeType, StyleVote]
  >;

  if (entries.length === 0 || accumulator.samples === 0) {
    return fallback;
  }

  const knownEntries = entries.filter(([stroke]) => stroke !== "Unknown");
  const candidates = knownEntries.length > 0 ? knownEntries : entries;
  const [stroke, vote] = candidates.reduce((best, current) => {
    const bestScore =
      best[1].samples * 0.7 + best[1].confidenceTotal * 0.3;
    const currentScore =
      current[1].samples * 0.7 + current[1].confidenceTotal * 0.3;
    return currentScore > bestScore ? current : best;
  });
  const dominance = vote.samples / Math.max(1, accumulator.samples);
  const averageConfidence = vote.confidenceTotal / Math.max(1, vote.samples);

  return {
    stroke,
    confidence: clamp(averageConfidence * 0.8 + dominance * 0.2, 0, 0.92),
  };
}

function createStyleCheckStatus(
  now: number,
  intervalMs: number,
  windowStartedAt: number,
  lastCheckedAt: number,
  sampleCount: number
): StyleCheckStatus {
  const windowAge = windowStartedAt > 0 ? now - windowStartedAt : 0;
  const lastCheckedMsAgo = lastCheckedAt > 0 ? now - lastCheckedAt : null;

  return {
    intervalMs,
    lastCheckedMsAgo,
    nextCheckMs: Math.max(0, intervalMs - windowAge),
    sampleCount,
  };
}

function createActiveArmMemory(): ActiveArmMemory {
  return {
    side: null,
    candidateSide: null,
    candidateFrames: 0,
    missingFrames: 0,
  };
}

function createArmIdentityMemory(): ArmIdentityMemory {
  return {
    swap: false,
    locked: false,
    observedFrames: 0,
    candidateSwap: null,
    candidateFrames: 0,
    missingFrames: 0,
    leftAnchor: null,
    rightAnchor: null,
  };
}

function visiblePoint(
  lm: NormalizedLandmark | undefined,
  minVisibility = LANDMARK_PARTIAL_VISIBILITY
): Point | null {
  return isTrackableLandmark(lm, minVisibility) ? { x: lm.x, y: lm.y } : null;
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function averagePoints(points: Point[]): Point | null {
  if (points.length === 0) return null;

  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  };
}

function presentPoints(points: Array<Point | null>): Point[] {
  return points.filter((point): point is Point => point !== null);
}

function hasTopViewSignal(landmarks: NormalizedLandmark[]): boolean {
  const leftShoulder = visiblePoint(landmarks[11], LANDMARK_PARTIAL_VISIBILITY);
  const rightShoulder = visiblePoint(landmarks[12], LANDMARK_PARTIAL_VISIBILITY);
  const leftHip = visiblePoint(landmarks[23], LANDMARK_PARTIAL_VISIBILITY);
  const rightHip = visiblePoint(landmarks[24], LANDMARK_PARTIAL_VISIBILITY);

  if (!leftShoulder || !rightShoulder) {
    return false;
  }

  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const shoulderWidth = distance(leftShoulder, rightShoulder);
  const armPoints = presentPoints([
    visiblePoint(landmarks[13], LANDMARK_PARTIAL_VISIBILITY),
    visiblePoint(landmarks[14], LANDMARK_PARTIAL_VISIBILITY),
    visiblePoint(landmarks[15], LANDMARK_PARTIAL_VISIBILITY),
    visiblePoint(landmarks[16], LANDMARK_PARTIAL_VISIBILITY),
  ]);
  const armReach = armPoints.reduce(
    (maxReach, point) => Math.max(maxReach, distance(shoulderCenter, point)),
    0
  );
  const armSpread =
    Math.max(
      range(armPoints.map((point) => point.x)),
      range(armPoints.map((point) => point.y))
    );
  const topByArmGeometry =
    shoulderWidth >= SIDE_VIEW_SHOULDER_WIDTH_THRESHOLD &&
    armPoints.length >= 2 &&
    armReach > Math.max(shoulderWidth * 0.65, 0.055) &&
    armSpread > shoulderWidth * 0.45;

  if (!leftHip && !rightHip) {
    return topByArmGeometry;
  }

  const hipCenter = averagePoints(presentPoints([leftHip, rightHip]));
  if (!hipCenter) return false;

  const hipWidth = leftHip && rightHip ? distance(leftHip, rightHip) : shoulderWidth * 0.8;
  const torsoLength = distance(shoulderCenter, hipCenter);
  const bodyWidth = Math.max(shoulderWidth, hipWidth, 0.045);

  return (torsoLength > 0.055 && torsoLength > bodyWidth * 0.55) || topByArmGeometry;
}

function hasSideViewSignal(landmarks: NormalizedLandmark[]): boolean {
  if (hasTopViewSignal(landmarks)) return false;

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftVisible = isVisible(leftShoulder, LANDMARK_PARTIAL_VISIBILITY);
  const rightVisible = isVisible(rightShoulder, LANDMARK_PARTIAL_VISIBILITY);

  if (leftVisible !== rightVisible) {
    const leftScore = armVisibilityScore(landmarks, "left");
    const rightScore = armVisibilityScore(landmarks, "right");
    const strongerScore = Math.max(leftScore, rightScore);
    const weakerScore = Math.min(leftScore, rightScore);

    return (
      strongerScore >= MIN_ARM_SIGNAL_SCORE + SINGLE_SHOULDER_SIDE_SCORE_MARGIN &&
      weakerScore < MIN_ARM_SIGNAL_SCORE * 0.65 &&
      strongerScore - weakerScore > 1.2
    );
  }

  if (!leftVisible || !rightVisible) return false;

  return distance(leftShoulder, rightShoulder) < SIDE_VIEW_SHOULDER_WIDTH_THRESHOLD;
}

function shouldUseSingleArmMode(landmarks: NormalizedLandmark[]): boolean {
  if (hasTopViewSignal(landmarks)) return false;

  const leftScore = armVisibilityScore(landmarks, "left");
  const rightScore = armVisibilityScore(landmarks, "right");
  const strongerScore = Math.max(leftScore, rightScore);
  const weakerScore = Math.min(leftScore, rightScore);
  const oneArmClearlyDominant =
    strongerScore >= MIN_ARM_SIGNAL_SCORE + SINGLE_SHOULDER_SIDE_SCORE_MARGIN &&
    weakerScore < MIN_ARM_SIGNAL_SCORE * 0.65 &&
    strongerScore - weakerScore > 1.55;

  return hasSideViewSignal(landmarks) || oneArmClearlyDominant;
}

function resolveActiveArm(
  landmarks: NormalizedLandmark[],
  memory: ActiveArmMemory
): ArmSide | null {
  const leftScore = armVisibilityScore(landmarks, "left");
  const rightScore = armVisibilityScore(landmarks, "right");
  const candidate = pickPrimaryArm(landmarks);

  if (!candidate) {
    memory.missingFrames += 1;
    if (memory.side && memory.missingFrames <= ACTIVE_ARM_HOLD_FRAMES) {
      return memory.side;
    }

    memory.side = null;
    memory.candidateSide = null;
    memory.candidateFrames = 0;
    return null;
  }

  memory.missingFrames = 0;

  if (!memory.side) {
    if (memory.candidateSide === candidate) {
      memory.candidateFrames += 1;
    } else {
      memory.candidateSide = candidate;
      memory.candidateFrames = 1;
    }

    if (memory.candidateFrames >= ACTIVE_ARM_ACQUIRE_FRAMES) {
      memory.side = candidate;
      memory.candidateSide = null;
      memory.candidateFrames = 0;
    }

    return memory.side;
  }

  if (candidate === memory.side) {
    memory.candidateSide = null;
    memory.candidateFrames = 0;
    return memory.side;
  }

  const activeScore = memory.side === "left" ? leftScore : rightScore;
  const candidateScore = candidate === "left" ? leftScore : rightScore;
  const candidateSignal = getArmSignal(landmarks, candidate);
  const candidateClearlyBetter =
    candidateSignal.partial &&
    candidateScore >= MIN_ARM_SIGNAL_SCORE + SINGLE_SHOULDER_SIDE_SCORE_MARGIN &&
    candidateScore > activeScore + ACTIVE_ARM_SWITCH_SCORE_MARGIN;

  if (!candidateClearlyBetter) {
    return memory.side;
  }

  if (memory.candidateSide === candidate) {
    memory.candidateFrames += 1;
  } else {
    memory.candidateSide = candidate;
    memory.candidateFrames = 1;
  }

  if (memory.candidateFrames >= ACTIVE_ARM_SWITCH_FRAMES) {
    memory.side = candidate;
    memory.candidateSide = null;
    memory.candidateFrames = 0;
  }

  return memory.side;
}

function suppressArm(
  landmarks: NormalizedLandmark[],
  side: ArmSide
): NormalizedLandmark[] {
  const indices = armIndices(side);
  const suppressed = landmarks.map((lm) => ({ ...lm }));

  for (const index of [
    indices.shoulder,
    indices.elbow,
    indices.wrist,
    ...handIndices(side),
  ]) {
    const landmark = suppressed[index];
    if (landmark) {
      suppressed[index] = { ...landmark, visibility: 0 };
    }
  }

  return suppressed;
}

function emptyArmEVF(): ArmEVF {
  return {
    elbowAngle: 0,
    verticality: 0,
    inCatchPhase: false,
    isEVF: false,
    valid: false,
    confidence: 0,
  };
}

function getArmGeometryQuality(
  shoulder: NormalizedLandmark,
  elbow: NormalizedLandmark,
  wrist: NormalizedLandmark
): number {
  if (
    !isTrackableLandmark(shoulder, LANDMARK_PARTIAL_VISIBILITY) ||
    !isTrackableLandmark(elbow, LANDMARK_PARTIAL_VISIBILITY) ||
    !isTrackableLandmark(wrist, LANDMARK_PARTIAL_VISIBILITY)
  ) {
    return 0;
  }

  const upperArm = landmarkDistance(shoulder, elbow);
  const forearm = landmarkDistance(elbow, wrist);

  if (
    upperArm < ARM_SEGMENT_MIN ||
    upperArm > UPPER_ARM_SEGMENT_MAX ||
    forearm < ARM_SEGMENT_MIN ||
    forearm > FOREARM_SEGMENT_MAX
  ) {
    return 0;
  }

  const ratio = forearm / Math.max(upperArm, 0.001);
  if (ratio < ARM_RATIO_MIN || ratio > ARM_RATIO_MAX) return 0;

  const visibilityQuality =
    (landmarkVisibility(shoulder) + landmarkVisibility(elbow) + landmarkVisibility(wrist)) / 3;
  const ratioCenter = (ARM_RATIO_MIN + ARM_RATIO_MAX) / 2;
  const ratioSpread = (ARM_RATIO_MAX - ARM_RATIO_MIN) / 2;
  const ratioQuality = 1 - Math.min(1, Math.abs(ratio - ratioCenter) / ratioSpread);
  const lengthQuality = Math.min(upperArm / 0.08, 1) * 0.45 + Math.min(forearm / 0.08, 1) * 0.55;

  return clamp(visibilityQuality * 0.58 + ratioQuality * 0.18 + lengthQuality * 0.24, 0, 1);
}

function getStrokeAnchors(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
  const wrists = [landmarks[15], landmarks[16]].filter(
    (landmark): landmark is NormalizedLandmark =>
      isVisible(landmark, LANDMARK_PARTIAL_VISIBILITY)
  );

  if (wrists.length > 0) return wrists;

  return [landmarks[13], landmarks[14]].filter(
    (landmark): landmark is NormalizedLandmark =>
      isVisible(landmark, LANDMARK_PARTIAL_VISIBILITY)
  );
}

function resetStrokeRange(strokeRange: StrokeRange, anchors: NormalizedLandmark[]) {
  const xs = anchors.map((anchor) => anchor.x);
  const ys = anchors.map((anchor) => anchor.y);
  strokeRange.minX = Math.min(...xs);
  strokeRange.maxX = Math.max(...xs);
  strokeRange.minY = Math.min(...ys);
  strokeRange.maxY = Math.max(...ys);
}

function updateStrokeRange(
  strokeRange: StrokeRange,
  landmarks: NormalizedLandmark[]
) {
  const anchors = getStrokeAnchors(landmarks);

  if (anchors.length > 0) {
    const xs = anchors.map((anchor) => anchor.x);
    const ys = anchors.map((anchor) => anchor.y);
    strokeRange.minX = Math.min(strokeRange.minX, Math.min(...xs));
    strokeRange.maxX = Math.max(strokeRange.maxX, Math.max(...xs));
    strokeRange.minY = Math.min(strokeRange.minY, Math.min(...ys));
    strokeRange.maxY = Math.max(strokeRange.maxY, Math.max(...ys));
  }

  strokeRange.minX += STROKE_RANGE_DECAY;
  strokeRange.maxX -= STROKE_RANGE_DECAY;
  strokeRange.minY += STROKE_RANGE_DECAY;
  strokeRange.maxY -= STROKE_RANGE_DECAY;

  if (
    anchors.length > 0 &&
    (strokeRange.minX > strokeRange.maxX || strokeRange.minY > strokeRange.maxY)
  ) {
    resetStrokeRange(strokeRange, anchors);
  }
}

function selectCatchAxis(
  strokeRange: StrokeRange,
  motion: MotionSummary,
  side: ArmSide,
  view: ShoulderMetrics["view"]
): CatchAxis {
  if (view !== "top") return "y";

  const xRange = Math.max(strokeRange.maxX - strokeRange.minX, motion[side].rangeX);
  const yRange = Math.max(strokeRange.maxY - strokeRange.minY, motion[side].rangeY);
  return xRange > yRange * 1.15 ? "x" : "y";
}

function isInCatchWindow(
  wrist: NormalizedLandmark,
  strokeRange: StrokeRange,
  axis: CatchAxis,
  allowEitherEdge: boolean
): boolean {
  const min = axis === "x" ? strokeRange.minX : strokeRange.minY;
  const max = axis === "x" ? strokeRange.maxX : strokeRange.maxY;
  const value = axis === "x" ? wrist.x : wrist.y;
  const rangeSize = max - min;

  if (rangeSize <= 0.01) return false;

  const progress = (value - min) / rangeSize;
  return allowEitherEdge
    ? progress < CATCH_PHASE_EDGE_THRESHOLD ||
        progress > 1 - CATCH_PHASE_EDGE_THRESHOLD
    : progress < CATCH_PHASE_THRESHOLD;
}

function isEVFGeometry(
  elbowAngle: number,
  verticality: number,
  inCatchPhase: boolean,
  view: ShoulderMetrics["view"]
): boolean {
  const useTopGeometry = view === "top";
  const angleMin = useTopGeometry ? EVF_TOP_VIEW_ANGLE_MIN : EVF_ANGLE_MIN;
  const angleMax = useTopGeometry ? EVF_TOP_VIEW_ANGLE_MAX : EVF_ANGLE_MAX;
  const verticalityMin = useTopGeometry
    ? EVF_TOP_VIEW_VERTICALITY_MIN
    : EVF_VERTICALITY_MIN;

  return (
    elbowAngle >= angleMin &&
    elbowAngle <= angleMax &&
    verticality >= verticalityMin &&
    inCatchPhase
  );
}

function checkEVFForArm(
  shoulder: NormalizedLandmark | undefined,
  elbow: NormalizedLandmark | undefined,
  wrist: NormalizedLandmark | undefined,
  strokeRange: StrokeRange,
  axis: CatchAxis,
  view: ShoulderMetrics["view"]
): ArmEVF {
  if (
    !shoulder ||
    !elbow ||
    !wrist ||
    !isTrackableLandmark(shoulder, LANDMARK_PARTIAL_VISIBILITY) ||
    !isTrackableLandmark(elbow, LANDMARK_PARTIAL_VISIBILITY) ||
    !isTrackableLandmark(wrist, LANDMARK_PARTIAL_VISIBILITY)
  ) {
    return emptyArmEVF();
  }

  const confidence = getArmGeometryQuality(shoulder, elbow, wrist);
  if (confidence < MIN_ANGLE_CONFIDENCE) {
    return emptyArmEVF();
  }

  const S: Point = { x: shoulder.x, y: shoulder.y };
  const E: Point = { x: elbow.x, y: elbow.y };
  const W: Point = { x: wrist.x, y: wrist.y };
  const useTopGeometry = view === "top";
  const elbowAngle = angleBetweenPoints(S, E, W);
  const verticality = forearmVerticality(toPoint3D(elbow), toPoint3D(wrist), useTopGeometry);
  const inCatchPhase = isInCatchWindow(wrist, strokeRange, axis, useTopGeometry);

  return {
    elbowAngle,
    verticality,
    inCatchPhase,
    isEVF: isEVFGeometry(elbowAngle, verticality, inCatchPhase, view),
    valid: true,
    confidence,
  };
}

function stabilizeArmEVF(
  raw: ArmEVF,
  track: ArmAngleTrack | null,
  view: ShoulderMetrics["view"]
): {
  evf: ArmEVF;
  track: ArmAngleTrack | null;
} {
  if (!raw.valid) {
    if (track && track.missingFrames < ANGLE_HOLD_FRAMES) {
      const heldTrack = {
        ...track,
        confidence: track.confidence * 0.72,
        missingFrames: track.missingFrames + 1,
      };

      return {
        evf: {
          ...raw,
          elbowAngle: heldTrack.elbowAngle,
          verticality: heldTrack.verticality,
          isEVF: false,
          valid: false,
          confidence: heldTrack.confidence,
        },
        track: heldTrack,
      };
    }

    return { evf: raw, track: null };
  }

  if (!track) {
    return {
      evf: raw,
      track: {
        elbowAngle: raw.elbowAngle,
        verticality: raw.verticality,
        confidence: raw.confidence,
        missingFrames: 0,
      },
    };
  }

  const limitedAngle = limitStep(track.elbowAngle, raw.elbowAngle, ANGLE_MAX_STEP_DEGREES);
  const limitedVerticality = limitStep(
    track.verticality,
    raw.verticality,
    ANGLE_MAX_STEP_DEGREES
  );
  const elbowAngle =
    track.elbowAngle * (1 - ANGLE_SMOOTHING_ALPHA) + limitedAngle * ANGLE_SMOOTHING_ALPHA;
  const verticality =
    track.verticality * (1 - ANGLE_SMOOTHING_ALPHA) +
    limitedVerticality * ANGLE_SMOOTHING_ALPHA;
  const confidence = track.confidence * 0.5 + raw.confidence * 0.5;

  return {
    evf: {
      ...raw,
      elbowAngle,
      verticality,
      confidence,
      isEVF: isEVFGeometry(elbowAngle, verticality, raw.inCatchPhase, view),
    },
    track: {
      elbowAngle,
      verticality,
      confidence,
      missingFrames: 0,
    },
  };
}

function stabilizeEVFResult(
  raw: EVFResult,
  memory: AngleMemory,
  view: ShoulderMetrics["view"]
): EVFResult {
  const left = stabilizeArmEVF(raw.left, memory.left, view);
  const right = stabilizeArmEVF(raw.right, memory.right, view);

  memory.left = left.track;
  memory.right = right.track;

  return {
    left: left.evf,
    right: right.evf,
  };
}

function checkEVF(
  landmarks: NormalizedLandmark[],
  strokeRange: StrokeRange,
  shoulders: ShoulderMetrics,
  motion: MotionSummary
): EVFResult {
  return {
    left: checkEVFForArm(
      landmarks[11],
      landmarks[13],
      landmarks[15],
      strokeRange,
      selectCatchAxis(strokeRange, motion, "left", shoulders.view),
      shoulders.view
    ),
    right: checkEVFForArm(
      landmarks[12],
      landmarks[14],
      landmarks[16],
      strokeRange,
      selectCatchAxis(strokeRange, motion, "right", shoulders.view),
      shoulders.view
    ),
  };
}

function getShoulderMetrics(landmarks: NormalizedLandmark[]): ShoulderMetrics {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftVisible = isVisible(leftShoulder, LANDMARK_PARTIAL_VISIBILITY);
  const rightVisible = isVisible(rightShoulder, LANDMARK_PARTIAL_VISIBILITY);
  const leftHip = visiblePoint(landmarks[23], LANDMARK_PARTIAL_VISIBILITY);
  const rightHip = visiblePoint(landmarks[24], LANDMARK_PARTIAL_VISIBILITY);
  const hipCenter = averagePoints(presentPoints([leftHip, rightHip]));
  const hipWidth = leftHip && rightHip ? distance(leftHip, rightHip) : 0;
  const primaryArm = pickPrimaryArm(landmarks);

  if (!leftVisible && !rightVisible) {
    if (hipCenter) {
      return {
        visible: true,
        view: "top",
        trackedSide: primaryArm ?? "none",
        slopeDegrees: 0,
        width: Math.max(hipWidth, 0.1),
        centerX: hipCenter.x,
        centerY: hipCenter.y,
      };
    }

    if (primaryArm) {
      const indices = armIndices(primaryArm);
      const elbow = landmarks[indices.elbow];
      const wrist = landmarks[indices.wrist];

      if (
        isVisible(elbow, LANDMARK_PARTIAL_VISIBILITY) &&
        isVisible(wrist, LANDMARK_PARTIAL_VISIBILITY)
      ) {
        return {
          visible: true,
          view: "side",
          trackedSide: primaryArm,
          slopeDegrees: 0,
          width: 0.12,
          centerX: (elbow.x + wrist.x) / 2,
          centerY: (elbow.y + wrist.y) / 2,
        };
      }
    }

    return {
      visible: false,
      view: "unknown",
      trackedSide: "none",
      slopeDegrees: 0,
      width: 0,
      centerX: 0.5,
      centerY: 0.5,
    };
  }

  if (!leftVisible || !rightVisible) {
    const trackedSide: ArmSide =
      primaryArm ?? (leftVisible ? "left" : "right");
    const shoulder = leftVisible ? leftShoulder : rightShoulder;
    const hasOverheadBodyLine = Boolean(
      hipCenter && distance({ x: shoulder.x, y: shoulder.y }, hipCenter) > 0.055
    );

    return {
      visible: true,
      view: hasOverheadBodyLine ? "top" : "side",
      trackedSide,
      slopeDegrees: 0,
      width: Math.max(hipWidth, 0.12),
      centerX:
        hasOverheadBodyLine && hipCenter
          ? (shoulder.x + hipCenter.x) / 2
          : shoulder.x,
      centerY:
        hasOverheadBodyLine && hipCenter
          ? (shoulder.y + hipCenter.y) / 2
          : shoulder.y,
    };
  }

  const left: Point = { x: leftShoulder.x, y: leftShoulder.y };
  const right: Point = { x: rightShoulder.x, y: rightShoulder.y };
  const width = distance(left, right);
  const view = hasTopViewSignal(landmarks)
    ? "top"
    : width < SIDE_VIEW_SHOULDER_WIDTH_THRESHOLD
      ? "side"
      : "front";

  return {
    visible: true,
    view,
    trackedSide: view === "side" ? primaryArm ?? "both" : "both",
    slopeDegrees: Math.abs(Math.atan2(right.y - left.y, right.x - left.x) * DEG),
    width,
    centerX: (left.x + right.x) / 2,
    centerY: (left.y + right.y) / 2,
  };
}

function classifyStroke(
  landmarks: NormalizedLandmark[],
  shoulders: ShoulderMetrics,
  motion: MotionSummary
): Pick<TechniqueAnalysis, "stroke" | "confidence"> {
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const primaryArm = pickPrimaryArm(landmarks);

  if (!shoulders.visible) {
    return { stroke: "Unknown", confidence: 0 };
  }

  if (!primaryArm) {
    return {
      stroke: "Unknown",
      confidence: shoulders.view === "top" ? 0.28 : 0,
    };
  }

  const bothArmsVisible =
    isVisible(leftWrist, LANDMARK_PARTIAL_VISIBILITY) &&
    isVisible(rightWrist, LANDMARK_PARTIAL_VISIBILITY) &&
    isVisible(leftElbow, LANDMARK_PARTIAL_VISIBILITY) &&
    isVisible(rightElbow, LANDMARK_PARTIAL_VISIBILITY);

  if (shoulders.view === "top") {
    const leftSignal = getArmSignal(landmarks, "left");
    const rightSignal = getArmSignal(landmarks, "right");
    const visibleArmCount = [leftSignal.partial, rightSignal.partial].filter(Boolean).length;
    const hasStrokeMotion =
      motion.left.samples + motion.right.samples >= 8 &&
      motion.left.rangeX + motion.left.rangeY + motion.right.rangeX + motion.right.rangeY >
        0.075;

    if (bothArmsVisible) {
      const shoulderWidth = Math.max(shoulders.width, 0.08);
      const xDominant =
        motion.left.rangeX + motion.right.rangeX >
        (motion.left.rangeY + motion.right.rangeY) * 1.15;
      const wristDelta = xDominant
        ? Math.abs(leftWrist.x - rightWrist.x)
        : Math.abs(leftWrist.y - rightWrist.y);
      const elbowDelta = xDominant
        ? Math.abs(leftElbow.x - rightElbow.x)
        : Math.abs(leftElbow.y - rightElbow.y);
      const armsSynchronized =
        wristDelta < shoulderWidth * 0.85 && elbowDelta < shoulderWidth * 0.85;

      if (armsSynchronized && hasStrokeMotion) {
        return { stroke: "Butterfly", confidence: 0.68 };
      }
    }

    return {
      stroke: "Freestyle",
      confidence: hasStrokeMotion
        ? visibleArmCount >= 2
          ? 0.7
          : 0.6
        : visibleArmCount >= 2
          ? 0.56
          : 0.46,
    };
  }

  if (shoulders.view === "side" || !bothArmsVisible) {
    const primaryMotion = motion[primaryArm];
    const completeChain = armHasCompleteChain(landmarks, primaryArm);
    const hasStrokeMotion =
      primaryMotion.samples >= 8 &&
      (primaryMotion.rangeX > 0.055 || primaryMotion.rangeY > 0.055);

    return {
      stroke: "Freestyle",
      confidence: hasStrokeMotion
        ? completeChain
          ? 0.72
          : 0.58
        : completeChain
          ? 0.54
          : 0.44,
    };
  }

  const shoulderWidth = Math.max(shoulders.width, 0.08);
  const wristYDelta = Math.abs(leftWrist.y - rightWrist.y);
  const elbowYDelta = Math.abs(leftElbow.y - rightElbow.y);
  const armsSynchronized =
    wristYDelta < shoulderWidth * 0.7 && elbowYDelta < shoulderWidth * 0.7;
  const leftAboveShoulders = leftWrist.y < shoulders.centerY;
  const rightAboveShoulders = rightWrist.y < shoulders.centerY;
  const bothAboveShoulders = leftAboveShoulders && rightAboveShoulders;
  const bothBelowShoulders = !leftAboveShoulders && !rightAboveShoulders;

  if (armsSynchronized && bothAboveShoulders) {
    return { stroke: "Butterfly", confidence: 0.72 };
  }

  if (armsSynchronized && bothBelowShoulders) {
    return { stroke: "Breaststroke", confidence: 0.68 };
  }

  if (!armsSynchronized) {
    return {
      stroke: bothBelowShoulders ? "Backstroke" : "Freestyle",
      confidence: 0.74,
    };
  }

  return { stroke: "Unknown", confidence: 0.35 };
}

function buildTechniqueFeedback(
  landmarks: NormalizedLandmark[],
  evf: EVFResult,
  shoulders: ShoulderMetrics,
  stroke: StrokeType
): TechniqueFeedback[] {
  const feedback: TechniqueFeedback[] = [];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const primaryArm = pickPrimaryArm(landmarks);
  const primarySignal = primaryArm ? getArmSignal(landmarks, primaryArm) : null;

  if (!shoulders.visible) {
    feedback.push({
      id: "shoulders-hidden",
      severity: "critical",
      message: "Show at least two upper-body landmarks; occlusion memory will hold brief submersion.",
    });
  } else if (shoulders.view === "top") {
    feedback.push({
      id: "top-view",
      severity: "good",
      message: primarySignal?.complete
        ? "Top-view tracking: overhead shoulder, hip, and arm geometry locked."
        : "Top-view partial tracking: holding visible body landmarks through water occlusion.",
    });
  } else if (shoulders.view === "side") {
    feedback.push({
      id: "side-view",
      severity: primaryArm ? "good" : "warning",
      message: primaryArm
        ? primarySignal?.complete
          ? `Side-view tracking: using the ${primaryArm} shoulder-arm chain.`
          : `Single-arm tracking: using visible ${primaryArm} elbow and wrist.`
        : "Side-view detected; bring one arm into frame for catch feedback.",
    });
  } else {
    feedback.push({
      id: "shoulders-visible",
      severity: "good",
      message: `Shoulders locked: ${shoulders.slopeDegrees.toFixed(0)} degree line angle.`,
    });
  }

  if (stroke === "Unknown") {
    feedback.push({
      id: "unknown-stroke",
      severity: "warning",
      message: "Technique is uncertain; keep one arm path or the shoulder-hip line visible.",
    });
  }

  if (primarySignal?.partial && !primarySignal.complete) {
    feedback.push({
      id: "partial-submerged",
      severity: "good",
      message: "Partial swimmer detected; submerged landmarks are being stabilized from recent motion.",
    });
  }

  if (shoulders.view === "front" && shoulders.slopeDegrees > 18) {
    feedback.push({
      id: "shoulder-tilt",
      severity: "warning",
      message: "Shoulder line is tilted; level the camera or reduce body roll during the catch.",
    });
  }

  if (
    shoulders.view === "front" &&
    isVisible(leftWrist) &&
    leftWrist.x > shoulders.centerX + shoulders.width * 0.1
  ) {
    feedback.push({
      id: "left-cross",
      severity: "warning",
      message: "Left hand is crossing the centerline; enter wider from the shoulder.",
    });
  }

  if (
    shoulders.view === "front" &&
    isVisible(rightWrist) &&
    rightWrist.x < shoulders.centerX - shoulders.width * 0.1
  ) {
    feedback.push({
      id: "right-cross",
      severity: "warning",
      message: "Right hand is crossing the centerline; enter wider from the shoulder.",
    });
  }

  if (evf.left.inCatchPhase && !evf.left.isEVF) {
    feedback.push({
      id: "left-dropped-elbow",
      severity: "critical",
      message: "Left catch is missing EVF; keep the elbow high and tip the forearm down.",
    });
  }

  if (evf.right.inCatchPhase && !evf.right.isEVF) {
    feedback.push({
      id: "right-dropped-elbow",
      severity: "critical",
      message: "Right catch is missing EVF; keep the elbow high and tip the forearm down.",
    });
  }

  if (evf.left.isEVF || evf.right.isEVF) {
    feedback.push({
      id: "evf-good",
      severity: "good",
      message: "EVF detected: forearm is vertical in the catch window.",
    });
  }

  return feedback.slice(0, 5);
}

function createTechniqueAnalysisFromStyle(
  landmarks: NormalizedLandmark[],
  evf: EVFResult,
  shoulders: ShoulderMetrics,
  style: StyleResult
): TechniqueAnalysis {
  return {
    stroke: style.stroke,
    rawStroke: style.stroke,
    confidence: style.confidence,
    lockState: "acquiring",
    shoulders,
    feedback: buildTechniqueFeedback(landmarks, evf, shoulders, style.stroke),
  };
}

function withStyleMemoryFeedback(
  analysis: Pick<TechniqueAnalysis, "lockState" | "rawStroke" | "stroke">,
  liveFeedback: TechniqueFeedback[]
): TechniqueFeedback[] {
  const feedback = [...liveFeedback];
  const { lockState, rawStroke, stroke } = analysis;

  if (lockState === "acquiring") {
    feedback.unshift({
      id: "style-acquiring",
      severity: "warning",
      message: "Learning the current stroke; keep an arm path or shoulder-hip line visible.",
    });
  } else if (lockState === "switching") {
    feedback.unshift({
      id: "style-switching",
      severity: "warning",
      message: `Possible switch to ${rawStroke}; holding ${stroke} until it repeats.`,
    });
  } else if (lockState === "holding") {
    feedback.unshift({
      id: "style-holding",
      severity: "good",
      message: `Style memory is holding ${stroke} through brief occlusion.`,
    });
  }

  return feedback.slice(0, 5);
}

function refreshTechniqueFrame(
  technique: TechniqueAnalysis,
  landmarks: NormalizedLandmark[],
  evf: EVFResult,
  shoulders: ShoulderMetrics
): TechniqueAnalysis {
  const refreshed = {
    ...technique,
    shoulders,
  };

  return {
    ...refreshed,
    feedback: withStyleMemoryFeedback(
      refreshed,
      buildTechniqueFeedback(landmarks, evf, shoulders, technique.rawStroke)
    ),
  };
}

function createPendingTechnique(
  landmarks: NormalizedLandmark[],
  evf: EVFResult,
  shoulders: ShoulderMetrics
): TechniqueAnalysis {
  const pending: TechniqueAnalysis = {
    stroke: "Unknown",
    rawStroke: "Unknown",
    confidence: 0,
    lockState: "acquiring",
    shoulders,
    feedback: [],
  };

  return {
    ...pending,
    feedback: withStyleMemoryFeedback(
      pending,
      buildTechniqueFeedback(landmarks, evf, shoulders, "Unknown")
    ),
  };
}

function withStrokeMemory(
  analysis: TechniqueAnalysis,
  memory: StrokeMemory
): TechniqueAnalysis {
  const rawStroke = analysis.rawStroke;
  let stroke = memory.stableStroke;
  let confidence = memory.stableConfidence;
  let lockState: TechniqueAnalysis["lockState"] =
    stroke === "Unknown" ? "acquiring" : "locked";

  if (rawStroke === "Unknown") {
    memory.unknownFrames += 1;

    if (
      memory.stableStroke !== "Unknown" &&
      memory.unknownFrames <= STROKE_MEMORY_HOLD_CHECKS
    ) {
      stroke = memory.stableStroke;
      confidence = Math.max(0.36, memory.stableConfidence * 0.82);
      lockState = "holding";
    } else {
      stroke = "Unknown";
      confidence = 0;
      lockState = "acquiring";
    }
  } else {
    memory.unknownFrames = 0;

    if (memory.stableStroke === "Unknown") {
      if (memory.candidateStroke === rawStroke) {
        memory.candidateFrames += 1;
      } else {
        memory.candidateStroke = rawStroke;
        memory.candidateFrames = 1;
      }

      if (
        memory.candidateFrames >= STROKE_ACQUIRE_CHECKS &&
        analysis.confidence >= 0.5
      ) {
        memory.stableStroke = rawStroke;
        memory.stableConfidence = analysis.confidence;
        stroke = rawStroke;
        confidence = analysis.confidence;
        lockState = "locked";
      } else {
        stroke = "Unknown";
        confidence = analysis.confidence;
        lockState = "acquiring";
      }
    } else if (rawStroke === memory.stableStroke) {
      memory.candidateStroke = "Unknown";
      memory.candidateFrames = 0;
      memory.stableConfidence =
        memory.stableConfidence * 0.82 + analysis.confidence * 0.18;
      stroke = memory.stableStroke;
      confidence = memory.stableConfidence;
      lockState = "locked";
    } else if (analysis.confidence < 0.62) {
      stroke = memory.stableStroke;
      confidence = Math.max(0.4, memory.stableConfidence * 0.9);
      lockState = "locked";
    } else {
      if (memory.candidateStroke === rawStroke) {
        memory.candidateFrames += 1;
      } else {
        memory.candidateStroke = rawStroke;
        memory.candidateFrames = 1;
      }

      if (memory.candidateFrames >= STROKE_SWITCH_CHECKS) {
        memory.stableStroke = rawStroke;
        memory.stableConfidence = analysis.confidence;
        memory.candidateStroke = "Unknown";
        memory.candidateFrames = 0;
        stroke = rawStroke;
        confidence = analysis.confidence;
        lockState = "locked";
      } else {
        stroke = memory.stableStroke;
        confidence = Math.max(0.42, memory.stableConfidence * 0.92);
        lockState = "switching";
      }
    }
  }

  return {
    ...analysis,
    stroke,
    rawStroke,
    confidence,
    lockState,
    feedback: withStyleMemoryFeedback(
      { lockState, rawStroke, stroke },
      analysis.feedback
    ),
  };
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  metrics: OverlayMetrics,
  color: string,
  opacity: number
) {
  if (points.length < 2) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 1; i < points.length; i += 1) {
    const from = projectNormalizedPoint(points[i - 1], metrics);
    const to = projectNormalizedPoint(points[i], metrics);
    const progress = i / points.length;

    ctx.globalAlpha = opacity * progress * 0.42;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 + progress * 3;
    ctx.stroke();
  }

  ctx.restore();
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  analysis: FullAnalysis,
  metrics: OverlayMetrics,
  settings: TrackerSettings
) {
  ctx.clearRect(0, 0, metrics.width, metrics.height);

  const { evf, technique } = analysis;
  const evfSegments = new Set<string>();
  const swimConnections = SWIM_CONNECTIONS;
  const opacity = settings.overlayOpacity;

  if (settings.showTrails) {
    drawTrail(ctx, analysis.trails.left, metrics, "rgba(34, 211, 238, 0.95)", opacity);
    drawTrail(ctx, analysis.trails.right, metrics, "rgba(52, 211, 153, 0.95)", opacity);
  }

  if (evf.left.isEVF) {
    evfSegments.add("11-13");
    evfSegments.add("13-15");
  }
  if (evf.right.isEVF) {
    evfSegments.add("12-14");
    evfSegments.add("14-16");
  }

  if (settings.showSkeleton) {
    for (const [startIdx, endIdx] of swimConnections) {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      if (
        !start ||
        !end ||
        !isDrawableConnection(landmarks, startIdx, endIdx, settings.edgeGuard)
      ) {
        continue;
      }
      const startPoint = projectLandmark(start, metrics);
      const endPoint = projectLandmark(end, metrics);

      const segKey = `${startIdx}-${endIdx}`;
      const isEVFSeg = evfSegments.has(segKey);
      const isShoulderSeg = segKey === "11-12" || segKey === "12-11";
      const segmentAlpha = clamp(
        (Math.min(landmarkVisibility(start), landmarkVisibility(end)) + 0.2) * opacity,
        0.18,
        opacity
      );

      ctx.globalAlpha = segmentAlpha;
      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(endPoint.x, endPoint.y);
      ctx.strokeStyle = isEVFSeg ? NEON_GREEN : isShoulderSeg ? SHOULDER_LINE : DEFAULT_LIMB;
      ctx.lineWidth = isEVFSeg || isShoulderSeg ? 4 : 2;
      ctx.shadowColor = isEVFSeg ? NEON_GREEN : isShoulderSeg ? SHOULDER_LINE : "transparent";
      ctx.shadowBlur = isEVFSeg || isShoulderSeg ? 12 : 0;
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  if (!settings.showJoints) return;

  for (const i of SWIM_LANDMARKS) {
    const lm = landmarks[i];
    if (!lm || !isDrawableLandmark(landmarks, i, settings.edgeGuard)) continue;

    const isEVFJoint =
      (evf.left.isEVF && (i === 11 || i === 13 || i === 15)) ||
      (evf.right.isEVF && (i === 12 || i === 14 || i === 16));
    const isShoulderJoint = technique.shoulders.visible && (i === 11 || i === 12);
    const point = projectLandmark(lm, metrics);

    ctx.globalAlpha = clamp((landmarkVisibility(lm) + 0.2) * opacity, 0.25, opacity);
    ctx.beginPath();
    ctx.arc(
      point.x,
      point.y,
      isEVFJoint || isShoulderJoint ? 5 : 3,
      0,
      2 * Math.PI
    );
    ctx.fillStyle = isEVFJoint ? NEON_GREEN : isShoulderJoint ? SHOULDER_LINE : DEFAULT_JOINT;
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

function pickDisplayArm(evf: EVFResult): ArmEVF {
  const leftScore =
    evf.left.confidence +
    (evf.left.valid ? 0.35 : 0) +
    (evf.left.inCatchPhase ? 0.25 : 0) +
    (evf.left.isEVF ? 0.35 : 0);
  const rightScore =
    evf.right.confidence +
    (evf.right.valid ? 0.35 : 0) +
    (evf.right.inCatchPhase ? 0.25 : 0) +
    (evf.right.isEVF ? 0.35 : 0);

  if (leftScore <= 0 && rightScore <= 0) return evf.left;
  return leftScore >= rightScore ? evf.left : evf.right;
}

function feedbackColor(severity: TechniqueFeedback["severity"]) {
  if (severity === "good") {
    return "border-emerald-800/70 bg-emerald-950/35 text-emerald-100";
  }
  if (severity === "critical") {
    return "border-red-800/70 bg-red-950/35 text-red-100";
  }
  return "border-amber-800/70 bg-amber-950/35 text-amber-100";
}

function formatSeconds(ms: number): string {
  const seconds = ms / 1000;
  return seconds >= 10 || Number.isInteger(seconds)
    ? `${seconds.toFixed(0)}s`
    : `${seconds.toFixed(1)}s`;
}

function statusDotClass(active: boolean) {
  return active
    ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]"
    : "bg-zinc-600";
}

function metricCardClass(accent: "cyan" | "emerald" | "amber" | "zinc" = "zinc") {
  const accentClass =
    accent === "cyan"
      ? "border-cyan-900/60"
      : accent === "emerald"
        ? "border-emerald-900/60"
        : accent === "amber"
          ? "border-amber-900/60"
          : "border-zinc-800/80";

  return `rounded-lg bg-zinc-950/90 border ${accentClass} p-4 shadow-lg shadow-black/35`;
}

function controlButtonClass(active: boolean) {
  return active
    ? "border-cyan-500/70 bg-cyan-950/70 text-cyan-100"
    : "border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200";
}

function chainDotClass(active: boolean) {
  return active ? "bg-cyan-300" : "bg-zinc-700";
}

function ReferencePicture({ type }: { type: "evf" | "top" | "water" }) {
  if (type === "top") {
    return (
      <svg
        viewBox="0 0 240 140"
        role="img"
        aria-label="Top-view swimmer reference"
        className="h-28 w-full"
      >
        <rect width="240" height="140" rx="8" fill="#061018" />
        <path
          d="M24 33c22 12 42 12 64 0s42-12 64 0 42 12 64 0"
          fill="none"
          stroke="#155e75"
          strokeWidth="4"
          opacity="0.65"
        />
        <path
          d="M24 103c22-12 42-12 64 0s42 12 64 0 42-12 64 0"
          fill="none"
          stroke="#155e75"
          strokeWidth="4"
          opacity="0.65"
        />
        <ellipse cx="120" cy="70" rx="25" ry="48" fill="#0f766e" opacity="0.42" />
        <circle cx="120" cy="45" r="10" fill="#e5e7eb" />
        <line x1="96" y1="58" x2="72" y2="42" stroke="#facc15" strokeWidth="7" strokeLinecap="round" />
        <line x1="72" y1="42" x2="43" y2="49" stroke="#39FF14" strokeWidth="7" strokeLinecap="round" />
        <line x1="144" y1="58" x2="168" y2="42" stroke="#facc15" strokeWidth="7" strokeLinecap="round" />
        <line x1="168" y1="42" x2="197" y2="49" stroke="#39FF14" strokeWidth="7" strokeLinecap="round" />
        <line x1="105" y1="100" x2="90" y2="125" stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
        <line x1="135" y1="100" x2="150" y2="125" stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
        <circle cx="43" cy="49" r="6" fill="#38bdf8" />
        <circle cx="197" cy="49" r="6" fill="#38bdf8" />
      </svg>
    );
  }

  if (type === "water") {
    return (
      <svg
        viewBox="0 0 240 140"
        role="img"
        aria-label="Partial-submersion hand reference"
        className="h-28 w-full"
      >
        <rect width="240" height="140" rx="8" fill="#07111f" />
        <path d="M0 76c24-10 48-10 72 0s48 10 72 0 48-10 96 0v64H0Z" fill="#0e7490" opacity="0.42" />
        <path
          d="M0 75c24-10 48-10 72 0s48 10 72 0 48-10 96 0"
          fill="none"
          stroke="#67e8f9"
          strokeWidth="4"
          opacity="0.85"
        />
        <circle cx="83" cy="50" r="9" fill="#e5e7eb" />
        <line x1="91" y1="58" x2="121" y2="72" stroke="#facc15" strokeWidth="8" strokeLinecap="round" />
        <line x1="121" y1="72" x2="154" y2="84" stroke="#39FF14" strokeWidth="8" strokeLinecap="round" />
        <circle cx="154" cy="84" r="8" fill="#38bdf8" />
        <circle cx="166" cy="88" r="4" fill="#38bdf8" opacity="0.85" />
        <circle cx="176" cy="91" r="3" fill="#38bdf8" opacity="0.7" />
        <line x1="83" y1="59" x2="72" y2="96" stroke="#64748b" strokeWidth="7" strokeLinecap="round" />
        <line x1="72" y1="96" x2="55" y2="125" stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 240 140"
      role="img"
      aria-label="Early vertical forearm reference"
      className="h-28 w-full"
    >
      <rect width="240" height="140" rx="8" fill="#080f1a" />
      <path d="M0 106c30-9 60-9 90 0s60 9 90 0 40-9 60 0v34H0Z" fill="#164e63" opacity="0.38" />
      <path
        d="M18 105c24-8 48-8 72 0s48 8 72 0 40-8 60 0"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="4"
        opacity="0.7"
      />
      <circle cx="72" cy="49" r="10" fill="#e5e7eb" />
      <line x1="82" y1="57" x2="125" y2="58" stroke="#facc15" strokeWidth="8" strokeLinecap="round" />
      <line x1="125" y1="58" x2="132" y2="106" stroke="#39FF14" strokeWidth="8" strokeLinecap="round" />
      <circle cx="125" cy="58" r="7" fill="#facc15" />
      <circle cx="132" cy="106" r="7" fill="#38bdf8" />
      <path d="M148 66a35 35 0 0 0-22-24" fill="none" stroke="#94a3b8" strokeWidth="3" strokeDasharray="4 5" />
      <text x="153" y="62" fill="#cbd5e1" fontSize="14" fontFamily="monospace">100-120</text>
    </svg>
  );
}

function ReferenceCard({
  title,
  type,
  active,
}: {
  title: string;
  type: "evf" | "top" | "water";
  active: boolean;
}) {
  return (
    <div className={metricCardClass(active ? "cyan" : "zinc")}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          {title}
        </span>
        <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(active)}`} />
      </div>
      <ReferencePicture type={type} />
    </div>
  );
}

function ArmChainRow({
  label,
  chain,
}: {
  label: string;
  chain: ArmChainStatus | null;
}) {
  const score = Math.round((chain?.score ?? 0) * 100);

  return (
    <div className="rounded-md border border-zinc-800/80 bg-zinc-900/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-300">{label}</span>
        <span className="font-mono text-xs text-cyan-300">{score}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${chainDotClass(Boolean(chain?.shoulder))}`} />
        <span className={`h-2.5 w-2.5 rounded-full ${chainDotClass(Boolean(chain?.elbow))}`} />
        <span className={`h-2.5 w-2.5 rounded-full ${chainDotClass(Boolean(chain?.wrist))}`} />
        <div className="ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-cyan-400"
            style={{ width: `${clamp(score / 2.1, 0, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function MetricsPanel({
  analysis,
  styleCheckIntervalMs,
  onStyleCheckIntervalChange,
  trackerSettings,
  onTrackerSettingsChange,
  onResetTracking,
}: {
  analysis: FullAnalysis | null;
  styleCheckIntervalMs: number;
  onStyleCheckIntervalChange: (intervalMs: number) => void;
  trackerSettings: TrackerSettings;
  onTrackerSettingsChange: (patch: Partial<TrackerSettings>) => void;
  onResetTracking: () => void;
}) {
  const evf = analysis?.evf ?? null;
  const technique = analysis?.technique ?? null;
  const styleCheck = analysis?.styleCheck ?? null;
  const armIdentity = analysis?.armIdentity ?? null;
  const tracking = analysis?.tracking ?? null;
  const arm = evf ? pickDisplayArm(evf) : null;
  const anyEVF = evf ? evf.left.isEVF || evf.right.isEVF : false;
  const topViewActive = technique?.shoulders.view === "top";
  const partialSubmersionActive = Boolean(
    technique?.feedback.some((item) => item.id === "partial-submerged")
  );
  const lastCheckLabel =
    styleCheck?.lastCheckedMsAgo === null || styleCheck?.lastCheckedMsAgo === undefined
      ? "Waiting"
      : `${formatSeconds(styleCheck.lastCheckedMsAgo)} ago`;
  const nextCheckLabel = styleCheck
    ? formatSeconds(styleCheck.nextCheckMs)
    : formatSeconds(styleCheckIntervalMs);
  const armIdentityLabel = !armIdentity
    ? "--"
    : armIdentity.locked
      ? armIdentity.swapped
        ? "Locked swap"
        : "Locked"
      : "Learning";
  const trackedArmLabel = !armIdentity
    ? "--"
    : `L ${armIdentity.leftTracked ? "on" : "lost"} / R ${
        armIdentity.rightTracked ? "on" : "lost"
      }`;
  const viewLabel = !technique
    ? "--"
    : technique.shoulders.view === "top"
      ? "Top"
      : technique.shoulders.view === "side"
        ? "Side"
        : technique.shoulders.visible
          ? `${technique.shoulders.slopeDegrees.toFixed(1)} deg`
          : "--";
  const qualityPercent = Math.round((tracking?.quality ?? 0) * 100);
  const trackingStateLabel = tracking
    ? tracking.state === "predicting"
      ? `Predict ${tracking.predictionFrames}/${tracking.maxPredictionFrames}`
      : tracking.state === "limited"
        ? "Limited"
        : tracking.state === "live"
          ? "Live"
          : "Lost"
    : "Waiting";

  return (
    <div className="flex w-full flex-col gap-4 pr-1 xl:max-h-[calc(100vh-7.5rem)] xl:w-[22rem] xl:shrink-0 xl:overflow-y-auto">
      <div className={metricCardClass("cyan")}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Vision
            </span>
          </div>
          <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(Boolean(technique))}`} />
        </div>
        <div className="grid grid-cols-3 divide-x divide-zinc-800/80 text-center">
          <div className="px-2 py-1">
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">View</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{viewLabel}</p>
          </div>
          <div className="px-2 py-1">
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Arms</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">
              {armIdentity?.locked ? "Lock" : "Learn"}
            </p>
          </div>
          <div className="px-2 py-1">
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">EVF</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">
              {anyEVF ? "On" : "Scan"}
            </p>
          </div>
        </div>
      </div>

      <div className={metricCardClass(tracking?.state === "predicting" ? "amber" : "zinc")}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Tracking Health
            </span>
          </div>
          <span className="font-mono text-xs text-cyan-300">{trackingStateLabel}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full ${
              qualityPercent >= 70
                ? "bg-emerald-400"
                : qualityPercent >= 45
                  ? "bg-amber-400"
                  : "bg-red-400"
            }`}
            style={{ width: `${qualityPercent}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-3 divide-x divide-zinc-800/80 text-center">
          <div className="px-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Quality</p>
            <p className="mt-1 font-mono text-sm text-zinc-100">{qualityPercent}%</p>
          </div>
          <div className="px-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">FPS</p>
            <p className="mt-1 font-mono text-sm text-zinc-100">
              {tracking ? tracking.fps.toFixed(0) : "--"}
            </p>
          </div>
          <div className="px-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Edge</p>
            <p className="mt-1 font-mono text-sm text-zinc-100">
              {tracking?.edgeLandmarks ?? 0}
            </p>
          </div>
        </div>
      </div>

      <div className={metricCardClass(trackerSettings.predictionMode === "off" ? "zinc" : "amber")}>
        <div className="mb-3 flex items-center gap-2">
          <Brain className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Prediction Mode
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["off", "assist", "extended"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onTrackerSettingsChange({ predictionMode: mode })}
              className={`rounded-md border px-2 py-2 text-xs font-semibold transition ${controlButtonClass(
                trackerSettings.predictionMode === mode
              )}`}
            >
              {predictionModeLabel(mode)}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => onTrackerSettingsChange({ edgeGuard: !trackerSettings.edgeGuard })}
            className={`rounded-md border px-3 py-2 text-left transition ${controlButtonClass(
              trackerSettings.edgeGuard
            )}`}
          >
            <span className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5" />
              Edge guard
            </span>
          </button>
          <button
            type="button"
            onClick={onResetTracking}
            className="rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-left text-zinc-300 transition hover:border-cyan-900 hover:text-cyan-100"
          >
            <span className="flex items-center gap-2">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </span>
          </button>
        </div>
      </div>

      <div className={metricCardClass("zinc")}>
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Overlay Controls
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <button
            type="button"
            onClick={() =>
              onTrackerSettingsChange({ showSkeleton: !trackerSettings.showSkeleton })
            }
            className={`rounded-md border px-2 py-2 transition ${controlButtonClass(
              trackerSettings.showSkeleton
            )}`}
          >
            Bones
          </button>
          <button
            type="button"
            onClick={() => onTrackerSettingsChange({ showJoints: !trackerSettings.showJoints })}
            className={`rounded-md border px-2 py-2 transition ${controlButtonClass(
              trackerSettings.showJoints
            )}`}
          >
            Joints
          </button>
          <button
            type="button"
            onClick={() => onTrackerSettingsChange({ showTrails: !trackerSettings.showTrails })}
            className={`rounded-md border px-2 py-2 transition ${controlButtonClass(
              trackerSettings.showTrails
            )}`}
          >
            Trail
          </button>
        </div>
        <input
          type="range"
          min={0.25}
          max={1}
          step={0.05}
          value={trackerSettings.overlayOpacity}
          onChange={(event) =>
            onTrackerSettingsChange({ overlayOpacity: Number(event.currentTarget.value) })
          }
          className="mt-4 w-full accent-cyan-400"
          aria-label="Overlay opacity"
        />
        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
          <span>Soft</span>
          <span>{Math.round(trackerSettings.overlayOpacity * 100)}%</span>
          <span>Bright</span>
        </div>
      </div>

      <div className={metricCardClass("zinc")}>
        <div className="mb-3 flex items-center gap-2">
          <Hand className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Arm Chains
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <ArmChainRow label="Left shoulder / elbow / wrist" chain={tracking?.leftArm ?? null} />
          <ArmChainRow label="Right shoulder / elbow / wrist" chain={tracking?.rightArm ?? null} />
        </div>
      </div>

      <div className={metricCardClass("zinc")}>
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Technique ID
          </span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <p className="text-2xl font-bold text-white tracking-tight">
            {technique ? technique.stroke : "Scanning"}
          </p>
          <p className="text-sm font-mono text-cyan-300 tabular-nums">
            {technique ? `${Math.round(technique.confidence * 100)}%` : "--"}
          </p>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          {technique
            ? `${technique.lockState === "locked" ? "Locked" : technique.lockState} style memory`
            : "Waiting for stable stroke evidence"}
          {technique && technique.rawStroke !== technique.stroke
            ? ` / raw: ${technique.rawStroke}`
            : ""}
        </p>
      </div>

      <div className={metricCardClass("zinc")}>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Style Cadence
          </span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <p className="text-2xl font-mono font-bold tabular-nums text-zinc-200">
            {formatSeconds(styleCheckIntervalMs)}
          </p>
          <p className="text-xs text-cyan-300 tabular-nums">
            Next {nextCheckLabel}
          </p>
        </div>
        <input
          type="range"
          min={MIN_STYLE_CHECK_INTERVAL_MS}
          max={MAX_STYLE_CHECK_INTERVAL_MS}
          step={STYLE_CHECK_INTERVAL_STEP_MS}
          value={styleCheckIntervalMs}
          onChange={(event) =>
            onStyleCheckIntervalChange(Number(event.currentTarget.value))
          }
          className="mt-4 w-full accent-cyan-400"
          aria-label="Style check interval"
        />
        <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
          <span>{formatSeconds(MIN_STYLE_CHECK_INTERVAL_MS)}</span>
          <span>{styleCheck?.sampleCount ?? 0} samples</span>
          <span>{formatSeconds(MAX_STYLE_CHECK_INTERVAL_MS)}</span>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Last check: {lastCheckLabel}
        </p>
      </div>

      <ReferenceCard title="EVF Picture" type="evf" active={anyEVF} />
      <ReferenceCard title="Top View" type="top" active={topViewActive} />
      <ReferenceCard
        title="Submerged Hand"
        type="water"
        active={partialSubmersionActive}
      />

      <div className={metricCardClass(anyEVF ? "emerald" : "zinc")}>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Catch Mechanics
          </span>
        </div>
        <p className="text-4xl font-mono font-bold tabular-nums text-white tracking-tight">
          {arm?.valid ? `${arm.elbowAngle.toFixed(1)} deg` : "--"}
        </p>
        <p className="text-xs text-zinc-500 mt-2">
          EVF window: {EVF_ANGLE_MIN}-{EVF_ANGLE_MAX} deg, confidence{" "}
          {arm ? `${Math.round(arm.confidence * 100)}%` : "--"}.
        </p>
      </div>

      <div className={metricCardClass(armIdentity?.locked ? "emerald" : "zinc")}>
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            View Mode
          </span>
        </div>
        <p className="text-2xl font-mono font-bold tabular-nums text-zinc-200">
          {viewLabel}
        </p>
        <p className="text-xs text-zinc-500 mt-2">
          Yellow marks the shoulder and arm chain used for analysis.
        </p>
        <p className="text-xs text-zinc-500 mt-2">
          Arm ID: {armIdentityLabel} / {trackedArmLabel}
        </p>
      </div>

      <div className={metricCardClass("zinc")}>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-300" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Flaw Feedback
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {technique ? (
            technique.feedback.map((item) => (
              <p
                key={item.id}
                className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${feedbackColor(item.severity)}`}
              >
                {item.message}
              </p>
            ))
          ) : (
            <p className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
              Waiting for pose landmarks.
            </p>
          )}
        </div>
      </div>

      <div className={metricCardClass(anyEVF ? "emerald" : "amber")}>
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-3 block">
          Catch Phase
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
            L {evf.left.isEVF ? "active" : "idle"} / R {evf.right.isEVF ? "active" : "idle"}
          </p>
        )}
      </div>

      <div className="rounded-lg bg-zinc-950/90 border border-emerald-950/60 p-4 flex items-start gap-3 shadow-lg shadow-black/35">
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolvePoseCtor(mp: any): new (config: PoseConstructorConfig) => PoseInstance {
  const windowPose =
    typeof window !== "undefined"
      ? (window as Window & { Pose?: unknown }).Pose
      : undefined;
  const Ctor = mp.Pose || mp.default?.Pose || windowPose || mp;

  if (typeof window !== "undefined" && typeof Ctor === "function") {
    (window as Window & { Pose?: unknown }).Pose = Ctor;
  }

  return Ctor as new (config: PoseConstructorConfig) => PoseInstance;
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

  if (typeof window !== "undefined") {
    (window as Window & { Camera?: unknown }).Camera = Ctor;
  }

  return Ctor as new (
    video: HTMLVideoElement,
    options: { onFrame: () => Promise<void>; width?: number; height?: number }
  ) => { start: () => Promise<void>; stop: () => void };
}

export default function AnalysisEngine() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeRangeRef = useRef<StrokeRange>({ minX: 1, maxX: 0, minY: 1, maxY: 0 });
  const landmarkMemoryRef = useRef<LandmarkTrackingMemory>(createLandmarkTrackingMemory());
  const motionHistoryRef = useRef<MotionHistory>(createMotionHistory());
  const angleMemoryRef = useRef<AngleMemory>(createAngleMemory());
  const strokeMemoryRef = useRef<StrokeMemory>(createStrokeMemory());
  const styleAccumulatorRef = useRef<StyleAccumulator>(createStyleAccumulator());
  const styleWindowStartedAtRef = useRef(0);
  const lastStyleCheckRef = useRef(0);
  const lastStyleTechniqueRef = useRef<TechniqueAnalysis | null>(null);
  const styleCheckIntervalRef = useRef(DEFAULT_STYLE_CHECK_INTERVAL_MS);
  const armIdentityMemoryRef = useRef<ArmIdentityMemory>(createArmIdentityMemory());
  const activeArmMemoryRef = useRef<ActiveArmMemory>(createActiveArmMemory());
  const lastAnalysisRef = useRef<FullAnalysis | null>(null);
  const lastStateUpdateRef = useRef(0);
  const missingFramesRef = useRef(0);
  const trackerSettingsRef = useRef<TrackerSettings>(DEFAULT_TRACKER_SETTINGS);
  const lastFrameTimestampRef = useRef(0);
  const fpsRef = useRef(0);

  const [analysisState, setAnalysisState] = useState<FullAnalysis | null>(null);
  const [styleCheckIntervalMs, setStyleCheckIntervalMs] = useState(
    DEFAULT_STYLE_CHECK_INTERVAL_MS
  );
  const [trackerSettings, setTrackerSettings] = useState<TrackerSettings>(
    DEFAULT_TRACKER_SETTINGS
  );
  const [cameraReady, setCameraReady] = useState(false);
  const [videoStreamReady, setVideoStreamReady] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const resetTrackingMemory = useCallback(() => {
    landmarkMemoryRef.current = createLandmarkTrackingMemory();
    motionHistoryRef.current = createMotionHistory();
    angleMemoryRef.current = createAngleMemory();
    strokeMemoryRef.current = createStrokeMemory();
    styleAccumulatorRef.current = createStyleAccumulator();
    styleWindowStartedAtRef.current = 0;
    lastStyleCheckRef.current = 0;
    lastStyleTechniqueRef.current = null;
    armIdentityMemoryRef.current = createArmIdentityMemory();
    activeArmMemoryRef.current = createActiveArmMemory();
    strokeRangeRef.current = { minX: 1, maxX: 0, minY: 1, maxY: 0 };
    lastAnalysisRef.current = null;
    lastStateUpdateRef.current = 0;
    missingFramesRef.current = 0;
    setAnalysisState(null);
  }, []);

  const handleTrackerSettingsChange = useCallback(
    (patch: Partial<TrackerSettings>) => {
      const nextSettings = { ...trackerSettingsRef.current, ...patch };
      trackerSettingsRef.current = nextSettings;
      setTrackerSettings(nextSettings);

      if (patch.predictionMode === "off") {
        missingFramesRef.current = 0;
      }
    },
    []
  );

  const handleStyleCheckIntervalChange = useCallback((intervalMs: number) => {
    const normalizedInterval = clamp(
      intervalMs,
      MIN_STYLE_CHECK_INTERVAL_MS,
      MAX_STYLE_CHECK_INTERVAL_MS
    );
    styleCheckIntervalRef.current = normalizedInterval;
    styleAccumulatorRef.current = createStyleAccumulator();
    styleWindowStartedAtRef.current =
      typeof performance !== "undefined" ? performance.now() : 0;
    setStyleCheckIntervalMs(normalizedInterval);
  }, []);

  const onResults = useCallback((results: Results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const video = webcamRef.current?.video ?? undefined;
    const overlayMetrics = prepareOverlayCanvas(canvas, ctx, video);
    const settings = trackerSettingsRef.current;
    const now = performance.now();
    const frameDelta = lastFrameTimestampRef.current
      ? now - lastFrameTimestampRef.current
      : 0;
    lastFrameTimestampRef.current = now;

    if (frameDelta > 0) {
      const liveFps = 1000 / frameDelta;
      fpsRef.current = fpsRef.current
        ? fpsRef.current * 0.86 + liveFps * 0.14
        : liveFps;
    }

    const maxPredictionFrames = predictionHoldFrames(settings.predictionMode);

    if (!results.poseLandmarks || !isUsablePoseFrame(results.poseLandmarks, settings)) {
      missingFramesRef.current += 1;
      const predictedLandmarks =
        maxPredictionFrames > 0
          ? predictLandmarksFromMemory(landmarkMemoryRef.current)
          : null;
      const predicted = predictedLandmarks
        ? enhanceSwimLandmarks(predictedLandmarks)
        : null;

      if (
        predicted &&
        lastAnalysisRef.current &&
        missingFramesRef.current <= maxPredictionFrames
      ) {
        const predictedAnalysis: FullAnalysis = {
          ...lastAnalysisRef.current,
          tracking: createTrackingStatus(
            predicted,
            settings,
            "predicting",
            missingFramesRef.current,
            fpsRef.current
          ),
        };

        lastAnalysisRef.current = predictedAnalysis;
        if (now - lastStateUpdateRef.current > UI_UPDATE_INTERVAL_MS) {
          setAnalysisState(predictedAnalysis);
          lastStateUpdateRef.current = now;
        }

        drawSkeleton(
          ctx,
          predicted,
          predictedAnalysis,
          overlayMetrics,
          settings
        );
        return;
      }

      ctx.clearRect(0, 0, overlayMetrics.width, overlayMetrics.height);
      if (missingFramesRef.current > maxPredictionFrames) {
        resetTrackingMemory();
      }
      return;
    }

    missingFramesRef.current = 0;

    const smoothed = enhanceSwimLandmarks(
      stabilizeLandmarks(results.poseLandmarks, landmarkMemoryRef.current, settings)
    );
    const cleaned = cleanUnstableArmGeometry(smoothed, settings);
    syncEnhancedArmEndpointMemory(landmarkMemoryRef.current, cleaned);
    const armIdentity = resolveArmIdentityLandmarks(
      cleaned,
      armIdentityMemoryRef.current
    );
    const identified = cleanUnstableArmGeometry(armIdentity.landmarks, settings);

    if (armIdentity.swappedChanged) {
      motionHistoryRef.current = createMotionHistory();
      angleMemoryRef.current = createAngleMemory();
      styleAccumulatorRef.current = createStyleAccumulator();
      styleWindowStartedAtRef.current = now;
    }

    const singleArmMode = shouldUseSingleArmMode(identified);
    if (!singleArmMode) {
      activeArmMemoryRef.current = createActiveArmMemory();
    }

    const activeArm = singleArmMode
      ? resolveActiveArm(identified, activeArmMemoryRef.current)
      : null;
    const lm = activeArm ? suppressArm(identified, oppositeArm(activeArm)) : identified;

    const motion = updateMotionHistory(motionHistoryRef.current, lm);
    const shoulders = getShoulderMetrics(lm);
    const sr = strokeRangeRef.current;
    updateStrokeRange(sr, lm);

    const evf = stabilizeEVFResult(
      checkEVF(lm, sr, shoulders, motion),
      angleMemoryRef.current,
      shoulders.view
    );
    const styleIntervalMs = styleCheckIntervalRef.current;

    if (styleWindowStartedAtRef.current === 0) {
      styleWindowStartedAtRef.current = now;
    }

    const rawStyle = classifyStroke(lm, shoulders, motion);
    pushStyleSample(styleAccumulatorRef.current, rawStyle);

    const shouldCheckStyle =
      now - styleWindowStartedAtRef.current >= styleIntervalMs;
    let technique: TechniqueAnalysis;

    if (shouldCheckStyle) {
      const intervalStyle = summarizeStyleSamples(
        styleAccumulatorRef.current,
        rawStyle
      );
      const rawTechnique = createTechniqueAnalysisFromStyle(
        lm,
        evf,
        shoulders,
        intervalStyle
      );
      technique = withStrokeMemory(rawTechnique, strokeMemoryRef.current);
      lastStyleTechniqueRef.current = technique;
      lastStyleCheckRef.current = now;
      styleAccumulatorRef.current = createStyleAccumulator();
      styleWindowStartedAtRef.current = now;
    } else if (lastStyleTechniqueRef.current) {
      technique = refreshTechniqueFrame(
        lastStyleTechniqueRef.current,
        lm,
        evf,
        shoulders
      );
    } else {
      technique = createPendingTechnique(lm, evf, shoulders);
    }

    const styleCheck = createStyleCheckStatus(
      now,
      styleIntervalMs,
      styleWindowStartedAtRef.current,
      lastStyleCheckRef.current,
      styleAccumulatorRef.current.samples
    );
    const analysis: FullAnalysis = {
      evf,
      technique,
      styleCheck,
      armIdentity: armIdentity.status,
      tracking: createTrackingStatus(lm, settings, "live", 0, fpsRef.current),
      trails: createMotionTrails(motionHistoryRef.current),
    };
    lastAnalysisRef.current = analysis;

    if (now - lastStateUpdateRef.current > UI_UPDATE_INTERVAL_MS) {
      setAnalysisState(analysis);
      lastStateUpdateRef.current = now;
    }

    drawSkeleton(ctx, lm, analysis, overlayMetrics, settings);
  }, [resetTrackingMemory]);

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
      try {
        const mpPoseMod = await import("@mediapipe/pose");
        if (cancelled) return;

        const mpCameraMod = await import("@mediapipe/camera_utils");
        if (cancelled) return;

        const PoseConstructor = resolvePoseCtor(mpPoseMod);
        const CameraConstructor = resolveCameraCtor(mpCameraMod);
        const poseInstance = new PoseConstructor({
          locateFile: (file: string) => `${POSE_CDN}${file}`,
        });

        poseInstance.setOptions({
          modelComplexity: 1,
          smoothLandmarks: false,
          enableSegmentation: false,
          minDetectionConfidence: 0.55,
          minTrackingConfidence: 0.6,
        });

        poseInstance.onResults(onResults);
        pose = poseInstance;

        if (typeof poseInstance.initialize === "function") {
          await poseInstance.initialize();
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
          width: VIDEO_WIDTH,
          height: VIDEO_HEIGHT,
        });

        camera = cameraInstance;
        await cameraInstance.start();

        if (!cancelled) setCameraReady(true);
      } catch (error) {
        if (!cancelled) {
          console.error("Pose engine failed to initialize", error);
          setCameraReady(false);
          setIsLoaded(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      setCameraReady(false);
      setIsLoaded(false);
      landmarkMemoryRef.current = createLandmarkTrackingMemory();
      motionHistoryRef.current = createMotionHistory();
      angleMemoryRef.current = createAngleMemory();
      strokeMemoryRef.current = createStrokeMemory();
      styleAccumulatorRef.current = createStyleAccumulator();
      styleWindowStartedAtRef.current = 0;
      lastStyleCheckRef.current = 0;
      lastStyleTechniqueRef.current = null;
      armIdentityMemoryRef.current = createArmIdentityMemory();
      activeArmMemoryRef.current = createActiveArmMemory();
      strokeRangeRef.current = { minX: 1, maxX: 0, minY: 1, maxY: 0 };
      lastAnalysisRef.current = null;
      lastStateUpdateRef.current = 0;
      missingFramesRef.current = 0;
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
    <div className="flex min-h-[calc(100vh-9rem)] w-full flex-col gap-5 bg-transparent xl:flex-row xl:items-start">
      <div className="relative min-h-[360px] w-full flex-1 overflow-hidden rounded-lg border border-zinc-800 bg-black shadow-2xl shadow-black/50 sm:min-h-[460px] xl:min-h-[calc(100vh-9rem)]">
        <Webcam
          ref={webcamRef}
          mirrored
          className="relative z-0 w-full h-full object-cover"
          videoConstraints={{
            width: { ideal: VIDEO_WIDTH },
            height: { ideal: VIDEO_HEIGHT },
            facingMode: "user",
          }}
          onUserMedia={() => setVideoStreamReady(true)}
          onUserMediaError={() => setVideoStreamReady(false)}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-[100]"
          aria-hidden
        />
        <div className="pointer-events-none absolute left-4 top-4 z-[105] flex flex-wrap gap-2">
          <span className="rounded-md border border-zinc-700/80 bg-black/60 px-2.5 py-1 text-xs font-medium text-zinc-200 backdrop-blur-md">
            {analysisState?.technique.shoulders.view === "top"
              ? "Top View"
              : analysisState?.technique.shoulders.view === "side"
                ? "Side View"
                : "Live View"}
          </span>
          <span className="rounded-md border border-zinc-700/80 bg-black/60 px-2.5 py-1 text-xs font-medium text-zinc-200 backdrop-blur-md">
            Arms {analysisState?.armIdentity.locked ? "Locked" : "Learning"}
          </span>
          <span
            className={`rounded-md border px-2.5 py-1 text-xs font-medium backdrop-blur-md ${
              analysisState?.tracking.state === "predicting"
                ? "border-amber-500/70 bg-amber-950/70 text-amber-100"
                : "border-zinc-700/80 bg-black/60 text-zinc-200"
            }`}
          >
            {analysisState?.tracking.state === "predicting"
              ? `Predict ${analysisState.tracking.predictionFrames}/${analysisState.tracking.maxPredictionFrames}`
              : predictionModeLabel(trackerSettings.predictionMode)}
          </span>
          <span
            className={`rounded-md border px-2.5 py-1 text-xs font-medium backdrop-blur-md ${
              analysisState?.evf.left.isEVF || analysisState?.evf.right.isEVF
                ? "border-emerald-500/70 bg-emerald-950/60 text-emerald-100"
                : "border-zinc-700/80 bg-black/60 text-zinc-200"
            }`}
          >
            EVF {analysisState?.evf.left.isEVF || analysisState?.evf.right.isEVF ? "Active" : "Scan"}
          </span>
        </div>
        {(!isLoaded || !cameraReady) && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center bg-zinc-950/85 backdrop-blur-sm">
            <div className="text-center px-4">
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-zinc-400">Initializing pose engine...</p>
            </div>
          </div>
        )}
      </div>

      <MetricsPanel
        analysis={analysisState}
        styleCheckIntervalMs={styleCheckIntervalMs}
        onStyleCheckIntervalChange={handleStyleCheckIntervalChange}
        trackerSettings={trackerSettings}
        onTrackerSettingsChange={handleTrackerSettingsChange}
        onResetTracking={resetTrackingMemory}
      />
    </div>
  );
}
