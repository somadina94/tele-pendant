/** Shown when the API cannot be reached. Software STOP cannot drive the PLC. */
export function HardwareStopNotice() {
  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 p-6">
      <button
        type="button"
        disabled
        className="h-16 rounded-md bg-red-700 text-lg font-bold text-white"
      >
        STOP
      </button>
      <p className="text-lg font-semibold">Use the hardware e-stop</p>
      <p className="text-muted-foreground">
        Software STOP cannot reach the PLC while the API is down.
      </p>
    </main>
  );
}
