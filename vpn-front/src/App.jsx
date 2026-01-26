import { useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:5050";

export default function App() {
  const [regions, setRegions] = useState([]);
  const [regionId, setRegionId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/regions`)
      .then(r => r.json())
      .then(data => {
        setRegions(data);
        if (data?.[0]?.id) setRegionId(data[0].id);
      })
      .catch(console.error);
  }, []);

  async function downloadConfig() {
    if (!regionId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionId }),
      });

      if (!res.ok) throw new Error("Failed to generate config");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `myvpn-${regionId}.conf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h2>VPN Config Generator</h2>

      <label style={{ display: "block", marginTop: 16 }}>
        Select Region
      </label>

      <select
        value={regionId}
        onChange={(e) => setRegionId(e.target.value)}
        style={{ width: "100%", padding: 12, marginTop: 8 }}
      >
        {regions.map(r => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>

      <button
        onClick={downloadConfig}
        disabled={loading || !regionId}
        style={{ marginTop: 16, padding: 12, width: "100%" }}
      >
        {loading ? "Generating..." : "Download WireGuard Config"}
      </button>

      <p style={{ marginTop: 16, opacity: 0.8 }}>
        Download the config, then import it in the WireGuard app.
      </p>
    </div>
  );
}
