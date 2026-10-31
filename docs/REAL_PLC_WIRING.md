# Switch from the fake crane to a real PLC

The fake crane is the **demo-simulator** row (host `modbus-sim` or `127.0.0.1`, port `1502`). The real crane is another row you save on **Config**. Same buttons either way.

1. Sign in as the admin user and open **Config** (http://localhost:8080/admin).
2. Under **Add a PLC**, type a label (for example `bay-a`), the PLC IP, port `502`, and the unit id from the PLC program. Leave **Use this PLC** checked. Click **Add PLC**.
3. **Success:** **Saved and connecting.** Open **Ops**. **PLC connected: true** and the new label. If the red text says the PLC did not connect, the IP or port is wrong and the fake crane is no longer the active row. Fix the host and click **Save** again.
4. On each **Register maps** row, type the address from the PLC program and click **Save**. The name stays (`coil.eStop`, `holding.hoistHeightMm`, and the rest). Only the number changes. **Success:** **Saved** plus that name.
5. The cells keep pointing at those names, so **Hoist Up** and **STOP** follow the numbers you saved.
6. Hold **Hoist Up** only when the real machine is allowed to move.
7. To test on the fake crane again, check **Use this PLC** on **demo-simulator** and click **Save**.

E-stop on the real crane clears when the safety PLC drops the coil (twist the mushroom out, then the machine reset). The Docker restart clears only the fake crane.

Software supervision is not a substitute for hardwired e-stop.
