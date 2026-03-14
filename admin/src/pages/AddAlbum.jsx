import React from "react";
import { assets } from "../assets/assets.js";
import { useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { url } from "../App.jsx";

const AddAlbum = () => {
  const [image, setImage] = useState(false);
  const [color, setColor] = useState("#3B82F6");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");

  const validateFiles = (imageFile) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;
    
    if (!imageFile) {
      toast.error("Please select an image file");
      return false;
    }
    
    if (!allowedTypes.includes(imageFile.type)) {
      toast.error("Please select a valid image file (JPEG, PNG, GIF, or WebP)");
      return false;
    }
    
    if (imageFile.size > maxSize) {
      toast.error("Image size should be less than 5MB");
      return false;
    }
    
    return true;
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file && validateFiles(file)) {
      setImage(file);
    } else {
      setImage(false);
      e.target.value = "";
    }
  };

  const onSubmitHandler = async (e) => {
    e.preventDefault();
    
    if (!image) {
      toast.error("Please select an image file");
      return;
    }

    if (!name.trim()) {
      toast.error("Please enter an album name");
      return;
    }

    if (!desc.trim()) {
      toast.error("Please enter an album description");
      return;
    }

    setLoading(true);
    setUploadProgress(0);
    setUploadStage("Starting upload...");

    try {
      const token = localStorage.getItem('auth_token');
      
      const formData = new FormData();
      formData.append("image", image);
      formData.append("name", name.trim());
      formData.append("desc", desc.trim());
      formData.append("bgColor", color);
      
      setUploadStage("Uploading image to Cloudinary...");
      setUploadProgress(30);

      const response = await axios.post(`${url}/api/album/add`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        },
        onUploadProgress: (progressEvent) => {
          const progress = (progressEvent.loaded / progressEvent.total) * 100;
          setUploadProgress(30 + (progress * 0.7));
        }
      });
      
      setUploadStage("Processing...");
      setUploadProgress(100);

      if (response.data.success) {
        toast.success("🎵 Album created successfully!");
        // Reset form
        setDesc("");
        setImage(false);
        setName("");
        setColor("#3B82F6");
        // Safely reset file input
        const imageInput = document.getElementById('image');
        if (imageInput) {
          imageInput.value = "";
        }
      } else {
        toast.error(response.data.message || "Something went wrong");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error(error.response?.data?.message || "Error Occurred");
    } finally {
      setLoading(false);
      setUploadProgress(0);
      setUploadStage("");
    }
  };

  return loading ? (
    <div className="grid place-items-center min-h-[80vh]">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-gray-400 border-t-green-800 rounded-full animate-spin mb-4"></div>
        <p className="text-gray-600 mb-2">{uploadStage}</p>
        <div className="w-64 bg-gray-200 rounded-full h-2.5 mb-2">
          <div 
            className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          ></div>
        </div>
        <p className="text-sm text-gray-500">{Math.round(uploadProgress)}%</p>
        <p className="text-xs text-gray-400 mt-4">This may take 10-15 seconds...</p>
      </div>
    </div>
  ) : (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Add New Album</h1>
      
      <form
        onSubmit={onSubmitHandler}
        className="flex flex-col gap-8 text-gray-600"
      >
        <div className="flex gap-8 flex-wrap">
          <div className="flex flex-col gap-4">
            <p className="font-medium">Album Cover *</p>
            <input
              onChange={handleImageChange}
              type="file"
              id="image"
              accept="image/jpeg, image/png, image/jpg, image/gif, image/webp"
              hidden
            />
            <label htmlFor="image" className="cursor-pointer">
              <img
                src={image ? URL.createObjectURL(image) : assets.upload_area}
                className="w-32 h-32 cursor-pointer object-cover rounded-lg border-2 border-dashed border-gray-300"
                alt="Album cover"
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
              Supported formats: JPEG, PNG, GIF, WebP (max 5MB)
            </p>
          </div>
          
          <div className="flex-1 min-w-[300px]">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2.5">
                <p className="font-medium">Album Name *</p>
                <input
                  onChange={(e) => setName(e.target.value)}
                  value={name}
                  type="text"
                  placeholder="Enter album name"
                  className="bg-transparent outline-green-600 border-2 border-gray-400 p-3 w-full rounded-lg"
                  required
                />
              </div>
              
              <div className="flex flex-col gap-2.5">
                <p className="font-medium">Album Description *</p>
                <input
                  onChange={(e) => setDesc(e.target.value)}
                  value={desc}
                  type="text"
                  placeholder="Enter album description"
                  className="bg-transparent outline-green-600 border-2 border-gray-400 p-3 w-full rounded-lg"
                  required
                />
              </div>
              
              <div className="flex flex-col gap-3">
                <p className="font-medium">Background Color</p>
                <div className="flex items-center gap-4">
                  <input
                    type="color"
                    onChange={(e) => setColor(e.target.value)}
                    value={color}
                    className="w-12 h-12 cursor-pointer rounded"
                  />
                  <span className="text-sm text-gray-500">{color}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="text-base bg-green-600 text-white py-3 px-16 cursor-pointer hover:bg-green-700 transition-colors disabled:bg-gray-400 rounded-lg font-medium self-start"
          disabled={!image || !name.trim() || !desc.trim()}
        >
          ADD ALBUM
        </button>
        
        {/* Upload info */}
        {image && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 w-full max-w-md">
            <p className="text-sm text-blue-700 font-medium">
              ⏱️ Upload Information
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Image: {(image.size / (1024 * 1024)).toFixed(2)} MB
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Estimated time: 10-15 seconds
            </p>
          </div>
        )}
      </form>
    </div>
  );
};

export default AddAlbum;