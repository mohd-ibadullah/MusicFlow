// components/CarouselSection.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const ITEMS_PER_PAGE = 4;

/**
 * Reusable carousel section: page-based navigation, grid layout, arrow navigation, "See all" link.
 * @param {string} title - Section title
 * @param {Array} items - List of items to display
 * @param {number} totalCount - Total count for "See all (count)"
 * @param {string} seeAllRoute - Route for "See all" navigation
 * @param {function} renderItem - (item, index) => ReactNode
 * @param {string} [scrollKey] - Unique key for the section (for multiple carousels)
 */
const CarouselSection = ({
  title,
  items = [],
  totalCount,
  seeAllRoute,
  renderItem,
  scrollKey = "default",
}) => {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const startIndex = page * ITEMS_PER_PAGE;
  const pageItems = items.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const canGoLeft = page > 0;
  const canGoRight = page < totalPages - 1;

  useEffect(() => {
    setPage(0);
  }, [items, scrollKey]);

  const goLeft = () => {
    if (canGoLeft) setPage((p) => p - 1);
  };

  const goRight = () => {
    if (canGoRight) setPage((p) => p + 1);
  };

  const handleSeeAll = () => {
    if (seeAllRoute) navigate(seeAllRoute);
  };

  if (items.length === 0) return null;

  return (
    <section className="animate-slide-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {items.length} {items.length === 1 ? "item" : "items"}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={goLeft}
              disabled={!canGoLeft}
              className="btn-arrow"
              title="Previous page"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goRight}
              disabled={!canGoRight}
              className="btn-arrow"
              title="Next page"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          {totalCount > 0 && seeAllRoute && (
            <button
              onClick={handleSeeAll}
              className="btn-ghost text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-4 py-2"
            >
              See all ({totalCount})
            </button>
          )}
        </div>
      </div>
      <div className="songs-grid">
        {pageItems.map((item, index) => (
          <div key={item._id ?? startIndex + index} className="overflow-visible">
            {renderItem(item, startIndex + index)}
          </div>
        ))}
      </div>
    </section>
  );
};

export default CarouselSection;
