"use client";
import { createContext, useContext } from 'react';
export const WorkpadSessions=createContext<{
  register:(id:string,flush:()=>Promise<void>,protectedDraft?:()=>boolean)=>()=>void;
  flush:()=>Promise<void>;
  flushOne:(id:string)=>Promise<void>;
  protectedDraft:(id:string)=>boolean;
}|null>(null);
export const useWorkpadSessions=()=>useContext(WorkpadSessions);
