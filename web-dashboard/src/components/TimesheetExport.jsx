import React, { useState, useEffect } from 'react';
import { api, API_BASE } from '../api';
import { FileText, Download, Printer, Filter, Calendar, DollarSign, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function TimesheetExport() {
  const [employees, setEmployees] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [fuelRate, setFuelRate] = useState('8.0');
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/auth/employees').then((res) => {
      setEmployees(res.data);
    });
  }, []);

  const fetchTimesheet = async () => {
    setLoading(true);
    try {
      let url = `/analytics/export/timesheet?start_date=${startDate}&end_date=${endDate}&fuel_rate=${fuelRate}&format=json`;
      if (selectedUser) {
        url += `&user_id=${selectedUser}`;
      }
      const res = await api.get(url);
      setReportData(res.data.records || []);
    } catch (err) {
      console.error('Error fetching timesheet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimesheet();
  }, [selectedUser, startDate, endDate, fuelRate]);

  // 1-Click Excel / CSV Download
  const handleDownloadExcel = () => {
    const token = localStorage.getItem('token');
    let url = `${API_BASE}/analytics/export/timesheet?start_date=${startDate}&end_date=${endDate}&fuel_rate=${fuelRate}&format=csv`;
    if (selectedUser) {
      url += `&user_id=${selectedUser}`;
    }
    // Trigger direct browser download
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GeoTrack_Timesheet_${new Date().toISOString().split('T')[0]}.csv`);
    // Pass auth token via fetch blob for security
    api.get(url, { responseType: 'blob' }).then((response) => {
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      link.href = blobUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  };

  // 1-Click Official PDF Printable Report
  const handlePrintPDF = () => {
    window.print();
  };

  // Totals
  const totalKm = reportData.reduce((sum, r) => sum + r.total_distance_km, 0).toFixed(1);
  const totalFuel = reportData.reduce((sum, r) => sum + r.fuel_reimbursement, 0).toFixed(2);
  const totalStops = reportData.reduce((sum, r) => sum + r.verified_stops, 0);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-6 printable-area">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Top Header & Actions */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4 no-print">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-cyan-400" />
              1-Click Timesheet & Field Travel Reports
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Automated punch hours, verified site visits, distance logs, and fuel reimbursement payouts
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleDownloadExcel}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
            >
              <Download className="w-4 h-4" /> Download Excel (.CSV)
            </button>

            <button
              onClick={handlePrintPDF}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 no-print">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Employee</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 focus:outline-none"
              >
                <option value="">All Field Employees</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Fuel Rate (₹/km)</label>
              <input
                type="number"
                step="0.5"
                value={fuelRate}
                onChange={(e) => setFuelRate(e.target.value)}
                className="w-24 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 focus:outline-none"
              />
            </div>
          </div>

          <button
            onClick={fetchTimesheet}
            disabled={loading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
          >
            {loading ? 'Refreshing...' : 'Refresh Records'}
          </button>
        </div>

        {/* Printable Official Document Container */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 print:p-0 print:border-none print:bg-white print:text-black">
          
          {/* Printable Header */}
          <div className="border-b border-slate-800 pb-6 mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white print:text-black tracking-tight">GeoTrack Operations Report</h2>
              <p className="text-xs text-slate-400 print:text-slate-600 mt-1">
                Official Timesheet, Verified Mileage & Travel Allowance Voucher
              </p>
            </div>
            <div className="text-right text-xs text-slate-400 print:text-slate-600">
              <p>Period: <strong className="text-white print:text-black">{startDate}</strong> to <strong className="text-white print:text-black">{endDate}</strong></p>
              <p className="mt-1">Generated: {new Date().toLocaleDateString()}</p>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 print:bg-slate-100 print:border-slate-300">
              <p className="text-[11px] text-slate-400 print:text-slate-600">Total Distance</p>
              <p className="text-xl font-bold text-white print:text-black mt-1">{totalKm} km</p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 print:bg-slate-100 print:border-slate-300">
              <p className="text-[11px] text-slate-400 print:text-slate-600">Verified Client Visits</p>
              <p className="text-xl font-bold text-emerald-400 print:text-emerald-700 mt-1">{totalStops}</p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 print:bg-slate-100 print:border-slate-300">
              <p className="text-[11px] text-slate-400 print:text-slate-600">Total Travel Payout</p>
              <p className="text-xl font-bold text-cyan-400 print:text-cyan-700 mt-1">₹{totalFuel}</p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 print:bg-slate-100 print:border-slate-300">
              <p className="text-[11px] text-slate-400 print:text-slate-600">Total Logged Shifts</p>
              <p className="text-xl font-bold text-white print:text-black mt-1">{reportData.length}</p>
            </div>
          </div>

          {/* Timesheet Data Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 print:text-slate-800">
              <thead className="bg-slate-950 uppercase text-[10px] text-slate-400 border-b border-slate-800 print:bg-slate-200 print:text-black">
                <tr>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Employee</th>
                  <th className="py-3 px-3">Shift Window</th>
                  <th className="py-3 px-3">Duration</th>
                  <th className="py-3 px-3">Distance</th>
                  <th className="py-3 px-3">Stops</th>
                  <th className="py-3 px-3">Travel Allowance</th>
                  <th className="py-3 px-3">Audit Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 print:divide-slate-300">
                {reportData.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-slate-500 italic">
                      No shift records logged for this selected time window.
                    </td>
                  </tr>
                ) : (
                  reportData.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 print:hover:bg-transparent">
                      <td className="py-3 px-3 font-semibold text-white print:text-black">{r.date}</td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-white print:text-black">{r.employee_name}</div>
                        <div className="text-[10px] text-slate-500">{r.employee_email}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-300 print:text-black">
                        {r.shift_start} - {r.shift_end}
                      </td>
                      <td className="py-3 px-3 font-semibold">{r.total_duration}</td>
                      <td className="py-3 px-3 text-cyan-400 print:text-cyan-700 font-bold">
                        {r.total_distance_km} km
                      </td>
                      <td className="py-3 px-3 font-semibold text-emerald-400 print:text-emerald-700">
                        {r.verified_stops} visits
                      </td>
                      <td className="py-3 px-3 font-bold text-white print:text-black">
                        ₹{r.fuel_reimbursement}
                      </td>
                      <td className="py-3 px-3">
                        {r.status === 'Verified' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 print:border-emerald-600 print:text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" /> VERIFIED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 print:border-red-600 print:text-red-700">
                            <AlertTriangle className="w-3 h-3" /> FLAGGED
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Printable Signature & Authorization Footer */}
          <div className="mt-12 pt-8 border-t border-slate-800 print:border-slate-300 grid grid-cols-2 gap-8 text-xs text-slate-400 print:text-slate-600">
            <div>
              <p className="font-semibold text-white print:text-black mb-6">Operations Supervisor Approval</p>
              <div className="border-b border-dashed border-slate-700 w-48 mb-1" />
              <p className="text-[10px]">Signature & Date</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-white print:text-black mb-6">HR & Accounts Disbursement</p>
              <div className="border-b border-dashed border-slate-700 w-48 ml-auto mb-1" />
              <p className="text-[10px]">Authorized Signature</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
