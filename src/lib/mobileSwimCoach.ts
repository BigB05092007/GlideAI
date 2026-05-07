export type ManualCoachTone = "good" | "warning" | "critical";
export type ManualStroke = "Freestyle" | "Backstroke" | "Breaststroke";

export interface ManualPhase {
  id: "beginner" | "intermediate" | "advanced";
  label: string;
  levels: string;
  objective: string;
  rubric: Array<{
    skill: string;
    weight: number;
    cue: string;
  }>;
}

export interface FlawCorrection {
  problem: string;
  drill: string;
  logic: string;
  tags: string[];
}

export interface DrillSpec {
  name: string;
  description: string;
  purpose: string;
}

export interface ScoreCriterion {
  score: 1 | 2 | 3 | 4 | 5;
  label: string;
  description: string;
}

interface StrokeKnowledgeBase {
  identifier: string;
  stroke: ManualStroke;
  displayName: string;
  phases: ManualPhase[];
  flawCorrections: FlawCorrection[];
  drills: DrillSpec[];
  scoring: ScoreCriterion[];
}

export interface ManualCoachComment {
  id: string;
  tone: ManualCoachTone;
  title: string;
  comment: string;
  evidence?: string;
  immediateCue?: string;
  drill?: string;
  source: string;
}

export interface ManualCoachSet {
  title: string;
  reps: string;
  instruction: string;
  successMetric: string;
}

export interface RubricRating {
  skill: string;
  weight: number;
  score: ScoreCriterion["score"];
  cue: string;
  reason: string;
}

export interface ManualCoachResult {
  model: "stroke-manual-reasoner-v3";
  stroke: ManualStroke;
  strokeLabel: string;
  phase: ManualPhase;
  estimatedScore: ScoreCriterion;
  confidence: number;
  primaryFocus: string;
  inferredCause: string;
  nextSet: ManualCoachSet;
  rubric: RubricRating[];
  comments: ManualCoachComment[];
  voiceLine: string;
}

export interface ManualCoachInput {
  stroke: string;
  strokeFocus: string;
  confidence: number;
  lockState: string;
  trackingQuality: number;
  edgeLandmarks: number;
  completeArmChain: boolean;
  anyEvf: boolean;
  catchPhaseActive: boolean;
  bestEvfConfidence: number;
  shoulderView: string;
  shoulderSlopeDegrees: number;
  feedbackIds: string[];
}

const SCORING: ScoreCriterion[] = [
  {
    score: 1,
    label: "Needs Work",
    description: "Inconsistent technique, significant drag, frequent stalling.",
  },
  {
    score: 2,
    label: "Progressing",
    description: "Form is recognizable but requires high conscious effort.",
  },
  {
    score: 3,
    label: "Proficient",
    description: "Smooth movement, maintains form under mild fatigue.",
  },
  {
    score: 4,
    label: "Advanced",
    description: "High efficiency, powerful propulsion, precise timing.",
  },
  {
    score: 5,
    label: "Elite",
    description: "Competitive standard, optimized biomechanical efficiency.",
  },
];

const FRONT_CRAWL: StrokeKnowledgeBase = {
  identifier: "STROKE_ANALYSIS_CURRICULUM_V1:FREESTYLE",
  stroke: "Freestyle",
  displayName: "Front crawl",
  phases: [
    {
      id: "beginner",
      label: "Beginner",
      levels: "Ultra 1-3",
      objective: "Master horizontal buoyancy and basic propulsive rhythm.",
      rubric: [
        { skill: "Body Position", weight: 30, cue: "Horizontal, face in water, streamlined." },
        { skill: "Kicking", weight: 30, cue: "Flutter kick from the hip with slight knee bend." },
        { skill: "Arm Action", weight: 20, cue: "Controlled alternating recovery above surface." },
        { skill: "Breathing", weight: 20, cue: "Side breathing with underwater exhalation." },
      ],
    },
    {
      id: "intermediate",
      label: "Intermediate",
      levels: "Ultra 4-6",
      objective: "Refine recovery mechanics and bilateral breathing timing.",
      rubric: [
        { skill: "Arm Entry", weight: 25, cue: "Hand entry beyond shoulder line." },
        { skill: "Recovery", weight: 25, cue: "High-elbow, bent-arm recovery clear of surface." },
        { skill: "Timing", weight: 25, cue: "Continuous movement with no dead spots." },
        { skill: "Breathing", weight: 25, cue: "Regular bilateral pattern." },
      ],
    },
    {
      id: "advanced",
      label: "Advanced",
      levels: "Ultra 7-9",
      objective: "Maximize S-drive efficiency and propulsive power.",
      rubric: [
        { skill: "Underwater Drive", weight: 30, cue: "S-pull path finishing at thigh." },
        { skill: "Body Roll", weight: 30, cue: "Hip-initiated rotation for drive and breath." },
        { skill: "Catch Strength", weight: 20, cue: "High-elbow catch and powerful push phase." },
        { skill: "Breathing Precision", weight: 20, cue: "Exhalation finishes at surface clearance." },
      ],
    },
  ],
  flawCorrections: [
    {
      problem: "Sinking legs or vertical profile",
      drill: "Prayer Swim / Shark Fin",
      logic: "Forces kick intensity and buoyancy awareness to maintain lift.",
      tags: ["body-line", "camera", "kick"],
    },
    {
      problem: "Lifting head to breathe",
      drill: "Side Glide Kick",
      logic: "Teaches head-on-arm position and rotation instead of vertical lifting.",
      tags: ["breathing", "rotation"],
    },
    {
      problem: "Rigid shoulders or no rotation",
      drill: "Smiley Faces / The Alternator",
      logic: "Makes shoulder roll visible and links shoulder-hip balance.",
      tags: ["rotation"],
    },
    {
      problem: "Straight-arm or windmill recovery",
      drill: "Finger Drag / 6-Kick Zipper",
      logic: "Constrains the recovery into high-elbow, bent-arm mechanics.",
      tags: ["recovery"],
    },
    {
      problem: "Choppy or short strokes",
      drill: "Catch-Up Drill",
      logic: "Builds stroke length and removes dead spots in the cycle.",
      tags: ["timing"],
    },
    {
      problem: "Weak pull or slipping water",
      drill: "Fist Drill / Paddle Hands",
      logic: "Increases awareness of the forearm surface used to hold water.",
      tags: ["catch", "elbow"],
    },
    {
      problem: "Linear or straight underwater pull",
      drill: "S-Pull / Under Body Pull",
      logic: "Teaches the curved pull path and leverage for propulsion.",
      tags: ["centerline", "underwater-drive"],
    },
  ],
  drills: [
    { name: "Streamline Kick", description: "Extended layout with arms beyond head.", purpose: "Core-driven flutter kick stability." },
    { name: "Side Glide Kick", description: "Leading arm forward, trailing arm on leg, face to side.", purpose: "Head position and breathing alignment." },
    { name: "10 Kick", description: "10 kicks side glide, switch through front glide, repeat.", purpose: "Transition control and rotational stability." },
    { name: "Finger Drag", description: "Thumbs drag along body, fingertips along surface during recovery.", purpose: "High-elbow recovery mechanics." },
    { name: "Catch-Up Drill", description: "Lead arm waits until recovering arm catches up.", purpose: "Stroke length and pull completion." },
    { name: "Fist Drill", description: "Closed fists then open hands.", purpose: "Feel forearm surface area." },
    { name: "S-Pull", description: "Curved underwater path under body.", purpose: "Bent-arm pull leverage." },
  ],
  scoring: SCORING,
};

const BACKSTROKE: StrokeKnowledgeBase = {
  identifier: "STROKE_ANALYSIS_CURRICULUM_V1:BACKSTROKE",
  stroke: "Backstroke",
  displayName: "Backstroke",
  phases: [
    {
      id: "beginner",
      label: "Beginner",
      levels: "Ultra 1-3",
      objective: "Establish body extension, steady head, and relaxed surface kick.",
      rubric: [
        { skill: "Body Extension", weight: 30, cue: "Long body with steady head position." },
        { skill: "Kick", weight: 30, cue: "Continuous relaxed kick from the hip." },
        { skill: "Arm Recovery", weight: 20, cue: "Controlled recovery above shoulder line." },
        { skill: "Knee Extension", weight: 20, cue: "Flatter knee extension and surface kick." },
      ],
    },
    {
      id: "intermediate",
      label: "Intermediate",
      levels: "Ultra 4-6",
      objective: "Develop shoulder-driven entry and underwater S-shape propulsion.",
      rubric: [
        { skill: "Hand Entry", weight: 30, cue: "Entry beyond shoulder." },
        { skill: "Arm Recovery", weight: 25, cue: "Controlled alternating recovery." },
        { skill: "Underwater Drive", weight: 25, cue: "S-shape drive past hips." },
        { skill: "Breathing", weight: 20, cue: "Normal relaxed breathing pattern." },
      ],
    },
    {
      id: "advanced",
      label: "Advanced",
      levels: "Ultra 7-9",
      objective: "Coordinate 11-and-1 entry, body roll timing, and continuous core kick.",
      rubric: [
        { skill: "Entry Angle", weight: 30, cue: "11 and 1 o'clock hand entry." },
        { skill: "Roll Timing", weight: 30, cue: "Body roll coordinates with recovery." },
        { skill: "Bent Arm Drive", weight: 20, cue: "Sustained underwater bent-arm S-drive." },
        { skill: "Core Kick", weight: 20, cue: "Stable continuous kick." },
      ],
    },
  ],
  flawCorrections: [
    {
      problem: "Knee break or kicking from the knees",
      drill: "Streamline Kick",
      logic: "Forces a straighter flutter kick from the hip with relaxed ankles.",
      tags: ["kick", "body-line"],
    },
    {
      problem: "Flat body position and lack of shoulder rotation",
      drill: "Smiley Faces / Rollover Drill",
      logic: "Promotes shoulder roll on the longitudinal axis while the head stays still.",
      tags: ["rotation"],
    },
    {
      problem: "Incorrect vertical recovery position",
      drill: "Rollover Drill",
      logic: "Builds rotational balance before adding arm pull complexity.",
      tags: ["recovery"],
    },
    {
      problem: "Lack of underwater propulsion and poor arm catch",
      drill: "1-Arm Backstroke",
      logic: "Isolates catch, extension, and S-shape pull past the hips.",
      tags: ["catch", "underwater-drive"],
    },
    {
      problem: "Rushing recovery or crossing midline",
      drill: "Rotational Drill",
      logic: "Checks recovery at 90 degrees and aligns entry from the shoulder.",
      tags: ["centerline", "timing"],
    },
    {
      problem: "Poor continuous roll timing",
      drill: "6-Kick Switch",
      logic: "Breaks down body roll and gives time to stabilize before pull.",
      tags: ["timing", "rotation"],
    },
  ],
  drills: [
    { name: "Streamline Kick", description: "Back layout, arms extended, steady head.", purpose: "Streamlined backstroke kick." },
    { name: "Smiley Faces", description: "Rotate shoulders enough to see the shoulder cue.", purpose: "Shoulder roll awareness." },
    { name: "Rollover Drill", description: "Legs-only back crawl rolling side to side.", purpose: "Rotational balance." },
    { name: "1-Arm Backstroke", description: "One arm strokes while the other stays extended.", purpose: "Isolate entry, catch, and drive." },
    { name: "Shoulder Sweep", description: "Recovery sweeps cheek or ear.", purpose: "Shoulder mobility and length." },
    { name: "Sail Boat", description: "Freeze recovery arm for at least 3 seconds.", purpose: "Arm and core strength." },
    { name: "6-Kick Switch", description: "Six kicks on side, then switch.", purpose: "Continuous kick and smooth roll." },
  ],
  scoring: SCORING,
};

const BREASTSTROKE: StrokeKnowledgeBase = {
  identifier: "STROKE_ANALYSIS_CURRICULUM_V1:BREASTSTROKE",
  stroke: "Breaststroke",
  displayName: "Breaststroke",
  phases: [
    {
      id: "beginner",
      label: "Beginner",
      levels: "Ultra 1-3",
      objective: "Build horizontal body position, basic whip kick, and breathing rhythm.",
      rubric: [
        { skill: "Body Position", weight: 35, cue: "Horizontal body and steady head." },
        { skill: "Leg Action", weight: 30, cue: "Heels lift, knees bend, kick finishes together." },
        { skill: "Arm Action", weight: 20, cue: "Basic extension and pull toward chest." },
        { skill: "Breathing", weight: 15, cue: "Coordinated exhalation and regular breath." },
      ],
    },
    {
      id: "intermediate",
      label: "Intermediate",
      levels: "Ultra 4-6",
      objective: "Coordinate whip kick, underwater arm recovery, and pull-breathe-glide sequence.",
      rubric: [
        { skill: "Body Position", weight: 30, cue: "Horizontal body with steady head." },
        { skill: "Whip Kick", weight: 30, cue: "Feet wider than knees with simultaneous action." },
        { skill: "Arm Recovery", weight: 20, cue: "Elbows remain below surface." },
        { skill: "Sequence", weight: 20, cue: "Pull, breathe, kick, glide." },
      ],
    },
    {
      id: "advanced",
      label: "Advanced",
      levels: "Ultra 7-9",
      objective: "Refine pull-breathe-kick-stretch precision and efficient glide.",
      rubric: [
        { skill: "Advanced Body Position", weight: 25, cue: "Look forward only during breath phase." },
        { skill: "Symmetric Kick", weight: 30, cue: "Simultaneous whip kick, feet wider than knees." },
        { skill: "Arm Drive", weight: 25, cue: "Elbows higher than hands through drive." },
        { skill: "Sequence Precision", weight: 20, cue: "Pull-breathe-kick-stretch and glide." },
      ],
    },
  ],
  flawCorrections: [
    {
      problem: "Sinking hips and incorrect body alignment",
      drill: "Super Glides",
      logic: "Forces full streamline extension and hips to the surface.",
      tags: ["body-line", "breathing"],
    },
    {
      problem: "Narrow or incomplete kick action",
      drill: "Heel Clickers",
      logic: "Encourages the legs to finish together for an efficient whip kick.",
      tags: ["kick"],
    },
    {
      problem: "Incorrect hand placement or pulling too wide",
      drill: "Diamond / Valentine Drill",
      logic: "Reinforces hands drawing to chest and chin before extension.",
      tags: ["centerline", "recovery"],
    },
    {
      problem: "Asymmetrical or incomplete leg action",
      drill: "2 Kicks - 1 Pull",
      logic: "Isolates the whip kick while maintaining streamline balance.",
      tags: ["kick", "timing"],
    },
    {
      problem: "Dropping elbows during recovery",
      drill: "Diamond / Valentine Drill",
      logic: "Keeps elbows aligned with shoulders and under the surface.",
      tags: ["elbow", "recovery"],
    },
    {
      problem: "Incorrect breathing and pull sequence",
      drill: "2 Kicks - 1 Pull",
      logic: "Balances pull-breathe-kick sequence with body position.",
      tags: ["breathing", "timing"],
    },
  ],
  drills: [
    { name: "Super Glides", description: "Hold full Superman extension until legs finish.", purpose: "Full body extension and glide." },
    { name: "Heel Clickers", description: "Kick legs together until heels touch.", purpose: "Complete whip kick finish." },
    { name: "Diamond / Valentine Drill", description: "Trace diamond or heart path with hands.", purpose: "Correct palm turn and arm path." },
    { name: "2 Kicks - 1 Pull", description: "One breaststroke plus one extra whip kick.", purpose: "Kick strength and sequence timing." },
  ],
  scoring: SCORING,
};

const KNOWLEDGE_BASES: Record<ManualStroke, StrokeKnowledgeBase> = {
  Freestyle: FRONT_CRAWL,
  Backstroke: BACKSTROKE,
  Breaststroke: BREASTSTROKE,
};

function strokeFromLabel(value: string): ManualStroke | null {
  if (value === "Freestyle" || value === "Front Crawl") return "Freestyle";
  if (value === "Backstroke" || value === "Backcrawl") return "Backstroke";
  if (value === "Breaststroke") return "Breaststroke";
  return null;
}

function selectKnowledgeBase(input: ManualCoachInput): StrokeKnowledgeBase {
  const focusStroke = input.strokeFocus === "Auto" ? null : strokeFromLabel(input.strokeFocus);
  const detectedStroke = strokeFromLabel(input.stroke);
  return KNOWLEDGE_BASES[focusStroke ?? detectedStroke ?? "Freestyle"];
}

function findCorrection(kb: StrokeKnowledgeBase, tag: string): FlawCorrection {
  return kb.flawCorrections.find((item) => item.tags.includes(tag)) ?? kb.flawCorrections[0];
}

function findScore(kb: StrokeKnowledgeBase, score: ScoreCriterion["score"]): ScoreCriterion {
  return kb.scoring.find((item) => item.score === score) ?? kb.scoring[0];
}

function estimatePhase(input: ManualCoachInput, kb: StrokeKnowledgeBase): ManualPhase {
  const [beginner, intermediate, advanced] = kb.phases;

  if (
    input.trackingQuality < 0.55 ||
    input.confidence < 0.48 ||
    !input.completeArmChain
  ) {
    return beginner;
  }

  if (
    input.trackingQuality >= 0.72 &&
    input.confidence >= 0.62 &&
    input.lockState === "locked" &&
    (input.anyEvf || kb.stroke !== "Freestyle")
  ) {
    return advanced;
  }

  return intermediate;
}

function numericStyleScore(input: ManualCoachInput): number {
  return (
    1.1 +
    input.trackingQuality * 1.25 +
    input.confidence * 1.05 +
    (input.completeArmChain ? 0.55 : 0) +
    (input.anyEvf ? 0.65 : 0) +
    input.bestEvfConfidence * 0.45 +
    (input.lockState === "locked" ? 0.45 : 0) +
    (input.catchPhaseActive && !input.anyEvf ? -0.45 : 0) +
    (input.edgeLandmarks > 1 ? -0.45 : 0)
  );
}

function estimateScore(input: ManualCoachInput, kb: StrokeKnowledgeBase): ScoreCriterion {
  return findScore(
    kb,
    Math.max(1, Math.min(5, Math.round(numericStyleScore(input)))) as ScoreCriterion["score"]
  );
}

function hasFeedback(input: ManualCoachInput, id: string): boolean {
  return input.feedbackIds.includes(id);
}

function coachConfidence(input: ManualCoachInput, kb: StrokeKnowledgeBase): number {
  const strokeAligned =
    kb.stroke === strokeFromLabel(input.stroke) || kb.stroke === strokeFromLabel(input.strokeFocus);
  const confidence =
    input.trackingQuality * 48 +
    input.confidence * 28 +
    (input.completeArmChain ? 12 : 0) +
    (strokeAligned ? 8 : 0) -
    (input.edgeLandmarks >= 2 ? 12 : 0);

  return Math.max(22, Math.min(96, Math.round(confidence)));
}

function rateRubricSkill(
  input: ManualCoachInput,
  skill: string,
  kb: StrokeKnowledgeBase
): Pick<RubricRating, "score" | "reason"> {
  const lower = skill.toLowerCase();
  let value = numericStyleScore(input);
  let reason = "General style evidence from pose quality, stroke lock, and arm-chain visibility.";

  if (lower.includes("kick") || lower.includes("leg") || lower.includes("knee")) {
    value =
      1 +
      input.trackingQuality * 2.35 +
      input.confidence * 0.55 +
      (input.lockState === "locked" ? 0.55 : 0) +
      (kb.stroke === "Breaststroke" ? 0.25 : 0.1) -
      (input.edgeLandmarks > 0 ? 0.35 : 0);
    reason =
      "Kick is inferred from body stability and stroke type because lower-body landmarks are often partially submerged.";
  } else if (lower.includes("body") || lower.includes("extension")) {
    value =
      1 +
      input.trackingQuality * 3.15 +
      input.confidence * 0.35 +
      (input.edgeLandmarks === 0 ? 0.65 : -0.7);
    reason =
      input.edgeLandmarks > 0
        ? "Body line is hard to trust because landmarks are near the frame edge."
        : "Body line is readable and centered enough for scoring.";
  } else if (
    lower.includes("catch") ||
    lower.includes("drive") ||
    lower.includes("strength") ||
    lower.includes("arm") ||
    lower.includes("recovery")
  ) {
    value =
      1 +
      input.confidence * 1.25 +
      (input.completeArmChain ? 1.15 : 0) +
      (input.anyEvf ? 1.15 : 0) +
      input.bestEvfConfidence * 0.65 +
      (input.lockState === "locked" ? 0.4 : 0);
    reason = input.anyEvf
      ? "Arm chain and EVF/catch evidence support a stronger arm-drive rating."
      : "Arm rating is limited because catch pressure or full arm chain is not consistent.";
  } else if (lower.includes("entry") || lower.includes("path") || lower.includes("angle")) {
    value =
      1 +
      input.trackingQuality * 0.8 +
      input.confidence * 1.2 +
      (input.completeArmChain ? 0.9 : 0) +
      (hasFeedback(input, "left-cross") || hasFeedback(input, "right-cross") ? -0.45 : 0.85) +
      (input.lockState === "locked" ? 0.35 : 0);
    reason = "Entry/path rating combines arm-chain visibility, style lock, and centerline feedback.";
  } else if (lower.includes("roll") || lower.includes("rotation")) {
    value =
      1 +
      input.trackingQuality * 1.6 +
      input.confidence * 0.65 +
      (input.shoulderSlopeDegrees > 8 && input.shoulderSlopeDegrees < 32 ? 1.2 : 0.4) +
      (input.shoulderView === "side" || input.shoulderView === "top-side" ? 0.5 : 0) +
      (input.lockState === "locked" ? 0.3 : 0);
    reason = "Rotation is inferred from shoulder view and shoulder-line behavior.";
  } else if (lower.includes("breath")) {
    value =
      1 +
      input.trackingQuality * 1.7 +
      input.confidence * 0.7 +
      (hasFeedback(input, "shoulder-tilt") ? -0.45 : 0.55) +
      (input.edgeLandmarks === 0 ? 0.35 : 0) +
      (input.lockState === "locked" ? 0.35 : 0);
    reason = "Breathing is inferred from head/shoulder stability and whether body line stays readable.";
  } else if (lower.includes("timing") || lower.includes("sequence")) {
    value =
      1 +
      input.confidence * 2.1 +
      input.trackingQuality * 0.75 +
      (input.lockState === "locked" ? 1 : 0) +
      (input.lockState === "acquiring" ? -0.2 : 0);
    reason = "Timing is inferred from style lock stability and repeated stroke evidence.";
  }

  return {
    score: Math.max(1, Math.min(5, Math.round(value))) as ScoreCriterion["score"],
    reason,
  };
}

function buildRubric(input: ManualCoachInput, phase: ManualPhase, kb: StrokeKnowledgeBase): RubricRating[] {
  return phase.rubric.map((item) => ({
    ...item,
    ...rateRubricSkill(input, item.skill, kb),
  }));
}

function commentFromCorrection(
  id: string,
  tone: ManualCoachTone,
  correction: FlawCorrection,
  comment: string,
  evidence: string,
  immediateCue: string,
  source: string
): ManualCoachComment {
  return {
    id,
    tone,
    title: correction.problem,
    comment,
    evidence,
    immediateCue,
    drill: correction.drill,
    source,
  };
}

function firstActionableComment(comments: ManualCoachComment[]): ManualCoachComment {
  return (
    comments.find((comment) => comment.tone === "critical") ??
    comments.find((comment) => comment.tone === "warning") ??
    comments[0]
  );
}

function inferPrimaryFocus(comment: ManualCoachComment, phase: ManualPhase): string {
  if (comment.id.includes("catch") || comment.id.includes("elbow")) return "Catch / Arm Drive";
  if (comment.id.includes("rotation")) return "Body Roll";
  if (comment.id.includes("centerline")) return "Entry Path";
  if (comment.id.includes("timing") || comment.id.includes("sequence")) return "Timing";
  if (comment.id.includes("kick")) return "Kick Mechanics";
  if (comment.id.includes("camera")) return "Readable Body Line";
  return phase.rubric[0].skill;
}

function inferCause(
  input: ManualCoachInput,
  kb: StrokeKnowledgeBase,
  phase: ManualPhase,
  comment: ManualCoachComment
): string {
  if (input.trackingQuality < 0.45) {
    return "The phone read is too weak to separate technique from camera placement. Fix the view first.";
  }
  if (comment.id.includes("catch") || comment.id.includes("elbow")) {
    return kb.stroke === "Breaststroke"
      ? "The arm path is not holding the manual's elbows-above-hands drive long enough before extension."
      : "The arm enters the propulsive window, but the forearm/catch shape is not holding water consistently.";
  }
  if (comment.id.includes("rotation")) {
    return "The shoulder line suggests the stroke is arm-led instead of rotation-led.";
  }
  if (comment.id.includes("centerline")) {
    return "The entry or pull is narrowing toward the midline, which can shorten leverage and increase drag.";
  }
  if (comment.id.includes("timing") || comment.id.includes("sequence")) {
    return "The stroke rhythm is not repeating cleanly enough for a stable style lock.";
  }
  if (comment.id.includes("kick")) {
    return "Body stability suggests the kick is not supporting the stroke phase strongly enough.";
  }
  if (input.anyEvf) {
    return "The catch shape is readable; the next goal is holding it under more speed or fatigue.";
  }
  return `The ${kb.displayName} manual points to ${phaseLabel(phase)} fundamentals as the current limiter.`;
}

function phaseLabel(phase: ManualPhase): string {
  return `${phase.label} ${phase.levels}`;
}

function buildNextSet(
  input: ManualCoachInput,
  kb: StrokeKnowledgeBase,
  phase: ManualPhase,
  comment: ManualCoachComment
): ManualCoachSet {
  if (input.trackingQuality < 0.45) {
    return {
      title: "Reset The Read",
      reps: "2 x 15 seconds",
      instruction: "Hold an easy drill position while the camera sees one full arm chain.",
      successMetric: "Tracking quality above 60 percent before scoring technique.",
    };
  }

  if (kb.stroke === "Breaststroke") {
    if (comment.id.includes("kick")) {
      return {
        title: "Whip Kick Isolation",
        reps: "4 x 15m",
        instruction: "Use Heel Clickers, then swim breaststroke with heels finishing together.",
        successMetric: "Kick finishes symmetrically without hips dropping.",
      };
    }
    if (comment.id.includes("sequence") || comment.id.includes("timing")) {
      return {
        title: "Sequence Reset",
        reps: "4 x 25",
        instruction: "Use 2 Kicks - 1 Pull and say pull, breathe, kick, stretch.",
        successMetric: "The glide stays long without stopping completely.",
      };
    }
    return {
      title: "Glide And Shape",
      reps: "4 x 25",
      instruction: "Use Super Glides into Diamond / Valentine Drill, then swim easy breaststroke.",
      successMetric: "Hands recover cleanly and body returns to streamline each cycle.",
    };
  }

  if (kb.stroke === "Backstroke") {
    if (comment.id.includes("rotation")) {
      return {
        title: "Roll Timing",
        reps: "4 x 25",
        instruction: "Use 6-Kick Switch or Rollover Drill, keeping the head still.",
        successMetric: "Shoulder roll appears without the recovery rushing across midline.",
      };
    }
    if (comment.id.includes("catch")) {
      return {
        title: "Backstroke Catch",
        reps: "4 x 25",
        instruction: "Use 1-Arm Backstroke and finish the S-shape pull past the hip.",
        successMetric: "The stroke stays long and the pull does not slip.",
      };
    }
    return {
      title: "Backstroke Line",
      reps: "4 x 25",
      instruction: "Use Streamline Kick, then swim backstroke with steady head and continuous kick.",
      successMetric: "Body stays long with no knee-break feedback.",
    };
  }

  if (comment.id.includes("catch") || comment.id.includes("elbow")) {
    return {
      title: "Feel Then Swim",
      reps: "4 x 25",
      instruction: "Alternate 12.5m Fist Drill with 12.5m front crawl, holding high elbow before power.",
      successMetric: "EVF appears during the catch without rushing the stroke.",
    };
  }

  if (comment.id.includes("rotation")) {
    return {
      title: "Rotation Builder",
      reps: "4 x 25",
      instruction: "Use 10 Kick into front crawl. Rotate from hip and shoulder before breathing.",
      successMetric: "Shoulder roll becomes visible without lifting the head.",
    };
  }

  if (comment.id.includes("centerline")) {
    return {
      title: "Entry Width Control",
      reps: "4 x 25",
      instruction: "Enter just outside the shoulder, then shape the pull under the body.",
      successMetric: "No centerline-cross feedback for two consecutive lengths.",
    };
  }

  return {
    title: phase.id === "advanced" ? "Power Hold" : "Phase Builder",
    reps: phase.id === "beginner" ? "4 x 15m" : "4 x 25",
    instruction:
      phase.id === "beginner"
        ? "Use Streamline Kick, then swim easy front crawl without lifting the head."
        : "Use Finger Drag into full stroke, keeping high-elbow recovery and continuous timing.",
    successMetric:
      phase.id === "beginner"
        ? "Body line stays horizontal with relaxed flutter kick."
        : "Recovery clears the water without straight-arm windmill motion.",
  };
}

function buildComments(input: ManualCoachInput, kb: StrokeKnowledgeBase): ManualCoachComment[] {
  const comments: ManualCoachComment[] = [];
  const source = kb.identifier;

  if (input.trackingQuality < 0.45 || input.edgeLandmarks >= 2) {
    const correction = findCorrection(kb, "body-line");
    comments.push({
      id: "camera-body-line",
      tone: "warning",
      title: "Phone-safe read",
      comment: "Detection is limited. Re-center the swimmer before trusting the style rating.",
      evidence:
        input.edgeLandmarks >= 2
          ? "Multiple landmarks are close to the frame edge."
          : "Tracking quality is below the coaching threshold.",
      immediateCue: "Move the phone back or re-center the lane.",
      drill: correction.drill,
      source,
    });
  }

  if (input.catchPhaseActive && !input.anyEvf) {
    const correction = findCorrection(kb, "catch");
    comments.push(
      commentFromCorrection(
        "weak-catch",
        "critical",
        correction,
        "The propulsive phase is active, but the catch shape is not holding pressure.",
        "Catch phase is visible, but EVF/catch evidence is weak.",
        kb.stroke === "Breaststroke"
          ? "Keep elbows high as hands sweep in."
          : "Tip fingertips down before applying power.",
        source
      )
    );
  }

  if (hasFeedback(input, "left-dropped-elbow") || hasFeedback(input, "right-dropped-elbow")) {
    const correction = findCorrection(kb, "elbow");
    comments.push(
      commentFromCorrection(
        "dropped-elbow",
        "critical",
        correction,
        "Dropped elbow mechanics are reducing leverage in the pull.",
        "The live flaw detector flagged dropped-elbow mechanics.",
        "Hold elbow height before the push.",
        source
      )
    );
  }

  if (
    hasFeedback(input, "shoulder-tilt") ||
    input.shoulderSlopeDegrees > 18 ||
    input.shoulderView === "side"
  ) {
    const correction = findCorrection(kb, "rotation");
    comments.push(
      commentFromCorrection(
        "rotation",
        "warning",
        correction,
        "The stroke needs cleaner body roll or shoulder-hip connection.",
        `Shoulder view is ${input.shoulderView} with ${Math.round(
          input.shoulderSlopeDegrees
        )} degree slope.`,
        kb.stroke === "Breaststroke"
          ? "Return to streamline before the next pull."
          : "Rotate from the body before forcing the arm path.",
        source
      )
    );
  }

  if (hasFeedback(input, "left-cross") || hasFeedback(input, "right-cross")) {
    const correction = findCorrection(kb, "centerline");
    comments.push(
      commentFromCorrection(
        "centerline-cross",
        "warning",
        correction,
        "The entry or pull path is narrowing across the body line.",
        "The front-view hand path crossed the body center.",
        kb.stroke === "Backstroke" ? "Aim entry to 11 and 1." : "Enter wider, then pull under the body.",
        source
      )
    );
  }

  if (input.lockState === "acquiring" || input.confidence < 0.52) {
    const correction = findCorrection(kb, "timing");
    comments.push(
      commentFromCorrection(
        "timing",
        "warning",
        correction,
        "The stroke rhythm is not repeating cleanly yet.",
        `Style lock is ${input.lockState} at ${Math.round(input.confidence * 100)} percent confidence.`,
        kb.stroke === "Breaststroke"
          ? "Say pull, breathe, kick, stretch."
          : "Keep the arms moving without dead spots.",
        source
      )
    );
  }

  if (input.anyEvf && comments.length === 0) {
    const correction = findCorrection(kb, "catch");
    comments.push({
      id: "strong-catch",
      tone: "good",
      title: correction.problem,
      comment: "The catch is readable. Move from correction into repeatability.",
      evidence: `Catch confidence is ${Math.round(input.bestEvfConfidence * 100)} percent.`,
      immediateCue: "Hold the catch shape as speed increases.",
      drill: correction.drill,
      source,
    });
  }

  if (comments.length === 0) {
    const correction = findCorrection(kb, "body-line");
    comments.push({
      id: "steady-style",
      tone: "good",
      title: "Stable style read",
      comment: "The live evidence is clean enough to work the next phase goal.",
      evidence: "Pose quality, style lock, and arm-chain visibility are usable.",
      immediateCue: "Keep the body line long and repeat the same rhythm.",
      drill: correction.drill,
      source,
    });
  }

  return comments.filter(
    (comment, index, all) => all.findIndex((item) => item.id === comment.id) === index
  );
}

export function evaluateSwimStyleCoach(input: ManualCoachInput): ManualCoachResult {
  const kb = selectKnowledgeBase(input);
  const phase = estimatePhase(input, kb);
  const estimatedScore = estimateScore(input, kb);
  const rubric = buildRubric(input, phase, kb);
  const comments = buildComments(input, kb).slice(0, 3);
  const first = firstActionableComment(comments);
  const nextSet = buildNextSet(input, kb, phase, first);

  return {
    model: "stroke-manual-reasoner-v3",
    stroke: kb.stroke,
    strokeLabel: kb.displayName,
    phase,
    estimatedScore,
    confidence: coachConfidence(input, kb),
    primaryFocus: inferPrimaryFocus(first, phase),
    inferredCause: inferCause(input, kb, phase, first),
    nextSet,
    rubric,
    comments,
    voiceLine: first.drill
      ? `${first.title}. ${first.immediateCue ?? first.comment} Try ${first.drill}.`
      : `${first.title}. ${first.immediateCue ?? first.comment}`,
  };
}

export function evaluateFrontCrawlCoach(input: ManualCoachInput): ManualCoachResult {
  return evaluateSwimStyleCoach({ ...input, strokeFocus: "Freestyle" });
}
