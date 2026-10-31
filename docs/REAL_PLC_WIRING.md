# Real PLC wiring (from dashboard / DB)

1. Run diagnostics and confirm simulator works.
2. Create a new PLC connection (host, port, unit id) — disable `demo-simulator` or set `enabled=false`.
3. Align register maps with the plant Modbus map (addresses for hoist, deadman, e-stop, heartbeat, safe-state).
4. Bind cells (3 addresses: primary / feedback / status) and overlays.
5. On a maintenance window: force deadman expire, kill network briefly, confirm safe-state register write and motion coils clear.
6. Update `CAMERA_RTSP_URL` if using plant CCTV instead of device camera.
7. Train operators with `TRAINING.md`.

Software supervision is not a substitute for hardwired e-stop.
