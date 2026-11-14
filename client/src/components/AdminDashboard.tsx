import React from 'react';

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Admin Dashboard</h1>
      <p className="mb-6">Welcome, admin! Here you can manage the platform.</p>
      {/* Placeholder for admin controls */}
      <button
        onClick={onLogout}
        className="px-4 py-2 bg-red-600 text-white rounded"
      >
        Logout
      </button>
    </div>
  );
}
