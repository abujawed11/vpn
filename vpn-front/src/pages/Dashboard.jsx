import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../hooks/useSocket";

const API = import.meta.env.VITE_API_URL || "http://localhost:5050";

export default function Dashboard() {
  const [regions, setRegions] = useState([]);
  const [regionId, setRegionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [myConfigs, setMyConfigs] = useState([]);
  const [userPlan, setUserPlan] = useState("free");
  const [maxRegions, setMaxRegions] = useState(2);
  const [error, setError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);

  const { user, token, logout } = useAuth();

  // WebSocket connection
  useSocket(token, {
    onConnect: () => {
      console.log("WebSocket connected");
      setWsConnected(true);
    },
    onDisconnect: () => {
      console.log("WebSocket disconnected");
      setWsConnected(false);
    },
    onTimerStarted: (data) => {
      console.log("Timer started:", data);
      // Refresh configs to get updated status
      fetchMyConfigs();
    },
    onTimerExpired: (data) => {
      console.log("Timer expired:", data);
      // Refresh configs to show expired status
      fetchMyConfigs();
    },
  });

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

    // Poll every 5 seconds for timer updates (less frequent now with WebSocket)
    const interval = setInterval(fetchMyConfigs, 5000);
    return () => clearInterval(interval);
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
        setUserPlan(data.plan || "free");
        setMaxRegions(data.maxRegions || 2);
      }
    } catch (err) {
      console.error("Failed to fetch configs:", err);
    }
  }

  async function downloadConfig(selectedRegionId = regionId) {
    if (!selectedRegionId) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API}/api/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ regionId: selectedRegionId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate config");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `myvpn-${selectedRegionId}.conf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);

      // Refresh configs list
      fetchMyConfigs();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status) {
    switch (status) {
      case "pending":
        return (
          <span className="px-2 py-1 text-xs rounded bg-yellow-500/20 text-yellow-400">
            Pending
          </span>
        );
      case "active":
        return (
          <span className="px-2 py-1 text-xs rounded bg-green-500/20 text-green-400">
            Active
          </span>
        );
      case "expired":
        return (
          <span className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-400">
            Expired
          </span>
        );
      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">VPN Dashboard</h1>
            {/* WebSocket Status Indicator */}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full ${
                  wsConnected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-xs text-gray-400">
                {wsConnected ? "Live" : "Offline"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-400">
              {user?.username}{" "}
              <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 ml-1">
                {userPlan}
              </span>
            </span>
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
        {/* Error Message */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-2 rounded mb-6">
            {error}
          </div>
        )}

        {/* Config Generator */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-white">
              Generate VPN Config
            </h2>
            {userPlan === "free" && (
              <span className="text-sm text-gray-400">
                {myConfigs.length}/{maxRegions} regions used
              </span>
            )}
          </div>

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
              onClick={() => downloadConfig()}
              disabled={loading || !regionId}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium py-2 px-6 rounded transition"
            >
              {loading ? "Generating..." : "Download Config"}
            </button>
          </div>

          <p className="text-gray-400 text-sm mt-4">
            Download the config file and import it into the WireGuard app.
            Timer starts when you connect.
          </p>
        </div>

        {/* My Configs */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            My Configs
          </h2>

          {myConfigs.length === 0 ? (
            <p className="text-gray-400">
              No configs yet. Generate one above.
            </p>
          ) : (
            <div className="space-y-3">
              {myConfigs.map((config) => (
                <div
                  key={config.id}
                  className="bg-gray-700 rounded-lg p-4"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">
                          {config.regionName}
                        </span>
                        {getStatusBadge(config.status)}
                      </div>
                      <span className="text-gray-400 text-sm">
                        IP: {config.ip}
                      </span>
                    </div>
                    <button
                      onClick={() => downloadConfig(config.regionId)}
                      disabled={loading}
                      className="text-blue-400 hover:text-blue-300 text-sm transition"
                    >
                      Download
                    </button>
                  </div>

                  {/* Status Message */}
                  <div className="mt-3 pt-3 border-t border-gray-600">
                    {config.status === "pending" && (
                      <p className="text-yellow-400 text-sm">
                        Connect VPN to start timer
                      </p>
                    )}
                    {config.status === "active" && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-600 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-green-500 h-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, (config.remainingMinutes / 5) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-green-400 text-sm font-medium">
                          {config.remainingMinutes} min left
                        </span>
                      </div>
                    )}
                    {config.status === "expired" && (
                      <p className="text-red-400 text-sm">
                        Session expired. Generate a new config to continue.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
