import React, { useState } from "react";
import { assets } from "../assets/assets.js";
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
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/gif", "image/webp"];
    if (!imageFile) { toast.error("Please select an image"); return false; }
    if (!allowedTypes.includes(imageFile.type)) { toast.error("Invalid image format"); return false; }
    if (imageFile.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return false; }
    return true;
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file && validateFiles(file)) setImage(file);
    else { setImage(false); e.target.value = ""; }
  };

  const onSubmitHandler = async (e) => {
    e.preventDefault();
    if (!image) { toast.error("Please select an image"); return; }
    if (!name.trim()) { toast.error("Enter an album name"); return; }
    if (!desc.trim()) { toast.error("Enter a description"); return; }

    setLoading(true);
    setUploadProgress(0);
    setUploadStage("Uploading cover…");

    try {
      const token = localStorage.getItem("auth_token");
      const formData = new FormData();
      formData.append("image", image);
      formData.append("name", name.trim());
      formData.append("desc", desc.trim());
      formData.append("bgColor", color);

      setUploadProgress(30);

      const response = await axios.post(`${url}/api/album/add`, formData, {
        headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` },
        onUploadProgress: (progressEvent) => {
          setUploadProgress(30 + (progressEvent.loaded / progressEvent.total) * 70);
        },
      });

      setUploadStage("Finalizing…");
      setUploadProgress(100);

      if (response.data.success) {
        toast.success("Album created successfully");
        setDesc(""); setImage(false); setName(""); setColor("#3B82F6");
        const imageInput = document.getElementById("image");
        if (imageInput) imageInput.value = "";
      } else {
        toast.error(response.data.message || "Something went wrong");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Error occurred");
    } finally {
      setLoading(false);
      setUploadProgress(0);
      setUploadStage("");
    }
  };

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
      <h1 className="text-page-title mb-1">Add New Album</h1>
      <p className="text-page-subtitle mb-8">Create an album to group your songs</p>

      <form onSubmit={onSubmitHandler} className="space-y-7">
        <div className="flex gap-6 flex-wrap items-start">
          {/* Cover upload */}
          <div className="space-y-2">
            <label className="text-label">Album Cover *</label>
            <input onChange={handleImageChange} type="file" id="image" accept="image/jpeg,image/png,image/jpg,image/gif,image/webp" hidden />
            <label htmlFor="image" className="block transform transition-transform duration-200 active:scale-[0.98] hover:scale-[1.01]">
              {image ? (
                <img src={URL.createObjectURL(image)} className="upload-zone shadow-md ring-2 ring-blue-50/50" alt="Cover" />
              ) : (
                <div className="upload-zone flex flex-col items-center justify-center gap-2.5 bg-gray-50/40 border-gray-200/60 shadow-inner">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-gray-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                  <span className="text-xs font-semibold text-gray-500 tracking-tight">Set Cover</span>
                </div>
              )}
            </label>
            {image && (
              <p className="text-xs text-emerald-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                {image.name}
              </p>
            )}
            <p className="text-[11px] text-gray-400">JPEG, PNG, WebP · Max 5 MB</p>
          </div>

          {/* Fields */}
          <div className="flex-1 min-w-[260px] space-y-5">
            <div>
              <label className="text-label">Album Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input-admin" placeholder="Enter album name" required />
            </div>
            <div>
              <label className="text-label">Description *</label>
              <input value={desc} onChange={(e) => setDesc(e.target.value)} className="input-admin" placeholder="A brief description" required />
            </div>
            <div>
              <label className="text-label">Background Color</label>
              <div className="flex items-center gap-3 bg-gray-50/30 p-2 rounded-xl border border-gray-100 w-fit">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 cursor-pointer rounded-lg border border-gray-200 overflow-hidden" />
                <span className="text-[13px] text-gray-600 font-mono font-medium lowercase">{color}</span>
                <div className="w-12 h-6 rounded-md shadow-sm border border-white" style={{ backgroundColor: color }}></div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="btn-admin-primary"
          disabled={!image || !name.trim() || !desc.trim()}
        >
          Create Album
        </button>
      </form>
    </div>
  );
};

export default AddAlbum;