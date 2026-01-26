export function pickFreeIpFromDump(baseIp, dumpText) {
  const used = new Set();
  const lines = dumpText.split("\n").map(l => l.trim()).filter(Boolean);

  // skip interface line (first line)
  for (const line of lines.slice(1)) {
    const parts = line.split("\t");
    const allowedIps = parts[3] || "";
    for (const chunk of allowedIps.split(",")) {
      const ip = chunk.trim().split("/")[0];
      if (ip.startsWith(baseIp + ".")) used.add(ip);
    }
  }

  for (let last = 2; last <= 254; last++) {
    const ip = `${baseIp}.${last}`;
    if (!used.has(ip)) return ip;
  }
  throw new Error("No free IPs left in pool");
}
