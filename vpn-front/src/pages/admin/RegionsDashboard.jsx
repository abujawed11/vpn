import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../../hooks/useSocket";

const API = import.meta.env.VITE_API_URL || "http://localhost:5050";

export default function RegionsDashboard() {
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { token, logout, user } = useAuth();
  const navigate = useNavigate();

  // Setup logs state
  const [setupLogs, setSetupLogs] = useState([]);
  const [setupInProgress, setSetupInProgress] = useState(false);
  const logsEndRef = useRef(null);

  // Form state
  const [showModal, setShowModal] = useState(false);
  const [setupMode, setSetupMode] = useState("manual"); // manual or automated
  const [automationLoading, setAutomationLoading] = useState(false);
  const [editingRegion, setEditingRegion] = useState(null);
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    host: "",
    endpoint: "",
    serverPublicKey: "",
    baseIp: "",
    dns: "1.1.1.1",
    isActive: true,
    sshUser: "ubuntu",
    sshPassword: "",
    sshKeyFile: null,
  });

  // Socket.io for real-time setup logs
  useSocket(token, {
    onConnect: () => {
      console.log("WebSocket connected (Admin)");
    },
    onDisconnect: () => {
      console.log("WebSocket disconnected (Admin)");
    },
    onSetupLog: (data) => {
      setSetupLogs(prev => [...prev, data]);
      // Auto-scroll to bottom
      setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onSetupComplete: (data) => {
      setSetupLogs(prev => [...prev, { type: "success", message: "✅ " + data.message }]);
      setSetupInProgress(false);
      setTimeout(() => {
        fetchRegions();
        setShowModal(false);
        setSetupLogs([]);
      }, 2000);
    },
    onSetupError: (data) => {
      setSetupLogs(prev => [...prev, { type: "error", message: "❌ " + data.message }]);
      setSetupInProgress(false);
    },
  });

  useEffect(() => {
    fetchRegions();
  }, [token]);

  async function fetchRegions() {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/admin/regions`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch regions");
      const data = await res.json();
      setRegions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Are you sure you want to delete this region? This cannot be undone.")) return;
    
    try {
      const res = await fetch(`${API}/api/admin/regions/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!res.ok) throw new Error("Failed to delete region");
      fetchRegions();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (setupMode === "automated" && !editingRegion) {
        return runAutomation();
    }

    try {
      const url = editingRegion 
        ? `${API}/api/admin/regions/${editingRegion.id}`
        : `${API}/api/admin/regions`;
      
      const method = editingRegion ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save region");
      }

      setShowModal(false);
      resetForm();
      fetchRegions();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleKeyFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Read file content
    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData({ ...formData, sshKeyFile: event.target.result });
    };
    reader.readAsText(file);
  }

  async function runAutomation() {
    setAutomationLoading(true);
    setSetupInProgress(true);
    setSetupLogs([]);
    setError("");

    try {
        const payload = {
            host: formData.host,
            username: formData.sshUser,
            baseIp: formData.baseIp,
            regionId: formData.id
        };

        // Include password or SSH key
        if (formData.sshPassword) {
            payload.password = formData.sshPassword;
        } else if (formData.sshKeyFile) {
            payload.sshKey = formData.sshKeyFile;
        }

        const res = await fetch(`${API}/api/setup/run-automation`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Automation failed");

        // Setup started - logs will come via WebSocket
        setSetupLogs([{ type: "info", message: "📡 Setup started. Connecting to server..." }]);
    } catch (err) {
        setError(err.message);
        setSetupInProgress(false);
    } finally {
        setAutomationLoading(false);
    }
  }

  function openEditModal(region) {
    setEditingRegion(region);
    setSetupMode("manual");
    setFormData({
      id: region.id,
      name: region.name,
      host: region.host,
      endpoint: region.endpoint,
      serverPublicKey: region.serverPublicKey,
      baseIp: region.baseIp,
      dns: region.dns,
      isActive: region.isActive,
      sshUser: "root",
      sshPassword: "",
      sshKeyFile: null,
    });
    setShowModal(true);
  }

  function openAddModal() {
    setEditingRegion(null);
    setSetupMode("automated");
    resetForm();
    setShowModal(true);
  }

  function resetForm() {
    setFormData({
      id: "",
      name: "",
      host: "",
      endpoint: "",
      serverPublicKey: "",
      baseIp: "",
      dns: "1.1.1.1",
      isActive: true,
      sshUser: "root",
      sshPassword: "",
      sshKeyFile: null,
    });
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">VPN Admin Panel</h1>
            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 text-xs">
              Regions
            </span>
          </div>
          <div className="flex items-center gap-4">
             <button
              onClick={() => navigate('/')}
              className="text-gray-400 hover:text-white transition"
            >
              Back to User Dashboard
            </button>
            <span className="text-gray-400">
              {user?.username} (Admin)
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

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold">Regions Management</h2>
          <button
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition flex items-center gap-2"
          >
            <span>+</span> Add / Setup Region
          </button>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-2 rounded mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading regions...</div>
        ) : regions.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
            No regions found. Click "Add Region" to create one.
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-700/50 border-b border-gray-700 text-gray-300 text-sm">
                  <th className="px-6 py-3 font-medium">ID</th>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Host IP</th>
                  <th className="px-6 py-3 font-medium">Base IP</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {regions.map((region) => (
                  <tr key={region.id} className="hover:bg-gray-700/30 transition">
                    <td className="px-6 py-4 font-mono text-sm text-gray-400">{region.id}</td>
                    <td className="px-6 py-4 font-medium">{region.name}</td>
                    <td className="px-6 py-4 text-gray-400">{region.host}</td>
                    <td className="px-6 py-4 text-gray-400">{region.baseIp}</td>
                    <td className="px-6 py-4">
                      {region.isActive ? (
                        <span className="px-2 py-1 text-xs rounded bg-green-500/20 text-green-400">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-400">
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-3">
                      <button
                        onClick={() => openEditModal(region)}
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(region.id)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full p-6 shadow-xl border border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">
                {editingRegion ? "Edit Region" : "Add New Region"}
                </h3>
                {!editingRegion && (
                    <div className="flex bg-gray-700 p-1 rounded-lg">
                        <button 
                            onClick={() => setSetupMode("automated")}
                            className={`px-3 py-1 rounded text-sm transition ${setupMode === 'automated' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                        >
                            Automated Setup
                        </button>
                        <button 
                            onClick={() => setSetupMode("manual")}
                            className={`px-3 py-1 rounded text-sm transition ${setupMode === 'manual' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                        >
                            Manual Add
                        </button>
                    </div>
                )}
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {setupMode === "automated" && !editingRegion ? (
                // Automated Setup Fields
                <div className="space-y-4">
                    <p className="text-sm text-gray-400 bg-blue-500/10 border border-blue-500/20 p-3 rounded">
                        This will SSH into your server, install WireGuard, setup monitoring, and register it in the DB.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Host IP</label>
                            <input
                                type="text"
                                required
                                value={formData.host}
                                onChange={e => setFormData({...formData, host: e.target.value})}
                                placeholder="1.2.3.4"
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Region ID</label>
                            <input
                                type="text"
                                required
                                value={formData.id}
                                onChange={e => setFormData({...formData, id: e.target.value})}
                                placeholder="us-east-1"
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">SSH Username</label>
                            <input
                                type="text"
                                required
                                value={formData.sshUser}
                                onChange={e => setFormData({...formData, sshUser: e.target.value})}
                                placeholder="root (default)"
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">SSH Password (Optional)</label>
                            <input
                                type="password"
                                value={formData.sshPassword}
                                onChange={e => setFormData({...formData, sshPassword: e.target.value})}
                                placeholder="Leave blank to use SSH Key"
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">SSH Key File (Optional)</label>
                        <input
                            type="file"
                            accept=".pem,.key"
                            onChange={handleKeyFileChange}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Upload .pem file for EC2/AWS instances. Leave blank if using password or backend's default key.
                        </p>
                        {formData.sshKeyFile && (
                            <p className="text-xs text-green-400 mt-1">✓ Key file loaded</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Base IP Subnet</label>
                        <input
                            type="text"
                            required
                            value={formData.baseIp}
                            onChange={e => setFormData({...formData, baseIp: e.target.value})}
                            placeholder="10.80.0"
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>
                </div>
              ) : (
                // Manual / Edit Fields
                <>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                    <label className="block text-sm text-gray-400 mb-1">Region ID (Unique)</label>
                    <input
                        type="text"
                        required
                        disabled={!!editingRegion}
                        value={formData.id}
                        onChange={e => setFormData({...formData, id: e.target.value})}
                        placeholder="e.g., sg-singapore"
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                    />
                    </div>
                    <div>
                    <label className="block text-sm text-gray-400 mb-1">Display Name</label>
                    <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        placeholder="e.g., Singapore"
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                    />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                    <label className="block text-sm text-gray-400 mb-1">Host IP (SSH)</label>
                    <input
                        type="text"
                        required
                        value={formData.host}
                        onChange={e => setFormData({...formData, host: e.target.value})}
                        placeholder="e.g., 13.229.x.x"
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                    />
                    </div>
                    <div>
                    <label className="block text-sm text-gray-400 mb-1">WireGuard Endpoint</label>
                    <input
                        type="text"
                        required
                        value={formData.endpoint}
                        onChange={e => setFormData({...formData, endpoint: e.target.value})}
                        placeholder="e.g., 13.229.x.x:51820"
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                    />
                    </div>
                </div>

                <div>
                    <label className="block text-sm text-gray-400 mb-1">Server Public Key</label>
                    <input
                    type="text"
                    required
                    value={formData.serverPublicKey}
                    onChange={e => setFormData({...formData, serverPublicKey: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500 font-mono text-sm"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                    <label className="block text-sm text-gray-400 mb-1">Base IP (Private)</label>
                    <input
                        type="text"
                        required
                        value={formData.baseIp}
                        onChange={e => setFormData({...formData, baseIp: e.target.value})}
                        placeholder="e.g., 10.60.0"
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                    />
                    </div>
                    <div>
                    <label className="block text-sm text-gray-400 mb-1">DNS Server</label>
                    <input
                        type="text"
                        required
                        value={formData.dns}
                        onChange={e => setFormData({...formData, dns: e.target.value})}
                        placeholder="1.1.1.1"
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                    />
                    </div>
                </div>

                <div className="flex items-center gap-2 mt-2">
                    <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={e => setFormData({...formData, isActive: e.target.checked})}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="isActive" className="text-gray-300">Region Active (Visible to users)</label>
                </div>
                </>
              )}

              {/* Live Logs Terminal */}
              {setupLogs.length > 0 && (
                <div className="mt-6 pt-4 border-t border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-300">Setup Logs</h4>
                    {setupInProgress && (
                      <div className="flex items-center gap-2 text-xs text-blue-400">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                        Running...
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-900 rounded border border-gray-700 p-4 font-mono text-xs max-h-96 overflow-y-auto">
                    {setupLogs.map((log, idx) => (
                      <div
                        key={idx}
                        className={`mb-1 ${
                          log.type === "error"
                            ? "text-red-400"
                            : log.type === "success"
                            ? "text-green-400"
                            : log.type === "info"
                            ? "text-blue-400"
                            : "text-gray-300"
                        }`}
                      >
                        {log.message}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setSetupLogs([]);
                  }}
                  disabled={automationLoading || setupInProgress}
                  className="px-4 py-2 text-gray-300 hover:text-white transition disabled:opacity-50"
                >
                  {setupInProgress ? "Close" : "Cancel"}
                </button>
                {!setupInProgress && (
                  <button
                    type="submit"
                    disabled={automationLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded transition flex items-center gap-2 disabled:opacity-50"
                  >
                    {automationLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Starting...
                        </>
                    ) : (
                      editingRegion ? "Update Region" : (setupMode === 'automated' ? "Start Automation" : "Create Region")
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
