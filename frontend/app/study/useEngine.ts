"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EngineAction, EngineStatus } from "@/lib/study/engine";
import type { StudyDataPort } from "@/lib/study/model";
export function useEngine(port: StudyDataPort) {
  const [status, setStatus] = useState<EngineStatus>(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [observedAt, setObservedAt] = useState(() => Date.now());
  const locked = useRef(false),
    sequence = useRef(0),
    alive = useRef(true);
  const refresh = useCallback(async () => {
    if (!port.engine) return;
    const request = ++sequence.current,
      next = await port.engine.status();
    if (alive.current && request === sequence.current) {
      setStatus(next);
      setObservedAt(Date.now());
    }
  }, [port]);
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const load = async () => {
      try {
        await refresh();
      } catch (e) {
        if (!stopped) setMessage(String(e));
      } finally {
        if (!stopped) timer = setTimeout(() => void load(), 5000);
      }
    };
    void load();
    return () => {
      stopped = true;
      alive.current = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  const action = async (action: EngineAction, data?: unknown) => {
    if (locked.current) throw new Error("진행 중인 요청을 기다려 주세요.");
    locked.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await port.engine!.action(action, data);
      await refresh();
      return result;
    } catch (e) {
      setMessage(String(e));
      throw e;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return {
    status,
    observedAt,
    message,
    setMessage,
    busy,
    refresh,
    action,
    blocked: busy || port.getSnapshot().connection?.state !== "ready",
  };
}
