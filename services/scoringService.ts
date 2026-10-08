import { Participant } from '../types';

export const BASE_CORRECT_POINTS = 100000;
export const MAX_SPEED_BONUS = 500;

/**
 * Calculates score for a question:
 * - Each correct answer earns 100,000 base points.
 * - Faster response earns up to 500 bonus points based on speed.
 * - This mathematically guarantees that any participant with N correct answers
 *   ALWAYS scores higher than any participant with N - 1 correct answers,
 *   fulfilling the rule: priority to maximum correct answers first, speed as tie-breaker.
 */
export function calculateRoundPoints(isCorrect: boolean, timeTaken: number, timeLimit: number): number {
  if (!isCorrect) return 0;
  const safeTimeLimit = Math.max(1, timeLimit);
  const safeTimeTaken = Math.max(0, Math.min(safeTimeLimit, timeTaken));
  const speedRatio = Math.max(0, Math.min(1, 1 - (safeTimeTaken / safeTimeLimit)));
  const speedBonus = Math.round(MAX_SPEED_BONUS * speedRatio);
  return BASE_CORRECT_POINTS + speedBonus;
}

export function getCorrectAnswerCount(score: number): number {
  if (score <= 0) return 0;
  return Math.floor(score / BASE_CORRECT_POINTS);
}

export function getSpeedBonusTotal(score: number): number {
  if (score <= 0) return 0;
  return score % BASE_CORRECT_POINTS;
}

/**
 * Sorts participants:
 * 1. Maximum correct answers first (highest priority)
 * 2. If same correct answers: fastest speed (least total time taken, or higher speed bonus)
 */
export function sortLeaderboard(participants: Participant[]): Participant[] {
  return [...participants].sort((a, b) => {
    const correctA = getCorrectAnswerCount(a.score);
    const correctB = getCorrectAnswerCount(b.score);

    if (correctB !== correctA) {
      return correctB - correctA; // Most correct answers first
    }

    // Tie-breaker 1: Total time taken if available (lower time = faster)
    if (a.totalTimeTaken > 0 && b.totalTimeTaken > 0 && Math.abs(a.totalTimeTaken - b.totalTimeTaken) > 0.05) {
      return a.totalTimeTaken - b.totalTimeTaken;
    }

    // Tie-breaker 2: Speed bonus portion of score
    const bonusA = getSpeedBonusTotal(a.score);
    const bonusB = getSpeedBonusTotal(b.score);
    if (bonusB !== bonusA) {
      return bonusB - bonusA;
    }

    // Tie-breaker 3: Overall raw score
    return b.score - a.score;
  });
}

/**
 * Returns a human-friendly score breakdown for UI display.
 */
export function formatScoreSummary(score: number, totalQuestions?: number) {
  const correct = getCorrectAnswerCount(score);
  const speedBonus = getSpeedBonusTotal(score);
  const totalStr = totalQuestions ? ` / ${totalQuestions}` : '';

  return {
    correct,
    speedBonus,
    label: `${correct}${totalStr} Correct`,
    compactPoints: `${correct * 1000 + speedBonus} pts`,
    fullPoints: score
  };
}
