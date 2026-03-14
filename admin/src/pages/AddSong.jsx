import React, { useEffect, useRef } from "react";
import { assets } from "../assets/assets";
import { useState } from "react";
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
    if (!image) {
      toast.error("Please select an image file");
      return false;
    }
    
    if (!song) {
      toast.error("Please select an audio file");
      return false;
    }

    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
    const allowedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/flac', 'audio/aac', 'audio/ogg'];
    
    if (!allowedImageTypes.includes(image.type)) {
      toast.error("Please select a valid image file (JPEG, PNG, GIF, or WebP)");
      return false;
    }
    
    if (image.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return false;
    }
    
    if (!allowedAudioTypes.includes(song.type)) {
      toast.error("Please select a valid audio file (MP3, WAV, FLAC, AAC, or OGG)");
      return false;
    }
    
    if (song.size > 50 * 1024 * 1024) {
      toast.error("Audio file size should be less than 50MB");
      return false;
    }
    
    return true;
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setImage(file || false);
  };

  const handleSongChange = (e) => {
    const file = e.target.files[0];
    setSong(file || false);
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setAlbum("none");
    setArtist("");
    setLanguage("Hindi");
    setImage(false);
    setSong(false);
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (songInputRef.current) songInputRef.current.value = "";
  };

  const onSubmitHandler = async (e) => {
    e.preventDefault();
    
    if (!validateFiles()) {
      return;
    }

    if (!name.trim()) {
      toast.error("Please enter a song name");
      return;
    }

    if (!description.trim()) {
      toast.error("Please enter a song description");
      return;
    }

    if (!artist.trim()) {
      toast.error("Please enter the artist name");
      return;
    }

    if (!language) {
      toast.error("Please select a language");
      return;
    }

    setLoading(true);
    setUploadProgress(0);
    setUploadStage("Preparing files...");

    try {
      const token = localStorage.getItem('auth_token');
      
      const formData = new FormData();
      formData.append("image", image);
      formData.append("audio", song);
      formData.append("name", name.trim());
      formData.append("description", description.trim());
      formData.append("album", album);
      formData.append("artist", artist.trim());
      formData.append("language", language);

      setUploadStage("Uploading to Cloudinary...");
      setUploadProgress(20);

      const response = await axios.post(`${url}/api/song/add`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = (progressEvent.loaded / progressEvent.total) * 100;
            setUploadProgress(20 + (progress * 0.6));
          }
        },
        timeout: 120000
      });

      setUploadStage("Processing audio...");
      setUploadProgress(80);

      await new Promise(resolve => setTimeout(resolve, 2000));

      setUploadStage("Finalizing...");
      setUploadProgress(100);

      if (response.data && response.data.success) {
        toast.success("🎵 Song Added Successfully!");
        resetForm();
      } else {
        toast.error(response.data?.message || "Unexpected response from server");
      }

    } catch (error) {
      console.error("❌ Add song error:", error);
      
      if (error.response) {
        const errorMessage = error.response.data?.message || error.response.data?.error || "Server error occurred";
        toast.error(`Failed to add song: ${errorMessage}`);
      } else if (error.request) {
        toast.error("No response from server. Please check your connection.");
      } else {
        toast.error("Failed to add song. Please try again.");
      }
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
      
      if (response.data.success && response.data.allAlbums) {
        setAlbumData(response.data.allAlbums);
      } else if (response.data.allAlbums) {
        setAlbumData(response.data.allAlbums);
      } else {
        setAlbumData([]);
      }
    } catch (error) {
      console.error("Error loading albums:", error);
      setAlbumData([]);
    } finally {
      setAlbumsLoading(false);
    }
  };

  useEffect(() => {
    loadAlbumData();
  }, []);

  if (loading) {
    return (
      <div className="grid place-items-center min-h-[80vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-400 border-t-green-800 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 mb-2 font-medium">{uploadStage}</p>
          <div className="w-64 bg-gray-200 rounded-full h-2.5 mb-2">
            <div 
              className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-500">{Math.round(uploadProgress)}%</p>
          <p className="text-xs text-gray-400 mt-4 max-w-sm">
            {uploadProgress < 50 
              ? "Uploading files to cloud storage..." 
              : uploadProgress < 90 
              ? "Processing audio file..." 
              : "Finalizing song data..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Add New Song</h1>
      
      <form
        onSubmit={onSubmitHandler}
        className="flex flex-col gap-8 text-gray-600"
      >
        <div className="flex gap-8 flex-wrap">
          <div className="flex flex-col gap-4">
            <p className="font-medium">Song File *</p>
            <input
              ref={songInputRef}
              onChange={handleSongChange}
              type="file"
              id="song"
              accept="audio/*"
              hidden
            />
            <label htmlFor="song" className="cursor-pointer">
              <img
                src={song ? assets.upload_added : assets.upload_song}
                className="w-32 h-32 cursor-pointer object-cover rounded-lg border-2 border-dashed border-gray-300"
                alt="Song file"
              />
            </label>
            {song && (
              <div className="text-sm text-green-600">
                <p>✓ {song.name}</p>
                <p className="text-xs text-gray-500">
                  Size: {(song.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            )}
            <p className="text-xs text-gray-500 max-w-[200px]">
              Supported: MP3, WAV, FLAC, AAC, OGG (max 50MB)
            </p>
          </div>
          
          <div className="flex flex-col gap-4">
            <p className="font-medium">Song Cover *</p>
            <input
              ref={imageInputRef}
              onChange={handleImageChange}
              type="file"
              id="image"
              accept="image/*"
              hidden
            />
            <label htmlFor="image" className="cursor-pointer">
              <img
                src={image ? URL.createObjectURL(image) : assets.upload_area}
                className="w-32 h-32 cursor-pointer object-cover rounded-lg border-2 border-dashed border-gray-300"
                alt="Song cover"
              />
            </label>
            {image && (
              <div className="text-sm text-green-600">
                <p>✓ {image.name}</p>
                <p className="text-xs text-gray-500">
                  Size: {(image.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            )}
            <p className="text-xs text-gray-500 max-w-[200px]">
              Supported: JPEG, PNG, GIF, WebP (max 5MB)
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex flex-col gap-2.5">
            <p className="font-medium">Song Name *</p>
            <input
              onChange={(e) => setName(e.target.value)}
              value={name}
              type="text"
              className="bg-transparent outline-green-600 border-2 border-gray-400 p-3 w-full rounded-lg"
              placeholder="Enter song name"
              required
            />
          </div>
          
          <div className="flex flex-col gap-2.5">
            <p className="font-medium">Album</p>
            <select
              onChange={(e) => setAlbum(e.target.value)}
              value={album}
              className="bg-transparent outline-green-600 border-2 border-gray-400 p-3 w-full rounded-lg"
              disabled={albumsLoading}
            >
              <option value="none">None (Single)</option>
              {albumData.map((item, index) => (
                <option key={index} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
            {albumsLoading && <p className="text-sm text-gray-500">Loading albums...</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex flex-col gap-2.5">
            <p className="font-medium">Artist *</p>
            <input
              onChange={(e) => setArtist(e.target.value)}
              value={artist}
              type="text"
              className="bg-transparent outline-green-600 border-2 border-gray-400 p-3 w-full rounded-lg"
              placeholder="Artist name"
              required
            />
          </div>
          <div className="flex flex-col gap-2.5">
            <p className="font-medium">Language *</p>
            <select
              onChange={(e) => setLanguage(e.target.value)}
              value={language}
              className="bg-transparent outline-green-600 border-2 border-gray-400 p-3 w-full rounded-lg"
            >
              <option value="Hindi">Hindi</option>
              <option value="English">English</option>
              <option value="Telugu">Telugu</option>
            </select>
          </div>
        </div>
        
        <div className="flex flex-col gap-2.5">
          <p className="font-medium">Song Description *</p>
          <input
            onChange={(e) => setDescription(e.target.value)}
            value={description}
            type="text"
            className="bg-transparent outline-green-600 border-2 border-gray-400 p-3 w-full rounded-lg"
            placeholder="Enter song description"
            required
          />
        </div>
        
        <button
          type="submit"
          className="text-base bg-green-600 text-white py-3 px-16 cursor-pointer hover:bg-green-700 transition-colors disabled:bg-gray-400 rounded-lg font-medium self-start"
          disabled={!song || !image || !name.trim() || !description.trim() || !artist.trim() || !language || loading}
        >
          ADD SONG
        </button>
        
        {/* Upload info */}
        {song && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 w-full max-w-md">
            <p className="text-sm text-blue-700 font-medium">
              ⏱️ Upload Information
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Audio: {(song.size / (1024 * 1024)).toFixed(2)} MB
            </p>
            <p className="text-xs text-blue-600">
              Image: {image ? `${(image.size / (1024 * 1024)).toFixed(2)} MB` : "Not selected"}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              ✅ Duration will be automatically estimated
            </p>
          </div>
        )}
      </form>
    </div>
  );
};

export default AddSong;