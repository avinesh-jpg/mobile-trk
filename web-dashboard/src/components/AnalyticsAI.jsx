import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Sparkles, BrainCircuit, MapPin, Clock, ShieldAlert, Cpu, CheckCircle2 } from 'lucide-react';

export default function AnalyticsAI() {
  const [employees, setEmployees] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [visits, setVisits] = useState([]);
  const [aiReport, setAiReport] = useState(null);
  const [loadingMl, setLoadingMl] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    api.get('/auth/employees').then((res) => {
      setEmployees(res.data);
      if (res.data.length > 0) {
        setSelectedUser(res.data[0].id);
      }
    });
  }, []);

  const runMlDetection = async () => {
    if (!selectedUser) return;
    setLoadingMl(true);
    try {
      const res = await api.post(`/analytics/detect-stops/${selectedUser}?date_str=${date}&min_stay_minutes=15`);
      setVisits(res.data.visits || []);
    } catch (err) {
      console.error('Error running ML stop detection:', err);
    } finally {
      setLoadingMl(false);
    }
  };

  const generateAiReport = async () => {
    if (!selectedUser) return;
    setLoadingAi(true);
    try {
      const res = await api.post(`/analytics/ai-summary/${selectedUser}?date_str=${date}`);
      setAiReport(res.data);
    } catch (err) {
      console.error('Error generating AI report:', err);
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header & Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              Machine Learning & AI Travel Intelligence
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Automated client visit extraction via DBSCAN clustering & generative shift reporting
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2.5 focus:outline-none"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>

            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2.5 focus:outline-none"
            />
          </div>
        </div>

        {/* Action Triggers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Card 1: Run ML DBSCAN Stop Clustering */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Spatio-Temporal Stop Detection</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Applies the DBSCAN clustering algorithm across spatial GPS coordinates and dwell timestamps to identify verified client stops without manual check-ins.
              </p>
            </div>

            <button
              onClick={runMlDetection}
              disabled={loadingMl}
              className="mt-6 w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg transition duration-200 cursor-pointer disabled:opacity-50"
            >
              {loadingMl ? 'Clustering Telemetry Points...' : 'Run DBSCAN Stop Detection (ML)'}
            </button>
          </div>

          {/* Card 2: Generate AI Field Summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Executive AI Shift Summary</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Generates a complete natural-language executive report summarizing total travel distance, client stop duration, active hours, and flagged anomalies.
              </p>
            </div>

            <button
              onClick={generateAiReport}
              disabled={loadingAi}
              className="mt-6 w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-xs font-semibold rounded-lg transition duration-200 cursor-pointer disabled:opacity-50"
            >
              {loadingAi ? 'Synthesizing AI Summary...' : 'Generate AI Shift Summary'}
            </button>
          </div>

        </div>

        {/* AI Narrative Report Display */}
        {aiReport && (
          <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">AI Executive Briefing</h3>
              </div>
              <span className="text-xs text-cyan-400 font-medium">{aiReport.date}</span>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-[11px] text-slate-400">Total Distance</p>
                <p className="text-lg font-bold text-white">{aiReport.total_distance_km} km</p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-[11px] text-slate-400">Active Window</p>
                <p className="text-xs font-bold text-cyan-400 mt-1">{aiReport.active_window}</p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-[11px] text-slate-400">Verified Stops</p>
                <p className="text-lg font-bold text-emerald-400">{aiReport.verified_stops}</p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-[11px] text-slate-400">Flagged Spoofs</p>
                <p className={`text-lg font-bold ${aiReport.suspicious_pings > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                  {aiReport.suspicious_pings}
                </p>
              </div>
            </div>

            {/* Narrative */}
            <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800/80 text-sm text-slate-200 leading-relaxed whitespace-pre-line">
              {aiReport.ai_narrative}
            </div>
          </div>
        )}

        {/* ML Detected Visits Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              ML-Detected Visits & Dwell Stops ({visits.length})
            </h3>
          </div>

          {visits.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500 italic">
              No stops detected yet. Click "Run DBSCAN Stop Detection" to process telemetry.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 uppercase text-[10px] text-slate-400">
                  <tr>
                    <th className="py-3 px-4">Arrival</th>
                    <th className="py-3 px-4">Departure</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Location (Centroid)</th>
                    <th className="py-3 px-4">ML Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {visits.map((v, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/50">
                      <td className="py-3 px-4 font-medium text-white">
                        {new Date(v.arrival_time).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {new Date(v.departure_time).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-4 text-cyan-400 font-bold">
                        {v.duration_minutes} mins
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {v.centroid_lat.toFixed(4)}, {v.centroid_lng.toFixed(4)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                          {Math.round((v.confidence_score || 0.9) * 100)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
