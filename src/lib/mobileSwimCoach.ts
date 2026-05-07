export type ManualCoachTone = "good" | "warning" | "critical";

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

export interface ManualCoachComment {
  id: string;
  tone: ManualCoachTone;
  title: string;
  comment: string;
  drill?: string;
  source: string;
}

export interface ManualCoachResult {
  model: "front-crawl-manual-rule-v1";
  phase: ManualPhase;
  estimatedScore: ScoreCriterion;
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

export const FRONT_CRAWL_KNOWLEDGE_BASE = {
  identifier: "STROKE_ANALYSIS_CURRICULUM_V1",
  stroke: "Front Crawl",
  phases: [
    {
      id: "beginner",
      label: "Beginner",
      levels: "Ultra 1-3",
      objective: "Foundational buoyancy and propulsive rhythm.",
      rubric: [
        {
          skill: "Body Position",
          weight: 30,
          cue: "Horizontal, face in water, streamlined.",
        },
        {
          skill: "Kicking",
          weight: 30,
          cue: "Originates from hip, slight knee bend, relaxed feet.",
        },
        {
          skill: "Arm Action",
          weight: 20,
          cue: "Controlled alternating recovery above surface.",
        },
        {
          skill: "Breathing",
          weight: 20,
          cue: "Basic side breathing, underwater exhalation.",
        },
      ],
    },
    {
      id: "intermediate",
      label: "Intermediate",
      levels: "Ultra 4-6",
      objective: "Recovery mechanics and bilateral timing.",
      rubric: [
        {
          skill: "Arm Entry",
          weight: 25,
          cue: "Hand entry beyond shoulder line.",
        },
        {
          skill: "Recovery Path",
          weight: 25,
          cue: "High-elbow, bent-arm, clear of surface.",
        },
        {
          skill: "Timing",
          weight: 25,
          cue: "Continuous movement, no dead spots.",
        },
        {
          skill: "Breathing",
          weight: 25,
          cue: "Regular bilateral pattern, mouth/nose inhalation.",
        },
      ],
    },
    {
      id: "advanced",
      label: "Advanced",
      levels: "Ultra 7-9",
      objective: "S-drive efficiency and propulsive power.",
      rubric: [
        {
          skill: "Underwater Drive",
          weight: 30,
          cue: "S-pull path finishing at thigh.",
        },
        {
          skill: "Body Roll",
          weight: 30,
          cue: "Hip-initiated rotation for drive and breath.",
        },
        {
          skill: "Catch Strength",
          weight: 20,
          cue: "High-elbow catch, powerful push phase.",
        },
        {
          skill: "Precision Breathing",
          weight: 20,
          cue: "Exhalation finishes at surface clearance.",
        },
      ],
    },
  ] satisfies ManualPhase[],
  flawCorrections: [
    {
      problem: "Sinking Hips or Legs",
      drill: "Prayer Swim or Shark Fin",
      logic: "Forces increased kick frequency and buoyancy awareness to maintain lift.",
    },
    {
      problem: "Lifting Head Vertical",
      drill: "Side Glide Kick",
      logic: "Realigns head on the longitudinal axis; teaches rotation instead of lifting.",
    },
    {
      problem: "Rigid Shoulders or Lack of Rotation",
      drill: "Smiley Faces or The Alternator",
      logic: "Forces shoulder roll visibility and independent shoulder-hip balance.",
    },
    {
      problem: "Straight-Arm or Windmill Recovery",
      drill: "Finger Drag",
      logic: "Bio-mechanical constraint that ensures a high-elbow, bent-arm recovery.",
    },
    {
      problem: "Choppy or Short Strokes",
      drill: "Catch-Up Drill",
      logic: "Enforces discipline in the pull-and-glide phase; builds stroke length.",
    },
    {
      problem: "Weak Pull or Slipping Water",
      drill: "Fist Drill or Paddle Hands",
      logic: "Increases proprioception of the forearm surface area in moving water.",
    },
    {
      problem: "Linear/Straight Underwater Pull",
      drill: "S-Pull or Under Body Pull",
      logic: "Optimizes the propulsive path and leverage for maximum displacement.",
    },
  ] satisfies FlawCorrection[],
  drills: [
    {
      name: "Streamline Kick",
      description: "Extended back layout, arms beyond head, hips just below surface.",
      purpose: "Focuses on core-driven flutter kick stability.",
    },
    {
      name: "Side Glide Kick",
      description: "Leading arm forward palm down, trailing arm on leg, face to side.",
      purpose: "Develops head position and breathing alignment.",
    },
    {
      name: "10 Kick",
      description: "10 kicks side glide, switch through front glide, 10 kicks other side.",
      purpose: "Practices transition control and rotational stability.",
    },
    {
      name: "Finger Drag",
      description: "Dragging thumbs along body and fingertips along surface during recovery.",
      purpose: "Corrects wide recovery and ensures high-elbow mechanics.",
    },
    {
      name: "Smiley Faces",
      description: "Drawing a face on the shoulder; rotating until face is visible during roll.",
      purpose: "Emphasizes importance of shoulder rolls.",
    },
    {
      name: "The Alternator",
      description: "25m single-arm swimming, non-active arm remains at the side.",
      purpose: "Forces the active shoulder to roll completely out of the water.",
    },
    {
      name: "6-Kick Zipper",
      description: "Thumb maintains contact with the body from thigh to armpit during recovery.",
      purpose: "Stressing high-elbow recovery and body contact.",
    },
    {
      name: "Catch-Up Drill",
      description: "Leading arm remains stationary until the recovering arm finishes its pull.",
      purpose: "Builds endurance and prevents stroke overlap/shortening.",
    },
    {
      name: "Fist Drill",
      description: "Swimming with closed fists to feel water resistance, then open hands.",
      purpose: "Highlights the surface area needed for a strong pull.",
    },
    {
      name: "S-Pull",
      description: "Reaching across to the opposite side during the pull to create a curve.",
      purpose: "Strengthens the bent-arm pull and maximizes underwater distance.",
    },
  ] satisfies DrillSpec[],
  scoring: [
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
  ] satisfies ScoreCriterion[],
} as const;

const MANUAL_SOURCE = FRONT_CRAWL_KNOWLEDGE_BASE.identifier;

function findCorrection(problem: string): FlawCorrection {
  const correction = FRONT_CRAWL_KNOWLEDGE_BASE.flawCorrections.find(
    (item) => item.problem === problem
  );

  if (!correction) {
    throw new Error(`Missing manual correction: ${problem}`);
  }

  return correction;
}

function findScore(score: ScoreCriterion["score"]): ScoreCriterion {
  return (
    FRONT_CRAWL_KNOWLEDGE_BASE.scoring.find((item) => item.score === score) ??
    FRONT_CRAWL_KNOWLEDGE_BASE.scoring[0]
  );
}

function estimatePhase(input: ManualCoachInput): ManualPhase {
  const [beginner, intermediate, advanced] = FRONT_CRAWL_KNOWLEDGE_BASE.phases;

  if (
    input.trackingQuality < 0.55 ||
    input.confidence < 0.48 ||
    !input.completeArmChain
  ) {
    return beginner;
  }

  if (
    input.anyEvf &&
    input.trackingQuality >= 0.72 &&
    input.confidence >= 0.62 &&
    input.lockState === "locked"
  ) {
    return advanced;
  }

  return intermediate;
}

function estimateScore(input: ManualCoachInput): ScoreCriterion {
  const score =
    input.trackingQuality * 1.45 +
    input.confidence * 1.05 +
    (input.completeArmChain ? 0.65 : 0) +
    (input.anyEvf ? 0.85 : 0) +
    input.bestEvfConfidence * 0.25 +
    (input.catchPhaseActive && !input.anyEvf ? -0.4 : 0) +
    (input.edgeLandmarks > 1 ? -0.25 : 0);

  return findScore(Math.max(1, Math.min(5, Math.round(score))) as ScoreCriterion["score"]);
}

function correctionComment(
  id: string,
  tone: ManualCoachTone,
  correction: FlawCorrection,
  comment: string
): ManualCoachComment {
  return {
    id,
    tone,
    title: correction.problem,
    comment,
    drill: correction.drill,
    source: MANUAL_SOURCE,
  };
}

function hasFeedback(input: ManualCoachInput, id: string): boolean {
  return input.feedbackIds.includes(id);
}

export function evaluateFrontCrawlCoach(
  input: ManualCoachInput
): ManualCoachResult {
  const phase = estimatePhase(input);
  const estimatedScore = estimateScore(input);
  const comments: ManualCoachComment[] = [];

  if (input.trackingQuality < 0.45 || input.edgeLandmarks >= 2) {
    const correction = findCorrection("Sinking Hips or Legs");
    comments.push({
      id: "camera-light-load",
      tone: "warning",
      title: "Phone-safe read",
      comment:
        "Detection is limited. Re-center the swimmer and keep one shoulder-elbow-wrist chain visible before judging technique.",
      drill: correction.drill,
      source: MANUAL_SOURCE,
    });
  }

  if (input.catchPhaseActive && !input.anyEvf) {
    const correction = findCorrection("Weak Pull or Slipping Water");
    comments.push(
      correctionComment(
        "weak-catch",
        "critical",
        correction,
        "The catch is active but EVF is not holding. Use the forearm as a bigger paddle before pushing back."
      )
    );
  }

  if (hasFeedback(input, "left-dropped-elbow") || hasFeedback(input, "right-dropped-elbow")) {
    const correction = findCorrection("Weak Pull or Slipping Water");
    comments.push(
      correctionComment(
        "dropped-elbow",
        "critical",
        correction,
        "Dropped elbow detected. Keep the elbow high and press the forearm down into the water."
      )
    );
  }

  if (
    hasFeedback(input, "shoulder-tilt") ||
    input.shoulderSlopeDegrees > 18 ||
    input.shoulderView === "side"
  ) {
    const correction = findCorrection("Rigid Shoulders or Lack of Rotation");
    comments.push(
      correctionComment(
        "rotation",
        "warning",
        correction,
        "Add visible shoulder roll instead of forcing the arm path flat."
      )
    );
  }

  if (hasFeedback(input, "left-cross") || hasFeedback(input, "right-cross")) {
    const correction = findCorrection("Linear/Straight Underwater Pull");
    comments.push(
      correctionComment(
        "centerline-cross",
        "warning",
        correction,
        "Hand path is crossing the centerline. Enter beyond the shoulder line, then shape the pull under the body."
      )
    );
  }

  if (input.lockState === "acquiring" || input.confidence < 0.52) {
    const correction = findCorrection("Choppy or Short Strokes");
    comments.push(
      correctionComment(
        "timing",
        "warning",
        correction,
        "Stroke timing is not stable yet. Keep the movement continuous and avoid dead spots."
      )
    );
  }

  if (input.anyEvf && comments.length === 0) {
    comments.push({
      id: "evf-hold",
      tone: "good",
      title: "Catch Strength",
      comment:
        "EVF is visible. Keep the high-elbow catch and finish the push phase toward the thigh.",
      drill: "Fist Drill",
      source: MANUAL_SOURCE,
    });
  }

  if (comments.length === 0) {
    comments.push({
      id: "steady-front-crawl",
      tone: "good",
      title: phase.rubric[0].skill,
      comment: `Work the ${phase.label.toLowerCase()} goal: ${phase.objective}`,
      drill: phase.id === "beginner" ? "Streamline Kick" : "Catch-Up Drill",
      source: MANUAL_SOURCE,
    });
  }

  const uniqueComments = comments.filter(
    (comment, index, all) => all.findIndex((item) => item.id === comment.id) === index
  );
  const topComments = uniqueComments.slice(0, 3);
  const first = topComments[0];

  return {
    model: "front-crawl-manual-rule-v1",
    phase,
    estimatedScore,
    comments: topComments,
    voiceLine: first.drill
      ? `${first.title}. ${first.comment} Try ${first.drill}.`
      : `${first.title}. ${first.comment}`,
  };
}
