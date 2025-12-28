/**
 * Touch Interaction Utilities
 * Provides touch-specific event handling like Long Press
 */

/**
 * Adds long-press detection to an element
 * @param {HTMLElement} element - The element to attach listeners to
 * @param {Function} callback - Function to call on long press (receives the original event)
 * @param {number} duration - Duration in ms to consider a long press (default: 500ms)
 */
export function addLongPressListener(element, callback, duration = 500) {
    let timer = null;
    let isLongPress = false;
    let startX = 0;
    let startY = 0;
    const MOVE_TOLERANCE = 10; // pixels

    const start = (e) => {
        // Only trigger for single touch
        if (e.touches && e.touches.length > 1) return;

        isLongPress = false;
        if (e.touches) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }

        timer = setTimeout(() => {
            isLongPress = true;
            if (window.navigator.vibrate) {
                window.navigator.vibrate(50); // Haptic feedback
            }
            callback(e);
        }, duration);
    };

    const cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const move = (e) => {
        if (!timer) return;

        // If moved too much, cancel the long press
        if (e.touches) {
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            
            if (Math.abs(currentX - startX) > MOVE_TOLERANCE || 
                Math.abs(currentY - startY) > MOVE_TOLERANCE) {
                cancel();
            }
        }
    };

    const end = (e) => {
        // If it was a long press, prevent the click event that follows
        if (isLongPress) {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
        }
        cancel();
    };

    element.addEventListener('touchstart', start, { passive: false });
    element.addEventListener('touchmove', move, { passive: true });
    element.addEventListener('touchend', end, { passive: false });
    element.addEventListener('touchcancel', cancel);

    // Return cleanup function
    return () => {
        element.removeEventListener('touchstart', start);
        element.removeEventListener('touchmove', move);
        element.removeEventListener('touchend', end);
        element.removeEventListener('touchcancel', cancel);
    };
}


