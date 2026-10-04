"use client";
import { createContext, useContext } from "react";
import { canDeleteBusinessRecord } from "@/lib/document-access";
const RoleContext = createContext("viewer");
export function RecordPermissionsProvider({ role, children }: { role: string; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}
export function useRecordRole() { return useContext(RoleContext); }
export function useCanDeleteRecord() { return canDeleteBusinessRecord({ role: useRecordRole() }); }
