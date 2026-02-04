/**
 * VirtualSpotList Component
 *
 * Virtualized scrolling implementation for the DX spot list.
 * Only renders visible items plus a small buffer for smooth scrolling.
 * Handles dynamic item heights and maintains scroll position.
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  memo,
  type ReactNode,
  type CSSProperties,
} from "react";

interface VirtualListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Height of each item in pixels */
  itemHeight: number;
  /** Height of the container (can be number or CSS string) */
  containerHeight: number | string;
  /** Buffer items to render above and below visible area */
  overscan?: number;
  /** Render function for each item */
  renderItem: (item: T, index: number, style: CSSProperties) => ReactNode;
  /** Optional key extractor */
  getKey?: (item: T, index: number) => string | number;
  /** Class name for the container */
  className?: string;
  /** Class name for the inner scrollable area */
  innerClassName?: string;
  /** Callback when scroll position changes */
  onScroll?: (scrollTop: number) => void;
  /** ARIA label for accessibility */
  ariaLabel?: string;
}

/**
 * Calculate which items should be rendered based on scroll position
 */
function getVisibleRange(
  scrollTop: number,
  containerHeight: number,
  itemHeight: number,
  itemCount: number,
  overscan: number,
): { startIndex: number; endIndex: number; offsetY: number } {
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const endIndex = Math.min(
    itemCount - 1,
    startIndex + visibleCount + overscan * 2,
  );
  const offsetY = startIndex * itemHeight;

  return { startIndex, endIndex, offsetY };
}

/**
 * VirtualList Component
 *
 * Generic virtualized list that only renders visible items.
 * Significantly improves performance for large lists (100+ items).
 */
function VirtualListInner<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 5,
  renderItem,
  getKey,
  className = "",
  innerClassName = "",
  onScroll,
  ariaLabel,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeightPx, setContainerHeightPx] = useState(0);

  // Measure container height if given as CSS string
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateHeight = () => {
      setContainerHeightPx(container.clientHeight);
    };

    updateHeight();

    // Use ResizeObserver for dynamic sizing
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [containerHeight]);

  // Handle scroll events with throttling
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const newScrollTop = e.currentTarget.scrollTop;
      setScrollTop(newScrollTop);
      onScroll?.(newScrollTop);
    },
    [onScroll],
  );

  // Calculate visible range
  const { startIndex, endIndex, offsetY } = useMemo(
    () =>
      getVisibleRange(
        scrollTop,
        containerHeightPx ||
          (typeof containerHeight === "number" ? containerHeight : 400),
        itemHeight,
        items.length,
        overscan,
      ),
    [
      scrollTop,
      containerHeightPx,
      containerHeight,
      itemHeight,
      items.length,
      overscan,
    ],
  );

  // Get visible items
  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex + 1),
    [items, startIndex, endIndex],
  );

  // Total height of all items
  const totalHeight = items.length * itemHeight;

  // Height style for container
  const containerStyle: CSSProperties = useMemo(() => {
    if (typeof containerHeight === "number") {
      return { height: containerHeight };
    }
    return { height: containerHeight };
  }, [containerHeight]);

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto overflow-x-hidden ${className}`}
      style={containerStyle}
      onScroll={handleScroll}
      role="list"
      aria-label={ariaLabel}
    >
      {/* Inner container with total height for scrollbar */}
      <div
        className={`relative ${innerClassName}`}
        style={{ height: totalHeight }}
      >
        {/* Positioned container for visible items */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${offsetY}px)`,
          }}
        >
          {visibleItems.map((item, i) => {
            const actualIndex = startIndex + i;
            const key = getKey ? getKey(item, actualIndex) : actualIndex;
            const style: CSSProperties = {
              height: itemHeight,
              boxSizing: "border-box",
            };
            return (
              <div key={key} role="listitem">
                {renderItem(item, actualIndex, style)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Memoized version to prevent unnecessary re-renders
export const VirtualList = memo(VirtualListInner) as typeof VirtualListInner;

/**
 * Hook to manage virtual list state
 *
 * Useful when you need external control over the virtual list
 */
export function useVirtualList<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan = 5,
) {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleRange = useMemo(
    () =>
      getVisibleRange(
        scrollTop,
        containerHeight,
        itemHeight,
        items.length,
        overscan,
      ),
    [scrollTop, containerHeight, itemHeight, items.length, overscan],
  );

  const visibleItems = useMemo(
    () => items.slice(visibleRange.startIndex, visibleRange.endIndex + 1),
    [items, visibleRange.startIndex, visibleRange.endIndex],
  );

  const scrollToIndex = useCallback(
    (index: number, containerElement: HTMLElement | null) => {
      if (!containerElement) {
        return;
      }
      const targetScrollTop = index * itemHeight;
      containerElement.scrollTop = targetScrollTop;
      setScrollTop(targetScrollTop);
    },
    [itemHeight],
  );

  const scrollToItem = useCallback(
    (predicate: (item: T) => boolean, containerElement: HTMLElement | null) => {
      const index = items.findIndex(predicate);
      if (index !== -1) {
        scrollToIndex(index, containerElement);
      }
    },
    [items, scrollToIndex],
  );

  return {
    scrollTop,
    setScrollTop,
    visibleRange,
    visibleItems,
    scrollToIndex,
    scrollToItem,
    totalHeight: items.length * itemHeight,
  };
}

/**
 * Variable height virtual list implementation
 *
 * For items with dynamic heights, this version estimates positions
 * based on an average height and adjusts as items are measured.
 */
export function useVariableHeightVirtualList<T>(
  items: T[],
  estimatedItemHeight: number,
  containerHeight: number,
  overscan = 5,
) {
  const [scrollTop, setScrollTop] = useState(0);
  const measuredHeights = useRef<Map<number, number>>(new Map());
  const [forceUpdate, setForceUpdate] = useState(0);

  // Record measured height for an item
  const setItemHeight = useCallback((index: number, height: number) => {
    const current = measuredHeights.current.get(index);
    if (current !== height) {
      measuredHeights.current.set(index, height);
      setForceUpdate((v) => v + 1);
    }
  }, []);

  // Get height for item (measured or estimated)
  const getItemHeight = useCallback(
    (index: number) => {
      return measuredHeights.current.get(index) ?? estimatedItemHeight;
    },
    [estimatedItemHeight],
  );

  // Calculate positions and visible range
  const { startIndex, endIndex, offsetY, totalHeight } = useMemo(() => {
    // Calculate cumulative heights
    let cumHeight = 0;
    let startIdx = 0;
    let foundStart = false;

    for (let i = 0; i < items.length; i++) {
      const h = getItemHeight(i);
      if (!foundStart && cumHeight + h > scrollTop) {
        startIdx = Math.max(0, i - overscan);
        foundStart = true;
      }
      cumHeight += h;
    }

    // Find end index
    let visibleHeight = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < items.length; i++) {
      visibleHeight += getItemHeight(i);
      endIdx = i;
      if (visibleHeight > containerHeight + overscan * estimatedItemHeight) {
        break;
      }
    }

    endIdx = Math.min(items.length - 1, endIdx + overscan);

    // Calculate offset for start index
    let offset = 0;
    for (let i = 0; i < startIdx; i++) {
      offset += getItemHeight(i);
    }

    return {
      startIndex: startIdx,
      endIndex: endIdx,
      offsetY: offset,
      totalHeight: cumHeight,
    };
    // Include forceUpdate to recalculate when heights change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scrollTop,
    containerHeight,
    items.length,
    overscan,
    estimatedItemHeight,
    forceUpdate,
    getItemHeight,
  ]);

  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex + 1),
    [items, startIndex, endIndex],
  );

  return {
    scrollTop,
    setScrollTop,
    startIndex,
    endIndex,
    offsetY,
    visibleItems,
    totalHeight,
    setItemHeight,
    getItemHeight,
  };
}

export default VirtualList;
