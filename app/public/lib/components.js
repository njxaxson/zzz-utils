/**
 * Shared Component Loader
 * Loads header and footer HTML components and injects them into the page
 */

const PAGE_TITLES = {
    'gacha': 'Gacha Odds Calculator',
    'team-builder': 'Team Builder',
    'deadly-assault': 'Deadly Assault Team Builder'
};

/**
 * Loads an HTML component and injects it into the target element
 * @param {string} componentPath - Path to the component HTML file
 * @param {string} targetSelector - CSS selector for the target element
 * @returns {Promise<Element>} The target element with injected content
 */
async function loadComponent(componentPath, targetSelector) {
    const target = document.querySelector(targetSelector);
    if (!target) {
        console.warn(`Target element "${targetSelector}" not found`);
        return null;
    }
    
    try {
        const response = await fetch(componentPath);
        if (!response.ok) {
            throw new Error(`Failed to load component: ${response.status}`);
        }
        const html = await response.text();
        target.innerHTML = html;
        return target;
    } catch (error) {
        console.error(`Error loading component from ${componentPath}:`, error);
        return null;
    }
}

/**
 * Initializes the header with proper active state and page title
 * @param {string} pageId - The current page identifier
 */
function initHeader(pageId) {
    // Set active nav link
    const navLinks = document.querySelectorAll('.site-nav .nav-link');
    navLinks.forEach(link => {
        if (link.dataset.page === pageId) {
            link.classList.add('active');
        }
    });
    
    // Set page title
    const pageTitle = document.getElementById('page-title');
    if (pageTitle && PAGE_TITLES[pageId]) {
        pageTitle.textContent = PAGE_TITLES[pageId];
    }
}

/**
 * Loads all shared components (header and footer)
 * @param {string} pageId - The current page identifier for navigation highlighting
 * @returns {Promise<void>}
 */
async function loadSharedComponents(pageId) {
    // Load components in parallel
    const [headerLoaded] = await Promise.all([
        loadComponent('components/header.html', '#header-container'),
        loadComponent('components/footer.html', '#footer-container')
    ]);
    
    // Initialize header after it's loaded
    if (headerLoaded) {
        initHeader(pageId);
    }
}

// Export for module usage
export { loadSharedComponents, loadComponent, initHeader };

