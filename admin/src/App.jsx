import React from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Routes, Route, Navigate } from "react-router-dom";
import AddSong from "./pages/AddSong";
import ListAlbum from "./pages/ListAlbum";
import ListSong from "./pages/ListSong";
import AddAlbum from "./pages/AddAlbum";
import AdminLogin from "./pages/AdminLogin";
import AdminAnalytics from "./pages/AdminAnalytics";
import SideBar from "./components/SideBar";
import Navbar from "./components/Navbar";
import TestUpload from "./components/TestUpload";
import AdminProtectedRoute from "./components/AdminProtectedRoute";

export const url = import.meta.env.VITE_API_URL ?? "";

const App = () => {
  return (
    <div className="min-h-screen">
      <ToastContainer />
      <Routes>
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route 
          path="/*" 
          element={
            <AdminProtectedRoute>
              <div className="flex min-h-screen">
                <SideBar />
                <div className="flex-1 flex flex-col">
                  <Navbar />
                  <main className="flex-1 overflow-y-auto bg-gradient-to-br from-gray-50 to-gray-100 p-5 sm:p-8">
                    <Routes>
                      <Route path="/" element={<Navigate to="/list-song" replace />} />
                      <Route path="/add-song" element={<AddSong />} />
                      <Route path="/add-album" element={<AddAlbum />} />
                      <Route path="/list-album" element={<ListAlbum />} />
                      <Route path="/list-song" element={<ListSong />} />
                      <Route path="/analytics" element={<AdminAnalytics />} />
                      <Route path="/test-upload" element={<TestUpload />} />
                    </Routes>
                  </main>
                </div>
              </div>
            </AdminProtectedRoute>
          } 
        />
      </Routes>
    </div>
  );
};

export default App;