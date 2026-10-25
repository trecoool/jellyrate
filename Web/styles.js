// All JellyRate CSS, injected once into <head>.

let stylesInjected = false;

export function injectStyles() {
    if (stylesInjected || document.getElementById('jellyrate-styles')) return;
    const style = document.createElement('style');
    style.id = 'jellyrate-styles';
    style.textContent = `
        .jellyrate-container {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 0;
            flex-wrap: wrap;
        }
        .jellyrate-stars {
            display: inline-flex;
            gap: 2px;
            cursor: pointer;
        }
        .jellyrate-star {
            font-size: 1.5em;
            color: #555;
            transition: color 0.15s, transform 0.15s;
            user-select: none;
            line-height: 1;
        }
        .jellyrate-star:hover,
        .jellyrate-star.hovered {
            transform: scale(1.15);
        }
        .jellyrate-star.active {
            color: #e6c419;
        }
        .jellyrate-star.hovered {
            color: #f0d040;
        }
        .jellyrate-stats {
            color: rgba(255,255,255,0.6);
            font-size: 0.9em;
        }
        .jellyrate-tooltip-anchor {
            cursor: pointer;
        }
        .jellyrate-tooltip {
            position: fixed;
            background: rgba(20, 20, 20, 0.95);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 6px;
            padding: 6px 10px;
            white-space: nowrap;
            z-index: 10000;
            font-size: 0.85em;
            color: rgba(255,255,255,0.85);
            pointer-events: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            line-height: 1.6;
        }

        /* Media info row style — matches Jellyfin's Video/Audio/Subtitles layout */
        .jellyrate-info-row {
            display: flex;
            align-items: center;
            padding: 0.25em 0;
            margin-left: 2em;
            padding-left: 2em;
            margin-top: 0.75em;
        }
        .jellyrate-info-label {
            flex-shrink: 0;
            width: 8em;
            color: rgba(255,255,255,0.6);
            font-size: inherit;
        }
        .jellyrate-info-value {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            flex: 1;
        }

        /* Card overlay badge */
        .jellyrate-card-badge {
            position: absolute;
            top: 4px;
            right: 4px;
            background: rgba(0,0,0,0.75);
            color: #e6c419;
            font-size: 0.75em;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
            z-index: 2;
            display: flex;
            align-items: center;
            gap: 3px;
            line-height: 1.2;
        }
        .jellyrate-card-badge .star {
            font-size: 1em;
        }

        /* User Rated view content */
        .jellyrate-rated-empty {
            padding: 2em;
            color: rgba(255,255,255,0.5);
            font-size: 0.95em;
        }

        /* Rated view toolbar */
        .jellyrate-toolbar {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            padding: 0.75em 1em;
        }
        .jellyrate-toolbar-toggle {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 0.3em 0.8em;
            background: rgba(255,255,255,0.08);
            color: rgba(255,255,255,0.7);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85em;
            font-family: inherit;
            white-space: nowrap;
            transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .jellyrate-toolbar-toggle.active {
            background: rgba(230, 196, 25, 0.15);
            color: #e6c419;
            border-color: rgba(230, 196, 25, 0.4);
        }
        .jellyrate-toolbar-toggle:hover {
            background: rgba(255,255,255,0.12);
        }
        .jellyrate-chips {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            justify-content: center;
        }
        .jellyrate-chip {
            display: inline-flex;
            align-items: center;
            padding: 0.3em 0.8em;
            background: rgba(230, 196, 25, 0.15);
            color: #e6c419;
            border: 1px solid rgba(230, 196, 25, 0.4);
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85em;
            font-family: inherit;
            user-select: none;
            transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .jellyrate-chip:hover {
            background: rgba(230, 196, 25, 0.25);
        }
        .jellyrate-chip.disabled {
            background: rgba(255,255,255,0.08);
            color: rgba(255,255,255,0.7);
            border-color: rgba(255,255,255,0.15);
        }
        .jellyrate-chip.disabled:hover {
            background: rgba(255,255,255,0.12);
        }

        /* By-user section headers */
        .jellyrate-user-section {
            padding: 0.5em 1em;
            margin-top: 0.5em;
            font-size: 1em;
            font-weight: bold;
            color: rgba(255,255,255,0.8);
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        /* "User Rated" button in the library AppBar row. The slot takes the free space
           and the native sibling after it stops growing, so the button sits centered */
        .jellyrate-rated-slot {
            flex: 1 1 0;
            min-width: 0;
            display: flex;
            justify-content: center;
        }
        .jellyrate-rated-slot + * {
            flex-grow: 0 !important;
        }
        .jellyrate-rated-btn {
            padding: 0.4em 1em;
            background: none;
            color: #e6c419;
            border: 1px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
            font-weight: bold;
            font-family: inherit;
            white-space: nowrap;
        }
        .jellyrate-rated-btn:hover {
            opacity: 0.7;
        }
        .jellyrate-rated-btn.active {
            background: rgba(230, 196, 25, 0.15);
            border-color: rgba(230, 196, 25, 0.4);
        }

        /* Rated view: native page content hidden by a marker we own, React nodes untouched */
        html[data-jellyrate-rated] .libraryPage > :not(#jellyrate-ratedView) {
            display: none !important;
        }
        .jellyrate-rated-sections .itemsContainer {
            margin-bottom: 1em;
        }

    `;
    document.head.appendChild(style);
    stylesInjected = true;
}
