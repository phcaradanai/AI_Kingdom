import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSceneMotion } from "@/components/kingdom/kingdomMotion";
import type { AgentPresenceDto } from "@/types/api";

export const KINGDOM_MOTION_INTERVAL_MS = 5_200;
export const KINGDOM_TRAVEL_WINDOW_MS = 2_100;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}

export function useKingdomMotion(agents: AgentPresenceDto[]) {
  const [cycle, setCycle] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const reducedMotion = useReducedMotion();
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousStateSignature = useRef<string | null>(null);

  const beginMove = useCallback(() => {
    if (reducedMotion) return;
    setIsMoving(true);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => setIsMoving(false), KINGDOM_TRAVEL_WINDOW_MS);
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion || agents.length === 0) return;
    const interval = setInterval(() => {
      beginMove();
      setCycle((current) => current + 1);
    }, KINGDOM_MOTION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [agents.length, beginMove, reducedMotion]);

  const stateSignature = agents.map((agent) => `${agent.id}:${agent.state}`).join("|");
  useEffect(() => {
    if (previousStateSignature.current === null) {
      previousStateSignature.current = stateSignature;
      return;
    }
    if (previousStateSignature.current !== stateSignature) {
      previousStateSignature.current = stateSignature;
      beginMove();
      setCycle((current) => current + 1);
    }
  }, [beginMove, stateSignature]);

  useEffect(() => () => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
  }, []);

  return {
    characters: useMemo(() => buildSceneMotion(agents, cycle), [agents, cycle]),
    isMoving: isMoving && !reducedMotion,
    reducedMotion
  };
}
