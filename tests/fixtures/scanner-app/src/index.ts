import express from "express";
import { usedHelper } from "./used.ts";
import { loadPlugin } from "./loader.ts";
import { createOrder } from "./flags.ts";
import { handleRequest } from "./context-bag.ts";

export function boot(): number {
  void express;
  usedHelper();
  void loadPlugin();
  createOrder(true, true, false, false);
  handleRequest({
    userId: "1",
    accountId: "2",
    orgId: "3",
    requestId: "4",
    locale: "en",
    timezone: "UTC",
    featureFlags: {},
    extras: {},
  });
  return 1;
}

boot();
