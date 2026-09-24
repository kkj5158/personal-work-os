"use client";
import { createContext, useContext } from 'react';

export type DockMode = 'routine' | 'shortcuts' | 'linked';
export type WorkpadDockNavigation = {
  openNote: (id: string, promote?: boolean) => Promise<void>;
};

export const WorkpadDock = createContext<WorkpadDockNavigation | null>(null);
export const useWorkpadDock = () => useContext(WorkpadDock);
