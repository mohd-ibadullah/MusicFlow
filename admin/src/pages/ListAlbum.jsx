import React, { useEffect, useState } from "react";
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
    if (!window.confirm(`Are you sure you want to delete "${albumName}"?`)) return;
    try {
      const token = localStorage.getItem("auth_token");
      const response = await axios.post(`${url}/api/album/remove`, { id }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) {
        toast.success(`"${albumName}" deleted`);
        await fetchAlbums();
      } else {
        toast.error(response.data.message || "Failed to delete album");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Error deleting album");
    }
  };

  const filteredAlbums = data.filter((album) =>
    album.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    album.desc?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return "—"; }
  };

  useEffect(() => { fetchAlbums(); }, []);

  if (loading) {
    return (
      <div className="grid place-items-center min-h-[60vh] animate-fade-in">
        <div className="text-center">
          <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading albums…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-page-title">Albums</h1>
          <p className="text-page-subtitle">
            {filteredAlbums.length} {filteredAlbums.length === 1 ? "album" : "albums"}
            {searchTerm && ` matching "${searchTerm}"`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              placeholder="Search…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-admin pl-9 !w-48 sm:!w-56"
            />
          </div>
          <button onClick={fetchAlbums} className="btn-admin-secondary flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="card-admin text-center py-16 px-6">
          <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <p className="text-gray-800 font-medium mb-1">No albums yet</p>
          <p className="text-sm text-gray-500">Create your first album to organize songs</p>
        </div>
      ) : (
        <div className="card-admin overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 bg-gray-50/80 border-b border-gray-100">
            <div className="col-span-1 table-admin-header">Cover</div>
            <div className="col-span-3 table-admin-header">Album</div>
            <div className="col-span-3 table-admin-header">Description</div>
            <div className="col-span-2 table-admin-header">Color</div>
            <div className="col-span-2 table-admin-header">Added</div>
            <div className="col-span-1 table-admin-header text-center">Action</div>
          </div>

          {filteredAlbums.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-500">No albums match "{searchTerm}"</p>
            </div>
          ) : (
            filteredAlbums.map((item) => (
              <div
                key={item._id}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 px-5 py-3 items-center table-admin-row"
              >
                <div className="col-span-1">
                  <img src={item.image} alt={item.name} className="w-10 h-10 object-cover rounded-lg" />
                </div>
                <div className="col-span-3">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                </div>
                <div className="col-span-3">
                  <p className="text-sm text-gray-500 truncate">{item.desc}</p>
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md border border-gray-200 shrink-0" style={{ backgroundColor: item.bgColor }}></div>
                    <span className="text-xs text-gray-500 font-mono">{item.bgColor}</span>
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-gray-500">{formatDate(item.createdAt)}</span>
                </div>
                <div className="col-span-1 text-center">
                  <button
                    onClick={() => removeAlbum(item._id, item.name)}
                    className="btn-admin-danger !p-1.5 !rounded-lg"
                    title="Delete album"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
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