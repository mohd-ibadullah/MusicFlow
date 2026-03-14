// components/SkeletonLoader.jsx
import React from "react";

const SkeletonLoader = ({ type = "card", count = 1, className = "" }) => {
  const renderSkeleton = () => {
    switch (type) {
      case "card":
        return (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 animate-pulse">
            <div className="w-full aspect-square bg-gray-200 dark:bg-gray-700 rounded-xl mb-4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </div>
          </div>
        );
      
      case "list":
        return (
          <div className="flex items-center space-x-4 p-4 animate-pulse">
            <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </div>
          </div>
        );
      
      case "text":
        return (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/6"></div>
          </div>
        );
      
      case "player":
        return (
          <div className="h-20 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 animate-pulse">
            <div className="max-w-7xl mx-auto h-full flex items-center justify-between">
              <div className="flex items-center space-x-4 min-w-0 flex-1">
                <div className="w-14 h-14 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                </div>
              </div>
              <div className="flex items-center space-x-6 flex-1 max-w-md">
                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
              </div>
              <div className="flex items-center space-x-3 min-w-0 flex-1 justify-end">
                <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
              </div>
            </div>
          </div>
        );
      
      default:
        return (
          <div className="w-full h-32 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
        );
    }
  };

  return (
    <div className={className}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
          {renderSkeleton()}
        </div>
      ))}
    </div>
  );
};

export default SkeletonLoader;

