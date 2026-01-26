import { execFile } from "child_process";

function run(cmd, args, input = "") {
  return new Promise((resolve, reject) => {
    const p = execFile(cmd, args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || "").toString().trim() || err.message));
      resolve(stdout.toString().trim());
    });
    if (input) {
      p.stdin.write(input);
      p.stdin.end();
    }
  });
}

export async function genWgKeypair() {
  const priv = await run("wg", ["genkey"]);
  const pub = await run("wg", ["pubkey"], priv + "\n");
  return { priv, pub };
}
