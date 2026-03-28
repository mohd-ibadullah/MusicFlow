import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

const Tooltip = ({ children, content, position = "top" }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);

  const calculatePosition = () => {
    if (!triggerRef.current) return;
    
    const rect = triggerRef.current.getBoundingClientRect();
    const scrollY = window.scrollY;
    
    // Default to top
    let top = rect.top + scrollY - 30;
    let left = rect.left + rect.width / 2;
    
    if (position === "bottom") {
      top = rect.bottom + scrollY + 5;
    }
    
    setCoords({ top, left });
  };

  useEffect(() => {
    if (isVisible) {
      calculatePosition();
      window.addEventListener("scroll", calculatePosition);
      window.addEventListener("resize", calculatePosition);
    }
    return () => {
      window.removeEventListener("scroll", calculatePosition);
      window.removeEventListener("resize", calculatePosition);
    };
  }, [isVisible, position]);

  return (
    <>
      <div 
        ref={triggerRef}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="inline-block"
      >
        {children}
      </div>
      
      {isVisible && createPortal(
        <div 
          className="absolute z-[9999] pointer-events-none whitespace-nowrap bg-gray-900 border border-gray-700 text-white text-xs font-medium px-2 py-1 rounded shadow-lg animate-fade-in transition-opacity duration-200"
          style={{
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            transform: "translateX(-50%)",
            opacity: isVisible ? 1 : 0
          }}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  );
};

export default Tooltip;
