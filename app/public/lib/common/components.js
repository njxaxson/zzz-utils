/**
 * Shared Component Loader
 * Loads header and footer HTML components and injects them into the page
 */

const PAGE_TITLES = {
    'gacha': 'Gacha Odds Calculator',
    'team-builder': 'Team Builder',
    'deadly-assault': 'Deadly Assault Team Builder',
    'pull-recommendations': 'Pull Recommendations',
    'team-recommendations': 'Team Recommendations',
    'disc-calculator': 'Disc Calculator',
    'character-summary': 'Character Summary',
    'agent-detail': 'Agent Teams',
    'tier-list': 'Tier List',
    'favorites': 'Favorite Teams'
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
function initMobileNav() {
    const toggle = document.querySelector('.nav-toggle');
    const nav = document.getElementById('site-nav');
    if (!toggle || !nav) return;

    const mobileQuery = window.matchMedia('(max-width: 768px)');

    function setOpen(open) {
        nav.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    }

    function closeMenu() {
        setOpen(false);
    }

    toggle.addEventListener('click', () => {
        setOpen(!nav.classList.contains('is-open'));
    });

    nav.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMenu();
            closeGroups();
        }
    });

    mobileQuery.addEventListener('change', (e) => {
        if (!e.matches) closeMenu();
    });
}

// Desktop dropdown groups: hover opens them by CSS; click and keyboard toggle `is-open`.
// On phones the groups are always expanded sections, so these handlers do nothing visible.
function closeGroups(except = null) {
    document.querySelectorAll('.nav-group.is-open').forEach(group => {
        if (group === except) return;
        group.classList.remove('is-open');
        group.querySelector('.nav-group-toggle').setAttribute('aria-expanded', 'false');
    });
}

function initNavGroups() {
    document.querySelectorAll('.nav-group').forEach(group => {
        const toggle = group.querySelector('.nav-group-toggle');
        toggle.addEventListener('click', () => {
            const open = !group.classList.contains('is-open');
            closeGroups(group);
            group.classList.toggle('is-open', open);
            toggle.setAttribute('aria-expanded', String(open));
        });
        group.addEventListener('focusout', e => {
            if (!group.contains(e.relatedTarget)) closeGroups();
        });
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('.nav-group')) closeGroups();
    });
}

function initHeader(pageId) {
    // Set active nav link
    const navLinks = document.querySelectorAll('.site-nav .nav-link');
    navLinks.forEach(link => {
        if (link.dataset.page === pageId) {
            link.classList.add('active');
            link.closest('.nav-group')?.classList.add('has-active');
        }
    });
    
    // Set page title
    const pageTitle = document.getElementById('page-title');
    if (pageTitle && PAGE_TITLES[pageId]) {
        pageTitle.textContent = PAGE_TITLES[pageId];
    }

    initNavGroups();
    initMobileNav();
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



