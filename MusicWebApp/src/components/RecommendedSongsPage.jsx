import React, { useEffect, useMemo, useState } from "react";
import { Headphones } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import SongCard from "./SongCard";
import SkeletonLoader from "./SkeletonLoader";
import { useToast } from "../context/ThemeContext";
import { usePlayer } from "../context/PlayerContext";
import { useAuth } from "../context/AuthContext";

const RECOMMENDATION_LIMIT = 50;

const RecommendedSongsPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { playWithId, recommendations: contextRecommendations } = usePlayer();
  const { isAuthenticated, user } = useAuth();
  const [recommendations, setRecommendations] = useState(contextRecommendations || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const apiBase = import.meta.env.VITE_API_URL ?? "";

  useEffect(() => {
    let cancelled = false;
    const fetchRecommendations = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const authUserId = user?._id || user?.id || null;
        const endpoint =
          isAuthenticated && authUserId
            ? `${apiBase}/api/ai/recommendations?limit=${RECOMMENDATION_LIMIT}`
            : `${apiBase}/api/song/recommendations`;

        const res = await axios.get(endpoint);
        if (cancelled) return;
        const data = Array.isArray(res.data?.recommendations)
          ? res.data.recommendations
          : [];
        setRecommendations(data.slice(0, RECOMMENDATION_LIMIT));
      } catch (err) {
        if (cancelled) return;
        console.error("RecommendedSongsPage fetch error:", err);
        setError(
          err.response?.data?.message ||
            "We couldn't load recommendations right now."
        );
        setRecommendations([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchRecommendations();

    return () => {
      cancelled = true;
    };
  }, [apiBase, isAuthenticated, user]);

  const hasSongs = useMemo(
    () => Array.isArray(recommendations) && recommendations.length > 0,
    [recommendations]
  );

  const handleBack = () => {
    navigate(-1);
  };

  const handlePlayAll = () => {
    if (hasSongs) {
      playWithId(recommendations[0]._id, recommendations);
      showToast(
        `Playing ${recommendations.length} recommended ${
          recommendations.length === 1 ? "song" : "songs"
        }`,
        "success"
      );
    } else {
      showToast("No recommended songs to play yet", "info");
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleBack}
            className="btn-ghost p-2 rounded-lg border border-gray-200 dark:border-gray-700"
            title="Go back"
          >
            <svg
              className="w-5 h-5 text-gray-600 dark:text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <div>
            <h1 className="text-h1 text-gray-900 dark:text-gray-100">
              Recommended For You
            </h1>
            <p className="text-base text-gray-600 dark:text-gray-400 mt-1">
              {hasSongs
                ? `${recommendations.length} recommended ${
                    recommendations.length === 1 ? "song" : "songs"
                  }`
                : "Personalized recommendations based on your listening"}
            </p>
          </div>
        </div>

        <button
          onClick={handlePlayAll}
          disabled={!hasSongs}
          className="btn-primary"
        >
          Play All
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <SkeletonLoader
          type="card"
          count={10}
          className="songs-grid"
        />
      ) : hasSongs ? (
        <div className="songs-grid">
          {recommendations.map((song, index) => (
            <div
              key={song._id || index}
              className="animate-slide-up"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <SongCard song={song} playlist={recommendations} />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">
            <Headphones className="w-12 h-12 text-gray-500 dark:text-gray-400 mx-auto" aria-hidden />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            {error ? "Unable to load recommendations" : "No recommendations yet"}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto">
            {error
              ? error
              : "Start listening to songs and liking your favorites, and we'll build personalized recommendations for you."}
          </p>
          <button
            onClick={() => navigate("/songs")}
            className="btn-primary px-8"
          >
            Browse All Songs
          </button>
        </div>
      )}
    </div>
  );
};

export default RecommendedSongsPage;

