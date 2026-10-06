/**
 * Kanál mezi okny prohlížeče: běžící test trenérské školy zavře skripta
 * otevřená v jiném tabu hned, ne až při další kontrole na serveru.
 */

export const COACH_EXAM_CHANNEL = "coach-exam";

export interface CoachExamMessage {
  type: "exam-running";
  courseId: string;
}

export function announceExamRunning(courseId: string): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(COACH_EXAM_CHANNEL);
  channel.postMessage({ type: "exam-running", courseId } satisfies CoachExamMessage);
  channel.close();
}
