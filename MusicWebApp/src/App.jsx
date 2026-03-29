// App.jsx
import React, { useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import MobileSidebar from "./components/MobileSidebar";
import Player from "./components/Player";
import Display from "./components/Display";
import DisplayPlaylist from "./components/DisplayPlaylist";
import CreatePlaylistModal from "./components/CreatePlaylistModal";
import PlayerContextProvider from "./context/PlayerContext";
import { ThemeProvider } from "./context/ThemeContext"; // Import ThemeProvider
import { AuthProvider } from "./context/AuthContext";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import PrivateRoute from "./components/PrivateRoute";
import ErrorBoundary from "./components/ErrorBoundary";

const AppContent = () => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-all duration-300 font-inter overflow-x-hidden">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <Display onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)} />
          <div className="flex-shrink-0">
            <Player />
          </div>
        </main>
      </div>
      <MobileSidebar 
        isOpen={isMobileSidebarOpen} 
        onClose={() => setIsMobileSidebarOpen(false)} 
      />
      <CreatePlaylistModal />
    </div>
  );
};

const App = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <PlayerContextProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/*" element={
                <PrivateRoute>
                  <AppContent />
                </PrivateRoute>
              } />
            </Routes>
          </PlayerContextProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;