import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

const API = "http://localhost:5050";

export default function Dashboard() {
  const [regions, setRegions] = useState([]);
  const [regionId, setRegionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [myConfigs, setMyConfigs] = useState([]);

  const { user, token, logout } = useAuth();

  useEffect(() => {
    // Fetch regions
    fetch(`${API}/api/regions`)
      .then((r) => r.json())
      .then((data) => {
        setRegions(data);
        if (data?.[0]?.id) setRegionId(data[0].id);
      })
      .catch(console.error);

    // Fetch user's configs
    fetchMyConfigs();
  }, [token]);

  async function fetchMyConfigs() {
    try {
      const res = await fetch(`${API}/api/config/my-configs`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        setMyConfigs(data.configs || []);
      }
    } catch (err) {
      console.error("Failed to fetch configs:", err);
    }
  }

  async function downloadConfig() {
    if (!regionId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ regionId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate config");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `myvpn-${regionId}.conf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);

      // Refresh configs list
      fetchMyConfigs();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-white">VPN Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-400">Welcome, {user?.username}</span>
            <button
              onClick={logout}
              className="text-red-400 hover:text-red-300 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Config Generator */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">
            Generate VPN Config
          </h2>

          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-gray-300 mb-2">Select Region</label>
              <select
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
              >
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={downloadConfig}
              disabled={loading || !regionId}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium py-2 px-6 rounded transition"
            >
              {loading ? "Generating..." : "Download Config"}
            </button>
          </div>

          <p className="text-gray-400 text-sm mt-4">
            Download the config file and import it into the WireGuard app.
          </p>
        </div>

        {/* My Configs */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            My Active Configs
          </h2>

          {myConfigs.length === 0 ? (
            <p className="text-gray-400">
              No active configs yet. Generate one above.
            </p>
          ) : (
            <div className="space-y-3">
              {myConfigs.map((config) => (
                <div
                  key={config.id}
                  className="flex justify-between items-center bg-gray-700 rounded px-4 py-3"
                >
                  <div>
                    <span className="text-white font-medium">
                      {config.regionName}
                    </span>
                    <span className="text-gray-400 text-sm ml-3">
                      IP: {config.ip}
                    </span>
                  </div>
                  <span className="text-gray-400 text-sm">
                    Created: {new Date(config.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
