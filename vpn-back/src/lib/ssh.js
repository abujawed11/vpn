import fs from "fs";
import { Client } from "ssh2";

export function loadPrivateKey() {
  const p = process.env.SSH_KEY_PATH;
  if (!p) throw new Error("SSH_KEY_PATH is not set");
  return fs.readFileSync(p, "utf8");
}

// Streaming version for real-time output
export function execSshStream({ host, username, privateKey, password }, command, onData, onError) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";

    conn
      .on("ready", () => {
        console.log(`SSH connection established to ${host}`);
        if (onData) onData({ type: "info", message: `Connected to ${host}` });

        conn.exec(command, { pty: true }, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          stream
            .on("close", (code) => {
              conn.end();
              if (code === 0) {
                if (onData) onData({ type: "success", message: "Setup completed successfully!" });
                return resolve(stdout.trim());
              }
              const error = new Error(`SSH failed (code=${code}): ${stderr || stdout}`);
              if (onError) onError(error);
              reject(error);
            })
            .on("data", (d) => {
              const output = d.toString();
              stdout += output;
              // Stream each line to the callback
              if (onData) {
                output.split('\n').forEach(line => {
                  if (line.trim()) {
                    onData({ type: "log", message: line });
                  }
                });
              }
            })
            .stderr.on("data", (d) => {
              const output = d.toString();
              stderr += output;
              if (onData) {
                output.split('\n').forEach(line => {
                  if (line.trim()) {
                    onData({ type: "error", message: line });
                  }
                });
              }
            });
        });
      })
      .on("error", (err) => {
        console.error(`SSH connection error: ${err.message}`);
        if (onError) onError(err);
        reject(err);
      })
      .connect({
        host,
        username,
        privateKey,
        password,
        hostVerifier: () => true,
        readyTimeout: 60000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3
      });
  });
}

export function execSsh({ host, username, privateKey, password }, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";

    conn
      .on("ready", () => {
        console.log(`SSH connection established to ${host}`);
        conn.exec(command, { pty: true }, (err, stream) => {
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
            .on("data", (d) => {
              const output = d.toString();
              stdout += output;
              // Log progress in real-time
              process.stdout.write(output);
            })
            .stderr.on("data", (d) => {
              const output = d.toString();
              stderr += output;
              process.stderr.write(output);
            });
        });
      })
      .on("error", (err) => {
        console.error(`SSH connection error: ${err.message}`);
        reject(err);
      })
      // accept hostkey for now (later we can pin it)
      .connect({
        host,
        username,
        privateKey,
        password,
        hostVerifier: () => true,
        readyTimeout: 60000, // 60s timeout for initial connection
        keepaliveInterval: 10000, // Send keepalive every 10s
        keepaliveCountMax: 3
      });
  });
}
