import React, { useEffect } from "react";
import { useState } from "react";
import axios from "axios";
import { url } from "../App";
import { toast } from "react-toastify";

const ListAlbum = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchAlbums = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${url}/api/album/list`);
      
      if (response.data.success && response.data.allAlbums) {
        setData(response.data.allAlbums);
      } else if (response.data.allAlbums) {
        setData(response.data.allAlbums);
      } else {
        setData([]);
      }
    } catch (error) {
      console.error("Error fetching albums:", error);
      toast.error("Error fetching albums");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const removeAlbum = async (id, albumName) => {
    if (!window.confirm(`Are you sure you want to delete "${albumName}"?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const response = await axios.post(`${url}/api/album/remove`, { id }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.data.success) {
        toast.success("Album deleted successfully");
        await fetchAlbums();
      } else {
        toast.error(response.data.message || "Failed to delete album");
      }
    } catch (error) {
      const message = error.response?.data?.message || "Error deleting album";
      toast.error(message);
    }
  };

  // Filter albums based on search
  const filteredAlbums = data.filter(album =>
    album.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    album.desc.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString) => {
    if (!dateString) return "Unknown";
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString();
    } catch {
      return "Unknown";
    }
  };

  useEffect(() => {
    fetchAlbums();
  }, []);

  if (loading) {
    return (
      <div className="grid place-items-center min-h-[80vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-400 border-t-green-800 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600">Loading albums...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Albums</h1>
          <p className="text-gray-600 mt-1">
            {filteredAlbums.length} album{filteredAlbums.length !== 1 ? 's' : ''} found
            {searchTerm && ` for "${searchTerm}"`}
          </p>
        </div>
        <div className="flex gap-3">
          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search albums..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-400">🔍</span>
            </div>
          </div>
          
          <button 
            onClick={fetchAlbums}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2 transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500 text-lg mb-2">No albums found</p>
          <p className="text-gray-400 mb-4">Get started by creating your first album</p>
          <button 
            onClick={fetchAlbums}
            className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
          >
            Refresh Albums
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Desktop Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 p-4 bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
            <div className="col-span-1">Cover</div>
            <div className="col-span-3">Album Name</div>
            <div className="col-span-3">Description</div>
            <div className="col-span-2">Color</div>
            <div className="col-span-2">Date Added</div>
            <div className="col-span-1 text-center">Action</div>
          </div>
          
          {filteredAlbums.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No albums found matching your search</p>
            </div>
          ) : (
            filteredAlbums.map((item, index) => (
              <div
                key={item._id || index}
                className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 items-center hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
              >
                <div className="col-span-1 flex justify-center md:justify-start">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-12 h-12 object-cover rounded"
                  />
                </div>
                <div className="col-span-3 text-center md:text-left">
                  <p className="font-medium text-gray-900">{item.name}</p>
                </div>
                <div className="col-span-3 text-center md:text-left">
                  <p className="text-gray-600 truncate">{item.desc}</p>
                </div>
                <div className="col-span-2 text-center md:text-left">
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <div 
                      className="w-6 h-6 rounded border border-gray-300"
                      style={{ backgroundColor: item.bgColor }}
                    ></div>
                    <span className="text-sm text-gray-500">{item.bgColor}</span>
                  </div>
                </div>
                <div className="col-span-2 text-center md:text-left">
                  <p className="text-sm text-gray-500">
                    {formatDate(item.createdAt)}
                  </p>
                </div>
                <div className="col-span-1 text-center">
                  <button
                    onClick={() => removeAlbum(item._id, item.name)}
                    className="text-red-500 hover:text-red-700 transition-colors p-2 rounded-full hover:bg-red-50"
                    title="Delete album"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ListAlbum;