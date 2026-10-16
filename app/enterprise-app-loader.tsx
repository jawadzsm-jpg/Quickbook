"use client";
import dynamic from "next/dynamic";

// The signed-in workspace is still server-rendered, but its code is a separate chunk: the sign-in and password-change
// pages no longer download the whole application.
export const EnterpriseAppLoader = dynamic(() => import("./enterprise-app"));
