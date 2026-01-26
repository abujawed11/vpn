import fs from "fs";
import { Client } from "ssh2";

export function loadPrivateKey() {
  const p = process.env.SSH_KEY_PATH;
  if (!p) throw new Error("SSH_KEY_PATH is not set");
  return fs.readFileSync(p, "utf8");
}

export function execSsh({ host, username, privateKey }, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          stream
            .on("close", (code) => {
              conn.end();
              if (code === 0) return resolve(stdout.trim());
              reject(new Error(`SSH failed (code=${code}): ${stderr || stdout}`));
            })
            .on("data", (d) => (stdout += d.toString()))
            .stderr.on("data", (d) => (stderr += d.toString()));
        });
      })
      .on("error", reject)
      // accept hostkey for now (later we can pin it)
      .connect({ host, username, privateKey, hostVerifier: () => true });
  });
}
