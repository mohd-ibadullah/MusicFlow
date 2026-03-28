import React, { useEffect, useRef, useState } from "react";
import { assets } from "../assets/assets";
import axios from "axios";
import { toast } from "react-toastify";
import { url } from "../App";

const AddSong = () => {
  const [image, setImage] = useState(false);
  const [song, setSong] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [album, setAlbum] = useState("none");
  const [artist, setArtist] = useState("");
  const [language, setLanguage] = useState("Hindi");
  const [loading, setLoading] = useState(false);
  const [albumData, setAlbumData] = useState([]);
  const [albumsLoading, setAlbumsLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");

  const imageInputRef = useRef(null);
  const songInputRef = useRef(null);

  const validateFiles = () => {
    if (!image) { toast.error("Please select an image file"); return false; }
    if (!song) { toast.error("Please select an audio file"); return false; }
    const allowedImageTypes = ["image/jpeg", "image/png", "image/jpg", "image/gif", "image/webp"];
    const allowedAudioTypes = ["audio/mpeg", "audio/wav", "audio/mp3", "audio/flac", "audio/aac", "audio/ogg"];
    if (!allowedImageTypes.includes(image.type)) { toast.error("Invalid image format"); return false; }
    if (image.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return false; }
    if (!allowedAudioTypes.includes(song.type)) { toast.error("Invalid audio format"); return false; }
    if (song.size > 50 * 1024 * 1024) { toast.error("Audio must be under 50 MB"); return false; }
    return true;
  };

  const resetForm = () => {
    setName(""); setDescription(""); setAlbum("none"); setArtist(""); setLanguage("Hindi");
    setImage(false); setSong(false);
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (songInputRef.current) songInputRef.current.value = "";
  };

  const onSubmitHandler = async (e) => {
    e.preventDefault();
    if (!validateFiles()) return;
    if (!name.trim()) { toast.error("Enter a song name"); return; }
    if (!description.trim()) { toast.error("Enter a description"); return; }
    if (!artist.trim()) { toast.error("Enter the artist name"); return; }

    setLoading(true);
    setUploadProgress(0);
    setUploadStage("Preparing files…");

    try {
      const token = localStorage.getItem("auth_token");
      const formData = new FormData();
      formData.append("image", image);
      formData.append("audio", song);
      formData.append("name", name.trim());
      formData.append("description", description.trim());
      formData.append("album", album);
      formData.append("artist", artist.trim());
      formData.append("language", language);

      setUploadStage("Uploading…");
      setUploadProgress(20);

      const response = await axios.post(`${url}/api/song/add`, formData, {
        headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            setUploadProgress(20 + (progressEvent.loaded / progressEvent.total) * 60);
          }
        },
        timeout: 120000,
      });

      setUploadStage("Processing…");
      setUploadProgress(90);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setUploadProgress(100);

      if (response.data?.success) {
        toast.success("Song added successfully");
        resetForm();
      } else {
        toast.error(response.data?.message || "Unexpected error");
      }
    } catch (error) {
      if (error.response) toast.error(error.response.data?.message || "Server error");
      else if (error.request) toast.error("No server response");
      else toast.error("Failed to add song");
    } finally {
      setLoading(false);
      setUploadProgress(0);
      setUploadStage("");
    }
  };

  const loadAlbumData = async () => {
    try {
      setAlbumsLoading(true);
      const response = await axios.get(`${url}/api/album/list`);
      setAlbumData(response.data.allAlbums || []);
    } catch { setAlbumData([]); }
    finally { setAlbumsLoading(false); }
  };

  useEffect(() => { loadAlbumData(); }, []);

  if (loading) {
    return (
      <div className="grid place-items-center min-h-[60vh] animate-fade-in">
        <div className="text-center">
          <div className="w-12 h-12 border-[3px] border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-medium text-gray-700 mb-3">{uploadStage}</p>
          <div className="w-56 progress-bar mx-auto mb-2">
            <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }}></div>
          </div>
          <p className="text-xs text-gray-500">{Math.round(uploadProgress)}%</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl animate-fade-in">
      <h1 className="text-page-title mb-1">Add New Song</h1>
      <p className="text-page-subtitle mb-8">Upload audio and cover art to your library</p>

      <form onSubmit={onSubmitHandler} className="space-y-7">
        {/* File uploads */}
        <div className="flex gap-6 flex-wrap">
          <div className="space-y-2">
            <label className="text-label">Audio File *</label>
            <input ref={songInputRef} onChange={(e) => setSong(e.target.files[0] || false)} type="file" id="song" accept="audio/*" hidden />
            <label htmlFor="song" className="block transform transition-transform duration-200 active:scale-[0.98] hover:scale-[1.01]">
              {song ? (
                <img src={assets.upload_added} className="upload-zone border-emerald-200 shadow-md ring-2 ring-emerald-50/50" alt="Audio" />
              ) : (
                <div className="upload-zone flex flex-col items-center justify-center gap-2.5 bg-gray-50/40 border-gray-200/60 shadow-inner">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-gray-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l.31-.088m1.144-6.32a9 9 0 11-12.247 9a9 9 0 0112.247-9z" />
                  </svg>
                  <span className="text-xs font-semibold text-gray-500">Upload</span>
                </div>
              )}
            </label>
            {song && (
              <p className="text-xs text-emerald-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                {song.name} ({(song.size / (1024 * 1024)).toFixed(1)} MB)
              </p>
            )}
            <p className="text-[11px] text-gray-400">MP3, WAV, FLAC, AAC, OGG · Max 50 MB</p>
          </div>

          <div className="space-y-2">
            <label className="text-label">Cover Art *</label>
            <input ref={imageInputRef} onChange={(e) => setImage(e.target.files[0] || false)} type="file" id="image" accept="image/*" hidden />
            <label htmlFor="image" className="block transform transition-transform duration-200 active:scale-[0.98] hover:scale-[1.01]">
              {image ? (
                <img src={URL.createObjectURL(image)} className="upload-zone shadow-md ring-2 ring-blue-50/50" alt="Cover" />
              ) : (
                <div className="upload-zone flex flex-col items-center justify-center gap-2.5 bg-gray-50/40 border-gray-200/60 shadow-inner">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-gray-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                  <span className="text-xs font-semibold text-gray-500">Upload</span>
                </div>
              )}
            </label>
            {image && (
              <p className="text-xs text-emerald-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                {image.name} ({(image.size / (1024 * 1024)).toFixed(1)} MB)
              </p>
            )}
            <p className="text-[11px] text-gray-400">JPEG, PNG, WebP · Max 5 MB</p>
          </div>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="text-label">Song Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-admin" placeholder="Enter song name" required />
          </div>
          <div>
            <label className="text-label">Artist *</label>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} className="input-admin" placeholder="Artist name" required />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="text-label">Album</label>
            <select value={album} onChange={(e) => setAlbum(e.target.value)} className="select-admin" disabled={albumsLoading}>
              <option value="none">None (Single)</option>
              {albumData.map((item) => (
                <option key={item._id || item.name} value={item.name}>{item.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-label">Language *</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="select-admin">
              <option value="Hindi">Hindi</option>
              <option value="English">English</option>
              <option value="Telugu">Telugu</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-label">Description *</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="input-admin" placeholder="A brief description of the song" required />
        </div>

        <button
          type="submit"
          className="btn-admin-primary"
          disabled={!song || !image || !name.trim() || !description.trim() || !artist.trim() || !language || loading}
        >
          Add Song
        </button>
      </form>
    </div>
  );
};

export default AddSong;