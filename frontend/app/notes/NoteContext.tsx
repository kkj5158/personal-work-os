"use client";
import { createContext, useContext } from "react";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/notes/types";
export type NoteEnvironment = {
  workspace: string;
  settings: Settings;
  openWiki: (title: string) => void;
  error: (error: unknown) => void;
  register: (
    id: string,
    flush: () => Promise<void>,
    dirty: () => boolean,
  ) => () => void;
  changed: () => void;
};
export const NoteContext = createContext<NoteEnvironment>({
  workspace: "",
  settings: DEFAULT_SETTINGS,
  openWiki: () => {},
  error: () => {},
  register: () => () => {},
  changed: () => {},
});
export const useNoteEnvironment = () => useContext(NoteContext);
