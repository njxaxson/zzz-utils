/**
 * Custom Dropdown Component
 * A styled, accessible dropdown replacement for native select elements
 * 
 * Usage:
 *   import { CustomDropdown } from './lib/custom-dropdown.js';
 *   
 *   const dropdown = new CustomDropdown({
 *     container: document.getElementById('my-container'),
 *     id: 'my-dropdown',
 *     options: [
 *       { value: '0', label: 'Option 1' },
 *       { value: '1', label: 'Option 2', selected: true }
 *     ],
 *     onChange: (value, label) => console.log('Selected:', value, label)
 *   });
 */

export class CustomDropdown {
    constructor(config) {
        this.container = config.container;
        this.id = config.id;
        this.options = config.options || [];
        this.onChange = config.onChange || (() => {});
        this.className = config.className || '';
        
        // Find initially selected option
        const selectedOption = this.options.find(opt => opt.selected) || this.options[0];
        this.selectedValue = selectedOption?.value ?? '';
        this.selectedLabel = selectedOption?.label ?? '';
        
        this.isOpen = false;
        this.focusedIndex = -1;
        
        this.render();
        this.attachEvents();
    }
    
    render() {
        // Create the dropdown structure
        this.element = document.createElement('div');
        this.element.className = `custom-dropdown ${this.className}`.trim();
        this.element.id = this.id;
        this.element.setAttribute('tabindex', '0');
        this.element.setAttribute('role', 'combobox');
        this.element.setAttribute('aria-haspopup', 'listbox');
        this.element.setAttribute('aria-expanded', 'false');
        
        // Selected display
        this.display = document.createElement('div');
        this.display.className = 'custom-dropdown-display';
        this.display.textContent = this.selectedLabel;
        
        // Arrow indicator
        this.arrow = document.createElement('span');
        this.arrow.className = 'custom-dropdown-arrow';
        this.arrow.innerHTML = '&#9662;'; // Down triangle
        this.display.appendChild(this.arrow);
        
        // Options list
        this.listbox = document.createElement('div');
        this.listbox.className = 'custom-dropdown-options';
        this.listbox.setAttribute('role', 'listbox');
        this.listbox.id = `${this.id}-listbox`;
        
        this.renderOptions();
        
        this.element.appendChild(this.display);
        this.element.appendChild(this.listbox);
        
        // Add to container
        this.container.appendChild(this.element);
    }
    
    renderOptions() {
        this.listbox.innerHTML = '';
        this.optionElements = [];
        
        this.options.forEach((opt, index) => {
            const optEl = document.createElement('div');
            optEl.className = 'custom-dropdown-option';
            if (opt.value === this.selectedValue) {
                optEl.classList.add('selected');
            }
            optEl.setAttribute('role', 'option');
            optEl.setAttribute('data-value', opt.value);
            optEl.setAttribute('data-index', index);
            optEl.textContent = opt.label;
            
            this.listbox.appendChild(optEl);
            this.optionElements.push(optEl);
        });
    }
    
    attachEvents() {
        // Toggle on click
        this.display.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        
        // Also toggle when clicking the main element (for keyboard focus)
        this.element.addEventListener('click', (e) => {
            if (e.target === this.element) {
                this.toggle();
            }
        });
        
        // Select option on click
        this.listbox.addEventListener('click', (e) => {
            const optionEl = e.target.closest('.custom-dropdown-option');
            if (optionEl) {
                const value = optionEl.getAttribute('data-value');
                const index = parseInt(optionEl.getAttribute('data-index'), 10);
                this.select(index);
            }
        });
        
        // Keyboard navigation
        this.element.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    if (this.isOpen && this.focusedIndex >= 0) {
                        this.select(this.focusedIndex);
                    } else {
                        this.toggle();
                    }
                    break;
                case 'Escape':
                    if (this.isOpen) {
                        e.preventDefault();
                        this.close();
                    }
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if (!this.isOpen) {
                        this.open();
                    } else {
                        this.focusNext();
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (!this.isOpen) {
                        this.open();
                    } else {
                        this.focusPrev();
                    }
                    break;
                case 'Tab':
                    if (this.isOpen) {
                        this.close();
                    }
                    break;
            }
        });
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.element.contains(e.target)) {
                this.close();
            }
        });
    }
    
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
    
    open() {
        this.isOpen = true;
        this.element.classList.add('open');
        this.element.setAttribute('aria-expanded', 'true');
        
        // Focus the currently selected option
        const selectedIndex = this.options.findIndex(opt => opt.value === this.selectedValue);
        this.focusedIndex = selectedIndex >= 0 ? selectedIndex : 0;
        this.updateFocus();
    }
    
    close() {
        this.isOpen = false;
        this.element.classList.remove('open');
        this.element.setAttribute('aria-expanded', 'false');
        this.focusedIndex = -1;
        this.clearFocus();
    }
    
    select(index) {
        if (index < 0 || index >= this.options.length) return;
        
        const option = this.options[index];
        this.selectedValue = option.value;
        this.selectedLabel = option.label;
        
        // Update display
        this.display.textContent = this.selectedLabel;
        this.display.appendChild(this.arrow);
        
        // Update selected class
        this.optionElements.forEach((el, i) => {
            el.classList.toggle('selected', i === index);
        });
        
        this.close();
        this.onChange(this.selectedValue, this.selectedLabel);
    }
    
    focusNext() {
        if (this.focusedIndex < this.options.length - 1) {
            this.focusedIndex++;
            this.updateFocus();
        }
    }
    
    focusPrev() {
        if (this.focusedIndex > 0) {
            this.focusedIndex--;
            this.updateFocus();
        }
    }
    
    updateFocus() {
        this.optionElements.forEach((el, i) => {
            el.classList.toggle('focused', i === this.focusedIndex);
        });
        
        // Scroll focused option into view
        if (this.focusedIndex >= 0 && this.optionElements[this.focusedIndex]) {
            this.optionElements[this.focusedIndex].scrollIntoView({ block: 'nearest' });
        }
    }
    
    clearFocus() {
        this.optionElements.forEach(el => el.classList.remove('focused'));
    }
    
    // Public API
    getValue() {
        return this.selectedValue;
    }
    
    setValue(value) {
        const index = this.options.findIndex(opt => opt.value === value);
        if (index >= 0) {
            this.select(index);
        }
    }
    
    setOptions(newOptions) {
        this.options = newOptions;
        const selectedOption = this.options.find(opt => opt.selected) || this.options[0];
        this.selectedValue = selectedOption?.value ?? '';
        this.selectedLabel = selectedOption?.label ?? '';
        this.display.textContent = this.selectedLabel;
        this.display.appendChild(this.arrow);
        this.renderOptions();
    }
    
    // Show/hide the dropdown
    show() {
        this.element.style.display = '';
    }
    
    hide() {
        this.element.style.display = 'none';
        if (this.isOpen) this.close();
    }
    
    destroy() {
        this.element.remove();
    }
}

/**
 * Initialize a custom dropdown from an existing native select element
 * Replaces the select with a custom dropdown while preserving its value and options
 */
export function replaceSelect(selectElement, config = {}) {
    const options = Array.from(selectElement.options).map(opt => ({
        value: opt.value,
        label: opt.textContent,
        selected: opt.selected
    }));
    
    const container = document.createElement('div');
    container.className = 'custom-dropdown-wrapper';
    selectElement.parentNode.insertBefore(container, selectElement);
    
    // Hide the original select but keep it for form submission
    selectElement.style.display = 'none';
    
    const dropdown = new CustomDropdown({
        container,
        id: selectElement.id ? `${selectElement.id}-custom` : `dropdown-${Date.now()}`,
        options,
        className: config.className || '',
        onChange: (value, label) => {
            // Sync with hidden select
            selectElement.value = value;
            selectElement.dispatchEvent(new Event('change', { bubbles: true }));
            if (config.onChange) {
                config.onChange(value, label);
            }
        }
    });
    
    // Store reference to dropdown on the select element
    selectElement._customDropdown = dropdown;
    
    return dropdown;
}




