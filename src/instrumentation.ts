export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
  const { startBackgroundJobs } = await import("./server/runtime.ts");
  startBackgroundJobs();
}
