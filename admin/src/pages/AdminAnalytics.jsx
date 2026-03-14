// pages/AdminAnalytics.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { url } from "../App";
import { toast } from "react-toastify";

const AdminAnalytics = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const response = await axios.get(`${url}/api/admin/analytics`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.success) {
        setAnalytics(response.data.data);
      } else {
        toast.error("Failed to load analytics");
        setAnalytics(null);
      }
    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast.error("Error fetching analytics");
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="grid place-items-center min-h-[80vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-400 border-t-green-800 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <p className="text-gray-500 text-lg mb-2">Failed to load analytics</p>
        <button
          onClick={fetchAnalytics}
          className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600 mt-1">Platform performance and user engagement metrics</p>
        </div>
        <button
          onClick={fetchAnalytics}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Streams</p>
              <p className="text-3xl font-bold text-gray-900">{analytics.totalStreams?.toLocaleString() || 0}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🎵</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Users</p>
              <p className="text-3xl font-bold text-gray-900">{analytics.activeUsers?.toLocaleString() || 0}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">👥</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Songs</p>
              <p className="text-3xl font-bold text-gray-900">{analytics.totalSongs?.toLocaleString() || 0}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🎼</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Albums</p>
              <p className="text-3xl font-bold text-gray-900">{analytics.totalAlbums?.toLocaleString() || 0}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">💿</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Songs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Top Songs</h2>
        {analytics.topSongs?.length > 0 ? (
          <div className="space-y-4">
            {analytics.topSongs.map((song, index) => (
              <div key={song._id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-gray-600">
                    {index + 1}
                  </div>
                  <img
                    src={song.image}
                    alt={song.name}
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                  <div>
                    <p className="font-medium text-gray-900">{song.name}</p>
                    <p className="text-sm text-gray-600">{song.album}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">{song.plays?.toLocaleString() || 0} plays</p>
                  <p className="text-sm text-gray-600">{song.likes?.toLocaleString() || 0} likes</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No song data available</p>
        )}
      </div>

      {/* Top Artists */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Top Artists</h2>
        {analytics.topArtists?.length > 0 ? (
          <div className="space-y-4">
            {analytics.topArtists.map((artist, index) => (
              <div key={artist._id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-gray-600">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{artist.name}</p>
                    <p className="text-sm text-gray-600">{artist.totalSongs} songs</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">{artist.totalPlays?.toLocaleString() || 0} total plays</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No artist data available</p>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
        {analytics.recentActivity?.length > 0 ? (
          <div className="space-y-3">
            {analytics.recentActivity.map((activity, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <p className="text-sm text-gray-700">{activity.description}</p>
                </div>
                <p className="text-xs text-gray-500">
                  {new Date(activity.timestamp).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No recent activity</p>
        )}
      </div>
    </div>
  );
};

export default AdminAnalytics;