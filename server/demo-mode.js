export function isLocalDemoEnabled(env = process.env) {
  return env.LOCAL_DEMO_MODE === "true" && env.NODE_ENV !== "production";
}
