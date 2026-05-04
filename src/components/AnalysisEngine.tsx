'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import type { NormalizedLandmark, Results } from "@mediapipe/pose";
import {
  Activity,
  AlertTriangle,
  ShieldCheck,
  Target,
  Waves,
} from "lucide-react";

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

type ArmSide = "left" | "right";

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
  view: "front" | "side" | "unknown";
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
}

interface StrokeRange {
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

interface ActiveArmMemory {
  side: ArmSide | null;
  candidateSide: ArmSide | null;
  candidateFrames: number;
  missingFrames: number;
}

interface ArmSignal {
  score: number;
  complete: boolean;
  partial: boolean;
  hasShoulder: boolean;
  hasElbow: boolean;
  hasWrist: boolean;
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

const DEG = 180 / Math.PI;
const EVF_ANGLE_MIN = 100;
const EVF_ANGLE_MAX = 120;
const EVF_VERTICALITY_MIN = 70;
const CATCH_PHASE_THRESHOLD = 0.3;
const STROKE_RANGE_DECAY = 0.005;
const LANDMARK_SMOOTHING_ALPHA = 0.42;
const MOTION_HISTORY_LENGTH = 42;
const STROKE_ACQUIRE_FRAMES = 8;
const STROKE_SWITCH_FRAMES = 18;
const STROKE_MEMORY_HOLD_FRAMES = 75;
const ACTIVE_ARM_ACQUIRE_FRAMES = 4;
const ACTIVE_ARM_SWITCH_FRAMES = 20;
const ACTIVE_ARM_HOLD_FRAMES = 90;
const UI_UPDATE_INTERVAL_MS = 250;
const MIN_ARM_SIGNAL_SCORE = 0.95;
const NEON_GREEN = "#39FF14";
const DEFAULT_LIMB = "rgba(0, 200, 255, 0.55)";
const DEFAULT_JOINT = "rgba(255, 255, 255, 0.85)";
const SHOULDER_LINE = "rgba(250, 204, 21, 0.95)";
const MEDIAPIPE_POSE_VERSION = "0.5.1675469404";
const POSE_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/pose@${MEDIAPIPE_POSE_VERSION}/`;
const SWIM_CONNECTIONS: readonly PoseConnection[] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
];
const SWIM_LANDMARKS = new Set([11, 12, 13, 14, 15, 16, 23, 24]);

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

function forearmVerticality(elbow: Point, wrist: Point): number {
  const dx = wrist.x - elbow.x;
  const dy = wrist.y - elbow.y;
  const angle = Math.abs(Math.atan2(dy, dx) * DEG);
  return angle > 90 ? 180 - angle : angle;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function range(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

function isVisible(
  lm: NormalizedLandmark | undefined,
  minVisibility = 0.5
): lm is NormalizedLandmark {
  return Boolean(lm && (lm.visibility === undefined || lm.visibility >= minVisibility));
}

function smoothLandmarks(
  current: NormalizedLandmark[],
  previous: NormalizedLandmark[] | null
): NormalizedLandmark[] {
  if (!previous) {
    return current.map((lm) => ({ ...lm }));
  }

  return current.map((lm, index) => {
    const prev = previous[index];
    if (!prev) return { ...lm };

    const currentVisibility = landmarkVisibility(lm);
    const previousVisibility = landmarkVisibility(prev);
    const alpha = currentVisibility < 0.35 ? 0.18 : LANDMARK_SMOOTHING_ALPHA;

    return {
      ...lm,
      x: prev.x * (1 - alpha) + lm.x * alpha,
      y: prev.y * (1 - alpha) + lm.y * alpha,
      z: prev.z * (1 - alpha) + lm.z * alpha,
      visibility: Math.max(currentVisibility, previousVisibility * 0.82),
    };
  });
}

function landmarkVisibility(lm: NormalizedLandmark | undefined): number {
  return lm?.visibility ?? (lm ? 1 : 0);
}

function armIndices(side: ArmSide) {
  return side === "left"
    ? { shoulder: 11, elbow: 13, wrist: 15 }
    : { shoulder: 12, elbow: 14, wrist: 16 };
}

function oppositeArm(side: ArmSide): ArmSide {
  return side === "left" ? "right" : "left";
}

function getArmSignal(landmarks: NormalizedLandmark[], side: ArmSide): ArmSignal {
  const indices = armIndices(side);
  const shoulder = landmarks[indices.shoulder];
  const elbow = landmarks[indices.elbow];
  const wrist = landmarks[indices.wrist];
  const hasShoulder = isVisible(shoulder, 0.25);
  const hasElbow = isVisible(elbow, 0.25);
  const hasWrist = isVisible(wrist, 0.25);

  if (!hasElbow || !hasWrist) {
    return {
      score: 0,
      complete: false,
      partial: false,
      hasShoulder,
      hasElbow,
      hasWrist,
    };
  }

  const forearm = distance(elbow, wrist);
  const forearmOk = forearm >= 0.025 && forearm <= 0.78;
  const upperArm = hasShoulder ? distance(shoulder, elbow) : 0;
  const upperArmOk = !hasShoulder || (upperArm >= 0.025 && upperArm <= 0.78);
  const ratio = hasShoulder && upperArm > 0 ? forearm / upperArm : 1;
  const ratioOk = !hasShoulder || (ratio >= 0.28 && ratio <= 3.4);

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
    landmarkVisibility(elbow) +
    landmarkVisibility(wrist) +
    (hasShoulder ? landmarkVisibility(shoulder) + 0.35 : 0);

  return {
    score: rawScore,
    complete: hasShoulder,
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

function createMotionHistory(): MotionHistory {
  return {
    leftWrist: { points: [] },
    rightWrist: { points: [] },
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
  if (!isVisible(landmark, 0.35)) return;

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

function createActiveArmMemory(): ActiveArmMemory {
  return {
    side: null,
    candidateSide: null,
    candidateFrames: 0,
    missingFrames: 0,
  };
}

function hasSideViewSignal(landmarks: NormalizedLandmark[]): boolean {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftVisible = isVisible(leftShoulder, 0.35);
  const rightVisible = isVisible(rightShoulder, 0.35);

  if (leftVisible !== rightVisible) return true;
  if (!leftVisible || !rightVisible) return false;

  return distance(leftShoulder, rightShoulder) < 0.12;
}

function shouldUseSingleArmMode(landmarks: NormalizedLandmark[]): boolean {
  const leftScore = armVisibilityScore(landmarks, "left");
  const rightScore = armVisibilityScore(landmarks, "right");

  return hasSideViewSignal(landmarks) || Math.abs(leftScore - rightScore) > 0.9;
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

    return memory.side ?? candidate;
  }

  if (candidate === memory.side) {
    memory.candidateSide = null;
    memory.candidateFrames = 0;
    return memory.side;
  }

  const activeScore = memory.side === "left" ? leftScore : rightScore;
  const candidateScore = candidate === "left" ? leftScore : rightScore;
  const candidateClearlyBetter = candidateScore > activeScore + 0.75;

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

  for (const index of [indices.shoulder, indices.elbow, indices.wrist]) {
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
  };
}

function checkEVFForArm(
  shoulder: NormalizedLandmark | undefined,
  elbow: NormalizedLandmark | undefined,
  wrist: NormalizedLandmark | undefined,
  strokeRange: StrokeRange
): ArmEVF {
  if (!isVisible(shoulder, 0.35) || !isVisible(elbow, 0.35) || !isVisible(wrist, 0.35)) {
    return emptyArmEVF();
  }

  const S: Point = { x: shoulder.x, y: shoulder.y };
  const E: Point = { x: elbow.x, y: elbow.y };
  const W: Point = { x: wrist.x, y: wrist.y };
  const elbowAngle = angleBetweenPoints(S, E, W);
  const verticality = forearmVerticality(E, W);
  const range = strokeRange.maxY - strokeRange.minY;
  const normalizedY = range > 0.01 ? (W.y - strokeRange.minY) / range : 0.5;
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

function getShoulderMetrics(landmarks: NormalizedLandmark[]): ShoulderMetrics {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftVisible = isVisible(leftShoulder, 0.35);
  const rightVisible = isVisible(rightShoulder, 0.35);
  const primaryArm = pickPrimaryArm(landmarks);

  if (!leftVisible && !rightVisible) {
    if (primaryArm) {
      const indices = armIndices(primaryArm);
      const elbow = landmarks[indices.elbow];
      const wrist = landmarks[indices.wrist];

      if (isVisible(elbow, 0.25) && isVisible(wrist, 0.25)) {
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

    return {
      visible: true,
      view: "side",
      trackedSide,
      slopeDegrees: 0,
      width: 0.12,
      centerX: shoulder.x,
      centerY: shoulder.y,
    };
  }

  const left: Point = { x: leftShoulder.x, y: leftShoulder.y };
  const right: Point = { x: rightShoulder.x, y: rightShoulder.y };
  const width = distance(left, right);
  const view = width < 0.08 ? "side" : "front";

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

  if (!shoulders.visible || !primaryArm) {
    return { stroke: "Unknown", confidence: 0 };
  }

  const bothArmsVisible =
    isVisible(leftWrist) &&
    isVisible(rightWrist) &&
    isVisible(leftElbow) &&
    isVisible(rightElbow);

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

function analyzeTechnique(
  landmarks: NormalizedLandmark[],
  evf: EVFResult,
  motion: MotionSummary
): TechniqueAnalysis {
  const shoulders = getShoulderMetrics(landmarks);
  const { stroke, confidence } = classifyStroke(landmarks, shoulders, motion);
  const feedback: TechniqueFeedback[] = [];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const primaryArm = pickPrimaryArm(landmarks);
  const primarySignal = primaryArm ? getArmSignal(landmarks, primaryArm) : null;

  if (!shoulders.visible) {
    feedback.push({
      id: "shoulders-hidden",
      severity: "critical",
      message: "Show at least one elbow and wrist; shoulder improves EVF accuracy.",
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
      message: "Technique is uncertain; show one full side-view arm path from shoulder to wrist.",
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

  return {
    stroke,
    rawStroke: stroke,
    confidence,
    lockState: "acquiring",
    shoulders,
    feedback: feedback.slice(0, 5),
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
      memory.unknownFrames <= STROKE_MEMORY_HOLD_FRAMES
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
        memory.candidateFrames >= STROKE_ACQUIRE_FRAMES &&
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

      if (memory.candidateFrames >= STROKE_SWITCH_FRAMES) {
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

  const feedback = [...analysis.feedback];
  if (lockState === "acquiring") {
    feedback.unshift({
      id: "style-acquiring",
      severity: "warning",
      message: "Learning the current stroke; keep one full arm path visible.",
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

  return {
    ...analysis,
    stroke,
    rawStroke,
    confidence,
    lockState,
    feedback: feedback.slice(0, 5),
  };
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  poseConnections: readonly PoseConnection[],
  analysis: FullAnalysis,
  width: number,
  height: number
) {
  ctx.clearRect(0, 0, width, height);

  const { evf, technique } = analysis;
  const evfSegments = new Set<string>();
  const poseConnectionKeys = new Set(
    poseConnections.map(([startIdx, endIdx]) => `${startIdx}-${endIdx}`)
  );
  const swimConnections = SWIM_CONNECTIONS.filter(
    ([startIdx, endIdx]) =>
      poseConnectionKeys.size === 0 ||
      poseConnectionKeys.has(`${startIdx}-${endIdx}`) ||
      poseConnectionKeys.has(`${endIdx}-${startIdx}`)
  );

  if (evf.left.isEVF) {
    evfSegments.add("11-13");
    evfSegments.add("13-15");
  }
  if (evf.right.isEVF) {
    evfSegments.add("12-14");
    evfSegments.add("14-16");
  }

  for (const [startIdx, endIdx] of swimConnections) {
    const start = landmarks[startIdx];
    const end = landmarks[endIdx];
    if (!isVisible(start) || !isVisible(end)) continue;

    const segKey = `${startIdx}-${endIdx}`;
    const isEVFSeg = evfSegments.has(segKey);
    const isShoulderSeg = segKey === "11-12" || segKey === "12-11";

    ctx.beginPath();
    ctx.moveTo(start.x * width, start.y * height);
    ctx.lineTo(end.x * width, end.y * height);
    ctx.strokeStyle = isEVFSeg ? NEON_GREEN : isShoulderSeg ? SHOULDER_LINE : DEFAULT_LIMB;
    ctx.lineWidth = isEVFSeg || isShoulderSeg ? 4 : 2;
    ctx.shadowColor = isEVFSeg ? NEON_GREEN : isShoulderSeg ? SHOULDER_LINE : "transparent";
    ctx.shadowBlur = isEVFSeg || isShoulderSeg ? 12 : 0;
    ctx.stroke();
  }

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  for (const i of SWIM_LANDMARKS) {
    const lm = landmarks[i];
    if (!isVisible(lm)) continue;

    const isEVFJoint =
      (evf.left.isEVF && (i === 11 || i === 13 || i === 15)) ||
      (evf.right.isEVF && (i === 12 || i === 14 || i === 16));
    const isShoulderJoint = technique.shoulders.visible && (i === 11 || i === 12);

    ctx.beginPath();
    ctx.arc(
      lm.x * width,
      lm.y * height,
      isEVFJoint || isShoulderJoint ? 5 : 3,
      0,
      2 * Math.PI
    );
    ctx.fillStyle = isEVFJoint ? NEON_GREEN : isShoulderJoint ? SHOULDER_LINE : DEFAULT_JOINT;
    ctx.fill();
  }
}

function pickDisplayArm(evf: EVFResult): ArmEVF {
  if (evf.left.inCatchPhase && !evf.right.inCatchPhase) return evf.left;
  if (evf.right.inCatchPhase && !evf.left.inCatchPhase) return evf.right;
  return evf.left.elbowAngle >= evf.right.elbowAngle ? evf.left : evf.right;
}

function feedbackColor(severity: TechniqueFeedback["severity"]) {
  if (severity === "good") {
    return "border-emerald-900/70 bg-emerald-950/25 text-emerald-200";
  }
  if (severity === "critical") {
    return "border-red-900/70 bg-red-950/25 text-red-200";
  }
  return "border-amber-900/70 bg-amber-950/25 text-amber-100";
}

function MetricsPanel({ analysis }: { analysis: FullAnalysis | null }) {
  const evf = analysis?.evf ?? null;
  const technique = analysis?.technique ?? null;
  const arm = evf ? pickDisplayArm(evf) : null;
  const anyEVF = evf ? evf.left.isEVF || evf.right.isEVF : false;
  const viewLabel = !technique
    ? "--"
    : technique.shoulders.view === "side"
      ? "Side"
      : technique.shoulders.visible
        ? `${technique.shoulders.slopeDegrees.toFixed(1)} deg`
        : "--";

  return (
    <div className="flex flex-col gap-4 w-80 shrink-0">
      <div className="rounded-lg bg-zinc-950/90 border border-zinc-800/80 p-5 shadow-lg shadow-black/40">
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

      <div className="rounded-lg bg-zinc-950/90 border border-zinc-800/80 p-5 shadow-lg shadow-black/40">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Catch Mechanics
          </span>
        </div>
        <p className="text-4xl font-mono font-bold tabular-nums text-white tracking-tight">
          {arm ? `${arm.elbowAngle.toFixed(1)} deg` : "--"}
        </p>
        <p className="text-xs text-zinc-500 mt-2">
          EVF window: {EVF_ANGLE_MIN}-{EVF_ANGLE_MAX} deg, forearm over {EVF_VERTICALITY_MIN} deg.
        </p>
      </div>

      <div className="rounded-lg bg-zinc-950/90 border border-zinc-800/80 p-5 shadow-lg shadow-black/40">
        <div className="flex items-center gap-2 mb-3">
          <Waves className="w-4 h-4 text-cyan-400" />
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
      </div>

      <div className="rounded-lg bg-zinc-950/90 border border-zinc-800/80 p-5 shadow-lg shadow-black/40">
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

      <div className="rounded-lg bg-zinc-950/90 border border-zinc-800/80 p-5 shadow-lg shadow-black/40">
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

      <div className="rounded-lg bg-zinc-950/90 border border-emerald-950/50 p-4 flex items-start gap-3 shadow-lg shadow-black/40">
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
  const strokeRangeRef = useRef<StrokeRange>({ minY: 1, maxY: 0 });
  const poseConnectionsRef = useRef<readonly PoseConnection[] | null>(null);
  const smoothedLandmarksRef = useRef<NormalizedLandmark[] | null>(null);
  const motionHistoryRef = useRef<MotionHistory>(createMotionHistory());
  const strokeMemoryRef = useRef<StrokeMemory>(createStrokeMemory());
  const activeArmMemoryRef = useRef<ActiveArmMemory>(createActiveArmMemory());
  const lastStateUpdateRef = useRef(0);
  const missingFramesRef = useRef(0);

  const [analysisState, setAnalysisState] = useState<FullAnalysis | null>(null);
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
      missingFramesRef.current += 1;
      if (missingFramesRef.current > 18) {
        setAnalysisState(null);
        smoothedLandmarksRef.current = null;
      }
      return;
    }

    missingFramesRef.current = 0;

    const smoothed = smoothLandmarks(results.poseLandmarks, smoothedLandmarksRef.current);
    smoothedLandmarksRef.current = smoothed;

    const singleArmMode = shouldUseSingleArmMode(smoothed);
    if (!singleArmMode) {
      activeArmMemoryRef.current = createActiveArmMemory();
    }

    const activeArm = singleArmMode
      ? resolveActiveArm(smoothed, activeArmMemoryRef.current)
      : null;
    const lm = activeArm ? suppressArm(smoothed, oppositeArm(activeArm)) : smoothed;

    const motion = updateMotionHistory(motionHistoryRef.current, lm);
    const sr = strokeRangeRef.current;
    const wrists = [lm[15], lm[16]].filter(
      (w): w is NormalizedLandmark => isVisible(w, 0.35)
    );

    if (wrists.length > 0) {
      const wristY = Math.min(...wrists.map((w) => w.y));
      sr.minY = Math.min(sr.minY, wristY);
      sr.maxY = Math.max(sr.maxY, wristY);
    }

    sr.minY += STROKE_RANGE_DECAY;
    sr.maxY -= STROKE_RANGE_DECAY;

    if (sr.minY > sr.maxY && wrists.length > 0) {
      const wristY = Math.min(...wrists.map((w) => w.y));
      sr.minY = wristY;
      sr.maxY = wristY;
    }

    const evf = checkEVF(lm, sr);
    const rawTechnique = analyzeTechnique(lm, evf, motion);
    const technique = withStrokeMemory(rawTechnique, strokeMemoryRef.current);
    const analysis = { evf, technique };
    const now = performance.now();

    if (now - lastStateUpdateRef.current > UI_UPDATE_INTERVAL_MS) {
      setAnalysisState(analysis);
      lastStateUpdateRef.current = now;
    }

    drawSkeleton(ctx, lm, poseConnections, analysis, canvas.width, canvas.height);
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
      try {
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
          width: 640,
          height: 480,
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
      poseConnectionsRef.current = null;
      smoothedLandmarksRef.current = null;
      motionHistoryRef.current = createMotionHistory();
      strokeMemoryRef.current = createStrokeMemory();
      activeArmMemoryRef.current = createActiveArmMemory();
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
    <div className="flex gap-6 w-full h-full items-start bg-transparent">
      <div className="relative flex-1 rounded-lg overflow-hidden bg-black border border-zinc-800 shadow-2xl shadow-black/50">
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
              <p className="text-sm text-zinc-400">Initializing pose engine...</p>
            </div>
          </div>
        )}
      </div>

      <MetricsPanel analysis={analysisState} />
    </div>
  );
}
