// The H19 tooltip layer, carried unchanged in behaviour from just-every/run-happytohelp commit
// 3710a4b4bf06b83246463c76024917e3ade1870f, src/modules/tooltip/tooltip.ts (sha256 eae2c372d0d8d73abea4f817927bba83c68f05c54fa4ef858f4bba711a8e3ea9).
// The only change is syntax: TypeScript types are removed (typescript 5.9 transpileModule, ES2022) because the console's
// browser modules are served as plain JavaScript. README.md beside it is the same commit's README; Uptime's colours and type
// are the custom properties in tooltip.css. The module imports nothing from HappyToHelp or from Uptime.
// The tooltip of icon-only controls: one layer per document (or shadow root), so no control is wrapped, re-rendered or
// remounted to have one. Give each icon-only control the props of tooltip('New ticket'): its accessible name, which is
// also the tooltip's text, and the data-tooltip marker. A control that acts on one row of a list keeps the short name
// and names its row as its accessible description: tooltip('Remove category', { describedBy }) with the id of the element
// that shows the row's name. The tooltip shows ~300 ms after a mouse rests on the control
// (at once while another has just been showing), at once on keyboard focus, and on a touch long press, whose tap is then
// not acted on; a plain tap still acts. It hides when the pointer leaves, on a press, Escape, a scroll that moves the
// control, a resize or a tap elsewhere. It sits clear of the pointer and of the viewport's edges, flipping to the other
// side when there is no room, above dialogs and menus (the browser's top layer), and is hidden from assistive technology,
// which already reads the control's name. Colours and type come from custom properties read on the control itself
// (--tooltip-bg, --tooltip-fg, --tooltip-font-size, --tooltip-padding, --tooltip-radius, --tooltip-shadow), so a control
// on a dark rail can draw a light tooltip. Framework-free; ./TooltipLayer.tsx mounts it in React with ./tooltip.css.
/**
 * The props that give an icon-only control its tooltip: its accessible name and the layer's marker. With `describedBy`
 * the control's row is its accessible description, so a list of "Remove category" buttons is heard as "Remove category,
 * Billing" while each tooltip and name stay the short words. Pass a placement alone as a string.
 */
export function tooltip(label, options) {
    const { placement, describedBy } = typeof options === 'string' ? { placement: options, describedBy: undefined } : options ?? {};
    const props = { 'aria-label': label, 'data-tooltip': '' };
    if (placement)
        props['data-tooltip-placement'] = placement;
    if (describedBy)
        props['aria-describedby'] = describedBy;
    return props;
}
const SHOW_DELAY = 300;
const WARM_WINDOW = 300;
const LONG_PRESS = 500;
const TOUCH_HOLD = 1500;
const TOUCH_SLOP = 10;
const GAP = 8;
const EDGE = 8;
// The arrow pointer hangs below and to the right of its hot spot.
const POINTER_BELOW = 24;
const POINTER_RIGHT = 18;
const STYLE_PROPERTIES = ['--tooltip-bg', '--tooltip-fg', '--tooltip-font-size', '--tooltip-padding', '--tooltip-radius', '--tooltip-shadow'];
const SIDES = {
    top: ['top', 'bottom', 'right', 'left'],
    bottom: ['bottom', 'top', 'right', 'left'],
    left: ['left', 'right', 'top', 'bottom'],
    right: ['right', 'left', 'top', 'bottom'],
};
/**
 * Shows the tooltips of the controls marked by tooltip() in `root` (a document, or a shadow root such as an embedded
 * widget's) until the returned function removes it. The tooltip element goes in `container` (default: the document's
 * body, or the shadow root), whose styles it inherits. Each layer answers only for controls in its own root.
 */
export function installTooltips(root, container) {
    const doc = root.ownerDocument ?? root;
    const view = doc.defaultView;
    if (!view)
        return () => { };
    const tip = doc.createElement('div');
    tip.className = 'ui-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('aria-hidden', 'true');
    // The top layer keeps it above modal <dialog>s and outside any transformed or clipping ancestor.
    tip.setAttribute('popover', 'manual');
    (container ?? (root === doc ? doc.body : root)).appendChild(tip);
    let shown = null;
    let reason = null;
    let pending = null;
    let showTimer = 0, holdTimer = 0, frame = 0;
    let shownAt = 0, hiddenAt = -Infinity;
    let pointer = null;
    let press = null;
    // A long press shows the tooltip instead of acting: the click it ends in goes nowhere.
    let swallow = null;
    // A control the pointer pressed, or whose tooltip Escape dismissed, stays quiet until the pointer leaves it.
    let quiet = null;
    // The event's own target, inside shadow roots too.
    const origin = (event) => event.composedPath()[0] ?? event.target;
    const controlOf = (target) => {
        const element = target instanceof view.Element ? target : target instanceof view.Node ? target.parentElement : null;
        const control = element?.closest('[data-tooltip]');
        return control && control.getRootNode() === root ? control : null;
    };
    const labelOf = (control) => {
        const label = control.getAttribute('aria-label')?.trim();
        if (label)
            return label;
        const ids = control.getAttribute('aria-labelledby')?.split(/\s+/) ?? [];
        return ids.map(id => id && root.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
    };
    const popover = (open) => {
        try {
            if (open) {
                if (tip.matches(':popover-open'))
                    tip.hidePopover();
                tip.showPopover();
            }
            else if (tip.matches(':popover-open'))
                tip.hidePopover();
        }
        catch { /* No Popover API: tooltip.css draws it as a fixed layer at the top of the page. */ }
    };
    const place = () => {
        if (!shown)
            return;
        const rect = shown.getBoundingClientRect();
        const width = tip.offsetWidth, height = tip.offsetHeight;
        const right = doc.documentElement.clientWidth - EDGE, bottom = doc.documentElement.clientHeight - EDGE;
        // Below or right of the control, a tooltip shown on hover also starts past the pointer resting on it.
        const at = reason === 'hover' ? pointer : null;
        const below = Math.max(rect.bottom + GAP, at ? at.y + POINTER_BELOW : 0);
        const beside = Math.max(rect.right + GAP, at ? at.x + POINTER_RIGHT : 0);
        const middle = { x: rect.left + rect.width / 2 - width / 2, y: rect.top + rect.height / 2 - height / 2 };
        const spots = {
            top: { x: middle.x, y: rect.top - GAP - height, fits: rect.top - GAP - height >= EDGE },
            bottom: { x: middle.x, y: below, fits: below + height <= bottom },
            left: { x: rect.left - GAP - width, y: middle.y, fits: rect.left - GAP - width >= EDGE },
            right: { x: beside, y: middle.y, fits: beside + width <= right },
        };
        const asked = shown.dataset.tooltipPlacement;
        const preferred = asked && asked in SIDES ? asked : 'top';
        const side = SIDES[preferred].find(name => spots[name].fits) ?? preferred;
        const spot = spots[side];
        const clamp = (value, max) => Math.min(Math.max(value, EDGE), Math.max(EDGE, max));
        tip.style.left = `${Math.round(clamp(spot.x, right - width))}px`;
        tip.style.top = `${Math.round(clamp(spot.y, bottom - height))}px`;
        tip.dataset.side = side;
    };
    // While a tooltip shows it follows its control and its control's name, and goes when the control does.
    const follow = () => {
        let last = '';
        const step = () => {
            if (!shown)
                return;
            const rect = shown.getBoundingClientRect();
            const label = labelOf(shown);
            if (!shown.isConnected || !label || (!rect.width && !rect.height)) {
                hide();
                return;
            }
            if (label !== tip.textContent) {
                tip.textContent = label;
                last = '';
            }
            const at = `${rect.left},${rect.top},${rect.width},${rect.height}`;
            if (at !== last) {
                last = at;
                place();
            }
            frame = view.requestAnimationFrame(step);
        };
        view.cancelAnimationFrame(frame);
        frame = view.requestAnimationFrame(step);
    };
    const show = (control, why) => {
        view.clearTimeout(showTimer);
        view.clearTimeout(holdTimer);
        pending = null;
        const label = labelOf(control);
        if (!control.isConnected || !label)
            return;
        const style = view.getComputedStyle(control);
        for (const name of STYLE_PROPERTIES) {
            const value = style.getPropertyValue(name).trim();
            if (value)
                tip.style.setProperty(name, value);
            else
                tip.style.removeProperty(name);
        }
        tip.textContent = label;
        shown = control;
        reason = why;
        shownAt = view.performance.now();
        tip.dataset.open = '';
        popover(true);
        place();
        follow();
    };
    const hide = () => {
        view.clearTimeout(showTimer);
        view.clearTimeout(holdTimer);
        view.cancelAnimationFrame(frame);
        pending = null;
        if (!shown)
            return;
        shown = null;
        reason = null;
        hiddenAt = view.performance.now();
        delete tip.dataset.open;
        popover(false);
    };
    const schedule = (control) => {
        view.clearTimeout(showTimer);
        if (shown || view.performance.now() - hiddenAt < WARM_WINDOW) {
            show(control, 'hover');
            return;
        }
        pending = control;
        showTimer = view.setTimeout(() => { if (pending === control)
            show(control, 'hover'); }, SHOW_DELAY);
    };
    const endPress = () => { if (press)
        view.clearTimeout(press.timer); press = null; };
    // Entering a control, or moving on one (after a scroll moved it under a resting pointer), starts its delay.
    const onPointerOver = (event) => {
        if (event.pointerType === 'touch')
            return;
        pointer = { x: event.clientX, y: event.clientY };
        const control = controlOf(origin(event));
        if (control && control !== shown && control !== pending && control !== quiet)
            schedule(control);
    };
    const onPointerOut = (event) => {
        if (event.pointerType === 'touch')
            return;
        const control = controlOf(origin(event));
        if (!control || controlOf(event.relatedTarget) === control)
            return;
        if (quiet === control)
            quiet = null;
        if (pending === control) {
            view.clearTimeout(showTimer);
            pending = null;
        }
        if (shown === control && reason === 'hover')
            hide();
    };
    const onPointerMove = (event) => {
        if (event.pointerType !== 'touch') {
            onPointerOver(event);
            return;
        }
        if (press && press.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > TOUCH_SLOP)
            endPress();
    };
    const onPointerDown = (event) => {
        swallow = null;
        if (event.pointerType !== 'touch') {
            // A press acts: the tooltip gets out of the way and returns only after the pointer leaves and rests again.
            quiet = controlOf(origin(event));
            hide();
            return;
        }
        if (shown)
            hide();
        endPress();
        const control = controlOf(origin(event));
        if (!control)
            return;
        const id = event.pointerId, x = event.clientX, y = event.clientY;
        press = { control, id, x, y, timer: view.setTimeout(() => { press = null; swallow = control; show(control, 'touch'); }, LONG_PRESS) };
    };
    const onPointerUp = (event) => {
        if (event.pointerType !== 'touch')
            return;
        endPress();
        if (shown && reason === 'touch') {
            view.clearTimeout(holdTimer);
            holdTimer = view.setTimeout(hide, TOUCH_HOLD);
        }
    };
    const onClick = (event) => {
        if (!swallow)
            return;
        const control = swallow, target = origin(event);
        swallow = null;
        if (target instanceof view.Node && control.contains(target)) {
            event.preventDefault();
            event.stopPropagation();
        }
    };
    const onContextMenu = (event) => {
        // A long press on a touch screen opens the browser's menu; on a control it shows the tooltip instead.
        if ((press || (shown && reason === 'touch')) && controlOf(origin(event)))
            event.preventDefault();
    };
    const onFocusIn = (event) => {
        const target = origin(event);
        const control = controlOf(target);
        if (!control || !(target instanceof view.Element))
            return;
        let visible = false;
        try {
            visible = target.matches(':focus-visible');
        }
        catch {
            visible = false;
        }
        if (visible)
            show(control, 'focus');
    };
    const onFocusOut = (event) => {
        if (shown && reason === 'focus' && controlOf(origin(event)) === shown && controlOf(event.relatedTarget) !== shown)
            hide();
    };
    // Escape dismisses a hover tooltip until the pointer leaves its control; a focus one stays away until focus moves.
    const onKeyDown = (event) => { if (event.key === 'Escape') {
        quiet = (reason === 'hover' ? shown : pending) ?? quiet;
        hide();
    } };
    const onScroll = (event) => {
        const control = shown ?? pending;
        if (!control)
            return;
        const target = event.target;
        const moves = target === doc || target === doc.documentElement || (target instanceof view.Node && target.contains(control));
        if (!moves)
            return;
        // Focus scrolls a control into view just after it shows its tooltip: follow that one instead of hiding.
        if (shown && reason === 'focus' && view.performance.now() - shownAt < 250) {
            place();
            return;
        }
        // Once the scroll stops, the control under a resting pointer waits out the whole delay.
        hide();
        hiddenAt = -Infinity;
    };
    const onResize = () => hide();
    // Pointer, focus and scroll events are read where they happen (the root); presses, keys and resizes on the window.
    // On a document root its two scroll listeners are one registration.
    const listeners = [
        [root, 'pointerover', onPointerOver, { passive: true }],
        [root, 'pointerout', onPointerOut, { passive: true }],
        [root, 'pointermove', onPointerMove, { passive: true }],
        [root, 'focusin', onFocusIn, {}],
        [root, 'focusout', onFocusOut, {}],
        [root, 'scroll', onScroll, { capture: true, passive: true }],
        [doc, 'scroll', onScroll, { capture: true, passive: true }],
        [view, 'pointerdown', onPointerDown, { capture: true, passive: true }],
        [view, 'pointerup', onPointerUp, { capture: true, passive: true }],
        [view, 'pointercancel', endPress, { capture: true, passive: true }],
        [view, 'click', onClick, { capture: true }],
        [view, 'contextmenu', onContextMenu, { capture: true }],
        [view, 'keydown', onKeyDown, { capture: true }],
        [view, 'resize', onResize, { passive: true }],
    ];
    for (const [target, type, listener, options] of listeners)
        target.addEventListener(type, listener, options);
    return () => {
        hide();
        endPress();
        for (const [target, type, listener, options] of listeners)
            target.removeEventListener(type, listener, options);
        tip.remove();
    };
}
